import { describe, it, expect, afterAll } from 'vitest';

process.env.HERMES_HEADLESS = 'true';

const { ensureBrowser, ensureHumanContext, closeBrowser } = await import('../../src/browser/context.js');
const { openTarget } = await import('../../src/browser/chromium.js');

describe('browser context', () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it('reuses a single shared browser across calls', async () => {
    const first = await ensureBrowser();
    const second = await ensureBrowser();
    expect(second).toBe(first);
  });

  it('reuses a single human context across calls', async () => {
    const first = await ensureHumanContext();
    const second = await ensureHumanContext();
    expect(second).toBe(first);
  });

  it('opens a page against the human context', async () => {
    const page = await openTarget('about:blank');
    expect(page.url()).toBe('about:blank');
    await page.close();
  });
});
