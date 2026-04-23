/**
 * `search` MCP tool — enriched grep.
 *
 * Runs grep across tracked content and groups matches by file. Each matched
 * file is annotated with frontmatter metadata (title, description, tags) so
 * the agent can evaluate relevance before reading.
 *
 * See spec: specs/2026-04-12-enriched-read-tools/SPEC.md § Tool 2.
 */
import { z } from 'zod';
import { type GrepMatch, grep } from '../../bash/index.ts';
import { OK_DIR } from '../../constants.ts';
import { type EnrichedMeta, enrichPath } from '../../content/enrichment.ts';
import {
  buildListResolver,
  docNameFromPath,
  type PreviewUrlSource,
  type UiInfo,
} from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import { resolveProjectServerContext, textPlusStructured, textResult } from './shared.ts';

export const DESCRIPTION = [
  'Search wiki content with metadata-enriched results. Matches are grouped by file; each file is annotated with its title, description, and tags so you can judge relevance without opening it first.',
  '',
  '**Use when:**',
  '- Finding all articles mentioning a topic',
  '- Locating a specific term across the wiki before deciding which file to read',
  '',
  'Prefer this over your native `Grep` for wiki search — results include article metadata so you can skip irrelevant matches without extra reads.',
  '',
  '**Parameters:**',
  '- `query` — Literal text to search for (fixed-string match, no regex)',
  '- `case_sensitive` (optional, default false) — case-sensitive match',
].join('\n');

interface SearchDeps {
  /** Async resolver for per-call cwd; see `ResolveCwd` in tools/index.ts. */
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  /**
   * Hocuspocus URL — string or lazy resolver (see `packages/cli/src/mcp/server.ts`).
   * Resolved once per call before passing into `enrichPath`.
   */
  serverUrl?: ServerUrlOrResolver;
}

interface SearchResultRow {
  path: string;
  docName: string;
  title: string | null;
  description: string | null;
  tags: string[];
  matches: Array<{ line: number; text: string }>;
  previewUrl: string | null;
  previewUrlSource?: PreviewUrlSource;
}

interface SearchStructuredResult {
  cwd: string;
  query: string;
  matchCount: number;
  fileCount: number;
  truncated: boolean;
  results: SearchResultRow[];
  ui: UiInfo;
}

interface FileGroup {
  path: string;
  matches: GrepMatch[];
}

function groupByFile(matches: GrepMatch[]): FileGroup[] {
  const byPath = new Map<string, GrepMatch[]>();
  for (const m of matches) {
    const existing = byPath.get(m.path);
    if (existing) {
      existing.push(m);
    } else {
      byPath.set(m.path, [m]);
    }
  }
  return [...byPath.entries()].map(([path, fileMatches]) => ({ path, matches: fileMatches }));
}

interface SearchResult {
  text: string;
  structured: SearchStructuredResult | null;
}

export async function buildSearchResult(
  args: { query: string; case_sensitive?: boolean; cwd?: string },
  deps: SearchDeps,
): Promise<SearchResult> {
  const context = await resolveProjectServerContext(
    deps.resolveCwd,
    deps.config,
    deps.serverUrl,
    args.cwd,
  );
  if (!context.ok) {
    throw new Error(context.error);
  }
  const { cwd, config, url: resolvedServerUrl } = context;
  const maxResults = config.mcp.tools.search.maxResults;
  const include = config.content.include;
  const exclude = config.content.exclude;

  // Request one extra match so we can tell whether the result set was truncated.
  const matches = await grep(args.query, cwd, {
    caseInsensitive: !(args.case_sensitive ?? false),
    include,
    exclude: [...exclude, 'node_modules', '.git', '.claude', '.changeset', OK_DIR],
    maxResults: maxResults + 1,
  });

  const truncated = matches.length > maxResults;
  const visible = truncated ? matches.slice(0, maxResults) : matches;

  const { resolve, ui } = await buildListResolver(
    {
      config,
      resolveCwd: async () => cwd,
    },
    cwd,
  );

  if (visible.length === 0) {
    return {
      text: `No matches for "${args.query}".`,
      structured: {
        query: args.query,
        matchCount: 0,
        fileCount: 0,
        truncated: false,
        results: [],
        ui,
        cwd,
      },
    };
  }

  const groups = groupByFile(visible);

  // Per-file enrichment via shared helper (D4/D13). Slim shape per FR14 —
  // no history, no backlinkCount, to avoid N-amplification on multi-file
  // search output.
  const metaByPath = new Map<string, EnrichedMeta>();
  const folderRules = config.folders;
  await Promise.all(
    groups.map(async (g) => {
      try {
        const meta = await enrichPath(g.path, {
          projectDir: cwd,
          serverUrl: resolvedServerUrl,
          folderRules,
        });
        metaByPath.set(g.path, meta);
      } catch {
        // Enrichment failure is non-fatal — omit metadata for that file.
      }
    }),
  );

  const lines: string[] = [];
  lines.push(
    `## Search results for "${args.query}" (${visible.length} match${visible.length === 1 ? '' : 'es'} in ${groups.length} file${groups.length === 1 ? '' : 's'})`,
    '',
  );

  const results: SearchResultRow[] = [];
  for (const group of groups) {
    const meta = metaByPath.get(group.path);
    const title = meta?.title ?? group.path;
    lines.push(`### ${title} (${group.path})`);
    if (meta?.tags?.length) {
      lines.push(`Tags: ${meta.tags.join(', ')}`);
    }
    if (meta?.description) {
      lines.push(`${meta.description}`);
    }
    for (const m of group.matches) {
      lines.push(`- Line ${m.line}: ${m.text}`);
    }
    lines.push('');

    const docName = docNameFromPath(group.path);
    const resolved = resolve(docName);
    results.push({
      path: group.path,
      docName,
      title: meta?.title ?? null,
      description: meta?.description ?? null,
      tags: meta?.tags ?? [],
      matches: group.matches.map((m) => ({ line: m.line, text: m.text })),
      previewUrl: resolved?.url ?? null,
      ...(resolved ? { previewUrlSource: resolved.source } : {}),
    });
  }

  if (truncated) {
    lines.push(
      `_${visible.length} of ${matches.length}+ matches shown. Raise \`mcp.tools.search.maxResults\` in config.yml to see more._`,
    );
  }

  return {
    text: lines.join('\n'),
    structured: {
      query: args.query,
      matchCount: visible.length,
      fileCount: groups.length,
      truncated,
      results,
      ui,
      cwd,
    },
  };
}

export function register(server: ServerInstance, deps: SearchDeps): void {
  server.tool(
    'search',
    DESCRIPTION,
    {
      query: z.string().describe('Literal text to search for'),
      case_sensitive: z.boolean().optional().describe('Case-sensitive search (default false)'),
      cwd: z
        .string()
        .optional()
        .describe(
          'Absolute host path to search in. Defaults only when the MCP client advertises exactly one root; otherwise pass `cwd` explicitly.',
        ),
    },
    async (args: { query: string; case_sensitive?: boolean; cwd?: string }) => {
      try {
        const { text, structured } = await buildSearchResult(args, deps);
        if (!structured) return textResult(text);
        return textPlusStructured(text, structured);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    },
  );
}
