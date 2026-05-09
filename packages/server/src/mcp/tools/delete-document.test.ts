import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import type { AgentIdentity } from '../agent-identity.ts';
import { type DeleteDocumentDeps, register } from './delete-document.ts';
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
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-delete-doc-'));
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

function makeDeps(serverUrl: DeleteDocumentDeps['serverUrl']): DeleteDocumentDeps {
  return {
    serverUrl,
    config: BASE_CONFIG,
    resolveCwd: async () => tmpDir,
  };
}

describe('delete_document MCP tool', () => {
  test('normalizes trailing markdown extensions before calling the API', async () => {
    const { server, registrations } = createCapturingServer();
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

    globalThis.fetch = (async (input, init) => {
      fetchCalls.push({ input, init });
      return new Response(JSON.stringify({ ok: true, deletedDocNames: ['old-page'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'delete_document');

    const result = await tool.handler({ docName: 'old-page.md' });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.input).toBe('http://localhost:4321/api/delete-path');
    expect(JSON.parse(String(fetchCalls[0]?.init?.body))).toEqual({
      kind: 'file',
      path: 'old-page',
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('old-page');
  });

  test('rejects unsupported markdown extensions before calling the API', async () => {
    const { server, registrations } = createCapturingServer();

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'delete_document');

    const result = await tool.handler({ docName: 'old-page.markdown' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('.markdown');
  });

  test('returns deletedDocNames on success', async () => {
    const { server, registrations } = createCapturingServer();

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, deletedDocNames: ['notes/draft'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'delete_document');

    const result = await tool.handler({ docName: 'notes/draft' });

    expect(tool.description).toContain('/api/delete-path');
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toBe('Deleted notes/draft.');
    expect(result.structuredContent).toEqual({
      ok: true,
      deletedDocNames: ['notes/draft'],
    });
  });

  test('falls back to the requested docName when server returns no deletedDocNames', async () => {
    const { server, registrations } = createCapturingServer();

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'delete_document');

    const result = await tool.handler({ docName: 'old-page' });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      ok: true,
      deletedDocNames: ['old-page'],
    });
  });

  test('surfaces 404 when the document does not exist', async () => {
    const { server, registrations } = createCapturingServer();

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: false, error: 'file does not exist' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'delete_document');

    const result = await tool.handler({ docName: 'missing-page' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('file does not exist');
    expect(result.structuredContent).toEqual({
      ok: false,
      error: 'file does not exist',
    });
  });

  test('forwards identity fields in the POST body when identityRef is provided', async () => {
    const { server, registrations } = createCapturingServer();
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init });
      return new Response(JSON.stringify({ ok: true, deletedDocNames: ['page'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const deps: DeleteDocumentDeps = {
      ...makeDeps('http://localhost:4321'),
      identityRef: {
        current: {
          connectionId: 'conn-1',
          displayName: 'TestAgent',
          clientInfo: { name: 'claude-code', version: '1.0.0' },
          colorSeed: '42',
        } as AgentIdentity,
      },
    };

    register(server, deps);
    const tool = getRegisteredTool(registrations, 'delete_document');

    await tool.handler({ docName: 'page' });

    const body = JSON.parse(String(fetchCalls[0]?.init?.body));
    expect(body).toMatchObject({
      kind: 'file',
      path: 'page',
      agentId: 'conn-1',
      agentName: 'TestAgent',
      clientName: 'claude-code',
      colorSeed: '42',
    });
  });

  test('canonicalizer synthesizes generic HTTP-status `error` when body has neither `error` nor `message`', async () => {
    const { server, registrations } = createCapturingServer();

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: false }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'delete_document');

    const result = await tool.handler({ docName: 'page' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe('Error: Server returned HTTP 500');
    expect(result.structuredContent).toEqual({
      ok: false,
      error: 'Server returned HTTP 500',
    });
  });

  test('uses the shared Hocuspocus-not-running error when no server URL is available', async () => {
    const { server, registrations } = createCapturingServer();

    register(server, makeDeps(undefined));
    const tool = getRegisteredTool(registrations, 'delete_document');

    const result = await tool.handler({ docName: 'old-page' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(HOCUSPOCUS_NOT_RUNNING_ERROR);
  });

  test('emits previousPreviewUrl for the deleted docName when a preview source resolves', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    const { server, registrations } = createCapturingServer();

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, deletedDocNames: ['old-page'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    register(server, makeDeps('http://localhost:4321'));
    const tool = getRegisteredTool(registrations, 'delete_document');

    const result = await tool.handler({ docName: 'old-page' });

    expect(result.structuredContent).toMatchObject({
      ok: true,
      deletedDocNames: ['old-page'],
      previousPreviewUrl: 'https://env.example/#/old-page',
    });
  });
});
