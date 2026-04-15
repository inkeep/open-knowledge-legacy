import { z } from 'zod';
import type { ServerInstance } from './shared.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, httpGet, textResult } from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Find missing link candidates for a target page.',
  'Returns unlinked mentions from other admitted documents as JSON so an agent can review and patch specific occurrences.',
  '',
  '**Parameters:**',
  '- `docName` — Target page docName (for example, "articles/project-alpha")',
].join('\n');

export function register(server: ServerInstance, serverUrl: string | undefined): void {
  server.tool(
    'suggest_links',
    DESCRIPTION,
    {
      docName: z.string().describe('Target page docName'),
    },
    async (args: { docName: string }) => {
      if (!serverUrl) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);

      const result = await httpGet(
        serverUrl,
        `/api/suggest-links?docName=${encodeURIComponent(args.docName)}`,
      );

      if (!result.ok) return textResult(`Error: ${result.error}`, true);

      return textResult(JSON.stringify(result, null, 2));
    },
  );
}
