import path from 'path';
import fs from 'fs';
import os from 'os';

function baseDir(): string {
  const dir = path.join(os.homedir(), '.browse-lens');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Path to the persisted Playwright storageState (cookies + localStorage) for a given context name. */
export function storageStatePath(name: string): string {
  return path.join(baseDir(), `${name}.storage-state.json`);
}
