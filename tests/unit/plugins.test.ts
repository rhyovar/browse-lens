import { describe, it, expect } from 'vitest';
import { resolveScript } from '../../src/agent/plugins.js';

describe('resolveScript', () => {
  it('resolves a no-arg script from the example plugin', async () => {
    const script = await resolveScript('browselens-plugin-example', 'readTitle', {});
    expect(script).toBe('return await tools.title();');
  });

  it('resolves a parameterized script, safely embedding params as JSON', async () => {
    const script = await resolveScript('browselens-plugin-example', 'fillAndSubmit', {
      selector: '#email',
      value: 'a"b\'c',
      submitSelector: '#go'
    });

    expect(script).toContain(JSON.stringify('#email'));
    expect(script).toContain(JSON.stringify("a\"b'c"));
    expect(script).toContain(JSON.stringify('#go'));
  });

  it('throws a clear error for an unknown package', async () => {
    await expect(resolveScript('not-a-real-package-xyz', 'anything', {})).rejects.toThrow(
      /could not load plugin package/
    );
  });

  it('throws a clear error for an unknown script name', async () => {
    await expect(resolveScript('browselens-plugin-example', 'doesNotExist', {})).rejects.toThrow(
      /has no script named "doesNotExist"/
    );
  });
});
