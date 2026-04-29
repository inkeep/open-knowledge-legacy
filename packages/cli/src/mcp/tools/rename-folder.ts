/**
 * `rename_folder` MCP tool — managed folder rename via the server API.
 *
 * Calls POST /api/rename-path with kind: 'folder'. Renames the target folder
 * atomically and rewrites inbound wiki-links + supported markdown links across
 * all affected docs. One MCP call replaces N rename_document calls.
 */
import { z } from 'zod';
import type { AgentIdentity } from '../agent-identity.ts';
import { type PreviewUrlSource, resolvePreviewUrlForTool } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpPost,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  SUMMARY_TRANSPORT_CAP,
  textPlusStructured,
  textResult,
} from './shared.ts';

interface RenameFolderMapping {
  fromDocName: string;
  toDocName: string;
}

interface RenameFolderRewrittenDoc {
  docName: string;
  rewrites: number;
}

interface RenameFolderSuccess {
  ok: true;
  renamed: RenameFolderMapping[];
  rewrittenDocs: RenameFolderRewrittenDoc[];
  /** Map of newly-renamed docName → resolved preview URL. Empty when UI is down. */
  previewUrls: Record<string, string>;
  /** Source of the previewUrl resolver. Omitted when previewUrls is empty. */
  previewUrlSource?: PreviewUrlSource;
  /** Stored summary echo (same applied to every affected-doc contributor entry).
   *  Absent when no summary was supplied. */
  summary?: { value: string; truncatedFrom?: number; hint?: string };
}

interface RenameFolderError {
  ok: false;
  error: string;
}

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Rename a folder through the managed rename flow at `POST /api/rename-path` (kind: folder).',
  'Atomically moves the folder and rewrites inbound wiki-links + supported internal inline Markdown links across every affected doc. One call replaces N rename_document calls.',
  '',
  '**Parameters:**',
  '- `fromFolder` — Current folder path relative to the content directory (no leading or trailing slash). Example: `articles` or `notes/drafts`.',
  '- `toFolder` — New folder path relative to the content directory. Example: `essays` or `notes/published`. Parent directories are auto-created.',
  '- `summary` — Optional one-line user-outcome description (≤80 chars). Applied to every affected-doc contributor entry. If omitted, no default summary is generated.',
  '',
  '**Errors:**',
  '- 400 — case-only renames (e.g. `Articles` → `articles`) are not supported.',
  '- 404 — source folder does not exist.',
  '- 409 — destination folder already exists or rename would collide.',
].join('\n');

function isValidFolderPath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (path.startsWith('/') || path.endsWith('/')) return false;
  if (path.includes('..')) return false;
  return true;
}

function parseRenameMappings(value: unknown): RenameFolderMapping[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { fromDocName, toDocName } = entry as Record<string, unknown>;
    return typeof fromDocName === 'string' && typeof toDocName === 'string'
      ? [{ fromDocName, toDocName }]
      : [];
  });
}

function parseRewrittenDocs(value: unknown): RenameFolderRewrittenDoc[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { docName, rewrites } = entry as Record<string, unknown>;
    return typeof docName === 'string' && typeof rewrites === 'number'
      ? [{ docName, rewrites }]
      : [];
  });
}

export interface RenameFolderDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
  identityRef?: { current: AgentIdentity };
}

export function register(server: ServerInstance, deps: RenameFolderDeps): void {
  server.tool(
    'rename_folder',
    DESCRIPTION,
    {
      fromFolder: z.string().describe('Current folder path (relative, no trailing slash)'),
      toFolder: z.string().describe('New folder path (relative, no trailing slash)'),
      summary: z
        .string()
        .max(SUMMARY_TRANSPORT_CAP)
        .optional()
        .describe(
          'Optional one-line user-outcome description (≤80 chars). Applied to every affected-doc contributor entry.',
        ),
      cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
    },
    async (args: { fromFolder: string; toFolder: string; summary?: string; cwd?: string }) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      if (!isValidFolderPath(args.fromFolder)) {
        return textResult(
          'fromFolder must be a relative path with no leading/trailing slash',
          true,
        );
      }
      if (!isValidFolderPath(args.toFolder)) {
        return textResult('toFolder must be a relative path with no leading/trailing slash', true);
      }

      const identity = deps.identityRef?.current;
      const result = await httpPost(url, '/api/rename-path', {
        kind: 'folder',
        fromPath: args.fromFolder,
        toPath: args.toFolder,
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
        const error = typeof result.error === 'string' ? result.error : 'Folder rename failed';
        const structured: RenameFolderError = { ok: false, error };
        return textPlusStructured(`Error: ${error}`, structured, true);
      }

      const renamed = parseRenameMappings(result.renamed);
      const rewrittenDocs = parseRewrittenDocs(result.rewrittenDocs);

      const previewDeps = { config: deps.config, resolveCwd: deps.resolveCwd };
      const previewUrls: Record<string, string> = {};
      let previewUrlSource: PreviewUrlSource | undefined;
      for (const { toDocName } of renamed) {
        const preview = await resolvePreviewUrlForTool(toDocName, previewDeps, cwd);
        if (preview) {
          previewUrls[toDocName] = preview.url;
          previewUrlSource ??= preview.source;
        }
      }

      const summaryResult =
        result.summary && typeof result.summary === 'object'
          ? (result.summary as { value: string; truncatedFrom?: number; hint?: string })
          : undefined;
      const summaryHint = typeof summaryResult?.hint === 'string' ? summaryResult.hint : undefined;

      const structured: RenameFolderSuccess = {
        ok: true,
        renamed,
        rewrittenDocs,
        previewUrls,
        ...(previewUrlSource ? { previewUrlSource } : {}),
        ...(summaryResult ? { summary: summaryResult } : {}),
      };

      const textLines = [
        `Renamed folder ${args.fromFolder}/ → ${args.toFolder}/ (${renamed.length} doc${
          renamed.length === 1 ? '' : 's'
        }, ${rewrittenDocs.length} rewrite${rewrittenDocs.length === 1 ? '' : 's'}).`,
      ];
      if (summaryHint) textLines.push(summaryHint);
      return textPlusStructured(textLines.join('\n'), structured);
    },
  );
}
