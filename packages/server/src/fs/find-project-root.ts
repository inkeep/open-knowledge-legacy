import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ANCESTOR_WALK_DEPTH_LIMIT = 30;

const OK_CONFIG_MARKER = '.ok/config.yml';

export interface FindEnclosingProjectRootResult {
  readonly rootPath: string;
  readonly distance: number;
}

export function findEnclosingProjectRoot(dir: string): FindEnclosingProjectRootResult | null {
  let cursor = resolve(dir);
  let distance = 0;
  while (distance < ANCESTOR_WALK_DEPTH_LIMIT) {
    let hit = false;
    try {
      hit = existsSync(resolve(cursor, OK_CONFIG_MARKER));
    } catch {
      hit = false;
    }
    if (hit) {
      return { rootPath: cursor, distance };
    }
    const parent = dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
    distance += 1;
  }
  return null;
}
