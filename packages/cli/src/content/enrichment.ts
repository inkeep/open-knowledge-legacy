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
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { httpGet } from '../mcp/tools/shared.ts';
import { parseFrontmatter } from '../utils/frontmatter.ts';
import { type GitCommit, type ProjectHistorySource, readProjectGitLog } from './project-log.ts';
import { type HistorySource, readShadowLog, type ShadowCommit } from './shadow-log.ts';

export type { GitCommit, ProjectHistorySource } from './project-log.ts';

/** Full backlink entry surfaced in rich enrichment. */
export interface BacklinkEntry {
  /** docName of the source that links to this path. */
  source: string;
  title?: string;
  /** Short excerpt from the source around the link, when the server provides one. */
  snippet?: string | null;
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
