#!/usr/bin/env node
// Compares two recorded transcripts entry-by-entry (matched by seq): does
// the script match, does the result match, how far apart is the timing.
// Plain text table to stdout. Exit 0 if identical, 1 if diverged.
//
// Usage: npm run diff -- <a.jsonl> <b.jsonl>
import fs from 'node:fs';

function readTranscript(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const [header, ...entries] = lines;
  return { header, entries };
}

function resultsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function main() {
  const [pathA, pathB] = process.argv.slice(2);
  if (!pathA || !pathB) {
    console.error('usage: npm run diff -- <a.jsonl> <b.jsonl>');
    process.exitCode = 1;
    return;
  }

  const a = readTranscript(pathA);
  const b = readTranscript(pathB);

  console.log(`A: ${pathA} (${a.entries.length} calls, initialUrl: ${a.header?.initialUrl ?? '?'})`);
  console.log(`B: ${pathB} (${b.entries.length} calls, initialUrl: ${b.header?.initialUrl ?? '?'})\n`);

  const maxLen = Math.max(a.entries.length, b.entries.length);
  let diverged = false;

  const rows = [];
  for (let seq = 0; seq < maxLen; seq++) {
    const entryA = a.entries.find((e) => e.seq === seq);
    const entryB = b.entries.find((e) => e.seq === seq);

    if (!entryA || !entryB) {
      diverged = true;
      rows.push([String(seq), 'missing', entryA ? 'only in A' : 'only in B', '-']);
      continue;
    }

    const scriptMatch = entryA.script === entryB.script;
    const resultMatch = resultsEqual(entryA.result, entryB.result);
    const timingDelta = entryB.elapsedMs - entryA.elapsedMs;
    if (!scriptMatch || !resultMatch) diverged = true;

    rows.push([
      String(seq),
      scriptMatch ? 'same' : 'DIFFERS',
      resultMatch ? 'same' : 'DIFFERS',
      `${timingDelta >= 0 ? '+' : ''}${timingDelta}ms`
    ]);
  }

  const header = ['seq', 'script', 'result', 'timing (B-A)'];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const formatRow = (row) => row.map((cell, i) => cell.padEnd(widths[i])).join('  ');

  console.log(formatRow(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) console.log(formatRow(row));

  console.log(diverged ? '\nDIVERGED' : '\nIDENTICAL');
  process.exitCode = diverged ? 1 : 0;
}

main();
