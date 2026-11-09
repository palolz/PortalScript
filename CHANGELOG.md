# Changelog

## 1.1.2

### Changed

- **Missing API key warning.** If Gemini is selected but no Gemini key is saved, PortalScript uses
  local Ollama instead. The top bar now shows a **NO KEY** badge next to Fast and Deep, and API &
  LLMs explains why. The badge also appears when OpenAI, Anthropic, Groq or OpenRouter is chosen
  without a key.

## 1.1.1

### New

- **About PortalScript.** The About window now shows the version, who makes PortalScript
  (hatFullOfSoftware) and links to the website, Terms of Use, Privacy Policy (Datenschutz), Legal
  Notice (Impressum), Licence and source code.
- **Legal links in the Help menu.** Help now opens the hatFullOfSoftware website, Terms of Use,
  Privacy Policy, Legal Notice and Licence.

### Changed

- **Consent reminder before the first recording.** PortalScript now reminds you, once, that you need
  everyone's permission before recording or transcribing a conversation, and that recording law
  differs from place to place.
- Updated the Impressum and Datenschutz links in the README, Terms, Privacy notes and website to the
  new hatfullofsoftware.com pages.

### Fixed

- The default profile file is now created atomically, so an existing profile is never overwritten.

## 1.1.0

### New

- **Automatic interview answers.** In **Interview: AUTO** mode PortalScript detects when the
  interviewer asks a question and answers it without a click. A short **Quick response** comes
  first, and a **Detailed response** with the approach, trade-offs, an example and likely follow-ups
  loads at the same time underneath. Switch to **General: MANUAL** for meetings and lectures.
- **Flowcharts.** Detailed answers include a small text flowchart when a picture makes the answer
  clearer.
- **Speaker tracking.** The new **Gemini Speaker Tracking** speech mode tells different people apart,
  even several voices on the same call, and keeps their numbers for the whole session. Correct any
  line with the speaker menu or the candidate / other button.
- **Security jargon.** Infosec terms and abbreviations such as SIEM, SOC, EDR, MFA, MITRE ATT&CK and
  lateral movement are explained in a **Jargon & abbreviations** box the moment they're said.

### Faster

- Quick answers use a shorter context and less model "thinking", so the first words show up much
  sooner. The detailed answer starts in parallel instead of after the quick one.
- Gemini models get a thinking budget suited to each answer type, with an automatic fallback for
  models that don't support it.

### Privacy

- The [privacy page](docs/PRIVACY.md) now explains what Interview: AUTO and speaker tracking send,
  and when.

### Guide

- New guide sections with screenshots and slow, captioned animations: automatic answers, security
  jargon and speaker tracking.

## 1.0.0

- First public release: live transcription of your mic and your Mac's audio or a single app, click
  for an answer, highlight to explain, context files, sessions, and bring-your-own AI provider.
