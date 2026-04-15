import { ORPHAN_MODES, type OrphanMode } from '@inkeep/open-knowledge-core';
import { z } from 'zod';
import type { ServerInstance } from './shared.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, httpGet, textResult } from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Find disconnected pages in the knowledge graph.',
  'Returns orphaned pages as JSON.',
  '',
  '**Parameters:**',
  '- `mode` (optional) — Orphan lens: `incoming`, `outgoing`, or `both` (default `both`)',
].join('\n');

export function register(server: ServerInstance, serverUrl: string | undefined): void {
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
      if (!serverUrl) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const query = args.mode ? `?mode=${encodeURIComponent(args.mode)}` : '';
      const result = await httpGet(serverUrl, `/api/orphans${query}`);
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      const { ok: _ok, ...data } = result;
      return textResult(JSON.stringify(data, null, 2));
    },
  );
}
