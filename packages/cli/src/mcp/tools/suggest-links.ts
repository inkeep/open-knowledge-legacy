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
  '[Requires: Hocuspocus server] Find missing link candidates for a target page.',
  'Returns JSON with structure: `{ target: { docName, title, aliases }, mentions: [{ source, excerpt, offset }], truncated }`.',
  'Each mention includes an `offset` you can pass to `edit_document` for precision patching.',
  'When `truncated` is true, the scan hit its time budget before reading every admitted document.',
  '',
  '**Parameters:**',
  '- `docName` — Target page docName, typically without extension (for example, "articles/project-alpha"). A trailing `.md` or `.mdx` is stripped automatically.',
].join('\n');

export function register(server: ServerInstance, serverUrl: ServerUrlOrResolver): void {
  server.tool(
    'suggest_links',
    DESCRIPTION,
    {
      docName: z.string().describe('Target page docName'),
    },
    async (args: { docName: string }) => {
      const url = await resolveServerUrl(serverUrl);
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const normalized = normalizeDocName(args.docName);
      if (!normalized.ok) return textResult(normalized.error, true);

      const result = await httpGet(
        url,
        `/api/suggest-links?docName=${encodeURIComponent(normalized.docName)}`,
      );

      if (!result.ok) return textResult(`Error: ${result.error}`, true);

      const { ok: _ok, ...data } = result;
      return textResult(JSON.stringify(data, null, 2));
    },
  );
}
