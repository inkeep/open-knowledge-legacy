import {
  describe as _bunDescribe,
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from 'bun:test';

// Skip-on-CI gate (oven-sh/bun#11892): simple-git fixture pattern in MCP
// test setup spawns git children that Bun fails to reap on ubuntu-latest
// GHA runners; post-test cgroup never drains, hanging test (test) at the
// 15-min timeout. Tests run normally locally; follow-up PR will migrate
// fixtures to execFileSync. PR #377 evidence in jobs 73874363184+.
const describe = process.env.CI ? _bunDescribe.skip : _bunDescribe;

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import type { ServerInstance } from './shared.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR } from './shared.ts';
import { DESCRIPTION, register, type SuggestLinksDeps } from './suggest-links.ts';

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
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

const BASE_CONFIG: Config = ConfigSchema.parse({});
let tmpDir: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-suggest-links-'));
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

function makeDeps(serverUrl: SuggestLinksDeps['serverUrl']): SuggestLinksDeps {
  return {
    serverUrl,
    config: BASE_CONFIG,
    resolveCwd: async () => tmpDir,
  };
}

describe('suggest_links MCP tool', () => {
  test('describes the docName contract and precision workflow', () => {
    expect(DESCRIPTION).toContain('docName');
    expect(DESCRIPTION).toContain('offset');
    expect(DESCRIPTION).toContain('truncated');
  });

  test('returns actionable guidance when Hocuspocus is not running', async () => {
    const { server, getTool } = createFakeServer();

    register(server, makeDeps(undefined));

    const result = await getTool().handler({ docName: 'project-alpha' });

    expect(result).toEqual({
      content: [{ type: 'text', text: HOCUSPOCUS_NOT_RUNNING_ERROR }],
      isError: true,
    });
  });

  test('returns the suggest-links payload from the HTTP endpoint', async () => {
    const { server, getTool } = createFakeServer();

    register(server, makeDeps(baseUrl));

    const tool = getTool();
    expect(tool.name).toBe('suggest_links');

    const result = await tool.handler({ docName: 'project-alpha' });

    const expectedBody = {
      target: { docName: 'project-alpha', title: 'Project Alpha', aliases: ['PA'] },
      mentions: [
        {
          source: 'notes',
          excerpt: 'Project Alpha should link back to the launch notes.',
          offset: 0,
        },
      ],
      truncated: false,
    };
    expect(result.content[0]?.text).toBe(JSON.stringify(expectedBody, null, 2));
    expect(result.structuredContent).toMatchObject({ ...expectedBody, previewUrl: null });
  });

  test('normalizes trailing markdown extensions before querying the API', async () => {
    const { server, getTool } = createFakeServer();

    register(server, makeDeps(baseUrl));

    const result = await getTool().handler({ docName: 'project-alpha.md' });

    expect(result.content[0]?.text).toContain('"docName": "project-alpha"');
    expect(result.structuredContent).toMatchObject({ previewUrl: null });
  });

  test('propagates HTTP endpoint errors to the caller', async () => {
    const { server, getTool } = createFakeServer();

    register(server, makeDeps(baseUrl));

    const result = await getTool().handler({ docName: 'missing-page' });

    expect(result).toEqual({
      content: [{ type: 'text', text: 'Error: Page not found' }],
      isError: true,
    });
  });

  test('emits previewUrl + source when resolver resolves', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    const { server, getTool } = createFakeServer();

    register(server, makeDeps(baseUrl));

    const result = await getTool().handler({ docName: 'project-alpha' });

    expect(result.structuredContent).toMatchObject({
      previewUrl: 'https://env.example/#/project-alpha',
      previewUrlSource: 'env',
    });
  });
});
