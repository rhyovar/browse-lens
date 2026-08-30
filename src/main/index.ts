import { ensureContext } from '../browser/chromium.js';

export async function bootstrap() {
  const context = await ensureContext();
  console.log('browser ready');
  return context;
}
