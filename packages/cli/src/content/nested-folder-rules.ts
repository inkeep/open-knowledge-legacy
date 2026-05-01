/**
 * Nested folder-frontmatter cascade resolver.
 *
 * Walks a target folder's ancestry from project root toward the folder
 * itself, reading each `<level>/.ok/frontmatter.yml` (when present) and
 * merging defaults under last-wins / replace semantics (D6 / D14 in spec
 * 2026-05-01-folder-level-metadata-and-templates).
 *
 * Unlike the `folders[]` glob-based cascade in `folder-rules.ts`, this
 * resolver reads files from disk. Synchronous for now — read-on-demand
 * per `enrichPath` call. Caching with file-watcher invalidation is a
 * follow-up if perf shows up.
 *
 * **The project root `<projectDir>/.ok/frontmatter.yml` is skipped.** The
 * existing `folders[]` mechanism in `.ok/config.yml` handles root-level
 * cascade; nested files only apply at folders BELOW the project root.
 *
 * Tags here REPLACE (last-wins), they do NOT concat. Templates are the
 * source of tags at create time; cascade is read-time enrichment only.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { FolderFrontmatter } from '../config/schema.ts';

/**
 * Compute the merged nested-cascade frontmatter for a target FOLDER.
 *
 * For a doc at `meetings/foo.md`, callers pass the parent folder
 * (`"meetings"`). For a directory listing at `meetings/`, callers pass
 * `"meetings"`. The resolver walks `<projectDir>/meetings/.ok/frontmatter.yml`
 * (and any deeper ancestors when the path is nested further), merging
 * root → leaf with last-wins semantics.
 *
 * @param projectDir       - Absolute project root.
 * @param folderRelPath    - Project-root-relative folder path. Empty
 *                           string, `.`, or `/` mean "project root";
 *                           those return `{}` since the project root is
 *                           handled by `folders[]`.
 */
export function resolveNestedFrontmatter(
  projectDir: string,
  folderRelPath: string,
): FolderFrontmatter {
  const normalized = folderRelPath.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (normalized === '' || normalized === '.') return {};

  const segments = normalized.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return {};

  const result: FolderFrontmatter = {};
  let anyMatch = false;

  // Root → leaf walk. Each successive read REPLACES earlier values per-key.
  for (let depth = 1; depth <= segments.length; depth++) {
    const folderPath = segments.slice(0, depth).join('/');
    const yamlPath = resolve(projectDir, folderPath, '.ok', 'frontmatter.yml');
    if (!existsSync(yamlPath)) continue;

    const parsed = readFrontmatterYaml(yamlPath);
    if (parsed == null) continue;

    if (typeof parsed.title === 'string') result.title = parsed.title;
    if (typeof parsed.description === 'string') result.description = parsed.description;
    if (Array.isArray(parsed.tags)) {
      result.tags = parsed.tags.filter((t): t is string => typeof t === 'string');
    }
    anyMatch = true;
  }

  return anyMatch ? result : {};
}

interface RawFolderFrontmatter {
  title?: unknown;
  description?: unknown;
  tags?: unknown;
}

function readFrontmatterYaml(absYamlPath: string): RawFolderFrontmatter | null {
  let content: string;
  try {
    content = readFileSync(absYamlPath, 'utf-8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch {
    // Malformed YAML in a folder-level config file is treated as absent.
    // Read paths must not throw; the server-side write path validates.
    return null;
  }

  if (parsed == null || typeof parsed !== 'object') return null;
  return parsed as RawFolderFrontmatter;
}

/**
 * Resolve the absolute path of a member inside a folder's `.ok/` directory.
 * Shared with future FR3 (templates_available walk) + FR6 (set_folder_rule
 * write target). Empty `folderRelPath` yields the project root's `.ok/`.
 */
export function nestedOkPath(projectDir: string, folderRelPath: string, member: string): string {
  const normalized = folderRelPath.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
  return normalized === '' || normalized === '.'
    ? join(projectDir, '.ok', member)
    : join(projectDir, normalized, '.ok', member);
}

/**
 * Compute the parent folder for a file's relative path. `"meetings/foo.md"`
 * → `"meetings"`; `"foo.md"` → `""` (project root). Used by the file-side
 * caller to derive the folder context for `resolveNestedFrontmatter`.
 */
export function parentFolderOf(relPath: string): string {
  const idx = relPath.lastIndexOf('/');
  return idx === -1 ? '' : relPath.slice(0, idx);
}
