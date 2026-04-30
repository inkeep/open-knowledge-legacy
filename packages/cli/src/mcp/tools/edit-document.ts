/**
 * `edit_document` MCP tool — targeted find-and-replace on live document content.
 *
 * Sends a patch to Hocuspocus via POST /api/agent-patch, which finds the text
 * in the Y.Text and replaces it, propagating to all connected editors.
 */
import { z } from 'zod';
import { resolveContentDir, resolveLockDir } from '../../config/paths.ts';
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
  '[Requires: Hocuspocus server] Find-and-replace on a live document via the CRDT layer.',
  'The patch is applied through Hocuspocus and propagated to all connected editors in real-time.',
  'Use `offset` when you need to patch an exact occurrence; omit it to preserve first-match behavior.',
  '',
  '**Body-only.** Frontmatter-intersecting find/replace calls are rejected with HTTP 400. Frontmatter editing via MCP is currently unavailable — to change frontmatter, use `write_document` with `position: "replace"` and a payload that includes the new YAML block.',
  '',
  '**When rewriting prose, add `[[wiki-links]]` aggressively.** If the replacement mentions other documents or entities that should have their own page, link them as `[[Page Name]]`. Over-linking is the goal; underlinked documents lose their value in backlink-driven navigation.',
  '',
  '**Parameters:**',
  '- `docName` — Document name, typically without extension. A trailing `.md` or `.mdx` is stripped automatically.',
  '- `find` — Text to find (exact match)',
  '- `replace` — Replacement text',
  '- `offset` (optional) — Exact occurrence to patch, as a JavaScript string offset in the current markdown. If the document changed and the text no longer matches there, the server returns a stale-target error; re-run `suggest_links` to get fresh offsets.',
  '- `summary` — Optional one-line user-outcome description of this edit (≤80 chars). Appears as a bullet in the document timeline so readers can scan intent without opening every diff. Prefer outcome phrasing ("Fixed token-refresh race") over structural ("Changed 1 line"). Avoid including secrets or PII — summaries are persisted to git history.',
].join('\n');

interface EditDocumentDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
  identityRef?: { current: AgentIdentity };
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
      summary: summaryArgSchema,
      cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
    },
    async (args: {
      docName: string;
      find: string;
      replace: string;
      offset?: number;
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
      const result = await httpPost(url, '/api/agent-patch', {
        docName: normalized.docName,
        find: args.find,
        replace: args.replace,
        offset: args.offset,
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
      // Once-per-session attach hint — see write-document.ts for rationale.
      const systemSubscriberCount =
        typeof result.systemSubscriberCount === 'number' ? result.systemSubscriberCount : undefined;
      const noPreviewAnywhere = systemSubscriberCount === 0;
      const noPreviewOnThisDoc = subscriberCount === 0;

      const summaryResult =
        result.summary && typeof result.summary === 'object'
          ? (result.summary as { value: string; truncatedFrom?: number; hint?: string })
          : undefined;
      const summaryHint = typeof summaryResult?.hint === 'string' ? summaryResult.hint : undefined;

      const lines: string[] = ['Edit applied successfully.'];
      if (preview) lines.push(`Preview: ${preview.url}`);
      if (noPreviewAnywhere) {
        lines.push(
          preview
            ? `Open ${preview.url} in your preview browser.`
            : `No preview attached. Start the UI.`,
        );
      }
      if (summaryHint) lines.push(summaryHint);
      const text = lines.join('\n');

      if (!preview && !noPreviewAnywhere && !noPreviewOnThisDoc && !summaryResult) {
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
      if (summaryResult) {
        structured.summary = summaryResult;
      }
      return textPlusStructured(text, structured);
    },
  );
}
