#!/usr/bin/env node
// Interactive driver for the manual validation flow.
// See docs/MANUAL_VALIDATION.md for the full walkthrough.
import readline from 'node:readline';
import WebSocket from 'ws';

const url = process.env.HERMES_WS_URL ?? 'ws://127.0.0.1:8765';
const ws = new WebSocket(url);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });

function send(type, payload) {
  if (ws.readyState !== WebSocket.OPEN) {
    console.log('not connected yet, try again in a moment');
    return;
  }
  ws.send(JSON.stringify({ type, payload }));
}

const HELP = `commands:
  space create [name] [--import]   create a Space (--import seeds its first
                                    context with the human's current cookies)
  space close <spaceId>       close a Space and all its pages
  open <spaceId> <url>        open a page owned by a Space
  list <spaceId>              list pages owned by a Space
  close <spaceId> <pageId>    close a page (only if owned by that Space)
  run <spaceId> <pageId> <script>   run one JS snippet against a page
                                     (tools.snapshot/click/fill/scroll/
                                     waitForLoad/url/title/capture in scope)
  help                        show this again
  quit                        disconnect and exit`;

ws.on('open', () => {
  console.log(`connected to ${url}`);
  console.log(HELP);
  rl.prompt();
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  console.log(`\n< ${msg.type} ${JSON.stringify(msg.payload)}`);
  rl.prompt();
});

ws.on('close', () => {
  console.log('disconnected');
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('connection error:', err.message);
  console.error('is the app running? try: npm run dev:electron');
  process.exit(1);
});

rl.on('line', (line) => {
  const [cmd, ...rest] = line.trim().split(/\s+/).filter(Boolean);
  switch (cmd) {
    case undefined:
      break;
    case 'help':
      console.log(HELP);
      break;
    case 'quit':
    case 'exit':
      ws.close();
      return;
    case 'space':
      if (rest[0] === 'create') {
        const importProfile = rest.includes('--import');
        const name = rest.slice(1).filter((arg) => arg !== '--import').join(' ') || undefined;
        send('space.create', { name, importProfile });
      } else if (rest[0] === 'close') {
        send('space.close', { spaceId: rest[1] });
      } else {
        console.log('usage: space create [name] [--import] | space close <spaceId>');
      }
      break;
    case 'open':
      send('browser.open', { spaceId: rest[0], url: rest[1] });
      break;
    case 'list':
      send('browser.list', { spaceId: rest[0] });
      break;
    case 'close':
      send('browser.close', { spaceId: rest[0], pageId: rest[1] });
      break;
    case 'run': {
      const [spaceId, pageId, ...scriptParts] = rest;
      send('browser.run', { spaceId, pageId, script: scriptParts.join(' ') });
      break;
    }
    default:
      console.log(`unknown command: ${cmd}`);
  }
  rl.prompt();
});
