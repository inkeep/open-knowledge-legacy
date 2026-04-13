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
import { z } from 'zod';
import { httpGet } from '../mcp/tools/shared.ts';
import { parseFrontmatter } from '../utils/frontmatter.ts';
import { type GitCommit, type ProjectHistorySource, readProjectGitLog } from './project-log.ts';
import { type HistorySource, readShadowLog, type ShadowCommit } from './shadow-log.ts';

export type { GitCommit, ProjectHistorySource } from './project-log.ts';

/** Bound on recursive directory scan when computing `DirectoryMeta`. */
const DIRECTORY_SCAN_CAP = 1000;

/** Dirs skipped when computing DirectoryMeta (same policy as mtime-scan). */
const DIR_SKIP: ReadonlySet<string> = new Set([
  '.git',
  '.open-knowledge',
  '.openknowledge',
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

export interface EnrichPathDeps {
  projectDir: string;
  serverUrl?: string | undefined;
  /** History depth for rich mode; defaults to 5. */
  historyDepth?: number;
}

export interface EnrichPathOptions {
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

function pathToDocName(relPath: string): string {
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

  const base = {
    path: relPath,
    title: undefined as string | undefined,
    description: undefined as string | undefined,
    tags: [] as string[],
  };

  if (!rich) {
    const fm = await fmPromise;
    return {
      ...base,
      title: fm?.title,
      description: fm?.description,
      tags: fm?.tags ?? [],
      backlinkCount: null,
      backlinks: null,
      history: null,
      historySource: null,
      projectHistory: null,
      projectHistorySource: null,
    };
  }

  // Rich mode — fan out all four data sources in parallel.
  const [fm, backlinks, shadow, project] = await Promise.all([
    fmPromise,
    fetchBacklinks(deps.serverUrl, pathToDocName(relPath)).catch(() => null),
    readShadowLog(deps.projectDir, relPath, historyDepth).catch(() => ({
      commits: [] as ShadowCommit[],
      source: 'shadow-repo' as HistorySource,
    })),
    readProjectGitLog(deps.projectDir, relPath, historyDepth).catch(() => ({
      commits: [] as GitCommit[],
      source: 'git' as ProjectHistorySource,
    })),
  ]);

  return {
    ...base,
    title: fm?.title,
    description: fm?.description,
    tags: fm?.tags ?? [],
    backlinkCount: backlinks?.length ?? null,
    backlinks,
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
 */
export async function enrichDirectory(
  relPathInput: string,
  deps: Pick<EnrichPathDeps, 'projectDir'>,
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

  return {
    path: relPath,
    type: 'directory',
    directMdCount: scan.directMdCount,
    recursiveMdCount: scan.recursiveMdCount,
    childDirCount: scan.childDirCount,
    mostRecentMd,
    truncated: scan.truncated,
  };
}
