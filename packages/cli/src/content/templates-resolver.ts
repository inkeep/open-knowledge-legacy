/**
 * Templates aggregation resolver.
 *
 * For a target folder, gathers the templates "menu" the agent can pick
 * from when creating a new doc:
 *
 *   1. Walk leaf → root over the folder's ancestry, collecting every
 *      `<level>/.ok/templates/*.md`. The target folder's own templates
 *      are scope: "local"; ancestors' are scope: "inherited". Closest
 *      wins on filename collision (D7).
 *
 *   2. When the caller passes `depth > 1`, ALSO descend N-1 levels into
 *      subfolders, surfacing their templates as scope: "descendant"
 *      (D15, D19). These are visibility-only — `write_document({ template })`
 *      MUST reject them when the target doc is at or above `source_folder`
 *      (FR5), since they're scoped to that descendant subtree.
 *
 * Each entry's title + description come from the template file's own
 * frontmatter — soft contract per D16. Templates without these still
 * surface (functional), but with the `name` filled in to give the agent
 * something to pick by.
 *
 * Synchronous I/O; matches the pattern in `nested-folder-rules.ts`.
 *
 * Spec: 2026-05-01-folder-level-metadata-and-templates §4.2, §5, §7.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { parse as parseYaml } from 'yaml';

export type TemplateScope = 'local' | 'inherited' | 'descendant';

export interface TemplateEntry {
  /** Filename without `.md` extension. Stable identifier for write_document. */
  name: string;
  /** From template frontmatter; absent if not declared (D16 soft contract). */
  title?: string;
  /** From template frontmatter; absent if not declared (D16 soft contract). */
  description?: string;
  /** Project-root-relative path to the template file. Always uses `/` separators. */
  path: string;
  /** Project-root-relative folder owning the `.ok/templates/` directory. `""` for root. */
  source_folder: string;
  /** local = target folder; inherited = ancestor; descendant = subfolder. */
  scope: TemplateScope;
}

interface ResolveTemplatesOptions {
  /**
   * find -maxdepth equivalent (D15). Default `1` — this folder + walk-up
   * ancestors only. `2` adds direct subfolders' templates flagged as
   * `descendant`. `Infinity` walks the whole subtree.
   */
  depth?: number;
}

/**
 * Resolve the templates menu for a target folder.
 *
 * @param projectDir    - Absolute project root.
 * @param folderRelPath - Project-root-relative folder path. Empty / `.`
 *                        means the project root.
 */
export function resolveTemplatesAvailable(
  projectDir: string,
  folderRelPath: string,
  options: ResolveTemplatesOptions = {},
): TemplateEntry[] {
  const depth = options.depth ?? 1;
  const normalized = normalizeFolderPath(folderRelPath);
  const segments = normalized === '' ? [] : normalized.split('/');

  // Track template names already claimed by a closer scope. The walk order
  // (target folder → ancestors → descendants) guarantees first-seen wins,
  // mirroring "closest wins on collision" (D7).
  const seen = new Set<string>();
  const out: TemplateEntry[] = [];

  // 1. Target folder itself → scope: local
  collectFromFolder(projectDir, normalized, 'local', seen, out);

  // 2. Walk ancestors leaf → root → scope: inherited
  for (let i = segments.length - 1; i >= 1; i--) {
    const ancestorPath = segments.slice(0, i).join('/');
    collectFromFolder(projectDir, ancestorPath, 'inherited', seen, out);
  }
  // Project root itself is also an ancestor when target is non-root.
  if (segments.length > 0) {
    collectFromFolder(projectDir, '', 'inherited', seen, out);
  }

  // 3. Optional descent up to `depth - 1` extra levels → scope: descendant
  if (depth > 1) {
    walkDescendants(projectDir, normalized, depth - 1, seen, out);
  }

  return out;
}

function collectFromFolder(
  projectDir: string,
  folderRelPath: string,
  scope: TemplateScope,
  seen: Set<string>,
  out: TemplateEntry[],
): void {
  const templatesDir = folderRelPath
    ? join(projectDir, folderRelPath, '.ok', 'templates')
    : join(projectDir, '.ok', 'templates');

  if (!existsSync(templatesDir)) return;

  let entries: string[];
  try {
    entries = readdirSync(templatesDir);
  } catch {
    return;
  }

  for (const entryName of entries) {
    if (!entryName.endsWith('.md')) continue;
    const name = entryName.slice(0, -3); // strip `.md`
    if (seen.has(name)) continue;

    const absPath = join(templatesDir, entryName);
    let s: ReturnType<typeof statSync>;
    try {
      s = statSync(absPath);
    } catch {
      continue;
    }
    if (!s.isFile()) continue;

    const meta = readTemplateMeta(absPath);
    const relPath = folderRelPath
      ? posix.join(folderRelPath, '.ok', 'templates', entryName)
      : posix.join('.ok', 'templates', entryName);

    const tplEntry: TemplateEntry = {
      name,
      path: relPath,
      source_folder: folderRelPath,
      scope,
    };
    if (meta.title !== undefined) tplEntry.title = meta.title;
    if (meta.description !== undefined) tplEntry.description = meta.description;

    seen.add(name);
    out.push(tplEntry);
  }
}

function walkDescendants(
  projectDir: string,
  startFolderRelPath: string,
  remainingDepth: number,
  seen: Set<string>,
  out: TemplateEntry[],
): void {
  if (remainingDepth <= 0) return;

  const absStart = startFolderRelPath ? join(projectDir, startFolderRelPath) : projectDir;

  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(absStart, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const entryName = String(entry.name);
    if (entryName === '.ok') continue; // we walk INTO .ok via collectFromFolder, not as a child
    // Skip standard junk dirs; mirrors content-filter's BUILTIN_SKIP_DIRS spirit
    // for the lightweight walk surface here.
    if (DESCENT_SKIP_DIRS.has(entryName)) continue;

    const childRel = startFolderRelPath ? posix.join(startFolderRelPath, entryName) : entryName;

    collectFromFolder(projectDir, childRel, 'descendant', seen, out);

    if (remainingDepth > 1) {
      walkDescendants(projectDir, childRel, remainingDepth - 1, seen, out);
    }
  }
}

const DESCENT_SKIP_DIRS = new Set<string>([
  '.git',
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
]);

function normalizeFolderPath(folderRelPath: string): string {
  return folderRelPath
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/^\.$/, '');
}

interface TemplateMeta {
  title?: string;
  description?: string;
}

function readTemplateMeta(absPath: string): TemplateMeta {
  let content: string;
  try {
    content = readFileSync(absPath, 'utf-8');
  } catch {
    return {};
  }
  const fmYaml = extractFrontmatterYaml(content);
  if (fmYaml === null) return {};

  let parsed: unknown;
  try {
    parsed = parseYaml(fmYaml);
  } catch {
    return {};
  }
  if (parsed == null || typeof parsed !== 'object') return {};

  const fm = parsed as Record<string, unknown>;
  const result: TemplateMeta = {};
  if (typeof fm.title === 'string') result.title = fm.title;
  if (typeof fm.description === 'string') result.description = fm.description;
  return result;
}

/**
 * Extract the YAML between the first `---` fences. Returns `null` when no
 * frontmatter block is present. Permissive — accepts either `\r\n` or `\n`,
 * leading whitespace before the opening fence, and a trailing newline after
 * the closing fence.
 */
function extractFrontmatterYaml(content: string): string | null {
  const normalized = content.replace(/^﻿/, '');
  const match = /^[ \t]*---\r?\n([\s\S]*?)\r?\n[ \t]*---(\r?\n|$)/.exec(normalized);
  return match ? (match[1] ?? null) : null;
}
