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
import { type HistorySource, readShadowLog, type ShadowCommit } from './shadow-log.ts';

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
   * Backlink count.
   *   - `null` on multi-path output or when Hocuspocus is unreachable (FR9)
   *   - `number` when populated via `/api/backlinks`
   */
  backlinkCount: number | null;
  /**
   * Recent activity on this path, merged across per-writer refs.
   *   - `null` on multi-path output (FR14 N-amplification avoidance)
   *   - `[]` when the shadow repo is present but has no edits touching the path
   *   - `ShadowCommit[]` when populated
   */
  history: ShadowCommit[] | null;
  /**
   * Three distinct values per FR15/R3:
   *   - `'shadow-repo'`         — history comes from a live shadow repo (may be `[]`)
   *   - `'shadow-repo-absent'`  — no shadow repo exists for this project
   *   - `null`                  — history field is `null` (multi-path output)
   */
  historySource: HistorySource | null;
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

async function fetchBacklinkCount(
  serverUrl: string | undefined,
  docName: string,
): Promise<number | null> {
  if (!serverUrl) return null;
  const result = await httpGet(serverUrl, `/api/backlinks?docName=${encodeURIComponent(docName)}`);
  if (!result.ok) return null;
  const raw = (result.backlinks ?? result.results ?? result.links) as unknown;
  return Array.isArray(raw) ? raw.length : 0;
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
  const richPromises = rich
    ? Promise.all([
        fetchBacklinkCount(deps.serverUrl, pathToDocName(relPath)).catch(() => null),
        readShadowLog(deps.projectDir, relPath, historyDepth).catch(() => ({
          commits: [],
          source: 'shadow-repo' as HistorySource,
        })),
      ])
    : Promise.resolve([null, null] as [null, null]);

  const [fm, richResult] = await Promise.all([fmPromise, richPromises]);

  const base = {
    path: relPath,
    title: fm?.title,
    description: fm?.description,
    tags: fm?.tags ?? [],
  };

  if (!rich || richResult === null || (richResult[0] === null && richResult[1] === null)) {
    // Slim shape: all rich fields null
    return {
      ...base,
      backlinkCount: null,
      history: null,
      historySource: null,
    };
  }

  const [backlinkCount, shadowResult] = richResult as [
    number | null,
    { commits: ShadowCommit[]; source: HistorySource },
  ];
  return {
    ...base,
    backlinkCount,
    history: shadowResult.commits,
    historySource: shadowResult.source,
  };
}
