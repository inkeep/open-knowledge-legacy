/**
 * Initial walk that seeds the basename index from disk. SPEC §6 FR-3b.
 *
 * The file watcher's startup walk is markdown-only — its fileIndex is
 * keyed by docName and ignores asset extensions. To populate the
 * basename index without emitting a synthetic burst of asset-create
 * events at boot, we do a separate walk here using the same admission
 * rules (ContentFilter + ASSET_EXTENSIONS).
 *
 * Symlink-following is intentional but bounded: cycles are caught via
 * a `visited` inode set, escape outside contentDir is rejected via
 * realpath check.
 */

import type { Dirent } from 'node:fs';
import { lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ASSET_EXTENSIONS, type BasenameIndex } from '@inkeep/open-knowledge-core';
import type { ContentFilter } from './content-filter.ts';
import { isSupportedAssetFile } from './doc-extensions.ts';

interface SeedOptions {
  contentDir: string;
  contentFilter?: ContentFilter;
  basenameIndex: BasenameIndex;
}

function isWithinDir(candidate: string, dir: string): boolean {
  if (candidate === dir) return true;
  return candidate.startsWith(`${dir}${sep}`);
}

export function seedBasenameIndex(opts: SeedOptions): void {
  const root = opts.contentDir;
  const visited = new Set<number>();

  function walk(dir: string): void {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = relative(root, full);
      if (rel.startsWith('..')) continue;
      if (opts.contentFilter?.isDirExcluded(rel) && entry.isDirectory()) continue;

      let stat: ReturnType<typeof statSync>;
      try {
        stat = lstatSync(full);
      } catch {
        continue;
      }

      if (stat.isSymbolicLink()) {
        let canonical: string;
        try {
          canonical = realpathSync(full);
        } catch {
          continue;
        }
        if (!isWithinDir(canonical, root)) continue;
        let realStat: ReturnType<typeof statSync>;
        try {
          realStat = statSync(canonical);
        } catch {
          continue;
        }
        if (visited.has(realStat.ino)) continue;
        visited.add(realStat.ino);
        if (realStat.isDirectory()) walk(canonical);
        else if (
          realStat.isFile() &&
          isSupportedAssetFile(full, ASSET_EXTENSIONS) &&
          !opts.contentFilter?.isExcluded(rel)
        ) {
          opts.basenameIndex.add(rel);
        }
        continue;
      }

      if (stat.isDirectory()) {
        if (visited.has(stat.ino)) continue;
        visited.add(stat.ino);
        walk(full);
        continue;
      }
      if (
        stat.isFile() &&
        isSupportedAssetFile(full, ASSET_EXTENSIONS) &&
        !opts.contentFilter?.isExcluded(rel)
      ) {
        opts.basenameIndex.add(rel);
      }
    }
  }

  walk(root);
}
