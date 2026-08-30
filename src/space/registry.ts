import { randomUUID } from 'crypto';
import type { Space } from './space.js';

export class SpaceRegistry {
  private spaces = new Map<string, Space>();

  create(name: string): Space {
    const id = randomUUID();
    const space: Space = {
      id,
      name,
      createdAt: Date.now(),
      active: true
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

  close(id: string): boolean {
    return this.spaces.delete(id);
  }
}
