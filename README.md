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
- [ ] Space isolation
- [ ] WebSocket protocol
- [ ] Agent skill wiring
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
