import { describe, it, expect, afterAll } from 'vitest';

process.env.HERMES_HEADLESS = 'true';

const { closeBrowser } = await import('../../src/browser/context.js');
const { SpaceIsolation } = await import('../../src/space/isolation.js');
const { isTelemetryHost } = await import('../../src/browser/telemetry-blocklist.js');

describe('isTelemetryHost', () => {
  it('matches known telemetry domains and their subdomains', () => {
    expect(isTelemetryHost('google-analytics.com')).toBe(true);
    expect(isTelemetryHost('www.google-analytics.com')).toBe(true);
    expect(isTelemetryHost('api.segment.io')).toBe(true);
    expect(isTelemetryHost('sentry.io')).toBe(true);
  });

  it('does not match unrelated domains', () => {
    expect(isTelemetryHost('example.com')).toBe(false);
    expect(isTelemetryHost('github.com')).toBe(false);
    // not a real suffix match: "evil-google-analytics.com" should not match "google-analytics.com"
    expect(isTelemetryHost('evilgoogle-analytics.com.attacker.net')).toBe(false);
  });
});

// Tested via top-level navigation (page.goto) on a fresh page per check, not
// an injected fetch() and not reused across navigations on one page.
//
// Cross-origin fetch() fails with net::ERR_FAILED from CORS alone (verified
// directly: example.com fetching example.org fails even with no policy
// applied at all), which would make every "should be blocked" assertion
// pass regardless of whether our code did anything — navigation isn't
// subject to CORS, so a failure there can only come from our own
// route.abort().
//
// A fresh page per URL avoids a separate race: after an aborted navigation,
// Chromium internally transitions the page to `chrome-error://chromewebdata/`;
// issuing the next `goto()` on that same page can be interrupted by that
// still-settling internal transition ("Navigation to X is interrupted by
// another navigation"), which is a page-reuse timing issue, not a policy
// bug — reproduced directly outside the test runner before switching to a
// fresh page per check.
async function navIsBlocked(context: import('playwright').BrowserContext, url: string): Promise<boolean> {
  const page = await context.newPage();
  try {
    await page.goto(url);
    return false;
  } catch {
    return true;
  } finally {
    await page.close();
  }
}

describe('applyNetworkPolicy (browser integration)', () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it('aborts a request to a known telemetry domain when privacy is on', async () => {
    const isolation = new SpaceIsolation();
    const ctx = await isolation.getContext('space-private', { privacy: true });

    expect(await navIsBlocked(ctx, 'https://www.google-analytics.com/collect')).toBe(true);
    await isolation.closeAll('space-private');
  });

  it('does not abort requests to a non-telemetry domain when privacy is on', async () => {
    const isolation = new SpaceIsolation();
    const ctx = await isolation.getContext('space-private-2', { privacy: true });

    expect(await navIsBlocked(ctx, 'https://example.com/')).toBe(false);
    await isolation.closeAll('space-private-2');
  });

  it('blocklist-only: blocks listed domains, allows everything else (default-allow)', async () => {
    const isolation = new SpaceIsolation();
    const ctx = await isolation.getContext('space-blocklist', { blocklist: ['example.org'] });

    expect(await navIsBlocked(ctx, 'https://example.org/')).toBe(true);
    expect(await navIsBlocked(ctx, 'https://example.com/')).toBe(false);
    await isolation.closeAll('space-blocklist');
  });

  it('allowlist-only: only listed domains pass, everything else is blocked', async () => {
    const isolation = new SpaceIsolation();
    const ctx = await isolation.getContext('space-allowlist', { allowlist: ['example.com'] });

    expect(await navIsBlocked(ctx, 'https://example.com/')).toBe(false);
    expect(await navIsBlocked(ctx, 'https://example.org/')).toBe(true);
    await isolation.closeAll('space-allowlist');
  });

  it('allowlist + blocklist together: blocklist wins when a domain is in both', async () => {
    const isolation = new SpaceIsolation();
    const ctx = await isolation.getContext('space-both', {
      allowlist: ['example.com', 'example.org'],
      blocklist: ['example.org']
    });

    expect(await navIsBlocked(ctx, 'https://example.com/')).toBe(false); // allowed, not blocked
    expect(await navIsBlocked(ctx, 'https://example.org/')).toBe(true); // in both -> blocklist wins
    expect(await navIsBlocked(ctx, 'https://wikipedia.org/')).toBe(true); // not in the allowlist
    await isolation.closeAll('space-both');
  });

  it('merges the custom blocklist with the built-in telemetry list when privacy is also true', async () => {
    const isolation = new SpaceIsolation();
    const ctx = await isolation.getContext('space-merge', {
      privacy: true,
      blocklist: ['example.org']
    });

    expect(await navIsBlocked(ctx, 'https://www.google-analytics.com/collect')).toBe(true); // built-in list
    expect(await navIsBlocked(ctx, 'https://example.org/')).toBe(true); // custom list
    expect(await navIsBlocked(ctx, 'https://example.com/')).toBe(false); // neither
    await isolation.closeAll('space-merge');
  });

  it('is a no-op when privacy/allowlist/blocklist are all unset', async () => {
    const isolation = new SpaceIsolation();
    const ctx = await isolation.getContext('space-none', {});

    expect(await navIsBlocked(ctx, 'https://example.com/')).toBe(false);
    expect(await navIsBlocked(ctx, 'https://www.google-analytics.com/collect')).toBe(false);
    await isolation.closeAll('space-none');
  });
});
