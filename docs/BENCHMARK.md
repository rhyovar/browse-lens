# Benchmark harness

Reproducible, deterministic comparisons of BrowseLens against other agent
browser tools (`browser-use`, `agent-browser`), on a small fixed task
corpus. No LLM judge — every task has an explicit, code-level pass/fail
check. This is intentionally small (4 tasks) and BrowseLens-only for now;
expand the task list and wire in real adapters once these baseline numbers
are useful.

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

Each task is `{ id, description, script, check }`: `script` is the exact
JS sent to `browser.run`, and `check` is a plain JS function over the
returned `result` — no fuzzy matching, no model in the loop.

## What's measured

For BrowseLens, each task times only the `browser.run` round-trip (send
the script, get the result) — not Space creation or page navigation, which
are one-time per-task setup, not the thing being benchmarked. The adapter
in `scripts/benchmark.mjs` (`runBrowseLensTask`) shows exactly where the
clock starts and stops.

## Why browser-use and agent-browser show "skipped"

Neither tool is wired up yet:

- **browser-use**: not installed in this environment. The script detects
  whether it's importable (`python3 -c "import browser_use"`) and reports
  accordingly, but there's no adapter implementation yet — `browser-use`
  is fundamentally an LLM-driven agent (it decides actions itself), so a
  fair adapter needs a design decision on how to make it execute this
  benchmark's *specific, predetermined* steps rather than deciding its own
  approach, which would undermine the "deterministic" comparison.
- **agent-browser**: the name doesn't unambiguously identify one npm/pip
  package. Needs that clarified before an adapter can be written.

Both report `status: 'skipped'` with a reason instead of a fabricated
pass/fail — a real benchmark shouldn't invent numbers for tools it never
actually ran.

## Adding a real adapter

An adapter is a function `(task, fixtureUrl) => Promise<{ tool, task, status, elapsedMs, detail? }>`
where `status` is `'pass' | 'fail' | 'skipped'`. Add one to the `ADAPTERS`
array in `scripts/benchmark.mjs`, drive the target tool through whatever
its actual API is, run `task.script`'s logic in that tool's terms (or the
closest equivalent — e.g. its own click/fill/read primitives), and pass
the result through `task.check(...)` yourself to decide pass/fail.
