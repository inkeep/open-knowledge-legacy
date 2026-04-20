import { z } from 'zod';
import type { Config } from '../../config/schema.ts';
import { resolvePreviewUrlForTool } from './preview-url.ts';
import type { ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  normalizeDocName,
  resolveServerUrl,
  textPlusStructured,
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

export interface SuggestLinksDeps {
  serverUrl: ServerUrlOrResolver;
  config: Config;
  resolveCwd: (explicit?: string) => Promise<string>;
}

export function register(server: ServerInstance, deps: SuggestLinksDeps): void {
  server.tool(
    'suggest_links',
    DESCRIPTION,
    {
      docName: z.string().describe('Target page docName'),
    },
    async (args: { docName: string }) => {
      const url = await resolveServerUrl(deps.serverUrl);
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const normalized = normalizeDocName(args.docName);
      if (!normalized.ok) return textResult(normalized.error, true);

      const result = await httpGet(
        url,
        `/api/suggest-links?docName=${encodeURIComponent(normalized.docName)}`,
      );

      if (!result.ok) return textResult(`Error: ${result.error}`, true);

      const { ok: _ok, ...data } = result;
      const preview = await resolvePreviewUrlForTool(normalized.docName, {
        config: deps.config,
        resolveCwd: deps.resolveCwd,
      });
      return textPlusStructured(JSON.stringify(data, null, 2), {
        ...data,
        previewUrl: preview?.url ?? null,
        ...(preview ? { previewUrlSource: preview.source } : {}),
      });
    },
  );
}
