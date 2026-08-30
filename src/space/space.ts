export interface Space {
  id: string;
  name: string;
  createdAt: number;
  active: boolean;
  /** If true, the Space's first BrowserContext is seeded with a snapshot of the human's current cookies/localStorage. */
  importProfile: boolean;
  /** If true, every browser.run call in this Space is recorded to .transcripts/<sessionId>.jsonl. */
  record: boolean;
}
