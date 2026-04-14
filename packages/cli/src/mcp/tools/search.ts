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
import type { Config } from '../../config/schema.ts';
import { type EnrichedMeta, enrichPath } from '../../content/enrichment.ts';
import type { ServerInstance } from './shared.ts';
import { textResult } from './shared.ts';

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

export interface SearchDeps {
  projectDir: string;
  config: Config;
  serverUrl?: string | undefined;
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

export async function buildSearchResult(
  args: { query: string; case_sensitive?: boolean },
  deps: SearchDeps,
): Promise<string> {
  const maxResults = deps.config.mcp.tools.search.maxResults;
  const include = deps.config.content.include;
  const exclude = deps.config.content.exclude;

  // Request one extra match so we can tell whether the result set was truncated.
  const matches = await grep(args.query, {
    caseInsensitive: !(args.case_sensitive ?? false),
    include,
    exclude: [...exclude, 'node_modules', '.git', '.claude', '.changeset', '.open-knowledge'],
    maxResults: maxResults + 1,
  });

  const truncated = matches.length > maxResults;
  const visible = truncated ? matches.slice(0, maxResults) : matches;

  if (visible.length === 0) {
    return `No matches for "${args.query}".`;
  }

  const groups = groupByFile(visible);

  // Per-file enrichment via shared helper (D4/D13). Slim shape per FR14 —
  // no history, no backlinkCount, to avoid N-amplification on multi-file
  // search output.
  const metaByPath = new Map<string, EnrichedMeta>();
  await Promise.all(
    groups.map(async (g) => {
      try {
        const meta = await enrichPath(g.path, {
          projectDir: deps.projectDir,
          serverUrl: deps.serverUrl,
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
  }

  if (truncated) {
    lines.push(
      `_${visible.length} of ${matches.length}+ matches shown. Raise \`mcp.tools.search.maxResults\` in config.yml to see more._`,
    );
  }

  return lines.join('\n');
}

export function register(server: ServerInstance, deps: SearchDeps): void {
  server.tool(
    'search',
    DESCRIPTION,
    {
      query: z.string().describe('Literal text to search for'),
      case_sensitive: z.boolean().optional().describe('Case-sensitive search (default false)'),
    },
    async (args: { query: string; case_sensitive?: boolean }) => {
      try {
        const body = await buildSearchResult(args, deps);
        return textResult(body);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    },
  );
}
