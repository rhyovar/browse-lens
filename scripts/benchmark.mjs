#!/usr/bin/env node
// Deterministic browser-automation benchmark: BrowseLens vs. other agent
// browser tools, on a small fixed task corpus with explicit pass/fail
// checks (no LLM judge). See docs/BENCHMARK.md for methodology.
//
// Requires `npm run dev:electron` already running (HERMES_HEADLESS=true
// recommended for fair, fast timing) — same precondition as `npm run validate`.
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import WebSocket from 'ws';

const WS_URL = process.env.HERMES_WS_URL ?? 'ws://127.0.0.1:8765';

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
    check: (result) => result === 'BrowseLens Benchmark Fixture'
  },
  {
    id: 'click-selector',
    description: 'Click a known selector and observe the resulting DOM change',
    script: "await tools.click('#click-target'); return await tools.snapshot();",
    check: (result) => typeof result === 'string' && result.includes('clicked')
  },
  {
    id: 'fill-form-field',
    description: 'Fill a form field and observe the resulting DOM change',
    script: "await tools.fill('#fill-target', 'benchmark-value'); return await tools.snapshot();",
    check: (result) => typeof result === 'string' && result.includes('benchmark-value')
  },
  {
    id: 'scrape-table-cell',
    description: 'Read a known table cell value from the page',
    script: 'return await tools.snapshot();',
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

// --- Adapters for the comparison tools named in the roadmap. Neither is
// wired up yet: browser-use isn't installed in this environment, and
// "agent-browser" doesn't unambiguously identify one package. These report
// `skipped` with a reason instead of fabricating pass/fail numbers.
function detectBrowserUse() {
  try {
    execFileSync('python3', ['-c', 'import browser_use'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function unavailableAdapter(tool, reason) {
  return async (task) => ({ tool, task: task.id, status: 'skipped', elapsedMs: null, detail: reason });
}

const ADAPTERS = [
  { name: 'browselens', run: runBrowseLensTask },
  {
    name: 'browser-use',
    run: detectBrowserUse()
      ? unavailableAdapter('browser-use', 'detected but adapter not implemented yet')
      : unavailableAdapter('browser-use', 'not installed (pip install browser-use)')
  },
  {
    name: 'agent-browser',
    run: unavailableAdapter('agent-browser', 'not wired up — which package does this name refer to?')
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
      console.log(`${result.status.padEnd(7)} ${result.tool.padEnd(12)} ${result.task.padEnd(18)} ${timing}${detail}`);
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
