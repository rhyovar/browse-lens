import { chromium, type BrowserContext } from 'playwright';
import { profileDir } from './profile.js';

let contextPromise: Promise<BrowserContext> | null = null;

/**
 * Every caller shares this single persistent context so agents and the
 * human land in the same Chromium instance instead of spawning duplicates.
 */
export function ensureContext(): Promise<BrowserContext> {
  if (!contextPromise) {
    contextPromise = chromium.launchPersistentContext(profileDir(), {
      headless: process.env.HERMES_HEADLESS === 'true',
      args: ['--disable-blink-features=AutomationControlled'],
      viewport: { width: 1440, height: 900 }
    });
  }
  return contextPromise;
}

export async function closeContext(): Promise<void> {
  if (!contextPromise) return;
  const ctx = await contextPromise;
  contextPromise = null;
  await ctx.close();
}
