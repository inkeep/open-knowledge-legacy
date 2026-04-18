import { z } from 'zod';
import { resolvePreviewUrlForTool } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  normalizeDocName,
  resolveProjectServerContext,
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
  config: ConfigOrResolver;
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
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const normalized = normalizeDocName(args.docName);
      if (!normalized.ok) return textResult(normalized.error, true);

      const result = await httpGet(
        url,
        `/api/suggest-links?docName=${encodeURIComponent(normalized.docName)}`,
      );

      if (!result.ok) return textResult(`Error: ${result.error}`, true);

      const { ok: _ok, ...data } = result;
      const preview = await resolvePreviewUrlForTool(
        normalized.docName,
        {
          config: deps.config,
          resolveCwd: deps.resolveCwd,
        },
        cwd,
      );
      return textPlusStructured(JSON.stringify(data, null, 2), {
        ...data,
        previewUrl: preview?.url ?? null,
        ...(preview ? { previewUrlSource: preview.source } : {}),
      });
    },
  );
}
