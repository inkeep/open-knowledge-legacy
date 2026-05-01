/**
 * MCP tools — intentionally empty (runtime surface).
 *
 * The 8 document-proxy tools that used to live here were split between two
 * separate design decisions and are kept below as commented-out reference
 * code so the rejected/deferred implementations stay visible for future work.
 *
 * ## Why this file exists but exports nothing
 *
 * - **Read tools (`read_document`, `list_documents`, `search_documents`)** —
 *   D2-rejected. Agents use their native `Read`, `Grep`, and `Glob` tools
 *   directly against files in `.ok/`. Proxying reads through MCP
 *   adds latency, hides the filesystem, and duplicates capability the agent
 *   already has. Do not revive without revisiting D2.
 *
 * - **Write/edit/undo tools (`write_document`, `edit_document`,
 *   `update_frontmatter`, `undo_agent_edit`, `redo_agent_edit`)** — D1-deferred.
 *   These routed through a `POST /api/agent-*` HTTP API backed by Hocuspocus
 *   DirectConnection, which enabled (a) instant propagation to the editor,
 *   (b) origin tagging (`agent-write`), and (c) per-origin undo. When D1 is
 *   revisited — trigger condition: editor integration becomes priority, or
 *   write-conflict/stale-editor friction is reported in the disk-only path —
 *   these are the reference implementation to start from. Server-side
 *   counterpart: `packages/server/src/api-extension.ts`. See SPEC.md §15
 *   Future Work "Adaptive write path" for the full work plan.
 *
 * The commented block below is the full implementation that was on this
 * file when D2 gutted it. Preserved verbatim (not pretty-printed or
 * updated to newer APIs) because its value is as a historical / reference
 * artifact, not as maintained code. When reviving, expect to modernize.
 */
export {};

/*
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { dim } from '../ui/colors.ts';

function mcpLog(msg: string): void {
  process.stderr.write(`${dim('[mcp]')} ${msg}\n`);
}

async function httpGet(
  baseUrl: string,
  path: string,
): Promise<{ ok: boolean; [key: string]: unknown }> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`);
  } catch (err) {
    return { ok: false, error: `Server unreachable: ${err instanceof Error ? err.message : err}` };
  }
  try {
    return (await res.json()) as { ok: boolean; [key: string]: unknown };
  } catch {
    return { ok: false, error: `Server returned HTTP ${res.status} with non-JSON body` };
  }
}

async function httpPost(
  baseUrl: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; [key: string]: unknown }> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    return { ok: false, error: `Server unreachable: ${err instanceof Error ? err.message : err}` };
  }
  try {
    return (await res.json()) as { ok: boolean; [key: string]: unknown };
  } catch {
    return { ok: false, error: `Server returned HTTP ${res.status} with non-JSON body` };
  }
}

function textResult(text: string, isError?: boolean) {
  return { content: [{ type: 'text' as const, text }], ...(isError ? { isError: true } : {}) };
}

export function registerTools(server: McpServer, httpUrl: string, contentDir: string): void {
  // biome-ignore lint/suspicious/noExplicitAny: MCP SDK TS2589 workaround — deeply recursive generics
  const tool = server.tool.bind(server) as any;

  // =============================================================================
  // D2-rejected read/list/search tools — agents use native Read/Grep/Glob instead
  // =============================================================================

  // Tool 1: read_document
  tool(
    'read_document',
    'Read the current live content of a document. Returns the Y.Text state from the CRDT layer.',
    { path: z.string() },
    async (args: { path: string }) => {
      mcpLog(`read_document: ${args.path}`);
      const result = await httpGet(
        httpUrl,
        `/api/document?docName=${encodeURIComponent(args.path)}`,
      );
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      return textResult(result.content as string);
    },
  );

  // Tool 2: write_document
  tool(
    'write_document',
    "Write markdown to a document via the CRDT. 'append' and 'prepend' insert at the current live Y.Text position.",
    { path: z.string(), markdown: z.string(), mode: z.enum(['append', 'prepend', 'replace']) },
    async (args: { path: string; markdown: string; mode: string }) => {
      mcpLog(`write_document: ${args.path} mode=${args.mode}`);
      const result = await httpPost(httpUrl, '/api/agent-write-md', {
        markdown: args.markdown,
        position: args.mode,
        docName: args.path,
      });
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      return textResult(`Written successfully (${args.mode})`);
    },
  );

  // Tool 3: edit_document
  tool(
    'edit_document',
    'Targeted find-and-replace on live document content.',
    { path: z.string(), find: z.string(), replace: z.string(), dry_run: z.boolean() },
    async (args: { path: string; find: string; replace: string; dry_run: boolean }) => {
      mcpLog(`edit_document: ${args.path} (dry_run=${args.dry_run})`);
      if (args.dry_run) {
        const readResult = await httpGet(
          httpUrl,
          `/api/document?docName=${encodeURIComponent(args.path)}`,
        );
        if (!readResult.ok) return textResult(`Error: ${readResult.error}`, true);
        const content = readResult.content as string;
        if (!content.includes(args.find))
          return textResult('Find text not found in document', true);
        const newContent = content.replace(args.find, args.replace);
        return textResult(
          `Preview (dry run):\n--- Before ---\n${content}\n--- After ---\n${newContent}`,
        );
      }
      const result = await httpPost(httpUrl, '/api/agent-patch', {
        docName: args.path,
        find: args.find,
        replace: args.replace,
      });
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      return textResult('Edit applied successfully');
    },
  );

  // Tool 4: list_documents
  tool(
    'list_documents',
    'List all markdown documents in the content directory.',
    { directory: z.string() },
    async (args: { directory: string }) => {
      mcpLog(`list_documents: ${args.directory || '(root)'}`);
      const dirPath = resolve(contentDir, args.directory);
      if (!dirPath.startsWith(`${contentDir}/`) && dirPath !== contentDir) {
        return textResult('Error: invalid directory path', true);
      }
      if (!existsSync(dirPath)) return textResult(`Directory not found: ${args.directory}`);
      const entries = readdirSync(dirPath, { recursive: true })
        .filter((f) => typeof f === 'string' && f.endsWith('.md'))
        .map((f) => {
          const fullPath = resolve(dirPath, f as string);
          const stat = statSync(fullPath);
          return {
            path: (f as string).replace(/\.md$/, ''),
            size: stat.size,
            modified: stat.mtime.toISOString(),
          };
        });
      return textResult(JSON.stringify(entries, null, 2));
    },
  );

  // Tool 5: search_documents
  tool(
    'search_documents',
    'Full-text search across all documents.',
    { query: z.string(), case_sensitive: z.boolean() },
    async (args: { query: string; case_sensitive: boolean }) => {
      mcpLog(`search_documents: "${args.query}"`);
      if (!existsSync(contentDir)) return textResult('Content directory not found');
      const results: Array<{ path: string; line: number; text: string }> = [];
      const files = readdirSync(contentDir, { recursive: true }).filter(
        (f) => typeof f === 'string' && f.endsWith('.md'),
      );
      for (const file of files) {
        const filePath = resolve(contentDir, file as string);
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const matches = args.case_sensitive
            ? line.includes(args.query)
            : line.toLowerCase().includes(args.query.toLowerCase());
          if (matches) {
            results.push({
              path: (file as string).replace(/\.md$/, ''),
              line: i + 1,
              text: line.trim(),
            });
          }
        }
      }
      return textResult(results.length > 0 ? JSON.stringify(results, null, 2) : 'No matches found');
    },
  );

  // Tool 6: undo_agent_edit (V0-14 per-session undo — requires connectionId)
  tool(
    'undo_agent_edit',
    'Undo the last agent write for a specific session. Only agent edits (origin: agent-undo) are reversed.',
    { connectionId: z.string(), docName: z.string(), scope: z.enum(['last', 'session']).optional() },
    async (args: { connectionId: string; docName: string; scope?: 'last' | 'session' }) => {
      mcpLog('undo_agent_edit');
      const result = await httpPost(httpUrl, '/api/agent-undo', {
        connectionId: args.connectionId,
        docName: args.docName,
        scope: args.scope ?? 'last',
      });
      return textResult(result.ok ? 'Undo performed.' : `Undo failed: ${result.error}`);
    },
  );

  // Tool 7: redo_agent_edit — deferred (no /api/agent-redo route in V0-14)

  // Tool 8: update_frontmatter — merge fields into existing frontmatter
  tool(
    'update_frontmatter',
    'Merge fields into the document YAML frontmatter without touching the body.',
    { path: z.string(), fields: z.record(z.string(), z.string()) },
    async (args: { path: string; fields: Record<string, string> }) => {
      mcpLog(`update_frontmatter: ${args.path}`);
      const readResult = await httpGet(
        httpUrl,
        `/api/document?docName=${encodeURIComponent(args.path)}`,
      );
      if (!readResult.ok) return textResult(`Error: ${readResult.error}`, true);

      const content = readResult.content as string;
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
      const existingFm: Record<string, string> = {};
      if (fmMatch) {
        for (const line of fmMatch[1].split('\n')) {
          const colonIdx = line.indexOf(':');
          if (colonIdx > 0) {
            const key = line.slice(0, colonIdx).trim();
            const value = line.slice(colonIdx + 1).trim();
            existingFm[key] = value;
          }
        }
      }

      const merged = { ...existingFm, ...args.fields };
      const fmLines = Object.entries(merged).map(([k, v]) => `${k}: ${v}`);
      const newFm = `---\n${fmLines.join('\n')}\n---\n`;

      if (fmMatch) {
        const result = await httpPost(httpUrl, '/api/agent-patch', {
          docName: args.path,
          find: fmMatch[0],
          replace: newFm,
        });
        if (!result.ok) return textResult(`Error: ${result.error}`, true);
      } else {
        const result = await httpPost(httpUrl, '/api/agent-write-md', {
          markdown: newFm,
          position: 'prepend',
          docName: args.path,
        });
        if (!result.ok) return textResult(`Error: ${result.error}`, true);
      }
      return textResult(`Frontmatter updated: ${Object.keys(args.fields).join(', ')}`);
    },
  );
}
*/
