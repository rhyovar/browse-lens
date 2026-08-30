# Installing BrowseLens

BrowseLens lives in the `hermes-agent-browser` repo. One script handles
install for every setup below: `./scripts/install.sh` checks for Node
`>=20`, runs `npm install`, and fetches Playwright's Chromium build
(trying `playwright install --with-deps` on apt-based distros, falling
back to a browser-only install elsewhere).

```bash
git clone https://github.com/rhyovar/hermes-agent-browser.git
cd hermes-agent-browser
./scripts/install.sh
```

Then pick the setup that matches what you need:

- **Just running an agent against it:** `npm run dev:electron` — starts the
  shared Chromium process and the protocol server on `ws://127.0.0.1:8765`.
- **With Chrome profile import:** same as above, but log into whatever
  sites a Space should be able to reach in the Chromium window first, then
  `Ctrl+C` to persist that session before agents request `importProfile: true`.
- **Working on BrowseLens itself:** `npm run dev` (adds the Vite dev
  server) plus `npm test` and `npm run validate`.

Full detail on all three, including what each one actually gives you, is
in the main [README's Install section](../../README.md#install).
