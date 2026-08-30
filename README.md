# Hermes Agent Browser

Linux-native shared agent browser for Hermes.

One Chromium process. Isolated agent Spaces, each in their own window with their own cookies/storage. Your tabs stay yours. Agents drive the browser through a controlled JS surface without fighting over shared browsing data.

## Goal

Build an open-source alternative to agent-native browser concepts like ego-lite, but for Linux and for Hermes workflows.

Core promise:
- One shared Chromium process across human + multiple agents — no per-agent browser instances
- Isolated Spaces: each gets its own cookie jar/localStorage/session state, so agents don't clobber your tabs or each other's data (opt-in profile import, not automatic sharing, is how a Space would inherit real logins — see Roadmap)
- Agent-facing tool surface optimized for code/tool use, not CLI loops
- Linux-first packaging and local dev experience

## Status

Scaffolded. Repo created, structure planned. Implementation handoff queued for nick-white.

## Roadmap

Priority order for maximum traction:

1. **Linux stability** — make install + dev feel native on Ubuntu/Debian/Fedora/Arch.
2. **Space isolation** — separate cookie jars, localStorage, and session state per agent.
3. **Chrome profile import** — one-click migration so agents inherit real logins.
4. **Agent tool surface** — JS functions called directly by agents, not CLI loops.
5. **Benchmark harness** — reproducible comparisons against browser-use / agent-browser.
6. **Session recording/replay** — record agent behavior, replay it, diff it.
7. **Privacy mode** — per-space network restrictions and telemetry blocking.
8. **Plugin ecosystem** — community npm packages for prebuilt agent behaviors.
9. **Hermes skill** — make `ego-browser` the easiest agent integration path.

## Progress

- [x] Repo scaffold
- [ ] Branch protection
- [x] Playwright Chromium runtime
- [x] Space isolation
- [x] WebSocket protocol
- [x] Agent skill wiring
- [x] Manual validation flow
- [ ] Linux packaging
- [x] Chrome profile import
- [ ] Benchmark harness
- [ ] Session recording/replay
- [ ] Privacy mode
- [ ] Plugin system
- [ ] README/docs updates as features land

### Playwright Chromium runtime

`src/browser/` launches one shared Playwright Chromium process — the human
and every agent Space run in it, each in their own `BrowserContext` (see
Space isolation below) rather than one shared context:

- `profile.ts` — resolves `storageStatePath(name)`, where a context's
  cookies/localStorage get persisted (`~/.hermes-agent-browser/<name>.storage-state.json`).
- `context.ts` — `ensureBrowser()` lazily launches the shared `Browser` and
  memoizes it; `ensureHumanContext()` lazily creates the human's own
  `BrowserContext` (loading its storageState from disk if present);
  `closeBrowser()` saves the human's storageState and shuts everything down.
- `chromium.ts` — `openTarget(url)` opens a new tab in the human's context
  and navigates to `url`.

Set `HERMES_HEADLESS=true` to run headless (used by the test suite).
Run `npx playwright install chromium` once to fetch the browser binary.
`npm run dev:electron` installs a `SIGINT`/`SIGTERM` handler that calls
`closeBrowser()` so `Ctrl+C` saves the human's session instead of losing it.

### Space isolation

Every Space gets its **own `BrowserContext`** inside the one shared Chromium
process — a separate cookie jar, localStorage, and session state, not just
separate tabs. A Space can't read or clobber another Space's data, or the
human's; the human's context is likewise never shared with any Space by
default (see Chrome profile import below for the opt-in exception).

Chromium (via CDP, confirmed with `Browser.getWindowForTarget`) shows each
`BrowserContext` as its own OS window — there's no way to give two isolated
contexts tabs in the same window. So opening a page in a Space opens (or
reuses) **that Space's own window**, separate from the human's window and
every other Space's; pages opened within the same Space do share one window
as tabs, same as before.

- `space.ts` — the `Space` metadata shape (id, name, createdAt, active, importProfile).
- `registry.ts` — `SpaceRegistry` creates/looks up/lists Spaces; `close(id)`
  tears down the Space's pages (via `isolation.ts`) before removing it.
- `isolation.ts` — `SpaceIsolation.getContext(spaceId)` lazily creates a
  `BrowserContext` per Space; `open`/`list`/`close` only ever act on that
  Space's own pages; `closeAll(spaceId)` closes the Space's entire context
  (pages, cookies, storage) in one call.

This is wired into the WebSocket protocol (`space.create`, `space.close`,
`browser.open`, `browser.list`, `browser.close`), each scoped by
`payload.spaceId`; `browser.open`/`browser.list` reject an unknown
`spaceId` with an `error` message.

`tests/unit/isolation.test.ts` proves this isn't just bookkeeping: one test
sets a cookie and a `localStorage` value in Space A, opens the same URL in
Space B, and asserts neither is visible there.

### Chrome profile import

A Space normally starts with an empty cookie jar. Passing
`importProfile: true` on `space.create` seeds that Space's **first**
`BrowserContext` (created on its first `browser.open`) with a one-time
snapshot of the human's current cookies/localStorage
(`(await ensureHumanContext()).storageState()`, passed straight into
`browser.newContext({ storageState })` — no disk round-trip). It's a
snapshot, not a live link: later changes on either side don't sync, and
re-opening a page in the same Space reuses its already-created context
regardless of the flag.

This is opt-in and off by default — inheriting the human's real logins into
an agent-controlled context is a real trust boundary, not just a
convenience. `skills/ego-browser/SKILL.md`'s Safety section tells agents to
request it only when the task explicitly needs the human's own account.
`tests/unit/isolation.test.ts` proves both directions: a Space created with
`importProfile: true` sees a cookie set on the human's context; one without
it doesn't.

### WebSocket protocol + agent skill wiring

`npm run dev:electron` (part of `npm run dev`) now starts both the shared
Chromium browser and the protocol server, listening on
`ws://127.0.0.1:8765`.

- `protocol/messages.ts` — a `zod` discriminated union of every client
  message (`space.create`, `space.close`, `browser.open`, `browser.list`,
  `browser.close`) with its payload shape; `parseClientMessage(raw)`
  parses and validates raw text, returning either the typed message or an
  error string.
- `protocol/ws-server.ts` — parses every incoming message through
  `parseClientMessage` before dispatch, so malformed JSON, an unknown
  message type, a missing field, or a bad `url`/`spaceId` all come back as
  `{ "type": "error", "payload": { "message": "..." } }` instead of
  crashing the connection or being silently ignored.

`skills/ego-browser/SKILL.md` documents the spaceId-scoped message shapes
for agents, with the full request/response reference in
[`skills/ego-browser/references/tool-reference.md`](skills/ego-browser/references/tool-reference.md).

### Manual validation flow

Automated tests run headless and can't confirm the actual point of this
project — that a human's browsing and each agent Space's browsing stay
visibly and functionally separate. `docs/MANUAL_VALIDATION.md` is a
step-by-step human walkthrough for that: start the app for real (headed),
then drive it with `npm run validate` (`scripts/manual-validate.mjs`, an
interactive CLI over the WebSocket protocol) while watching the Chromium
windows to confirm Spaces get their own window and can't see or close each
other's tabs, cookies, or the human's.

### Linux stability / packaging (in progress)

`scripts/install.sh` is a single Linux install step: it checks for a
supported Node (`engines.node` in `package.json` requires `>=20`; the
`skills/ego-browser` requirement previously and incorrectly said `>=24.14`
— nothing in this repo needs that), runs `npm install`, and fetches
Playwright's Chromium build. On apt-based distros it also tries
`playwright install --with-deps` for the OS-level Chromium libraries,
falling back to a browser-only install (with a note to install those
libraries manually) if that needs root it doesn't have.

```bash
./scripts/install.sh
npm run dev
```

Still open: this only makes `npm install`/`npm run dev` reliable across
distros. It does not yet produce an installable Linux package (AppImage/deb)
— that needs an actual Electron desktop shell (a `BrowserWindow` loading
`ui/`) to package, and `ui/` doesn't exist yet (see Repo layout). Building
`electron-builder` config against a nonexistent UI would just ship a package
that opens nothing, so that's deferred until the UI lands.

## Repo layout

```
.
├── README.md
├── LICENSE
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .
├── src/
│   ├── main/
│   │   └── index.ts
│   ├── browser/
│   │   ├── chromium.ts
│   │   ├── profile.ts
│   │   └── context.ts
│   ├── space/
│   │   ├── space.ts
│   │   ├── registry.ts
│   │   └── isolation.ts
│   ├── agent/
│   │   ├── tool-session.ts
│   │   ├── permissions.ts
│   │   └── audit.ts
│   └── protocol/
│       ├── ws-server.ts
│       └── messages.ts
├── ui/
│   ├── index.html
│   ├── style.css
│   └── app.ts
├── scripts/
│   ├── install.sh
│   └── manual-validate.mjs
├── docs/
│   └── MANUAL_VALIDATION.md
├── skills/
│   └── ego-browser/
│       ├── SKILL.md
│       ├── install.md
│       └── references/
│           └── tool-reference.md
└── tests/
    ├── unit/
    └── e2e/
```

## Tech choices

- Runtime: Node.js + TypeScript
- Browser: Playwright on Chromium
- Packaging: Electron for desktop shell
- Agent bridge: local WebSocket + injected page tools
- Frontend shell: vanilla TS + Vite

## Install

```bash
git clone https://github.com/rhyovar/hermes-agent-browser.git
cd hermes-agent-browser
./scripts/install.sh
npm run dev
```

## Contributing

See CONTRIBUTING.md.

## License

MIT — see LICENSE.
