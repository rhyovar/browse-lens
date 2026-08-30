import { WebSocketServer, type WebSocket } from 'ws';
import { SpaceRegistry } from '../space/registry.js';
import { spaceIsolation } from '../space/isolation.js';
import { parseClientMessage } from './messages.js';

const wss = new WebSocketServer({ port: 8765 });
const registry = new SpaceRegistry();

function send(ws: WebSocket, type: string, payload: unknown) {
  ws.send(JSON.stringify({ type, payload }));
}

function error(ws: WebSocket, message: string) {
  send(ws, 'error', { message });
}

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', async (raw: string) => {
    const parsed = parseClientMessage(raw.toString());
    if (!parsed.ok) {
      error(ws, parsed.error);
      return;
    }
    const msg = parsed.message;

    switch (msg.type) {
      case 'space.create': {
        const space = registry.create(msg.payload.name ?? 'untitled', msg.payload.importProfile ?? false);
        send(ws, 'space.created', space);
        break;
      }
      case 'space.close': {
        const closed = await registry.close(msg.payload.spaceId);
        send(ws, 'space.closed', { spaceId: msg.payload.spaceId, closed });
        break;
      }
      case 'browser.open': {
        const space = registry.get(msg.payload.spaceId);
        if (!space) {
          error(ws, `unknown space: ${msg.payload.spaceId}`);
          break;
        }
        const opened = await spaceIsolation.open(msg.payload.spaceId, msg.payload.url, {
          importProfile: space.importProfile
        });
        send(ws, 'browser.opened', opened);
        break;
      }
      case 'browser.list': {
        if (!registry.get(msg.payload.spaceId)) {
          error(ws, `unknown space: ${msg.payload.spaceId}`);
          break;
        }
        send(ws, 'browser.list', spaceIsolation.list(msg.payload.spaceId));
        break;
      }
      case 'browser.close': {
        const closed = await spaceIsolation.close(msg.payload.spaceId, msg.payload.pageId);
        send(ws, 'browser.closed', { pageId: msg.payload.pageId, closed });
        break;
      }
      default: {
        const exhaustive: never = msg;
        error(ws, `unhandled message type: ${(exhaustive as { type: string }).type}`);
      }
    }
  });
});

console.log('hermes-agent-browser protocol listening on ws://127.0.0.1:8765');
