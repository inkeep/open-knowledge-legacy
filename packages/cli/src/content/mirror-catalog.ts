/**
 * Mirrored catalog generation — scans the project for content files matching
 * glob patterns and writes INDEX.md catalogs inside `.open-knowledge/catalogs/`,
 * mirroring the repo's directory structure without polluting the source tree.
 *
 * Example layout:
 *   .open-knowledge/catalogs/
 *     INDEX.md                          ← root catalog
 *     specs/INDEX.md                    ← mirrors specs/
 *     specs/2026-04-07-foo/INDEX.md     ← mirrors specs/2026-04-07-foo/
 *     reports/INDEX.md                  ← mirrors reports/
 *
 * Links use project-root-relative paths so agents can use them directly.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { CATALOG_FILENAME } from '../constants.ts';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter.ts';
import { contentHash } from './catalog.ts';

const CATALOGS_DIR = 'catalogs';

/** Built-in directories that are always excluded from scanning. */
const BUILTIN_EXCLUDES = new Set(['node_modules', '.git', '.claude', '.changeset']);

const ArticleFrontmatterSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

const IndexMetaSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
});

// ── Glob matching ──────────────────────────────────────────────────────

/**
 * Convert a simple glob pattern to a RegExp.
 * Supports: `*` (single segment), `**` (any depth), `?` (single char).
 */
const globCache = new Map<string, RegExp>();

/**
 * Convert a simple glob pattern to a RegExp (memoized).
 * Supports: `*` (single segment), `**` (any depth), `?` (single char).
 */
function globToRegex(pattern: string): RegExp {
  const cached = globCache.get(pattern);
  if (cached) return cached;

  let re = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          re += '(?:.+/)?';
          i += 3;
        } else {
          re += '.*';
          i += 2;
        }
      } else {
        re += '[^/]*';
        i++;
      }
    } else if (ch === '?') {
      re += '[^/]';
      i++;
    } else if ('.+[](){}^$|\\'.includes(ch)) {
      re += `\\${ch}`;
      i++;
    } else {
      re += ch;
      i++;
    }
  }
  const regex = new RegExp(`^${re}$`);
  globCache.set(pattern, regex);
  return regex;
}

function matchesAny(relPath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (globToRegex(pattern).test(relPath)) return true;
  }
  return false;
}

/** Directories to skip inside .open-knowledge/ (catalogs are our output, cache is derived). */
const OK_INTERNAL_EXCLUDES = new Set([CATALOGS_DIR, 'cache']);

function isExcludedDir(name: string, parentRelDir: string): boolean {
  if (BUILTIN_EXCLUDES.has(name)) return true;
  // Skip hidden dirs EXCEPT .open-knowledge
  if (name.startsWith('.') && name !== '.open-knowledge') return true;
  // Skip catalogs/ and cache/ inside .open-knowledge/
  if (parentRelDir === '.open-knowledge' && OK_INTERNAL_EXCLUDES.has(name)) return true;
  return false;
}

/**
 * Recursively find all files matching include patterns, excluding built-in
 * and user-specified exclude patterns. Returns project-root-relative paths.
 */
function scanFiles(
  dir: string,
  projectDir: string,
  include: string[],
  exclude: string[],
): string[] {
  const results: string[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  const parentRelDir = relative(projectDir, dir);

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (isExcludedDir(entry.name, parentRelDir)) continue;
      const relDir = relative(projectDir, join(dir, entry.name));
      if (matchesAny(relDir, exclude)) continue;
      results.push(...scanFiles(join(dir, entry.name), projectDir, include, exclude));
    } else if (entry.isFile()) {
      const relPath = relative(projectDir, join(dir, entry.name));
      if (matchesAny(relPath, include) && !matchesAny(relPath, exclude)) {
        results.push(relPath);
      }
    }
  }
  return results;
}

// ── Catalog content generation ─────────────────────────────────────────

interface ArticleEntry {
  title: string;
  description: string;
  tags: string[];
  /** Project-root-relative path to the source file. */
  filePath: string;
}

interface SubdirEntry {
  name: string;
  title: string;
  description: string;
  articleCount: number;
  /** Project-root-relative path to the mirrored catalog. */
  catalogPath: string;
}

function readArticleMeta(absPath: string, relPath: string): ArticleEntry | null {
  let content: string;
  try {
    content = readFileSync(absPath, 'utf-8');
  } catch {
    return null;
  }
  const fm = parseFrontmatter(content, ArticleFrontmatterSchema);
  return {
    title: fm?.title ?? basename(absPath, '.md'),
    description: fm?.description ?? '',
    tags: fm?.tags ?? [],
    filePath: relPath,
  };
}

function generateDirCatalog(
  title: string,
  description: string,
  articles: ArticleEntry[],
  subdirs: SubdirEntry[],
): string {
  const fm = serializeFrontmatter({
    title,
    description,
    generated: true,
    schema_version: 1,
  });

  const lines: string[] = [fm, ''];

  if (articles.length > 0) {
    lines.push('## Articles', '');
    const sorted = [...articles].sort((a, b) => a.title.localeCompare(b.title));
    for (const a of sorted) {
      const tagSuffix = a.tags.length > 0 ? ` Tags: ${a.tags.join(', ')}` : '';
      const descSuffix = a.description ? ` — ${a.description}` : '';
      lines.push(`- **[${a.title}](${a.filePath})**${descSuffix}${tagSuffix}`);
    }
    lines.push('');
  }

  if (subdirs.length > 0) {
    lines.push('## Subfolders', '');
    const sorted = [...subdirs].sort((a, b) => a.name.localeCompare(b.name));
    for (const sf of sorted) {
      const countLabel = sf.articleCount === 1 ? '1 article' : `${sf.articleCount} articles`;
      const descSuffix = sf.description ? ` — ${sf.description}` : '';
      lines.push(`- **[${sf.title}](${sf.catalogPath})** (${countLabel})${descSuffix}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Mirror catalog builder ─────────────────────────────────────────────

interface DirNode {
  /** Project-root-relative path of this directory (empty string for root). */
  relDir: string;
  /** Direct .md files in this directory. */
  files: string[];
  /** Child directory names. */
  children: Map<string, DirNode>;
}

/** Build a tree from a flat list of project-root-relative file paths. */
function buildTree(files: string[]): DirNode {
  const root: DirNode = { relDir: '', files: [], children: new Map() };

  for (const file of files) {
    const parts = file.split(/[\\/]/).filter((p) => p.length > 0);
    const fileName = parts.pop();
    if (!fileName) {
      continue;
    }
    let node = root;
    let dirSoFar = '';

    for (const part of parts) {
      dirSoFar = dirSoFar ? `${dirSoFar}/${part}` : part;
      let child = node.children.get(part);
      if (!child) {
        child = { relDir: dirSoFar, files: [], children: new Map() };
        node.children.set(part, child);
      }
      node = child;
    }
    node.files.push(fileName);
  }

  return root;
}

/** Count all files in a node and its descendants. */
function countFiles(node: DirNode): number {
  let count = node.files.length;
  for (const child of node.children.values()) {
    count += countFiles(child);
  }
  return count;
}

function writeIfChanged(filePath: string, content: string): boolean {
  if (existsSync(filePath)) {
    try {
      const existing = readFileSync(filePath, 'utf-8');
      if (contentHash(existing) === contentHash(content)) {
        return false;
      }
    } catch {
      // Fall through and overwrite
    }
  }
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
  return true;
}

/** Read sticky title/description from an existing mirrored INDEX.md. */
function readStickyMeta(mirrorPath: string): { title?: string; description?: string } | null {
  if (!existsSync(mirrorPath)) return null;
  try {
    const content = readFileSync(mirrorPath, 'utf-8');
    return parseFrontmatter(content, IndexMetaSchema);
  } catch {
    return null;
  }
}

/**
 * Recursively generate mirrored catalogs for a directory node.
 * Returns the number of articles written (for parent count display).
 */
function generateNodeCatalog(node: DirNode, projectDir: string, catalogsDir: string): void {
  // Build articles list from direct files
  const articles: ArticleEntry[] = [];
  for (const fileName of node.files) {
    if (fileName === CATALOG_FILENAME) continue;
    const relPath = node.relDir ? `${node.relDir}/${fileName}` : fileName;
    const absPath = join(projectDir, relPath);
    const meta = readArticleMeta(absPath, relPath);
    if (meta) articles.push(meta);
  }

  // Recurse into children first (so their catalogs exist for sticky reads)
  const subdirs: SubdirEntry[] = [];
  for (const [childName, childNode] of node.children) {
    generateNodeCatalog(childNode, projectDir, catalogsDir);

    const mirrorPath = join(catalogsDir, childNode.relDir, CATALOG_FILENAME);
    const sticky = readStickyMeta(mirrorPath);
    const catalogRelPath = `.open-knowledge/${CATALOGS_DIR}/${childNode.relDir}/${CATALOG_FILENAME}`;

    subdirs.push({
      name: childName,
      title: sticky?.title ?? childName,
      description: sticky?.description ?? '',
      articleCount: countFiles(childNode),
      catalogPath: catalogRelPath,
    });
  }

  // Skip empty directories with no children
  if (articles.length === 0 && subdirs.length === 0) return;

  // Determine title — use sticky metadata if available, otherwise dirname
  const mirrorPath = join(catalogsDir, node.relDir, CATALOG_FILENAME);
  const sticky = readStickyMeta(mirrorPath);
  const defaultTitle = node.relDir ? basename(node.relDir) : 'Project Content';
  const title = sticky?.title ?? defaultTitle;
  const description = sticky?.description ?? '';

  const content = generateDirCatalog(title, description, articles, subdirs);
  writeIfChanged(mirrorPath, content);
}

// ── Public API ─────────────────────────────────────────────────────────

export interface MirrorCatalogOptions {
  projectDir: string;
  okDir: string;
  include: string[];
  exclude: string[];
}

/**
 * Scan the project for content files and rebuild mirrored catalogs
 * inside `.open-knowledge/catalogs/`.
 */
export function rebuildMirroredCatalogs(options: MirrorCatalogOptions): void {
  const { projectDir, okDir, include, exclude } = options;
  const catalogsDir = resolve(okDir, CATALOGS_DIR);

  // Scan for matching files
  const files = scanFiles(projectDir, projectDir, include, exclude);
  if (files.length === 0) return;

  // Build directory tree and generate catalogs
  const tree = buildTree(files);
  generateNodeCatalog(tree, projectDir, catalogsDir);
}

/**
 * Check whether a project-root-relative file path matches the content
 * include/exclude patterns (including built-in directory excludes).
 */
export function isTrackedContent(relPath: string, include: string[], exclude: string[]): boolean {
  // Check built-in directory excludes
  const parts = relPath.split('/');
  for (let i = 0; i < parts.length - 1; i++) {
    const dir = parts[i];
    if (BUILTIN_EXCLUDES.has(dir)) return false;
    if (dir.startsWith('.') && dir !== '.open-knowledge') return false;
    // Exclude catalogs/ and cache/ inside .open-knowledge/
    if (i > 0 && parts[i - 1] === '.open-knowledge' && OK_INTERNAL_EXCLUDES.has(dir)) return false;
  }
  return matchesAny(relPath, include) && !matchesAny(relPath, exclude);
}

export { CATALOGS_DIR };
