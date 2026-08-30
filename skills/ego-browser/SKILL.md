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

Connect to `ws://127.0.0.1:8765`. Create a Space first, then scope every
browser action to it with `payload.spaceId` — a Space can only see or close
its own tabs, never another Space's or the human's:

```json
{ "type": "space.create", "payload": { "name": "freelance-scan" } }
```
```json
{ "type": "browser.open", "payload": { "spaceId": "<id from space.created>", "url": "https://example.com" } }
```

The server validates every message and replies with `{ "type": "error", "payload": { "message": "..." } }`
on malformed JSON, an unknown message type, a bad payload shape, or an
unknown `spaceId`. Full message/response reference:
[references/tool-reference.md](references/tool-reference.md).

## Safety

- Default to read-only browsing unless the task requires writes.
- Do not access payment or auth pages unless explicitly authorized.
- Report URLs and final page state; do not submit forms without confirmation.
