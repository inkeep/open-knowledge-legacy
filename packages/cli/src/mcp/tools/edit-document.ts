/**
 * `edit_document` MCP tool — targeted find-and-replace on live document content.
 *
 * Sends a patch to Hocuspocus via POST /api/agent-patch, which finds the text
 * in the Y.Text and replaces it, propagating to all connected editors.
 */
import { z } from 'zod';
import { resolveContentDir, resolveLockDir } from '../../config/paths.ts';
import type { Config } from '../../config/schema.ts';
import { resolvePreviewUrl } from './preview-url.ts';
import type { ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpPost,
  normalizeDocName,
  resolveServerUrl,
  textPlusStructured,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  '**IMPORTANT: Before calling this tool, you MUST first call `get_preview_url` and navigate to the returned URL in your preview browser. If `get_preview_url` returns null, start the server first (`open-knowledge start` or `preview_start`), then call `get_preview_url` again. Do NOT call this tool without the preview open. NEVER manually construct the URL.**',
  '',
  '[Requires: Hocuspocus server] Find-and-replace on a live document via the CRDT layer.',
  'The patch is applied through Hocuspocus and propagated to all connected editors in real-time.',
  'Use `offset` when you need to patch an exact occurrence; omit it to preserve first-match behavior.',
  '',
  '**When rewriting prose, add `[[wiki-links]]` aggressively.** If the replacement mentions other documents or entities that should have their own page, link them as `[[Page Name]]`. Over-linking is the goal; underlinked documents lose their value in backlink-driven navigation.',
  '',
  '**Parameters:**',
  '- `docName` — Document name, typically without extension. A trailing `.md` or `.mdx` is stripped automatically.',
  '- `find` — Text to find (exact match)',
  '- `replace` — Replacement text',
  '- `offset` (optional) — Exact occurrence to patch, as a JavaScript string offset in the current markdown. If the document changed and the text no longer matches there, the server returns a stale-target error; re-run `suggest_links` to get fresh offsets.',
].join('\n');

export interface EditDocumentDeps {
  serverUrl: ServerUrlOrResolver;
  config: Config;
  resolveCwd: (explicit?: string) => Promise<string>;
}

export function register(server: ServerInstance, deps: EditDocumentDeps): void {
  server.tool(
    'edit_document',
    DESCRIPTION,
    {
      docName: z.string().describe('Document name to edit'),
      find: z.string().describe('Text to find (exact match)'),
      replace: z.string().describe('Replacement text'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Exact occurrence to patch, as a JavaScript string offset in the current markdown',
        ),
    },
    async (args: { docName: string; find: string; replace: string; offset?: number }) => {
      const url = await resolveServerUrl(deps.serverUrl);
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const normalized = normalizeDocName(args.docName);
      if (!normalized.ok) return textResult(normalized.error, true);
      const result = await httpPost(url, '/api/agent-patch', {
        docName: normalized.docName,
        find: args.find,
        replace: args.replace,
        offset: args.offset,
      });
      if (!result.ok) return textResult(`Error: ${result.error}`, true);

      const cwd = await deps.resolveCwd();
      const lockDir = resolveLockDir(resolveContentDir(deps.config, cwd));
      const preview = resolvePreviewUrl(normalized.docName, { config: deps.config, lockDir });
      const subscriberCount =
        typeof result.subscriberCount === 'number' ? result.subscriberCount : undefined;
      const noPreviewAttached = subscriberCount === 0;

      const lines: string[] = ['Edit applied successfully.'];
      if (preview) lines.push(`Preview: ${preview.url}`);
      if (noPreviewAttached) {
        lines.push(
          preview
            ? `Warning: no preview is currently attached to "${normalized.docName}". Open ${preview.url} to watch future edits live.`
            : `Warning: no preview is currently attached to "${normalized.docName}".`,
        );
      }
      const text = lines.join('\n');

      if (!preview && !noPreviewAttached) {
        return textResult(text);
      }

      const structured: Record<string, unknown> = {};
      if (preview) {
        structured.previewUrl = preview.url;
        structured.previewUrlSource = preview.source;
      }
      if (noPreviewAttached) {
        structured.warning = {
          message: `No preview attached to ${normalized.docName}.`,
          previewUrl: preview?.url ?? null,
        };
      }
      return textPlusStructured(text, structured);
    },
  );
}
