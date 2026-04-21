/**
 * `write_document` MCP tool — write markdown to a document via the CRDT layer.
 *
 * Sends content to Hocuspocus via POST /api/agent-write-md, which applies it
 * through a DirectConnection and propagates to all connected editors in real-time.
 */
import { z } from 'zod';
import { resolveContentDir, resolveLockDir } from '../../config/paths.ts';
import type { Config } from '../../config/schema.ts';
import type { AgentIdentity } from '../agent-identity.ts';
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
  '[Requires: Hocuspocus server] Write markdown content to a document via the CRDT layer.',
  'Content is applied through Hocuspocus and propagated to all connected editors in real-time.',
  '',
  '**Link liberally.** Every noun-phrase that names another document in this knowledge base should be a `[[wiki-link]]`, not plain prose. Backlinks are the primary navigation surface — underlinked documents become islands. Redlinks (links to pages that don\'t exist yet) are fine; they signal "this should exist." Prefer `[[Page Name]]` over Markdown `[text](./page.md)` — only wiki-links participate in the backlinks index.',
  '',
  '**Parameters:**',
  '- `docName` — Document name, typically without extension (e.g., "my-doc" or "notes/meeting"). A trailing `.md` or `.mdx` is stripped automatically. New documents are created as `.md` by default; to create a `.mdx` file, first place it on disk, then use this tool for edits.',
  '- `markdown` — Markdown content to write',
  '- `position` — Where to insert: "append", "prepend", or "replace"',
].join('\n');

interface WriteDocumentDeps {
  serverUrl: ServerUrlOrResolver;
  config: Config;
  resolveCwd: (explicit?: string) => Promise<string>;
  identityRef?: { current: AgentIdentity };
}

export function register(server: ServerInstance, deps: WriteDocumentDeps): void {
  server.tool(
    'write_document',
    DESCRIPTION,
    {
      docName: z.string().describe('Document name to write to'),
      markdown: z.string().describe('Markdown content to write'),
      position: z.enum(['append', 'prepend', 'replace']).describe('Where to insert the content'),
    },
    async (args: { docName: string; markdown: string; position: string }) => {
      const url = await resolveServerUrl(deps.serverUrl);
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const normalized = normalizeDocName(args.docName);
      if (!normalized.ok) return textResult(normalized.error, true);
      const identity = deps.identityRef?.current;
      const result = await httpPost(url, '/api/agent-write-md', {
        docName: normalized.docName,
        markdown: args.markdown,
        position: args.position,
        ...(identity
          ? {
              agentId: identity.connectionId,
              agentName: identity.displayName,
              clientName: identity.clientInfo?.name,
              colorSeed: identity.colorSeed,
            }
          : {}),
      });
      if (!result.ok) return textResult(`Error: ${result.error}`, true);

      const cwd = await deps.resolveCwd();
      const lockDir = resolveLockDir(resolveContentDir(deps.config, cwd));
      const preview = resolvePreviewUrl(normalized.docName, { config: deps.config, lockDir });
      const subscriberCount =
        typeof result.subscriberCount === 'number' ? result.subscriberCount : undefined;
      const noPreviewAttached = subscriberCount === 0;

      const hints = Array.isArray(result.hints) ? result.hints : undefined;

      const lines: string[] = [`Written successfully (${args.position}).`];
      if (preview) lines.push(`Preview: ${preview.url}`);
      if (noPreviewAttached) {
        lines.push(
          preview
            ? `Warning: no preview is currently attached to "${normalized.docName}". Open ${preview.url} to watch future edits live.`
            : `Warning: no preview is currently attached to "${normalized.docName}".`,
        );
      }
      if (hints) {
        for (const hint of hints) {
          if (hint.message) lines.push(hint.message);
        }
      }
      const text = lines.join('\n');

      if (!preview && !noPreviewAttached && !hints) {
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
      if (hints) {
        structured.hints = hints;
      }
      return textPlusStructured(text, structured);
    },
  );
}
