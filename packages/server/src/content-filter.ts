/**
 * Unified content filter — encapsulates exclusion logic (gitignore + config content.exclude)
 * and inclusion logic (config content.include) in a single module.
 *
 * Used by the file watcher to determine which files belong in the content index.
 * Exclusion always supersedes inclusion.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ignore, { type Ignore } from 'ignore';
import picomatch from 'picomatch';

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
  const contentRelPrefix = relative(projectDir, contentDir);

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
  // Use the bootstrap filter to skip already-excluded directories
  loadNestedGitignores(contentDir, projectDir, ig);

  // Collect raw patterns for watcher ignore (best-effort optimization)
  const watcherIgnoreGlobs = [...rootGitignorePatterns, ...excludePatterns].filter(
    // Only include patterns that are useful as glob patterns for the watcher.
    // Skip negation patterns (!) and comment lines (#).
    (p) => p.length > 0 && !p.startsWith('!') && !p.startsWith('#'),
  );

  return {
    isExcluded(relativePath: string): boolean {
      // relativePath is relative to contentDir (what the watcher provides).
      // 1. Include check uses contentDir-relative path (patterns like **/*.md)
      if (!isIncluded(relativePath)) return true;
      // 2. Exclude check uses projectDir-relative path (gitignore patterns)
      const projectRelPath = contentRelPrefix
        ? `${contentRelPrefix}/${relativePath}`
        : relativePath;
      if (ig.ignores(projectRelPath)) return true;
      return false;
    },

    isDirExcluded(relativePath: string): boolean {
      // Only check exclusion rules (gitignore + config.exclude), not include patterns.
      // Directories don't need to match **/*.md — we still want to traverse them.
      // Check both with and without trailing slash — the `ignore` package distinguishes
      // directory-specific patterns (e.g. `node_modules/`) from file patterns.
      const projectRelPath = contentRelPrefix
        ? `${contentRelPrefix}/${relativePath}`
        : relativePath;
      return ig.ignores(projectRelPath) || ig.ignores(`${projectRelPath}/`);
    },

    getWatcherIgnoreGlobs(): string[] {
      return watcherIgnoreGlobs;
    },
  };
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
