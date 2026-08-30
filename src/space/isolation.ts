import { randomUUID } from 'crypto';
import type { Page } from 'playwright';
import { ensureContext } from '../browser/chromium.js';

export interface SpacePage {
  id: string;
  spaceId: string;
  url: string;
}

/**
 * All Spaces share one Chromium context (see src/browser/context.ts), so
 * isolation here is about tab *ownership*, not browser process isolation:
 * a Space can only see, navigate, or close the pages it opened.
 */
export class SpaceIsolation {
  private pages = new Map<string, { spaceId: string; page: Page }>();

  async open(spaceId: string, url: string): Promise<SpacePage> {
    const ctx = await ensureContext();
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

  async closeAll(spaceId: string): Promise<void> {
    const owned = Array.from(this.pages.entries()).filter(([, entry]) => entry.spaceId === spaceId);
    for (const [id] of owned) this.pages.delete(id);
    await Promise.all(owned.map(([, entry]) => entry.page.close()));
  }
}

export const spaceIsolation = new SpaceIsolation();
