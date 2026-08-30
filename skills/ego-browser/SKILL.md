---
name: hermes-agent-browser
description: >
  Linux-native shared agent browser for Hermes. Use when a Hermes agent needs
  browser automation with shared login state and isolated agent Spaces.
  Not for human-only browsing; for agent browser tasks under Hermes.
---

# Hermes Agent Browser

This skill connects a Hermes agent to the local `hermes-agent-browser` runtime.

## Requirements

- Node.js >= 24.14
- Playwright-managed Chromium
- Local protocol server running

## Start

```bash
cd hermes-agent-browser
npm install
npm run dev
```

## Use

Connect to `ws://127.0.0.1:8765` and send JSON messages:

```json
{ "type": "space.create", "payload": { "name": "freelance-scan" } }
{ "type": "browser.open", "payload": { "url": "https://example.com" } }
```

## Safety

- Default to read-only browsing unless the task requires writes.
- Do not access payment or auth pages unless explicitly authorized.
- Report URLs and final page state; do not submit forms without confirmation.
