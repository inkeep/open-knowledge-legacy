import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { ASSET_EXTENSIONS } from '@inkeep/open-knowledge-core';
import ignore, { type Ignore } from 'ignore';
import { isConfigDoc, isSystemDoc } from './cc1-broadcast.ts';
import { isSupportedDocFile, stripDocExtension } from './doc-extensions.ts';

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
}

export interface ContentFilter {
  isExcluded(relativePath: string): boolean;
  isDirExcluded(relativePath: string): boolean;
  getWatcherIgnoreGlobs(): string[];
  incrementMdDir(dir: string): void;
  decrementMdDir(dir: string): void;
  rebuildDirCount(): void;
}

export function createContentFilter(opts: ContentFilterOptions): ContentFilter {
  const { projectDir, contentDir } = opts;

  const ig = ignore();

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

  const contentRelPrefix = relative(projectDir, contentDir);
  const contentOutsideProject = contentRelPrefix.startsWith('..');

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

  const watcherIgnoreGlobs = rootIgnorePatterns.filter(
    (p) => p.length > 0 && !p.startsWith('!') && !p.startsWith('#'),
  );

  const dirCount = new Map<string, number>();

  function isIgnored(relativePath: string): boolean {
    if (contentOutsideProject) return false;
    const projectRelPath = contentRelPrefix ? `${contentRelPrefix}/${relativePath}` : relativePath;
    return ig.ignores(projectRelPath);
  }

  populateDirCount(contentDir, '', isIgnored, dirCount);

  return {
    isExcluded(relativePath: string): boolean {
      const docName = stripDocExtension(relativePath);
      if (isSystemDoc(docName) || isConfigDoc(docName)) return true;

      if (!contentOutsideProject && isIgnored(relativePath)) return true;

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

    if (BUILTIN_SKIP_DIRS.has(entry.name)) continue;

    const dirPath = join(dir, entry.name);
    const relToProject = relative(projectDir, dirPath);

    if (relToProject.startsWith('..')) continue;

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

    loadNestedIgnoreFiles(dirPath, projectDir, ig);
  }
}
