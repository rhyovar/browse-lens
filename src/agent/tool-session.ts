import vm from 'node:vm';
import type { Page } from 'playwright';

export interface ToolRunSuccess {
  ok: true;
  result: unknown;
  logs: string[];
}

export interface ToolRunFailure {
  ok: false;
  error: string;
  logs: string[];
}

export type ToolRunOutcome = ToolRunSuccess | ToolRunFailure;

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The page-level tools an agent script gets in its sandbox. One call each
 * maps directly to a Playwright Page operation — this is what lets an
 * agent compose a whole workflow (read the page, act, wait, read again) as
 * one script instead of one WebSocket round-trip per step.
 */
/** Default timeout for waitForSelector — deliberately under DEFAULT_TIMEOUT_MS so a bare call surfaces Playwright's own clean timeout error instead of the sandbox's generic "script timed out". */
const DEFAULT_WAIT_FOR_SELECTOR_MS = 5_000;

export interface ScrapedTable {
  headers: string[];
  rows: string[][];
}

function buildTools(page: Page) {
  return {
    snapshot: () => page.locator('body').ariaSnapshot({ mode: 'ai' }),
    click: (selector: string) => page.click(selector),
    fill: (selector: string, text: string) => page.fill(selector, text),
    scroll: (deltaX: number, deltaY: number) => page.mouse.wheel(deltaX, deltaY),
    waitForLoad: () => page.waitForLoadState('networkidle'),
    url: () => page.url(),
    title: () => page.title(),
    capture: async () => (await page.screenshot()).toString('base64'),

    /** Waits for a selector to appear (or a custom timeout to elapse) — no more hand-rolled polling loops in scripts. */
    waitForSelector: async (selector: string, timeoutMs: number = DEFAULT_WAIT_FOR_SELECTOR_MS): Promise<void> => {
      await page.waitForSelector(selector, { timeout: timeoutMs });
    },

    /**
     * Extracts { headers, rows } from the first element matching `selector`
     * (normally a <table>). Header detection: the first row counts as a
     * header only if every one of its cells is a <th>; otherwise headers
     * is [] and every row is data. Uses HTMLTableElement.rows, which
     * covers plain, <thead>/<tbody>, and header-less tables uniformly.
     */
    scrapeTable: (selector: string): Promise<ScrapedTable> =>
      page.locator(selector).first().evaluate((table: HTMLTableElement) => {
        const allRows = Array.from(table.rows);
        if (allRows.length === 0) return { headers: [], rows: [] };

        const firstRowCells = Array.from(allRows[0].cells);
        const firstRowIsHeader = firstRowCells.length > 0 && firstRowCells.every((cell) => cell.tagName === 'TH');
        const headers = firstRowIsHeader ? firstRowCells.map((cell) => cell.textContent?.trim() ?? '') : [];
        const dataRows = firstRowIsHeader ? allRows.slice(1) : allRows;
        const rows = dataRows.map((row) => Array.from(row.cells).map((cell) => cell.textContent?.trim() ?? ''));
        return { headers, rows };
      }),

    /**
     * Parses the text content of the first element matching `selector` as
     * JSON — e.g. a <script type="application/ld+json"> block or a
     * framework's embedded state (<script id="__NEXT_DATA__">). Throws a
     * clean error naming the selector if no element matches or its text
     * isn't valid JSON, instead of leaking a raw SyntaxError.
     */
    extractJSON: (selector: string): Promise<unknown> =>
      page.locator(selector).first().evaluate((el, sel) => {
        const text = el.textContent ?? '';
        try {
          return JSON.parse(text);
        } catch {
          throw new Error(`extractJSON: element matching "${sel}" does not contain valid JSON`);
        }
      }, selector)
  };
}

/**
 * Runs one agent-authored JS snippet against a page in a single pass. The
 * snippet executes inside a Node `vm` context exposing only `tools` (see
 * buildTools) and a log-capturing `console` — no `require`, `process`, or
 * `fs` in scope.
 *
 * IMPORTANT: Node's `vm` module is explicitly documented as not a security
 * mechanism (https://nodejs.org/api/vm.html#vm-executing-javascript) — a
 * sufficiently determined malicious script can still escape it and reach
 * the host process. This bounds *accidental* misuse (typos, runaway loops,
 * stray Node global access) for trusted agent scripts; it is not a hardened
 * sandbox for untrusted code, and the WebSocket protocol has no
 * authentication of its own. Treat `browser.run` accordingly.
 */
export async function runAgentScript(
  page: Page,
  script: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<ToolRunOutcome> {
  const logs: string[] = [];
  const sandboxConsole = {
    log: (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    }
  };

  const context = vm.createContext({ tools: buildTools(page), console: sandboxConsole });
  const wrapped = `(async () => {\n${script}\n})()`;

  let compiled: vm.Script;
  try {
    compiled = new vm.Script(wrapped);
  } catch (err) {
    return { ok: false, error: `script failed to parse: ${(err as Error).message}`, logs };
  }

  try {
    const scriptPromise = Promise.resolve(compiled.runInContext(context, { timeout: timeoutMs }));
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`script timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    const result = await Promise.race([scriptPromise, timeout]);
    return { ok: true, result: result ?? null, logs };
  } catch (err) {
    return { ok: false, error: (err as Error).message, logs };
  }
}
