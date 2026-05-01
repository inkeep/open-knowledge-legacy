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
import type { Config } from '../../config/schema.ts';
import { register } from './get-forward-links.ts';
import type { ServerInstance } from './shared.ts';

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

type ToolHandler = (args: { docName: string }) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}>;

let testServer: ReturnType<typeof Bun.serve>;
let baseUrl: string;
let tmpDir: string;
let originalEnv: string | undefined;

beforeAll(() => {
  testServer = Bun.serve({
    port: 0,
    fetch() {
      return Response.json({
        ok: true,
        docName: 'source',
        forwardLinks: [
          { kind: 'doc', docName: 'alpha', anchor: null, title: 'Alpha', snippet: '-' },
          { kind: 'external', url: 'https://example.com', title: 'ext', snippet: '-' },
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
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-forwardlinks-test-'));
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

function registerTool(): ToolHandler {
  let captured: ToolHandler | null = null;
  const server = {
    tool(_name: string, _description: string, _schema: unknown, handler: ToolHandler) {
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

describe('get_forward_links — previewUrl + ui block', () => {
  test('doc entries get previewUrl; external entries get null previewUrl', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    const handler = registerTool();
    const result = await handler({ docName: 'source' });
    const s = result.structuredContent as {
      forwardLinks: Array<{
        kind: string;
        docName?: string;
        previewUrl: string | null;
        previewUrlSource?: string;
      }>;
      ui: { baseUrl: string | null; port: number | null };
    };
    expect(s.forwardLinks).toHaveLength(2);
    expect(s.forwardLinks[0]?.kind).toBe('doc');
    expect(s.forwardLinks[0]?.previewUrl).toBe('https://env.example/#/alpha');
    expect(s.forwardLinks[0]?.previewUrlSource).toBe('env');
    expect(s.forwardLinks[1]?.kind).toBe('external');
    expect(s.forwardLinks[1]?.previewUrl).toBeNull();
    expect(s.forwardLinks[1]?.previewUrlSource).toBeUndefined();
  });

  test('previewUrl null when resolver returns null', async () => {
    const handler = registerTool();
    const result = await handler({ docName: 'source' });
    const s = result.structuredContent as {
      forwardLinks: Array<{ previewUrl: string | null }>;
      ui: { baseUrl: string | null; port: number | null };
    };
    expect(s.forwardLinks[0]?.previewUrl).toBeNull();
    expect(s.ui.baseUrl).toBeNull();
  });
});
