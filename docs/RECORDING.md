# Session recording, replay, and diff

Records a Space's `browser.run` calls to a local JSONL transcript, replays
one against a fresh page, and diffs two transcripts. Fully local and
self-contained — no external services, no new runtime dependencies.

## Record

Pass `record: true` on `space.create`:

```json
{ "type": "space.create", "payload": { "name": "checkout-flow", "record": true } }
```

Off by default. When on, `src/agent/recorder.ts` writes
`.transcripts/<spaceId>.jsonl` (the directory is created if needed,
gitignored — it's session data, not source):

- **Header line**, written on the Space's first `browser.open` (not at
  `space.create` — the URL isn't known yet):
  ```json
  { "sessionId": "...", "spaceId": "...", "startedAt": 1234, "importProfile": false, "initialUrl": "https://..." }
  ```
  A second `browser.open` in the same Space doesn't get its own header
  line — `initialUrl` is whatever the *first* one was. Recording assumes
  one page per session; see Limitations below.
- **One line per `browser.run` call**, in order:
  ```json
  { "seq": 0, "timestamp": 1234, "pageId": "...", "script": "...", "elapsedMs": 12, "result": { "ok": true, "result": "...", "logs": [] } }
  ```
  `elapsedMs` times the script's actual execution (`runAgentScript` in
  `src/agent/tool-session.ts`), not network round-trip. `result` is
  whatever `browser.ran`'s payload was (see
  [tool-reference.md](../skills/browse-lens/references/tool-reference.md#browserrun--the-agent-tool-surface)) —
  `ok`/`result`/`logs` on success, `ok`/`error`/`logs` on failure.

This is the debugging use case: open the file, read top to bottom, see
exactly what ran and what came back, in order.

## Replay

```bash
npm run replay -- .transcripts/<sessionId>.jsonl
```

Requires `npm run dev:electron` running (same precondition as `validate`
and `benchmark`). Opens a fresh page at the transcript's `initialUrl`, then
re-sends each recorded `script` via `browser.run`, in `seq` order — nothing
richer (no network mocking, no DOM snapshot restore). This is "replay
without rebuilding state": the transcript's `initialUrl` + scripts are all
that's needed, no manual setup.

The replay itself records with `record: true`, so it produces a *new*
transcript. `npm run replay` prints that new file's path at the end and
suggests the `diff` command to compare them. Replay does no diffing
itself — recording the new run and comparing are separate steps.

## Diff

```bash
npm run diff -- <a.jsonl> <b.jsonl>
```

Matches entries by `seq` and prints a plain-text table: does the `script`
match, does the `result` match (exact JSON equality), and the timing delta
(`B - A`, in ms). Exit code `0` if every entry matches on script and
result, `1` if anything diverged (or either transcript has an entry the
other doesn't). This is the benchmark-diffing use case: compare two runs
of the same task — different adapters, different versions, original vs.
replay — and see exactly where they diverge.

```
seq  script  result   timing (B-A)
---  ------  -------  ------------
0    same    same     -3ms
1    same    DIFFERS  +140ms

DIVERGED
```

## Limitations (by design, for now)

- **One page per session.** A transcript's header has one `initialUrl`; if
  a recorded Space opened multiple pages, only the first is captured as
  the replay starting point, and every entry's `pageId` is recorded but
  not distinguished during replay (all scripts replay against the single
  fresh page). Multi-page sessions weren't part of this round's scope.
- **No video/trace layer yet.** This is a script-and-result transcript,
  not a recording of pixels or DOM mutations. A video/trace layer (e.g.
  wrapping Playwright's or `agent-browser`'s built-in recording) is a
  planned follow-up, as an opt-in per-Space setting alongside `record` —
  not required for the debugging or benchmark-diffing use cases above.
- **Diff is exact-match only.** `result` equality is `JSON.stringify`
  comparison — no fuzzy/semantic diffing. A script returning
  semantically-equivalent but not byte-identical data (a different key
  insertion order in a returned object, an embedded timestamp, a
  different-but-equally-valid snapshot string) will show as `DIFFERS`
  even though nothing is actually wrong.
