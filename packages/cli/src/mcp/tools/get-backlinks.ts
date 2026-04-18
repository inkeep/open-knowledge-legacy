import { z } from 'zod';
import { buildListResolver, type PreviewUrlDeps } from './preview-url.ts';
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
  '[Requires: Hocuspocus server] Find all pages that link to a given page.',
  'Returns source page names, resolved titles, and context snippets as JSON.',
  '',
  '**Parameters:**',
  '- `docName` — Target page docName, typically without extension (for example, "articles/project-alpha"). A trailing `.md` or `.mdx` is stripped automatically.',
].join('\n');

interface BacklinksPayload {
  docName?: string;
  backlinks?: Array<Record<string, unknown> & { source?: string }>;
}

export interface GetBacklinksDeps extends PreviewUrlDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
}

export function register(server: ServerInstance, deps: GetBacklinksDeps): void {
  server.tool(
    'get_backlinks',
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
        `/api/backlinks?docName=${encodeURIComponent(normalized.docName)}`,
      );
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      const { ok: _ok, ...rest } = result;
      const data = rest as BacklinksPayload;
      const { resolve, ui } = await buildListResolver(deps, cwd);
      const backlinks = (data.backlinks ?? []).map((row) => {
        const source = typeof row.source === 'string' ? row.source : null;
        const resolved = source ? resolve(source) : null;
        return {
          ...row,
          previewUrl: resolved?.url ?? null,
          ...(resolved ? { previewUrlSource: resolved.source } : {}),
        };
      });
      const structured = { ...data, backlinks, ui };
      return textPlusStructured(JSON.stringify(structured, null, 2), structured);
    },
  );
}
