import { describe, it, expect, afterAll } from 'vitest';

process.env.HERMES_HEADLESS = 'true';

const { closeBrowser } = await import('../../src/browser/context.js');
const { SpaceRegistry } = await import('../../src/space/registry.js');
const { spaceIsolation } = await import('../../src/space/isolation.js');

describe('space registry', () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it('creates and lists spaces', () => {
    const registry = new SpaceRegistry();
    const space = registry.create('freelance-scan');
    expect(registry.get(space.id)).toEqual(space);
    expect(registry.list()).toEqual([space]);
  });

  it('closing a space also closes any pages it owns', async () => {
    const registry = new SpaceRegistry();
    const space = registry.create('freelance-scan');
    await spaceIsolation.open(space.id, 'about:blank');

    const closed = await registry.close(space.id);

    expect(closed).toBe(true);
    expect(registry.get(space.id)).toBeUndefined();
    expect(spaceIsolation.list(space.id)).toEqual([]);
  });

  it('closing an unknown space returns false', async () => {
    const registry = new SpaceRegistry();
    expect(await registry.close('does-not-exist')).toBe(false);
  });
});
