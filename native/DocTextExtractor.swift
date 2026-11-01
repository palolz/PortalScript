// Extracts plain text from PDFs (PDFKit, OCR fallback for scanned pages) and images (Vision OCR).
// Usage: DocTextExtractor <file>   -> UTF-8 text on stdout, error message on stderr with non-zero exit.
import AppKit
import Foundation
import ImageIO
import PDFKit
import Vision

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

func recognizeText(_ image: CGImage) -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    do {
        try handler.perform([request])
    } catch {
        return ""
    }
    return (request.results ?? [])
        .compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: "\n")
}

let args = CommandLine.arguments
guard args.count >= 2 else { fail("usage: DocTextExtractor <file>") }
let url = URL(fileURLWithPath: args[1])
var output = ""

if url.pathExtension.lowercased() == "pdf" {
    guard let document = PDFDocument(url: url) else { fail("Could not open PDF") }
    let maxPages = min(document.pageCount, 300)
    let maxOcrPages = 40
    var ocrPages = 0
    for index in 0..<maxPages {
        guard let page = document.page(at: index) else { continue }
        var text = page.string ?? ""
        if text.trimmingCharacters(in: .whitespacesAndNewlines).count < 20 && ocrPages < maxOcrPages {
            ocrPages += 1
            let bounds = page.bounds(for: .mediaBox)
            let image = page.thumbnail(of: NSSize(width: bounds.width * 2, height: bounds.height * 2), for: .mediaBox)
            if let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) {
                text = recognizeText(cgImage)
            }
        }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            output += "--- Page \(index + 1) ---\n\(trimmed)\n\n"
        }
    }
} else {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        fail("Unsupported or unreadable image")
    }
    output = recognizeText(image)
}

FileHandle.standardOutput.write(output.data(using: .utf8)!)
