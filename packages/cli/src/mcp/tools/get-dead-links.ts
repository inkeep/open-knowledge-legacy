import { z } from 'zod';
import { buildListResolver, type PreviewUrlDeps } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  normalizeDocName,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Find missing internal page targets across the corpus.',
  'Returns grouped dead links keyed by missing target with source-doc rows as JSON.',
  '',
  '**Parameters:**',
  '- `sourceDocNames` (optional) — Referring source docs to narrow the audit with OR semantics',
].join('\n');

interface DeadLinksPayload {
  deadLinks?: Array<
    Record<string, unknown> & {
      target?: string;
      sources?: Array<Record<string, unknown> & { source?: string }>;
    }
  >;
}

export interface GetDeadLinksDeps extends PreviewUrlDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
}

export function register(server: ServerInstance, deps: GetDeadLinksDeps): void {
  server.tool(
    'get_dead_links',
    DESCRIPTION,
    {
      sourceDocNames: z
        .array(z.string())
        .optional()
        .describe('Referring source docs to narrow the audit with OR semantics'),
      cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
    },
    async (args: { sourceDocNames?: string[]; cwd?: string }) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);

      const params = new URLSearchParams();
      for (const sourceDocName of args.sourceDocNames ?? []) {
        const normalized = normalizeDocName(sourceDocName);
        if (!normalized.ok) return textResult(normalized.error, true);
        params.append('sourceDocName', normalized.docName);
      }

      const query = params.toString();
      const result = await httpGet(url, `/api/dead-links${query ? `?${query}` : ''}`);
      if (!result.ok) return textResult(`Error: ${result.error}`, true);

      const { ok: _ok, ...rest } = result;
      const data = rest as DeadLinksPayload;
      const { resolve, ui } = await buildListResolver(deps, cwd);
      // Target previewUrls point at redlinks (the UI renders unresolved docs
      // as a "page doesn't exist yet" state); sources previewUrls point at
      // the live source doc that contains the broken link.
      const deadLinks = (data.deadLinks ?? []).map((row) => {
        const target = typeof row.target === 'string' ? row.target : null;
        const resolvedTarget = target ? resolve(target) : null;
        const sources = (row.sources ?? []).map((sourceRow) => {
          const source = typeof sourceRow.source === 'string' ? sourceRow.source : null;
          const resolvedSource = source ? resolve(source) : null;
          return {
            ...sourceRow,
            previewUrl: resolvedSource?.url ?? null,
            ...(resolvedSource ? { previewUrlSource: resolvedSource.source } : {}),
          };
        });
        return {
          ...row,
          sources,
          previewUrl: resolvedTarget?.url ?? null,
          ...(resolvedTarget ? { previewUrlSource: resolvedTarget.source } : {}),
        };
      });
      const structured = { ...data, deadLinks, ui, cwd };
      return textPlusStructured(JSON.stringify(structured, null, 2), structured);
    },
  );
}
