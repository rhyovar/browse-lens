import { ensureBrowser } from '../browser/chromium.js';
import { registry } from './registry.js';

export async function bootstrap() {
  const browser = await ensureBrowser();
  console.log('browser ready');
  return browser;
}
