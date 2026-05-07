/**
 * Unified content filter — encapsulates exclusion logic in one module.
 *
 * Pattern sources, all unioned in a single `ignore`-lib instance so cross-source
 * `!`-negation works (e.g. a `!secret.md` line in `.okignore` re-includes a
 * file that `.gitignore` excluded):
 *   - root `.gitignore` (project-relative)
 *   - root `.okignore`  (project-relative)
 *   - nested `.gitignore` and `.okignore` files at any folder depth
 *   - the `.git` directory (always excluded — `node-ignore` does not auto-add it)
 *
 * Extension gating happens upstream via `isSupportedDocFile()`
 * (`packages/server/src/doc-extensions.ts`); exclusions live in `.okignore`
 * (no YAML include/exclude keys).
 *
 * Used by the file watcher to decide which files belong in the content index
 * and by the CLI preview helper to enumerate the same set without booting the
 * server.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { ASSET_EXTENSIONS } from '@inkeep/open-knowledge-core';
import ignore, { type Ignore } from 'ignore';
import { isConfigDoc, isSystemDoc } from './cc1-broadcast.ts';
import { isSupportedDocFile, stripDocExtension } from './doc-extensions.ts';
import { getLogger } from './logger.ts';
import { withSpan } from './telemetry.ts';

const BUILTIN_SKIP_DIRS = new Set([
  'node_modules',
  '.venv',
  'venv',
  'env',
  '__pycache__',
  'vendor',
  'dist',
  'build',
  'out',
  'output',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.astro',
  '.turbo',
  '.cache',
  '.parcel-cache',
  'coverage',
  '.git',
  '.ok',
]);

const IGNORE_FILE_NAMES = ['.gitignore', '.okignore'] as const;

export interface ContentFilterOptions {
  projectDir: string;
  contentDir: string;
  onAfterRebuild?: () => void;
}

export type RebuildResult =
  | {
      ok: true;
      patternCount: number;
      nestedFileCount: number;
      bytes: number;
      durationMs: number;
    }
  | {
      ok: false;
      error: { message: string };
    };

export interface ContentFilter {
  isExcluded(relativePath: string): boolean;
  isDirExcluded(relativePath: string): boolean;
  isPathIgnored(relativePath: string): boolean;
  getWatcherIgnoreGlobs(): string[];
  incrementMdDir(dir: string): void;
  decrementMdDir(dir: string): void;
  rebuildDirCount(): void;
  rebuildIgnorePatterns(): Promise<RebuildResult>;
}

export function createContentFilter(opts: ContentFilterOptions): ContentFilter {
  const { projectDir, contentDir, onAfterRebuild } = opts;

  const contentRelPrefix = relative(projectDir, contentDir);
  const contentOutsideProject = contentRelPrefix.startsWith('..');

  let ig: Ignore;
  let rootIgnorePatterns: string[];
  let watcherIgnoreGlobs: string[];
  let lastPatternCount = 0;
  let lastNestedFileCount = 0;
  let lastBytes = 0;

  function buildPatternState(): {
    patternCount: number;
    nestedFileCount: number;
    bytes: number;
  } {
    const newIg = ignore();

    newIg.add('.git');

    const newRootPatterns: string[] = [];
    let bytes = 0;
    let nestedFileCount = 0;

    for (const name of IGNORE_FILE_NAMES) {
      const path = join(projectDir, name);
      if (!existsSync(path)) continue;
      try {
        const content = readFileSync(path, 'utf-8');
        bytes += content.length;
        const patterns = parseIgnorePatterns(content);
        newRootPatterns.push(...patterns);
        newIg.add(patterns);
      } catch (err) {
        console.warn(`[content-filter] Failed to read ${name} at ${path}:`, err);
      }
    }

    if (contentRelPrefix && !contentOutsideProject) {
      for (const name of IGNORE_FILE_NAMES) {
        const path = join(contentDir, name);
        if (!existsSync(path)) continue;
        try {
          const content = readFileSync(path, 'utf-8');
          bytes += content.length;
          nestedFileCount++;
          const patterns = parseIgnorePatterns(content);
          const prefixed = patterns.map((p) => prefixPattern(p, contentRelPrefix));
          newIg.add(prefixed);
        } catch (err) {
          console.warn(`[content-filter] Failed to read ${name} at ${path}:`, err);
        }
      }
    }

    const bytesAcc = { value: bytes };
    nestedFileCount += loadNestedIgnoreFiles(contentDir, projectDir, newIg, bytesAcc);
    bytes = bytesAcc.value;

    const newWatcherGlobs = newRootPatterns.filter(
      (p) => p.length > 0 && !p.startsWith('!') && !p.startsWith('#'),
    );

    ig = newIg;
    rootIgnorePatterns = newRootPatterns;
    watcherIgnoreGlobs = newWatcherGlobs;
    lastPatternCount = newRootPatterns.length;
    lastNestedFileCount = nestedFileCount;
    lastBytes = bytes;

    return {
      patternCount: lastPatternCount,
      nestedFileCount: lastNestedFileCount,
      bytes: lastBytes,
    };
  }

  buildPatternState();

  const dirCount = new Map<string, number>();

  function isIgnored(relativePath: string): boolean {
    if (contentOutsideProject) return false;
    const projectRelPath = contentRelPrefix ? `${contentRelPrefix}/${relativePath}` : relativePath;
    return ig.ignores(projectRelPath);
  }

  populateDirCount(contentDir, '', isIgnored, dirCount);

  function isRejectedByPathRules(relativePath: string): boolean {
    const docName = stripDocExtension(relativePath);
    if (isSystemDoc(docName) || isConfigDoc(docName)) return true;

    for (const segment of relativePath.split('/')) {
      if (BUILTIN_SKIP_DIRS.has(segment)) return true;
    }

    if (contentOutsideProject) return false;
    return isIgnored(relativePath);
  }

  return {
    isExcluded(relativePath: string): boolean {
      if (isRejectedByPathRules(relativePath)) return true;

      if (isSupportedDocFile(relativePath)) return false;

      const ext = extname(relativePath).slice(1).toLowerCase();
      if (ASSET_EXTENSIONS.has(ext)) {
        const dir = dirname(relativePath);
        const normalizedDir = dir === '.' ? '' : dir;
        if ((dirCount.get(normalizedDir) ?? 0) > 0) return false;
      }

      return true;
    },

    isDirExcluded(relativePath: string): boolean {
      for (const segment of relativePath.split('/')) {
        if (BUILTIN_SKIP_DIRS.has(segment)) return true;
      }
      if (contentOutsideProject) return false;
      const projectRelPath = contentRelPrefix
        ? `${contentRelPrefix}/${relativePath}`
        : relativePath;
      return ig.ignores(projectRelPath) || ig.ignores(`${projectRelPath}/`);
    },

    isPathIgnored(relativePath: string): boolean {
      return isRejectedByPathRules(relativePath);
    },

    getWatcherIgnoreGlobs(): string[] {
      return watcherIgnoreGlobs;
    },

    incrementMdDir(dir: string): void {
      const normalizedDir = dir === '.' ? '' : dir;
      dirCount.set(normalizedDir, (dirCount.get(normalizedDir) ?? 0) + 1);
    },

    decrementMdDir(dir: string): void {
      const normalizedDir = dir === '.' ? '' : dir;
      const current = dirCount.get(normalizedDir) ?? 0;
      if (current <= 1) {
        dirCount.delete(normalizedDir);
      } else {
        dirCount.set(normalizedDir, current - 1);
      }
    },

    rebuildDirCount(): void {
      const prev = new Map(dirCount);
      dirCount.clear();
      try {
        populateDirCount(contentDir, '', isIgnored, dirCount);
      } catch (err) {
        for (const [k, v] of prev) dirCount.set(k, v);
        getLogger('content-filter').warn(
          { err: err instanceof Error ? err : new Error(String(err)) },
          'content-filter rebuildDirCount walk failed — retaining previous counts',
        );
      }
    },

    async rebuildIgnorePatterns(): Promise<RebuildResult> {
      const log = getLogger('content-filter');

      const prevIg = ig;
      const prevRootPatterns = rootIgnorePatterns;
      const prevWatcherGlobs = watcherIgnoreGlobs;
      const prevPatternCount = lastPatternCount;
      const prevNestedFileCount = lastNestedFileCount;
      const prevBytes = lastBytes;

      const startedAt = Date.now();

      return withSpan('config.ignore.rebuild', { attributes: {} }, async (span) => {
        try {
          const counts = buildPatternState();
          dirCount.clear();
          populateDirCount(contentDir, '', isIgnored, dirCount);

          const durationMs = Date.now() - startedAt;
          span.setAttributes({
            'ok.ignore.pattern_count': counts.patternCount,
            'ok.ignore.nested_file_count': counts.nestedFileCount,
            'ok.ignore.bytes': counts.bytes,
          });
          log.info(
            {
              patternCount: counts.patternCount,
              nestedFileCount: counts.nestedFileCount,
              bytes: counts.bytes,
              durationMs,
            },
            'content-filter rebuild succeeded',
          );

          if (onAfterRebuild) {
            try {
              onAfterRebuild();
            } catch (err) {
              log.warn(
                { err: err instanceof Error ? err : new Error(String(err)) },
                'content-filter onAfterRebuild callback threw — derived views may be stale',
              );
            }
          }

          return {
            ok: true as const,
            patternCount: counts.patternCount,
            nestedFileCount: counts.nestedFileCount,
            bytes: counts.bytes,
            durationMs,
          };
        } catch (err) {
          ig = prevIg;
          rootIgnorePatterns = prevRootPatterns;
          watcherIgnoreGlobs = prevWatcherGlobs;
          lastPatternCount = prevPatternCount;
          lastNestedFileCount = prevNestedFileCount;
          lastBytes = prevBytes;
          dirCount.clear();
          try {
            populateDirCount(contentDir, '', isIgnored, dirCount);
          } catch (rollbackErr) {
            log.warn(
              {
                err: rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr)),
              },
              'content-filter rollback dirCount re-walk failed — sibling-asset counts may be stale until next rebuild',
            );
          }

          const message = err instanceof Error ? err.message : String(err);
          log.warn(
            { err: err instanceof Error ? err : new Error(message) },
            'content-filter rebuild failed — rolled back to previous state',
          );
          return { ok: false as const, error: { message } };
        }
      });
    },
  };
}

function populateDirCount(
  dir: string,
  relPath: string,
  isIgnored: (path: string) => boolean,
  dirCount: Map<string, number>,
): void {
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.warn(`[content-filter] Failed to read directory for dir-count: ${dir}`, err);
    return;
  }
  for (const entry of entries) {
    const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (BUILTIN_SKIP_DIRS.has(entry.name)) continue;
      if (isIgnored(childRel) || isIgnored(`${childRel}/`)) continue;
      populateDirCount(join(dir, entry.name), childRel, isIgnored, dirCount);
    } else if (entry.isFile() && isSupportedDocFile(entry.name) && !isIgnored(childRel)) {
      dirCount.set(relPath, (dirCount.get(relPath) ?? 0) + 1);
    }
  }
}

function parseIgnorePatterns(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function prefixPattern(pattern: string, relPrefix: string): string {
  if (pattern.startsWith('!')) return `!${relPrefix}/${pattern.slice(1)}`;
  return `${relPrefix}/${pattern}`;
}

function loadNestedIgnoreFiles(
  dir: string,
  projectDir: string,
  ig: Ignore,
  bytesAcc: { value: number },
): number {
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.warn(`[content-filter] Failed to read directory ${dir}:`, err);
    return 0;
  }

  let count = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    if (BUILTIN_SKIP_DIRS.has(entry.name)) continue;

    const dirPath = join(dir, entry.name);
    const relToProject = relative(projectDir, dirPath);

    if (relToProject.startsWith('..')) continue;

    if (ig.ignores(relToProject) || ig.ignores(`${relToProject}/`)) continue;

    for (const name of IGNORE_FILE_NAMES) {
      const filePath = join(dirPath, name);
      if (!existsSync(filePath)) continue;
      try {
        const content = readFileSync(filePath, 'utf-8');
        bytesAcc.value += content.length;
        const patterns = parseIgnorePatterns(content);
        const prefixed = patterns.map((p) => prefixPattern(p, relToProject));
        ig.add(prefixed);
        count++;
      } catch (err) {
        console.warn(`[content-filter] Failed to read nested ${name} at ${filePath}:`, err);
      }
    }

    count += loadNestedIgnoreFiles(dirPath, projectDir, ig, bytesAcc);
  }

  return count;
}
