import { z } from 'zod';
import { buildListResolver, type PreviewUrlDeps } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Find the most-linked pages in the knowledge graph.',
  'Returns hub pages ordered by inbound link count as JSON.',
  '',
  '**Parameters:**',
  '- `limit` (optional) — Maximum number of hubs to return (default 20)',
].join('\n');

interface HubsPayload {
  hubs?: Array<Record<string, unknown> & { docName?: string }>;
}

interface GetHubsDeps extends PreviewUrlDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
}

export function register(server: ServerInstance, deps: GetHubsDeps): void {
  server.registerTool(
    'get_hubs',
    {
      description: DESCRIPTION,
      inputSchema: {
        limit: z.number().int().positive().optional().describe('Maximum number of hubs to return'),
        cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
      },
    },
    async (args: { limit?: number; cwd?: string }) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const query = args.limit ? `?limit=${encodeURIComponent(String(args.limit))}` : '';
      const result = await httpGet(url, `/api/hubs${query}`);
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      const { ok: _ok, ...rest } = result;
      const data = rest as HubsPayload;
      const { resolve, ui } = await buildListResolver(deps, cwd);
      const hubs = (data.hubs ?? []).map((row) => {
        const docName = typeof row.docName === 'string' ? row.docName : null;
        const resolved = docName ? resolve(docName) : null;
        return {
          ...row,
          previewUrl: resolved?.url ?? null,
          ...(resolved ? { previewUrlSource: resolved.source } : {}),
        };
      });
      const structured = { ...data, hubs, ui, cwd };
      return textPlusStructured(JSON.stringify(structured, null, 2), structured);
    },
  );
}
