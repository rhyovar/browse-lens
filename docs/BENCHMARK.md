# Benchmark harness

Reproducible comparisons of BrowseLens against two other agent browser
tools — `agent-browser` and `browser-use` — on a small fixed task corpus.
Every task ends in an explicit, code-level pass/fail check. No LLM judge.

## Run it

```bash
HERMES_HEADLESS=true npm run dev:electron   # in one terminal
npm run benchmark                            # in another
```

`HERMES_HEADLESS=true` is recommended: it removes window-rendering time
from the numbers and matches how a benchmark should actually run (fast,
no display required). Exit code is `0` if every non-skipped task passed,
`1` if any failed.

## The task corpus

All four tasks run against one local, static HTML fixture served by the
benchmark script itself (`scripts/benchmark.mjs`'s `startFixtureServer`) —
not a live external site — so results don't depend on network conditions
or a third party changing their page.

| Task | What it does | Pass condition |
|---|---|---|
| `open-url` | Navigate to the fixture, read the title | Title exactly matches the fixture's `<title>` |
| `click-selector` | Click a known button | A page snapshot afterward contains the text the click's `onclick` handler produces |
| `fill-form-field` | Fill a known input | A page snapshot afterward contains the value that was filled |
| `scrape-table-cell` | Read a known table cell | A page snapshot contains that cell's known text |

## Two methodologies, by design

BrowseLens and `agent-browser` are given the **exact same fixed steps** —
click this selector, fill that field — with no decision-making involved.
`browser-use` is given the task's **goal in plain English** instead, and
its own LLM decides what actions to take. This is intentional, not a gap:

- **Fixed-step (BrowseLens, agent-browser)**: `task.script` (a `browser.run`
  snippet) and `task.agentBrowserSteps` (a sequence of CLI calls) both
  perform the identical, predetermined sequence of actions. This isolates
  *execution* — how fast and reliably each tool can carry out a known
  sequence — from any question of *decision quality*.
- **Goal-driven (browser-use)**: `task.goal` (e.g. `"Click the button that
  says \"Click me\"."`) is handed to a `browser_use.Agent`, which plans and
  executes its own sequence of actions via its LLM. This measures whether
  the tool can figure out *and* perform the task from a natural-language
  description — a different, harder question than "can it click a known
  selector."

**These numbers are not directly comparable to each other as a speed
ranking.** A slower goal-driven run isn't necessarily worse — it's solving
a different problem (planning included). Report them side by side, not as
one leaderboard.

Regardless of methodology, every task ends the same way: read back some
observable page state (the title, or a text snapshot of the body) and run
it through the exact same `task.check(...)` predicate. The comparison is
fair in what "pass" means, even though *how* each tool gets there differs.

## The adapters

`{ id, description, script, agentBrowserSteps, goal, check }` per task in
`scripts/benchmark.mjs`. Each adapter is
`(task, fixtureUrl) => Promise<{ tool, task, status, elapsedMs, detail? }>`
with `status` one of `'pass' | 'fail' | 'skipped'`:

- **`browselens`** (`runBrowseLensTask`) — drives the real WebSocket
  protocol: creates a Space, opens the fixture, sends `task.script` via
  `browser.run`, times only that round-trip.
- **`agent-browser`** (`runAgentBrowserTask`) — shells out to
  `node_modules/.bin/agent-browser` (the
  [vercel-labs/agent-browser](https://agent-browser.dev) CLI, installed as
  a devDependency) with a fresh `--session` per task, running
  `task.agentBrowserSteps` (`open` → the task's CLI commands → `snapshot`/
  `get title` → `close`). Times only the steps between `open` finishing and
  the final read.
- **`browser-use`** (`runBrowserUseTask`) — shells out to
  `scripts/browser_use_task.py` via a dedicated venv at
  `.venv-browser-use/` (gitignored; see Setup below). The script starts a
  `browser_use.BrowserSession`, hands `task.goal` to a `browser_use.Agent`
  with whichever LLM has credentials configured, then reads back the same
  page state as the other adapters and prints it as JSON for the Node side
  to check.

## Setup for agent-browser and browser-use

**agent-browser** needs no extra setup — it's a `devDependency`
(`npm install` already fetches it) and manages its own Chromium download on
first use.

**browser-use** needs a Python venv (kept out of `node_modules`/npm
entirely since it's a different ecosystem) and an LLM API key:

```bash
python3 -m venv .venv-browser-use
./.venv-browser-use/bin/pip install browser-use
export ANTHROPIC_API_KEY=...   # or OPENAI_API_KEY, or GOOGLE_API_KEY/GEMINI_API_KEY
```

Without the venv, the benchmark reports `browser-use` as `skipped`
("no `.venv-browser-use` found"). With the venv but no API key, it still
reports `skipped`, but with a different reason ("no LLM credentials
configured") — `scripts/browser_use_task.py` checks for credentials before
touching the browser at all, so a missing key is a clean skip, not a hang
or a crash.

## A real reliability caveat, found while wiring this up

In this project's own sandbox, running `agent-browser`'s tasks *while
BrowseLens's own headless Chromium is also running* (i.e. the benchmark's
normal precondition — `npm run dev:electron` already up) produced
intermittent `CDP command timed out: Page.navigate` failures from
`agent-browser`. The same tasks passed cleanly, every time, when run
against `agent-browser` alone with no other Chromium process active. This
looks like resource contention between two concurrent headless Chromium
instances specific to that sandbox (both were using software rendering),
not a bug in either tool or in this benchmark's code — but it means
**`agent-browser` results here may be less stable than BrowseLens's** on
machines under similar constraints. If you see sporadic `agent-browser`
failures, try running `npm run benchmark` on a machine with more headroom,
or pass `--args "--disable-gpu"`-style flags to `agent-browser` (see its
`--help`) and see if that stabilizes it.

`browser-use`'s live LLM-driven path (`Agent.run()`) was not verified
end-to-end in this sandbox either — `browser_use.BrowserSession` itself
(independent of any LLM call) got stuck in a repeating
`WebSocket reconnection attempt` cycle that never progressed, reproducing
even with no LLM involved at all. The adapter code is written against
`browser-use`'s actual installed API (verified by reading its source, not
guessed from memory), and the "no credentials → skip" path is fully
tested, but the goal-driven path itself needs verification in an
environment where `browser-use` is known to work.

## Extending the corpus

Add a task to `TASKS` in `scripts/benchmark.mjs`: give it `script` (a
`browser.run` snippet), `agentBrowserSteps` (a function taking a `run(args)`
helper and returning the final readable result), `goal` (plain English for
`browser-use`), and `check` (a predicate over whatever those produce). All
three adapters pick it up automatically.
