import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ConfigSchema } from '../../config/schema.ts';
import { register } from './save-version.ts';
import type { ServerInstance } from './shared.ts';

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: true;
}

interface RegisteredTool {
  handler: (args: { cwd?: string }) => Promise<ToolResult>;
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
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/api/save-version') {
        await req.json();
        return Response.json({ ok: true, checkpointRef: 'refs/checkpoints/2026-04-16-abc' });
      }
      return new Response('Not found', { status: 404 });
    },
  });
  baseUrl = `http://localhost:${testServer.port}`;
});

afterAll(() => {
  testServer.stop();
});

describe('save_version — previewUrl emission (workspace-level: always null)', () => {
  test('emits previewUrl: null alongside checkpointRef', async () => {
    const { server, getTool } = createFakeServer();
    register(server, ConfigSchema.parse({}), baseUrl, async () => '/tmp/project');

    const result = await getTool().handler({ cwd: '/tmp/project' });

    expect(result.structuredContent).toEqual({
      checkpointRef: 'refs/checkpoints/2026-04-16-abc',
      previewUrl: null,
    });
    expect(result.content[0]?.text).toContain('Version saved');
  });
});
