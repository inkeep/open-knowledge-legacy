import { z } from 'zod';
import type { ServerInstance } from './shared.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, httpGet, normalizeDocName, textResult } from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Find missing internal page targets across the corpus.',
  'Returns grouped dead links keyed by missing target with source-doc rows as JSON.',
  '',
  '**Parameters:**',
  '- `sourceDocNames` (optional) — Referring source docs to narrow the audit with OR semantics',
].join('\n');

export function register(server: ServerInstance, serverUrl: string | undefined): void {
  server.tool(
    'find_dead_links',
    DESCRIPTION,
    {
      sourceDocNames: z
        .array(z.string())
        .optional()
        .describe('Referring source docs to narrow the audit with OR semantics'),
    },
    async (args: { sourceDocNames?: string[] }) => {
      if (!serverUrl) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);

      const params = new URLSearchParams();
      for (const sourceDocName of args.sourceDocNames ?? []) {
        const normalized = normalizeDocName(sourceDocName);
        if (!normalized.ok) return textResult(normalized.error, true);
        params.append('sourceDocName', normalized.docName);
      }

      const query = params.toString();
      const result = await httpGet(serverUrl, `/api/dead-links${query ? `?${query}` : ''}`);
      if (!result.ok) return textResult(`Error: ${result.error}`, true);

      const { ok: _ok, ...data } = result;
      return textResult(JSON.stringify(data, null, 2));
    },
  );
}
