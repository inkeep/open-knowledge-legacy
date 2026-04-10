/**
 * MCP tool definitions — 8 tools for document operations.
 *
 * Tools interact with the running Hocuspocus server via HTTP API.
 * All reads and writes go through the live CRDT layer (Y.Text), not the filesystem.
 *
 * Note: server.tool() calls use `as any` casts on handlers because the MCP SDK's
 * generic type inference causes TS2589 (excessively deep type instantiation) with
 * multi-field Zod schemas. Runtime behavior is correct — Zod validates inputs.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { dim } from '../ui/colors.ts';

/** MCP diagnostic log — must use stderr to avoid corrupting the MCP JSON-RPC protocol on stdout */
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
  // Cast to any for tool registration — MCP SDK's server.tool() has deeply
  // recursive generics that cause TS2589 with multi-field Zod schemas.
  // Runtime behavior is correct: Zod still validates inputs at the MCP layer.
  // biome-ignore lint/suspicious/noExplicitAny: MCP SDK TS2589 workaround — deeply recursive generics
  const tool = server.tool.bind(server) as any;

  // Tool 1: read_document
  tool(
    'read_document',
    'Read the current live content of a document. Returns the Y.Text state from the CRDT layer — always up to date, even if unsaved changes are in flight. Path is the document name without .md extension.',
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
    "Write markdown to a document via the CRDT. 'append' and 'prepend' insert at the current live Y.Text position — safe for concurrent use. 'replace' overwrites the entire document; use only when a full rewrite is intended.",
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
    'Targeted find-and-replace on live document content. Only the matched character span is mutated — content before and after the match is untouched, even if concurrent writes are in flight. The find string must match exactly (including whitespace). Use dry_run: true to preview the change before applying.',
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
    'List all markdown documents in the content directory. Returns path (without .md), size in bytes, and last-modified timestamp for each file. Pass an empty string for directory to list from the root.',
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
    'Full-text search across all documents. Returns matching lines with document path and line number. Reads from disk so results may lag up to a few seconds behind in-flight CRDT changes — use read_document if you need live content.',
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

  // Tool 6: undo_agent_edit
  tool(
    'undo_agent_edit',
    'Undo the last agent write. Only agent edits (origin: agent-write) are reversed — human edits in the editor are not affected. Returns the new canUndo/canRedo state.',
    {},
    async () => {
      mcpLog('undo_agent_edit');
      const result = await httpPost(httpUrl, '/api/agent-undo');
      return textResult(
        result.ok
          ? `Undo performed. canUndo: ${result.canUndo}, canRedo: ${result.canRedo}`
          : `Cannot undo. canUndo: ${result.canUndo}, canRedo: ${result.canRedo}`,
      );
    },
  );

  // Tool 7: redo_agent_edit
  tool(
    'redo_agent_edit',
    'Redo the last undone agent write. Only applies to edits previously reversed by undo_agent_edit. Returns the new canUndo/canRedo state.',
    {},
    async () => {
      mcpLog('redo_agent_edit');
      const result = await httpPost(httpUrl, '/api/agent-redo');
      return textResult(
        result.ok
          ? `Redo performed. canUndo: ${result.canUndo}, canRedo: ${result.canRedo}`
          : `Cannot redo. canUndo: ${result.canUndo}, canRedo: ${result.canRedo}`,
      );
    },
  );

  // Tool 8: update_frontmatter
  tool(
    'update_frontmatter',
    'Merge fields into the document YAML frontmatter without touching the body. Reads live Y.Text, patches only the frontmatter block in a single CRDT transaction. If no frontmatter exists, prepends it. Existing fields not mentioned in fields are preserved.',
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
