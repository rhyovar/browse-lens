import { describe, it, expect, afterAll } from 'vitest';

process.env.HERMES_HEADLESS = 'true';

const { closeContext } = await import('../../src/browser/context.js');
const { SpaceIsolation } = await import('../../src/space/isolation.js');

describe('space isolation', () => {
  afterAll(async () => {
    await closeContext();
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
});
