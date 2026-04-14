/**
 * `write_document` MCP tool — write markdown to a document via the CRDT layer.
 *
 * Sends content to Hocuspocus via POST /api/agent-write-md, which applies it
 * through a DirectConnection and propagates to all connected editors in real-time.
 */
import { z } from 'zod';
import type { AgentIdentity } from '../agent-identity.ts';
import type { ServerInstance } from './shared.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, httpPost, normalizeDocName, textResult } from './shared.ts';

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
].join('\n');

export function register(
  server: ServerInstance,
  serverUrl: string | undefined,
  identityRef?: { current: AgentIdentity },
): void {
  server.tool(
    'write_document',
    DESCRIPTION,
    {
      docName: z.string().describe('Document name to write to'),
      markdown: z.string().describe('Markdown content to write'),
      position: z.enum(['append', 'prepend', 'replace']).describe('Where to insert the content'),
    },
    async (args: { docName: string; markdown: string; position: string }) => {
      if (!serverUrl) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const normalized = normalizeDocName(args.docName);
      if (!normalized.ok) return textResult(normalized.error, true);
      const identity = identityRef?.current;
      const result = await httpPost(serverUrl, '/api/agent-write-md', {
        docName: normalized.docName,
        markdown: args.markdown,
        position: args.position,
        ...(identity ? { agentId: identity.connectionId, agentName: identity.displayName } : {}),
      });
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      return textResult(`Written successfully (${args.position})`);
    },
  );
}
