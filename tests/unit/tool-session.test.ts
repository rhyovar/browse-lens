import { describe, it, expect, afterAll } from 'vitest';

process.env.HERMES_HEADLESS = 'true';

const { closeBrowser } = await import('../../src/browser/context.js');
const { SpaceIsolation } = await import('../../src/space/isolation.js');
const { runAgentScript } = await import('../../src/agent/tool-session.js');

async function openPage(isolation: InstanceType<typeof SpaceIsolation>, url: string) {
  await isolation.open('space-a', url);
  const [{ id }] = isolation.list('space-a');
  const page = isolation.getPage('space-a', id);
  if (!page) throw new Error('page not found right after opening it');
  return page;
}

describe('runAgentScript', () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it('exposes tools.url() and tools.title()', async () => {
    const isolation = new SpaceIsolation();
    const page = await openPage(isolation, 'https://example.com');

    const outcome = await runAgentScript(page, 'return { url: tools.url(), title: await tools.title() };');

    expect(outcome.ok).toBe(true);
    expect(outcome).toMatchObject({ result: { url: 'https://example.com/' } });
    expect((outcome as { result: { title: string } }).result.title).toContain('Example');
    await isolation.closeAll('space-a');
  });

  it('composes fill + click + a follow-up read in one pass', async () => {
    const isolation = new SpaceIsolation();
    const page = await openPage(isolation, 'about:blank');
    await page.setContent(
      '<input id="name" /><button id="btn" onclick="document.title = document.getElementById(\'name\').value">Go</button>'
    );

    const outcome = await runAgentScript(
      page,
      `
      await tools.fill('#name', 'hermes');
      await tools.click('#btn');
      return await tools.title();
      `
    );

    expect(outcome).toMatchObject({ ok: true, result: 'hermes' });
    await isolation.closeAll('space-a');
  });

  it('returns a page snapshot as a string', async () => {
    const isolation = new SpaceIsolation();
    const page = await openPage(isolation, 'about:blank');
    await page.setContent('<button>Click me</button>');

    const outcome = await runAgentScript(page, 'return await tools.snapshot();');

    expect(outcome.ok).toBe(true);
    expect(typeof (outcome as { result: unknown }).result).toBe('string');
    expect((outcome as { result: string }).result).toContain('Click me');
    await isolation.closeAll('space-a');
  });

  it('captures console.log calls without touching real stdout', async () => {
    const isolation = new SpaceIsolation();
    const page = await openPage(isolation, 'about:blank');

    const outcome = await runAgentScript(page, "console.log('step', 1); return 'done';");

    expect(outcome.logs).toEqual(['step 1']);
    await isolation.closeAll('space-a');
  });

  it('reports a thrown error instead of crashing the server', async () => {
    const isolation = new SpaceIsolation();
    const page = await openPage(isolation, 'about:blank');

    const outcome = await runAgentScript(page, "throw new Error('boom');");

    expect(outcome.ok).toBe(false);
    expect((outcome as { error: string }).error).toContain('boom');
    await isolation.closeAll('space-a');
  });

  it('times out a script that never resolves', async () => {
    const isolation = new SpaceIsolation();
    const page = await openPage(isolation, 'about:blank');

    const outcome = await runAgentScript(page, 'await new Promise(() => {});', 200);

    expect(outcome.ok).toBe(false);
    expect((outcome as { error: string }).error).toMatch(/timed out/);
    await isolation.closeAll('space-a');
  }, 10_000);

  it('does not expose Node globals like process or require', async () => {
    const isolation = new SpaceIsolation();
    const page = await openPage(isolation, 'about:blank');

    const outcome = await runAgentScript(page, 'return { proc: typeof process, req: typeof require };');

    expect(outcome).toMatchObject({ ok: true, result: { proc: 'undefined', req: 'undefined' } });
    await isolation.closeAll('space-a');
  });

  it('waitForSelector resolves once an element already present is found', async () => {
    const isolation = new SpaceIsolation();
    const page = await openPage(isolation, 'about:blank');
    await page.setContent('<div id="ready">here</div>');

    const outcome = await runAgentScript(page, "await tools.waitForSelector('#ready'); return await tools.title();");

    expect(outcome).toMatchObject({ ok: true });
    await isolation.closeAll('space-a');
  });

  it('waitForSelector actually waits for an element added later, not just a one-time check', async () => {
    const isolation = new SpaceIsolation();
    const page = await openPage(isolation, 'about:blank');
    await page.setContent(`
      <div id="target" style="display:none">late</div>
      <script>
        setTimeout(() => { document.getElementById('target').style.display = 'block'; }, 300);
      </script>
    `);

    const outcome = await runAgentScript(
      page,
      "await tools.waitForSelector('#target', 2000); return await tools.snapshot();"
    );

    expect(outcome.ok).toBe(true);
    expect((outcome as { result: string }).result).toContain('late');
    await isolation.closeAll('space-a');
  });

  it('waitForSelector reports a clean timeout error when the element never appears', async () => {
    const isolation = new SpaceIsolation();
    const page = await openPage(isolation, 'about:blank');

    const outcome = await runAgentScript(page, "await tools.waitForSelector('#never-exists', 300); return 1;");

    expect(outcome.ok).toBe(false);
    expect((outcome as { error: string }).error.toLowerCase()).toContain('timeout');
    await isolation.closeAll('space-a');
  });

  it('scrapeTable extracts headers and rows from a <th>-headed table', async () => {
    const isolation = new SpaceIsolation();
    const page = await openPage(isolation, 'about:blank');
    await page.setContent(`
      <table id="data">
        <tr><th>Name</th><th>Score</th></tr>
        <tr><td>Alice</td><td>90</td></tr>
        <tr><td>Bob</td><td>85</td></tr>
      </table>
    `);

    const outcome = await runAgentScript(page, "return await tools.scrapeTable('#data');");

    expect(outcome).toMatchObject({
      ok: true,
      result: {
        headers: ['Name', 'Score'],
        rows: [
          ['Alice', '90'],
          ['Bob', '85']
        ]
      }
    });
    await isolation.closeAll('space-a');
  });

  it('scrapeTable treats every row as data when there is no <th> header row', async () => {
    const isolation = new SpaceIsolation();
    const page = await openPage(isolation, 'about:blank');
    await page.setContent(`
      <table id="data">
        <tr><td>alpha</td><td>beta</td></tr>
        <tr><td>gamma</td><td>delta</td></tr>
      </table>
    `);

    const outcome = await runAgentScript(page, "return await tools.scrapeTable('#data');");

    expect(outcome).toMatchObject({
      ok: true,
      result: {
        headers: [],
        rows: [
          ['alpha', 'beta'],
          ['gamma', 'delta']
        ]
      }
    });
    await isolation.closeAll('space-a');
  });

  it('extractJSON parses the text content of a matching element', async () => {
    const isolation = new SpaceIsolation();
    const page = await openPage(isolation, 'about:blank');
    await page.setContent(`
      <script id="data" type="application/json">{"name":"hermes","count":3}</script>
    `);

    const outcome = await runAgentScript(page, "return await tools.extractJSON('#data');");

    expect(outcome).toMatchObject({ ok: true, result: { name: 'hermes', count: 3 } });
    await isolation.closeAll('space-a');
  });

  it('extractJSON reports a clean error when the element text is not valid JSON', async () => {
    const isolation = new SpaceIsolation();
    const page = await openPage(isolation, 'about:blank');
    await page.setContent('<script id="data" type="application/json">not json</script>');

    const outcome = await runAgentScript(page, "return await tools.extractJSON('#data');");

    expect(outcome.ok).toBe(false);
    expect((outcome as { error: string }).error).toContain('does not contain valid JSON');
    await isolation.closeAll('space-a');
  });

  it('monitorNetwork records requests made during the watch window', async () => {
    const isolation = new SpaceIsolation();
    const page = await openPage(isolation, 'about:blank');
    await page.route('https://fake.test/pixel.png', (route) =>
      route.fulfill({ status: 204, contentType: 'text/plain', body: '' })
    );
    await page.setContent(
      `<button id="btn" onclick="fetch('https://fake.test/pixel.png').catch(() => {})">Go</button>`
    );

    const outcome = await runAgentScript(
      page,
      `
      const events = tools.monitorNetwork(500);
      await tools.click('#btn');
      return await events;
      `
    );

    expect(outcome.ok).toBe(true);
    const events = (outcome as { result: unknown[] }).result;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ url: 'https://fake.test/pixel.png', method: 'GET', status: 204, type: 'fetch' });
    expect(typeof (events[0] as { timestamp: number }).timestamp).toBe('number');
    await isolation.closeAll('space-a');
  }, 10_000);

  it('monitorNetwork returns an empty array when no requests occur during the window', async () => {
    const isolation = new SpaceIsolation();
    const page = await openPage(isolation, 'about:blank');

    const outcome = await runAgentScript(page, 'return await tools.monitorNetwork(200);');

    expect(outcome).toMatchObject({ ok: true, result: [] });
    await isolation.closeAll('space-a');
  }, 10_000);

  it('monitorNetwork does not leak its listener across repeated calls', async () => {
    const isolation = new SpaceIsolation();
    const page = await openPage(isolation, 'about:blank');
    await page.route('https://fake.test/pixel.png', (route) =>
      route.fulfill({ status: 204, contentType: 'text/plain', body: '' })
    );
    await page.setContent(
      `<button id="btn" onclick="fetch('https://fake.test/pixel.png').catch(() => {})">Go</button>`
    );

    const outcome = await runAgentScript(
      page,
      `
      let first = tools.monitorNetwork(300);
      await tools.click('#btn');
      first = await first;

      let second = tools.monitorNetwork(300);
      await tools.click('#btn');
      second = await second;

      return { first, second };
      `
    );

    expect(outcome.ok).toBe(true);
    const { first, second } = (outcome as { result: { first: unknown[]; second: unknown[] } }).result;
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    await isolation.closeAll('space-a');
  }, 10_000);
});
