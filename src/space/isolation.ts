import { randomUUID } from 'crypto';
import type { BrowserContext, Page } from 'playwright';
import { ensureBrowser, ensureHumanContext } from '../browser/chromium.js';
import { applyNetworkPolicy } from '../browser/telemetry-blocklist.js';

export interface SpacePage {
  id: string;
  spaceId: string;
  url: string;
}

export interface GetContextOptions {
  /**
   * Seed a newly-created context with a snapshot of the human's current
   * cookies/localStorage (Chrome profile import) instead of starting empty.
   * Only matters the first time a Space's context is created; ignored once
   * the context already exists. This is a one-time snapshot, not a live
   * link — later changes to the human's session aren't reflected back.
   */
  importProfile?: boolean;
  /**
   * Block known telemetry/tracking domains (see
   * src/browser/telemetry-blocklist.ts) in this Space's context. Only
   * matters the first time a Space's context is created, same as
   * importProfile.
   */
  privacy?: boolean;
  /** Domains allowed in this Space's context — if non-empty, everything else is blocked (default-allow otherwise). */
  allowlist?: string[];
  /** Domains blocked in this Space's context, merged with the built-in telemetry list when privacy is also true. */
  blocklist?: string[];
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

  async getContext(spaceId: string, options: GetContextOptions = {}): Promise<BrowserContext> {
    let ctx = this.contexts.get(spaceId);
    if (!ctx) {
      const browser = await ensureBrowser();
      const storageState = options.importProfile
        ? await (await ensureHumanContext()).storageState()
        : undefined;
      ctx = await browser.newContext({ storageState, viewport: { width: 1440, height: 900 } });
      await applyNetworkPolicy(ctx, {
        privacy: options.privacy,
        allowlist: options.allowlist,
        blocklist: options.blocklist
      });
      this.contexts.set(spaceId, ctx);
    }
    return ctx;
  }

  async open(spaceId: string, url: string, options: GetContextOptions = {}): Promise<SpacePage> {
    const ctx = await this.getContext(spaceId, options);
    const page = await ctx.newPage();
    await page.goto(url);
    const id = randomUUID();
    this.pages.set(id, { spaceId, page });
    page.once('close', () => this.pages.delete(id));
    return { id, spaceId, url: page.url() };
  }

  /** Returns undefined if the page doesn't exist or belongs to a different Space. */
  getPage(spaceId: string, pageId: string): Page | undefined {
    const entry = this.pages.get(pageId);
    if (!entry || entry.spaceId !== spaceId) return undefined;
    return entry.page;
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
