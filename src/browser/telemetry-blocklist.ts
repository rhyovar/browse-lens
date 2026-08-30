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

export function isTelemetryHost(hostname: string): boolean {
  return TELEMETRY_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

/** Aborts every request to a domain in TELEMETRY_DOMAINS for this context. */
export async function blockTelemetry(context: BrowserContext): Promise<void> {
  await context.route('**/*', (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (isTelemetryHost(hostname)) {
      return route.abort();
    }
    return route.continue();
  });
}
