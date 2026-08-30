# Electron Desktop Shell

BrowseLens ships an Electron main process that wraps the shared Chromium
runtime and WebSocket protocol server in a desktop window. This is the
human-facing UI for managing Spaces, opening pages, and watching the
browser in real time.

## What it does

`src/main/electron.ts` is the Electron entry point. On startup it:

1. Bootstraps the shared Playwright Chromium process and the human's own
   `BrowserContext` (same as `npm run dev:electron` did before).
2. Starts the WebSocket protocol server on `ws://127.0.0.1:8765`.
3. Opens a 1200×800 `BrowserWindow` that loads `ui/index.html` directly
   from disk — no Vite dev server, no build step required for the renderer.
4. Installs `SIGINT`/`SIGTERM` handlers that call `closeBrowser()` so the
   human's cookies and localStorage are persisted on exit.

When the last Electron window closes, the app calls the same shutdown
handler (`closeBrowser().finally(() => process.exit(0))`), saving the
human's session to `~/.hermes-agent-browser/human.storage-state.json`.

## How to run

```bash
npm run dev
```

This runs `dev:electron` (Electron main process) and `dev:ui` (Vite dev
server) side by side via `concurrently`. The Electron window opens with
the dark-themed UI; the Vite server is a no-op today because the UI is
loaded directly from `ui/index.html`, not from Vite's module graph.

If you only want the Electron app without the Vite watcher:

```bash
npm run dev:electron
```

The UI connects to `ws://127.0.0.1:8765` on load. If the server isn't
running yet, click **Connect** once it is.

## UI layout

| Area | What it does |
|------|-------------|
| Header | BrowseLens title + connection status indicator |
| Sidebar | Space list, Create Space button + name input |
| Main panel | Selected space details: name, flags (import/privacy/record), allowlist/blocklist, and live page list |

All UI logic lives in `ui/app.ts` (compiled to `ui/app.js` for the
renderer) and uses the native `WebSocket` API — no frameworks, no
bundler, no external dependencies.

## Current limitations

- **No hot reload for the UI.** `ui/app.ts` is compiled to `ui/app.js`
  via `npm run build:ui` (or `npm run build`). During development you
  need to re-run that step after editing the UI source.
- **Vite dev server is unused for the UI.** `npm run dev:ui` still runs
  `vite`, but the Electron window loads `ui/index.html` from disk. The
  Vite server is preserved for future use when the UI grows beyond a
  single self-contained page.
- **No Linux package yet.** `electron-builder` config is not written.
  Building an AppImage or `.deb` is the next step after the UI shell is
  validated.
- **Renderer is not Node-integrated.** `nodeIntegration` is off and
  `contextIsolation` is on. The renderer can only use browser APIs
  (`WebSocket`, `DOM`) — it cannot `require()` modules.

## Building a Linux package (next step)

To ship BrowseLens as an installable Linux package, add `electron-builder`
to `devDependencies` and a `build` config to `package.json`:

```json
{
  "build": {
    "appId": "com.rhyovar.browselens",
    "linux": {
      "target": ["AppImage", "deb"],
      "category": "Development"
    }
  }
}
```

Then wire `dist` scripts into `package.json`:

```bash
npm run dist   # electron-builder produces AppImage + .deb in dist/
npm run dist:unpack   # unpack the AppImage for debugging
```

This is deferred because packaging a broken UI shell ships a broken
product — validate the Electron window and WS integration first.
