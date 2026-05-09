import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readdir, readFile as readFileAsync } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { ASSET_EXTENSIONS } from '@inkeep/open-knowledge-core';
import ignore, { type Ignore } from 'ignore';
import { isConfigDoc, isSystemDoc } from './cc1-broadcast.ts';
import { isSupportedDocFile, stripDocExtension } from './doc-extensions.ts';
import { getLogger } from './logger.ts';
import { withSpan } from './telemetry.ts';

/**
 * Directories that are always skipped during traversal, independent of
 * `.gitignore` / `.okignore`.
 *
 * Criteria: never contains user-authored markdown AND either (a) uses symlinks
 * aggressively, (b) is a massive tree, or (c) is a framework/tool cache.
 *
 * Package managers / language runtimes:
 *   node_modules  — pnpm broken symlinks crash statSync; massive tree
 *   .venv / venv / env — Python virtualenvs
 *   __pycache__   — Python bytecode
 *   vendor        — Go / PHP / Ruby vendored deps
 *
 * Build output:
 *   dist / build / out / output — compiled assets
 *   .next / .nuxt / .svelte-kit / .astro — framework build caches
 *   .turbo / .cache / .parcel-cache     — build tool caches
 *   coverage                            — test coverage reports
 *
 * VCS / per-project state:
 *   .git — already in the ig instance; hardcoded here for the fast-path
 *   .ok  — per-project state dir; the committed `.ok/.gitignore` already
 *          self-ignores its contents for git, but adding it here lets the
 *          walker skip the descent entirely
 *
 * OS-managed directories (macOS):
 *   Library     — application data, caches, preferences; ~macOS only but safe
 *                 to skip on all platforms (no project ever authors markdown here)
 *   Applications — macOS app bundles; never user markdown
 *   .Trash      — OS recycle bin; symlink-heavy, contents irrelevant
 */
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
  'Library',
  'Applications',
  '.Trash',
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

async function initContentDirStateAsync(
  dir: string,
  relPath: string,
  projectDir: string,
  ig: Ignore,
  contentRelPrefix: string,
  contentOutsideProject: boolean,
  dirCount: Map<string, number>,
): Promise<void> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    console.warn(`[content-filter] Failed to read directory ${dir}:`, err);
    return;
  }

  for (const entry of entries) {
    const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (BUILTIN_SKIP_DIRS.has(entry.name)) continue;

      const dirPath = join(dir, entry.name);

      if (!contentOutsideProject) {
        const relToProject = relative(projectDir, dirPath);
        if (relToProject.startsWith('..')) continue;
        if (ig.ignores(relToProject) || ig.ignores(`${relToProject}/`)) continue;

        for (const name of IGNORE_FILE_NAMES) {
          const filePath = join(dirPath, name);
          if (!existsSync(filePath)) continue;
          try {
            const patterns = parseIgnorePatterns(await readFileAsync(filePath, 'utf-8'));
            ig.add(patterns.map((p) => prefixPattern(p, relToProject)));
          } catch (err) {
            console.warn(`[content-filter] Failed to read nested ${name} at ${filePath}:`, err);
          }
        }
      }

      await initContentDirStateAsync(
        dirPath,
        childRel,
        projectDir,
        ig,
        contentRelPrefix,
        contentOutsideProject,
        dirCount,
      );
    } else if (entry.isFile() && isSupportedDocFile(entry.name)) {
      if (!contentOutsideProject) {
        const projectRelPath = contentRelPrefix ? `${contentRelPrefix}/${childRel}` : childRel;
        if (ig.ignores(projectRelPath)) continue;
      }
      dirCount.set(relPath, (dirCount.get(relPath) ?? 0) + 1);
    }
  }
}

export async function createContentFilterAsync(opts: ContentFilterOptions): Promise<ContentFilter> {
  const { projectDir, contentDir, onAfterRebuild } = opts;

  const contentRelPrefix = relative(projectDir, contentDir);
  const contentOutsideProject = contentRelPrefix.startsWith('..');

  let ig = ignore();
  let watcherIgnoreGlobs: string[] = [];

  const dirCount = new Map<string, number>();

  function isIgnored(relativePath: string): boolean {
    if (contentOutsideProject) return false;
    const projectRelPath = contentRelPrefix ? `${contentRelPrefix}/${relativePath}` : relativePath;
    return ig.ignores(projectRelPath);
  }

  function isRejectedByPathRules(relativePath: string): boolean {
    const docName = stripDocExtension(relativePath);
    if (isSystemDoc(docName) || isConfigDoc(docName)) return true;
    for (const segment of relativePath.split('/')) {
      if (BUILTIN_SKIP_DIRS.has(segment)) return true;
    }
    if (contentOutsideProject) return false;
    return isIgnored(relativePath);
  }

  async function buildAndSwapPatternState(): Promise<void> {
    const newIg = ignore();
    newIg.add('.git');
    const newRootPatterns: string[] = [];

    for (const name of IGNORE_FILE_NAMES) {
      const path = join(projectDir, name);
      if (!existsSync(path)) continue;
      try {
        const patterns = parseIgnorePatterns(await readFileAsync(path, 'utf-8'));
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
          const patterns = parseIgnorePatterns(await readFileAsync(path, 'utf-8'));
          newIg.add(patterns.map((p) => prefixPattern(p, contentRelPrefix)));
        } catch (err) {
          console.warn(`[content-filter] Failed to read ${name} at ${path}:`, err);
        }
      }
    }

    const newDirCount = new Map<string, number>();
    await initContentDirStateAsync(
      contentDir,
      '',
      projectDir,
      newIg,
      contentRelPrefix,
      contentOutsideProject,
      newDirCount,
    );

    ig = newIg;
    watcherIgnoreGlobs = newRootPatterns.filter(
      (p) => p.length > 0 && !p.startsWith('!') && !p.startsWith('#'),
    );
    dirCount.clear();
    for (const [k, v] of newDirCount) dirCount.set(k, v);
  }

  await buildAndSwapPatternState();

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
      const prevWatcherGlobs = watcherIgnoreGlobs;
      const prevDirCount = new Map(dirCount);
      const startedAt = Date.now();

      return withSpan('config.ignore.rebuild', { attributes: {} }, async (span) => {
        try {
          await buildAndSwapPatternState();
          const durationMs = Date.now() - startedAt;
          span.setAttributes({
            'ok.ignore.pattern_count': watcherIgnoreGlobs.length,
            'ok.ignore.nested_file_count': 0,
            'ok.ignore.bytes': 0,
          });
          log.info({ durationMs }, 'content-filter async rebuild succeeded');

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
            patternCount: watcherIgnoreGlobs.length,
            nestedFileCount: 0,
            bytes: 0,
            durationMs,
          };
        } catch (err) {
          ig = prevIg;
          watcherIgnoreGlobs = prevWatcherGlobs;
          dirCount.clear();
          for (const [k, v] of prevDirCount) dirCount.set(k, v);
          const message = err instanceof Error ? err.message : String(err);
          log.warn(
            { err: err instanceof Error ? err : new Error(message) },
            'content-filter async rebuild failed — rolled back',
          );
          return { ok: false as const, error: { message } };
        }
      });
    },
  };
}
