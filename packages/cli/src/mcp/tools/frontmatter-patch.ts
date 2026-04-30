/**
 * `frontmatter_patch` MCP tool — PARKED.
 *
 * The `/api/frontmatter-patch` HTTP transport was removed when the property
 * panel migrated to direct CRDT writes via `bindFrontmatterDoc`. This file
 * is preserved to make the future re-enable diff small: the next change
 * should swap `httpPost` for a server-side CRDT path (open a
 * `DirectConnection`, call `setFrontmatterProperty` per key inside
 * `dc.document.transact(fn, session.formOrigin)`, similar to
 * `applyAgentMarkdownWrite` for body content) and re-add the `register(...)`
 * call in `index.ts`.
 *
 * The registration in `index.ts` is commented out, so this tool is not
 * advertised over MCP today.
 */
import { FRONTMATTER_TYPES, FrontmatterValueSchema } from '@inkeep/open-knowledge-core';
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
  '[Requires: Hocuspocus server] Set, create, or delete frontmatter properties via JSON Merge Patch (RFC 7396).',
  '',
  'Field-level CRDT merge: concurrent patches to different keys (human form + this tool, or two agents) merge cleanly. Same-key concurrent writes resolve last-writer-wins per key.',
  '',
  '**Use this tool — not `edit_document` — for any frontmatter change.** `edit_document` (agent-patch) targets body content; FM-intersecting `edit_document` calls will start returning HTTP 400 once the deprecation window closes.',
  '',
  '**Parameters:**',
  '- `docName` — Document name. A trailing `.md` or `.mdx` is stripped automatically.',
  '- `patch` — Object whose keys are property names. Each value is the new value (string, number, boolean, or array of strings) to **set or create** the key, or `null` to **delete** the key. Keys not present in `patch` are unchanged.',
  '- `types` (optional) — **Currently ignored.** Shape-validated for forward-compat but not persisted server-side; type is inferred from value shape on read. Reserved for a future per-key widget-type override (`text | number | boolean | date | list`) once persistence ships.',
  '- `summary` — Optional one-line user-outcome description (≤80 chars). Prefer outcome phrasing ("Marked spec as approved") over structural ("Set status field"). Avoid secrets / PII — summaries persist to git history.',
  '',
  '**Atomicity:** any value failing schema validation rejects the WHOLE patch (HTTP 400 with per-key error report). Either every change commits or none do.',
].join('\n');

interface FrontmatterPatchDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
  identityRef?: { current: AgentIdentity };
}

// Compose against the canonical FrontmatterValueSchema in core so the MCP
// tool stays aligned with server-side validation. Adding `null` here adds
// the delete sentinel for JSON Merge Patch (RFC 7396) — a `null` value
// deletes the key.
const PatchValueSchema = z
  .union([FrontmatterValueSchema, z.null()])
  .describe('Property value (string|number|boolean|string[]) — `null` deletes the key');

export function register(server: ServerInstance, deps: FrontmatterPatchDeps): void {
  server.tool(
    'frontmatter_patch',
    DESCRIPTION,
    {
      docName: z.string().describe('Document name'),
      patch: z
        .record(z.string(), PatchValueSchema)
        .describe('JSON Merge Patch — `{key: value}` sets, `{key: null}` deletes'),
      types: z.record(z.string(), z.enum(FRONTMATTER_TYPES)).optional().describe(
        // Currently shape-validated server-side but NOT persisted — the
        // override is silently dropped on the next session. Don't waste
        // tokens reasoning about whether to send this. Server-side
        // persistence is tracked as a follow-up.
        'Currently ignored (shape-validated for forward-compat but not persisted). Type is inferred from value shape on read. Will become a real per-key widget-type override (text|number|boolean|date|list) once persistence lands.',
      ),
      summary: summaryArgSchema,
      cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
    },
    async (args: {
      docName: string;
      patch: Record<string, string | number | boolean | string[] | null>;
      types?: Record<string, 'text' | 'number' | 'boolean' | 'date' | 'list'>;
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

      const result = await httpPost(url, '/api/frontmatter-patch', {
        docName: normalized.docName,
        patch: args.patch,
        ...(args.types ? { types: args.types } : {}),
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
      if (!result.ok) {
        const errorText =
          typeof result.error === 'string' ? result.error : 'Unknown frontmatter-patch error';
        const fieldErrors =
          result.fieldErrors && typeof result.fieldErrors === 'object'
            ? (result.fieldErrors as Record<string, string>)
            : undefined;
        if (fieldErrors) {
          const lines = Object.entries(fieldErrors).map(([key, msg]) => `  ${key}: ${msg}`);
          return textResult(`Error: ${errorText}\n${lines.join('\n')}`, true);
        }
        return textResult(`Error: ${errorText}`, true);
      }

      const lockDir = resolveLockDir(resolveContentDir(config, cwd));
      const preview = resolvePreviewUrl(normalized.docName, { config, lockDir });
      const subscriberCount =
        typeof result.subscriberCount === 'number' ? result.subscriberCount : undefined;
      const systemSubscriberCount =
        typeof result.systemSubscriberCount === 'number' ? result.systemSubscriberCount : undefined;
      const noPreviewAnywhere = systemSubscriberCount === 0;
      const noPreviewOnThisDoc = subscriberCount === 0;

      const summaryResult =
        result.summary && typeof result.summary === 'object'
          ? (result.summary as { value: string; truncatedFrom?: number; hint?: string })
          : undefined;
      const summaryHint = typeof summaryResult?.hint === 'string' ? summaryResult.hint : undefined;

      const setKeys: string[] = [];
      const deleteKeys: string[] = [];
      for (const [key, value] of Object.entries(args.patch)) {
        if (value === null) deleteKeys.push(key);
        else setKeys.push(key);
      }
      const opSummary = [
        setKeys.length ? `${setKeys.length} set` : '',
        deleteKeys.length ? `${deleteKeys.length} deleted` : '',
      ]
        .filter(Boolean)
        .join(', ');

      const lines: string[] = [
        `Frontmatter patched (${opSummary || `${Object.keys(args.patch).length} key(s)`}).`,
      ];
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
