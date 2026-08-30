import { ensureHumanContext, closeBrowser } from '../browser/chromium.js';
import '../protocol/ws-server.js';

export async function bootstrap() {
  const ctx = await ensureHumanContext();
  await ctx.newPage();
  console.log('browser ready');
  return ctx;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  bootstrap();

  // Persisting the human's storageState only happens in closeBrowser(), so a
  // bare kill/crash loses cookies/localStorage since the last graceful exit.
  const shutdown = () => {
    closeBrowser().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
