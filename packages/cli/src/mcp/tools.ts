/**
 * MCP tool definitions — 8 tools for document operations.
 *
 * Tools interact with the running Hocuspocus server via HTTP API.
 * Read operations are direct file reads; write operations use the HTTP API
 * which goes through the CRDT layer.
 *
 * Note: server.tool() calls use `as any` casts on handlers because the MCP SDK's
 * generic type inference causes TS2589 (excessively deep type instantiation) with
 * multi-field Zod schemas. Runtime behavior is correct — Zod validates inputs.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

function log(msg: string): void {
  process.stderr.write(`[mcp] ${msg}\n`);
}

async function httpPost(
  baseUrl: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; [key: string]: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as { ok: boolean; [key: string]: unknown };
}

function textResult(text: string, isError?: boolean) {
  return { content: [{ type: 'text' as const, text }], ...(isError ? { isError: true } : {}) };
}

// Use `any` typed reference to avoid MCP SDK's TS2589 deep type instantiation
// with multi-field Zod schemas. Runtime validation is still provided by Zod.
type ToolFn = McpServer['tool'];

export function registerTools(server: McpServer, httpUrl: string): void {
  const tool: ToolFn = server.tool.bind(server);

  // Tool 1: read_document
  tool('read_document', { path: z.string() }, (async (args: { path: string }) => {
    log(`read_document: ${args.path}`);
    const contentDir = resolve(process.cwd(), 'content');
    const filePath = resolve(contentDir, `${args.path}.md`);
    if (!filePath.startsWith(contentDir)) return textResult('Error: invalid path', true);
    if (!existsSync(filePath)) return textResult(`Document not found: ${args.path}`, true);
    return textResult(readFileSync(filePath, 'utf-8'));
  }) as any);

  // Tool 2: write_document
  tool(
    'write_document',
    { path: z.string(), markdown: z.string(), mode: z.enum(['append', 'prepend', 'replace']) },
    (async (args: { path: string; markdown: string; mode: string }) => {
      log(`write_document: mode=${args.mode}`);
      const position = args.mode === 'prepend' ? 'prepend' : 'append';
      const result = await httpPost(httpUrl, '/api/agent-write-md', {
        markdown: args.markdown,
        position,
      });
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      return textResult(`Written successfully (${args.mode})`);
    }) as any,
  );

  // Tool 3: edit_document
  tool(
    'edit_document',
    { path: z.string(), find: z.string(), replace: z.string(), dry_run: z.boolean() },
    (async (args: { path: string; find: string; replace: string; dry_run: boolean }) => {
      log(`edit_document: ${args.path} (dry_run=${args.dry_run})`);
      const contentDir = resolve(process.cwd(), 'content');
      const filePath = resolve(contentDir, `${args.path}.md`);
      if (!filePath.startsWith(contentDir)) return textResult('Error: invalid path', true);
      if (!existsSync(filePath)) return textResult(`Document not found: ${args.path}`, true);
      const content = readFileSync(filePath, 'utf-8');
      if (!content.includes(args.find)) return textResult('Find text not found in document', true);
      const newContent = content.replace(args.find, args.replace);
      if (args.dry_run) {
        return textResult(
          `Preview (dry run):\n--- Before ---\n${content}\n--- After ---\n${newContent}`,
        );
      }
      const result = await httpPost(httpUrl, '/api/agent-write-md', {
        markdown: newContent,
        position: 'replace',
      });
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      return textResult('Edit applied successfully');
    }) as any,
  );

  // Tool 4: list_documents
  tool('list_documents', { directory: z.string() }, (async (args: { directory: string }) => {
    log(`list_documents: ${args.directory || '(root)'}`);
    const contentDir = resolve(process.cwd(), 'content', args.directory);
    if (!existsSync(contentDir)) return textResult(`Directory not found: ${args.directory}`);
    const entries = readdirSync(contentDir, { recursive: true })
      .filter((f) => typeof f === 'string' && f.endsWith('.md'))
      .map((f) => {
        const fullPath = resolve(contentDir, f as string);
        const stat = statSync(fullPath);
        return {
          path: (f as string).replace(/\.md$/, ''),
          size: stat.size,
          modified: stat.mtime.toISOString(),
        };
      });
    return textResult(JSON.stringify(entries, null, 2));
  }) as any);

  // Tool 5: search_documents
  tool('search_documents', { query: z.string(), case_sensitive: z.boolean() }, (async (args: {
    query: string;
    case_sensitive: boolean;
  }) => {
    log(`search_documents: "${args.query}"`);
    const contentDir = resolve(process.cwd(), 'content');
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
  }) as any);

  // Tool 6: undo_agent_edit
  tool('undo_agent_edit', {}, async () => {
    log('undo_agent_edit');
    const result = await httpPost(httpUrl, '/api/agent-undo');
    return textResult(
      result.ok
        ? `Undo performed. canUndo: ${result.canUndo}, canRedo: ${result.canRedo}`
        : `Cannot undo. canUndo: ${result.canUndo}, canRedo: ${result.canRedo}`,
    );
  });

  // Tool 7: redo_agent_edit
  tool('redo_agent_edit', {}, async () => {
    log('redo_agent_edit');
    const result = await httpPost(httpUrl, '/api/agent-redo');
    return textResult(
      result.ok
        ? `Redo performed. canUndo: ${result.canUndo}, canRedo: ${result.canRedo}`
        : `Cannot redo. canUndo: ${result.canUndo}, canRedo: ${result.canRedo}`,
    );
  });

  // Tool 8: update_frontmatter
  tool(
    'update_frontmatter',
    { path: z.string(), fields: z.record(z.string(), z.string()) },
    (async (args: { path: string; fields: Record<string, string> }) => {
      log(`update_frontmatter: ${args.path}`);
      const contentDir = resolve(process.cwd(), 'content');
      const filePath = resolve(contentDir, `${args.path}.md`);
      if (!filePath.startsWith(contentDir)) return textResult('Error: invalid path', true);
      if (!existsSync(filePath)) return textResult(`Document not found: ${args.path}`, true);

      const content = readFileSync(filePath, 'utf-8');
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
      const body = fmMatch ? content.slice(fmMatch[0].length) : content;
      const newContent = newFm + body;

      const result = await httpPost(httpUrl, '/api/agent-write-md', {
        markdown: newContent,
        position: 'replace',
      });
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      return textResult(`Frontmatter updated: ${Object.keys(args.fields).join(', ')}`);
    }) as any,
  );
}
