import { z } from 'zod';
import type { AgentIdentity } from '../agent-identity.ts';
import { resolvePreviewUrlForTool } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  httpPost,
  normalizeDocName,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  summaryArgSchema,
  textPlusStructured,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Restore a document to a historical version via the CRDT layer.',
  'The restore is append-only — it creates a new version with the old content,',
  'preserving all history. All connected editors see the change in real-time.',
  '',
  '**Parameters:**',
  '- `docName` — Document name to restore, typically without extension. A trailing `.md` or `.mdx` is stripped automatically.',
  '- `commitSha` — The 40-character SHA of the shadow repo commit to restore to.',
  '  Use `get_history` to find available versions.',
  '- `summary` — Optional one-line user-outcome description (≤80 chars). Appears as a bullet in the timeline. If omitted, a default like "Restored to <sha-short>" is generated. Provide your own summary to explain the why. Avoid including secrets or PII — summaries are persisted to git history.',
].join('\n');

export interface RollbackToVersionDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
  identityRef?: { current: AgentIdentity };
}

export function register(server: ServerInstance, deps: RollbackToVersionDeps): void {
  server.tool(
    'rollback_to_version',
    DESCRIPTION,
    {
      docName: z.string().describe('Document name to restore'),
      commitSha: z
        .string()
        .length(40)
        .regex(/^[0-9a-f]+$/i)
        .describe('40-character commit SHA from the shadow repo timeline'),
      summary: summaryArgSchema.describe(
        'Optional one-line user-outcome description (≤80 chars). Defaults to "Restored to <sha-short>" when omitted. Appears as a bullet in the timeline.',
      ),
      cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
    },
    async (args: { docName: string; commitSha: string; summary?: string; cwd?: string }) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);

      const normalized = normalizeDocName(args.docName);
      if (!normalized.ok) return textResult(normalized.error, true);
      const docName = normalized.docName;

      const versionResult = await httpGet(
        url,
        `/api/history/${args.commitSha}?docName=${encodeURIComponent(docName)}`,
      );
      if (!versionResult.ok) {
        return textResult(`Error: ${versionResult.error ?? 'Version not found'}`, true);
      }

      const identity = deps.identityRef?.current;
      const result = await httpPost(url, '/api/rollback', {
        docName,
        commitSha: args.commitSha,
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

      const summaryResult =
        result.summary && typeof result.summary === 'object'
          ? (result.summary as { value: string; truncatedFrom?: number; hint?: string })
          : undefined;
      const summaryHint = typeof summaryResult?.hint === 'string' ? summaryResult.hint : undefined;

      const textLines = [
        `Restored "${docName}" to version ${args.commitSha.slice(0, 8)} (${versionResult.author}, ${versionResult.timestamp}). The change has been applied to all connected editors.`,
      ];
      if (summaryHint) textLines.push(summaryHint);

      const preview = await resolvePreviewUrlForTool(
        docName,
        {
          config: deps.config,
          resolveCwd: deps.resolveCwd,
        },
        cwd,
      );
      return textPlusStructured(textLines.join('\n'), {
        previewUrl: preview?.url ?? null,
        ...(preview ? { previewUrlSource: preview.source } : {}),
        ...(summaryResult ? { summary: summaryResult } : {}),
      });
    },
  );
}
