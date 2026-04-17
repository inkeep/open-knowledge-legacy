import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { type GetHistoryDeps, register } from './get-history.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: true;
}

interface RegisteredTool {
  handler: (args: { docName: string }) => Promise<ToolResult>;
}

function createFakeServer() {
  let captured: RegisteredTool | undefined;
  const server = {
    tool(
      _name: string,
      _description: string,
      _schema: Record<string, unknown>,
      handler: RegisteredTool['handler'],
    ) {
      captured = { handler };
    },
  } as unknown as ServerInstance;
  return {
    server,
    getTool(): RegisteredTool {
      if (!captured) throw new Error('Tool was not registered');
      return captured;
    },
  };
}

let testServer: ReturnType<typeof Bun.serve>;
let baseUrl: string;

beforeAll(() => {
  testServer = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/api/history') {
        return Response.json({ ok: true, entries: [{ hash: 'abc', date: '2026-04-01' }] });
      }
      return new Response('Not found', { status: 404 });
    },
  });
  baseUrl = `http://localhost:${testServer.port}`;
});

afterAll(() => {
  testServer.stop();
});

let tmpDir: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-get-history-'));
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

function makeDeps(): GetHistoryDeps {
  return {
    serverUrl: baseUrl,
    config: BASE_CONFIG,
    resolveCwd: async () => tmpDir,
  };
}

describe('get_history — previewUrl emission', () => {
  test('emits previewUrl + source alongside entries when resolver resolves', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({ docName: 'notes' });

    expect(result.structuredContent).toMatchObject({
      entries: [{ hash: 'abc', date: '2026-04-01' }],
      previewUrl: 'https://env.example/#/notes',
      previewUrlSource: 'env',
    });
  });

  test('emits previewUrl null when resolver returns null', async () => {
    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({ docName: 'notes' });

    expect(result.structuredContent).toMatchObject({
      entries: [{ hash: 'abc', date: '2026-04-01' }],
      previewUrl: null,
    });
  });
});
