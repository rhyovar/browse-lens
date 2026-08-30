import type { BrowserContext } from 'playwright';

/**
 * Known analytics/advertising/session-replay/error-monitoring domains,
 * blocked when a Space opts in with `privacy: true`. Deliberately narrow —
 * pure tracking/telemetry infrastructure, not general site functionality
 * (e.g. chat widgets are excluded: they can be part of a legitimate task,
 * not just "phoning home"). Grouped by category; see docs/PRIVACY.md for
 * the rationale and how to extend this list.
 */
export const TELEMETRY_DOMAINS: readonly string[] = [
  // Analytics
  'google-analytics.com',
  'googletagmanager.com',
  'segment.io',
  'segment.com',
  'mixpanel.com',
  'amplitude.com',
  'matomo.cloud',
  'plausible.io',
  'scorecardresearch.com',
  'quantserve.com',

  // Advertising
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'amazon-adsystem.com',
  'ads-twitter.com',
  'criteo.com',
  'outbrain.com',
  'taboola.com',

  // Session replay / heatmaps
  'hotjar.com',
  'fullstory.com',
  'clarity.ms',
  'mouseflow.com',
  'luckyorange.com',

  // Social pixels
  'connect.facebook.net',
  'ads.linkedin.com',
  'analytics.tiktok.com',
  'tr.snapchat.com',

  // Error / performance monitoring
  'sentry.io',
  'bugsnag.com',
  'newrelic.com',
  'datadoghq.com'
];

function hostMatches(hostname: string, domains: readonly string[]): boolean {
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export function isTelemetryHost(hostname: string): boolean {
  return hostMatches(hostname, TELEMETRY_DOMAINS);
}

export interface NetworkPolicyOptions {
  /** Merge the built-in TELEMETRY_DOMAINS into the effective blocklist. */
  privacy?: boolean;
  /** If non-empty, only these domains (and their subdomains) are allowed — default-allow otherwise. */
  allowlist?: string[];
  /** Domains blocked outright, merged with TELEMETRY_DOMAINS when privacy is also true. */
  blocklist?: string[];
}

/**
 * Applies a Space's network policy to its BrowserContext in one route
 * handler: default-allow (everything passes) unless `allowlist` is
 * non-empty (then only matching domains pass) or a domain matches the
 * effective blocklist (custom `blocklist` plus TELEMETRY_DOMAINS when
 * `privacy` is set) — blocklist wins over allowlist. A no-op (registers no
 * handler) if none of `privacy`/`allowlist`/`blocklist` is set.
 */
export async function applyNetworkPolicy(context: BrowserContext, options: NetworkPolicyOptions = {}): Promise<void> {
  const { privacy = false, allowlist = [], blocklist = [] } = options;
  if (!privacy && allowlist.length === 0 && blocklist.length === 0) return;

  const effectiveBlocklist = privacy ? [...TELEMETRY_DOMAINS, ...blocklist] : blocklist;

  await context.route('**/*', (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (hostMatches(hostname, effectiveBlocklist)) {
      return route.abort();
    }
    if (allowlist.length > 0 && !hostMatches(hostname, allowlist)) {
      return route.abort();
    }
    return route.continue();
  });
}
