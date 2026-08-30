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

describe('blockTelemetry (browser integration)', () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it('aborts a request to a known telemetry domain when privacy is on', async () => {
    const isolation = new SpaceIsolation();
    const ctx = await isolation.getContext('space-private', { privacy: true });
    const page = await ctx.newPage();

    const requestFailed = new Promise<string | null>((resolve) => {
      page.once('requestfailed', (req) => resolve(req.failure()?.errorText ?? 'unknown'));
    });

    // route().abort() intercepts before any real network call, so this is
    // deterministic regardless of whether google-analytics.com is actually reachable.
    await page.setContent('<script>fetch("https://www.google-analytics.com/collect").catch(() => {});</script>');
    const failureReason = await requestFailed;

    expect(failureReason).toBeTruthy();
    await isolation.closeAll('space-private');
  });

  it('does not abort requests to a non-telemetry domain when privacy is on', async () => {
    const isolation = new SpaceIsolation();
    const ctx = await isolation.getContext('space-private-2', { privacy: true });
    const page = await ctx.newPage();

    let sawAbort = false;
    page.once('requestfailed', () => {
      sawAbort = true;
    });

    await page.goto('https://example.com');

    expect(sawAbort).toBe(false);
    await isolation.closeAll('space-private-2');
  });
});
