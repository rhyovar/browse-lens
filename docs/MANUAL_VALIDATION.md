# Manual validation flow

A human walkthrough that exercises the whole stack — the shared Chromium
process, per-Space `BrowserContext` isolation, and the WebSocket protocol —
and confirms the core promise ("your tabs stay yours") by eye, not just by
test assertions. Run this after any change to `src/browser/`, `src/space/`,
or `src/protocol/`.

## Prerequisites

```bash
./scripts/install.sh
```

You need a real display (this launches Chromium headed, i.e.
`HERMES_HEADLESS` unset) so you can actually see the windows.

## 1. Start the app

```bash
npm run dev:electron
```

Confirm in the terminal:
- `hermes-agent-browser protocol listening on ws://127.0.0.1:8765`
- `browser ready`

One Chromium window should appear — this is the human's own context, empty
(a blank tab). Leave this running; do the rest in a second terminal.

## 2. Drive it with the validation CLI

```bash
npm run validate
```

This opens an interactive prompt connected to the running server. Run
`help` to see the command list. Step through the script below, watching
the Chromium windows after each `open`/`close` step.

## 3. Walkthrough

1. `space create demo-a` — note the returned `id` as `A`.
2. `space create demo-b` — note the returned `id` as `B`.
3. `open A https://example.com`
   - **Check:** a **new window** appears (a Space is its own
     `BrowserContext`, and Chromium renders each context as its own OS
     window — not a tab in the human's window) showing example.com. Note
     the returned page `id` as `P1`.
4. `open B https://www.iana.org/help/example-domains`
   - **Check:** a third window appears (human + Space A + Space B), not a
     tab in either existing window.
5. `open A https://www.wikipedia.org`
   - **Check:** this opens as a **new tab in Space A's existing window** —
     pages within the same Space share one window, only different Spaces
     get different windows.
6. `list A`
   - **Check:** both of Space A's pages (`P1` and the Wikipedia page) are
     returned — not the IANA page from Space B.
7. `list B`
   - **Check:** only the IANA page is returned.
8. In Space A's window, open the browser devtools console on the
   example.com tab and run `localStorage.setItem('probe', 'space-a')`.
   Do the same in Space B's window on its tab, but run
   `localStorage.getItem('probe')` instead.
   - **Check:** it returns `null` in Space B — Space A's `localStorage`
     isn't visible to Space B (or the human's window). This is the real
     hardening: not just "different tabs," but a different cookie
     jar/storage per Space.
9. In the human's window, open a page yourself by hand (e.g. navigate to
   any site in that same window).
   - **Check:** `list A` and `list B` still don't mention it — pages
     opened in the human's context are invisible to every Space.
10. `close A <B's page id>` (deliberately using the wrong Space).
    - **Check:** the response is `closed: false`, and the IANA tab in
      Space B's window is **still open** — a Space cannot close another
      Space's tab.
11. `close B <B's page id>` (the correct owner).
    - **Check:** the response is `closed: true`, and Space B's window
      closes (it was its only tab).
12. `space close A`
    - **Check:** the response is `closed: true`, and Space A's entire
      window closes — both its tabs, and its cookies/localStorage are gone
      with it. The human's window is untouched.
13. In the human's window, log into any site by hand (or open the devtools
    console and run `document.cookie = 'probe=human-value'` on some page).
14. `space create demo-c --import`, note the `id` as `C`. Then
    `open C <same site or URL from step 13>`.
    - **Check:** the new window for Space C is already logged in / has
      `document.cookie` containing `probe=human-value` — it inherited a
      snapshot of the human's session, unlike `demo-a`/`demo-b` above.
15. `space create demo-d` (no `--import`), then open the same URL there.
    - **Check:** this one is *not* logged in / has no `probe` cookie —
      confirming import is opt-in, not automatic.
16. `space create demo-e`, note the `id` as `E`, then
    `open E https://example.com`, note the page `id` as `P2`.
17. `run E P2 return await tools.title();`
    - **Check:** the response is `browser.ran` with `result: "Example Domain"` —
      one script, one round-trip, no separate snapshot/act/read messages.
18. `run E P2 return await tools.snapshot();`
    - **Check:** `result` is a text tree mentioning the page's visible
      content (headings, links) — this is what an agent reads to decide
      what to click next.
19. `run E P2 throw new Error('boom');`
    - **Check:** the response has `ok: false` and `error` containing
      `"boom"` — a thrown error comes back as data, not a dropped
      connection.
20. `quit` to exit the CLI. Stop the app with `Ctrl+C` in the first
    terminal — this saves the human's session (cookies/localStorage) to
    `~/.hermes-agent-browser/human.storage-state.json` so it's there next
    time; killing the process instead (`kill -9`) skips that save.

## What "pass" looks like

- Each Space gets its own window and its own cookie jar/localStorage —
  verified in step 8, not just inferred from tab lists.
- `importProfile`/`--import` is opt-in: only a Space created with it
  inherits the human's session (step 14); one created without it doesn't
  (step 15).
- Every `list`/`close` call only ever affects the Space that made it.
- Pages opened by hand in the human's window are never listed or closed by
  Space operations.
- Closing a Space tears down exactly its own window (pages, cookies,
  storage) and nothing else.
- `browser.run` (steps 17–19) does a whole read-act-read workflow in one
  message, and a thrown error inside the script comes back as `ok: false`
  rather than crashing the connection.
- No step above required restarting the app.

If any check fails, it's a regression in `src/space/isolation.ts`,
`src/browser/context.ts`, or their wiring in `src/protocol/ws-server.ts` —
see [../README.md](../README.md#space-isolation) for how that's supposed to
work.
