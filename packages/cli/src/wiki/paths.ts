/**
 * Wiki path resolution — takes a loaded CLI Config and an absolute
 * `.open-knowledge/` directory, and returns resolved root directories
 * the wiki code needs.
 *
 * Each root is a browsable subtree with its own INDEX.md catalog.
 * The list of roots is user-configurable via config.wiki.roots.
 */
import { resolve } from 'node:path';
import type { Config } from '../config/schema.ts';

export interface ResolvedRoot {
  dir: string;
  label: string;
}

export interface WikiPaths {
  roots: ResolvedRoot[];
}

export function resolveWikiPaths(config: Config, openknowledgeDir: string): WikiPaths {
  const okDir = resolve(openknowledgeDir);
  return {
    roots: config.wiki.roots.map((root) => ({
      dir: resolve(okDir, root.path),
      label: root.label,
    })),
  };
}
