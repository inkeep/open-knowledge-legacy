import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { type Config, ConfigSchema } from '@inkeep/open-knowledge-server';
import { type RenameDocumentDeps, register } from './rename-document.ts';
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
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-rename-doc-'));
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

function makeDeps(serverUrl: RenameDocumentDeps['serverUrl']): RenameDocumentDeps {
  return {
    serverUrl,
    config: BASE_CONFIG,
    resolveCwd: async () => tmpDir,
  };
}

describe('rename_document MCP tool', () => {
  test('normalizes trailing markdown extensions before calling the API', async () => {
    const { server, registrations } = createCapturingServer();
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

    globalThis.fetch = (async (input, init) => {
      fetchCalls.push({ input, init });
      return new Response(
        JSON.stringify({
          ok: true,
          renamed: [{ fromDocName: 'old-page', toDocName: 'new-page' }],
          rewrittenDocs: [],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_document');

    const result = await tool.handler({ docName: 'old-page.md', newDocName: 'new-page.mdx' });

    expect(fetchCalls).toHaveLength(1);
    expect(JSON.parse(String(fetchCalls[0]?.init?.body))).toEqual({
      docName: 'old-page',
      newDocName: 'new-page',
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('old-page');
    expect(result.content[0]?.text).toContain('new-page');
  });

  test('rejects unsupported markdown extensions before calling the API', async () => {
    const { server, registrations } = createCapturingServer();

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_document');

    const result = await tool.handler({
      docName: 'old-page.markdown',
      newDocName: 'new-page',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('.markdown');
  });

  test('returns renamed mapping and rewritten docs on success', async () => {
    const { server, registrations } = createCapturingServer();
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

    globalThis.fetch = (async (input, init) => {
      fetchCalls.push({ input, init });
      return new Response(
        JSON.stringify({
          ok: true,
          renamed: [{ fromDocName: 'old-page', toDocName: 'new-page' }],
          rewrittenDocs: [{ docName: 'notes/referrer', rewrites: 2 }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_document');

    const result = await tool.handler({ docName: 'old-page', newDocName: 'new-page' });

    expect(tool.description).toContain('/api/rename');
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.input).toBe('http://localhost:4321/api/rename');
    expect(JSON.parse(String(fetchCalls[0]?.init?.body))).toEqual({
      docName: 'old-page',
      newDocName: 'new-page',
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('old-page');
    expect(result.content[0]?.text).toContain('new-page');
    expect(result.structuredContent).toMatchObject({
      ok: true,
      renamed: [{ fromDocName: 'old-page', toDocName: 'new-page' }],
      rewrittenDocs: [{ docName: 'notes/referrer', rewrites: 2 }],
      previewUrl: null,
    });
  });

  test('surfaces API errors such as destination collisions', async () => {
    const { server, registrations } = createCapturingServer();

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: 'Destination already exists',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        },
      )) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_document');

    const result = await tool.handler({ docName: 'old-page', newDocName: 'new-page' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Destination already exists');
    expect(result.structuredContent).toEqual({
      ok: false,
      error: 'Destination already exists',
    });
  });

  test('uses the shared Hocuspocus-not-running error when no server URL is available', async () => {
    const { server, registrations } = createCapturingServer();

    register(server, makeDeps(undefined));
    const tool = getRegisteredTool(registrations, 'rename_document');

    const result = await tool.handler({ docName: 'old-page', newDocName: 'new-page' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(HOCUSPOCUS_NOT_RUNNING_ERROR);
  });

  test('emits previewUrl for NEW docName (and previousPreviewUrl for OLD) on success', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    const { server, registrations } = createCapturingServer();

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          renamed: [{ fromDocName: 'old-page', toDocName: 'new-page' }],
          rewrittenDocs: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_document');

    const result = await tool.handler({ docName: 'old-page', newDocName: 'new-page' });

    expect(result.structuredContent).toMatchObject({
      ok: true,
      previewUrl: 'https://env.example/#/new-page',
      previewUrlSource: 'env',
      previousPreviewUrl: 'https://env.example/#/old-page',
    });
  });

  test('previewUrl is null when resolver returns null', async () => {
    const { server, registrations } = createCapturingServer();

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          renamed: [{ fromDocName: 'old-page', toDocName: 'new-page' }],
          rewrittenDocs: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'rename_document');

    const result = await tool.handler({ docName: 'old-page', newDocName: 'new-page' });

    expect(result.structuredContent).toMatchObject({ ok: true, previewUrl: null });
    expect(result.structuredContent).not.toHaveProperty('previousPreviewUrl');
  });
});
