import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Config } from '@inkeep/open-knowledge-server';
import { register } from './list-documents.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = {
  content: { dir: '.', include: ['**/*.md', '**/*.mdx'], exclude: [] },
  server: { port: 3000, host: 'localhost', openOnAgentEdit: false },
  persistence: { debounceMs: 2000, maxDebounceMs: 10000 },
  mcp: {
    tools: {
      read_document: { historyDepth: 5 },
      search: { maxResults: 50 },
    },
  },
};

type ToolHandler = (args: { dir?: string }) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}>;

let testServer: ReturnType<typeof Bun.serve>;
let baseUrl: string;
let tmpDir: string;
let originalEnv: string | undefined;

beforeAll(() => {
  testServer = Bun.serve({
    port: 0,
    fetch() {
      return Response.json({
        ok: true,
        documents: [
          { docName: 'alpha', size: 10, modified: '2026-01-01', isSymlink: false },
          { docName: 'notes/beta', size: 20, modified: '2026-01-02', isSymlink: false },
        ],
      });
    },
  });
  baseUrl = `http://localhost:${testServer.port}`;
});

afterAll(() => {
  testServer.stop();
});

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-list-docs-test-'));
  originalEnv = process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
  delete process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
});

afterEach(async () => {
  if (originalEnv === undefined) {
    delete process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
  } else {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = originalEnv;
  }
  await rm(tmpDir, { recursive: true, force: true });
});

function registerTool(serverUrl: string | undefined): ToolHandler {
  let captured: ToolHandler | null = null;
  const server = {
    tool(_name: string, _description: string, _schema: unknown, handler: ToolHandler) {
      captured = handler;
    },
  } as unknown as ServerInstance;

  register(server, {
    serverUrl,
    config: BASE_CONFIG,
    resolveCwd: async () => tmpDir,
  });
  if (!captured) throw new Error('tool not registered');
  return captured;
}

describe('list_documents — previewUrl + ui block', () => {
  test('each row includes previewUrl + previewUrlSource when resolver resolves', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    const handler = registerTool(baseUrl);
    const result = await handler({});
    const s = result.structuredContent as {
      documents: Array<{ docName: string; previewUrl: string; previewUrlSource: string }>;
      ui: { baseUrl: string | null; port: number | null };
    };
    expect(s.documents).toHaveLength(2);
    expect(s.documents[0]?.previewUrl).toBe('https://env.example/#/alpha');
    expect(s.documents[0]?.previewUrlSource).toBe('env');
    expect(s.documents[1]?.previewUrl).toBe('https://env.example/#/notes/beta');
    expect(s.ui).toEqual({ baseUrl: null, port: null });
  });

  test('previewUrl null when resolver returns null', async () => {
    const handler = registerTool(baseUrl);
    const result = await handler({});
    const s = result.structuredContent as {
      documents: Array<{ docName: string; previewUrl: string | null }>;
      ui: { baseUrl: string | null; port: number | null };
    };
    expect(s.documents[0]?.previewUrl).toBeNull();
    expect(s.ui.baseUrl).toBeNull();
  });
});
