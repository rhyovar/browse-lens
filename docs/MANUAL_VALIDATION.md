# Manual validation flow

A human walkthrough that exercises the whole stack — shared Chromium
instance, Space isolation, and the WebSocket protocol — and confirms the
core promise ("your tabs stay yours") by eye, not just by test assertions.
Run this after any change to `src/browser/`, `src/space/`, or
`src/protocol/`.

## Prerequisites

```bash
npm install
npx playwright install chromium   # once, if not already fetched
```

You need a real display (this launches Chromium headed, i.e.
`HERMES_HEADLESS` unset) so you can actually see the shared window.

## 1. Start the app

```bash
npm run dev:electron
```

Confirm in the terminal:
- `hermes-agent-browser protocol listening on ws://127.0.0.1:8765`
- `browser ready`

A Chromium window should appear (empty — no page opened yet). Leave this
running; do the rest in a second terminal.

## 2. Drive it with the validation CLI

```bash
npm run validate
```

This opens an interactive prompt connected to the running server. Run
`help` to see the command list. Step through the script below, checking
the Chromium window after each `open`/`close` step.

## 3. Walkthrough

1. `space create demo-a` — note the returned `id` as `A`.
2. `space create demo-b` — note the returned `id` as `B`.
3. `open A https://example.com`
   - **Check:** a new tab appears in the shared Chromium window showing
     example.com. Note the returned page `id` as `P1`.
4. `open B https://www.iana.org/help/example-domains`
   - **Check:** a second tab appears alongside the first.
5. `list A`
   - **Check:** only `P1` (example.com) is returned — not the IANA page.
6. `list B`
   - **Check:** only the IANA page is returned — not `P1`.
7. Open a third tab **yourself**, by hand, in the same Chromium window
   (e.g. navigate to any site).
   - **Check:** `list A` and `list B` still don't mention your tab — pages
     opened outside a Space are invisible to every Space.
8. `close A <B's page id>` (deliberately using the wrong Space).
   - **Check:** the response is `closed: false`, and the IANA tab is
     **still open** in the browser window — a Space cannot close another
     Space's tab.
9. `close B <B's page id>` (the correct owner).
   - **Check:** the response is `closed: true`, and the IANA tab closes.
10. `space close A`
    - **Check:** the response is `closed: true`, and the example.com tab
      closes automatically. Your hand-opened tab from step 7 is untouched.
11. `quit` to exit the CLI. Stop the app with `Ctrl+C` in the first
    terminal.

## What "pass" looks like

- Every `list`/`close` call only ever affects the Space that made it.
- Tabs opened by hand (outside any Space) are never listed or closed by
  Space operations.
- Closing a Space tears down exactly its own tabs and nothing else.
- No step above required restarting the app or the browser window.

If any check fails, it's a regression in `src/space/isolation.ts` or its
wiring in `src/protocol/ws-server.ts` — see
[../README.md](../README.md#space-isolation) for how that's supposed to work.
