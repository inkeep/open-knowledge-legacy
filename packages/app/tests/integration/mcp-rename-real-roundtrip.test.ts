import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigSchema } from '@inkeep/open-knowledge-server';
import { register as registerRenameDocument } from '../../../server/src/mcp/tools/rename-document';
import { register as registerRenameFolder } from '../../../server/src/mcp/tools/rename-folder';
import type { ServerInstance } from '../../../server/src/mcp/tools/shared';
import { awaitFileWatcherIndexed, createRestartableServer } from './test-harness';

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface RegisteredTool {
  name: string;
  description: string;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

function createCapturingServer() {
  const registrations: RegisteredTool[] = [];
  const server = {
    tool(name: string, description: string, _schema: unknown, handler: RegisteredTool['handler']) {
      registrations.push({ name, description, handler });
    },
  } as unknown as ServerInstance;
  return { server, registrations };
}

function getTool(registrations: RegisteredTool[], name: string): RegisteredTool {
  const tool = registrations.find((r) => r.name === name);
  if (!tool) throw new Error(`Tool ${name} not registered`);
  return tool;
}

const cleanups: Array<() => Promise<void> | void> = [];
const BASE_CONFIG = ConfigSchema.parse({});
let originalPreviewEnv: string | undefined;

beforeEach(() => {
  originalPreviewEnv = process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
  delete process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
});

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
  if (originalPreviewEnv === undefined) {
    delete process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
  } else {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = originalPreviewEnv;
  }
});

describe('MCP rename tools — real roundtrip against live OK server (QA-004 / QA-005)', () => {
  test('QA-004: rename_folder posts to live /api/rename-path → folder + backlinks rewrite on disk', async () => {
    const server = await createRestartableServer();
    cleanups.push(() => server.shutdown());

    mkdirSync(join(server.contentDir, 'articles'), { recursive: true });
    writeFileSync(join(server.contentDir, 'articles', 'a.md'), '# A\n', 'utf-8');
    writeFileSync(join(server.contentDir, 'articles', 'b.md'), '# B\n', 'utf-8');
    writeFileSync(join(server.contentDir, 'articles', 'c.md'), '# C\n', 'utf-8');
    writeFileSync(
      join(server.contentDir, 'index.md'),
      '# Index\n\nLink: [[articles/a]]\n',
      'utf-8',
    );
    await Promise.all([
      awaitFileWatcherIndexed(server, 'articles/a'),
      awaitFileWatcherIndexed(server, 'articles/b'),
      awaitFileWatcherIndexed(server, 'articles/c'),
      awaitFileWatcherIndexed(server, 'index'),
    ]);

    const { server: mcp, registrations } = createCapturingServer();
    registerRenameFolder(mcp, {
      serverUrl: `http://localhost:${server.port}`,
      config: BASE_CONFIG,
      resolveCwd: async () => server.contentDir,
    });
    const tool = getTool(registrations, 'rename_folder');

    const result = await tool.handler({
      fromFolder: 'articles',
      toFolder: 'essays',
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('Renamed folder articles/ → essays/');
    const structured = result.structuredContent as {
      ok: boolean;
      renamed: Array<{ fromDocName: string; toDocName: string }>;
      rewrittenDocs: Array<{ docName: string; rewrites: number }>;
      previewUrls?: Record<string, string>;
    };
    expect(structured.ok).toBe(true);
    expect(structured.renamed).toHaveLength(3);
    const fromPaths = structured.renamed.map((r) => r.fromDocName).sort();
    expect(fromPaths).toEqual(['articles/a', 'articles/b', 'articles/c']);
    const toPaths = structured.renamed.map((r) => r.toDocName).sort();
    expect(toPaths).toEqual(['essays/a', 'essays/b', 'essays/c']);
    const rewrittenNames = structured.rewrittenDocs.map((d) => d.docName);
    expect(rewrittenNames).toContain('index');

    expect(existsSync(join(server.contentDir, 'essays', 'a.md'))).toBe(true);
    expect(existsSync(join(server.contentDir, 'essays', 'b.md'))).toBe(true);
    expect(existsSync(join(server.contentDir, 'essays', 'c.md'))).toBe(true);
    expect(existsSync(join(server.contentDir, 'articles', 'a.md'))).toBe(false);
    expect(existsSync(join(server.contentDir, 'articles'))).toBe(false);
    const indexBody = readFileSync(join(server.contentDir, 'index.md'), 'utf-8');
    expect(indexBody).toContain('[[essays/a]]');
    expect(indexBody).not.toContain('[[articles/a]]');
  }, 60_000);

  test('QA-005: rename_document posts to live /api/rename-path with kind:file → backlinks rewrite', async () => {
    const server = await createRestartableServer();
    cleanups.push(() => server.shutdown());

    writeFileSync(join(server.contentDir, 'auth.md'), '# Auth\n', 'utf-8');
    writeFileSync(join(server.contentDir, 'index.md'), '# Index\n\nLink: [[auth]]\n', 'utf-8');
    await Promise.all([
      awaitFileWatcherIndexed(server, 'auth'),
      awaitFileWatcherIndexed(server, 'index'),
    ]);

    const { server: mcp, registrations } = createCapturingServer();
    registerRenameDocument(mcp, {
      serverUrl: `http://localhost:${server.port}`,
      config: BASE_CONFIG,
      resolveCwd: async () => server.contentDir,
    });
    const tool = getTool(registrations, 'rename_document');

    const result = await tool.handler({
      docName: 'auth',
      newDocName: 'sso',
    });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as {
      ok: boolean;
      renamed: Array<{ fromDocName: string; toDocName: string }>;
      rewrittenDocs: Array<{ docName: string; rewrites: number }>;
    };
    expect(structured.ok).toBe(true);
    expect(structured.renamed).toEqual([{ fromDocName: 'auth', toDocName: 'sso' }]);
    const rewrittenNames = structured.rewrittenDocs.map((d) => d.docName);
    expect(rewrittenNames).toContain('index');

    expect(existsSync(join(server.contentDir, 'sso.md'))).toBe(true);
    expect(existsSync(join(server.contentDir, 'auth.md'))).toBe(false);
    const indexBody = readFileSync(join(server.contentDir, 'index.md'), 'utf-8');
    expect(indexBody).toContain('[[sso]]');
    expect(indexBody).not.toContain('[[auth]]');
  }, 60_000);
});
