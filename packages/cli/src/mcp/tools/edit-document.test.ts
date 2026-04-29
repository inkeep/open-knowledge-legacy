import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Config } from '@inkeep/open-knowledge-server';
import { DESCRIPTION, register } from './edit-document.ts';
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

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: true;
}

interface RegisteredTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (args: {
    docName: string;
    find: string;
    replace: string;
    offset?: number;
  }) => Promise<ToolResult>;
}

function createFakeServer() {
  let registeredTool: RegisteredTool | undefined;

  const server = {
    tool(
      name: string,
      description: string,
      schema: Record<string, unknown>,
      handler: RegisteredTool['handler'],
    ) {
      registeredTool = { name, description, schema, handler };
    },
  } as unknown as ServerInstance;

  return {
    server,
    getTool(): RegisteredTool {
      if (!registeredTool) throw new Error('Tool was not registered');
      return registeredTool;
    },
  };
}

let testServer: ReturnType<typeof Bun.serve>;
let baseUrl: string;
const requestBodies: unknown[] = [];
let mockSubscriberCount: number | undefined = 1;
let mockSystemSubscriberCount: number | undefined = 1;

beforeAll(() => {
  testServer = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === '/api/agent-patch') {
        const body = await req.json();
        requestBodies.push(body);

        if ((body as { offset?: number }).offset === 13) {
          return Response.json(
            { ok: false, error: 'Target text no longer matches at the requested offset' },
            { status: 409 },
          );
        }

        return Response.json({
          ok: true,
          timestamp: '2026-04-14T22:00:00.000Z',
          ...(mockSubscriberCount !== undefined ? { subscriberCount: mockSubscriberCount } : {}),
          ...(mockSystemSubscriberCount !== undefined
            ? { systemSubscriberCount: mockSystemSubscriberCount }
            : {}),
        });
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
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-edit-doc-'));
  originalEnv = process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
  delete process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
  mockSubscriberCount = 1;
  mockSystemSubscriberCount = 1;
});

afterEach(async () => {
  if (originalEnv === undefined) {
    delete process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
  } else {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = originalEnv;
  }
  await rm(tmpDir, { recursive: true, force: true });
});

function makeDeps(overrides: Partial<Config> = {}) {
  const config: Config = { ...BASE_CONFIG, ...overrides };
  return {
    serverUrl: baseUrl,
    config,
    resolveCwd: async () => tmpDir,
  };
}

describe('edit_document MCP tool', () => {
  test('describes the optional offset precision contract', () => {
    expect(DESCRIPTION).toContain('offset');
    expect(DESCRIPTION).toContain('exact occurrence');
    expect(DESCRIPTION).toContain('suggest_links');
  });

  test('sends offset to the agent-patch endpoint when provided', async () => {
    const { server, getTool } = createFakeServer();

    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'notes',
      find: 'Project Alpha',
      replace: '[[Project Alpha]]',
      offset: 42,
    });

    expect(requestBodies.at(-1)).toEqual({
      docName: 'notes',
      find: 'Project Alpha',
      replace: '[[Project Alpha]]',
      offset: 42,
    });
    expect(result.content[0]?.text).toBe('Edit applied successfully.');
  });

  test('omits offset when the caller uses first-match mode', async () => {
    const { server, getTool } = createFakeServer();

    register(server, makeDeps());

    await getTool().handler({
      docName: 'notes',
      find: 'Project Alpha',
      replace: '[[Project Alpha]]',
    });

    expect(requestBodies.at(-1)).toEqual({
      docName: 'notes',
      find: 'Project Alpha',
      replace: '[[Project Alpha]]',
    });
  });

  test('propagates stale-target errors from the server', async () => {
    const { server, getTool } = createFakeServer();

    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'notes',
      find: 'Project Alpha',
      replace: '[[Project Alpha]]',
      offset: 13,
    });

    expect(result).toEqual({
      content: [
        { type: 'text', text: 'Error: Target text no longer matches at the requested offset' },
      ],
      isError: true,
    });
  });

  test('includes previewUrl + source in structuredContent when resolver resolves', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    const { server, getTool } = createFakeServer();

    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'notes',
      find: 'Project Alpha',
      replace: '[[Project Alpha]]',
    });

    expect(result.structuredContent).toEqual({
      previewUrl: 'https://env.example/#/notes',
      previewUrlSource: 'env',
    });
    expect(result.content[0]?.text).toContain('Preview: https://env.example/#/notes');
  });

  test('omits structuredContent when resolver returns null AND subscribers>0', async () => {
    const { server, getTool } = createFakeServer();

    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'notes',
      find: 'Project Alpha',
      replace: '[[Project Alpha]]',
    });

    expect(result.structuredContent).toBeUndefined();
    expect(result.content[0]?.text).toBe('Edit applied successfully.');
  });

  test('emits attach-preview-once hint with previewUrl when systemSubscriberCount=0', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    mockSubscriberCount = 0;
    mockSystemSubscriberCount = 0;
    const { server, getTool } = createFakeServer();

    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'notes',
      find: 'Project Alpha',
      replace: '[[Project Alpha]]',
    });

    expect(result.structuredContent).toMatchObject({
      previewUrl: 'https://env.example/#/notes',
      previewUrlSource: 'env',
      warning: {
        action: 'attach-preview-once',
        message: 'Open the previewUrl in your preview browser.',
        previewUrl: 'https://env.example/#/notes',
      },
    });
    expect(result.content[0]?.text).toContain(
      'Open https://env.example/#/notes in your preview browser.',
    );
  });

  test('emits attach-preview-once hint with null previewUrl when systemSubscriberCount=0 and no resolver source', async () => {
    mockSubscriberCount = 0;
    mockSystemSubscriberCount = 0;
    const { server, getTool } = createFakeServer();

    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'notes',
      find: 'Project Alpha',
      replace: '[[Project Alpha]]',
    });

    expect(result.structuredContent).toMatchObject({
      warning: {
        action: 'attach-preview-once',
        message: 'Open the previewUrl in your preview browser.',
        previewUrl: null,
      },
    });
    expect(result.structuredContent?.previewUrl).toBeUndefined();
  });

  test('no hint when systemSubscriberCount>0 even if per-doc subscriberCount=0 (second doc, server-push follows)', async () => {
    mockSubscriberCount = 0;
    mockSystemSubscriberCount = 1;
    const { server, getTool } = createFakeServer();

    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'notes',
      find: 'Project Alpha',
      replace: '[[Project Alpha]]',
    });

    expect(result.structuredContent?.warning).toBeUndefined();
    expect(result.content[0]?.text).not.toContain('No preview attached');
  });

  test('no warning emitted when server omits systemSubscriberCount field (legacy server)', async () => {
    mockSubscriberCount = undefined;
    mockSystemSubscriberCount = undefined;
    const { server, getTool } = createFakeServer();

    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'notes',
      find: 'Project Alpha',
      replace: '[[Project Alpha]]',
    });

    expect(result.structuredContent).toBeUndefined();
    expect(result.content[0]?.text).toBe('Edit applied successfully.');
  });
});
