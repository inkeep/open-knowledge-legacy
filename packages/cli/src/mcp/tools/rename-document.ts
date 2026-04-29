/**
 * `rename_document` MCP tool — managed page rename via the server API.
 *
 * Calls POST /api/rename-path with kind: 'file'. Renames the target document
 * and rewrites inbound wiki-links plus supported internal inline Markdown links.
 */
import { z } from 'zod';
import type { AgentIdentity } from '../agent-identity.ts';
import { type PreviewUrlSource, resolvePreviewUrlForTool } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpPost,
  normalizeDocName,
  parseRenameCollidingPairs,
  type RenameCollisionPair,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  summaryArgSchema,
  textPlusStructured,
  textResult,
} from './shared.ts';

interface RenameDocumentMapping {
  fromDocName: string;
  toDocName: string;
}

interface RenameDocumentRewrittenDoc {
  docName: string;
  rewrites: number;
}

interface RenameDocumentSuccess {
  ok: true;
  renamed: RenameDocumentMapping[];
  rewrittenDocs: RenameDocumentRewrittenDoc[];
  /** Preview URL for the NEW (renamed-to) docName. Null when UI is down. */
  previewUrl: string | null;
  /** Source of the previewUrl resolver (env / lock / config). Omitted when previewUrl is null. */
  previewUrlSource?: PreviewUrlSource;
  /** Preview URL that used to resolve to the now-renamed doc. Present only when the helper resolves. */
  previousPreviewUrl?: string;
  /** Stored summary + original length when truncation fired + truncation hint.
   *  Absent when no agent-provided or default summary was recorded (e.g., UI-driven path).
   *  `truncatedFrom` + `hint` are only present when the agent-provided summary
   *  was truncated — server-generated defaults that overflow the cap suppress
   *  both fields so the response does not misattribute truncation to the caller. */
  summary?: { value: string; truncatedFrom?: number; hint?: string };
}

interface RenameDocumentError {
  ok: false;
  error: string;
  /** Server-supplied structured collision list when 409 is a rename-map collision. */
  colliding?: RenameCollisionPair[];
}

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Rename a document through the managed rename flow at `POST /api/rename-path` (kind: file).',
  'Renames the target document and rewrites inbound wiki-links plus supported internal inline Markdown links in affected docs.',
  '',
  '**Parameters:**',
  '- `docName` — Current document name, typically without extension. A trailing `.md` or `.mdx` is stripped automatically.',
  '- `newDocName` — New document name, typically without extension. A trailing `.md` or `.mdx` is stripped automatically.',
  '- `summary` — Optional one-line user-outcome description (≤80 chars). Appears as a bullet in the timeline. If omitted, a default like "Renamed X → Y" is generated. Provide your own summary to explain the why. Avoid including secrets or PII — summaries are persisted to git history.',
  '',
  '**Errors:**',
  '- 400 — case-only renames (e.g. `Auth` → `auth`) are not supported.',
  '- 400 — destination document is excluded by the workspace `content.include` / `content.exclude` config.',
  '- 404 — source document does not exist.',
  '- 409 — destination document already exists.',
].join('\n');

function parseRenameMappings(value: unknown): RenameDocumentMapping[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { fromDocName, toDocName } = entry as Record<string, unknown>;
    return typeof fromDocName === 'string' && typeof toDocName === 'string'
      ? [{ fromDocName, toDocName }]
      : [];
  });
}

function parseRewrittenDocs(value: unknown): RenameDocumentRewrittenDoc[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { docName, rewrites } = entry as Record<string, unknown>;
    return typeof docName === 'string' && typeof rewrites === 'number'
      ? [{ docName, rewrites }]
      : [];
  });
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export interface RenameDocumentDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
  /** Same identity passthrough pattern as write-document (D15). Without this,
   *  MCP-driven renames post no agentId → the server-side D22 guard skips
   *  attribution, so summaries would have no contributor entry to live on. */
  identityRef?: { current: AgentIdentity };
}

export function register(server: ServerInstance, deps: RenameDocumentDeps): void {
  server.tool(
    'rename_document',
    DESCRIPTION,
    {
      docName: z.string().describe('Current document name'),
      newDocName: z.string().describe('New document name'),
      summary: summaryArgSchema.describe(
        'Optional one-line user-outcome description (≤80 chars). Defaults to "Renamed X → Y" when omitted. Appears as a bullet in the timeline.',
      ),
      cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
    },
    async (args: { docName: string; newDocName: string; summary?: string; cwd?: string }) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const normalizedDoc = normalizeDocName(args.docName);
      if (!normalizedDoc.ok) return textResult(normalizedDoc.error, true);
      const normalizedNewDoc = normalizeDocName(args.newDocName);
      if (!normalizedNewDoc.ok) return textResult(normalizedNewDoc.error, true);

      const identity = deps.identityRef?.current;
      const result = await httpPost(url, '/api/rename-path', {
        kind: 'file',
        fromPath: normalizedDoc.docName,
        toPath: normalizedNewDoc.docName,
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
        const error = typeof result.error === 'string' ? result.error : 'Rename failed';
        const colliding = parseRenameCollidingPairs(result.colliding);
        const structured: RenameDocumentError = {
          ok: false,
          error,
          ...(colliding.length > 0 ? { colliding } : {}),
        };
        return textPlusStructured(`Error: ${error}`, structured, true);
      }

      const renamed = parseRenameMappings(result.renamed);
      const rewrittenDocs = parseRewrittenDocs(result.rewrittenDocs);
      const renamedSummary =
        renamed.map(({ fromDocName, toDocName }) => `${fromDocName} -> ${toDocName}`).join(', ') ||
        `${normalizedDoc.docName} -> ${normalizedNewDoc.docName}`;
      const rewrittenSummary =
        rewrittenDocs.length === 0
          ? 'No inbound links required updates.'
          : `Rewrote ${rewrittenDocs.length} ${pluralize(rewrittenDocs.length, 'document')}.`;

      // previewUrl points at the NEW docName (the renamed-to target) per FR-2.1;
      // previousPreviewUrl is supplementary for agents that want to close/refocus
      // the pre-rename tab.
      const previewDeps = { config: deps.config, resolveCwd: deps.resolveCwd };
      const newPreview = await resolvePreviewUrlForTool(normalizedNewDoc.docName, previewDeps, cwd);
      const oldPreview = await resolvePreviewUrlForTool(normalizedDoc.docName, previewDeps, cwd);

      const summaryResult =
        result.summary && typeof result.summary === 'object'
          ? (result.summary as { value: string; truncatedFrom?: number; hint?: string })
          : undefined;
      const summaryHint = typeof summaryResult?.hint === 'string' ? summaryResult.hint : undefined;

      const structured: RenameDocumentSuccess = {
        ok: true,
        renamed,
        rewrittenDocs,
        previewUrl: newPreview?.url ?? null,
        ...(newPreview ? { previewUrlSource: newPreview.source } : {}),
        ...(oldPreview ? { previousPreviewUrl: oldPreview.url } : {}),
        ...(summaryResult ? { summary: summaryResult } : {}),
      };

      const textLines = [`Renamed ${renamedSummary}. ${rewrittenSummary}`];
      if (summaryHint) textLines.push(summaryHint);
      return textPlusStructured(textLines.join('\n'), structured);
    },
  );
}
