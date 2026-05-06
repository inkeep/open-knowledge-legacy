import { z } from 'zod';
import { type DirectoryMeta, enrichDirectoryRecursive } from '../../content/enrichment.ts';
import { resolveWithinRoot } from './path-safety.ts';
import { buildListResolver, type PreviewUrlDeps } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] List available documents from the Hocuspocus server.',
  'Returns document names, optionally filtered by directory. When `dir` is set,',
  'also surfaces folder-level metadata: `frontmatter_defaults` (merged folder',
  'defaults that new docs in this folder will inherit) and `templates_available`',
  '(menu of starter shapes for `write_document({ template })`). Pass `depth: N`',
  'to also enrich subfolders up to N levels deep — mirrors `find -maxdepth N`.',
  '',
  '**Parameters:**',
  '- `dir` (optional) — Filter to documents in this directory',
  '- `depth` (optional, default `1`) — Subfolder enrichment depth. `1` = this',
  "  folder only; `2` = direct children's folder metadata too; `Infinity` =",
  "  full subtree. Walk-up ancestors' templates always show regardless.",
].join('\n');

interface DocumentsPayload {
  documents?: Array<Record<string, unknown> & { docName?: string }>;
}

interface ListDocumentsDeps extends PreviewUrlDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
}

export function register(server: ServerInstance, deps: ListDocumentsDeps): void {
  server.tool(
    'list_documents',
    DESCRIPTION,
    {
      dir: z.string().optional().describe('Optional directory to filter documents'),
      depth: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          'Subfolder enrichment depth (find -maxdepth semantics). Default 1. Only meaningful when `dir` is also set.',
        ),
      cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
    },
    async (args: { dir?: string; depth?: number; cwd?: string }) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      let containedDir: string | null = null;
      if (args.dir !== undefined) {
        const contained = resolveWithinRoot(cwd, args.dir);
        if (!contained.ok) {
          return textResult(`Error: ${contained.reason}`, true);
        }
        containedDir = contained.rel;
      }
      const query = containedDir !== null ? `?dir=${encodeURIComponent(containedDir)}` : '';
      const result = await httpGet(url, `/api/documents${query}`);
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      const { ok: _ok, ...rest } = result;
      const data = rest as DocumentsPayload;
      const { resolve, ui } = await buildListResolver(deps, cwd);
      const documents = (data.documents ?? []).map((row) => {
        const docName = typeof row.docName === 'string' ? row.docName : null;
        const resolved = docName ? resolve(docName) : null;
        return {
          ...row,
          previewUrl: resolved?.url ?? null,
          ...(resolved ? { previewUrlSource: resolved.source } : {}),
        };
      });

      let folder: DirectoryMeta | undefined;
      if (containedDir !== null) {
        const depth = args.depth ?? 1;
        try {
          folder = await enrichDirectoryRecursive(containedDir, depth, {
            projectDir: cwd,
          });
        } catch {
          folder = undefined;
        }
      }

      const structured = {
        ...data,
        documents,
        ui,
        cwd,
        ...(folder ? { folder } : {}),
      };
      return textPlusStructured(JSON.stringify(structured, null, 2), structured);
    },
  );
}
