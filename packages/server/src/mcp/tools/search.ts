import { z } from 'zod';
import {
  buildListResolver,
  docNameFromPath,
  PREVIEW_URL_SOURCES,
  type PreviewUrlSource,
  type UiInfo,
} from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpPost,
  outputSchemaWithText,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  'Find the most relevant pages for a query (ranked: title boost + body BM25 + recency). For literal-string matching across every line, use `grep`.',
  '',
  'Same engine and ranking the cmd-K palette uses. Returns a sorted list of page (and folder, with `omnibar` intent) hits with score signals plus a body snippet per page.',
  '',
  '**Use when:**',
  '- Hunting for the canonical page on a topic',
  '- Locating a doc by partial title or path segments',
  '- Picking the best entry point before reading',
  '',
  '**Parameters:**',
  '- `query` — Search query (free-form; tokenized across title, name, path segments, and optionally body content).',
  "- `intent` (optional) — `'omnibar'` searches title/path/folders only (fast); `'full_text'` includes body content. Default `'full_text'`.",
  "- `scopes` (optional) — Override the result scope. Members: `'page'`, `'folder'`, `'content'`. Defaults derive from `intent`.",
  '- `limit` (optional) — Max rows; default 20, max 100.',
  '- `cwd` (optional) — Project root the query runs against.',
  '',
  '**Server requirement:** the Hocuspocus server must be running (`ok start`). If not, this tool returns a recovery hint; use `grep` as a server-free fallback.',
].join('\n');

interface SearchDeps {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  serverUrl: ServerUrlOrResolver;
}

const SCOPE_VALUES = ['page', 'folder', 'content'] as const;
const INTENT_VALUES = ['omnibar', 'full_text'] as const;

const InputSchema = {
  query: z.string().describe('Search query — title, path, or body terms.'),
  intent: z
    .enum(INTENT_VALUES)
    .optional()
    .describe(
      "'omnibar' for title/path/folder only (fast); 'full_text' includes body content. Default 'full_text'.",
    ),
  scopes: z
    .array(z.enum(SCOPE_VALUES))
    .optional()
    .describe(
      "Override the default scope set. Members: 'page', 'folder', 'content'. Defaults derive from intent.",
    ),
  limit: z.number().int().min(1).max(100).optional().describe('Max rows; default 20, max 100.'),
  cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
} as const;

const SearchResultRowSchema = z.object({
  kind: z.enum(['page', 'folder']),
  path: z.string(),
  docName: z.string(),
  title: z.string().nullable(),
  score: z.number(),
  signals: z.object({
    lexical: z.number(),
    fullText: z.number(),
    recency: z.number(),
  }),
  snippet: z.string().optional(),
  previewUrl: z.string().nullable(),
  previewUrlSource: z.enum(PREVIEW_URL_SOURCES).optional(),
});

const OutputSchema = outputSchemaWithText({
  cwd: z.string(),
  query: z.string(),
  intent: z.string(),
  resultCount: z.number().int(),
  results: z.array(SearchResultRowSchema),
  elapsedMs: z.number().nullable(),
  ui: z.object({
    baseUrl: z.string().nullable(),
    port: z.number().nullable(),
  }),
});

type SearchKind = 'page' | 'folder';

interface SearchApiRow {
  kind?: SearchKind;
  path?: string;
  title?: string | null;
  score?: number;
  signals?: { lexical?: number; fullText?: number; recency?: number };
  snippet?: string;
}

interface SearchApiResponse {
  ok: boolean;
  error?: string;
  query?: string;
  intent?: string;
  results?: SearchApiRow[];
  elapsedMs?: number;
  [key: string]: unknown;
}

interface SearchResultRow {
  kind: SearchKind;
  path: string;
  docName: string;
  title: string | null;
  score: number;
  signals: { lexical: number; fullText: number; recency: number };
  snippet?: string;
  previewUrl: string | null;
  previewUrlSource?: PreviewUrlSource;
}

interface SearchStructuredResult {
  cwd: string;
  query: string;
  intent: string;
  resultCount: number;
  results: SearchResultRow[];
  elapsedMs: number | null;
  ui: UiInfo;
}

function isSearchKind(value: unknown): value is SearchKind {
  return value === 'page' || value === 'folder';
}

function normalizeSignals(signals: SearchApiRow['signals']): {
  lexical: number;
  fullText: number;
  recency: number;
} {
  return {
    lexical: typeof signals?.lexical === 'number' ? signals.lexical : 0,
    fullText: typeof signals?.fullText === 'number' ? signals.fullText : 0,
    recency: typeof signals?.recency === 'number' ? signals.recency : 0,
  };
}

function formatResultsBlock(results: SearchResultRow[]): string {
  if (results.length === 0) return '';
  const lines: string[] = [];
  for (const r of results) {
    const title = r.title?.trim() || r.path;
    lines.push(`### ${title} (${r.path})`);
    lines.push(`Score ${r.score.toFixed(2)} — kind: ${r.kind}`);
    if (r.snippet) lines.push(r.snippet);
    lines.push('');
  }
  return lines.join('\n');
}

export function register(server: ServerInstance, deps: SearchDeps): void {
  server.registerTool(
    'search',
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
    async (args: {
      query: string;
      intent?: (typeof INTENT_VALUES)[number];
      scopes?: Array<(typeof SCOPE_VALUES)[number]>;
      limit?: number;
      cwd?: string;
    }) => {
      try {
        const context = await resolveProjectServerContext(
          deps.resolveCwd,
          deps.config,
          deps.serverUrl,
          args.cwd,
        );
        if (!context.ok) return textResult(`Error: ${context.error}`, true);
        const { cwd, config, url } = context;
        if (!url) {
          return textResult(
            `${HOCUSPOCUS_NOT_RUNNING_ERROR}\nFor server-free literal-string search, use \`grep\` instead — it walks the filesystem and does not need Hocuspocus.`,
            true,
          );
        }

        const intent = args.intent ?? 'full_text';
        const limit = args.limit ?? 20;
        const body: Record<string, unknown> = { query: args.query, intent, limit };
        if (args.scopes) body.scopes = args.scopes;

        const result = (await httpPost(url, '/api/search', body)) as SearchApiResponse;
        if (!result.ok) {
          return textResult(`Error: ${result.error}`, true);
        }

        const { resolve, ui } = await buildListResolver(
          { config, resolveCwd: async () => cwd },
          cwd,
        );

        const rows: SearchResultRow[] = (result.results ?? []).flatMap((row) => {
          if (!isSearchKind(row.kind) || typeof row.path !== 'string') return [];
          const docName = docNameFromPath(row.path);
          const resolved = resolve(docName);
          return [
            {
              kind: row.kind,
              path: row.path,
              docName,
              title: row.title ?? null,
              score: typeof row.score === 'number' ? row.score : 0,
              signals: normalizeSignals(row.signals),
              ...(row.snippet ? { snippet: row.snippet } : {}),
              previewUrl: resolved?.url ?? null,
              ...(resolved ? { previewUrlSource: resolved.source } : {}),
            },
          ];
        });

        const structured: SearchStructuredResult = {
          cwd,
          query: args.query,
          intent,
          resultCount: rows.length,
          results: rows,
          elapsedMs: typeof result.elapsedMs === 'number' ? result.elapsedMs : null,
          ui,
        };

        const header = `## Search results for "${args.query}" (${rows.length} hit${rows.length === 1 ? '' : 's'}, intent: ${intent})`;
        const text =
          rows.length === 0
            ? `No matches for "${args.query}".`
            : `${header}\n\n${formatResultsBlock(rows)}`;

        return textPlusStructured(text, structured);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    },
  );
}
