#!/usr/bin/env node
// browse-lens: an agent-facing CLI over the BrowseLens WebSocket protocol.
// One subcommand per WebSocket message (see docs/CLI.md) — this replaces
// hand-built WebSocket JSON as the way an agent drives BrowseLens.
//
// Usage: browse-lens <command> [args...]
// Requires `npm run dev:electron` already running.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const WS_URL = process.env.HERMES_WS_URL ?? 'ws://127.0.0.1:8765';

const USAGE = `browse-lens: agent CLI for BrowseLens (ws://127.0.0.1:8765)

Usage:
  browse-lens create <name> [--import] [--record] [--privacy]
  browse-lens open <spaceId> <url>
  browse-lens run <spaceId> <pageId> <script...>
  browse-lens run <spaceId> <pageId> --plugin <package> --script-name <name> [--params <json>]
  browse-lens list <spaceId>
  browse-lens close <spaceId>              # closes the Space
  browse-lens close <spaceId> <pageId>     # closes one page

Requires the app running: HERMES_HEADLESS=true npm run dev:electron`;

function fail(message, code = 1) {
  console.error(message);
  process.exitCode = code;
}

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.once('open', () => resolve(ws));
    ws.once('error', (err) => reject(new Error(`could not connect to ${WS_URL}: ${err.message}`)));
  });
}

function send(ws, type, payload) {
  ws.send(JSON.stringify({ type, payload }));
}

function nextMessage(ws) {
  return new Promise((resolve, reject) => {
    ws.once('message', (raw) => {
      try {
        resolve(JSON.parse(raw.toString()));
      } catch {
        reject(new Error(`received malformed (non-JSON) response from server: ${raw.toString()}`));
      }
    });
    ws.once('error', (err) => reject(new Error(`connection error while waiting for a response: ${err.message}`)));
  });
}

function parseCreateArgs(args) {
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const name = args.find((a) => !a.startsWith('--'));
  return {
    name,
    importProfile: flags.has('--import'),
    record: flags.has('--record'),
    privacy: flags.has('--privacy')
  };
}

function parseRunArgs(args) {
  const pluginIndex = args.indexOf('--plugin');
  if (pluginIndex === -1) {
    const [spaceId, pageId, ...scriptParts] = args;
    return { spaceId, pageId, script: scriptParts.join(' ') || undefined };
  }

  const [spaceId, pageId] = args;
  const pkg = args[pluginIndex + 1];
  const nameIndex = args.indexOf('--script-name');
  const name = nameIndex === -1 ? undefined : args[nameIndex + 1];
  const paramsIndex = args.indexOf('--params');
  const params = paramsIndex === -1 ? {} : JSON.parse(args[paramsIndex + 1]);
  return { spaceId, pageId, plugin: pkg && name ? { package: pkg, name, params } : undefined };
}

const RUN_USAGE =
  'usage: browse-lens run <spaceId> <pageId> <script...>\n' +
  '   or: browse-lens run <spaceId> <pageId> --plugin <package> --script-name <name> [--params <json>]';

/** Validates argv and builds the { type, payload } to send, or returns a usage error string. */
export function buildMessage(command, args) {
  switch (command) {
    case 'create': {
      const { name, importProfile, record, privacy } = parseCreateArgs(args);
      if (!name) return { usageError: 'usage: browse-lens create <name> [--import] [--record] [--privacy]' };
      return { type: 'space.create', payload: { name, importProfile, record, privacy } };
    }
    case 'open': {
      const [spaceId, url] = args;
      if (!spaceId || !url) return { usageError: 'usage: browse-lens open <spaceId> <url>' };
      return { type: 'browser.open', payload: { spaceId, url } };
    }
    case 'run': {
      const payload = parseRunArgs(args);
      if (!payload.spaceId || !payload.pageId || (!payload.script && !payload.plugin)) {
        return { usageError: RUN_USAGE };
      }
      return { type: 'browser.run', payload };
    }
    case 'list': {
      const [spaceId] = args;
      if (!spaceId) return { usageError: 'usage: browse-lens list <spaceId>' };
      return { type: 'browser.list', payload: { spaceId } };
    }
    case 'close': {
      const [spaceId, pageId] = args;
      if (!spaceId) return { usageError: 'usage: browse-lens close <spaceId> [pageId]' };
      return pageId
        ? { type: 'browser.close', payload: { spaceId, pageId } }
        : { type: 'space.close', payload: { spaceId } };
    }
    default:
      return { usageError: `unknown command: ${command}\n\n${USAGE}` };
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    process.exitCode = command ? 0 : 1;
    return;
  }

  const built = buildMessage(command, args);
  if (built.usageError) {
    return fail(built.usageError);
  }

  let ws;
  try {
    ws = await connect();
  } catch (err) {
    return fail(`${err.message}\nis the app running? try: HERMES_HEADLESS=true npm run dev:electron`);
  }

  try {
    send(ws, built.type, built.payload);
    const msg = await nextMessage(ws);

    if (msg.type === 'error') {
      return fail(msg.payload.message);
    }

    console.log(JSON.stringify(msg, null, 2));
    if (msg.type === 'browser.ran' && !msg.payload.ok) {
      process.exitCode = 1;
    }
  } catch (err) {
    fail(err.message);
  } finally {
    ws.close();
  }
}

// process.argv[1] is the path node was invoked with — under a bin symlink
// (npx/npm link), that differs from this file's own real path unless both
// are resolved through any symlinks first.
const isMain = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    fail(err.message);
  });
}
