import { describe, it, expect } from 'vitest';
import { parseClientMessage } from '../../src/protocol/messages.js';

describe('parseClientMessage', () => {
  it('accepts a well-formed space.create message', () => {
    const result = parseClientMessage(JSON.stringify({ type: 'space.create', payload: { name: 'x' } }));
    expect(result.ok).toBe(true);
  });

  it('accepts space.create with no name (optional)', () => {
    const result = parseClientMessage(JSON.stringify({ type: 'space.create', payload: {} }));
    expect(result.ok).toBe(true);
  });

  it('rejects invalid JSON', () => {
    const result = parseClientMessage('not json');
    expect(result).toEqual({ ok: false, error: 'invalid JSON' });
  });

  it('rejects an unknown message type', () => {
    const result = parseClientMessage(JSON.stringify({ type: 'bogus', payload: {} }));
    expect(result.ok).toBe(false);
  });

  it('rejects browser.open missing a spaceId', () => {
    const result = parseClientMessage(JSON.stringify({ type: 'browser.open', payload: { url: 'https://example.com' } }));
    expect(result.ok).toBe(false);
  });

  it('rejects browser.open with a non-URL', () => {
    const result = parseClientMessage(
      JSON.stringify({ type: 'browser.open', payload: { spaceId: 'abc', url: 'not-a-url' } })
    );
    expect(result.ok).toBe(false);
  });

  it('accepts a well-formed browser.open message', () => {
    const result = parseClientMessage(
      JSON.stringify({ type: 'browser.open', payload: { spaceId: 'abc', url: 'https://example.com' } })
    );
    expect(result.ok).toBe(true);
  });
});
