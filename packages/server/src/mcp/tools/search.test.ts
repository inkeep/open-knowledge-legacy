import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { DESCRIPTION, register } from './search.ts';
import type { ServerInstance } from './shared.ts';

const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

interface RegisteredTool {
  name: string;
  options: {
    description: string;
    inputSchema: Record<string, unknown>;
    annotations?: Record<string, unknown>;
  };
  handler: (args: Record<string, unknown>) => Promise<{
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  }>;
}

function makeFakeServer(): {
  server: ServerInstance;
  registered: RegisteredTool[];
} {
  const registered: RegisteredTool[] = [];
  const server = {
    registerTool: (
      name: string,
      options: RegisteredTool['options'],
      handler: RegisteredTool['handler'],
    ) => {
      registered.push({ name, options, handler });
    },
  } as unknown as ServerInstance;
  return { server, registered };
}

function expectOneRegisteredTool(registered: RegisteredTool[]): RegisteredTool {
  expect(registered).toHaveLength(1);
  const tool = registered[0];
  if (!tool) throw new Error('expected one registered tool');
  return tool;
}

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetchOk(payload: Record<string, unknown>): void {
  globalThis.fetch = mock(async (_url: string, _init?: RequestInit) => {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function mockFetchProblem(
  status: number,
  payload: { type: string; title: string; detail?: string; instance?: string },
): void {
  globalThis.fetch = mock(async (_url: string, _init?: RequestInit) => {
    return new Response(JSON.stringify({ ...payload, status }), {
      status,
      headers: { 'content-type': 'application/problem+json' },
    });
  }) as unknown as typeof fetch;
}

describe('search MCP tool — registration', () => {
  test('registers under the name "search" with read-only annotations', () => {
    const { server, registered } = makeFakeServer();
    register(server, {
      resolveCwd: async () => '/tmp/proj',
      config: DEFAULT_CONFIG,
      serverUrl: 'http://localhost:1234',
    });
    const tool = expectOneRegisteredTool(registered);
    expect(tool.name).toBe('search');
    expect(tool.options.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  test('description sibling-pointer for grep lands in the first 200 characters (FR6)', () => {
    expect(DESCRIPTION.slice(0, 200)).toContain('grep');
  });

  test('inputSchema exposes query, intent, scopes, limit, cwd', () => {
    const { server, registered } = makeFakeServer();
    register(server, {
      resolveCwd: async () => '/tmp/proj',
      config: DEFAULT_CONFIG,
      serverUrl: 'http://localhost:1234',
    });
    const tool = expectOneRegisteredTool(registered);
    expect(Object.keys(tool.options.inputSchema).sort()).toEqual([
      'cwd',
      'intent',
      'limit',
      'query',
      'scopes',
    ]);
  });
});

describe('search MCP tool — happy path', () => {
  test('forwards query / intent / scopes / limit to POST /api/search and normalizes the response', async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      captured.url = String(url);
      captured.init = init;
      return new Response(
        JSON.stringify({
          ok: true,
          query: 'agent presence',
          intent: 'full_text',
          results: [
            {
              kind: 'page',
              path: 'specs/agent-presence/SPEC',
              title: 'Agent Presence',
              score: 723.5,
              signals: { lexical: 700, fullText: 1.2, recency: 23.5 },
              snippet: 'agent presence lives on __system__ awareness…',
            },
            {
              kind: 'folder',
              path: 'specs/agent-presence',
              title: 'agent-presence',
              score: 550,
              signals: { lexical: 550, fullText: 0, recency: 0 },
            },
          ],
          elapsedMs: 4.2,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const { server, registered } = makeFakeServer();
    register(server, {
      resolveCwd: async () => '/tmp/proj',
      config: DEFAULT_CONFIG,
      serverUrl: 'http://localhost:1234',
    });
    const tool = expectOneRegisteredTool(registered);
    const result = await tool.handler({
      query: 'agent presence',
      intent: 'full_text',
      scopes: ['page', 'content'],
      limit: 5,
      cwd: '/tmp/proj',
    });

    expect(result.isError ?? false).toBe(false);
    expect(captured.url).toBe('http://localhost:1234/api/search');
    expect(captured.init?.method).toBe('POST');
    const body = JSON.parse(String(captured.init?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      query: 'agent presence',
      intent: 'full_text',
      limit: 5,
      scopes: ['page', 'content'],
    });

    const structured = result.structuredContent as {
      query: string;
      intent: string;
      resultCount: number;
      results: Array<{
        kind: string;
        path: string;
        docName: string;
        title: string | null;
        score: number;
        signals: { lexical: number; fullText: number; recency: number };
        snippet?: string;
      }>;
    };
    expect(structured.query).toBe('agent presence');
    expect(structured.intent).toBe('full_text');
    expect(structured.resultCount).toBe(2);
    expect(structured.results[0]?.kind).toBe('page');
    expect(structured.results[0]?.path).toBe('specs/agent-presence/SPEC');
    expect(structured.results[0]?.docName).toBe('specs/agent-presence/SPEC');
    expect(structured.results[0]?.title).toBe('Agent Presence');
    expect(structured.results[0]?.snippet).toContain('agent presence');
    expect(structured.results[0]?.signals).toEqual({
      lexical: 700,
      fullText: 1.2,
      recency: 23.5,
    });
  });

  test("default intent is 'full_text' when caller omits it (D4)", async () => {
    const captured: { body?: string } = {};
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      captured.body = String(init?.body);
      return new Response(JSON.stringify({ ok: true, results: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const { server, registered } = makeFakeServer();
    register(server, {
      resolveCwd: async () => '/tmp/proj',
      config: DEFAULT_CONFIG,
      serverUrl: 'http://localhost:1234',
    });
    const tool = expectOneRegisteredTool(registered);
    await tool.handler({ query: 'q', cwd: '/tmp/proj' });
    const body = JSON.parse(String(captured.body)) as Record<string, unknown>;
    expect(body.intent).toBe('full_text');
    expect(body.limit).toBe(20);
  });

  test('zero results returns "No matches" text + structured.resultCount = 0', async () => {
    mockFetchOk({ ok: true, query: 'nope', intent: 'full_text', results: [], elapsedMs: 0.1 });
    const { server, registered } = makeFakeServer();
    register(server, {
      resolveCwd: async () => '/tmp/proj',
      config: DEFAULT_CONFIG,
      serverUrl: 'http://localhost:1234',
    });
    const tool = expectOneRegisteredTool(registered);
    const result = await tool.handler({ query: 'nope', cwd: '/tmp/proj' });
    const text = result.content?.find((c) => c.type === 'text')?.text ?? '';
    expect(text).toContain('No matches');
    const structured = result.structuredContent as { resultCount: number };
    expect(structured.resultCount).toBe(0);
  });
});

describe('search MCP tool — error paths', () => {
  test('server-not-running returns HOCUSPOCUS_NOT_RUNNING_ERROR + grep fallback hint (FR7, AC4)', async () => {
    const { server, registered } = makeFakeServer();
    register(server, {
      resolveCwd: async () => '/tmp/proj',
      config: DEFAULT_CONFIG,
      serverUrl: undefined,
    });
    const tool = expectOneRegisteredTool(registered);
    const result = await tool.handler({ query: 'q', cwd: '/tmp/proj' });
    expect(result.isError).toBe(true);
    const text = result.content?.find((c) => c.type === 'text')?.text ?? '';
    expect(text).toContain('Hocuspocus server is not running');
    expect(text).toContain('open-knowledge start');
    expect(text).toContain('grep');
  });

  test('server returns RFC 9457 problem+json → tool reports error', async () => {
    mockFetchProblem(400, {
      type: 'urn:ok:error:invalid-request',
      title: 'Query is too long',
    });
    const { server, registered } = makeFakeServer();
    register(server, {
      resolveCwd: async () => '/tmp/proj',
      config: DEFAULT_CONFIG,
      serverUrl: 'http://localhost:1234',
    });
    const tool = expectOneRegisteredTool(registered);
    const result = await tool.handler({ query: 'q', cwd: '/tmp/proj' });
    expect(result.isError).toBe(true);
    const text = result.content?.find((c) => c.type === 'text')?.text ?? '';
    expect(text).toContain('Query is too long');
  });
});
