# Protocol reference

WebSocket endpoint: `ws://127.0.0.1:8765`. Every message is JSON:
`{ "type": "<type>", "payload": { ... } }`. The schemas below (enforced by
`src/protocol/messages.ts`) are the source of truth — this file describes
the same shapes.

## space.create

Request:
```json
{ "type": "space.create", "payload": { "name": "freelance-scan" } }
```
`name` is optional (defaults to `"untitled"`).

Response: `space.created` with the new `Space`:
```json
{ "type": "space.created", "payload": { "id": "...", "name": "freelance-scan", "createdAt": 0, "active": true } }
```

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
