# Privacy

PortalScript has no account, no analytics, no crash reporting and no auto-updater. It only talks to the
services you configure, and only for the reasons listed below.

## Files

Everything is created owner-only (`0700` folders, `0600` files).

| Path                                                       | Contents                                                                             | Written when                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------- |
| `~/Library/Application Support/PortalScript/settings.json` | Preferences. API keys are encrypted with the macOS Keychain (Electron `safeStorage`) | You save settings                       |
| `…/PortalScript/profile.md`                                | Your profile text (CV, notes). Sent to the AI provider with each request             | You save the profile                    |
| `…/PortalScript/sessions/<session>/session.json`           | Transcript, AI answers, extracted text of context files you added, timestamps        | Continuously while a session is open    |
| `…/sessions/<session>/transcript.md`, `transcript.txt`     | Readable copies of the transcript                                                    | With `session.json`                     |
| `…/sessions/<session>/mic_me.wav`, `system_other.wav`      | Full audio recording of each channel (16 kHz mono)                                   | While capturing                         |
| `…/sessions/<session>/chunks/`                             | Short WAV pieces for cloud speech-to-text                                            | Deleted as soon as they are transcribed |
| `…/PortalScript/known_sessions.json`                       | Paths of session folders you created elsewhere                                       | You pick a custom folder                |
| Electron cache folders in `…/PortalScript/`                | Chromium caches                                                                      | By Electron                             |

The app also **reads**:

- files you pick or drop in as context (PDF, images, text, Office files), and a profile `.md` you choose;
- `~/Documents/LiveTranscriptRecords/sessions/`, if present, so sessions from older versions still load.
  An old `settings.json` there is deleted on first launch because it could contain keys in plain text.

**Export** writes a Markdown or text copy wherever you choose. Exports contain the transcript and answers,
and name the audio files without their full path.

To delete everything: quit the app, then remove `~/Library/Application Support/PortalScript` and the
`PortalScript Safe Storage` item in Keychain Access.

## Network

Nothing is sent until you add a key or choose a provider. HTTPS only (except `localhost`), redirects refused.

| Destination                                                                          | What is sent                                                                                     | When                                                                                                                                                                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Your AI provider** (Gemini, OpenAI, Anthropic, Groq, OpenRouter, custom endpoint)  | Your profile, text of context files, recent transcript, the clicked line or phrase, your API key | You click a line, a keyword or ask a question. Also in the background: when new speech arrives, the top detected keyword is pre-fetched with the last 8 transcript lines |
| **Cloud speech-to-text** (Gemini by default, or Groq / OpenAI Whisper)               | Short WAV clips of the audio channel                                                             | Gemini/Groq/OpenAI mode: every clip. Hybrid mode (default): only when on-device recognition has been silent on that channel for ~4 s. Apple mode: never                  |
| Model catalogs: `generativelanguage.googleapis.com`, `api.groq.com`, `openrouter.ai` | Your key for that provider (OpenRouter's list needs no key)                                      | Opening settings or refreshing models, only for providers in use                                                                                                         |
| Ollama / local endpoint (`127.0.0.1`)                                                | Same as AI provider                                                                              | Only if you select it                                                                                                                                                    |
| Your browser: Google AI Mode, ChatGPT, Perplexity                                    | The query, in the URL                                                                            | Only after a confirmation dialog showing the exact text                                                                                                                  |
| Links in AI answers                                                                  | Nothing, the link opens in your browser                                                          | Only after a confirmation dialog                                                                                                                                         |
| Apple Speech                                                                         | Nothing leaves the Mac                                                                           | Recognition is forced on-device; if the Mac can't do that, Apple Speech stays off                                                                                        |

API keys can also come from `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY` or
`OPENROUTER_API_KEY` in the environment.

What each provider does with your data is governed by its own terms. Check them before sending
interviews or meetings you aren't allowed to share, and get consent before recording other people.

## Clipboard

- Looking up a keyword or phrase copies it to the clipboard.
- "Open in browser" copies the full prompt to the clipboard after you confirm.

With Universal Clipboard turned on, macOS can sync these to your other Apple devices.

## macOS permissions

| Permission                      | Why                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Microphone                      | Transcribe your voice                                                               |
| Screen & System Audio Recording | Capture system or app audio through ScreenCaptureKit. Video frames are not recorded |
| Speech Recognition              | On-device live captions                                                             |
