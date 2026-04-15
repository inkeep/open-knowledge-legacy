import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { DESCRIPTION, register } from './get-orphans.ts';
import type { ServerInstance } from './shared.ts';

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

interface RegisteredTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (args: { mode?: 'incoming' | 'outgoing' | 'both' }) => Promise<ToolResult>;
}

let testServer: ReturnType<typeof Bun.serve>;
let baseUrl: string;

beforeAll(() => {
  testServer = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/api/orphans') {
        return Response.json({
          ok: true,
          receivedMode: url.searchParams.get('mode'),
          hadMode: url.searchParams.has('mode'),
        });
      }
      return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
    },
  });
  baseUrl = `http://localhost:${testServer.port}`;
});

afterAll(() => {
  testServer.stop();
});

function registerTool(serverUrl: string | undefined): RegisteredTool {
  let captured: RegisteredTool | null = null;
  const server = {
    tool(
      name: string,
      description: string,
      schema: Record<string, unknown>,
      handler: RegisteredTool['handler'],
    ) {
      captured = { name, description, schema, handler };
    },
  } as unknown as ServerInstance;

  register(server, serverUrl);
  expect(captured).toBeTruthy();
  return captured as RegisteredTool;
}

describe('get_orphans tool', () => {
  test('description advertises mode-based graph semantics', () => {
    expect(DESCRIPTION).toContain('disconnected pages in the knowledge graph');
    expect(DESCRIPTION).toContain('incoming');
    expect(DESCRIPTION).toContain('outgoing');
    expect(DESCRIPTION).toContain('both');
    expect(DESCRIPTION).not.toContain('no incoming wiki-links');
  });

  test('passes the optional mode through to the API and omits it by default', async () => {
    const tool = registerTool(baseUrl);

    const defaultResult = await tool.handler({});
    expect(JSON.parse(defaultResult.content[0]?.text ?? '')).toEqual({
      receivedMode: null,
      hadMode: false,
    });

    const incomingResult = await tool.handler({ mode: 'incoming' });
    expect(JSON.parse(incomingResult.content[0]?.text ?? '')).toEqual({
      receivedMode: 'incoming',
      hadMode: true,
    });
  });
});
