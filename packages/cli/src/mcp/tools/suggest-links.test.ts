import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { ServerInstance } from './shared.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR } from './shared.ts';
import { DESCRIPTION, register } from './suggest-links.ts';

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: true;
}

interface RegisteredTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (args: { docName: string }) => Promise<ToolResult>;
}

function createFakeServer() {
  let registeredTool: RegisteredTool | undefined;

  const server = {
    tool(
      name: string,
      description: string,
      schema: Record<string, unknown>,
      handler: (args: { docName: string }) => Promise<ToolResult>,
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

beforeAll(() => {
  testServer = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === '/api/suggest-links') {
        const docName = url.searchParams.get('docName');

        if (docName === 'project-alpha') {
          return Response.json({
            ok: true,
            target: {
              docName: 'project-alpha',
              title: 'Project Alpha',
              aliases: ['PA'],
            },
            mentions: [
              {
                source: 'notes',
                excerpt: 'Project Alpha should link back to the launch notes.',
                offset: 0,
              },
            ],
            truncated: false,
          });
        }

        return Response.json({ ok: false, error: 'Page not found' }, { status: 404 });
      }

      return new Response('Not found', { status: 404 });
    },
  });
  baseUrl = `http://localhost:${testServer.port}`;
});

afterAll(() => {
  testServer.stop();
});

describe('suggest_links MCP tool', () => {
  test('describes the docName contract and precision workflow', () => {
    expect(DESCRIPTION).toContain('docName');
    expect(DESCRIPTION).toContain('offset');
    expect(DESCRIPTION).toContain('truncated');
  });

  test('returns actionable guidance when Hocuspocus is not running', async () => {
    const { server, getTool } = createFakeServer();

    register(server, undefined);

    const result = await getTool().handler({ docName: 'project-alpha' });

    expect(result).toEqual({
      content: [{ type: 'text', text: HOCUSPOCUS_NOT_RUNNING_ERROR }],
      isError: true,
    });
  });

  test('returns the suggest-links payload from the HTTP endpoint', async () => {
    const { server, getTool } = createFakeServer();

    register(server, baseUrl);

    const tool = getTool();
    expect(tool.name).toBe('suggest_links');

    const result = await tool.handler({ docName: 'project-alpha' });

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              target: {
                docName: 'project-alpha',
                title: 'Project Alpha',
                aliases: ['PA'],
              },
              mentions: [
                {
                  source: 'notes',
                  excerpt: 'Project Alpha should link back to the launch notes.',
                  offset: 0,
                },
              ],
              truncated: false,
            },
            null,
            2,
          ),
        },
      ],
    });
  });

  test('normalizes trailing markdown extensions before querying the API', async () => {
    const { server, getTool } = createFakeServer();

    register(server, baseUrl);

    const result = await getTool().handler({ docName: 'project-alpha.md' });

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              target: {
                docName: 'project-alpha',
                title: 'Project Alpha',
                aliases: ['PA'],
              },
              mentions: [
                {
                  source: 'notes',
                  excerpt: 'Project Alpha should link back to the launch notes.',
                  offset: 0,
                },
              ],
              truncated: false,
            },
            null,
            2,
          ),
        },
      ],
    });
  });

  test('propagates HTTP endpoint errors to the caller', async () => {
    const { server, getTool } = createFakeServer();

    register(server, baseUrl);

    const result = await getTool().handler({ docName: 'missing-page' });

    expect(result).toEqual({
      content: [{ type: 'text', text: 'Error: Page not found' }],
      isError: true,
    });
  });
});
