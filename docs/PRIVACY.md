# Privacy mode

Two independent, composable pieces of network control per Space, both off
by default: a built-in telemetry blocklist (`privacy: true`) and a
general, agent-supplied allow/block domain list (`allowlist`/`blocklist`).
Both are enforced by one `context.route()` handler in
[`src/browser/telemetry-blocklist.ts`](../src/browser/telemetry-blocklist.ts)'s
`applyNetworkPolicy(context, options)`, applied once when the Space's
`BrowserContext` is first created (same timing as `importProfile`).

## Use it

```json
{ "type": "space.create", "payload": { "name": "research", "privacy": true, "allowlist": ["example.com"], "blocklist": ["evil.example"] } }
```

All three fields are optional; omitting one is a no-op for that piece —
you can use `privacy` alone, `blocklist` alone, `allowlist` alone, or any
combination. If none are set, `applyNetworkPolicy` doesn't even register a
route handler.

## Default policy: default-allow

**Everything passes through unless something explicitly blocks it.** This
is the same behavior `privacy: true` already had (a fixed blocklist, allow
everything else) and it's now the policy for the general list too:

- `blocklist` alone: those domains are blocked, everything else passes.
- `allowlist` alone: **this one flips the policy for that Space** — only
  listed domains (and their subdomains) pass; everything else is blocked.
  Providing an allowlist is how a Space opts into default-deny; the
  overall system default without one is still default-allow.
- Both together: `blocklist` wins if a domain is in both lists — a domain
  can be explicitly disallowed even if it's also allowlisted. Verified
  directly in `tests/unit/telemetry-blocklist.test.ts`.
- `privacy: true` merges `TELEMETRY_DOMAINS` into the effective blocklist,
  alongside any custom `blocklist` entries — a Space with both blocks the
  union of both sets.

**Default-deny by default (an empty allowlist meaning "block everything
until explicitly allowed") is a possible future option, not what this
ships.** Nothing here defaults a Space to locked-down; a Space only
becomes allowlist-restricted when the caller explicitly provides a
non-empty `allowlist`. This was a deliberate choice to avoid surprising
agents with broken pages by default.

## The built-in telemetry blocklist

~30 domains, grouped by category — merged in only when `privacy: true`.
This is the full, auditable list:

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

A domain and all its subdomains are matched (`google-analytics.com` also
matches `www.google-analytics.com`, `ssl.google-analytics.com`, etc.) —
the same subdomain-matching rule applies to custom `allowlist`/`blocklist`
entries too. See `isTelemetryHost`/`applyNetworkPolicy` in
`telemetry-blocklist.ts` for the exact logic.

## What's deliberately excluded from the built-in list

Chat/support widgets (Intercom, Zendesk, Drift, etc.) are **not** on it.
They can be part of a legitimate task (an agent testing a chat
integration, or one whose job requires triggering a support flow) — that's
product functionality the agent might need, not telemetry silently
phoning home. The built-in list targets pure tracking/analytics/monitoring
infrastructure only; a custom `blocklist` can add anything else a
particular task needs blocked.

## A real bug found while wiring this up

Opening a page to a domain the Space's own policy blocks makes
`page.goto()` throw (`net::ERR_FAILED`). The `browser.open` handler didn't
catch that — an unhandled rejection **crashed the entire server process**,
not just that one request, discovered by testing the allowlist path live
end-to-end. Fixed by wrapping the `spaceIsolation.open(...)` call in
`ws-server.ts` in a try/catch and returning a normal top-level `error`
message instead. Verified: the server now stays up and responds normally
to later requests after a blocked `browser.open`.

## Testing

`tests/unit/telemetry-blocklist.test.ts`: pure-function coverage of
`isTelemetryHost`, plus seven browser-integration tests covering the
telemetry-only path, blocklist-only, allowlist-only, both together
(including the blocklist-wins-on-conflict case), the privacy+blocklist
merge, and the no-op case. All are tested via **page navigation**
(`page.goto`), not an injected `fetch()` — cross-origin `fetch()` fails
with `net::ERR_FAILED` from CORS alone (verified directly, with no policy
applied at all), which would make every "should be blocked" assertion
pass regardless of whether the code under test did anything. Navigation
isn't subject to CORS, so a failure there can only come from our own
`route.abort()`. Each check also uses a fresh page per URL, since reusing
one page across a blocked-then-allowed navigation pair races against
Chromium's internal transition to its `chrome-error://` page — a second
`goto()` on the same page can be interrupted by that still-settling
transition, a timing issue unrelated to the policy logic (also found and
fixed while writing these tests, not present in the shipped code, only in
an earlier draft of the tests themselves).
