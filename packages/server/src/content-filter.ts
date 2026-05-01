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
 * `content.include` and `content.exclude` were removed in the 2026-04-30
 * `.open-knowledge/` → `.ok/` rename — extension gating happens upstream via
 * `isSupportedDocFile()` (`packages/server/src/doc-extensions.ts`), and
 * exclusions live in `.okignore` instead of YAML.
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
 */
const BUILTIN_SKIP_DIRS = new Set([
  // Package managers / language runtimes
  'node_modules',
  '.venv',
  'venv',
  'env',
  '__pycache__',
  'vendor',
  // Build output
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
  // VCS / per-project state
  '.git',
  '.ok',
]);

/** File names recognized as ignore-pattern sources, in load order. */
const IGNORE_FILE_NAMES = ['.gitignore', '.okignore'] as const;

export interface ContentFilterOptions {
  /** Project root directory (where `.gitignore` / `.okignore` live). */
  projectDir: string;
  /** Content directory to serve files from (may equal projectDir). */
  contentDir: string;
}

export interface ContentFilter {
  /** True if the file at relativePath should be excluded from the document system. */
  isExcluded(relativePath: string): boolean;
  /**
   * True if the directory at relativePath is excluded by ignore-file rules.
   * Used for traversal decisions.
   */
  isDirExcluded(relativePath: string): boolean;
  /** Relative glob patterns for @parcel/watcher ignore option (best-effort). */
  getWatcherIgnoreGlobs(): string[];
  /** Increment refcount for a directory containing an included .md file. */
  incrementMdDir(dir: string): void;
  /** Decrement refcount for a directory; removes key when count reaches 0. */
  decrementMdDir(dir: string): void;
  /**
   * Re-walk contentDir from scratch and rebuild the refcount map used by the
   * sibling-asset inclusion rule. Required after operations that mutate the
   * working tree without going through the file-watcher's `incrementMdDir` /
   * `decrementMdDir` path — most notably cross-branch `git checkout`, where
   * the head-watcher's `eventBuffer.splice` discards the create/delete events
   * that would have kept the count current.
   */
  rebuildDirCount(): void;
}

/**
 * Create a ContentFilter that applies `.gitignore` + `.okignore` rules in a
 * single unified `ignore`-lib instance. Extensions are gated upstream by
 * `isSupportedDocFile()`; this filter handles only path-pattern exclusion plus
 * the sibling-asset rule (D11) that admits assets next to included `.md`.
 */
export function createContentFilter(opts: ContentFilterOptions): ContentFilter {
  const { projectDir, contentDir } = opts;

  // --- Pass 1: Bootstrap ignore with root .gitignore + .okignore ---
  const ig = ignore();

  // Always exclude .git directory itself
  ig.add('.git');

  const rootIgnorePatterns: string[] = [];
  for (const name of IGNORE_FILE_NAMES) {
    const path = join(projectDir, name);
    if (!existsSync(path)) continue;
    try {
      const patterns = parseIgnorePatterns(readFileSync(path, 'utf-8'));
      rootIgnorePatterns.push(...patterns);
      ig.add(patterns);
    } catch (err) {
      console.warn(`[content-filter] Failed to read ${name} at ${path}:`, err);
    }
  }

  // Precompute the contentDir-to-projectDir prefix for path conversion.
  // When contentDir is outside projectDir, the relative path starts with ".."
  // and the `ignore` library rejects such paths. Skip ignore-based exclusion
  // entirely in that case — ignore rules from projectDir do not apply.
  const contentRelPrefix = relative(projectDir, contentDir);
  const contentOutsideProject = contentRelPrefix.startsWith('..');

  // --- Pass 2: Walk contentDir for nested .gitignore + .okignore files ---
  // Use the bootstrap filter to skip already-excluded directories.
  // When contentDir != projectDir, ignore files at contentDir itself are not
  // covered by Pass 1 (which only loads projectDir's). Load them explicitly.
  if (contentRelPrefix && !contentOutsideProject) {
    for (const name of IGNORE_FILE_NAMES) {
      const path = join(contentDir, name);
      if (!existsSync(path)) continue;
      try {
        const patterns = parseIgnorePatterns(readFileSync(path, 'utf-8'));
        const prefixed = patterns.map((p) => prefixPattern(p, contentRelPrefix));
        ig.add(prefixed);
      } catch (err) {
        console.warn(`[content-filter] Failed to read ${name} at ${path}:`, err);
      }
    }
  }
  loadNestedIgnoreFiles(contentDir, projectDir, ig);

  // Collect raw patterns for watcher ignore (best-effort optimization)
  const watcherIgnoreGlobs = rootIgnorePatterns.filter(
    // Only include patterns useful as glob patterns for the watcher.
    // Skip negation patterns (!) and comment lines (#).
    (p) => p.length > 0 && !p.startsWith('!') && !p.startsWith('#'),
  );

  // --- Sibling-asset refcount map (D11) ---
  // Count of supported doc files per directory (contentDir-relative).
  // '' represents the contentDir root itself.
  const dirCount = new Map<string, number>();

  function isIgnored(relativePath: string): boolean {
    // When contentDir is outside projectDir, ignore rules from projectDir
    // do not apply — and the `ignore` library rejects paths starting with `..`.
    if (contentOutsideProject) return false;
    const projectRelPath = contentRelPrefix ? `${contentRelPrefix}/${relativePath}` : relativePath;
    return ig.ignores(projectRelPath);
  }

  // Walk contentDir at construct time to populate dirCount.
  populateDirCount(contentDir, '', isIgnored, dirCount);

  return {
    isExcluded(relativePath: string): boolean {
      // (0) Reserved system + config doc names are always excluded
      // (e.g. __system__.md / __config__/project.md / __user__/config.yml.md)
      const docName = stripDocExtension(relativePath);
      if (isSystemDoc(docName) || isConfigDoc(docName)) return true;

      // (1) ignore-file (gitignore + okignore) match → exclude.
      //     Skipped when contentDir is outside projectDir (test-isolation).
      if (!contentOutsideProject && isIgnored(relativePath)) return true;

      // (2) Supported doc extension → include.
      //     `isSupportedDocFile` is the upstream extension gate (`.md`/`.mdx`).
      //     Callers like file-watcher.ts already pre-filter, but cover it here
      //     so this filter behaves correctly when called in isolation.
      if (isSupportedDocFile(relativePath)) return false;

      // (3) Sibling-asset rule: extension in ASSET_EXTENSIONS AND dir has an included doc.
      const ext = extname(relativePath).slice(1).toLowerCase();
      if (ASSET_EXTENSIONS.has(ext)) {
        const dir = dirname(relativePath);
        const normalizedDir = dir === '.' ? '' : dir;
        if ((dirCount.get(normalizedDir) ?? 0) > 0) return false;
      }

      // (4) Default → exclude.
      return true;
    },

    isDirExcluded(relativePath: string): boolean {
      // Fast-path: built-in skips are always excluded regardless of ignore-file config.
      const topSegment = relativePath.split('/')[0];
      if (BUILTIN_SKIP_DIRS.has(topSegment)) return true;
      if (contentOutsideProject) return false;
      const projectRelPath = contentRelPrefix
        ? `${contentRelPrefix}/${relativePath}`
        : relativePath;
      return ig.ignores(projectRelPath) || ig.ignores(`${projectRelPath}/`);
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
      dirCount.clear();
      populateDirCount(contentDir, '', isIgnored, dirCount);
    },
  };
}

/**
 * Walk contentDir to count included `.md`/`.mdx` files per directory.
 * Populates the refcount map used by the sibling-asset inclusion rule (D11).
 */
function populateDirCount(
  dir: string,
  relPath: string,
  isIgnored: (path: string) => boolean,
  dirCount: Map<string, number>,
): void {
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
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

/**
 * Parse a `.gitignore`/`.okignore` file into an array of non-empty,
 * non-comment patterns. Whitespace trimmed; CRLF-safe via `split('\n')`
 * + `trim()`.
 */
function parseIgnorePatterns(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/** Prefix a single pattern with a relative path, preserving `!` negation. */
function prefixPattern(pattern: string, relPrefix: string): string {
  if (pattern.startsWith('!')) return `!${relPrefix}/${pattern.slice(1)}`;
  return `${relPrefix}/${pattern}`;
}

/**
 * Recursively walk a directory looking for nested `.gitignore` / `.okignore`
 * files. Skips directories the ignore instance already excludes plus
 * `BUILTIN_SKIP_DIRS`. Adds found patterns to the ignore instance with
 * correct relative path prefixes.
 */
function loadNestedIgnoreFiles(dir: string, projectDir: string, ig: Ignore): void {
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.warn(`[content-filter] Failed to read directory ${dir}:`, err);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    // Fast-path: built-in skips never contain user ignore files and can
    // be massive trees (node_modules) or contain broken symlinks (pnpm).
    if (BUILTIN_SKIP_DIRS.has(entry.name)) continue;

    const dirPath = join(dir, entry.name);
    const relToProject = relative(projectDir, dirPath);

    // Skip directories outside projectDir — the `ignore` library rejects
    // path.relative paths that start with "..". This happens when contentDir
    // and projectDir are unrelated (e.g., broken-config tests).
    if (relToProject.startsWith('..')) continue;

    // Skip directories that are already excluded by the bootstrap filter
    if (ig.ignores(relToProject) || ig.ignores(`${relToProject}/`)) continue;

    for (const name of IGNORE_FILE_NAMES) {
      const filePath = join(dirPath, name);
      if (!existsSync(filePath)) continue;
      try {
        const patterns = parseIgnorePatterns(readFileSync(filePath, 'utf-8'));
        const prefixed = patterns.map((p) => prefixPattern(p, relToProject));
        ig.add(prefixed);
      } catch (err) {
        console.warn(`[content-filter] Failed to read nested ${name} at ${filePath}:`, err);
      }
    }

    // Recurse into subdirectory
    loadNestedIgnoreFiles(dirPath, projectDir, ig);
  }
}
