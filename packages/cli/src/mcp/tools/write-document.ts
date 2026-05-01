/**
 * `write_document` MCP tool — write markdown to a document via the CRDT layer.
 *
 * Sends content to Hocuspocus via POST /api/agent-write-md, which applies it
 * through a DirectConnection and propagates to all connected editors in real-time.
 *
 * **Template support (FR5).** When `template` is provided, the tool resolves
 * the name against `templates_available` for the target doc's parent folder
 * (leaf → root walk-up; closest-wins on collision). Templates flagged
 * `scope: "descendant"` for the target folder are rejected — they're scoped
 * to that subfolder, not the parent. The template's body becomes the starting
 * markdown; the cascade merge happens naturally at read time via `enrichPath`.
 */
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { z } from 'zod';
import { resolveContentDir, resolveLockDir } from '../../config/paths.ts';
import { parentFolderOf } from '../../content/nested-folder-rules.ts';
import { resolveTemplatesAvailable } from '../../content/templates-resolver.ts';
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
  '**Frontmatter.** The markdown payload may include a YAML frontmatter block (`---`-fenced). To change frontmatter, call this tool with `position: "replace"` and a payload that includes the new YAML block — per-property MCP editing is currently unavailable. `edit_document` rejects frontmatter-intersecting find/replace calls.',
  '',
  '**Link liberally.** Every noun-phrase that names another document in this knowledge base should be a `[[wiki-link]]`, not plain prose. Backlinks are the primary navigation surface — underlinked documents become islands. Redlinks (links to pages that don\'t exist yet) are fine; they signal "this should exist." Prefer `[[Page Name]]` over Markdown `[text](./page.md)` — only wiki-links participate in the backlinks index.',
  '',
  "**Templates (FR5).** When creating a new doc, pass `template: \"<name>\"` to instantiate from a folder-scoped template. The name resolves against `templates_available` for the doc's parent folder (leaf → root walk-up; check `list_documents({ dir, depth: 1 })` to see the menu). The template's body + frontmatter become the doc's starting content; folder cascade merges naturally at read time. Templates scoped to a descendant subfolder are rejected for parent-folder targets. When `template` is set, `markdown` is optional — omit it to use the template body unchanged.",
  '',
  '**Parameters:**',
  '- `docName` — Document name, typically without extension (e.g., "my-doc" or "notes/meeting"). A trailing `.md` or `.mdx` is stripped automatically. New documents are created as `.md` by default; to create a `.mdx` file, first place it on disk, then use this tool for edits.',
  '- `markdown` — Markdown content to write. Optional when `template` is set (then template body is used).',
  "- `template` (optional) — Template name resolved against the parent folder's `templates_available`. When set without `markdown`, the template body becomes the doc.",
  '- `position` — Where to insert: "append", "prepend", or "replace". When `template` is set, `position` is forced to "replace".',
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
      markdown: z
        .string()
        .optional()
        .describe(
          'Markdown content to write. Optional when `template` is set — the template body is used.',
        ),
      template: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Template name resolved against parent folder's templates_available (leaf → root walk-up; closest-wins on collision). See list_documents({ dir, depth: 1 }) to inspect the menu.",
        ),
      position: z.enum(['append', 'prepend', 'replace']).describe('Where to insert the content'),
      summary: summaryArgSchema,
      cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
    },
    async (args: {
      docName: string;
      markdown?: string;
      template?: string;
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

      // FR5: resolve template — read body from disk + force replace.
      let effectiveMarkdown = args.markdown ?? '';
      let effectivePosition = args.position;
      if (args.template !== undefined) {
        const parentFolder = parentFolderOf(normalized.docName);
        const available = resolveTemplatesAvailable(cwd, parentFolder, { depth: 1 });
        const matched = available.find((t) => t.name === args.template);
        if (!matched) {
          return textResult(
            `Error: template "${args.template}" not found for folder "${parentFolder || '.'}". Available: ${
              available.length === 0
                ? '(none)'
                : available.map((t) => `${t.name} [${t.scope}]`).join(', ')
            }. Templates are resolved by walk-up; check list_documents({ dir, depth: 1 }) at the parent folder to see the menu.`,
            true,
          );
        }
        if (matched.scope === 'descendant') {
          return textResult(
            `Error: template "${args.template}" is scoped to "${matched.source_folder}/" and below; cannot be used to create a doc at "${parentFolder || '.'}". Pass a docName under "${matched.source_folder}/" or pick a different template.`,
            true,
          );
        }
        let templateContent: string;
        try {
          templateContent = readFileSync(resolvePath(cwd, matched.path), 'utf-8');
        } catch (err) {
          return textResult(
            `Error: failed to read template at ${matched.path}: ${(err as Error).message}`,
            true,
          );
        }
        effectiveMarkdown = templateContent;
        // Spec §6.2: template body becomes the starting markdown. When no
        // agent override is given, position is "replace" (initial create).
        // When the agent provided their own markdown alongside template,
        // we still treat this as instantiation — agent edits via
        // edit_document afterward to fill in placeholders. Force replace.
        effectivePosition = 'replace';
      }

      const result = await httpPost(url, '/api/agent-write-md', {
        docName: normalized.docName,
        markdown: effectiveMarkdown,
        position: effectivePosition,
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

      const lines: string[] = [
        args.template !== undefined
          ? `Written successfully (instantiated from template "${args.template}").`
          : `Written successfully (${effectivePosition}).`,
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
