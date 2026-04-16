import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Config } from '../../config/schema.ts';
import { register } from './get-backlinks.ts';
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

type ToolHandler = (args: { docName: string }) => Promise<{
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
        docName: 'target',
        backlinks: [
          { source: 'alpha', anchor: null, title: 'Alpha', snippet: 'links to target' },
          { source: 'beta', anchor: 'section-1', title: 'Beta', snippet: 'see target' },
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
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-backlinks-test-'));
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

function registerTool(): ToolHandler {
  let captured: ToolHandler | null = null;
  const server = {
    tool(_name: string, _description: string, _schema: unknown, handler: ToolHandler) {
      captured = handler;
    },
  } as unknown as ServerInstance;

  register(server, {
    serverUrl: baseUrl,
    config: BASE_CONFIG,
    resolveCwd: async () => tmpDir,
  });
  if (!captured) throw new Error('tool not registered');
  return captured;
}

describe('get_backlinks — previewUrl + ui block', () => {
  test('each row includes previewUrl + previewUrlSource when resolver resolves', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    const handler = registerTool();
    const result = await handler({ docName: 'target' });
    const s = result.structuredContent as {
      backlinks: Array<{ source: string; previewUrl: string; previewUrlSource: string }>;
      ui: { baseUrl: string | null; port: number | null };
    };
    expect(s.backlinks).toHaveLength(2);
    expect(s.backlinks[0]?.previewUrl).toBe('https://env.example/#/alpha');
    expect(s.backlinks[0]?.previewUrlSource).toBe('env');
    expect(s.backlinks[1]?.previewUrl).toBe('https://env.example/#/beta');
    expect(s.ui).toEqual({ baseUrl: null, port: null });
  });

  test('previewUrl null when resolver returns null', async () => {
    const handler = registerTool();
    const result = await handler({ docName: 'target' });
    const s = result.structuredContent as {
      backlinks: Array<{ source: string; previewUrl: string | null }>;
      ui: { baseUrl: string | null; port: number | null };
    };
    expect(s.backlinks[0]?.previewUrl).toBeNull();
    expect(s.ui.baseUrl).toBeNull();
  });
});
