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
surface of the `browse-lens` repo.

## When to Use

- The task needs real browser automation — navigate, click, fill, scrape —
  with its own session, not the human's.
- The task needs several page actions (read, act, wait, read again)
  composed as one step, not one exchange per action.

Don't use for: anything without a real browser-interaction need — this
skill's entire surface is browser automation, not a general web-fetch tool.

## Prerequisites

- `browse-lens` cloned; `./scripts/install.sh` run once (installs
  npm deps and Playwright's Chromium build). If you just want to use
  BrowseLens as a desktop app, download the AppImage or deb from
  [GitHub Releases](https://github.com/rhyovar/hermes-agent-browser/releases)
  — no Node.js or `npm install` required.
- The protocol server running: `npm run dev:electron` (part of `npm run
  dev`), listening on `ws://127.0.0.1:8765`.
- No API keys or env vars — the protocol has no authentication.

## How to Run

Drive the protocol through the `browse-lens` CLI (`cli.mjs`, run via
`npx browse-lens <command>` from the repo root) — one subcommand per
message, plain JSON on stdout, non-zero exit on any failure:

```bash
terminal(command="npx browse-lens create task")
terminal(command="npx browse-lens open <spaceId> https://example.com")
terminal(command="npx browse-lens run <spaceId> <pageId> \"return await tools.title();\"")
terminal(command="npx browse-lens close <spaceId>")
```

Or use the **Electron desktop shell** (`npm run dev`) for a visual
dark-themed UI that connects to the same WebSocket server and lets you
create Spaces, list pages, and open URLs without hand-building JSON.
Full walkthrough: [docs/ELECTRON.md](../docs/ELECTRON.md).

Full command list: `npx browse-lens --help`. Full message/response shapes
(what the CLI wraps): [references/tool-reference.md](references/tool-reference.md).

## Quick Reference

| Command | Message | Response |
|---|---|---|
| `browse-lens create <name> [--import] [--record] [--privacy] [--allow <domains>] [--block <domains>]` | `space.create` | the new Space |
| `browse-lens open <spaceId> <url>` | `browser.open` | the new page |
| `browse-lens run <spaceId> <pageId> <script...>` | `browser.run` | `{ ok, result \| error, logs }` |
| `browse-lens run <spaceId> <pageId> --plugin <pkg> --script-name <name> [--params <json>]` | `browser.run` (plugin) | same as above |
| `browse-lens list <spaceId>` | `browser.list` | pages owned by that Space |
| `browse-lens close <spaceId>` | `space.close` | `{ closed }` |
| `browse-lens close <spaceId> <pageId>` | `browser.close` | `{ closed }` |

`tools` inside a `run` script: `snapshot()`, `click(selector)`,
`fill(selector, text)`, `scroll(dx, dy)`, `waitForLoad()`, `url()`,
`title()`, `capture()`, `waitForSelector(selector, timeoutMs?)`,
`scrapeTable(selector)`, `extractJSON(selector)`, `monitorNetwork(durationMs?)`.

## Procedure

1. `browse-lens create <name>` — note the returned `id`. Add `--import`
   only if the task explicitly needs the human's own logins (see
   Pitfalls); leave `--record`/`--privacy` off unless asked for.
2. `browse-lens open <spaceId> <url>` — note the returned page `id`.
3. `browse-lens run <spaceId> <pageId> <script>`, composing the whole step
   (act, wait, read) in one call — not one command per click. A non-zero
   exit means the script threw or timed out (10s default); the message is
   in the printed `error` field, not a crashed connection.
4. Repeat step 3 until the task is done, then `browse-lens close <spaceId>`
   to tear down the Space's cookies/storage and browser window.

## Pitfalls

- **The CLI has no auth of its own** — it's a thin wrapper, not a new
  boundary; see the next point.
- **No protocol authentication.** Anything that can reach
  `ws://127.0.0.1:8765` has full control. Don't expose the port beyond
  localhost.
- **Network policy is default-allow.** `--allow`/`--block` (or nothing)
  leave a Space open to the whole internet by default. `--block` alone
  blocks just those domains; `--allow` alone flips that Space to
  allow-only-those; both together let `--block` win on a shared domain.
  Details: [docs/PRIVACY.md](../../docs/PRIVACY.md). `open`ing a URL the
  Space's own policy blocks fails cleanly (non-zero exit, printed error),
  not a crash.
- **`browser.run` sandboxing is partial.** Scripts run in a Node `vm`
  context (no `require`/`process`/`fs`), which stops accidental damage, not
  a determined attacker — Node's own docs say `vm` isn't a security
  mechanism. Write scripts you'd run yourself; never assemble one from
  untrusted page content.
- **`--import` (`importProfile: true`) hands the Space the human's real
  session cookies** — treat it like handing over a logged-in laptop. Leave
  it off by default; only use it when the task explicitly needs the
  human's own account, and never on a Space handling untrusted or
  adversarial content.
- **Default to read-only.** Don't submit forms, access payment/auth pages,
  or take a write action without confirmation unless the task explicitly
  authorizes it.

## Verification

- `create`'s printed Space has the fields you asked for (`importProfile`/
  `record`/`privacy` match the flags you passed).
- `run` exits `0` with `ok: true` and a `result` matching what the task
  needed — not just "no error."
- `close`'s response is `{ closed: true }` — confirms the Space's window
  and browsing data are actually gone, not left running.
