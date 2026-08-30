import { describe, it, expect, afterAll } from 'vitest';

process.env.HERMES_HEADLESS = 'true';

const { closeBrowser, ensureHumanContext } = await import('../../src/browser/context.js');
const { SpaceIsolation } = await import('../../src/space/isolation.js');

describe('space isolation', () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it('only lists pages owned by the requesting space', async () => {
    const isolation = new SpaceIsolation();
    const a = await isolation.open('space-a', 'about:blank');
    await isolation.open('space-b', 'about:blank');

    const listA = isolation.list('space-a');
    expect(listA.map((p) => p.id)).toEqual([a.id]);
  });

  it('refuses to close a page owned by another space', async () => {
    const isolation = new SpaceIsolation();
    const a = await isolation.open('space-a', 'about:blank');

    const result = await isolation.close('space-b', a.id);
    expect(result).toBe(false);
    expect(isolation.list('space-a').map((p) => p.id)).toEqual([a.id]);
  });

  it('closes a page it owns', async () => {
    const isolation = new SpaceIsolation();
    const a = await isolation.open('space-a', 'about:blank');

    const result = await isolation.close('space-a', a.id);
    expect(result).toBe(true);
    expect(isolation.list('space-a')).toEqual([]);
  });

  it('closeAll tears down every page for a space without touching others', async () => {
    const isolation = new SpaceIsolation();
    await isolation.open('space-a', 'about:blank');
    await isolation.open('space-a', 'about:blank');
    const b = await isolation.open('space-b', 'about:blank');

    await isolation.closeAll('space-a');

    expect(isolation.list('space-a')).toEqual([]);
    expect(isolation.list('space-b').map((p) => p.id)).toEqual([b.id]);
  });

  it('gives each space its own cookie jar and localStorage, not shared', async () => {
    const isolation = new SpaceIsolation();
    await isolation.open('space-a', 'https://example.com');
    const ctxA = await isolation.getContext('space-a');
    await ctxA.addCookies([
      { name: 'secret', value: 'space-a-cookie', url: 'https://example.com' }
    ]);
    const rawPageA = (await ctxA.pages())[0];
    await rawPageA.evaluate(() => localStorage.setItem('secret', 'space-a-local'));

    await isolation.open('space-b', 'https://example.com');
    const ctxB = await isolation.getContext('space-b');
    const rawPageB = (await ctxB.pages())[0];

    const cookiesB = await ctxB.cookies('https://example.com');
    expect(cookiesB.find((c) => c.name === 'secret')).toBeUndefined();

    const localValueB = await rawPageB.evaluate(() => localStorage.getItem('secret'));
    expect(localValueB).toBeNull();

    await isolation.closeAll('space-a');
    await isolation.closeAll('space-b');
  });

  it('imports the human profile only when requested', async () => {
    const humanCtx = await ensureHumanContext();
    await humanCtx.addCookies([
      { name: 'human-session', value: 'real-login', url: 'https://example.com' }
    ]);

    const isolation = new SpaceIsolation();

    await isolation.open('space-imports', 'https://example.com', { importProfile: true });
    const ctxImport = await isolation.getContext('space-imports');
    const importedCookies = await ctxImport.cookies('https://example.com');
    expect(importedCookies.find((c) => c.name === 'human-session')?.value).toBe('real-login');

    await isolation.open('space-fresh', 'https://example.com', { importProfile: false });
    const ctxFresh = await isolation.getContext('space-fresh');
    const freshCookies = await ctxFresh.cookies('https://example.com');
    expect(freshCookies.find((c) => c.name === 'human-session')).toBeUndefined();

    await isolation.closeAll('space-imports');
    await isolation.closeAll('space-fresh');
  });
});
