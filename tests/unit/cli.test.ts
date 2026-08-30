import { describe, it, expect } from 'vitest';
import { buildMessage } from '../../cli.mjs';

describe('cli buildMessage', () => {
  it('builds space.create with flags', () => {
    const built = buildMessage('create', ['task', '--import', '--privacy']);
    expect(built).toEqual({
      type: 'space.create',
      payload: { name: 'task', importProfile: true, record: false, privacy: true, allowlist: [], blocklist: [] }
    });
  });

  it('builds space.create with comma-separated allow/block lists', () => {
    const built = buildMessage('create', ['task', '--allow', 'a.com, b.com', '--block', 'c.com']);
    expect(built).toEqual({
      type: 'space.create',
      payload: {
        name: 'task',
        importProfile: false,
        record: false,
        privacy: false,
        allowlist: ['a.com', 'b.com'],
        blocklist: ['c.com']
      }
    });
  });

  it('rejects create with no name', () => {
    const built = buildMessage('create', ['--import']);
    expect(built.usageError).toMatch(/usage: browse-lens create/);
  });

  it('builds browser.open', () => {
    const built = buildMessage('open', ['space-1', 'https://example.com']);
    expect(built).toEqual({ type: 'browser.open', payload: { spaceId: 'space-1', url: 'https://example.com' } });
  });

  it('rejects open with a missing url', () => {
    const built = buildMessage('open', ['space-1']);
    expect(built.usageError).toMatch(/usage: browse-lens open/);
  });

  it('builds browser.run with a script, joining remaining args', () => {
    const built = buildMessage('run', ['space-1', 'page-1', 'return', 'await', 'tools.title();']);
    expect(built).toEqual({
      type: 'browser.run',
      payload: { spaceId: 'space-1', pageId: 'page-1', script: 'return await tools.title();' }
    });
  });

  it('builds browser.run with a plugin reference', () => {
    const built = buildMessage('run', [
      'space-1',
      'page-1',
      '--plugin',
      'my-plugin',
      '--script-name',
      'login',
      '--params',
      '{"user":"a"}'
    ]);
    expect(built).toEqual({
      type: 'browser.run',
      payload: {
        spaceId: 'space-1',
        pageId: 'page-1',
        plugin: { package: 'my-plugin', name: 'login', params: { user: 'a' } }
      }
    });
  });

  it('rejects run with neither a script nor a plugin', () => {
    const built = buildMessage('run', ['space-1', 'page-1']);
    expect(built.usageError).toMatch(/usage: browse-lens run/);
  });

  it('builds browser.list', () => {
    const built = buildMessage('list', ['space-1']);
    expect(built).toEqual({ type: 'browser.list', payload: { spaceId: 'space-1' } });
  });

  it('builds space.close when only a spaceId is given', () => {
    const built = buildMessage('close', ['space-1']);
    expect(built).toEqual({ type: 'space.close', payload: { spaceId: 'space-1' } });
  });

  it('builds browser.close when a pageId is also given', () => {
    const built = buildMessage('close', ['space-1', 'page-1']);
    expect(built).toEqual({ type: 'browser.close', payload: { spaceId: 'space-1', pageId: 'page-1' } });
  });

  it('rejects an unknown command', () => {
    const built = buildMessage('bogus', []);
    expect(built.usageError).toMatch(/unknown command: bogus/);
  });
});
