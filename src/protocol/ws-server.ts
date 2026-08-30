import { WebSocketServer, type WebSocket } from 'ws';
import { SpaceRegistry } from '../space/registry.js';
import { spaceIsolation } from '../space/isolation.js';

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
    const msg = JSON.parse(raw.toString());
    const spaceId = msg.payload?.spaceId;

    switch (msg.type) {
      case 'space.create': {
        const space = registry.create(msg.payload?.name ?? 'untitled');
        send(ws, 'space.created', space);
        break;
      }
      case 'space.close': {
        const closed = await registry.close(spaceId);
        send(ws, 'space.closed', { spaceId, closed });
        break;
      }
      case 'browser.open': {
        if (!registry.get(spaceId)) {
          error(ws, `unknown space: ${spaceId}`);
          break;
        }
        const opened = await spaceIsolation.open(spaceId, msg.payload.url);
        send(ws, 'browser.opened', opened);
        break;
      }
      case 'browser.list': {
        if (!registry.get(spaceId)) {
          error(ws, `unknown space: ${spaceId}`);
          break;
        }
        send(ws, 'browser.list', spaceIsolation.list(spaceId));
        break;
      }
      case 'browser.close': {
        const closed = await spaceIsolation.close(spaceId, msg.payload?.pageId);
        send(ws, 'browser.closed', { pageId: msg.payload?.pageId, closed });
        break;
      }
      default:
        error(ws, 'unknown message type');
    }
  });
});

console.log('hermes-agent-browser protocol listening on ws://127.0.0.1:8765');
