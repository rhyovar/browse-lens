import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { startRecording, getRecorder, stopRecording } = await import('../../src/agent/recorder.js');

const TRANSCRIPTS_DIR = path.join(process.cwd(), '.transcripts');

function readLines(spaceId: string): unknown[] {
  const filePath = path.join(TRANSCRIPTS_DIR, `${spaceId}.jsonl`);
  return fs
    .readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

describe('recorder', () => {
  const spaceIds: string[] = [];

  afterEach(() => {
    for (const id of spaceIds.splice(0)) {
      stopRecording(id);
      fs.rmSync(path.join(TRANSCRIPTS_DIR, `${id}.jsonl`), { force: true });
    }
  });

  it('writes a header line only once the first browser.open is recorded', () => {
    const spaceId = `test-header-${Date.now()}`;
    spaceIds.push(spaceId);
    startRecording(spaceId, false);

    getRecorder(spaceId)?.recordOpen('https://example.com');
    getRecorder(spaceId)?.recordOpen('https://example.org'); // ignored: header already written

    const [header] = readLines(spaceId);
    expect(header).toMatchObject({
      sessionId: spaceId,
      spaceId,
      importProfile: false,
      initialUrl: 'https://example.com'
    });
  });

  it('appends one entry per recordRun call with incrementing seq', () => {
    const spaceId = `test-entries-${Date.now()}`;
    spaceIds.push(spaceId);
    startRecording(spaceId, true);

    getRecorder(spaceId)?.recordOpen('https://example.com');
    getRecorder(spaceId)?.recordRun('page-1', 'return 1;', 10, { ok: true, result: 1, logs: [] });
    getRecorder(spaceId)?.recordRun('page-1', 'return 2;', 20, { ok: true, result: 2, logs: [] });

    const [header, first, second] = readLines(spaceId) as any[];
    expect(header.initialUrl).toBe('https://example.com');
    expect(first).toMatchObject({ seq: 0, script: 'return 1;', elapsedMs: 10 });
    expect(second).toMatchObject({ seq: 1, script: 'return 2;', elapsedMs: 20 });
  });

  it('getRecorder returns undefined for a space that was never started or already stopped', () => {
    const spaceId = `test-missing-${Date.now()}`;
    expect(getRecorder(spaceId)).toBeUndefined();

    spaceIds.push(spaceId);
    startRecording(spaceId, false);
    expect(getRecorder(spaceId)).toBeDefined();

    stopRecording(spaceId);
    expect(getRecorder(spaceId)).toBeUndefined();
  });
});
