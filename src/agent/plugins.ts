export interface BrowseLensPlugin {
  name: string;
  scripts: Record<string, (params: Record<string, unknown>) => string>;
}

function isBrowseLensPlugin(value: unknown): value is BrowseLensPlugin {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<BrowseLensPlugin>;
  return typeof candidate.name === 'string' && typeof candidate.scripts === 'object' && candidate.scripts !== null;
}

/**
 * Loads an installed npm package as a BrowseLens plugin: its default (or
 * sole named) export must be `{ name, scripts }`, where `scripts` maps a
 * script name to `(params) => string` — a function producing exactly the
 * text you'd otherwise put in a browser.run payload's `script` field.
 * Resolved scripts run through the same runAgentScript vm sandbox as any
 * other browser.run call — a plugin is data (a script template), not new
 * server-side code execution.
 */
async function loadPlugin(packageName: string): Promise<BrowseLensPlugin> {
  let mod: unknown;
  try {
    mod = await import(packageName);
  } catch (err) {
    throw new Error(`could not load plugin package "${packageName}": ${(err as Error).message}`);
  }

  const candidate = (mod as { default?: unknown }).default ?? mod;
  if (!isBrowseLensPlugin(candidate)) {
    throw new Error(`"${packageName}" does not export a valid BrowseLens plugin (expected { name, scripts })`);
  }
  return candidate;
}

/** Loads a plugin and calls its named script with params, returning the resulting browser.run script text. */
export async function resolveScript(
  packageName: string,
  scriptName: string,
  params: Record<string, unknown>
): Promise<string> {
  const plugin = await loadPlugin(packageName);
  const scriptFn = plugin.scripts[scriptName];
  if (!scriptFn) {
    const available = Object.keys(plugin.scripts).join(', ') || 'none';
    throw new Error(`plugin "${packageName}" has no script named "${scriptName}" (available: ${available})`);
  }
  return scriptFn(params);
}
