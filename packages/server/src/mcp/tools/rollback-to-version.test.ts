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
import { type RollbackToVersionDeps, register } from './rollback-to-version.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: true;
}

interface RegisteredTool {
  handler: (args: { docName: string; commitSha: string }) => Promise<ToolResult>;
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
      if (url.pathname.startsWith('/api/history/')) {
        return Response.json({
          ok: true,
          author: 'Alice',
          timestamp: '2026-04-14T00:00:00Z',
        });
      }
      if (url.pathname === '/api/rollback') {
        await req.json();
        return Response.json({ ok: true });
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
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-rollback-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function makeDeps(): RollbackToVersionDeps {
  return {
    serverUrl: baseUrl,
    config: BASE_CONFIG,
    resolveCwd: async () => tmpDir,
  };
}

const sha = '0123456789abcdef0123456789abcdef01234567';

describe('rollback_to_version — previewUrl emission', () => {
  test('emits previewUrl + source when resolver resolves', async () => {
    const uiBase = bindTestUiLock(tmpDir);
    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({ docName: 'notes', commitSha: sha });

    expect(result.structuredContent).toEqual({
      previewUrl: `${uiBase}/#/notes`,
      previewUrlSource: 'lock',
    });
    expect(result.content[0]?.text).toContain('Restored "notes"');
  });

  test('emits previewUrl null when resolver returns null', async () => {
    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({ docName: 'notes', commitSha: sha });

    expect(result.structuredContent).toEqual({ previewUrl: null });
  });
});
