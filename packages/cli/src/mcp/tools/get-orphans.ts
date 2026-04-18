import { ORPHAN_MODES, type OrphanMode } from '@inkeep/open-knowledge-core';
import { z } from 'zod';
import { buildListResolver, type PreviewUrlDeps } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  resolveProjectServerContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Find disconnected pages in the knowledge graph.',
  'Returns orphaned pages as JSON.',
  '',
  '**Parameters:**',
  '- `mode` (optional) — Orphan lens: `incoming`, `outgoing`, or `both` (default `both`)',
].join('\n');

interface OrphansPayload {
  orphans?: Array<Record<string, unknown> & { docName?: string }>;
}

export interface GetOrphansDeps extends PreviewUrlDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
}

export function register(server: ServerInstance, deps: GetOrphansDeps): void {
  server.tool(
    'get_orphans',
    DESCRIPTION,
    {
      mode: z
        .enum(ORPHAN_MODES)
        .optional()
        .describe('Filter which type of graph disconnection to surface'),
    },
    async (args: { mode?: OrphanMode }) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const query = args.mode ? `?mode=${encodeURIComponent(args.mode)}` : '';
      const result = await httpGet(url, `/api/orphans${query}`);
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      const { ok: _ok, ...rest } = result;
      const data = rest as OrphansPayload;
      const { resolve, ui } = await buildListResolver(deps, cwd);
      const orphans = (data.orphans ?? []).map((row) => {
        const docName = typeof row.docName === 'string' ? row.docName : null;
        const resolved = docName ? resolve(docName) : null;
        return {
          ...row,
          previewUrl: resolved?.url ?? null,
          ...(resolved ? { previewUrlSource: resolved.source } : {}),
        };
      });
      const structured = { ...data, orphans, ui };
      return textPlusStructured(JSON.stringify(structured, null, 2), structured);
    },
  );
}
