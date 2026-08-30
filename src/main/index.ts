import { ensureContext } from '../browser/chromium.js';
import '../protocol/ws-server.js';

export async function bootstrap() {
  const context = await ensureContext();
  console.log('browser ready');
  return context;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  bootstrap();
}
