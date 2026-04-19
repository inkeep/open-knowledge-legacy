import { z } from 'zod';
import { buildListResolver, type PreviewUrlDeps } from './preview-url.ts';
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
  '[Requires: Hocuspocus server] Find all pages that a given page links to.',
  'Returns forward links as JSON.',
  '',
  '**Parameters:**',
  '- `docName` — Source page docName, typically without extension. A trailing `.md` or `.mdx` is stripped automatically.',
].join('\n');

interface ForwardLinksPayload {
  docName?: string;
  forwardLinks?: Array<Record<string, unknown> & { kind?: string; docName?: string }>;
}

export interface GetForwardLinksDeps extends PreviewUrlDeps {
  serverUrl: ServerUrlOrResolver;
}

export function register(server: ServerInstance, deps: GetForwardLinksDeps): void {
  server.tool(
    'get_forward_links',
    DESCRIPTION,
    {
      docName: z.string().describe('Source page docName'),
    },
    async (args: { docName: string }) => {
      const url = await resolveServerUrl(deps.serverUrl);
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const normalized = normalizeDocName(args.docName);
      if (!normalized.ok) return textResult(normalized.error, true);
      const result = await httpGet(
        url,
        `/api/forward-links?docName=${encodeURIComponent(normalized.docName)}`,
      );
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      const { ok: _ok, ...rest } = result;
      const data = rest as ForwardLinksPayload;
      const { resolve, ui } = await buildListResolver(deps);
      // 'doc' kind entries have a resolvable docName; 'external' kind entries
      // point at arbitrary URLs and always emit previewUrl: null.
      const forwardLinks = (data.forwardLinks ?? []).map((row) => {
        const docName = row.kind === 'doc' && typeof row.docName === 'string' ? row.docName : null;
        const resolved = docName ? resolve(docName) : null;
        return {
          ...row,
          previewUrl: resolved?.url ?? null,
          ...(resolved ? { previewUrlSource: resolved.source } : {}),
        };
      });
      const structured = { ...data, forwardLinks, ui };
      return textPlusStructured(JSON.stringify(structured, null, 2), structured);
    },
  );
}
