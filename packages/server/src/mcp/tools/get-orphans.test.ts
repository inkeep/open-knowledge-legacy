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
import { DESCRIPTION, register } from './get-orphans.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
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
let tmpDir: string;

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
          orphans: [{ docName: 'lonely-page', title: 'Lonely' }],
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

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-orphans-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function makeDeps(serverUrl: string | undefined) {
  return {
    serverUrl,
    config: BASE_CONFIG,
    resolveCwd: async () => tmpDir,
  };
}

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

  register(server, makeDeps(serverUrl));
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
    const defaultStructured = defaultResult.structuredContent as {
      receivedMode: string | null;
      hadMode: boolean;
    };
    expect(defaultStructured.receivedMode).toBeNull();
    expect(defaultStructured.hadMode).toBe(false);

    const incomingResult = await tool.handler({ mode: 'incoming' });
    const incomingStructured = incomingResult.structuredContent as {
      receivedMode: string | null;
      hadMode: boolean;
    };
    expect(incomingStructured.receivedMode).toBe('incoming');
    expect(incomingStructured.hadMode).toBe(true);
  });

  test('each row includes previewUrl + previewUrlSource when resolver resolves', async () => {
    const uiBase = bindTestUiLock(tmpDir);
    const tool = registerTool(baseUrl);

    const result = await tool.handler({});
    const s = result.structuredContent as {
      orphans: Array<{ docName: string; previewUrl: string; previewUrlSource: string }>;
      ui: { baseUrl: string | null; port: number | null };
    };
    expect(s.orphans[0]?.previewUrl).toBe(`${uiBase}/#/lonely-page`);
    expect(s.orphans[0]?.previewUrlSource).toBe('lock');
    expect(s.ui).toEqual({ baseUrl: uiBase, port: 5173 });
  });

  test('per-row previewUrl is null when resolver returns null', async () => {
    const tool = registerTool(baseUrl);

    const result = await tool.handler({});
    const s = result.structuredContent as {
      orphans: Array<{ docName: string; previewUrl: string | null }>;
      ui: { baseUrl: string | null; port: number | null };
    };
    expect(s.orphans[0]?.previewUrl).toBeNull();
    expect(s.ui.baseUrl).toBeNull();
  });
});
