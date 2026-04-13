import { z } from 'zod';
import type { ServerInstance } from './shared.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, httpGet, textResult } from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Find the most-linked pages in the knowledge graph.',
  'Returns hub pages ordered by inbound link count as JSON.',
  '',
  '**Parameters:**',
  '- `limit` (optional) — Maximum number of hubs to return (default 20)',
].join('\n');

export function register(server: ServerInstance, serverUrl: string | undefined): void {
  server.tool(
    'get_hubs',
    DESCRIPTION,
    {
      limit: z.number().int().positive().optional().describe('Maximum number of hubs to return'),
    },
    async (args: { limit?: number }) => {
      if (!serverUrl) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const query = args.limit ? `?limit=${encodeURIComponent(String(args.limit))}` : '';
      const result = await httpGet(serverUrl, `/api/hubs${query}`);
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      const { ok: _ok, ...data } = result;
      return textResult(JSON.stringify(data, null, 2));
    },
  );
}
