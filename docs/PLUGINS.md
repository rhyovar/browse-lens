# Plugin system

A plugin is a regular npm package that packages up named, ready-made
`browser.run` scripts — "login to Gmail," "scrape a product page," "submit
a contact form" — so an agent can reference them by name instead of
hand-writing the script every time. This is **not** a new execution
surface: a plugin's script still runs through the exact same
`runAgentScript` vm sandbox as a hand-written script does, with the same
trust boundary. A plugin is data (a script template), not new server-side
code execution.

A general allow/block domain list and richer per-space network/tool
extension points (new sandbox `tools.*` functions, new WebSocket message
types) were both considered and explicitly not built here — this ships
the smallest thing that's immediately useful: named, parameterized scripts
resolved server-side, reusing `browser.run` unchanged apart from one new
optional field.

## Using a plugin

Reference it from `browser.run` with `plugin` instead of `script`:

```json
{
  "type": "browser.run",
  "payload": {
    "spaceId": "...",
    "pageId": "...",
    "plugin": { "package": "browselens-plugin-example", "name": "readTitle" }
  }
}
```

`payload` must have **exactly one** of `script` or `plugin` — both or
neither is rejected with a top-level `error` message before anything
runs. `plugin.params` is optional:

```json
{
  "type": "browser.run",
  "payload": {
    "spaceId": "...",
    "pageId": "...",
    "plugin": {
      "package": "browselens-plugin-example",
      "name": "fillAndSubmit",
      "params": { "selector": "#email", "value": "test@example.com", "submitSelector": "#go" }
    }
  }
}
```

The plugin package must be installed (`npm install <package>`) wherever
the BrowseLens server runs — it's resolved via Node's normal module
resolution (`import(packageName)`), not fetched or sandboxed specially.
The response is identical either way: `browser.ran` with
`{ pageId, ok, result | error, logs }` — see
[tool-reference.md](../skills/browse-lens/references/tool-reference.md#browserrun--the-agent-tool-surface).
If the package or script name doesn't resolve, you get a top-level
`error` instead (a resolution failure, before any script runs) — see
`resolveScript` in `src/agent/plugins.ts`.

## Authoring a plugin

A plugin's default export (or its module's sole export, if the package
has no `default`) must be:

```ts
{
  name: string;
  scripts: Record<string, (params: Record<string, unknown>) => string>;
}
```

Each function returns exactly the JS you'd otherwise put in `browser.run`'s
`script` field. See
[`examples/browselens-plugin-example`](../examples/browselens-plugin-example)
for a working, minimal template (installed in this repo as a
`file:`-referenced devDependency so `tests/unit/plugins.test.ts` can
exercise real npm resolution, not a mock).

```js
export default {
  name: 'example',
  scripts: {
    readTitle: () => 'return await tools.title();',
    fillAndSubmit: (params) => `
      await tools.fill(${JSON.stringify(params.selector)}, ${JSON.stringify(params.value)});
      await tools.click(${JSON.stringify(params.submitSelector)});
      return await tools.snapshot();
    `
  }
};
```

**Always `JSON.stringify` a param before interpolating it into the
returned script string.** Two reasons, not one:

1. **Correctness**: a param containing a quote, backslash, or newline
   breaks the generated script's syntax with raw string interpolation.
   `JSON.stringify` escapes it correctly regardless of content — verified
   in `tests/unit/plugins.test.ts` and with a live value containing both
   `"` and `'` in manual testing.
2. **Safety**: raw interpolation lets a caller's param value break out of
   the intended expression and inject arbitrary script text. The injected
   text still only reaches the same vm sandbox a hand-written script would
   (no bigger a trust boundary than today), but there's no reason to allow
   it — `JSON.stringify` costs nothing and closes it off.

## Testing your plugin locally

Install it as a local dependency the same way this repo does for its
example (works for any local path, no publishing required):

```bash
npm install --save-dev file:../path/to/your-plugin
```

Then reference it by package name from `browser.run` as shown above.
