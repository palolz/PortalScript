# Architecture

PortalScript is an Electron app with two small Swift command-line helpers. Everything with access to the
file system, the network or API keys runs in the main process. The UI runs in a sandboxed renderer and
can only call a fixed list of IPC functions.

## Block diagram

```mermaid
flowchart TB
  subgraph mac[Your Mac]
    subgraph app[PortalScript.app]
      UI["Renderer (React)<br/>sandbox, contextIsolation, CSP"]
      Pre["Preload<br/>window.liveTranscriptAPI"]
      Main["Main process<br/>src/main/main.js"]
      LLM["llmService.js"]
      STT["sttService.js"]
      QD["questionDetector.js"]
      Audio["AudioCaptureHelper<br/>(Swift)"]
      Doc["DocTextExtractor<br/>(Swift)"]
    end
    Data[("~/Library/Application Support/PortalScript<br/>settings.json · profile.md · sessions/")]
    KC[("macOS Keychain<br/>(safeStorage key)")]
    ASR["Apple Speech<br/>(on-device only)"]
  end

  Cloud[("AI provider you chose")]
  Browser["Default web browser"]

  UI <-- "IPC (sender-checked)" --> Pre <--> Main
  Main --> LLM --> Cloud
  Main --> STT --> Cloud
  Main --> QD
  Main <-- "stdin / JSON lines on stdout" --> Audio
  Audio --> ASR
  Main -- "file path" --> Doc
  Main <--> Data
  Main <--> KC
  Main -- "after you confirm" --> Browser
```

## Processes

| Process            | Code                              | Can do                                                                                                                 |
| ------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Main               | `src/main/main.js`                | Files, network, spawning helpers, dialogs, keychain                                                                    |
| Renderer           | `src/renderer/`                   | Draw the UI. No Node.js, no network (`connect-src 'self'`), no navigation away from the app page                       |
| Preload            | `src/preload/preload.js`          | Expose a fixed set of IPC calls as `window.liveTranscriptAPI`                                                          |
| AudioCaptureHelper | `native/AudioCaptureHelper.swift` | Capture mic (AVFoundation) and system or per-app audio (ScreenCaptureKit), run on-device Apple Speech, write WAV files |
| DocTextExtractor   | `native/DocTextExtractor.swift`   | Pull text out of PDFs and images (PDFKit, Vision OCR)                                                                  |

### Helper protocol

The main process starts `AudioCaptureHelper` when you press Start and talks to it over stdio.

- **stdin** (main → helper): `stop`, `mute me|other`, `unmute me|other`, `sysapp <bundleId>|*`
- **stdout** (helper → main), one JSON object per line:
  `started`, `stopped`, `status`, `warning`, `error`, `level` (meters),
  `transcript` (Apple Speech text), `audio_chunk` (path to a short WAV for cloud speech-to-text),
  `devices`, `apps`

## Sequence: live capture

```mermaid
sequenceDiagram
  actor You
  participant UI as Renderer
  participant M as Main
  participant H as AudioCaptureHelper
  participant A as Apple Speech (on device)
  participant S as Cloud STT (optional)

  You->>UI: Start Live Capture
  UI->>M: recording:start
  M->>H: spawn with mic / system-audio options
  H-->>M: started
  loop while recording
    H->>A: audio buffers
    A-->>H: partial / final text
    H-->>M: transcript {speaker, text}
    H-->>M: audio_chunk {speaker, path}
    alt Apple Speech has been quiet on that channel (hybrid) or a cloud STT is selected
      M->>S: WAV chunk
      S-->>M: text
    end
    M->>M: delete chunk, merge into transcript boxes, save session.json
    M-->>UI: session:updated
  end
  You->>UI: Pause
  UI->>M: recording:stop
  M->>H: stop
```

## Sequence: click a line for an answer

```mermaid
sequenceDiagram
  actor You
  participant UI as Renderer
  participant M as Main
  participant L as AI provider

  You->>UI: click a transcript box
  UI->>M: session:answer-segment(id)
  M->>M: build prompt: profile.md + context files + recent transcript,<br/>quoted text wrapped in <untrusted_…> tags
  M->>L: HTTPS request (streaming)
  L-->>M: tokens
  M-->>UI: copilot:card-updated
  UI->>UI: render Markdown through DOMPurify
  Note over UI,M: Links in the answer go back to main,<br/>which asks before opening the browser
```

## Sequence: open in browser

```mermaid
sequenceDiagram
  actor You
  participant UI as Renderer
  participant M as Main
  participant B as Browser

  You->>UI: Open in browser
  UI->>M: copilot:open-browser(query)
  M->>You: dialog showing the exact text and site
  alt you confirm
    M->>M: copy prompt to clipboard
    M->>B: open https://… ?q=query
  else you cancel
    M-->>UI: nothing is sent
  end
```

## Security measures

- Renderer: `sandbox`, `contextIsolation`, no `nodeIntegration`, strict CSP, DevTools off in release builds.
- Every IPC handler rejects calls that don't come from the app's own page.
- Navigation, new windows, redirects and `<webview>` are blocked; web permissions are denied except clipboard write.
- AI output is untrusted: Markdown is sanitized with DOMPurify, only `http(s)` and `mailto` links survive, and opening one asks first.
- Text from speech and files is fenced as untrusted data in prompts to blunt prompt injection.
- API keys are encrypted with Electron `safeStorage` (Keychain-backed) and never sent to the renderer; the UI only sees masked values.
- Remote endpoints must be `https://`; plain `http://` is only accepted for `localhost`. HTTP redirects are refused.
- Links and endpoint addresses with a user name or password in them (`https://bank.com@evil.com`) are refused.
- `npm test` checks these rules in CI, including which host every API key and every audio upload goes to.
- Files are created owner-only (`umask 077`).
- Release builds flip Electron fuses: no `ELECTRON_RUN_AS_NODE`, no `NODE_OPTIONS` or `--inspect`, app code only from `app.asar`, with an integrity check.

## Source map

| Path                                 | What's in it                                                          |
| ------------------------------------ | --------------------------------------------------------------------- |
| `src/main/main.js`                   | Window, IPC, settings, sessions, helper management, prompts for cards |
| `src/main/llmService.js`             | Provider presets, model catalogs, streaming clients, prompt templates |
| `src/main/sttService.js`             | Cloud speech-to-text (Gemini, Groq Whisper, OpenAI Whisper)           |
| `src/main/questionDetector.js`       | Keyword chips and the "me vs. other" split for a single shared mic    |
| `src/main/security.js`               | Link and sender checks, settings filtering, key encryption on disk    |
| `src/main/sessionContext.js`         | Builds the fenced transcript + files block sent with AI requests      |
| `test/`                              | Unit tests (`npm test`), network replaced by a recording fake `fetch` |
| `src/preload/preload.js`             | The IPC bridge                                                        |
| `src/renderer/App.jsx`, `styles.css` | The whole UI                                                          |
| `native/`                            | Swift helpers and the helper's embedded `Info.plist`                  |
| `scripts/build-native.sh`            | Builds universal (arm64 + x86_64) helpers                             |
| `electron-builder.yml`               | Packaging, fuses, DMG                                                 |
