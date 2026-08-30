# Agent CLI (`browse-lens`)

A thin CLI over the WebSocket protocol — one subcommand per message, so an
agent (or a human) doesn't have to hand-build JSON. It's not a new
capability: every subcommand sends exactly the message documented in
[tool-reference.md](../skills/browse-lens/references/tool-reference.md)
and prints the raw response.

## Install / invoke

No separate install step — it's this repo's own `bin` entry
(`package.json`'s `"bin": { "browse-lens": "./cli.mjs" }`). From the repo
root:

```bash
npx browse-lens <command> [args...]
```

(`node cli.mjs <command>` and `./cli.mjs <command>` work identically.)

Requires the protocol server running first:
`HERMES_HEADLESS=true npm run dev:electron`.

## Commands

| Command | Sends | Notes |
|---|---|---|
| `create <name> [--import] [--record] [--privacy] [--allow <domains>] [--block <domains>]` | `space.create` | flags map to `importProfile`/`record`/`privacy`/`allowlist`/`blocklist`, all off/empty by default; `<domains>` is comma-separated |
| `open <spaceId> <url>` | `browser.open` | |
| `run <spaceId> <pageId> <script...>` | `browser.run` | everything after `<pageId>` is joined with spaces as the script |
| `run <spaceId> <pageId> --plugin <package> --script-name <name> [--params <json>]` | `browser.run` (plugin form) | `--params` is a JSON string, parsed before sending |
| `list <spaceId>` | `browser.list` | |
| `close <spaceId>` | `space.close` | no `pageId` given |
| `close <spaceId> <pageId>` | `browser.close` | `pageId` given |

`--help`/`-h` (or no command) prints usage.

## Output and exit codes

Every successful command prints the full `{ type, payload }` response as
pretty-printed JSON to stdout. Exit code is `0` unless:

- **A protocol-level `error`** (unknown `spaceId`/`pageId`, or a malformed
  plugin reference) — the message is printed to stderr, exit `1`. Nothing
  is printed to stdout in this case.
- **`browser.ran` with `ok: false`** (the script threw or timed out) — the
  full response (including the `error` field) still prints to stdout, but
  the CLI exits `1` so a caller scripting against it can tell success from
  failure without parsing the JSON.
- **Connection refused** — printed to stderr with a hint to start the app,
  exit `1`. This check happens *before* argument validation is bypassed:
  a bad command or missing argument is reported immediately, without ever
  attempting to connect (fixed after an initial version got this backward
  and reported "connection refused" for a simple usage mistake).
- **Usage errors** (missing/invalid arguments, unknown command) — printed
  to stderr with a `usage:` line, exit `1`, no connection attempted.
- **`open` against a URL the Space's own network policy blocks**
  (`--privacy`/`--allow`/`--block`, see [PRIVACY.md](PRIVACY.md)) —
  reported as a normal protocol-level `error`, exit `1`. This used to crash
  the whole server (an unhandled rejection from the underlying
  `page.goto()` failure) until fixed while testing the allow/block list
  live — worth knowing since it means an older build could take down every
  connected client from one blocked `open` call.

## Example session

```bash
npx browse-lens create task
# → space.created, note payload.id as SPACE

npx browse-lens open $SPACE https://example.com
# → browser.opened, note payload.id as PAGE

npx browse-lens run $SPACE $PAGE "return await tools.title();"
# → browser.ran, payload.result: "Example Domain"

npx browse-lens close $SPACE
# → space.closed, payload.closed: true
```

## Implementation

`cli.mjs` at the repo root. `buildMessage(command, args)` is a pure
function (parses argv into `{ type, payload }` or `{ usageError }`) —
exported and covered directly in `tests/unit/cli.test.ts`, independent of
any live connection. The file is both an importable module and a runnable
script; running it directly is guarded by comparing `process.argv[1]`'s
real path against the module's own (needed because `npx`'s `bin` symlink
makes a naive `import.meta.url` string comparison fail — verified by
testing all three invocation styles: `node cli.mjs`, `./cli.mjs`, and
`npx browse-lens`).
