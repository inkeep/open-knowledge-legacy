import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Config } from '../../config/schema.ts';
import { DESCRIPTION, register } from './get-dead-links.ts';
import type { ServerInstance } from './shared.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, textResult } from './shared.ts';

const BASE_CONFIG: Config = {
  content: { dir: '.', include: ['**/*.md', '**/*.mdx'], exclude: [] },
  server: { host: 'localhost', openOnAgentEdit: false },
  mcp: {
    tools: {
      read_document: { historyDepth: 5 },
      search: { maxResults: 50 },
    },
  },
};

type ToolHandler = (args: { sourceDocNames?: string[] }) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}>;

let tmpDir: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-dead-links-test-'));
  originalEnv = process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
  delete process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
});

afterEach(async () => {
  if (originalEnv === undefined) {
    delete process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
  } else {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = originalEnv;
  }
  await rm(tmpDir, { recursive: true, force: true });
});

function makeDeps(serverUrl: string | undefined) {
  return {
    serverUrl,
    config: BASE_CONFIG,
    resolveCwd: async () => tmpDir,
  };
}

describe('get_dead_links MCP tool', () => {
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
      register(fakeServer, makeDeps(`http://localhost:${server.port}`));

      expect(DESCRIPTION).toContain('missing internal page targets');
      expect(registrations.map((entry) => entry.name)).toEqual(['get_dead_links']);

      const handler = registrations[0]?.handler;
      expect(handler).toBeDefined();
      if (!handler) throw new Error('Missing tool handler');

      const result = await handler({ sourceDocNames: ['alpha.md', 'beta'] });
      expect(requests).toEqual(['/api/dead-links?sourceDocName=alpha&sourceDocName=beta']);
      // text is the JSON pretty-printed structured content
      expect(result.content[0]?.text).toContain('missing-target');
      expect(result.structuredContent).toBeDefined();
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

    register(fakeServer, makeDeps(undefined));

    expect(registrations.map((entry) => entry.name)).toEqual(['get_dead_links']);
    const handler = registrations[0]?.handler;
    expect(handler).toBeDefined();
    if (!handler) throw new Error('Missing tool handler');

    const result = await handler({});
    expect(result).toEqual(textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true));
  });

  test('each target + source row includes previewUrl + previewUrlSource when resolver resolves', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    const server = Bun.serve({
      port: 0,
      fetch() {
        return Response.json({
          ok: true,
          deadLinks: [
            {
              target: 'missing-target',
              sources: [{ source: 'alpha', title: 'Alpha', snippet: 's' }],
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
      register(fakeServer, makeDeps(`http://localhost:${server.port}`));
      const handler = registrations[0]?.handler;
      if (!handler) throw new Error('Missing tool handler');

      const result = await handler({});
      const s = result.structuredContent as {
        deadLinks: Array<{
          target: string;
          previewUrl: string;
          previewUrlSource: string;
          sources: Array<{ source: string; previewUrl: string; previewUrlSource: string }>;
        }>;
        ui: { baseUrl: string | null; port: number | null };
      };
      expect(s.deadLinks[0]?.previewUrl).toBe('https://env.example/#/missing-target');
      expect(s.deadLinks[0]?.previewUrlSource).toBe('env');
      expect(s.deadLinks[0]?.sources[0]?.previewUrl).toBe('https://env.example/#/alpha');
      expect(s.deadLinks[0]?.sources[0]?.previewUrlSource).toBe('env');
      expect(s.ui).toEqual({ baseUrl: null, port: null });
    } finally {
      server.stop();
    }
  });

  test('per-row previewUrl is null when resolver returns null', async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return Response.json({
          ok: true,
          deadLinks: [{ target: 'missing-target', sources: [{ source: 'alpha' }] }],
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
      register(fakeServer, makeDeps(`http://localhost:${server.port}`));
      const handler = registrations[0]?.handler;
      if (!handler) throw new Error('Missing tool handler');

      const result = await handler({});
      const s = result.structuredContent as {
        deadLinks: Array<{
          target: string;
          previewUrl: string | null;
          sources: Array<{ source: string; previewUrl: string | null }>;
        }>;
        ui: { baseUrl: string | null; port: number | null };
      };
      expect(s.deadLinks[0]?.previewUrl).toBeNull();
      expect(s.deadLinks[0]?.sources[0]?.previewUrl).toBeNull();
      expect(s.ui.baseUrl).toBeNull();
    } finally {
      server.stop();
    }
  });
});
