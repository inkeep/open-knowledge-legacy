/**
 * MCP tool definitions — 8 tools for document operations.
 *
 * Tools interact with the running Hocuspocus server via HTTP API.
 * Read operations are direct file reads; write operations use the HTTP API
 * which goes through the CRDT layer.
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

export function registerTools(server: McpServer, httpUrl: string): void {
  // Tool 1: read_document
  server.tool(
    'read_document',
    'Read a document from the knowledge base. Returns markdown content with frontmatter.',
    { path: z.string().describe('Document path relative to content dir (without .md extension)') },
    async ({ path: docPath }) => {
      log(`read_document: ${docPath}`);
      // Read directly from the content directory
      // The server's persistence layer keeps files in sync with CRDT state
      const contentDir = resolve(process.cwd(), 'content');
      const filePath = resolve(contentDir, `${docPath}.md`);
      if (!filePath.startsWith(contentDir)) {
        return { content: [{ type: 'text' as const, text: 'Error: invalid path' }] };
      }
      if (!existsSync(filePath)) {
        return { content: [{ type: 'text' as const, text: `Document not found: ${docPath}` }] };
      }
      const content = readFileSync(filePath, 'utf-8');
      return { content: [{ type: 'text' as const, text: content }] };
    },
  );

  // Tool 2: write_document
  server.tool(
    'write_document',
    'Write content to a document. Supports append, prepend, or replace modes.',
    {
      path: z.string().describe('Document path (without .md extension)'),
      markdown: z.string().describe('Markdown content to write'),
      mode: z
        .enum(['append', 'prepend', 'replace'])
        .default('append')
        .describe('Write mode: append (end), prepend (start), or replace (full)'),
    },
    async ({ markdown, mode }) => {
      log(`write_document: mode=${mode}`);
      const position = mode === 'prepend' ? 'prepend' : 'append';
      const result = await httpPost(httpUrl, '/api/agent-write-md', {
        markdown,
        position,
      });
      if (!result.ok) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${result.error}` }],
          isError: true,
        };
      }
      return { content: [{ type: 'text' as const, text: `Written successfully (${mode})` }] };
    },
  );

  // Tool 3: edit_document
  server.tool(
    'edit_document',
    'Surgical find-replace in a document. Supports dry_run to preview changes.',
    {
      path: z.string().describe('Document path (without .md extension)'),
      find: z.string().describe('Text to find'),
      replace: z.string().describe('Replacement text'),
      dry_run: z.boolean().default(false).describe('Preview changes without applying'),
    },
    async ({ path: docPath, find, replace, dry_run }) => {
      log(`edit_document: ${docPath} (dry_run=${dry_run})`);
      const contentDir = resolve(process.cwd(), 'content');
      const filePath = resolve(contentDir, `${docPath}.md`);
      if (!filePath.startsWith(contentDir)) {
        return {
          content: [{ type: 'text' as const, text: 'Error: invalid path' }],
          isError: true,
        };
      }
      if (!existsSync(filePath)) {
        return {
          content: [{ type: 'text' as const, text: `Document not found: ${docPath}` }],
          isError: true,
        };
      }
      const content = readFileSync(filePath, 'utf-8');
      if (!content.includes(find)) {
        return {
          content: [{ type: 'text' as const, text: 'Find text not found in document' }],
          isError: true,
        };
      }
      const newContent = content.replace(find, replace);
      if (dry_run) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Preview (dry run):\n--- Before ---\n${content}\n--- After ---\n${newContent}`,
            },
          ],
        };
      }
      // Apply the full replacement via the server
      const result = await httpPost(httpUrl, '/api/agent-write-md', {
        markdown: newContent,
        position: 'replace',
      });
      if (!result.ok) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${result.error}` }],
          isError: true,
        };
      }
      return { content: [{ type: 'text' as const, text: 'Edit applied successfully' }] };
    },
  );

  // Tool 4: list_documents
  server.tool(
    'list_documents',
    'List all documents in the knowledge base.',
    {
      directory: z.string().default('').describe('Subdirectory to list (empty for root)'),
    },
    async ({ directory }) => {
      log(`list_documents: ${directory || '(root)'}`);
      const contentDir = resolve(process.cwd(), 'content', directory);
      if (!existsSync(contentDir)) {
        return {
          content: [{ type: 'text' as const, text: `Directory not found: ${directory}` }],
        };
      }
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
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(entries, null, 2) }],
      };
    },
  );

  // Tool 5: search_documents
  server.tool(
    'search_documents',
    'Search for text across all documents in the knowledge base.',
    {
      query: z.string().describe('Text to search for'),
      case_sensitive: z.boolean().default(false).describe('Case-sensitive search'),
    },
    async ({ query, case_sensitive }) => {
      log(`search_documents: "${query}"`);
      const contentDir = resolve(process.cwd(), 'content');
      if (!existsSync(contentDir)) {
        return {
          content: [{ type: 'text' as const, text: 'Content directory not found' }],
        };
      }
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
          const matches = case_sensitive
            ? line.includes(query)
            : line.toLowerCase().includes(query.toLowerCase());
          if (matches) {
            results.push({
              path: (file as string).replace(/\.md$/, ''),
              line: i + 1,
              text: line.trim(),
            });
          }
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: results.length > 0 ? JSON.stringify(results, null, 2) : 'No matches found',
          },
        ],
      };
    },
  );

  // Tool 6: undo_agent_edit
  server.tool(
    'undo_agent_edit',
    'Undo the last agent edit. Uses per-agent undo tracking.',
    {},
    async () => {
      log('undo_agent_edit');
      const result = await httpPost(httpUrl, '/api/agent-undo');
      return {
        content: [
          {
            type: 'text' as const,
            text: result.ok
              ? `Undo performed. canUndo: ${result.canUndo}, canRedo: ${result.canRedo}`
              : `Cannot undo. canUndo: ${result.canUndo}, canRedo: ${result.canRedo}`,
          },
        ],
      };
    },
  );

  // Tool 7: redo_agent_edit
  server.tool('redo_agent_edit', 'Redo a previously undone agent edit.', {}, async () => {
    log('redo_agent_edit');
    const result = await httpPost(httpUrl, '/api/agent-redo');
    return {
      content: [
        {
          type: 'text' as const,
          text: result.ok
            ? `Redo performed. canUndo: ${result.canUndo}, canRedo: ${result.canRedo}`
            : `Cannot redo. canUndo: ${result.canUndo}, canRedo: ${result.canRedo}`,
        },
      ],
    };
  });

  // Tool 8: update_frontmatter
  server.tool(
    'update_frontmatter',
    'Update frontmatter fields in a document.',
    {
      path: z.string().describe('Document path (without .md extension)'),
      fields: z.record(z.string()).describe('Key-value pairs to set in frontmatter'),
    },
    async ({ path: docPath, fields }) => {
      log(`update_frontmatter: ${docPath}`);
      const contentDir = resolve(process.cwd(), 'content');
      const filePath = resolve(contentDir, `${docPath}.md`);
      if (!filePath.startsWith(contentDir)) {
        return {
          content: [{ type: 'text' as const, text: 'Error: invalid path' }],
          isError: true,
        };
      }
      if (!existsSync(filePath)) {
        return {
          content: [{ type: 'text' as const, text: `Document not found: ${docPath}` }],
          isError: true,
        };
      }

      const content = readFileSync(filePath, 'utf-8');
      // Parse existing frontmatter
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

      // Merge fields
      const merged = { ...existingFm, ...fields };
      const fmLines = Object.entries(merged).map(([k, v]) => `${k}: ${v}`);
      const newFm = `---\n${fmLines.join('\n')}\n---\n`;
      const body = fmMatch ? content.slice(fmMatch[0].length) : content;
      const newContent = newFm + body;

      // Write back via server
      const result = await httpPost(httpUrl, '/api/agent-write-md', {
        markdown: newContent,
        position: 'replace',
      });
      if (!result.ok) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${result.error}` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: `Frontmatter updated: ${Object.keys(fields).join(', ')}`,
          },
        ],
      };
    },
  );
}
