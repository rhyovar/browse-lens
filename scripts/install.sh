#!/usr/bin/env bash
# Linux installer for hermes-agent-browser.
#
# Installs npm dependencies and fetches Playwright's Chromium build. Works
# on any Linux with Node + npm; on Debian/Ubuntu it can also install the
# OS packages Chromium needs (via `playwright install --with-deps`).
set -euo pipefail

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: '$1' is required but not found on PATH." >&2
    exit 1
  fi
}

require_cmd node
require_cmd npm

MIN_NODE_MAJOR=20
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt "$MIN_NODE_MAJOR" ]; then
  echo "error: Node.js >= ${MIN_NODE_MAJOR} required, found $(node -v)." >&2
  exit 1
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "==> installing npm dependencies"
npm install

echo "==> fetching Playwright's Chromium build"
if command -v apt-get >/dev/null 2>&1 && npx playwright install --with-deps chromium; then
  : # OS packages + browser both installed
else
  # Either not apt-based, or --with-deps failed (e.g. no passwordless sudo).
  npx playwright install chromium
  cat >&2 <<'EOF'
note: skipped OS-level Chromium dependencies (playwright install --with-deps
needs an apt-based distro and root/passwordless sudo). If `npm run dev`
fails to launch the browser, install your distro's Chromium/Chrome runtime
dependencies manually (see Playwright's system dependencies docs) and
re-run this step.
EOF
fi

echo "==> done. Start the app with: npm run dev"
