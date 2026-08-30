import { randomUUID } from 'crypto';
import type { BrowserContext, Page } from 'playwright';
import { ensureBrowser } from '../browser/chromium.js';

export interface SpacePage {
  id: string;
  spaceId: string;
  url: string;
}

/**
 * Every Space gets its own BrowserContext inside the one shared Chromium
 * process — a separate cookie jar, localStorage, and session state, not
 * just separate tabs. A Space can't read or clobber another Space's (or
 * the human's, see src/browser/context.ts) browsing data.
 */
export class SpaceIsolation {
  private contexts = new Map<string, BrowserContext>();
  private pages = new Map<string, { spaceId: string; page: Page }>();

  async getContext(spaceId: string): Promise<BrowserContext> {
    let ctx = this.contexts.get(spaceId);
    if (!ctx) {
      const browser = await ensureBrowser();
      ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      this.contexts.set(spaceId, ctx);
    }
    return ctx;
  }

  async open(spaceId: string, url: string): Promise<SpacePage> {
    const ctx = await this.getContext(spaceId);
    const page = await ctx.newPage();
    await page.goto(url);
    const id = randomUUID();
    this.pages.set(id, { spaceId, page });
    page.once('close', () => this.pages.delete(id));
    return { id, spaceId, url: page.url() };
  }

  list(spaceId: string): SpacePage[] {
    return Array.from(this.pages.entries())
      .filter(([, entry]) => entry.spaceId === spaceId)
      .map(([id, entry]) => ({ id, spaceId, url: entry.page.url() }));
  }

  /** Returns false if the page doesn't exist or belongs to a different Space. */
  async close(spaceId: string, pageId: string): Promise<boolean> {
    const entry = this.pages.get(pageId);
    if (!entry || entry.spaceId !== spaceId) return false;
    this.pages.delete(pageId);
    await entry.page.close();
    return true;
  }

  /** Tears down the Space's entire BrowserContext: its pages, cookies, and storage. */
  async closeAll(spaceId: string): Promise<void> {
    const ctx = this.contexts.get(spaceId);
    if (!ctx) return;
    this.contexts.delete(spaceId);
    for (const [id, entry] of this.pages) {
      if (entry.spaceId === spaceId) this.pages.delete(id);
    }
    await ctx.close();
  }
}

export const spaceIsolation = new SpaceIsolation();
