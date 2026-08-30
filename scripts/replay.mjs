#!/usr/bin/env node
// Replays a recorded transcript: opens a fresh page at the transcript's
// initialUrl, then re-sends each recorded browser.run script in seq order
// against that page — no manual setup reconstruction needed. Writes a new
// transcript (record: true on the replay Space) so you can diff the two
// afterward with `npm run diff`. Does no comparison itself.
//
// Usage: npm run replay -- <transcript.jsonl>
// Requires `npm run dev:electron` already running.
import fs from 'node:fs';
import WebSocket from 'ws';

const WS_URL = process.env.HERMES_WS_URL ?? 'ws://127.0.0.1:8765';

function readTranscript(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const [header, ...entries] = lines;
  if (!header || typeof header.initialUrl !== 'string') {
    throw new Error(`${filePath} has no valid header line (missing initialUrl)`);
  }
  return { header, entries };
}

async function main() {
  const transcriptPath = process.argv[2];
  if (!transcriptPath) {
    console.error('usage: npm run replay -- <transcript.jsonl>');
    process.exitCode = 1;
    return;
  }

  const { header, entries } = readTranscript(transcriptPath);
  console.log(`replaying ${transcriptPath} (${entries.length} call${entries.length === 1 ? '' : 's'})`);
  console.log(`initialUrl: ${header.initialUrl}`);

  const ws = new WebSocket(WS_URL);
  const send = (type, payload) => ws.send(JSON.stringify({ type, payload }));
  const nextMessage = () =>
    new Promise((resolve, reject) => {
      ws.once('message', (raw) => resolve(JSON.parse(raw.toString())));
      ws.once('error', reject);
    });

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  send('space.create', { name: `replay-${header.sessionId}`, importProfile: header.importProfile, record: true });
  const { payload: space } = await nextMessage();
  console.log(`new session: ${space.id} -> .transcripts/${space.id}.jsonl`);

  send('browser.open', { spaceId: space.id, url: header.initialUrl });
  const { payload: page } = await nextMessage();

  for (const entry of entries) {
    send('browser.run', { spaceId: space.id, pageId: page.id, script: entry.script });
    const ran = await nextMessage();
    const status = ran.type === 'browser.ran' && ran.payload.ok ? 'ok' : 'fail';
    console.log(`  [${entry.seq}] ${status}`);
  }

  send('space.close', { spaceId: space.id });
  await nextMessage();
  ws.close();

  console.log(`\ndone. compare with: npm run diff -- ${transcriptPath} .transcripts/${space.id}.jsonl`);
}

main().catch((err) => {
  console.error('replay failed:', err.message);
  console.error('is the app running? try: HERMES_HEADLESS=true npm run dev:electron');
  process.exitCode = 1;
});
