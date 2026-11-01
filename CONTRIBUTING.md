# Contributing

Thanks for helping. A few things keep this manageable:

1. **Bugs:** open an issue with the bug form. Include steps and your macOS version.
2. **Features:** open an issue first so we can agree on the idea before you write code.
3. **Pull requests:** keep them small and focused. Fill in the template.

The maintainer ([@palolz](https://github.com/palolz)) reviews and merges every change; `main` is protected.

## Contributor License Agreement

The first time you open a pull request, a bot asks you to sign the [CLA](CLA.md) by posting a comment.
You keep the copyright to your work. The CLA lets the project keep its license, or change it later,
without tracking down every contributor.

## Development

Requirements: macOS 14+, Xcode Command Line Tools, Node.js 22.

```sh
npm ci
npm start             # builds the Swift helpers if needed, builds the UI, runs the app
npm run dev:renderer  # optional: Vite dev server; run the app with VITE_DEV_SERVER_URL=http://localhost:5173
npm test              # unit tests, no network or API keys needed
npm run lint
npm run format
npm run dist          # DMGs in release/
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing anything in `src/main/`.

## Rules for changes

- Anything that touches the network, files, IPC or prompts must keep the guarantees in
  [docs/PRIVACY.md](docs/PRIVACY.md), and update that file if the behaviour changes.
- New IPC calls go through the `handle()` wrapper in `main.js` so the sender is checked.
- Never put API keys, personal data or recordings in the repo, tests or screenshots.
- Changes to `src/main/` need tests in `test/`. The network tests replace `fetch`, so they show
  exactly which host each key and each piece of data is sent to; keep it that way.
- CI must pass: lint, formatting, tests, `npm audit`, UI build and Swift build.
