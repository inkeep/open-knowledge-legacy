import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { type RenameFolderDeps, register } from './rename-folder.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, type ServerInstance } from './shared.ts';

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

function getRegisteredTool(registrations: RegisteredTool[], name: string): RegisteredTool {
  const tool = registrations.find((registration) => registration.name === name);
  expect(tool).toBeDefined();
  return tool as RegisteredTool;
}

const originalFetch = globalThis.fetch;
let tmpDir: string;
let originalEnv: string | undefined;

const BASE_CONFIG: Config = ConfigSchema.parse({});

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-rename-folder-'));
  originalEnv = process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
  delete process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  if (originalEnv === undefined) {
    delete process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
  } else {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = originalEnv;
  }
  await rm(tmpDir, { recursive: true, force: true });
});

function makeDeps(serverUrl: RenameFolderDeps['serverUrl']): RenameFolderDeps {
  return {
    serverUrl,
    config: BASE_CONFIG,
    resolveCwd: async () => tmpDir,
  };
}

describe('rename_folder MCP tool', () => {
  test('posts to /api/rename-path with kind:folder body', async () => {
    const { server, registrations } = createCapturingServer();
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

    globalThis.fetch = (async (input, init) => {
      fetchCalls.push({ input, init });
      return new Response(
        JSON.stringify({
          ok: true,
          renamed: [
            { fromDocName: 'articles/auth', toDocName: 'essays/auth' },
            { fromDocName: 'articles/login', toDocName: 'essays/login' },
          ],
          rewrittenDocs: [{ docName: 'index', rewrites: 2 }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_folder');

    const result = await tool.handler({ fromFolder: 'articles', toFolder: 'essays' });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.input).toBe('http://localhost:4321/api/rename-path');
    expect(JSON.parse(String(fetchCalls[0]?.init?.body))).toEqual({
      kind: 'folder',
      fromPath: 'articles',
      toPath: 'essays',
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('Renamed folder articles/ → essays/');
    expect(result.content[0]?.text).toContain('2 docs');
    expect(result.content[0]?.text).toContain('1 rewrite');
  });

  test('threads agent identity into the request body', async () => {
    const { server, registrations } = createCapturingServer();
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

    globalThis.fetch = (async (input, init) => {
      fetchCalls.push({ input, init });
      return new Response(JSON.stringify({ ok: true, renamed: [], rewrittenDocs: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const deps: RenameFolderDeps = {
      ...makeDeps('http://localhost:4321'),
      identityRef: {
        current: {
          connectionId: 'claude-1',
          displayName: 'Claude',
          colorSeed: 'team-purple',
          clientInfo: { name: 'claude-code', version: '1.0.0' },
        },
      },
    };
    register(server, deps);
    const tool = getRegisteredTool(registrations, 'rename_folder');

    await tool.handler({
      fromFolder: 'articles',
      toFolder: 'essays',
      summary: 'Reorganizing taxonomy',
    });

    const body = JSON.parse(String(fetchCalls[0]?.init?.body));
    expect(body.kind).toBe('folder');
    expect(body.fromPath).toBe('articles');
    expect(body.toPath).toBe('essays');
    expect(body.summary).toBe('Reorganizing taxonomy');
    expect(body.agentId).toBe('claude-1');
    expect(body.agentName).toBe('Claude');
    expect(body.clientName).toBe('claude-code');
    expect(body.colorSeed).toBe('team-purple');
  });

  test('rejects fromFolder with leading slash', async () => {
    const { server, registrations } = createCapturingServer();
    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_folder');

    const result = await tool.handler({ fromFolder: '/articles', toFolder: 'essays' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('fromFolder must be');
  });

  test('rejects toFolder with trailing slash', async () => {
    const { server, registrations } = createCapturingServer();
    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_folder');

    const result = await tool.handler({ fromFolder: 'articles', toFolder: 'essays/' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('toFolder must be');
  });

  test('rejects path traversal in fromFolder', async () => {
    const { server, registrations } = createCapturingServer();
    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_folder');

    const result = await tool.handler({ fromFolder: '../escape', toFolder: 'safe' });
    expect(result.isError).toBe(true);
  });

  test('returns structured error on 409 collision', async () => {
    const { server, registrations } = createCapturingServer();

    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Managed rename collision: 'a' and 'b' both target 'c'",
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_folder');

    const result = await tool.handler({ fromFolder: 'A', toFolder: 'B' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('collision');
    expect(result.structuredContent?.ok).toBe(false);
  });

  test('returns structured error on 400 case-only rename', async () => {
    const { server, registrations } = createCapturingServer();

    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({ ok: false, error: 'Case-only renames are not supported' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_folder');

    const result = await tool.handler({ fromFolder: 'Articles', toFolder: 'articles' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Case-only');
  });

  test('description references the consolidated endpoint', async () => {
    const { server, registrations } = createCapturingServer();
    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_folder');
    expect(tool.description).toContain('/api/rename-path');
    expect(tool.description).toContain('kind: folder');
  });

  test('structured response includes renamed list and rewrittenDocs', async () => {
    const { server, registrations } = createCapturingServer();

    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          ok: true,
          renamed: [
            { fromDocName: 'a/x', toDocName: 'b/x' },
            { fromDocName: 'a/y', toDocName: 'b/y' },
          ],
          rewrittenDocs: [{ docName: 'index', rewrites: 3 }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_folder');

    const result = await tool.handler({ fromFolder: 'a', toFolder: 'b' });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      renamed: [
        { fromDocName: 'a/x', toDocName: 'b/x' },
        { fromDocName: 'a/y', toDocName: 'b/y' },
      ],
      rewrittenDocs: [{ docName: 'index', rewrites: 3 }],
    });
  });

  test('uses the shared Hocuspocus-not-running error when no server URL is available', async () => {
    const { server, registrations } = createCapturingServer();
    register(server, makeDeps(undefined));
    const tool = getRegisteredTool(registrations, 'rename_folder');

    const result = await tool.handler({ fromFolder: 'articles', toFolder: 'essays' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(HOCUSPOCUS_NOT_RUNNING_ERROR);
  });

  test('rejects empty-string fromFolder', async () => {
    const { server, registrations } = createCapturingServer();
    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_folder');

    const result = await tool.handler({ fromFolder: '', toFolder: 'essays' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('fromFolder must be');
  });

  test('rejects empty-string toFolder', async () => {
    const { server, registrations } = createCapturingServer();
    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_folder');

    const result = await tool.handler({ fromFolder: 'articles', toFolder: '' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('toFolder must be');
  });

  test('emits previewUrls keyed by toDocName for each renamed doc', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    const { server, registrations } = createCapturingServer();

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          renamed: [
            { fromDocName: 'articles/auth', toDocName: 'essays/auth' },
            { fromDocName: 'articles/login', toDocName: 'essays/login' },
          ],
          rewrittenDocs: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_folder');

    const result = await tool.handler({ fromFolder: 'articles', toFolder: 'essays' });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      previewUrls: {
        'essays/auth': 'https://env.example/#/essays/auth',
        'essays/login': 'https://env.example/#/essays/login',
      },
      previewUrlSource: 'env',
    });
  });

  test('empty-folder rename surfaces a clear no-op message', async () => {
    const { server, registrations } = createCapturingServer();

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          renamed: [],
          rewrittenDocs: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_folder');

    const result = await tool.handler({ fromFolder: 'articles', toFolder: 'essays' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('No managed docs under articles/');
    expect(result.content[0]?.text).not.toContain('Renamed folder');
  });

  test('surfaces server colliding[] structured array on 409', async () => {
    const { server, registrations } = createCapturingServer();

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: "Managed rename collision: 'articles/x' and 'notes/x' both target 'essays/x'",
          colliding: [{ existing: 'articles/x', incoming: 'notes/x', to: 'essays/x' }],
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_folder');

    const result = await tool.handler({ fromFolder: 'articles', toFolder: 'essays' });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: false,
      colliding: [{ existing: 'articles/x', incoming: 'notes/x', to: 'essays/x' }],
    });
  });
});
