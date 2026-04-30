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
 *
 * Per-entry errors are classified: ENOENT stays silent (concurrent
 * rename race is legit and common), all other errno codes surface via
 * the optional `onSkip` callback so the caller can push a partial-
 * degraded subsystem indicator. Without surface, EACCES on a vault
 * subtree silently truncates the walk and every embed under that
 * subtree breaks with no log signal — reviewer flagged this as a real
 * "degraded[] unreachable" failure mode.
 */

import type { Dirent } from 'node:fs';
import { lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ASSET_EXTENSIONS, type BasenameIndex } from '@inkeep/open-knowledge-core';
import type { ContentFilter } from './content-filter.ts';
import { isSupportedAssetFile } from './doc-extensions.ts';

/** Classification of why a particular entry was skipped during the walk. */
type SeedSkipReason =
  | 'read-failed'
  | 'lstat-failed'
  | 'realpath-failed'
  | 'symlink-escape'
  | 'symlink-stat-failed';

interface SeedOptions {
  contentDir: string;
  contentFilter?: ContentFilter;
  basenameIndex: BasenameIndex;
  /**
   * Fires on each non-ENOENT per-entry failure. `code` is the Node errno
   * string (e.g. `'EACCES'`, `'EMFILE'`, `'EPERM'`) or `undefined` if
   * the error didn't carry one. Invoked synchronously from inside
   * `seedBasenameIndex`; keep the body light (log + increment counter).
   */
  onSkip?(reason: SeedSkipReason, code: string | undefined, path: string): void;
}

function isWithinDir(candidate: string, dir: string): boolean {
  if (candidate === dir) return true;
  return candidate.startsWith(`${dir}${sep}`);
}

function errnoCode(err: unknown): string | undefined {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

export function seedBasenameIndex(opts: SeedOptions): void {
  const root = opts.contentDir;
  const visited = new Set<number>();

  function walk(dir: string): void {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
    } catch (err) {
      const code = errnoCode(err);
      if (code !== 'ENOENT') opts.onSkip?.('read-failed', code, dir);
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
      } catch (err) {
        const code = errnoCode(err);
        if (code !== 'ENOENT') opts.onSkip?.('lstat-failed', code, full);
        continue;
      }

      if (stat.isSymbolicLink()) {
        let canonical: string;
        try {
          canonical = realpathSync(full);
        } catch (err) {
          const code = errnoCode(err);
          if (code !== 'ENOENT') opts.onSkip?.('realpath-failed', code, full);
          continue;
        }
        if (!isWithinDir(canonical, root)) {
          opts.onSkip?.('symlink-escape', undefined, full);
          continue;
        }
        let realStat: ReturnType<typeof statSync>;
        try {
          realStat = statSync(canonical);
        } catch (err) {
          const code = errnoCode(err);
          if (code !== 'ENOENT') opts.onSkip?.('symlink-stat-failed', code, canonical);
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
