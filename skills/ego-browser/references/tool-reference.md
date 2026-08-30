# Protocol reference

WebSocket endpoint: `ws://127.0.0.1:8765`. Every message is JSON:
`{ "type": "<type>", "payload": { ... } }`. The schemas below (enforced by
`src/protocol/messages.ts`) are the source of truth — this file describes
the same shapes.

## space.create

Request:
```json
{ "type": "space.create", "payload": { "name": "freelance-scan", "importProfile": false } }
```
`name` is optional (defaults to `"untitled"`). `importProfile` is optional
(defaults to `false`) — see "Chrome profile import" below.

Response: `space.created` with the new `Space`:
```json
{ "type": "space.created", "payload": { "id": "...", "name": "freelance-scan", "createdAt": 0, "active": true, "importProfile": false } }
```

### Chrome profile import

`importProfile: true` seeds the Space's cookie jar/localStorage with a
one-time snapshot of the human's current session, taken when the Space's
first page is opened (`browser.open`) — not at `space.create` time, and not
a live link (later changes on either side don't sync). Everything else
about the Space works the same; this only changes what its first
`BrowserContext` starts with. See the Safety section in
[../SKILL.md](../SKILL.md) before requesting it.

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

Rejected with an `error` message if `spaceId` doesn't exist.

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

`console.log(...)` inside the script is captured into the response's `logs`
array (joined per call) instead of printing anywhere — use it for
mid-workflow debugging without a second round-trip.

### What the sandbox does and doesn't guarantee

The script runs in a Node [`vm`](https://nodejs.org/api/vm.html) context
exposing only `tools` and `console` — no `require`, `process`, or `fs` in
scope. This catches accidental mistakes (typos, runaway loops via the
timeout) in a trusted agent's own script. **It is not a hardened security
sandbox** — Node's own docs say `vm` should not be used to run untrusted
code — and the WebSocket protocol has no authentication of its own. Don't
point `browser.run` at scripts from a source you don't already trust.
