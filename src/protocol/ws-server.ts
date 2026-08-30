import { WebSocketServer, type WebSocket } from 'ws';
import { SpaceRegistry } from './registry.js';
import { openTarget } from '../browser/chromium.js';

const wss = new WebSocketServer({ port: 8765 });
const registry = new SpaceRegistry();

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', async (raw: string) => {
    const msg = JSON.parse(raw.toString());
    switch (msg.type) {
      case 'space.create':
        const space = registry.create(msg.payload.name ?? 'untitled');
        ws.send(JSON.stringify({ type: 'space.created', payload: space }));
        break;
      case 'browser.open':
        const page = await openTarget(msg.payload.url);
        ws.send(JSON.stringify({ type: 'browser.opened', payload: { url: msg.payload.url } }));
        break;
      default:
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'unknown message type' } }));
    }
  });
});

console.log('hermes-agent-browser protocol listening on ws://127.0.0.1:8765');
