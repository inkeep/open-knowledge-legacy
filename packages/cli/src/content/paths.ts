/**
 * Content path resolution — takes an array of root definitions and an absolute
 * `.open-knowledge/` directory, and returns resolved root directories
 * the content catalog code needs.
 *
 * Each root is a browsable subtree with its own INDEX.md catalog.
 *
 * NOTE: Currently disconnected from the main config (which uses include/exclude
 * globs instead of roots). Retained for future catalog support.
 */
import { resolve } from 'node:path';
import type { ContentRoot } from '../config/schema.ts';

export interface ResolvedRoot {
  dir: string;
  label: string;
}

export interface ContentPaths {
  roots: ResolvedRoot[];
}

export function resolveContentPaths(roots: ContentRoot[], openknowledgeDir: string): ContentPaths {
  const okDir = resolve(openknowledgeDir);
  return {
    roots: roots.map((root) => ({
      dir: resolve(okDir, root.path),
      label: root.label,
    })),
  };
}
