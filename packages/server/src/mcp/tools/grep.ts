import { relative as relativePath, resolve as resolvePath } from 'node:path';
import { GREP_MAX_RESULTS, OK_DIR } from '@inkeep/open-knowledge-core';
import { z } from 'zod';
import { type GrepMatch, grep } from '../../bash/index.ts';
import { resolveContentDir } from '../../config/paths.ts';
import { type EnrichedMeta, enrichPath } from '../../content/enrichment.ts';
import { createContentFilter } from '../../content-filter.ts';
import {
  buildListResolver,
  docNameFromPath,
  PREVIEW_URL_SOURCES,
  type PreviewUrlSource,
  type UiInfo,
} from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  'Find every line that literally contains a string, grouped by file with frontmatter metadata. For ranked retrieval that mirrors cmd-K, use `search`.',
  '',
  'Matches are grouped by file; each file is annotated with its title, description, and tags so you can judge relevance without opening it first.',
  '',
  '**Use when:**',
  '- Finding every occurrence of a literal phrase across the wiki',
  '- Auditing a term, identifier, or quote — coverage matters more than ranking',
  '',
  '**When the project has `.ok/`**, strongly prefer this over your native `Grep` for wiki search — results include article metadata so you can skip irrelevant matches without extra reads. In projects without `.ok/`, use native `Grep` as usual.',
  '',
  '**Parameters:**',
  '- `query` — Literal text to search for (fixed-string match, no regex)',
  '- `case_sensitive` (optional, default false) — case-sensitive match',
  '- `cwd` (optional) — Project root the grep runs against. Defaults only when the MCP client advertises exactly one root.',
].join('\n');

interface GrepDeps {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  serverUrl?: ServerUrlOrResolver;
}

interface GrepResultRow {
  path: string;
  docName: string;
  title: string | null;
  description: string | null;
  tags: string[];
  matches: Array<{ line: number; text: string }>;
  previewUrl: string | null;
  previewUrlSource?: PreviewUrlSource;
}

interface GrepStructuredResult {
  cwd: string;
  query: string;
  matchCount: number;
  fileCount: number;
  truncated: boolean;
  results: GrepResultRow[];
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

interface GrepResult {
  text: string;
  structured: GrepStructuredResult | null;
}

export async function buildGrepResult(
  args: { query: string; case_sensitive?: boolean; cwd?: string },
  deps: GrepDeps,
): Promise<GrepResult> {
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
  const maxResults = GREP_MAX_RESULTS;

  const rawMatches = await grep(args.query, cwd, {
    caseInsensitive: !(args.case_sensitive ?? false),
    include: ['**/*.md', '**/*.mdx'],
    exclude: ['node_modules', '.git', '.claude', '.changeset', OK_DIR],
    maxResults: maxResults + 1,
  });

  const contentDir = resolveContentDir(config, cwd);
  const filter = createContentFilter({ projectDir: cwd, contentDir });
  const matches = rawMatches.filter((m) => {
    const contentRelPath = relativePath(contentDir, resolvePath(cwd, m.path));
    if (contentRelPath.startsWith('..')) return false;
    return !filter.isExcluded(contentRelPath);
  });

  const truncated = rawMatches.length > maxResults;
  const visible = matches.slice(0, maxResults);

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

  const metaByPath = new Map<string, EnrichedMeta>();
  await Promise.all(
    groups.map(async (g) => {
      try {
        const meta = await enrichPath(g.path, {
          projectDir: cwd,
          serverUrl: resolvedServerUrl,
        });
        metaByPath.set(g.path, meta);
      } catch {}
    }),
  );

  const lines: string[] = [];
  lines.push(
    `## Grep results for "${args.query}" (${visible.length} match${visible.length === 1 ? '' : 'es'} in ${groups.length} file${groups.length === 1 ? '' : 's'})`,
    '',
  );

  const results: GrepResultRow[] = [];
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
      `_${visible.length} of ${rawMatches.length}+ matches shown (max ${maxResults}). Refine your query to narrow results._`,
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

const InputSchema = {
  query: z.string().describe('Literal text to search for'),
  case_sensitive: z.boolean().optional().describe('Case-sensitive search (default false)'),
  cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
} as const;

const GrepResultRowSchema = z.object({
  path: z.string(),
  docName: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  matches: z.array(
    z.object({
      line: z.number().int(),
      text: z.string(),
    }),
  ),
  previewUrl: z.string().nullable(),
  previewUrlSource: z.enum(PREVIEW_URL_SOURCES).optional(),
});

const OutputSchema = {
  cwd: z.string(),
  query: z.string(),
  matchCount: z.number().int(),
  fileCount: z.number().int(),
  truncated: z.boolean(),
  results: z.array(GrepResultRowSchema),
  ui: z.object({
    baseUrl: z.string().nullable(),
    port: z.number().nullable(),
  }),
} as const;

export function register(server: ServerInstance, deps: GrepDeps): void {
  server.registerTool(
    'grep',
    {
      description: DESCRIPTION,
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args: { query: string; case_sensitive?: boolean; cwd?: string }) => {
      try {
        const { text, structured } = await buildGrepResult(args, deps);
        if (!structured) return textResult(text);
        return textPlusStructured(text, structured);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    },
  );
}
