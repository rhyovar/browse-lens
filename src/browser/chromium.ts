import type { Page } from 'playwright';
import { ensureHumanContext } from './context.js';

export async function openTarget(url: string): Promise<Page> {
  const ctx = await ensureHumanContext();
  const page = await ctx.newPage();
  await page.goto(url);
  return page;
}

export { ensureBrowser, ensureHumanContext, closeBrowser } from './context.js';
