import { randomUUID } from 'crypto';
import type { Space } from './space.js';
import { spaceIsolation } from './isolation.js';

export class SpaceRegistry {
  private spaces = new Map<string, Space>();

  create(
    name: string,
    importProfile = false,
    record = false,
    privacy = false,
    allowlist: string[] = [],
    blocklist: string[] = []
  ): Space {
    const id = randomUUID();
    const space: Space = {
      id,
      name,
      createdAt: Date.now(),
      active: true,
      importProfile,
      record,
      privacy,
      allowlist,
      blocklist
    };
    this.spaces.set(id, space);
    return space;
  }

  get(id: string): Space | undefined {
    return this.spaces.get(id);
  }

  list(): Space[] {
    return Array.from(this.spaces.values());
  }

  async close(id: string): Promise<boolean> {
    if (!this.spaces.has(id)) return false;
    await spaceIsolation.closeAll(id);
    return this.spaces.delete(id);
  }
}
