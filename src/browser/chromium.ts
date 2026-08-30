import type { Page } from 'playwright';
import { ensureContext, closeContext } from './context.js';

export async function openTarget(url: string): Promise<Page> {
  const ctx = await ensureContext();
  const page = await ctx.newPage();
  await page.goto(url);
  return page;
}

export { ensureContext, closeContext };
