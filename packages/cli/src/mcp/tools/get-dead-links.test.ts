import { describe, expect, test } from 'bun:test';
import { DESCRIPTION, register } from './get-dead-links.ts';
import type { ServerInstance } from './shared.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, textResult } from './shared.ts';

type ToolHandler = (args: { sourceDocNames?: string[] }) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}>;

describe('find_dead_links MCP tool', () => {
  test('registers the tool and forwards repeated sourceDocName query params', async () => {
    const requests: string[] = [];
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        requests.push(`${url.pathname}?${url.searchParams.toString()}`);
        if (url.pathname !== '/api/dead-links') {
          return new Response('not found', { status: 404 });
        }
        return Response.json({
          ok: true,
          deadLinks: [
            {
              target: 'missing-target',
              sources: [{ source: 'alpha', title: 'Alpha', snippet: 'See missing-target.' }],
            },
          ],
        });
      },
    });

    const registrations: Array<{ name: string; handler: ToolHandler }> = [];
    const fakeServer = {
      tool(name: string, _description: string, _schema: unknown, handler: ToolHandler) {
        registrations.push({ name, handler });
      },
    } as unknown as ServerInstance;

    try {
      register(fakeServer, `http://localhost:${server.port}`);

      expect(DESCRIPTION).toContain('missing internal page targets');
      expect(registrations.map((entry) => entry.name)).toEqual(['find_dead_links']);

      const handler = registrations[0]?.handler;
      expect(handler).toBeDefined();
      if (!handler) throw new Error('Missing tool handler');

      const result = await handler({ sourceDocNames: ['alpha', 'beta'] });
      expect(requests).toEqual(['/api/dead-links?sourceDocName=alpha&sourceDocName=beta']);
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                deadLinks: [
                  {
                    target: 'missing-target',
                    sources: [
                      {
                        source: 'alpha',
                        title: 'Alpha',
                        snippet: 'See missing-target.',
                      },
                    ],
                  },
                ],
              },
              null,
              2,
            ),
          },
        ],
      });
    } finally {
      server.stop();
    }
  });

  test('returns the Hocuspocus unavailable error when no server URL is available', async () => {
    const registrations: Array<{ name: string; handler: ToolHandler }> = [];
    const fakeServer = {
      tool(name: string, _description: string, _schema: unknown, handler: ToolHandler) {
        registrations.push({ name, handler });
      },
    } as unknown as ServerInstance;

    register(fakeServer, undefined);

    expect(registrations.map((entry) => entry.name)).toEqual(['find_dead_links']);
    const handler = registrations[0]?.handler;
    expect(handler).toBeDefined();
    if (!handler) throw new Error('Missing tool handler');

    const result = await handler({});
    expect(result).toEqual(textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true));
  });
});
