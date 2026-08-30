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

## error

Sent instead of the normal response whenever a message fails to parse,
doesn't match one of the shapes above, or names an unknown `spaceId`:
```json
{ "type": "error", "payload": { "message": "..." } }
```
