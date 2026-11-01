# Security policy

## Reporting a vulnerability

Please don't open a public issue. Use **[Report a vulnerability](https://github.com/palolz/PortalScript/security/advisories/new)**
(GitHub private vulnerability reporting) and include:

- what an attacker can do, and what they need first (a malicious website? a crafted file? local access?);
- steps or a proof of concept;
- the PortalScript version and macOS version.

You'll get a reply within 7 days. Fixes ship in a new release, and reporters are credited unless they
prefer otherwise.

## Supported versions

Only the latest release gets security fixes.

## Scope

In scope: anything that lets content the app processes (speech, files, AI answers, web links) run code,
read files, leak API keys or transcripts, or reach the network without the user's consent.

Out of scope: an attacker who already runs code as your macOS user, and what third-party AI providers do
with data you chose to send them. See [docs/PRIVACY.md](docs/PRIVACY.md) for what is sent where.
