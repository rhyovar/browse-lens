# Hermes Agent Browser

Linux-native shared agent browser for Hermes.

One Chromium instance. Isolated agent Spaces. Your tabs stay yours. Agents drive the browser through a controlled JS surface without fighting for the same window.

## Goal

Build an open-source alternative to agent-native browser concepts like ego-lite, but for Linux and for Hermes workflows.

Core promise:
- Shared browser state across human + multiple agents
- Isolated Spaces so agents don’t clobber your tabs
- Agent-facing tool surface optimized for code/tool use, not CLI loops
- Linux-first packaging and local dev experience

## Status

Scaffolded. Repo created, structure planned. Implementation handoff queued for nick-white.

## Progress

- [x] Repo scaffold
- [ ] Branch protection
- [x] Playwright Chromium runtime
- [x] Space isolation
- [x] WebSocket protocol
- [x] Agent skill wiring
- [ ] Manual validation flow

### Playwright Chromium runtime

`src/browser/` launches a single Playwright-managed, persistent Chromium
context backed by a profile at `~/.hermes-agent-browser/chromium-profile`,
so the human and any connected agents share one browser instance and its
logged-in state:

- `profile.ts` — resolves and creates the persistent profile directory.
- `context.ts` — lazily launches the shared `BrowserContext` and memoizes it
  so repeated calls reuse the same Chromium instance; `closeContext()` tears
  it down.
- `chromium.ts` — `openTarget(url)` opens a new tab in the shared context
  and navigates to `url`.

Set `HERMES_HEADLESS=true` to run headless (used by the test suite).
Run `npx playwright install chromium` once to fetch the browser binary.

### Space isolation

Every Space shares the one Chromium context above — isolation here is about
tab *ownership*, not process isolation: a Space can only see, list, or close
the pages it opened.

- `space.ts` — the `Space` metadata shape (id, name, createdAt, active).
- `registry.ts` — `SpaceRegistry` creates/looks up/lists Spaces; `close(id)`
  tears down the Space's pages (via `isolation.ts`) before removing it.
- `isolation.ts` — `SpaceIsolation` opens pages tagged with a `spaceId` and
  enforces the guard: `list`/`close`/`closeAll` only ever act on pages owned
  by the requesting Space, so one Space can't inspect or close another's
  tabs (or the human's, which own no Space).

This is wired into the WebSocket protocol (`space.create`, `space.close`,
`browser.open`, `browser.list`, `browser.close`), each scoped by
`payload.spaceId`; `browser.open`/`browser.list` reject an unknown
`spaceId` with an `error` message.

### WebSocket protocol + agent skill wiring

`npm run dev:electron` (part of `npm run dev`) now starts both the shared
Chromium context and the protocol server, listening on
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
│   └── install.sh
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
npm install
npm run dev
```

## Contributing

See CONTRIBUTING.md.

## License

MIT — see LICENSE.
