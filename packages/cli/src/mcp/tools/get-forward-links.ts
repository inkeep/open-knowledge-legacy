import { z } from 'zod';
import type { ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  normalizeDocName,
  resolveServerUrl,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Find all pages that a given page links to.',
  'Returns forward links as JSON.',
  '',
  '**Parameters:**',
  '- `docName` — Source page docName, typically without extension. A trailing `.md` or `.mdx` is stripped automatically.',
].join('\n');

export function register(server: ServerInstance, serverUrl: ServerUrlOrResolver): void {
  server.tool(
    'get_forward_links',
    DESCRIPTION,
    {
      docName: z.string().describe('Source page docName'),
    },
    async (args: { docName: string }) => {
      const url = await resolveServerUrl(serverUrl);
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const normalized = normalizeDocName(args.docName);
      if (!normalized.ok) return textResult(normalized.error, true);
      const result = await httpGet(
        url,
        `/api/forward-links?docName=${encodeURIComponent(normalized.docName)}`,
      );
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      const { ok: _ok, ...data } = result;
      return textResult(JSON.stringify(data, null, 2));
    },
  );
}
