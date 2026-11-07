import Foundation
import AVFoundation
import ScreenCaptureKit
import Speech
import CoreAudio
import CoreMedia

// MARK: - JSON Output Helper

let stdoutLock = NSLock()

func emitJSON(_ dict: [String: Any]) {
    stdoutLock.lock()
    defer { stdoutLock.unlock() }
    if let data = try? JSONSerialization.data(withJSONObject: dict, options: []),
       let line = String(data: data, encoding: .utf8) {
        FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
    }
}

// MARK: - Channel Gate (live mute per channel)

final class ChannelGate {
    static let shared = ChannelGate()
    private let lock = NSLock()
    private var muted: Set<String> = []

    func setMuted(_ speaker: String, _ value: Bool) {
        lock.lock()
        if value { muted.insert(speaker) } else { muted.remove(speaker) }
        lock.unlock()
        emitJSON(["type": "status", "component": "channel", "speaker": speaker, "status": value ? "muted" : "live"])
    }

    func isMuted(_ speaker: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return muted.contains(speaker)
    }
}

// Muted channels are replaced with silence so WAV timelines stay aligned but nothing is recorded or transcribed.
func gateSamples(_ samples: [Float], speaker: String) -> [Float] {
    ChannelGate.shared.isMuted(speaker) ? [Float](repeating: 0, count: samples.count) : samples
}

// MARK: - Continuous WAV File Writer (16kHz, 16-bit PCM, Mono)

final class ContinuousWavWriter {
    private let filePath: String
    private var fileHandle: FileHandle?
    private var dataByteCount: UInt32 = 0
    private let sampleRate: UInt32 = 16000
    private let channels: UInt16 = 1
    private let bitsPerSample: UInt16 = 16
    private var lastHeaderFlush = Date()
    private let lock = NSLock()

    init?(path: String) {
        self.filePath = path
        let fm = FileManager.default
        if fm.fileExists(atPath: path),
           let attrs = try? fm.attributesOfItem(atPath: path),
           let fileSize = attrs[.size] as? UInt64,
           fileSize >= 44,
           let fh = FileHandle(forUpdatingAtPath: path) {
            // Pause -> Continue appends to the existing WAV instead of truncating it
            self.fileHandle = fh
            self.dataByteCount = UInt32(clamping: fileSize - 44)
            writeHeader()
        } else {
            fm.createFile(atPath: path, contents: nil, attributes: nil)
            guard let fh = FileHandle(forUpdatingAtPath: path) else { return nil }
            self.fileHandle = fh
            writeHeader()
        }
    }

    private func makeHeader(dataSize: UInt32) -> Data {
        var header = Data(capacity: 44)
        let riffSize = UInt32(36) &+ dataSize
        let byteRate = sampleRate * UInt32(channels) * UInt32(bitsPerSample / 8)
        let blockAlign = channels * (bitsPerSample / 8)

        header.append("RIFF".data(using: .ascii)!)
        var leRiffSize = riffSize.littleEndian
        header.append(Data(bytes: &leRiffSize, count: 4))
        header.append("WAVE".data(using: .ascii)!)

        header.append("fmt ".data(using: .ascii)!)
        var subchunk1Size = UInt32(16).littleEndian
        header.append(Data(bytes: &subchunk1Size, count: 4))
        var audioFormat = UInt16(1).littleEndian // PCM
        header.append(Data(bytes: &audioFormat, count: 2))
        var leChannels = channels.littleEndian
        header.append(Data(bytes: &leChannels, count: 2))
        var leSampleRate = sampleRate.littleEndian
        header.append(Data(bytes: &leSampleRate, count: 4))
        var leByteRate = byteRate.littleEndian
        header.append(Data(bytes: &leByteRate, count: 4))
        var leBlockAlign = blockAlign.littleEndian
        header.append(Data(bytes: &leBlockAlign, count: 2))
        var leBitsPerSample = bitsPerSample.littleEndian
        header.append(Data(bytes: &leBitsPerSample, count: 2))

        header.append("data".data(using: .ascii)!)
        var leDataSize = dataSize.littleEndian
        header.append(Data(bytes: &leDataSize, count: 4))
        return header
    }

    private func writeHeader() {
        guard let fh = fileHandle else { return }
        do {
            try fh.seek(toOffset: 0)
            fh.write(makeHeader(dataSize: dataByteCount))
            try fh.seekToEnd()
        } catch {}
    }

    func appendSamples(_ samples: [Float]) {
        lock.lock()
        defer { lock.unlock() }
        guard let fh = fileHandle, !samples.isEmpty else { return }

        var pcmData = Data(capacity: samples.count * 2)
        for sample in samples {
            let clamped = max(-1.0, min(1.0, sample))
            var int16Val = Int16(clamped * 32767.0).littleEndian
            pcmData.append(Data(bytes: &int16Val, count: 2))
        }
        fh.write(pcmData)
        dataByteCount &+= UInt32(pcmData.count)

        let now = Date()
        if now.timeIntervalSince(lastHeaderFlush) > 2.0 {
            lastHeaderFlush = now
            writeHeader()
        }
    }

    func close() {
        lock.lock()
        defer { lock.unlock() }
        writeHeader()
        try? fileHandle?.close()
        fileHandle = nil
    }
}

// MARK: - VAD Speech Segmenter for cloud STT

final class SpeechChunkSegmenter {
    private let speaker: String
    private let chunksDir: String
    private let sampleRate: Int = 16000
    private var buffer: [Float] = []
    private var preRollBuffer: [Float] = []
    private let maxPreRollSamples = 16000 / 2 // 0.5s pre-roll
    private var isSpeaking = false
    private var silenceSamples = 0
    private var speechSamples = 0
    private var chunkCounter = 0

    // Thresholds tuned for conversational speech
    private let rmsStartThreshold: Float = 0.012
    private let rmsContinueThreshold: Float = 0.008
    private let silenceHoldSamples = 16000 * 7 / 10 // 0.7s silence ends utterance
    private let maxChunkSamples = 16000 * 9         // max 9s before forced flush
    private let minSpeechSamples = 16000 * 3 / 10   // min 0.3s speech

    init(speaker: String, chunksDir: String) {
        self.speaker = speaker
        self.chunksDir = chunksDir
    }

    func process(samples: [Float], rms: Float) {
        guard !samples.isEmpty else { return }

        if !isSpeaking {
            preRollBuffer.append(contentsOf: samples)
            if preRollBuffer.count > maxPreRollSamples {
                preRollBuffer.removeFirst(preRollBuffer.count - maxPreRollSamples)
            }
            if rms >= rmsStartThreshold {
                isSpeaking = true
                silenceSamples = 0
                speechSamples = samples.count
                buffer = preRollBuffer
                preRollBuffer.removeAll(keepingCapacity: true)
            }
        } else {
            buffer.append(contentsOf: samples)
            if rms >= rmsContinueThreshold {
                silenceSamples = 0
                speechSamples += samples.count
            } else {
                silenceSamples += samples.count
            }

            if silenceSamples >= silenceHoldSamples || buffer.count >= maxChunkSamples {
                flushIfValid()
            }
        }
    }

    func flushRemaining() {
        if isSpeaking {
            flushIfValid()
        }
    }

    private func flushIfValid() {
        defer {
            buffer.removeAll(keepingCapacity: true)
            isSpeaking = false
            silenceSamples = 0
            speechSamples = 0
        }
        guard speechSamples >= minSpeechSamples, buffer.count >= minSpeechSamples else { return }

        chunkCounter += 1
        let ts = Int(Date().timeIntervalSince1970 * 1000)
        let filename = "chunk_\(speaker)_\(ts)_\(chunkCounter).wav"
        let path = (chunksDir as NSString).appendingPathComponent(filename)

        if let writer = ContinuousWavWriter(path: path) {
            writer.appendSamples(buffer)
            writer.close()
            let duration = Double(buffer.count) / Double(sampleRate)
            emitJSON([
                "type": "audio_chunk",
                "speaker": speaker,
                "path": path,
                "duration": duration,
                "avgRms": computeRMS(buffer),
                "timestamp": ts
            ])
        }
    }
}

// MARK: - Single Active-Speaker Live Apple Speech Recognizer
// Mic ("me") and system ("other") share one SFSpeechRecognitionTask, because speechrecognitiond
// cancels concurrent tasks from the same process.

final class LiveSpeechMultiplexer {
    private let recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let audioFormat: AVAudioFormat
    private var sessionStartTime = Date()
    private var lastEmittedText = ""
    private var currentSegmentId = UUID().uuidString
    private var activeSpeaker: String = "other"
    private var lastSysActiveTime = Date.distantPast
    private var lastMicActiveTime = Date.distantPast
    private var latestMicRms: Float = 0
    private var latestSysRms: Float = 0
    private var rmsSum: Float = 0
    private var rmsCount: Int = 0
    private var debounceWorkItem: DispatchWorkItem?
    private var isActive = false
    private var interviewMode: Bool
    private let queue = DispatchQueue(label: "io.github.palolz.portalscript.speech.mux")

    var supportsOnDevice: Bool { recognizer?.supportsOnDeviceRecognition ?? false }

    private var currentAvgRms: Float {
        rmsCount > 0 ? (rmsSum / Float(rmsCount)) : 0
    }

    init(locale: String = "en-US", interviewMode: Bool = false) {
        self.interviewMode = interviewMode
        self.recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)) ?? SFSpeechRecognizer()
        self.audioFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false)!
    }

    func start() {
        queue.async {
            self.isActive = true
            self.startNewTask()
        }
    }

    func setInterviewMode(_ enabled: Bool) {
        queue.async { self.interviewMode = enabled }
    }

    func stop() {
        queue.sync {
            self.isActive = false
            self.debounceWorkItem?.cancel()
            self.debounceWorkItem = nil
            if !self.lastEmittedText.isEmpty {
                emitJSON([
                    "type": "transcript",
                    "speaker": self.activeSpeaker,
                    "segmentId": self.currentSegmentId,
                    "text": self.lastEmittedText,
                    "isFinal": true,
                    "avgRms": self.currentAvgRms,
                    "source": "apple",
                    "timestamp": Int(Date().timeIntervalSince1970 * 1000)
                ])
                self.lastEmittedText = ""
            }
            self.request?.endAudio()
            self.task?.cancel()
            self.request = nil
            self.task = nil
        }
    }

    private func commitCurrentAndRotate(nextSpeaker: String? = nil) {
        debounceWorkItem?.cancel()
        debounceWorkItem = nil
        let textToCommit = lastEmittedText.trimmingCharacters(in: .whitespacesAndNewlines)
        let segId = currentSegmentId
        let segSpeaker = activeSpeaker
        let segRms = currentAvgRms
        lastEmittedText = ""
        rmsSum = 0
        rmsCount = 0
        if let next = nextSpeaker {
            activeSpeaker = next
        }
        currentSegmentId = UUID().uuidString
        if !textToCommit.isEmpty {
            emitJSON([
                "type": "transcript",
                "speaker": segSpeaker,
                "segmentId": segId,
                "text": textToCommit,
                "isFinal": true,
                "avgRms": segRms,
                "source": "apple",
                "timestamp": Int(Date().timeIntervalSince1970 * 1000)
            ])
        }
        startNewTask()
    }

    private func scheduleUtteranceFinalize(for text: String) {
        debounceWorkItem?.cancel()
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let pauseSeconds: Double = interviewMode
            ? (trimmed.hasSuffix("?") ? 0.8 : 1.1)
            : (trimmed.hasSuffix("?") ? 1.6 : 2.2)
        let item = DispatchWorkItem { [weak self] in
            guard let self = self, self.isActive, !self.lastEmittedText.isEmpty else { return }
            self.commitCurrentAndRotate()
        }
        debounceWorkItem = item
        queue.asyncAfter(deadline: .now() + pauseSeconds, execute: item)
    }

    private func startNewTask() {
        guard isActive, let recognizer = recognizer, recognizer.isAvailable,
              recognizer.supportsOnDeviceRecognition else { return }

        request?.endAudio()
        task?.cancel()

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        // Keep audio on this Mac. Without on-device support Apple Speech would upload it, so it stays off.
        req.requiresOnDeviceRecognition = true
        if #available(macOS 13.0, *) {
            req.addsPunctuation = true
        }
        self.request = req
        self.sessionStartTime = Date()
        self.lastEmittedText = ""
        self.rmsSum = 0
        self.rmsCount = 0
        self.currentSegmentId = UUID().uuidString

        let activeSegmentId = self.currentSegmentId
        self.task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            guard let self = self else { return }
            self.queue.async {
                guard self.isActive, self.currentSegmentId == activeSegmentId else { return }

                if let result = result {
                    let text = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !text.isEmpty && text != self.lastEmittedText {
                        self.lastEmittedText = text
                        emitJSON([
                            "type": "transcript",
                            "speaker": self.activeSpeaker,
                            "segmentId": self.currentSegmentId,
                            "text": text,
                            "isFinal": result.isFinal,
                            "avgRms": self.currentAvgRms,
                            "source": "apple",
                            "timestamp": Int(Date().timeIntervalSince1970 * 1000)
                        ])
                        if !result.isFinal {
                            self.scheduleUtteranceFinalize(for: text)
                        }
                    }
                    if result.isFinal {
                        self.debounceWorkItem?.cancel()
                        self.lastEmittedText = ""
                        self.rmsSum = 0
                        self.rmsCount = 0
                        self.currentSegmentId = UUID().uuidString
                        self.startNewTask()
                        return
                    }
                }

                if error != nil {
                    if !self.lastEmittedText.isEmpty {
                        self.commitCurrentAndRotate()
                    } else {
                        DispatchQueue.global().asyncAfter(deadline: .now() + 0.35) {
                            self.queue.async {
                                if self.isActive && self.currentSegmentId == activeSegmentId {
                                    self.startNewTask()
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    func appendSamples(speaker: String, samples: [Float], rms: Float) {
        guard !samples.isEmpty else { return }
        queue.async {
            guard self.isActive else { return }
            let now = Date()
            if speaker == "me" {
                self.latestMicRms = rms
                if rms >= 0.014 { self.lastMicActiveTime = now }
            } else {
                self.latestSysRms = rms
                if rms >= 0.008 { self.lastSysActiveTime = now }
            }

            // Hold active speaker across syllable gaps (0.85s) so speaker bleed doesn't cut sentences
            if speaker != self.activeSpeaker {
                if speaker == "other" && rms >= 0.008 && now.timeIntervalSince(self.lastMicActiveTime) > 0.6 {
                    self.commitCurrentAndRotate(nextSpeaker: "other")
                } else if speaker == "me" && rms >= 0.015 && now.timeIntervalSince(self.lastSysActiveTime) > 0.85 {
                    self.commitCurrentAndRotate(nextSpeaker: "me")
                }
            }

            guard speaker == self.activeSpeaker else { return }

            if rms > 0.008 {
                self.rmsSum += rms
                self.rmsCount += 1
            }

            if now.timeIntervalSince(self.sessionStartTime) > 45.0 {
                self.commitCurrentAndRotate()
            }

            guard let pcmBuffer = AVAudioPCMBuffer(pcmFormat: self.audioFormat, frameCapacity: AVAudioFrameCount(samples.count)) else { return }
            pcmBuffer.frameLength = AVAudioFrameCount(samples.count)
            if let channelData = pcmBuffer.floatChannelData?[0] {
                samples.withUnsafeBufferPointer { ptr in
                    channelData.update(from: ptr.baseAddress!, count: samples.count)
                }
            }
            self.request?.append(pcmBuffer)
        }
    }
}

// MARK: - Sample Extraction Utility (16kHz Mono Float32)

func extractMono16kSamples(from sampleBuffer: CMSampleBuffer) -> [Float] {
    guard let formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer),
          let asbdPtr = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc) else {
        return []
    }
    let asbd = asbdPtr.pointee
    let numSamples = CMSampleBufferGetNumSamples(sampleBuffer)
    guard numSamples > 0, let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return [] }

    let totalBytes = CMBlockBufferGetDataLength(blockBuffer)
    let channels = max(1, Int(asbd.mChannelsPerFrame))
    let isFloat = (asbd.mFormatFlags & kAudioFormatFlagIsFloat) != 0
    let isNonInterleaved = (asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0

    var monoSamples = [Float](repeating: 0, count: numSamples)

    if isFloat {
        let totalFloats = totalBytes / MemoryLayout<Float>.size
        guard totalFloats > 0 else { return [] }
        var rawFloats = [Float](repeating: 0, count: totalFloats)
        let status = rawFloats.withUnsafeMutableBytes { rawBuf in
            CMBlockBufferCopyDataBytes(blockBuffer, atOffset: 0, dataLength: totalFloats * MemoryLayout<Float>.size, destination: rawBuf.baseAddress!)
        }
        guard status == kCMBlockBufferNoErr else { return [] }

        if channels == 1 {
            let count = min(numSamples, totalFloats)
            if count == numSamples {
                monoSamples = rawFloats
            } else {
                for i in 0..<count { monoSamples[i] = rawFloats[i] }
            }
        } else if isNonInterleaved {
            let framesPerChannel = totalFloats / channels
            let frames = min(numSamples, framesPerChannel)
            for c in 0..<channels {
                let offset = c * framesPerChannel
                for i in 0..<frames {
                    monoSamples[i] += rawFloats[offset + i] / Float(channels)
                }
            }
        } else {
            let frames = min(numSamples, totalFloats / channels)
            for i in 0..<frames {
                var sum: Float = 0
                for c in 0..<channels {
                    sum += rawFloats[i * channels + c]
                }
                monoSamples[i] = sum / Float(channels)
            }
        }
    } else {
        let totalInts = totalBytes / MemoryLayout<Int16>.size
        guard totalInts > 0 else { return [] }
        var rawInts = [Int16](repeating: 0, count: totalInts)
        let status = rawInts.withUnsafeMutableBytes { rawBuf in
            CMBlockBufferCopyDataBytes(blockBuffer, atOffset: 0, dataLength: totalInts * MemoryLayout<Int16>.size, destination: rawBuf.baseAddress!)
        }
        guard status == kCMBlockBufferNoErr else { return [] }
        let frames = min(numSamples, totalInts / channels)
        for i in 0..<frames {
            var sum: Float = 0
            for c in 0..<channels {
                sum += Float(rawInts[i * channels + c]) / 32768.0
            }
            monoSamples[i] = sum / Float(channels)
        }
    }

    let inRate = asbd.mSampleRate > 0 ? asbd.mSampleRate : 16000.0
    if abs(inRate - 16000.0) < 1.0 {
        return monoSamples
    }

    let ratio = inRate / 16000.0
    let outCount = Int(Double(monoSamples.count) / ratio)
    guard outCount > 0 else { return [] }
    var resampled = [Float](repeating: 0, count: outCount)
    for i in 0..<outCount {
        let srcPos = Double(i) * ratio
        let idx = Int(srcPos)
        let frac = Float(srcPos - Double(idx))
        if idx + 1 < monoSamples.count {
            resampled[i] = monoSamples[idx] * (1.0 - frac) + monoSamples[idx + 1] * frac
        } else if idx < monoSamples.count {
            resampled[i] = monoSamples[idx]
        }
    }
    return resampled
}

func computeRMS(_ samples: [Float]) -> Float {
    guard !samples.isEmpty else { return 0 }
    var sumSquares: Float = 0
    for s in samples {
        sumSquares += s * s
    }
    return sqrt(sumSquares / Float(samples.count))
}

// MARK: - Microphone Capture ("me") via AVCaptureSession

final class MicrophoneCollector: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate {
    private let session = AVCaptureSession()
    private let outputQueue = DispatchQueue(label: "io.github.palolz.portalscript.mic")
    private let wavWriter: ContinuousWavWriter?
    private let chunkSegmenter: SpeechChunkSegmenter
    private let liveSpeech: LiveSpeechMultiplexer?
    private var lastLevelEmit = Date.distantPast

    init(deviceId: String?, wavWriter: ContinuousWavWriter?, chunkSegmenter: SpeechChunkSegmenter, liveSpeech: LiveSpeechMultiplexer?) {
        self.wavWriter = wavWriter
        self.chunkSegmenter = chunkSegmenter
        self.liveSpeech = liveSpeech
        super.init()
        setupSession(deviceId: deviceId)
    }

    private func setupSession(deviceId: String?) {
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.microphone, .external],
            mediaType: .audio,
            position: .unspecified
        )
        var targetDevice: AVCaptureDevice?
        if let deviceId = deviceId, !deviceId.isEmpty, deviceId != "default" {
            targetDevice = discovery.devices.first(where: { $0.uniqueID == deviceId })
        }
        if targetDevice == nil {
            targetDevice = AVCaptureDevice.default(for: .audio) ?? discovery.devices.first
        }

        guard let device = targetDevice else {
            emitJSON(["type": "warning", "message": "No microphone device found."])
            return
        }

        do {
            let input = try AVCaptureDeviceInput(device: device)
            session.beginConfiguration()
            if session.canAddInput(input) {
                session.addInput(input)
            }
            let output = AVCaptureAudioDataOutput()
            output.audioSettings = [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: 16000.0,
                AVNumberOfChannelsKey: 1,
                AVLinearPCMBitDepthKey: 32,
                AVLinearPCMIsFloatKey: true,
                AVLinearPCMIsBigEndianKey: false,
                AVLinearPCMIsNonInterleaved: false
            ]
            output.setSampleBufferDelegate(self, queue: outputQueue)
            if session.canAddOutput(output) {
                session.addOutput(output)
            }
            session.commitConfiguration()
            emitJSON([
                "type": "status",
                "component": "mic",
                "status": "ready",
                "deviceName": device.localizedName,
                "deviceId": device.uniqueID
            ])
        } catch {
            emitJSON(["type": "error", "component": "mic", "message": "Failed to open microphone: \(error.localizedDescription)"])
        }
    }

    func start() {
        outputQueue.async {
            if !self.session.isRunning {
                self.session.startRunning()
            }
        }
    }

    func stop() {
        outputQueue.sync {
            if self.session.isRunning {
                self.session.stopRunning()
            }
            self.chunkSegmenter.flushRemaining()
            self.wavWriter?.close()
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        let raw = extractMono16kSamples(from: sampleBuffer)
        guard !raw.isEmpty else { return }
        let samples = gateSamples(raw, speaker: "me")

        let rms = computeRMS(samples)
        wavWriter?.appendSamples(samples)
        chunkSegmenter.process(samples: samples, rms: rms)
        liveSpeech?.appendSamples(speaker: "me", samples: samples, rms: rms)

        let now = Date()
        if now.timeIntervalSince(lastLevelEmit) >= 0.12 {
            lastLevelEmit = now
            emitJSON(["type": "level", "speaker": "me", "rms": rms])
        }
    }
}

// MARK: - System Audio Capture ("other") via ScreenCaptureKit

final class SystemAudioCollector: NSObject, SCStreamOutput, SCStreamDelegate {
    private var stream: SCStream?
    private let audioQueue = DispatchQueue(label: "io.github.palolz.portalscript.sysaudio")
    private let wavWriter: ContinuousWavWriter?
    private let chunkSegmenter: SpeechChunkSegmenter
    private let liveSpeech: LiveSpeechMultiplexer?
    private var lastLevelEmit = Date.distantPast
    private var appBundleIds: [String]

    init(wavWriter: ContinuousWavWriter?, chunkSegmenter: SpeechChunkSegmenter, liveSpeech: LiveSpeechMultiplexer?, appBundleIds: [String] = []) {
        self.wavWriter = wavWriter
        self.chunkSegmenter = chunkSegmenter
        self.liveSpeech = liveSpeech
        self.appBundleIds = appBundleIds
        super.init()
    }

    // Empty bundle list = whole system output. Otherwise only audio produced by those apps is captured.
    private func makeFilter() async throws -> SCContentFilter {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        guard let display = content.displays.first else {
            throw NSError(domain: "PortalScript", code: 1, userInfo: [NSLocalizedDescriptionKey: "No display found for ScreenCaptureKit system audio."])
        }
        if appBundleIds.isEmpty {
            emitJSON(["type": "status", "component": "system_audio_source", "status": "all"])
            return SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        }
        let apps = content.applications.filter { appBundleIds.contains($0.bundleIdentifier) }
        if apps.isEmpty {
            emitJSON(["type": "warning", "component": "system_audio_source", "message": "Selected app isn't running — listening to all system audio until it opens."])
            emitJSON(["type": "status", "component": "system_audio_source", "status": "all"])
            return SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        }
        emitJSON(["type": "status", "component": "system_audio_source", "status": "app", "apps": apps.map { $0.applicationName }])
        return SCContentFilter(display: display, including: apps, exceptingWindows: [])
    }

    func setApps(_ bundleIds: [String]) async {
        appBundleIds = bundleIds
        guard let scStream = stream else { return }
        do {
            try await scStream.updateContentFilter(try await makeFilter())
        } catch {
            emitJSON(["type": "warning", "component": "system_audio_source", "message": "Couldn't switch audio source: \(error.localizedDescription)"])
        }
    }

    func start() async {
        do {
            let filter = try await makeFilter()
            let config = SCStreamConfiguration()
            config.capturesAudio = true
            config.excludesCurrentProcessAudio = true
            config.sampleRate = 16000
            config.channelCount = 1
            // Minimize video overhead since we only want system audio
            config.width = 2
            config.height = 2
            config.minimumFrameInterval = CMTime(value: 1, timescale: 1)

            let scStream = SCStream(filter: filter, configuration: config, delegate: self)
            try scStream.addStreamOutput(self, type: .screen, sampleHandlerQueue: audioQueue)
            try scStream.addStreamOutput(self, type: .audio, sampleHandlerQueue: audioQueue)
            try await scStream.startCapture()
            self.stream = scStream
            emitJSON(["type": "status", "component": "system_audio", "status": "ready"])
        } catch {
            emitJSON([
                "type": "error",
                "component": "system_audio",
                "message": "System audio capture requires Screen & System Audio Recording permission in System Settings > Privacy & Security. Details: \(error.localizedDescription)"
            ])
        }
    }

    func stop() async {
        if let scStream = stream {
            try? await scStream.stopCapture()
            stream = nil
        }
        audioQueue.sync {
            self.chunkSegmenter.flushRemaining()
            self.wavWriter?.close()
        }
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
        guard outputType == .audio else { return }
        let raw = extractMono16kSamples(from: sampleBuffer)
        guard !raw.isEmpty else { return }
        let samples = gateSamples(raw, speaker: "other")

        let rms = computeRMS(samples)
        wavWriter?.appendSamples(samples)
        chunkSegmenter.process(samples: samples, rms: rms)
        liveSpeech?.appendSamples(speaker: "other", samples: samples, rms: rms)

        let now = Date()
        if now.timeIntervalSince(lastLevelEmit) >= 0.12 {
            lastLevelEmit = now
            emitJSON(["type": "level", "speaker": "other", "rms": rms])
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        emitJSON(["type": "warning", "component": "system_audio", "message": "System audio stream stopped: \(error.localizedDescription)"])
    }
}

// MARK: - Device Listing

func listAudioDevices() {
    let discovery = AVCaptureDevice.DiscoverySession(
        deviceTypes: [.microphone, .external],
        mediaType: .audio,
        position: .unspecified
    )
    let defaultId = AVCaptureDevice.default(for: .audio)?.uniqueID ?? ""
    let devices: [[String: Any]] = discovery.devices.map { dev in
        [
            "id": dev.uniqueID,
            "name": dev.localizedName,
            "isDefault": dev.uniqueID == defaultId
        ]
    }
    emitJSON(["type": "devices", "devices": devices])
}

func listAudioApps() async {
    do {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        let ownPids: Set<pid_t> = [ProcessInfo.processInfo.processIdentifier, getppid()]
        let systemNoise: Set<String> = ["com.apple.loginwindow", "com.apple.Spotlight", "com.apple.dock", "com.apple.controlcenter", "com.apple.systemuiserver", "com.apple.WindowManager", "com.apple.notificationcenterui", "com.apple.finder"]
        let noiseMarkers = [".helper", ".xpc.", "extension", "agent", "viewservice", "autofill"]
        var withWindows = Set<pid_t>()
        for w in content.windows where w.windowLayer == 0 {
            if let pid = w.owningApplication?.processID { withWindows.insert(pid) }
        }
        var seen = Set<String>()
        var apps: [[String: Any]] = []
        for app in content.applications {
            let bid = app.bundleIdentifier
            let name = app.applicationName
            if bid.isEmpty || name.isEmpty || ownPids.contains(app.processID) || seen.contains(bid) { continue }
            let lower = bid.lowercased()
            if systemNoise.contains(bid) || noiseMarkers.contains(where: { lower.contains($0) }) { continue }
            if !withWindows.contains(app.processID) { continue }
            seen.insert(bid)
            apps.append(["bundleId": bid, "name": name])
        }
        apps.sort { ($0["name"] as! String).localizedCaseInsensitiveCompare($1["name"] as! String) == .orderedAscending }
        emitJSON(["type": "apps", "apps": apps])
    } catch {
        emitJSON(["type": "error", "component": "system_audio", "message": "Can't list apps — needs Screen & System Audio Recording permission. \(error.localizedDescription)"])
    }
}

// MARK: - Main Entrypoint

let args = CommandLine.arguments

if args.contains("--list-devices") {
    listAudioDevices()
    exit(0)
}

if args.contains("--list-apps") {
    Task {
        await listAudioApps()
        exit(0)
    }
    RunLoop.main.run()
}

var sessionDir = NSTemporaryDirectory()
var micDeviceId: String? = nil
var enableAppleSTT = true
var interviewMode = args.contains("--interview-mode")
var locale = "en-US"
var sysAppBundleIds: [String] = []

var i = 1
while i < args.count {
    switch args[i] {
    case "--session-dir":
        if i + 1 < args.count { sessionDir = args[i + 1]; i += 1 }
    case "--mic-device":
        if i + 1 < args.count { micDeviceId = args[i + 1]; i += 1 }
    case "--no-apple-stt":
        enableAppleSTT = false
    case "--locale":
        if i + 1 < args.count { locale = args[i + 1]; i += 1 }
    case "--sys-app":
        if i + 1 < args.count { sysAppBundleIds.append(args[i + 1]); i += 1 }
    case "--mute-mic":
        ChannelGate.shared.setMuted("me", true)
    case "--mute-sys":
        ChannelGate.shared.setMuted("other", true)
    default:
        break
    }
    i += 1
}

// Recordings and chunks are readable by this user only.
umask(0o077)

let chunksDir = (sessionDir as NSString).appendingPathComponent("chunks")
try? FileManager.default.createDirectory(atPath: chunksDir, withIntermediateDirectories: true)

let micWavPath = (sessionDir as NSString).appendingPathComponent("mic_me.wav")
let sysWavPath = (sessionDir as NSString).appendingPathComponent("system_other.wav")

let micWavWriter = ContinuousWavWriter(path: micWavPath)
let sysWavWriter = ContinuousWavWriter(path: sysWavPath)

let micSegmenter = SpeechChunkSegmenter(speaker: "me", chunksDir: chunksDir)
let sysSegmenter = SpeechChunkSegmenter(speaker: "other", chunksDir: chunksDir)

var liveSpeechMux: LiveSpeechMultiplexer? = nil

if enableAppleSTT {
    let mux = LiveSpeechMultiplexer(locale: locale, interviewMode: interviewMode)
    liveSpeechMux = mux
    SFSpeechRecognizer.requestAuthorization { status in
        switch status {
        case .authorized:
            emitJSON(["type": "status", "component": "apple_stt", "status": "authorized"])
            if !mux.supportsOnDevice {
                emitJSON(["type": "warning", "component": "apple_stt", "message": "On-device speech isn't available for this language on this Mac, so Apple live captions are off. Download the language in System Settings → Keyboard → Dictation, or pick a cloud STT."])
            }
            mux.start()
        case .denied, .restricted, .notDetermined:
            emitJSON(["type": "warning", "component": "apple_stt", "message": "Apple Speech Recognition not yet authorized (\(status.rawValue)). Audio chunking for Whisper/Cloud STT remains active."])
        @unknown default:
            break
        }
    }
}

let micCollector = MicrophoneCollector(
    deviceId: micDeviceId,
    wavWriter: micWavWriter,
    chunkSegmenter: micSegmenter,
    liveSpeech: liveSpeechMux
)

let sysCollector = SystemAudioCollector(
    wavWriter: sysWavWriter,
    chunkSegmenter: sysSegmenter,
    liveSpeech: liveSpeechMux,
    appBundleIds: sysAppBundleIds
)

micCollector.start()

Task {
    await sysCollector.start()
    emitJSON([
        "type": "started",
        "sessionDir": sessionDir,
        "micWavPath": micWavPath,
        "sysWavPath": sysWavPath
    ])
}

func gracefulShutdown() {
    micCollector.stop()
    let sem = DispatchSemaphore(value: 0)
    Task {
        await sysCollector.stop()
        sem.signal()
    }
    _ = sem.wait(timeout: .now() + 2.0)
    liveSpeechMux?.stop()
    emitJSON(["type": "stopped"])
    exit(0)
}

signal(SIGINT, SIG_IGN)
signal(SIGTERM, SIG_IGN)

let sigIntSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
sigIntSource.setEventHandler { gracefulShutdown() }
sigIntSource.resume()

let sigTermSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
sigTermSource.setEventHandler { gracefulShutdown() }
sigTermSource.resume()

// stdin control: "stop", "mute me|other", "unmute me|other", "sysapp <bundleId>|*"
DispatchQueue.global(qos: .utility).async {
    while let line = readLine() {
        let parts = line.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: " ", maxSplits: 1).map(String.init)
        guard let cmd = parts.first?.lowercased() else { continue }
        let arg = parts.count > 1 ? parts[1] : ""
        switch cmd {
        case "stop":
            DispatchQueue.main.async { gracefulShutdown() }
            return
        case "mute", "unmute":
            if arg == "me" || arg == "other" { ChannelGate.shared.setMuted(arg, cmd == "mute") }
        case "sysapp":
            let ids = (arg.isEmpty || arg == "*") ? [] : [arg]
            Task { await sysCollector.setApps(ids) }
        case "assist":
            liveSpeechMux?.setInterviewMode(arg == "interview")
        default:
            break
        }
    }
}

RunLoop.main.run()
