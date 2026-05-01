import { z } from 'zod';
import { resolvePreviewUrlForTool } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  normalizeDocName,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] List version history for a document.',
  'Returns timeline entries from the shadow repo, sorted by timestamp descending.',
  'Each entry includes a commit SHA that can be passed to `rollback_to_version`.',
  '',
  '**Parameters:**',
  '- `docName` — Document name to query history for, typically without extension. A trailing `.md` or `.mdx` is stripped automatically.',
  '- `branch` (optional) — Branch name (default: current branch)',
  '- `limit` (optional) — Maximum entries to return (default 50, max 200)',
  '- `offset` (optional) — Number of entries to skip for pagination (default 0)',
  '- `type` (optional) — Filter by entry type: "checkpoint", "upstream", or "wip"',
  '- `author` (optional) — Filter to entries by this author name or email',
  '- `excludeAuthor` (optional) — Exclude entries by this author name or email',
].join('\n');

export interface GetHistoryDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
}

export function register(server: ServerInstance, deps: GetHistoryDeps): void {
  server.tool(
    'get_history',
    DESCRIPTION,
    {
      docName: z.string().describe('Document name to query history for'),
      branch: z.string().optional().describe('Branch name (default: current branch)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Maximum entries to return (default 50, max 200)'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Number of entries to skip for pagination (default 0)'),
      type: z.enum(['checkpoint', 'upstream', 'wip']).optional().describe('Filter by entry type'),
      author: z.string().optional().describe('Filter to entries by this author name or email'),
      excludeAuthor: z.string().optional().describe('Exclude entries by this author name or email'),
      cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
    },
    async (args: {
      docName: string;
      branch?: string;
      limit?: number;
      offset?: number;
      type?: string;
      author?: string;
      excludeAuthor?: string;
      cwd?: string;
    }) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);

      const normalized = normalizeDocName(args.docName);
      if (!normalized.ok) return textResult(normalized.error, true);

      const params = new URLSearchParams();
      params.set('docName', normalized.docName);
      if (args.branch) params.set('branch', args.branch);
      if (args.limit != null) params.set('limit', String(args.limit));
      if (args.offset != null) params.set('offset', String(args.offset));
      if (args.type) params.set('type', args.type);
      if (args.author) params.set('author', args.author);
      if (args.excludeAuthor) params.set('excludeAuthor', args.excludeAuthor);

      const result = await httpGet(url, `/api/history?${params.toString()}`);
      if (!result.ok) return textResult(`Error: ${result.error}`, true);

      const { ok: _ok, ...data } = result;
      const preview = await resolvePreviewUrlForTool(
        normalized.docName,
        {
          config: deps.config,
          resolveCwd: deps.resolveCwd,
        },
        cwd,
      );
      return textPlusStructured(JSON.stringify(data, null, 2), {
        ...data,
        previewUrl: preview?.url ?? null,
        ...(preview ? { previewUrlSource: preview.source } : {}),
      });
    },
  );
}
