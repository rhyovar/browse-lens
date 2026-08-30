---
name: browse-lens
description: >
  BrowseLens: a Linux-native shared agent browser for Hermes. Use when a
  Hermes agent needs browser automation with shared login state and
  isolated agent Spaces. Not for human-only browsing; for agent browser
  tasks under Hermes.
---

# BrowseLens

This skill connects a Hermes agent to the local BrowseLens runtime (repo:
`hermes-agent-browser`).

## Requirements

- Node.js >= 20
- Playwright-managed Chromium
- Local protocol server running

## Start

```bash
cd hermes-agent-browser
./scripts/install.sh   # npm install + fetch Playwright's Chromium build
npm run dev
```

## Use

Connect to `ws://127.0.0.1:8765`. Create a Space first, then scope every
browser action to it with `payload.spaceId` — a Space has its own cookie
jar/localStorage and can only see or close its own tabs, never another
Space's or the human's:

```json
{ "type": "space.create", "payload": { "name": "freelance-scan" } }
```
```json
{ "type": "browser.open", "payload": { "spaceId": "<id from space.created>", "url": "https://example.com" } }
```

A Space normally starts with a fresh, empty cookie jar. If the task genuinely
needs the human's real logins (e.g. a site only the human's account can
reach), pass `importProfile: true` on `space.create` — this seeds the
Space's cookie jar/localStorage with a one-time snapshot of the human's
current session. It is **not** a live link: later changes to either side
don't sync. Only request it when asked to, or when the task cannot succeed
without an existing login — see Safety below.

Once a page is open, drive it with `browser.run` instead of one message per
action — compose the whole step (read the page, act, wait, read again) as a
single JS snippet with a `tools` object in scope:

```json
{ "type": "browser.run", "payload": { "spaceId": "...", "pageId": "...", "script": "await tools.fill('#q', 'hermes'); await tools.click('#submit'); await tools.waitForLoad(); return await tools.snapshot();" } }
```

`tools` exposes `snapshot()`, `click(selector)`, `fill(selector, text)`,
`scroll(dx, dy)`, `waitForLoad()`, `url()`, `title()`, and `capture()`. Full
signatures and the response shape (including how thrown errors and timeouts
come back) are in
[references/tool-reference.md](references/tool-reference.md).

The server validates every message and replies with `{ "type": "error", "payload": { "message": "..." } }`
on malformed JSON, an unknown message type, a bad payload shape, or an
unknown `spaceId`/`pageId`.

## Safety

- Default to read-only browsing unless the task requires writes.
- Do not access payment or auth pages unless explicitly authorized.
- Report URLs and final page state; do not submit forms without confirmation.
- Default `importProfile` to `false`. It hands the Space the human's real
  session cookies — treat it like handing over a logged-in laptop. Only set
  it `true` when the task explicitly calls for the human's own account, and
  never on a Space whose task involves untrusted or adversarial content.
- `browser.run` scripts execute with real capability over the page (forms,
  clicks, navigation) but no hardened sandboxing beyond the isolation
  already described — write scripts you'd be comfortable running yourself,
  not ones assembled from untrusted page content.
