import path from 'path';
import fs from 'fs';
import os from 'os';

export function profileDir(): string {
  const dir = path.join(os.homedir(), '.hermes-agent-browser', 'chromium-profile');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
