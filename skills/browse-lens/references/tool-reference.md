# BrowseLens protocol reference

WebSocket endpoint: `ws://127.0.0.1:8765`. Every message is JSON:
`{ "type": "<type>", "payload": { ... } }`. The schemas below (enforced by
`src/protocol/messages.ts`) are the source of truth — this file describes
the same shapes. For actually driving the protocol, use the
[`browse-lens` CLI](../../../docs/CLI.md) (`npx browse-lens <command>`)
rather than hand-building these messages — one subcommand per message
below, same payloads, printed as JSON. This reference is what the CLI
wraps.

## space.create

Request:
```json
{ "type": "space.create", "payload": { "name": "freelance-scan", "importProfile": false, "record": false, "privacy": false, "allowlist": [], "blocklist": [] } }
```
`name` is optional (defaults to `"untitled"`). `importProfile`, `record`,
and `privacy` are optional booleans defaulting to `false`; `allowlist` and
`blocklist` are optional string arrays defaulting to `[]` — see "Chrome
profile import", "Session recording", and "Privacy mode" below.

Response: `space.created` with the new `Space`:
```json
{ "type": "space.created", "payload": { "id": "...", "name": "freelance-scan", "createdAt": 0, "active": true, "importProfile": false, "record": false, "privacy": false, "allowlist": [], "blocklist": [] } }
```

### Chrome profile import

`importProfile: true` seeds the Space's cookie jar/localStorage with a
one-time snapshot of the human's current session, taken when the Space's
first page is opened (`browser.open`) — not at `space.create` time, and not
a live link (later changes on either side don't sync). Everything else
about the Space works the same; this only changes what its first
`BrowserContext` starts with. See the Pitfalls section in
[../SKILL.md](../SKILL.md) before requesting it.

### Session recording

`record: true` records every `browser.run` call in this Space to
`.transcripts/<spaceId>.jsonl` — a header line (written on the first
`browser.open`) followed by one JSON line per call (script, result,
timing), in order. See [../../docs/RECORDING.md](../../docs/RECORDING.md)
for the schema and for `npm run replay`/`npm run diff`.

### Privacy mode

`privacy: true` blocks ~30 known telemetry/tracking domains (analytics,
ads, session-replay, error monitoring). `allowlist`/`blocklist` add a
general, agent-supplied domain policy on top: **default-allow** —
`blocklist` alone blocks just those domains; `allowlist` alone flips that
Space to allow-only-those-domains; both together let `blocklist` win over
`allowlist` on a shared domain; `privacy: true` merges the built-in list
into whatever `blocklist` you also pass. All applied once when the
context is first created. Full behavior, the default-allow rationale, and
the domain list in [../../docs/PRIVACY.md](../../docs/PRIVACY.md).

Opening a page blocked by the Space's own policy comes back as a normal
top-level `error` (not a crash) — see `browser.open` below.

## space.close

Request:
```json
{ "type": "space.close", "payload": { "spaceId": "..." } }
```
Closes every page the Space owns, then removes it.

Response:
```json
{ "type": "space.closed", "payload": { "spaceId": "...", "closed": true } }
```
`closed` is `false` if `spaceId` doesn't exist.

## browser.open

Request:
```json
{ "type": "browser.open", "payload": { "spaceId": "...", "url": "https://example.com" } }
```

Response: `browser.opened` with the new page, owned by `spaceId`:
```json
{ "type": "browser.opened", "payload": { "id": "...", "spaceId": "...", "url": "https://example.com/" } }
```

Rejected with an `error` message if `spaceId` doesn't exist, or if the
Space's own `privacy`/`allowlist`/`blocklist` policy blocks the URL
(navigation fails cleanly rather than crashing the connection).

## browser.list

Request:
```json
{ "type": "browser.list", "payload": { "spaceId": "..." } }
```

Response: only the pages owned by `spaceId` — never another Space's tabs:
```json
{ "type": "browser.list", "payload": [{ "id": "...", "spaceId": "...", "url": "..." }] }
```

Rejected with an `error` message if `spaceId` doesn't exist.

## browser.close

Request:
```json
{ "type": "browser.close", "payload": { "spaceId": "...", "pageId": "..." } }
```

Response:
```json
{ "type": "browser.closed", "payload": { "pageId": "...", "closed": true } }
```
`closed` is `false` if `pageId` doesn't exist or belongs to a different
Space — a Space can never close another Space's tab this way.

## browser.run — the agent tool surface

Runs one JS snippet against a page in a single pass — compose a whole
workflow (read the page, act on it, wait, read again) as one script instead
of one WebSocket message per step. The snippet body becomes the body of an
`async () => { ... }` function, so top-level `await` and `return <value>`
both work.

Request:
```json
{ "type": "browser.run", "payload": { "spaceId": "...", "pageId": "...", "script": "await tools.fill('#q', 'hermes'); await tools.click('#submit'); await tools.waitForLoad(); return await tools.snapshot();" } }
```

Response:
```json
{ "type": "browser.ran", "payload": { "pageId": "...", "ok": true, "result": "<value your script returned>", "logs": ["<console.log lines>"] } }
```
On a thrown error or a timeout (10s default), `ok` is `false` and `error`
holds the message instead of `result`:
```json
{ "type": "browser.ran", "payload": { "pageId": "...", "ok": false, "error": "...", "logs": [] } }
```
Rejected with a top-level `error` message (not `browser.ran`) if `spaceId`/`pageId` doesn't resolve to a page owned by that Space.

### Running a named plugin script instead

`payload` may have `plugin` instead of `script` (exactly one of the two —
both or neither is rejected):

```json
{ "type": "browser.run", "payload": { "spaceId": "...", "pageId": "...", "plugin": { "package": "browselens-plugin-example", "name": "readTitle", "params": {} } } }
```

The server resolves `plugin.package`'s named script (an installed npm
package) with `plugin.params`, then runs the resulting text exactly like
`script` — same sandbox, same response shape. A resolution failure
(unknown package or script name) comes back as a top-level `error`, before
anything runs. See [../../docs/PLUGINS.md](../../docs/PLUGINS.md) for
authoring one.

### Tools available inside the script

| Function | Signature | Returns | Maps to |
|---|---|---|---|
| `snapshot` | `snapshot(): Promise<string>` | An AI-readable text tree of the page's accessibility structure (roles, names, nesting) | `page.locator('body').ariaSnapshot({ mode: 'ai' })` |
| `click` | `click(selector: string): Promise<void>` | — | `page.click(selector)` |
| `fill` | `fill(selector: string, text: string): Promise<void>` | — | `page.fill(selector, text)` |
| `scroll` | `scroll(deltaX: number, deltaY: number): Promise<void>` | — | `page.mouse.wheel(deltaX, deltaY)` |
| `waitForLoad` | `waitForLoad(): Promise<void>` | Resolves once the page reaches network-idle | `page.waitForLoadState('networkidle')` |
| `url` | `url(): string` | The page's current URL (not a Promise, but safe to `await`) | `page.url()` |
| `title` | `title(): Promise<string>` | The page's `<title>` | `page.title()` |
| `capture` | `capture(): Promise<string>` | A base64-encoded PNG screenshot | `page.screenshot()` |
| `waitForSelector` | `waitForSelector(selector: string, timeoutMs?: number): Promise<void>` | Resolves once `selector` appears; default timeout 5000ms | `page.waitForSelector(selector, { timeout: timeoutMs })` |
| `scrapeTable` | `scrapeTable(selector: string): Promise<{ headers: string[]; rows: string[][] }>` | Structured extraction from the first element matching `selector` (normally a `<table>`) — see below | `page.locator(selector).first().evaluate(...)` |
| `extractJSON` | `extractJSON(selector: string): Promise<unknown>` | Parses the text content of the first element matching `selector` as JSON — see below | `page.locator(selector).first().evaluate(...)` |

`console.log(...)` inside the script is captured into the response's `logs`
array (joined per call) instead of printing anywhere — use it for
mid-workflow debugging without a second round-trip.

**`waitForSelector`**: replaces hand-rolled polling loops in scripts — a
timeout under the default 10s script timeout (see below) so a real miss
surfaces Playwright's own clean `Timeout ...ms exceeded` error, not the
sandbox's generic "script timed out" message. Pass a smaller `timeoutMs`
for a tighter check, or a larger one only if you also raise the
`browser.run` script timeout.

**`scrapeTable`**: header detection is a single rule — the table's first
row counts as a header only if *every* cell in it is a `<th>`; otherwise
`headers` is `[]` and every row (including that first one) is a data row.
Uses `HTMLTableElement.rows`, which covers plain tables, `<thead>`/`<tbody>`
tables, and header-less tables uniformly, so it doesn't matter which
structure the page uses.

**`extractJSON`**: matches a page's embedded structured data — a
`<script type="application/ld+json">` block, a framework's hydration state
(e.g. `<script id="__NEXT_DATA__">`), or any element whose text is JSON.
Parses the *first* matching element's `textContent`; if it isn't valid
JSON, throws a clean error naming the selector instead of a raw
`SyntaxError`. It does not search descendants for a nested JSON blob or
fetch anything over the network — the selector must already point at the
element holding the JSON text.

### What the sandbox does and doesn't guarantee

The script runs in a Node [`vm`](https://nodejs.org/api/vm.html) context
exposing only `tools` and `console` — no `require`, `process`, or `fs` in
scope. This catches accidental mistakes (typos, runaway loops via the
timeout) in a trusted agent's own script. **It is not a hardened security
sandbox** — Node's own docs say `vm` should not be used to run untrusted
code — and the WebSocket protocol has no authentication of its own. Don't
point `browser.run` at scripts from a source you don't already trust.
