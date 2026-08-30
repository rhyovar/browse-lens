#!/usr/bin/env node
// Deterministic browser-automation benchmark: BrowseLens vs. other agent
// browser tools, on a small fixed task corpus. BrowseLens and agent-browser
// are given the exact fixed steps to perform; browser-use is given the
// task's goal in plain English and its own LLM decides the steps (see
// docs/BENCHMARK.md's methodology note). Every task still ends with the
// same explicit, code-level pass/fail check — no LLM judge.
//
// Requires `npm run dev:electron` already running (HERMES_HEADLESS=true
// recommended for fair, fast timing) — same precondition as `npm run validate`.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

const WS_URL = process.env.HERMES_WS_URL ?? 'ws://127.0.0.1:8765';
const AGENT_BROWSER_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'agent-browser');
const BROWSER_USE_PYTHON = path.join(REPO_ROOT, '.venv-browser-use', 'bin', 'python3');
const BROWSER_USE_SCRIPT = path.join(__dirname, 'browser_use_task.py');
const EXEC_TIMEOUT_MS = 60_000;

const FIXTURE_HTML = `<!doctype html>
<html>
<head><title>BrowseLens Benchmark Fixture</title></head>
<body>
  <h1>Benchmark Fixture</h1>
  <button id="click-target" onclick="document.getElementById('click-result').textContent = 'clicked'">Click me</button>
  <div id="click-result">not clicked</div>
  <input id="fill-target" oninput="document.getElementById('fill-result').textContent = this.value" />
  <div id="fill-result">empty</div>
  <table>
    <tr><td id="cell-a1">alpha</td><td id="cell-a2">beta</td></tr>
    <tr><td id="cell-b1">gamma</td><td id="cell-b2">delta</td></tr>
  </table>
</body>
</html>`;

function startFixtureServer() {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(FIXTURE_HTML);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

const TASKS = [
  {
    id: 'open-url',
    description: 'Open a URL and read the page title',
    script: 'return await tools.title();',
    goal: 'Report the exact title of the current page.',
    agentBrowserSteps: (run) => run(['get', 'title']).trim(),
    check: (result) => result === 'BrowseLens Benchmark Fixture'
  },
  {
    id: 'click-selector',
    description: 'Click a known selector and observe the resulting DOM change',
    script: "await tools.click('#click-target'); return await tools.snapshot();",
    goal: 'Click the button that says "Click me".',
    agentBrowserSteps: (run) => {
      run(['click', '#click-target']);
      return run(['snapshot']);
    },
    check: (result) => typeof result === 'string' && result.includes('clicked')
  },
  {
    id: 'fill-form-field',
    description: 'Fill a form field and observe the resulting DOM change',
    script: "await tools.fill('#fill-target', 'benchmark-value'); return await tools.snapshot();",
    goal: 'Type the text "benchmark-value" into the empty text input field on the page.',
    agentBrowserSteps: (run) => {
      run(['fill', '#fill-target', 'benchmark-value']);
      return run(['snapshot']);
    },
    check: (result) => typeof result === 'string' && result.includes('benchmark-value')
  },
  {
    id: 'scrape-table-cell',
    description: 'Read a known table cell value from the page',
    script: 'return await tools.snapshot();',
    goal: 'Find the table cell in the second row, first column, and report its exact text content.',
    agentBrowserSteps: (run) => run(['snapshot']),
    check: (result) => typeof result === 'string' && result.includes('gamma')
  }
];

// --- BrowseLens adapter: drives the real WebSocket protocol, timing only browser.run ---
async function runBrowseLensTask(task, fixtureUrl) {
  const ws = new WebSocket(WS_URL);
  const send = (type, payload) => ws.send(JSON.stringify({ type, payload }));
  const nextMessage = () =>
    new Promise((resolve, reject) => {
      ws.once('message', (raw) => resolve(JSON.parse(raw.toString())));
      ws.once('error', reject);
    });

  try {
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    send('space.create', { name: `bench-${task.id}` });
    const { payload: space } = await nextMessage();

    send('browser.open', { spaceId: space.id, url: fixtureUrl });
    const { payload: page } = await nextMessage();

    const started = performance.now();
    send('browser.run', { spaceId: space.id, pageId: page.id, script: task.script });
    const ran = await nextMessage();
    const elapsedMs = performance.now() - started;

    send('space.close', { spaceId: space.id });
    await nextMessage();

    if (ran.type !== 'browser.ran' || !ran.payload.ok) {
      const detail = ran.payload?.error ?? ran.payload?.message ?? `unexpected response: ${ran.type}`;
      return { tool: 'browselens', task: task.id, status: 'fail', elapsedMs, detail };
    }

    const passed = task.check(ran.payload.result);
    return { tool: 'browselens', task: task.id, status: passed ? 'pass' : 'fail', elapsedMs };
  } catch (err) {
    return { tool: 'browselens', task: task.id, status: 'fail', elapsedMs: null, detail: err.message };
  } finally {
    ws.close();
  }
}

// --- agent-browser adapter: same fixed steps as BrowseLens, via its CLI ---
function hasAgentBrowserCli() {
  return fs.existsSync(AGENT_BROWSER_BIN);
}

async function runAgentBrowserTask(task, fixtureUrl) {
  const sessionName = `bench-${task.id}-${Date.now()}`;
  const run = (args) =>
    execFileSync(AGENT_BROWSER_BIN, ['--session', sessionName, ...args], {
      encoding: 'utf8',
      timeout: EXEC_TIMEOUT_MS
    });

  try {
    run(['open', fixtureUrl]);

    const started = performance.now();
    const result = task.agentBrowserSteps(run);
    const elapsedMs = performance.now() - started;

    const passed = task.check(result);
    return { tool: 'agent-browser', task: task.id, status: passed ? 'pass' : 'fail', elapsedMs };
  } catch (err) {
    return { tool: 'agent-browser', task: task.id, status: 'fail', elapsedMs: null, detail: err.message };
  } finally {
    try {
      run(['close']);
    } catch {
      // best-effort cleanup
    }
  }
}

// --- browser-use adapter: goal-driven — its own LLM decides the action
// sequence for task.goal, we only check the resulting page state.
function hasBrowserUseVenv() {
  return fs.existsSync(BROWSER_USE_PYTHON);
}

async function runBrowserUseTask(task, fixtureUrl) {
  const started = performance.now();
  let stdout;
  try {
    stdout = execFileSync(BROWSER_USE_PYTHON, [BROWSER_USE_SCRIPT, fixtureUrl, task.goal, task.id], {
      encoding: 'utf8',
      timeout: EXEC_TIMEOUT_MS
    });
  } catch (err) {
    const elapsedMs = performance.now() - started;
    // exit code 2 = the script's own "no LLM credentials" skip signal
    if (err.status === 2 && err.stdout) {
      const outcome = JSON.parse(err.stdout);
      return { tool: 'browser-use', task: task.id, status: 'skipped', elapsedMs: null, detail: outcome.error };
    }
    const detail = err.stdout ? `${err.message}: ${err.stdout}` : err.message;
    return { tool: 'browser-use', task: task.id, status: 'fail', elapsedMs, detail };
  }
  const elapsedMs = performance.now() - started;

  const outcome = JSON.parse(stdout.trim().split('\n').pop());
  if (!outcome.ok) {
    return { tool: 'browser-use', task: task.id, status: 'fail', elapsedMs, detail: outcome.error };
  }

  const passed = task.check(outcome.result);
  return { tool: 'browser-use', task: task.id, status: passed ? 'pass' : 'fail', elapsedMs };
}

function unavailableAdapter(tool, reason) {
  return async (task) => ({ tool, task: task.id, status: 'skipped', elapsedMs: null, detail: reason });
}

const ADAPTERS = [
  { name: 'browselens', run: runBrowseLensTask },
  {
    name: 'agent-browser',
    run: hasAgentBrowserCli()
      ? runAgentBrowserTask
      : unavailableAdapter('agent-browser', 'not installed (npm install --save-dev agent-browser)')
  },
  {
    name: 'browser-use',
    run: hasBrowserUseVenv()
      ? runBrowserUseTask
      : unavailableAdapter(
          'browser-use',
          'no .venv-browser-use found — see docs/BENCHMARK.md for setup (needs an LLM API key too)'
        )
  }
];

async function main() {
  const { server, url: fixtureUrl } = await startFixtureServer();
  console.log(`fixture served at ${fixtureUrl}\n`);

  const results = [];
  for (const adapter of ADAPTERS) {
    for (const task of TASKS) {
      const result = await adapter.run(task, fixtureUrl);
      results.push(result);
      const timing = result.elapsedMs != null ? `${result.elapsedMs.toFixed(1)}ms` : '-';
      const detail = result.detail ? `  (${result.detail})` : '';
      console.log(`${result.status.padEnd(7)} ${result.tool.padEnd(14)} ${result.task.padEnd(18)} ${timing}${detail}`);
    }
  }

  server.close();

  console.log('\nsummary:');
  for (const adapter of ADAPTERS) {
    const adapterResults = results.filter((r) => r.tool === adapter.name);
    const passed = adapterResults.filter((r) => r.status === 'pass').length;
    const skipped = adapterResults.filter((r) => r.status === 'skipped').length;
    const note = skipped === adapterResults.length ? ' (entirely skipped)' : '';
    console.log(`  ${adapter.name}: ${passed}/${adapterResults.length} passed${note}`);
  }

  const anyFailed = results.some((r) => r.status === 'fail');
  process.exitCode = anyFailed ? 1 : 0;
}

main().catch((err) => {
  console.error('benchmark failed to run:', err);
  console.error('is the app running? try: HERMES_HEADLESS=true npm run dev:electron');
  process.exitCode = 1;
});
