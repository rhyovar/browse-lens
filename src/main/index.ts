import { ensureHumanContext, closeBrowser } from '../browser/chromium.js';
import '../protocol/ws-server.js';

export async function bootstrap() {
  const ctx = await ensureHumanContext();
  await ctx.newPage();
  console.log('browser ready');
  return ctx;
}

export function installShutdownHandler() {
  const shutdown = () => {
    closeBrowser().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  bootstrap();
  installShutdownHandler();
}
