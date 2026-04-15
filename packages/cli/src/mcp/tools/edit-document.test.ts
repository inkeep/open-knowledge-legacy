import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { DESCRIPTION, register } from './edit-document.ts';
import type { ServerInstance } from './shared.ts';

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
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

        return Response.json({ ok: true, timestamp: '2026-04-14T22:00:00.000Z' });
      }

      return new Response('Not found', { status: 404 });
    },
  });
  baseUrl = `http://localhost:${testServer.port}`;
});

afterAll(() => {
  testServer.stop();
});

describe('edit_document MCP tool', () => {
  test('describes the optional offset precision contract', () => {
    expect(DESCRIPTION).toContain('offset');
    expect(DESCRIPTION).toContain('exact occurrence');
  });

  test('sends offset to the agent-patch endpoint when provided', async () => {
    const { server, getTool } = createFakeServer();

    register(server, baseUrl);

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
    expect(result).toEqual({
      content: [{ type: 'text', text: 'Edit applied successfully' }],
    });
  });

  test('omits offset when the caller uses first-match mode', async () => {
    const { server, getTool } = createFakeServer();

    register(server, baseUrl);

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

    register(server, baseUrl);

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
});
