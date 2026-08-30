# Privacy mode

`privacy: true` on `space.create` blocks known telemetry/tracking domains
in that Space's `BrowserContext`. Off by default. This is a hardcoded
blocklist — a general per-Space allow/block domain list (agent-supplied)
is a deliberate fast-follow, not built yet (see Roadmap below).

## Use it

```json
{ "type": "space.create", "payload": { "name": "research", "privacy": true } }
```

Applied once, when the Space's `BrowserContext` is first created (same
timing as `importProfile`) — via
[`src/browser/telemetry-blocklist.ts`](../src/browser/telemetry-blocklist.ts)'s
`blockTelemetry(context)`, which registers a `context.route('**/*', ...)`
handler that aborts any request whose hostname matches (or is a subdomain
of) an entry in `TELEMETRY_DOMAINS`, and lets everything else through
unchanged.

## The blocklist

~30 domains, grouped by category. This is the full, auditable list —
nothing else is blocked:

**Analytics** — `google-analytics.com`, `googletagmanager.com`,
`segment.io`, `segment.com`, `mixpanel.com`, `amplitude.com`,
`matomo.cloud`, `plausible.io`, `scorecardresearch.com`, `quantserve.com`

**Advertising** — `doubleclick.net`, `googlesyndication.com`,
`googleadservices.com`, `adservice.google.com`, `amazon-adsystem.com`,
`ads-twitter.com`, `criteo.com`, `outbrain.com`, `taboola.com`

**Session replay / heatmaps** — `hotjar.com`, `fullstory.com`,
`clarity.ms`, `mouseflow.com`, `luckyorange.com`

**Social pixels** — `connect.facebook.net`, `ads.linkedin.com`,
`analytics.tiktok.com`, `tr.snapchat.com`

**Error / performance monitoring** — `sentry.io`, `bugsnag.com`,
`newrelic.com`, `datadoghq.com`

A domain and all its subdomains are blocked (`google-analytics.com` also
blocks `www.google-analytics.com`, `ssl.google-analytics.com`, etc.) — see
`isTelemetryHost` in `telemetry-blocklist.ts` for the exact match logic.

## What's deliberately excluded

Chat/support widgets (Intercom, Zendesk, Drift, etc.) are **not** on this
list. They can be part of a legitimate task (an agent testing a chat
integration, or one whose job requires triggering a support flow) — that's
product functionality the agent might need, not telemetry silently
phoning home. This list targets pure tracking/analytics/monitoring
infrastructure only.

## Why the blocklist ships before a general allow/block list

A general per-Space allow/block domain list is a bigger design call —
default-allow vs. default-deny changes the Space's entire security model,
and that shouldn't be decided without real usage data. The blocklist
above is a bounded, low-risk, immediately useful piece: a fixed list of
~30 known trackers with an obvious answer (block them), landed first to
prove the `context.route()` wiring in production. The general allowlist/
blocklist is the planned next step once that's proven out — tracked as
its own item, not scoped here.

## Testing

`tests/unit/telemetry-blocklist.test.ts`: pure-function coverage of
`isTelemetryHost` (matches domains and subdomains, doesn't match
unrelated or look-alike domains), plus two browser-integration tests —
one confirms a request to a known telemetry domain gets aborted when
`privacy: true` (via `context.route()`, so it's deterministic regardless
of whether that domain is actually reachable), the other confirms a
request to an unrelated domain is untouched.
