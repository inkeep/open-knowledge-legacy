/**
 * `write_document` MCP tool — write markdown to a document via the CRDT layer.
 *
 * Sends content to Hocuspocus via POST /api/agent-write-md, which applies it
 * through a DirectConnection and propagates to all connected editors in real-time.
 */

import { resolveContentDir, resolveLockDir } from '@inkeep/open-knowledge-server';
import { z } from 'zod';
import type { AgentIdentity } from '../agent-identity.ts';
import { resolvePreviewUrl } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpPost,
  normalizeDocName,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  summaryArgSchema,
  textPlusStructured,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Write markdown content to a document via the CRDT layer.',
  'Content is applied through Hocuspocus and propagated to all connected editors in real-time.',
  '',
  '**Link liberally.** Every noun-phrase that names another document in this knowledge base should be a `[[wiki-link]]`, not plain prose. Backlinks are the primary navigation surface — underlinked documents become islands. Redlinks (links to pages that don\'t exist yet) are fine; they signal "this should exist." Prefer `[[Page Name]]` over Markdown `[text](./page.md)` — only wiki-links participate in the backlinks index.',
  '',
  '**Parameters:**',
  '- `docName` — Document name, typically without extension (e.g., "my-doc" or "notes/meeting"). A trailing `.md` or `.mdx` is stripped automatically. New documents are created as `.md` by default; to create a `.mdx` file, first place it on disk, then use this tool for edits.',
  '- `markdown` — Markdown content to write',
  '- `position` — Where to insert: "append", "prepend", or "replace"',
  '- `summary` — Optional one-line user-outcome description of this edit (≤80 chars). Appears as a bullet in the document timeline so readers can scan intent without opening every diff. Prefer outcome phrasing ("Fixed token-refresh race") over structural ("Added 3 lines"). Avoid including secrets or PII — summaries are persisted to git history.',
].join('\n');

interface WriteDocumentDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
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
      summary: summaryArgSchema,
      cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
    },
    async (args: {
      docName: string;
      markdown: string;
      position: string;
      summary?: string;
      cwd?: string;
    }) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, config, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const normalized = normalizeDocName(args.docName);
      if (!normalized.ok) return textResult(normalized.error, true);
      const identity = deps.identityRef?.current;
      const result = await httpPost(url, '/api/agent-write-md', {
        docName: normalized.docName,
        markdown: args.markdown,
        position: args.position,
        ...(args.summary !== undefined ? { summary: args.summary } : {}),
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

      const lockDir = resolveLockDir(resolveContentDir(config, cwd));
      const preview = resolvePreviewUrl(normalized.docName, { config, lockDir });
      const subscriberCount =
        typeof result.subscriberCount === 'number' ? result.subscriberCount : undefined;
      // Once-per-session attach hint: fires only when no editor is attached
      // to `__system__` at all — not when the current doc happens to have
      // zero subscribers (which is normal for an agent's second+ doc before
      // server-push carries the open tab there).
      const systemSubscriberCount =
        typeof result.systemSubscriberCount === 'number' ? result.systemSubscriberCount : undefined;
      const noPreviewAnywhere = systemSubscriberCount === 0;
      const noPreviewOnThisDoc = subscriberCount === 0;

      const hints = Array.isArray(result.hints) ? result.hints : undefined;

      const summaryResult =
        result.summary && typeof result.summary === 'object'
          ? (result.summary as { value: string; truncatedFrom?: number; hint?: string })
          : undefined;
      const summaryHint = typeof summaryResult?.hint === 'string' ? summaryResult.hint : undefined;

      const lines: string[] = [`Written successfully (${args.position}).`];
      if (preview) lines.push(`Preview: ${preview.url}`);
      if (noPreviewAnywhere) {
        lines.push(
          preview
            ? `Open ${preview.url} in your preview browser.`
            : `No preview attached. Start the UI.`,
        );
      }
      if (summaryHint) lines.push(summaryHint);
      if (hints) {
        for (const hint of hints) {
          if (hint.message) lines.push(hint.message);
        }
      }
      const text = lines.join('\n');

      if (!preview && !noPreviewAnywhere && !noPreviewOnThisDoc && !hints && !summaryResult) {
        return textResult(text);
      }

      const structured: Record<string, unknown> = {};
      if (preview) {
        structured.previewUrl = preview.url;
        structured.previewUrlSource = preview.source;
      }
      if (noPreviewAnywhere) {
        structured.warning = {
          message: `Open the previewUrl in your preview browser.`,
          action: 'attach-preview-once' as const,
          previewUrl: preview?.url ?? null,
        };
      }
      if (hints) {
        structured.hints = hints;
      }
      if (summaryResult) {
        structured.summary = summaryResult;
      }
      return textPlusStructured(text, structured);
    },
  );
}
