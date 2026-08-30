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
function buildTools(page: Page) {
  return {
    snapshot: () => page.locator('body').ariaSnapshot({ mode: 'ai' }),
    click: (selector: string) => page.click(selector),
    fill: (selector: string, text: string) => page.fill(selector, text),
    scroll: (deltaX: number, deltaY: number) => page.mouse.wheel(deltaX, deltaY),
    waitForLoad: () => page.waitForLoadState('networkidle'),
    url: () => page.url(),
    title: () => page.title(),
    capture: async () => (await page.screenshot()).toString('base64')
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
