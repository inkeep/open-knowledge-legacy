import { z } from 'zod';
import { buildListResolver, type PreviewUrlDeps } from './preview-url.ts';
import type { ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  resolveServerUrl,
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
}

export function register(server: ServerInstance, deps: GetHubsDeps): void {
  server.tool(
    'get_hubs',
    DESCRIPTION,
    {
      limit: z.number().int().positive().optional().describe('Maximum number of hubs to return'),
    },
    async (args: { limit?: number }) => {
      const url = await resolveServerUrl(deps.serverUrl);
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const query = args.limit ? `?limit=${encodeURIComponent(String(args.limit))}` : '';
      const result = await httpGet(url, `/api/hubs${query}`);
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      const { ok: _ok, ...rest } = result;
      const data = rest as HubsPayload;
      const { resolve, ui } = await buildListResolver(deps);
      const hubs = (data.hubs ?? []).map((row) => {
        const docName = typeof row.docName === 'string' ? row.docName : null;
        const resolved = docName ? resolve(docName) : null;
        return {
          ...row,
          previewUrl: resolved?.url ?? null,
          ...(resolved ? { previewUrlSource: resolved.source } : {}),
        };
      });
      const structured = { ...data, hubs, ui };
      return textPlusStructured(JSON.stringify(structured, null, 2), structured);
    },
  );
}
