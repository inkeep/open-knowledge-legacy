/**
 * Nested folder-frontmatter cascade resolver.
 *
 * Walks a target folder's ancestry from project root toward the folder
 * itself, reading each `<level>/.ok/frontmatter.yml` (when present) and
 * merging defaults under per-type semantics (D6 generalized):
 *
 *   - **Scalars** (string, number, boolean, null) — last-wins / replace.
 *     The leaf overrides the root. `title`, `description`, and any other
 *     declared scalar key behaves the same way.
 *   - **Arrays** — union-and-dedup along the chain, first-occurrence
 *     preserved. A `specs/.ok/frontmatter.yml` declaring `tags: [spec]`
 *     plus `specs/foo/evidence/.ok/frontmatter.yml` declaring
 *     `tags: [evidence]` produces `[spec, evidence]` at the evidence-folder
 *     level. Same rule for `owners`, `aliases`, `reviewers`, etc.
 *   - **Objects** — last-wins / replace (treated as a scalar). Deep-merging
 *     arbitrary nested objects is ambiguous; replace is the predictable
 *     default. If you need additive nested merging, model the field as an
 *     array.
 *
 * Schema is intentionally open: any key declared in `.ok/frontmatter.yml`
 * cascades. The cascade resolver does not validate keys against a
 * type registry — agents and humans can introduce new keys at will, and
 * file-frontmatter inheritance picks them up automatically.
 *
 * Synchronous for now — read-on-demand per `enrichPath` call. Caching
 * with file-watcher invalidation is a follow-up if perf shows up.
 *
 * **Root-level cascade.** The project root `<projectDir>/.ok/frontmatter.yml`
 * is read first and seeds the cascade. Root-level docs and the root
 * directory listing both inherit from it.
 *
 * Templates own create-time tag origination (D6 part 2): when an agent
 * picks a template, the template's tags REPLACE any cascaded tags as the
 * new doc's tag set. The union-and-dedup rule here is the read-time
 * enrichment path only.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { type FrontmatterRecord, mergeCascade } from './frontmatter-merge.ts';

type FolderFrontmatter = {
  title?: string;
  description?: string;
  tags?: string[];
} & Record<string, unknown>;

export function resolveNestedFrontmatter(
  projectDir: string,
  folderRelPath: string,
): FolderFrontmatter {
  return resolveNestedFrontmatterWithSources(projectDir, folderRelPath).merged;
}

interface ResolvedFrontmatterWithSources {
  merged: FolderFrontmatter;
  sources: Record<string, string>;
}

export function resolveNestedFrontmatterWithSources(
  projectDir: string,
  folderRelPath: string,
): ResolvedFrontmatterWithSources {
  const normalized = folderRelPath.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
  const segments =
    normalized === '' || normalized === '.'
      ? []
      : normalized.split('/').filter((s) => s.length > 0);

  let result: FrontmatterRecord = {};
  const sources: Record<string, string> = {};
  let anyMatch = false;

  for (let depth = 0; depth <= segments.length; depth++) {
    const folderForLevel = depth === 0 ? '' : segments.slice(0, depth).join('/');
    const yamlPath =
      depth === 0
        ? resolve(projectDir, '.ok', 'frontmatter.yml')
        : resolve(projectDir, folderForLevel, '.ok', 'frontmatter.yml');
    if (!existsSync(yamlPath)) continue;

    const parsed = readFrontmatterYaml(yamlPath);
    if (parsed == null) continue;

    result = mergeCascade(result, parsed);
    for (const key of Object.keys(parsed)) {
      if (parsed[key] === undefined) continue;
      sources[key] = folderForLevel;
    }
    anyMatch = true;
  }

  return anyMatch ? { merged: coerceWellKnown(result), sources } : { merged: {}, sources: {} };
}

function coerceWellKnown(raw: Record<string, unknown>): FolderFrontmatter {
  const out: FolderFrontmatter = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = value;
  }
  if (typeof raw.title === 'string') out.title = raw.title;
  else delete out.title;
  if (typeof raw.description === 'string') out.description = raw.description;
  else delete out.description;
  if (Array.isArray(raw.tags)) {
    out.tags = (raw.tags as unknown[]).filter((t): t is string => typeof t === 'string');
  } else {
    delete out.tags;
  }
  return out;
}

const warnedPaths = new Set<string>();

function readFrontmatterYaml(absYamlPath: string): Record<string, unknown> | null {
  let content: string;
  try {
    content = readFileSync(absYamlPath, 'utf-8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (err) {
    if (!warnedPaths.has(absYamlPath)) {
      warnedPaths.add(absYamlPath);
      const reason = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console -- ad-hoc operator-facing diagnostic
      console.warn(
        `[ok-folder-frontmatter] malformed YAML at ${absYamlPath} — folder defaults skipped. Fix the file or delete it. Reason: ${reason}`,
      );
    }
    return null;
  }

  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

export function nestedOkPath(projectDir: string, folderRelPath: string, member: string): string {
  const normalized = folderRelPath.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
  return normalized === '' || normalized === '.'
    ? join(projectDir, '.ok', member)
    : join(projectDir, normalized, '.ok', member);
}

export function parentFolderOf(relPath: string): string {
  const idx = relPath.lastIndexOf('/');
  return idx === -1 ? '' : relPath.slice(0, idx);
}
