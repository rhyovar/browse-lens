import { chromium, type Browser, type Page } from 'playwright';
import path from 'path';
import fs from 'fs';

const USER_DATA_DIR = path.join(process.env.HOME || '', '.hermes-agent-browser', 'chromium-profile');

export async function ensureBrowser(): Promise<Browser> {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  return chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1440, height: 900 }
  });
}

export async function openTarget(url: string): Promise<Page> {
  const ctx = await ensureBrowser();
  const page = await ctx.newPage();
  await page.goto(url);
  return page;
}
