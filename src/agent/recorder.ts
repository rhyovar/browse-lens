import fs from 'node:fs';
import path from 'node:path';

const TRANSCRIPTS_DIR = path.join(process.cwd(), '.transcripts');

export interface TranscriptHeader {
  sessionId: string;
  spaceId: string;
  startedAt: number;
  importProfile: boolean;
  initialUrl: string;
}

export interface TranscriptEntry {
  seq: number;
  timestamp: number;
  pageId: string;
  script: string;
  elapsedMs: number;
  result: unknown;
}

/**
 * Records one Space's browser.run calls to .transcripts/<spaceId>.jsonl —
 * a header line (written on the first browser.open, once initialUrl is
 * known) followed by one JSON line per call, in order. Used for debugging
 * ("what exactly ran and what came back") and for replay/diff.
 */
class SessionRecorder {
  private seq = 0;
  private headerWritten = false;
  readonly filePath: string;

  constructor(
    private sessionId: string,
    private spaceId: string,
    private importProfile: boolean
  ) {
    fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
    this.filePath = path.join(TRANSCRIPTS_DIR, `${sessionId}.jsonl`);
  }

  private appendLine(obj: unknown): void {
    fs.appendFileSync(this.filePath, `${JSON.stringify(obj)}\n`);
  }

  /** Only the first call writes the header (its url becomes initialUrl); later opens are untracked. */
  recordOpen(url: string): void {
    if (this.headerWritten) return;
    this.headerWritten = true;
    const header: TranscriptHeader = {
      sessionId: this.sessionId,
      spaceId: this.spaceId,
      startedAt: Date.now(),
      importProfile: this.importProfile,
      initialUrl: url
    };
    this.appendLine(header);
  }

  recordRun(pageId: string, script: string, elapsedMs: number, result: unknown): void {
    const entry: TranscriptEntry = {
      seq: this.seq++,
      timestamp: Date.now(),
      pageId,
      script,
      elapsedMs,
      result
    };
    this.appendLine(entry);
  }
}

const recorders = new Map<string, SessionRecorder>();

export function startRecording(spaceId: string, importProfile: boolean): void {
  recorders.set(spaceId, new SessionRecorder(spaceId, spaceId, importProfile));
}

export function getRecorder(spaceId: string): SessionRecorder | undefined {
  return recorders.get(spaceId);
}

export function stopRecording(spaceId: string): void {
  recorders.delete(spaceId);
}
