import { describe, it, expect, afterAll } from 'vitest';

process.env.HERMES_HEADLESS = 'true';

const { ensureContext, closeContext } = await import('../../src/browser/context.js');
const { openTarget } = await import('../../src/browser/chromium.js');

describe('browser context', () => {
  afterAll(async () => {
    await closeContext();
  });

  it('reuses a single persistent context across calls', async () => {
    const first = await ensureContext();
    const second = await ensureContext();
    expect(second).toBe(first);
  });

  it('opens a page against the shared context', async () => {
    const page = await openTarget('about:blank');
    expect(page.url()).toBe('about:blank');
    await page.close();
  });
});
