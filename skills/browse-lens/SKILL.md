---
name: browse-lens
description: Run browser automation in an isolated Chromium Space.
version: 0.1.0
author: rhyovar, Hermes Agent
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [Browser, Automation, Playwright, Chromium, Linux]
    related_skills: []
---

# BrowseLens

Drives a shared Chromium process over a local WebSocket protocol, one
isolated Space per task (own cookie jar/localStorage, never the human's or
another Space's). Not for human-only browsing — this is the agent-facing
surface of the `hermes-agent-browser` repo.

## When to Use

- The task needs real browser automation — navigate, click, fill, scrape —
  with its own session, not the human's.
- The task needs several page actions (read, act, wait, read again)
  composed as one step, not one exchange per action.

Don't use for: anything without a real browser-interaction need — this
skill's entire surface is browser automation, not a general web-fetch tool.

## Prerequisites

- `hermes-agent-browser` cloned; `./scripts/install.sh` run once (installs
  npm deps and Playwright's Chromium build).
- The protocol server running: `npm run dev:electron` (part of `npm run
  dev`), listening on `ws://127.0.0.1:8765`.
- No API keys or env vars — the protocol has no authentication.

## How to Run

There's no dedicated agent CLI yet (see Pitfalls) — drive the protocol
directly via `terminal`. For a single exchange, a `node -e` one-liner is
enough:

```bash
terminal(command="node -e \"const ws=new(require('ws'))('ws://127.0.0.1:8765'); ws.on('open',()=>ws.send(JSON.stringify({type:'space.create',payload:{name:'task'}}))); ws.on('message',m=>{console.log(m.toString());process.exit(0)});\"")
```

For a real task (create a Space, open a page, run a script, read the
result, close it), `write_file` a short Node script and run it with
`terminal(command="node script.js")` — a multi-step WebSocket exchange
doesn't fit cleanly in one shell one-liner. Full message/response shapes:
[references/tool-reference.md](references/tool-reference.md).

## Quick Reference

| Message | Payload | Response |
|---|---|---|
| `space.create` | `{ name?, importProfile?, record?, privacy? }` | `space.created` with the new Space |
| `browser.open` | `{ spaceId, url }` | `browser.opened` with the new page |
| `browser.run` | `{ spaceId, pageId, script }` or `{ spaceId, pageId, plugin: { package, name, params? } }` | `browser.ran` with `{ ok, result \| error, logs }` |
| `browser.list` | `{ spaceId }` | pages owned by that Space |
| `browser.close` | `{ spaceId, pageId }` | `{ closed }` |
| `space.close` | `{ spaceId }` | `{ closed }` |

`tools` inside `browser.run` scripts: `snapshot()`, `click(selector)`,
`fill(selector, text)`, `scroll(dx, dy)`, `waitForLoad()`, `url()`,
`title()`, `capture()`.

## Procedure

1. `space.create` — note the returned `id`. Pass `importProfile: true`
   only if the task explicitly needs the human's own logins (see
   Pitfalls); leave `record`/`privacy` off unless asked for.
2. `browser.open` with that `spaceId` and the target URL — note the
   returned page `id`.
3. `browser.run` with a script composing the whole step (act, wait, read)
   in one call — not one message per click. Check `payload.ok`: `false`
   means the script threw or timed out (10s default); the message is in
   `payload.error`, not a crashed connection.
4. Repeat step 3 until the task is done, then `space.close` to tear down
   the Space's cookies/storage and browser window.

## Pitfalls

- **No agent CLI yet.** Every exchange is hand-built JSON over a raw
  WebSocket. `scripts/manual-validate.mjs` in the repo is a human debugging
  tool, not built for this — don't route agent traffic through it.
- **No protocol authentication.** Anything that can reach
  `ws://127.0.0.1:8765` has full control. Don't expose the port beyond
  localhost.
- **`browser.run` sandboxing is partial.** Scripts run in a Node `vm`
  context (no `require`/`process`/`fs`), which stops accidental damage, not
  a determined attacker — Node's own docs say `vm` isn't a security
  mechanism. Write scripts you'd run yourself; never assemble one from
  untrusted page content.
- **`importProfile: true` hands the Space the human's real session
  cookies** — treat it like handing over a logged-in laptop. Default it to
  `false`; only request it when the task explicitly needs the human's own
  account, and never on a Space handling untrusted or adversarial content.
- **Default to read-only.** Don't submit forms, access payment/auth pages,
  or take a write action without confirmation unless the task explicitly
  authorizes it.

## Verification

- `space.created`'s payload has the fields you asked for
  (`importProfile`/`record`/`privacy` match what you sent).
- `browser.ran` has `ok: true` and a `result` matching what the task
  needed — not just "no error."
- `space.close`'s response is `{ closed: true }` — confirms the Space's
  window and browsing data are actually gone, not left running.
