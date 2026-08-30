# BrowseLens

BrowseLens is a Linux-native shared agent browser for Hermes (repo:
`hermes-agent-browser`).

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
9. **Hermes skill** — make `browse-lens` the easiest agent integration path.

All nine landed (see Progress below); each subsection further down notes
what it deliberately didn't build. That deferred work is the v2 backlog —
a draft, not yet prioritized or scoped, surfaced from gaps found across
this work rather than invented fresh:

1. ~~Agent CLI~~ — done, see Agent CLI subsection above.
2. ~~General allow/block domain list~~ — done, see Privacy mode subsection above.
3. New `tools.*` sandbox functions (Plugin system's fast-follow) — shipped
   one at a time, not batched, to prove the mechanism before committing to
   the rest. `waitForSelector()`, `scrapeTable()`, `extractJSON()`, and
   `monitorNetwork()` done (see Agent tool surface subsection above);
   `downloadFile()`, `injectScript()` still unbuilt.
4. New WS message types — `session.export`/`import`, `proxy.configure`,
   `auth.inject`, `HAR.export` (also from Plugin system's scoping).
5. Video/trace recording (Session recording's fast-follow).
6. Multi-page session replay (Session recording's known limitation).
7. Real `browser-use` benchmark numbers — the goal-driven adapter never
   completed a live run in this sandbox (see Benchmark harness).
8. `agent-browser` benchmark reliability — intermittent CDP timeouts when
   run concurrently with BrowseLens's own Chromium (see Benchmark
   harness); unclear yet if that's sandbox-specific.
9. Electron desktop shell / `ui/` — blocks full Linux packaging (see
   Linux stability / packaging).

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
- [x] Agent tool surface
- [x] Benchmark harness
- [x] Session recording/replay
- [x] Privacy mode (blocklist; general allow/block list still open)
- [x] Plugin system (script library; new sandbox tools / new WS messages deferred)
- [x] Hermes skill polish (frontmatter/structure; agent CLI still a gap, see below)
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
convenience. `skills/browse-lens/SKILL.md`'s Pitfalls section tells agents to
request it only when the task explicitly needs the human's own account.
`tests/unit/isolation.test.ts` proves both directions: a Space created with
`importProfile: true` sees a cookie set on the human's context; one without
it doesn't.

### Agent tool surface

The point of this project's protocol isn't "one WebSocket message per
click" — an agent should read the page, act, wait, and read again as **one
execution pass**, not a round-trip loop. `browser.run` does that: it sends
one JS snippet, which runs against a page with a `tools` object in scope
(`snapshot`, `click`, `fill`, `scroll`, `waitForLoad`, `url`, `title`,
`capture`, `waitForSelector`, `scrapeTable`, `extractJSON`, `monitorNetwork` — each maps to one Playwright
`Page` call; exact signatures in
[`skills/browse-lens/references/tool-reference.md`](skills/browse-lens/references/tool-reference.md)),
and gets back one structured result — the return value, any `console.log`
output, and whether it threw or timed out (10s default).

- `src/agent/tool-session.ts` — `runAgentScript(page, script, timeoutMs?)`
  builds the `tools` object bound to that page, wraps the script in an
  `async () => { ... }`, and runs it in a Node [`vm`](https://nodejs.org/api/vm.html)
  context exposing only `tools` and a log-capturing `console` (no
  `require`/`process`/`fs`).
- `src/space/isolation.ts` — `getPage(spaceId, pageId)` resolves a page only
  if it's owned by that Space (same guard as `close`), so `browser.run`
  can't reach into another Space's or the human's pages.

`waitForSelector(selector, timeoutMs?)` and `scrapeTable(selector)` are
the first two `tools.*` additions since launch (v2-backlog item 3),
shipped one at a time rather than batched, to prove the mechanism before
committing to the rest of the candidate list. `waitForSelector` replaces
hand-rolled polling loops in scripts — its default timeout (5s) is
deliberately under the script's own 10s timeout, so a real miss surfaces
Playwright's own clean `Timeout ...ms exceeded` error instead of the
sandbox's generic one; a dedicated test proves it actually *waits* for an
element added after a delay, not just a one-time check. `scrapeTable`
extracts `{ headers, rows }` from the first element matching a selector
(normally a `<table>`) using `HTMLTableElement.rows` — a header row is
detected only if every one of its cells is a `<th>`, so it handles plain,
`<thead>`/`<tbody>`, and header-less tables the same way. Both verified
live end-to-end, including through `examples/browselens-plugin-example`'s
new `waitAndScrapeTable` script (wait for a table to appear, then scrape
it, in one plugin call).

`extractJSON(selector)` is the third addition, picked over
`downloadFile()`/`monitorNetwork()`/`injectScript()` as the highest-leverage,
best-bounded remaining candidate — structured extraction with no
filesystem or network trust boundary to design. It parses the `textContent`
of the first element matching `selector` as JSON — e.g. a
`<script type="application/ld+json">` block or a framework's embedded
hydration state — and throws a clean, selector-naming error instead of a
raw `SyntaxError` when the text isn't valid JSON. `downloadFile()` and
`injectScript()` remain unbuilt.

Live testing surfaced a real gotcha, not just a fixture quirk: chaining
`waitForSelector` in front of `extractJSON` breaks on the most common
target, a `<script>` tag (JSON-LD, `__NEXT_DATA__`) — `waitForSelector`'s
default `state` is `'visible'`, and script elements are never visible, so
the wait times out even once the JSON is present. Documented in
`tool-reference.md`; the example plugin's `extractEmbeddedJSON` script
deliberately skips the wait rather than composing a broken combination.

`monitorNetwork(durationMs?)` is the fourth addition — chosen over
`downloadFile()`/`injectScript()` as bounded, read-only observation with
no filesystem or code-injection trust boundary to design, and a real gap
for benchmarking and debugging agent runs. It attaches a `page.on('response')`
listener for `durationMs` (default 3s), then detaches it and resolves with
one `{ url, method, status, type, timestamp }` entry per response seen —
only requests that complete with a response are recorded, so anything
aborted, policy-blocked, or still in flight when the window closes is
absent. It's designed to be called without awaiting immediately, so the
window is already open while a later `tools.click(...)` (or similar)
triggers the traffic being watched: `const events = tools.monitorNetwork(2000);
await tools.click(...); return await events;`. A dedicated test proves the
listener is actually detached after each call — a second `monitorNetwork`
window doesn't see requests only the first call's. `downloadFile()` and
`injectScript()` remain unbuilt.

**This is not a hardened sandbox.** Node's own docs say `vm` isn't a
security mechanism, and the protocol has no authentication — a `browser.run`
script has the same practical reach as the server process itself. It stops
accidental damage (typos, infinite loops, stray Node-global access — all
covered by tests in `tests/unit/tool-session.test.ts`), not a determined
attacker. `skills/browse-lens/SKILL.md`'s Pitfalls section tells agents to
treat scripts accordingly.

### WebSocket protocol + agent skill wiring

`npm run dev:electron` (part of `npm run dev`) now starts both the shared
Chromium browser and the protocol server, listening on
`ws://127.0.0.1:8765`.

- `protocol/messages.ts` — a `zod` discriminated union of every client
  message (`space.create`, `space.close`, `browser.open`, `browser.list`,
  `browser.close`, `browser.run`) with its payload shape; `parseClientMessage(raw)`
  parses and validates raw text, returning either the typed message or an
  error string.
- `protocol/ws-server.ts` — parses every incoming message through
  `parseClientMessage` before dispatch, so malformed JSON, an unknown
  message type, a missing field, or a bad `url`/`spaceId` all come back as
  `{ "type": "error", "payload": { "message": "..." } }` instead of
  crashing the connection or being silently ignored.

`skills/browse-lens/SKILL.md` documents the spaceId-scoped message shapes
for agents, with the full request/response reference in
[`skills/browse-lens/references/tool-reference.md`](skills/browse-lens/references/tool-reference.md).

### Benchmark harness

`npm run benchmark` (`scripts/benchmark.mjs`, methodology in
[docs/BENCHMARK.md](docs/BENCHMARK.md)) runs a small, fixed corpus of 4
tasks — open a URL, click a known selector, fill a form field, scrape a
table cell — against a local static fixture page, and checks each with an
explicit code-level pass/fail function. No LLM judge.

Two methodologies, deliberately:

- **BrowseLens** and **agent-browser** (the
  [vercel-labs CLI](https://agent-browser.dev), a devDependency) are given
  the exact same fixed steps for each task, over `browser.run` and the
  `agent-browser` CLI respectively — this measures execution, not
  decision-making.
- **browser-use** is given each task's goal in plain English and its own
  LLM decides the action sequence (via `scripts/browser_use_task.py`, a
  separate Python venv at `.venv-browser-use/` — setup in
  [docs/BENCHMARK.md](docs/BENCHMARK.md#setup-for-agent-browser-and-browser-use)).
  These numbers aren't a speed ranking against the other two — it's
  answering a different, harder question (can it figure out the goal at
  all), so the doc reports it side by side rather than on one leaderboard.

Both `agent-browser` and `browser-use` report `skipped` (not a fabricated
pass/fail) when their setup isn't present — no CLI binary, no venv, or (for
`browser-use`) no LLM API key configured. Two real reliability findings
from wiring this up, documented in
[docs/BENCHMARK.md](docs/BENCHMARK.md#a-real-reliability-caveat-found-while-wiring-this-up):
`agent-browser` showed intermittent CDP timeouts specifically when run
*concurrently* with BrowseLens's own headless Chromium in this sandbox
(passed reliably standalone), and `browser-use`'s own `BrowserSession`
never got past a repeating WebSocket-reconnect cycle here even with no LLM
involved — so its goal-driven path is implemented against its real API but
unverified end-to-end.

### Session recording, replay, and diff

`record: true` on `space.create` records every `browser.run` call in that
Space to a local `.transcripts/<spaceId>.jsonl` file — a header (the first
`browser.open`'s URL) followed by one line per call (script, result,
timing). Off by default; fully local, no new dependencies. Full schema and
the two workflows it enables in
[docs/RECORDING.md](docs/RECORDING.md):

- **Debugging a failure**: open the transcript, read top to bottom — exact
  scripts, in order, with what each one returned.
- **Comparing two runs**: `npm run replay -- <transcript.jsonl>` opens a
  fresh page at the transcript's `initialUrl` and re-sends every recorded
  script in order (no manual setup reconstruction), recording a new
  transcript as it goes. `npm run diff -- <a.jsonl> <b.jsonl>` then prints
  a per-call table (script match, result match, timing delta) and exits
  `1` if anything diverged — useful for the original-vs-replay case above,
  or for comparing two independently recorded sessions (e.g. two
  benchmark adapters, or before/after a code change).

Video/trace recording (wrapping Playwright's or `agent-browser`'s built-in
capture) is an intentionally deferred follow-up — this transcript format
covers the debugging and diffing use cases on its own.

### Privacy mode

`privacy: true` on `space.create` blocks ~30 known telemetry/tracking
domains (analytics, ads, session-replay, error monitoring). `space.create`
also takes general `allowlist`/`blocklist` arrays (v2-backlog item 2,
picked up right after the Agent CLI) — **default-allow**: `blocklist`
alone blocks just those domains, `allowlist` alone flips that Space to
allow-only-those, both together let `blocklist` win on a shared domain,
and `privacy: true` merges the built-in list into whatever `blocklist` is
also passed. All enforced by one `context.route()` handler in
[`src/browser/telemetry-blocklist.ts`](src/browser/telemetry-blocklist.ts)'s
`applyNetworkPolicy`, applied once when the context is first created (same
timing as `importProfile`). Full behavior, the default-allow-vs-default-deny
rationale, and the domain list: [docs/PRIVACY.md](docs/PRIVACY.md).

**A real bug found while testing this live**: opening a page to a
policy-blocked URL made `page.goto()` throw, and the `browser.open`
handler didn't catch it — an unhandled rejection that **crashed the
entire server process**, not just that one request. Every connected
client would've gone down from one blocked `open` call. Fixed by wrapping
that call in a try/catch and returning a normal top-level `error` instead;
verified the server now stays up and keeps serving other requests after a
blocked open.

### Plugin system

A plugin is a regular npm package packaging up named, ready-made
`browser.run` scripts ("login to Gmail," "scrape a product page") so an
agent can reference them by name instead of hand-writing the script every
time. `browser.run`'s payload can have `plugin: { package, name, params }`
instead of `script` — the server resolves it
(`resolveScript` in [`src/agent/plugins.ts`](src/agent/plugins.ts), via
Node's normal `import(packageName)`) into a script string and runs it
through the **exact same sandbox** as any hand-written script — a plugin
is data (a script template), not new server-side code execution, so there's
no new trust boundary.

This ships the "prebuilt script library" model only. Two bigger
extensions — new `tools.*` functions inside the sandbox, and whole new
WebSocket message types/server behaviors a plugin could add — were both
considered and explicitly deferred: they'd need real Node/server access,
a genuinely bigger trust boundary than today's sandboxed scripts, and
weren't needed to solve the problem in front of us. Full authoring guide,
the safe-param-interpolation rule (`JSON.stringify` everything — verified
with a value containing both `"` and `'` in live testing), and a working
template plugin in
[`examples/browselens-plugin-example`](examples/browselens-plugin-example)
are in [docs/PLUGINS.md](docs/PLUGINS.md).

### Hermes skill polish

`skills/browse-lens/SKILL.md` now matches the real Hermes skill
convention, checked against the actual validator and dozens of live
example skills on a machine that runs Hermes (not guessed from the
format alone): full frontmatter (`version`, `author`, `license`,
`platforms: [linux, macos]` — audited against what the repo's scripts
actually use (`install.sh` is bash, which rules out native Windows, but
runs fine on macOS — no genuinely Linux-only code found in `src/`), not
copied from the README's "Linux-native" branding; `metadata.hermes.{tags,
related_skills}`), a `description` cut from 226 chars to 53 (the
ecosystem norm is ≤60 — the skill picker truncates at 57), and the body
restructured into the standard section order (`When to Use` /
`Prerequisites` / `How to Run` / `Quick Reference` / `Procedure` /
`Pitfalls` / `Verification`).

The `How to Run` section's examples are the `browse-lens` CLI (below) —
every one of them was run against a live server and confirmed to work
verbatim, including exact quoting.

### Agent CLI (`browse-lens`)

The v2-backlog item this session picked up right after skill polish: a
real CLI so an agent invokes `npx browse-lens open <url>` through
`terminal` instead of hand-building WebSocket JSON. `cli.mjs` at the repo
root, wired as this package's `bin` (`package.json`'s
`"bin": { "browse-lens": "./cli.mjs" }`) — one subcommand per WebSocket
message (`create`, `open`, `run`, `list`, `close`), full command reference
and exit-code semantics in [docs/CLI.md](docs/CLI.md).

Two real bugs found and fixed while building this, both the kind that
only show up under actual use, not code review:

1. The first version connected to the WebSocket server *before* validating
   the command/arguments — so a plain usage mistake (missing an argument,
   a typo'd subcommand) reported "connection refused" instead of a usage
   message, even with the server running fine. Fixed by validating and
   building the message first, only connecting once there's something
   valid to send.
2. The `import.meta.url === file://${process.argv[1]}` entrypoint guard
   (the same pattern used elsewhere in this repo to let a script be both
   importable and runnable) silently failed under `npx`'s `bin` symlink —
   `npx browse-lens` produced no output at all, because the two paths
   didn't match through the symlink. Fixed by resolving both sides through
   `fs.realpathSync` before comparing. Verified all three invocation
   styles (`node cli.mjs`, `./cli.mjs`, `npx browse-lens`) work identically
   after the fix.

`buildMessage(command, args)` — the pure argv-to-message parsing logic —
is exported and unit-tested directly (`tests/unit/cli.test.ts`, 11 tests)
independent of any live connection; the full command set was also
exercised live end-to-end (happy path, a script failure via `ok: false`,
an unknown `spaceId`, and connection-refused) against a real server.

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
`skills/browse-lens` requirement previously and incorrectly said `>=24.14`
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
├── cli.mjs
├── src/
│   ├── main/
│   │   ├── index.ts
│   │   └── electron.ts
│   ├── browser/
│   │   ├── chromium.ts
│   │   ├── profile.ts
│   │   ├── context.ts
│   │   └── telemetry-blocklist.ts
│   ├── space/
│   │   ├── space.ts
│   │   ├── registry.ts
│   │   └── isolation.ts
│   ├── agent/
│   │   ├── tool-session.ts
│   │   ├── recorder.ts
│   │   ├── plugins.ts
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
│   ├── manual-validate.mjs
│   ├── benchmark.mjs
│   ├── browser_use_task.py
│   ├── replay.mjs
│   └── diff.mjs
├── examples/
│   └── browselens-plugin-example/
│       ├── package.json
│       └── index.js
├── docs/
│   ├── MANUAL_VALIDATION.md
│   ├── BENCHMARK.md
│   ├── RECORDING.md
│   ├── PRIVACY.md
│   ├── PLUGINS.md
│   ├── CLI.md
│   └── ELECTRON.md
├── skills/
│   └── browse-lens/
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

Three setups, depending on what you need. All three start from the same
clone + install step; each adds on top of the previous one.

### 1. Minimal runtime

Just the protocol server and shared Chromium — enough for an agent to
create Spaces and drive pages. No UI, no test tooling.

```bash
git clone https://github.com/rhyovar/hermes-agent-browser.git
cd hermes-agent-browser
./scripts/install.sh   # npm install + fetch Playwright's Chromium build
npm run dev:electron   # launches the shared Chromium + ws://127.0.0.1:8765
```

What you get: one Chromium process, a blank window for the human, and the
WebSocket server accepting `space.create`/`space.list`/`browser.open`/`browser.run`/etc.
(full reference: [skills/browse-lens/references/tool-reference.md](skills/browse-lens/references/tool-reference.md)).
Every Space starts with an empty cookie jar. Nothing else is running.

### 2. With Chrome profile import

The minimal runtime, plus a one-time manual step so a Space can inherit the
human's real logins via `importProfile: true` (see
[Chrome profile import](#chrome-profile-import) above).

```bash
./scripts/install.sh
npm run dev:electron
# in the Chromium window that opens: log into whatever sites a Space
# should be able to reach, then Ctrl+C in the terminal to stop —
# this saves cookies/localStorage to ~/.hermes-agent-browser/human.storage-state.json
npm run dev:electron   # relaunch; the human context reloads that saved session
```

What you get: everything from the minimal runtime, plus a human session
persisted to disk. Any Space created with `importProfile: true` snapshots
it into its own context the first time it opens a page. Skipping the manual
login step isn't an error — `importProfile: true` on an empty session just
seeds an empty one.

### 3. Full dev setup

For working on `hermes-agent-browser` itself: the Electron app with its
dark-themed UI, the protocol server, and the test tooling.

```bash
./scripts/install.sh
npm run dev        # Electron app + Vite dev server
npm test           # vitest; set HERMES_HEADLESS=true to run with no display
npm run validate   # docs/MANUAL_VALIDATION.md's interactive CLI (needs dev:electron running)
npm run benchmark  # docs/BENCHMARK.md's task corpus (also needs dev:electron running)
```

What you get: everything from the minimal runtime, plus the Electron
desktop shell loading `ui/index.html` (a dark-themed WebSocket client
for managing Spaces and browsing pages). `npm run dev:ui` still runs the
Vite dev server for future UI work, but the Electron window loads the UI
directly from disk today. `npm run dev` runs both side by side via
`concurrently`. `npm run lint` is in `package.json` but currently broken
on this ESLint version (missing `eslint.config.js`) — pre-existing, not
something this setup fixes.

### 4. Packaged install (no build needed)

Download a pre-built package from
[GitHub Releases](https://github.com/rhyovar/hermes-agent-browser/releases)
and skip the source build entirely.

- **AppImage**: download `BrowseLens-0.1.0.AppImage`, make it executable,
  and run it:
  ```bash
  chmod +x BrowseLens-0.1.0.AppImage
  ./BrowseLens-0.1.0.AppImage
  ```
- **deb**: download `hermes-agent-browser_0.1.0_amd64.deb` and install it:
  ```bash
  sudo dpkg -i hermes-agent-browser_0.1.0_amd64.deb
  ```

Both packages bundle the Chromium runtime and protocol server; no Node.js
or `npm install` is required on the target machine. To build these
packages locally instead of downloading them:

```bash
npm install
npm run dist   # produces AppImage + deb in release/
```

Full packaging walkthrough: [docs/ELECTRON.md](docs/ELECTRON.md).

## Contributing

See CONTRIBUTING.md.

## License

MIT — see LICENSE.
