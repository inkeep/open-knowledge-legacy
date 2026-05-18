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
import { register } from './get-backlinks.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

type ToolHandler = (args: { docName: string }) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}>;

let testServer: ReturnType<typeof Bun.serve>;
let baseUrl: string;
let tmpDir: string;

beforeAll(() => {
  testServer = Bun.serve({
    port: 0,
    fetch() {
      return Response.json({
        ok: true,
        docName: 'target',
        backlinks: [
          { source: 'alpha', anchor: null, title: 'Alpha', snippet: 'links to target' },
          { source: 'beta', anchor: 'section-1', title: 'Beta', snippet: 'see target' },
        ],
      });
    },
  });
  baseUrl = `http://localhost:${testServer.port}`;
});

afterAll(() => {
  testServer.stop();
});

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-backlinks-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function registerTool(): ToolHandler {
  let captured: ToolHandler | null = null;
  const server = {
    registerTool(_name: string, _config: unknown, handler: ToolHandler) {
      captured = handler;
    },
  } as unknown as ServerInstance;

  register(server, {
    serverUrl: baseUrl,
    config: BASE_CONFIG,
    resolveCwd: async () => tmpDir,
  });
  if (!captured) throw new Error('tool not registered');
  return captured;
}

describe('get_backlinks — previewUrl + ui block', () => {
  test('each row includes previewUrl + previewUrlSource when resolver resolves', async () => {
    const uiBase = bindTestUiLock(tmpDir);
    const handler = registerTool();
    const result = await handler({ docName: 'target' });
    const s = result.structuredContent as {
      backlinks: Array<{ source: string; previewUrl: string; previewUrlSource: string }>;
      ui: { baseUrl: string | null; port: number | null };
    };
    expect(s.backlinks).toHaveLength(2);
    expect(s.backlinks[0]?.previewUrl).toBe(`${uiBase}/#/alpha`);
    expect(s.backlinks[0]?.previewUrlSource).toBe('lock');
    expect(s.backlinks[1]?.previewUrl).toBe(`${uiBase}/#/beta`);
    expect(s.ui).toEqual({ baseUrl: uiBase, port: 5173 });
  });

  test('previewUrl null when resolver returns null', async () => {
    const handler = registerTool();
    const result = await handler({ docName: 'target' });
    const s = result.structuredContent as {
      backlinks: Array<{ source: string; previewUrl: string | null }>;
      ui: { baseUrl: string | null; port: number | null };
    };
    expect(s.backlinks[0]?.previewUrl).toBeNull();
    expect(s.ui.baseUrl).toBeNull();
  });
});
