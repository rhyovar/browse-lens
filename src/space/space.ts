export interface Space {
  id: string;
  name: string;
  createdAt: number;
  active: boolean;
  /** If true, the Space's first BrowserContext is seeded with a snapshot of the human's current cookies/localStorage. */
  importProfile: boolean;
  /** If true, every browser.run call in this Space is recorded to .transcripts/<sessionId>.jsonl. */
  record: boolean;
  /** If true, the Space's BrowserContext blocks known telemetry/tracking domains (see src/browser/telemetry-blocklist.ts). */
  privacy: boolean;
  /** Domains allowed in this Space's BrowserContext — if non-empty, everything else is blocked. Default-allow: empty means no restriction. */
  allowlist: string[];
  /** Domains blocked in this Space's BrowserContext, merged with the built-in telemetry list when privacy is also true. */
  blocklist: string[];
}
