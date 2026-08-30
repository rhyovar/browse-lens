import { chromium, type Browser, type BrowserContext } from 'playwright';
import fs from 'fs';
import { storageStatePath } from './profile.js';

let browserPromise: Promise<Browser> | null = null;
let humanContextPromise: Promise<BrowserContext> | null = null;

/**
 * One Chromium process, shared by the human and every agent Space. Isolation
 * between them is at the BrowserContext level (see src/space/isolation.ts),
 * not at the process level.
 */
export function ensureBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: process.env.HERMES_HEADLESS === 'true',
      args: ['--disable-blink-features=AutomationControlled']
    });
  }
  return browserPromise;
}

/**
 * The human's own browsing context — never shared with any Space, and no
 * Space's context is ever shared with it. Cookies and localStorage are
 * best-effort persisted to disk across restarts via Playwright's
 * storageState; this is not a full profile (IndexedDB, service workers,
 * and extensions don't survive a restart).
 */
export function ensureHumanContext(): Promise<BrowserContext> {
  if (!humanContextPromise) {
    humanContextPromise = (async () => {
      const browser = await ensureBrowser();
      const statePath = storageStatePath('human');
      const storageState = fs.existsSync(statePath) ? statePath : undefined;
      return browser.newContext({ storageState, viewport: { width: 1440, height: 900 } });
    })();
  }
  return humanContextPromise;
}

/** Closes the shared browser — and with it every context: human and all Spaces. */
export async function closeBrowser(): Promise<void> {
  if (humanContextPromise) {
    const ctx = await humanContextPromise;
    humanContextPromise = null;
    await ctx.storageState({ path: storageStatePath('human') }).catch(() => {});
  }
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}
