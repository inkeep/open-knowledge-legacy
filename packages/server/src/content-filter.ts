/**
 * Unified content filter — encapsulates exclusion logic (gitignore + config content.exclude)
 * and inclusion logic (config content.include) in a single module.
 *
 * Used by the file watcher to determine which files belong in the content index.
 * Exclusion always supersedes inclusion.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { ASSET_EXTENSIONS } from '@inkeep/open-knowledge-core';
import ignore, { type Ignore } from 'ignore';
import picomatch from 'picomatch';
import { isSystemDoc } from './cc1-broadcast.ts';

export interface ContentFilterOptions {
  /** Project root directory (where .gitignore lives). */
  projectDir: string;
  /** Content directory to serve files from (may equal projectDir). */
  contentDir: string;
  /** Glob patterns for files to include (default: ['**\/*.md']). */
  includePatterns: string[];
  /** Glob patterns for files to explicitly exclude. */
  excludePatterns: string[];
}

export interface ContentFilter {
  /** True if the file at relativePath should be excluded from the document system. */
  isExcluded(relativePath: string): boolean;
  /**
   * True if the directory at relativePath is excluded by gitignore/config rules.
   * Unlike isExcluded(), this does NOT check include patterns — directories don't
   * need to match include globs, only files do. Used for traversal decisions.
   */
  isDirExcluded(relativePath: string): boolean;
  /** Relative glob patterns for @parcel/watcher ignore option (best-effort). */
  getWatcherIgnoreGlobs(): string[];
  /** Increment refcount for a directory containing an included .md file. */
  incrementMdDir(dir: string): void;
  /** Decrement refcount for a directory; removes key when count reaches 0. */
  decrementMdDir(dir: string): void;
}

/**
 * Create a ContentFilter that applies the union of .gitignore rules and
 * config content.exclude patterns, gated by content.include patterns.
 *
 * Uses a two-pass .gitignore bootstrap:
 *   Pass 1: Load root .gitignore + content.exclude into a bootstrap filter.
 *   Pass 2: Walk contentDir for nested .gitignore files, skipping dirs the
 *           bootstrap filter already excludes (avoids walking node_modules/).
 */
export function createContentFilter(opts: ContentFilterOptions): ContentFilter {
  const { projectDir, contentDir, includePatterns, excludePatterns } = opts;

  // Build the include matcher from content.include patterns
  const isIncluded = picomatch(includePatterns, { dot: true });

  // --- Pass 1: Bootstrap ignore with root .gitignore + config exclude ---
  const ig = ignore();

  // Always exclude .git directory itself
  ig.add('.git');

  const rootGitignorePath = join(projectDir, '.gitignore');
  const rootGitignorePatterns: string[] = [];
  if (existsSync(rootGitignorePath)) {
    try {
      const content = readFileSync(rootGitignorePath, 'utf-8');
      const patterns = parseGitignorePatterns(content);
      rootGitignorePatterns.push(...patterns);
      ig.add(patterns);
    } catch (err) {
      console.warn(`[content-filter] Failed to read .gitignore at ${rootGitignorePath}:`, err);
    }
  }

  // Precompute the contentDir-to-projectDir prefix for path conversion.
  // When contentDir is outside projectDir, the relative path starts with ".."
  // and the `ignore` library rejects such paths. Skip gitignore-based exclusion
  // entirely in that case — gitignore rules from projectDir do not apply.
  const contentRelPrefix = relative(projectDir, contentDir);
  const contentOutsideProject = contentRelPrefix.startsWith('..');

  // Add config content.exclude patterns after .gitignore.
  // Config patterns are relative to contentDir, so prefix them when contentDir != projectDir.
  if (excludePatterns.length > 0) {
    if (contentRelPrefix) {
      ig.add(excludePatterns.map((p) => `${contentRelPrefix}/${p}`));
    } else {
      ig.add(excludePatterns);
    }
  }

  // --- Pass 2: Walk contentDir for nested .gitignore files ---
  // Use the bootstrap filter to skip already-excluded directories.
  // When contentDir != projectDir, the .gitignore at contentDir itself is not
  // covered by Pass 1 (which only loads projectDir/.gitignore). Load it explicitly.
  if (contentRelPrefix) {
    const contentDirGitignore = join(contentDir, '.gitignore');
    if (existsSync(contentDirGitignore)) {
      try {
        const content = readFileSync(contentDirGitignore, 'utf-8');
        const patterns = parseGitignorePatterns(content);
        const prefixed = patterns.map((p) => {
          if (p.startsWith('!')) return `!${contentRelPrefix}/${p.slice(1)}`;
          return `${contentRelPrefix}/${p}`;
        });
        ig.add(prefixed);
      } catch (err) {
        console.warn(`[content-filter] Failed to read .gitignore at ${contentDirGitignore}:`, err);
      }
    }
  }
  loadNestedGitignores(contentDir, projectDir, ig);

  // Collect raw patterns for watcher ignore (best-effort optimization)
  const watcherIgnoreGlobs = [...rootGitignorePatterns, ...excludePatterns].filter(
    // Only include patterns that are useful as glob patterns for the watcher.
    // Skip negation patterns (!) and comment lines (#).
    (p) => p.length > 0 && !p.startsWith('!') && !p.startsWith('#'),
  );

  // --- Sibling-asset refcount map (D11) ---
  // Count of included .md files per directory (contentDir-relative).
  // '' represents the contentDir root itself.
  const dirCount = new Map<string, number>();

  function isGitignoreExcluded(relativePath: string): boolean {
    // When contentDir is outside projectDir, gitignore rules from projectDir
    // do not apply — and the `ignore` library rejects paths starting with `..`.
    if (contentOutsideProject) return false;
    const projectRelPath = contentRelPrefix ? `${contentRelPrefix}/${relativePath}` : relativePath;
    return ig.ignores(projectRelPath);
  }

  // Walk contentDir at construct time to populate dirCount.
  populateDirCount(contentDir, '', isIncluded, isGitignoreExcluded, dirCount);

  return {
    isExcluded(relativePath: string): boolean {
      // (0) Reserved system doc names are always excluded (e.g. __system__.md)
      const docName = relativePath.replace(/\.md$/, '');
      if (isSystemDoc(docName)) return true;

      // D11 4-step ordered logic:
      // (1) gitignore/exclude wins — but skip when contentDir is outside projectDir
      //     (test-isolation case: gitignore rules from projectDir don't apply).
      if (!contentOutsideProject && isGitignoreExcluded(relativePath)) return true;

      // (2) include-pattern match → include
      if (isIncluded(relativePath)) return false;

      // (3) sibling-asset rule: extension in ASSET_EXTENSIONS AND dir has included .md
      const ext = extname(relativePath).slice(1).toLowerCase();
      if (ASSET_EXTENSIONS.has(ext)) {
        const dir = dirname(relativePath);
        const normalizedDir = dir === '.' ? '' : dir;
        if ((dirCount.get(normalizedDir) ?? 0) > 0) return false;
      }

      // (4) else → exclude
      return true;
    },

    isDirExcluded(relativePath: string): boolean {
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
  };
}

/**
 * Walk contentDir to count included .md files per directory.
 * Populates the refcount map used by the sibling-asset inclusion rule (D11).
 */
function populateDirCount(
  dir: string,
  relPath: string,
  isIncluded: (path: string) => boolean,
  isGitignoreExcluded: (path: string) => boolean,
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
      if (entry.name === '.git') continue;
      populateDirCount(join(dir, entry.name), childRel, isIncluded, isGitignoreExcluded, dirCount);
    } else if (
      entry.isFile() &&
      extname(entry.name).toLowerCase() === '.md' &&
      isIncluded(childRel) &&
      !isGitignoreExcluded(childRel)
    ) {
      const normalizedDir = relPath === '' ? '' : relPath;
      dirCount.set(normalizedDir, (dirCount.get(normalizedDir) ?? 0) + 1);
    }
  }
}

/**
 * Parse gitignore file content into an array of non-empty, non-comment patterns.
 */
function parseGitignorePatterns(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/**
 * Recursively walk a directory looking for nested .gitignore files.
 * Skips directories that the ignore instance already excludes.
 * Adds found patterns to the ignore instance with correct relative path prefixes.
 */
function loadNestedGitignores(dir: string, projectDir: string, ig: Ignore): void {
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.warn(`[content-filter] Failed to read directory ${dir}:`, err);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dirPath = join(dir, entry.name);
    const relToProject = relative(projectDir, dirPath);

    // Skip directories outside projectDir — the `ignore` library rejects
    // path.relative paths that start with "..". This happens when contentDir
    // and projectDir are unrelated (e.g., broken-config tests).
    if (relToProject.startsWith('..')) continue;

    // Skip directories that are already excluded by the bootstrap filter
    if (ig.ignores(relToProject) || ig.ignores(`${relToProject}/`)) continue;

    // Check for .gitignore in this subdirectory
    const nestedGitignore = join(dirPath, '.gitignore');
    if (existsSync(nestedGitignore)) {
      try {
        const content = readFileSync(nestedGitignore, 'utf-8');
        const patterns = parseGitignorePatterns(content);
        // Prefix patterns with the relative path from project root
        const prefixed = patterns.map((p) => {
          if (p.startsWith('!')) {
            return `!${relToProject}/${p.slice(1)}`;
          }
          return `${relToProject}/${p}`;
        });
        ig.add(prefixed);
      } catch (err) {
        console.warn(
          `[content-filter] Failed to read nested .gitignore at ${nestedGitignore}:`,
          err,
        );
      }
    }

    // Recurse into subdirectory
    loadNestedGitignores(dirPath, projectDir, ig);
  }
}
