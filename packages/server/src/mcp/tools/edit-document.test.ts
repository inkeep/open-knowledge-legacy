import {
  describe as _bunDescribe,
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from 'bun:test';
import { bindTestUiLock } from './preview-url-test-helpers.ts';

const describe = process.env.CI ? _bunDescribe.skip : _bunDescribe;

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { DESCRIPTION, register } from './edit-document.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
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
    registerTool(
      name: string,
      config: { description?: string; inputSchema?: Record<string, unknown> },
      handler: RegisteredTool['handler'],
    ) {
      registeredTool = {
        name,
        description: config.description ?? '',
        schema: config.inputSchema ?? {},
        handler,
      };
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
let mockSubscriberCount: number | undefined = 1;
let mockSystemSubscriberCount: number | undefined = 1;

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

        return Response.json({
          ok: true,
          timestamp: '2026-04-14T22:00:00.000Z',
          ...(mockSubscriberCount !== undefined ? { subscriberCount: mockSubscriberCount } : {}),
          ...(mockSystemSubscriberCount !== undefined
            ? { systemSubscriberCount: mockSystemSubscriberCount }
            : {}),
        });
      }

      return new Response('Not found', { status: 404 });
    },
  });
  baseUrl = `http://localhost:${testServer.port}`;
});

afterAll(() => {
  testServer.stop();
});

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-edit-doc-'));
  mockSubscriberCount = 1;
  mockSystemSubscriberCount = 1;
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function makeDeps(overrides: Partial<Config> = {}) {
  const config: Config = { ...BASE_CONFIG, ...overrides };
  return {
    serverUrl: baseUrl,
    config,
    resolveCwd: async () => tmpDir,
  };
}

describe('edit_document MCP tool', () => {
  test('describes the optional offset precision contract', () => {
    expect(DESCRIPTION).toContain('offset');
    expect(DESCRIPTION).toContain('exact occurrence');
    expect(DESCRIPTION).toContain('suggest_links');
  });

  test('sends offset to the agent-patch endpoint when provided', async () => {
    const { server, getTool } = createFakeServer();

    register(server, makeDeps());

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
    expect(result.content[0]?.text).toBe('Edit applied successfully.');
  });

  test('omits offset when the caller uses first-match mode', async () => {
    const { server, getTool } = createFakeServer();

    register(server, makeDeps());

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

    register(server, makeDeps());

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

  test('includes previewUrl + source in structuredContent when resolver resolves', async () => {
    const uiBase = bindTestUiLock(tmpDir);
    const { server, getTool } = createFakeServer();

    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'notes',
      find: 'Project Alpha',
      replace: '[[Project Alpha]]',
    });

    expect(result.structuredContent).toMatchObject({
      previewUrl: `${uiBase}/#/notes`,
      previewUrlSource: 'lock',
    });
    expect(result.content[0]?.text).toContain(`Preview: ${uiBase}/#/notes`);
  });

  test('omits structuredContent when resolver returns null AND subscribers>0', async () => {
    const { server, getTool } = createFakeServer();

    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'notes',
      find: 'Project Alpha',
      replace: '[[Project Alpha]]',
    });

    expect(result.structuredContent).toBeUndefined();
    expect(result.content[0]?.text).toBe('Edit applied successfully.');
  });

  test('emits attach-preview-once hint with previewUrl when systemSubscriberCount=0', async () => {
    const uiBase = bindTestUiLock(tmpDir);
    mockSubscriberCount = 0;
    mockSystemSubscriberCount = 0;
    const { server, getTool } = createFakeServer();

    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'notes',
      find: 'Project Alpha',
      replace: '[[Project Alpha]]',
    });

    expect(result.structuredContent).toMatchObject({
      previewUrl: `${uiBase}/#/notes`,
      previewUrlSource: 'lock',
      warning: {
        action: 'attach-preview-once',
        message: 'Open the previewUrl in your preview browser.',
        previewUrl: `${uiBase}/#/notes`,
      },
    });
    expect(result.content[0]?.text).toContain(`Open ${uiBase}/#/notes in your preview browser.`);
  });

  test('emits start-ui hint with null previewUrl when systemSubscriberCount=0 and no resolver source', async () => {
    mockSubscriberCount = 0;
    mockSystemSubscriberCount = 0;
    const { server, getTool } = createFakeServer();

    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'notes',
      find: 'Project Alpha',
      replace: '[[Project Alpha]]',
    });

    expect(result.structuredContent).toMatchObject({
      warning: {
        action: 'start-ui',
        previewUrl: null,
      },
    });
    const warning = (result.structuredContent as { warning: { message: string } }).warning;
    expect(warning.message).toContain('ok ui');
    expect(warning.message).toContain('preview_start');
    expect(warning.message).toContain('OK Electron');
    expect(result.structuredContent?.previewUrl).toBeUndefined();
  });

  test('no hint when systemSubscriberCount>0 even if per-doc subscriberCount=0 (second doc, server-push follows)', async () => {
    mockSubscriberCount = 0;
    mockSystemSubscriberCount = 1;
    const { server, getTool } = createFakeServer();

    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'notes',
      find: 'Project Alpha',
      replace: '[[Project Alpha]]',
    });

    expect(result.structuredContent?.warning).toBeUndefined();
    expect(result.content[0]?.text).not.toContain('No preview attached');
  });

  test('no warning emitted when server omits systemSubscriberCount field (legacy server)', async () => {
    mockSubscriberCount = undefined;
    mockSystemSubscriberCount = undefined;
    const { server, getTool } = createFakeServer();

    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'notes',
      find: 'Project Alpha',
      replace: '[[Project Alpha]]',
    });

    expect(result.structuredContent).toBeUndefined();
    expect(result.content[0]?.text).toBe('Edit applied successfully.');
  });
});
