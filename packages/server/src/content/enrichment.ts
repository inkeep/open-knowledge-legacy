/**
 * Shared `enrichPath()` — single source of truth for per-path metadata
 * assembly used by `read_document`, `search`, and `exec`.
 *
 * Returns a **single unified `EnrichedMeta` shape** with nullable fields
 * (D20 / FR14). Multi-path callers (ls/grep/find enrichment) pass
 * `{ includeRichFields: false }` and get `backlinkCount`, `history`, and
 * `historySource` as `null` to avoid N-amplification. Single-path callers
 * (cat) pass `{ includeRichFields: true }` and get all fields populated.
 *
 * `catalogCategory` was removed per D19 (folder INDEX.md frontmatter
 * deprecated across OK; catalog is an on-demand view, not a stored artifact).
 *
 * See SPEC.md FR7 + FR14 + FR15 + D13 + D19 + D20.
 */
import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { OK_DIR } from '@inkeep/open-knowledge-core';
import { parse as parseYaml } from 'yaml';
import { type output, type ZodType, z } from 'zod';
import type { FolderRule } from '../config/schema.ts';
import { httpGet } from '../mcp/tools/shared.ts';
import { resolveFolderFrontmatter } from './folder-rules.ts';
import { type GitCommit, type ProjectHistorySource, readProjectGitLog } from './project-log.ts';
import { type HistorySource, readShadowLog, type ShadowCommit } from './shadow-log.ts';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function parseFrontmatter<S extends ZodType>(content: string, schema: S): output<S> | null {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return null;
  try {
    const parsed = parseYaml(match[1]);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const result = schema.safeParse(parsed);
      return result.success ? result.data : null;
    }
  } catch {
    // Invalid YAML — degrade gracefully to "no frontmatter".
  }
  return null;
}

export type { GitCommit } from './project-log.ts';

/** Bound on recursive directory scan when computing `DirectoryMeta`. */
const DIRECTORY_SCAN_CAP = 1000;

/** Dirs skipped when computing DirectoryMeta (same policy as mtime-scan). */
const DIR_SKIP: ReadonlySet<string> = new Set([
  '.git',
  OK_DIR,
  'node_modules',
  '.changeset',
  '.claude',
  '.agents',
  'dist',
  'build',
]);

const WIKI_EXT_RE = /\.(md|mdx)$/i;

/** Full backlink entry surfaced in rich enrichment. */
export interface BacklinkEntry {
  /** docName of the source that links to this path. */
  source: string;
  title?: string;
  /** Short excerpt from the source around the link, when the server provides one. */
  snippet?: string | null;
}

interface DocumentForwardLinkEntry {
  kind: 'doc';
  docName: string;
  title?: string;
  snippet?: string | null;
}

interface ExternalForwardLinkEntry {
  kind: 'external';
  url: string;
  title?: string;
  snippet?: string | null;
}

export type ForwardLinkEntry = DocumentForwardLinkEntry | ExternalForwardLinkEntry;

/**
 * Directory-level enrichment — what a folder contains. Returned for
 * directory entries in `ls` output so agents get a real folder summary
 * without opening anything.
 *
 * This is the on-demand equivalent of what the old persisted INDEX.md
 * catalogs used to surface (D26 teardown): recursive file count, child
 * dirs, most recent wiki file as a content hint. Computed per call; no
 * storage layer.
 */
export interface DirectoryMeta {
  /** Project-root-relative path to the directory (no trailing slash). */
  path: string;
  type: 'directory';
  /**
   * Folder title from a matching `folders:` rule in config.yml, if any.
   * Absent when no folder rule matches or no rules are configured.
   */
  title?: string;
  /** Folder description from a matching `folders:` rule. Absent when no match. */
  description?: string;
  /**
   * Folder tags from matching `folders:` rules (concat + dedup across rules).
   * Absent when no matching rule contributes any tag.
   *
   * Note the type divergence from `EnrichedMeta.tags` (which is always
   * `string[]`, defaulting to `[]`): on `DirectoryMeta`, tags is optional so
   * that folders without a matching rule have no `tags` key at all — matching
   * the behavior of `title` and `description` on this type. EnrichedMeta.tags
   * stays always-present because every file has frontmatter state (even if
   * empty). Consumers of `EnrichedEntry` must handle both cases:
   *   file.tags.length       // always safe — array or []
   *   directory.tags?.length // optional — may be undefined
   */
  tags?: string[];
  /** Number of wiki (.md/.mdx) files directly in this dir (not recursive). */
  directMdCount: number;
  /** Number of wiki (.md/.mdx) files in this dir and all descendants (bounded). */
  recursiveMdCount: number;
  /** Subdirectories directly in this dir (excluding .git, node_modules, etc.). */
  childDirCount: number;
  /** Most recently modified wiki file under this dir — a content hint without opening. */
  mostRecentMd?: {
    path: string;
    title?: string;
    /** ISO mtime. */
    updatedAt: string;
  };
  /** `true` when the recursive scan hit `DIRECTORY_SCAN_CAP`. */
  truncated: boolean;
}

/**
 * Unified enrichment shape. Fields are nullable when unavailable or
 * deliberately omitted (multi-path avoidance of N-amplification).
 */
export interface EnrichedMeta {
  /** Project-root-relative path. */
  path: string;
  title?: string;
  description?: string;
  tags: string[];
  /**
   * Backlink count. Null on multi-path output or when Hocuspocus is
   * unreachable (FR9). Populated on single-path rich enrichment.
   */
  backlinkCount: number | null;
  /**
   * Full backlink list. Null on multi-path output (avoids N-amplification)
   * or when Hocuspocus is unreachable. Populated on single-path rich.
   */
  backlinks: BacklinkEntry[] | null;
  /**
   * Forward-link count. Null on multi-path output or when Hocuspocus is
   * unreachable. Populated on single-path rich enrichment.
   */
  forwardLinkCount: number | null;
  /**
   * Full forward-link list. Null on multi-path output or when Hocuspocus is
   * unreachable. Populated on single-path rich enrichment.
   */
  forwardLinks: ForwardLinkEntry[] | null;
  /**
   * Recent OK-edit activity on this path, merged across shadow-repo's
   * per-writer refs. Null on multi-path output. `[]` when shadow repo is
   * present but has no edits touching the path.
   */
  history: ShadowCommit[] | null;
  /**
   *   - `'shadow-repo'`         — history comes from a live shadow repo (may be `[]`)
   *   - `'shadow-repo-absent'`  — no shadow repo exists for this project
   *   - `null`                  — history field is `null` (multi-path output)
   */
  historySource: HistorySource | null;
  /**
   * Project-git commit history for this path — durable authored commits
   * from the project's own `.git/` (not the shadow repo). Null on
   * multi-path output.
   */
  projectHistory: GitCommit[] | null;
  /**
   *   - `'git'`         — project is a git repo (history may be `[]` for new files)
   *   - `'git-absent'`  — project has no `.git/`
   *   - `null`          — field not populated (multi-path output)
   */
  projectHistorySource: ProjectHistorySource | null;
}

interface EnrichPathDeps {
  projectDir: string;
  serverUrl?: string | undefined;
  /** History depth for rich mode; defaults to 5. */
  historyDepth?: number;
  /**
   * Folder-rule defaults from `config.yml` `folders:`. When provided, the
   * resolver merges rule-derived title/description/tags with the file's own
   * frontmatter — file scalars win; tags concat (rules first, file last)
   * with first-occurrence-preserved dedup. Omit / pass `[]` for today's
   * file-only behavior.
   */
  folderRules?: FolderRule[];
}

interface EnrichPathOptions {
  /**
   * When `true`, populate `backlinkCount` + `history` + `historySource`
   * (rich mode). When `false` (default), those three fields are `null`
   * regardless of data availability — used on multi-path enrichment to
   * avoid N-amplification of backlink HTTP calls and shadow-log reads.
   */
  includeRichFields?: boolean;
}

const FrontmatterSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export function pathToDocName(relPath: string): string {
  return relPath.replace(/\.md$/, '').replace(/\.mdx$/, '');
}

async function readFrontmatter(
  absPath: string,
): Promise<{ title?: string; description?: string; tags: string[] } | null> {
  try {
    const content = await readFile(absPath, 'utf-8');
    const fm = parseFrontmatter(content, FrontmatterSchema);
    if (!fm) return { tags: [] };
    return { title: fm.title, description: fm.description, tags: fm.tags ?? [] };
  } catch {
    return null;
  }
}

/**
 * Fetch the full backlinks list from the Hocuspocus server. Returns `null`
 * when no serverUrl is configured or the request fails — callers treat
 * null as "degrade gracefully" per FR9.
 */
async function fetchBacklinks(
  serverUrl: string | undefined,
  docName: string,
): Promise<BacklinkEntry[] | null> {
  if (!serverUrl) return null;
  const result = await httpGet(serverUrl, `/api/backlinks?docName=${encodeURIComponent(docName)}`);
  if (!result.ok) return null;
  const raw = (result.backlinks ?? result.results ?? result.links) as unknown;
  if (!Array.isArray(raw)) return [];
  const entries: BacklinkEntry[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const source =
      typeof rec.docName === 'string'
        ? rec.docName
        : typeof rec.source === 'string'
          ? rec.source
          : typeof rec.page === 'string'
            ? rec.page
            : undefined;
    if (!source) continue;
    entries.push({
      source,
      title: typeof rec.title === 'string' ? rec.title : undefined,
      snippet: typeof rec.snippet === 'string' ? rec.snippet : null,
    });
  }
  return entries;
}

/**
 * Chunk size for bulk backlink-count fetches. Keeps each URL comfortably
 * under typical 8KB HTTP URL limits even with long docNames (e.g. 100 x
 * ~70-char paths ≈ 7KB after comma-joining and percent-encoding).
 */
const BACKLINK_COUNT_CHUNK = 100;

/**
 * Bulk backlink-count fetch for slim-enrichment callers (multi-path ls/grep/
 * find/multi-cat). Batches into chunks of ${BACKLINK_COUNT_CHUNK} to keep
 * each request URL well under the 8KB limit; chunks fire in parallel so
 * latency stays close to a single round-trip. Returns `null` when no
 * serverUrl or every chunk fails; otherwise returns a `Map<docName, number>`
 * with entries from all successful chunks (partial chunks are merged —
 * missing docNames ⇒ not in the map).
 *
 * See `/api/backlink-counts` in `api-extension.ts`.
 */
export async function fetchBacklinkCountsBatch(
  serverUrl: string | undefined,
  docNames: string[],
): Promise<Map<string, number> | null> {
  if (!serverUrl || docNames.length === 0) return null;
  const unique = [...new Set(docNames)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += BACKLINK_COUNT_CHUNK) {
    chunks.push(unique.slice(i, i + BACKLINK_COUNT_CHUNK));
  }
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const param = encodeURIComponent(chunk.join(','));
      const result = await httpGet(serverUrl, `/api/backlink-counts?docNames=${param}`);
      if (!result.ok) return null;
      return (result.counts ?? {}) as Record<string, unknown>;
    }),
  );
  const out = new Map<string, number>();
  let anySuccess = false;
  for (const chunkResult of results) {
    if (!chunkResult) continue;
    anySuccess = true;
    for (const [name, val] of Object.entries(chunkResult)) {
      if (typeof val === 'number' && Number.isFinite(val)) out.set(name, val);
    }
  }
  return anySuccess ? out : null;
}

async function fetchForwardLinks(
  serverUrl: string | undefined,
  docName: string,
): Promise<ForwardLinkEntry[] | null> {
  if (!serverUrl) return null;
  const result = await httpGet(
    serverUrl,
    `/api/forward-links?docName=${encodeURIComponent(docName)}`,
  );
  if (!result.ok) return null;
  const raw = (result.forwardLinks ?? result.links ?? result.results) as unknown;
  if (!Array.isArray(raw)) return [];
  const entries: ForwardLinkEntry[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    if (rec.kind === 'external' && typeof rec.url === 'string') {
      entries.push({
        kind: 'external',
        url: rec.url,
        title: typeof rec.title === 'string' ? rec.title : undefined,
        snippet: typeof rec.snippet === 'string' ? rec.snippet : null,
      });
      continue;
    }
    const docNameValue = typeof rec.docName === 'string' ? rec.docName : undefined;
    if (!docNameValue) continue;
    entries.push({
      kind: 'doc',
      docName: docNameValue,
      title: typeof rec.title === 'string' ? rec.title : undefined,
      snippet: typeof rec.snippet === 'string' ? rec.snippet : null,
    });
  }
  return entries;
}

/**
 * Merge file frontmatter with folder-rule defaults (FR3 + FR4).
 * Scalars (title, description): file value wins when set; folder value fills in.
 * Tags: concat folder tags first, file tags last; dedup first-occurrence.
 */
function mergeFileAndFolder(
  fileFm: { title?: string; description?: string; tags: string[] } | null,
  folderRules: FolderRule[] | undefined,
  relPath: string,
): { title?: string; description?: string; tags: string[] } {
  const rules = folderRules ?? [];
  const folderFm = rules.length === 0 ? {} : resolveFolderFrontmatter(rules, relPath);
  const title = fileFm?.title ?? folderFm.title;
  const description = fileFm?.description ?? folderFm.description;
  const fileTags = fileFm?.tags ?? [];
  const folderTags = folderFm.tags ?? [];
  let tags: string[];
  if (folderTags.length === 0) {
    tags = fileTags;
  } else {
    const seen = new Set<string>();
    tags = [];
    for (const tag of folderTags) {
      if (!seen.has(tag)) {
        seen.add(tag);
        tags.push(tag);
      }
    }
    for (const tag of fileTags) {
      if (!seen.has(tag)) {
        seen.add(tag);
        tags.push(tag);
      }
    }
  }
  return { title, description, tags };
}

/**
 * Assemble enrichment for a single wiki path. See `EnrichedMeta` for the
 * unified shape and the convention for nullable fields on multi-path output.
 */
export async function enrichPath(
  relPathInput: string,
  deps: EnrichPathDeps,
  options: EnrichPathOptions = {},
): Promise<EnrichedMeta> {
  const relPath = relPathInput.replace(/^\.\//, '').replace(/^\/+/, '');
  const absPath = resolve(deps.projectDir, relPath);
  const historyDepth = deps.historyDepth ?? 5;
  const rich = options.includeRichFields === true;

  const fmPromise = readFrontmatter(absPath);

  if (!rich) {
    const fm = await fmPromise;
    const merged = mergeFileAndFolder(fm, deps.folderRules, relPath);
    return {
      path: relPath,
      title: merged.title,
      description: merged.description,
      tags: merged.tags,
      backlinkCount: null,
      backlinks: null,
      forwardLinkCount: null,
      forwardLinks: null,
      history: null,
      historySource: null,
      projectHistory: null,
      projectHistorySource: null,
    };
  }

  // Rich mode — fan out all five data sources in parallel.
  const [fm, backlinks, forwardLinks, shadow, project] = await Promise.all([
    fmPromise,
    fetchBacklinks(deps.serverUrl, pathToDocName(relPath)).catch(() => null),
    fetchForwardLinks(deps.serverUrl, pathToDocName(relPath)).catch(() => null),
    readShadowLog(deps.projectDir, relPath, historyDepth).catch(() => ({
      commits: [] as ShadowCommit[],
      source: 'shadow-repo' as HistorySource,
    })),
    readProjectGitLog(deps.projectDir, relPath, historyDepth).catch(() => ({
      commits: [] as GitCommit[],
      source: 'git' as ProjectHistorySource,
    })),
  ]);

  const merged = mergeFileAndFolder(fm, deps.folderRules, relPath);
  return {
    path: relPath,
    title: merged.title,
    description: merged.description,
    tags: merged.tags,
    backlinkCount: backlinks?.length ?? null,
    backlinks,
    forwardLinkCount: forwardLinks?.length ?? null,
    forwardLinks,
    history: shadow.commits,
    historySource: shadow.source,
    projectHistory: project.commits,
    projectHistorySource: project.source,
  };
}

/** Union type surfaced to callers that enrich a mixed list of files and dirs. */
export type EnrichedEntry = EnrichedMeta | DirectoryMeta;

interface DirScanResult {
  directMdCount: number;
  recursiveMdCount: number;
  childDirCount: number;
  mostRecent: { absPath: string; relPath: string; mtimeMs: number } | null;
  truncated: boolean;
}

async function scanDirectory(absDir: string, projectDir: string): Promise<DirScanResult> {
  const result: DirScanResult = {
    directMdCount: 0,
    recursiveMdCount: 0,
    childDirCount: 0,
    mostRecent: null,
    truncated: false,
  };
  let visited = 0;
  const queue: { path: string; depth: number }[] = [{ path: absDir, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (visited >= DIRECTORY_SCAN_CAP) {
      result.truncated = true;
      break;
    }
    let entries: Dirent[];
    try {
      entries = await readdir(current.path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (visited >= DIRECTORY_SCAN_CAP) {
        result.truncated = true;
        break;
      }
      visited++;
      const name = entry.name;
      if (entry.isDirectory()) {
        if (DIR_SKIP.has(name) || name.startsWith('.')) continue;
        if (current.depth === 0) result.childDirCount++;
        queue.push({ path: `${current.path}/${name}`, depth: current.depth + 1 });
      } else if (entry.isFile() && WIKI_EXT_RE.test(name)) {
        result.recursiveMdCount++;
        if (current.depth === 0) result.directMdCount++;
        const absFile = `${current.path}/${name}`;
        try {
          const st = await stat(absFile);
          if (!result.mostRecent || st.mtimeMs > result.mostRecent.mtimeMs) {
            const rel = relative(projectDir, absFile);
            // Normalize to forward-slashes — project-root-relative paths in
            // EnrichedMeta are always POSIX-form (agents and bash consume them).
            const relPath = rel.split(/[\\/]/).filter(Boolean).join('/');
            result.mostRecent = { absPath: absFile, relPath, mtimeMs: st.mtimeMs };
          }
        } catch {}
      }
    }
  }
  return result;
}

/**
 * Assemble enrichment for a directory path. Returns folder-shape metadata
 * (counts + most-recent wiki file hint) — the on-demand equivalent of the
 * old persisted INDEX.md catalogs (D26 teardown).
 *
 * When `folderRules` is provided, a matching rule's title/description/tags
 * are attached directly to the returned `DirectoryMeta` (D19 / FR5 folder-
 * level view). `scanDirectory` semantics (recursive/direct/childDirCount)
 * are NOT affected by rules — counts remain raw-count per FR12.
 */
export async function enrichDirectory(
  relPathInput: string,
  deps: Pick<EnrichPathDeps, 'projectDir' | 'folderRules'>,
): Promise<DirectoryMeta> {
  const relPath = relPathInput.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
  const absDir = resolve(deps.projectDir, relPath);
  const scan = await scanDirectory(absDir, deps.projectDir);

  let mostRecentMd: DirectoryMeta['mostRecentMd'];
  if (scan.mostRecent) {
    const fm = await readFrontmatter(scan.mostRecent.absPath);
    mostRecentMd = {
      path: scan.mostRecent.relPath,
      title: fm?.title ?? basename(scan.mostRecent.relPath),
      updatedAt: new Date(scan.mostRecent.mtimeMs).toISOString(),
    };
  }

  const result: DirectoryMeta = {
    path: relPath,
    type: 'directory',
    directMdCount: scan.directMdCount,
    recursiveMdCount: scan.recursiveMdCount,
    childDirCount: scan.childDirCount,
    mostRecentMd,
    truncated: scan.truncated,
  };

  const rules = deps.folderRules ?? [];
  if (rules.length > 0) {
    const folderFm = resolveFolderFrontmatter(rules, relPath);
    if (folderFm.title !== undefined) result.title = folderFm.title;
    if (folderFm.description !== undefined) result.description = folderFm.description;
    if (folderFm.tags !== undefined && folderFm.tags.length > 0) result.tags = folderFm.tags;
  }

  return result;
}
