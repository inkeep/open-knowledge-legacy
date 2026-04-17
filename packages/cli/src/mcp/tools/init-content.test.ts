import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Config } from '../../config/schema.ts';
import { register } from './init-content.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = {
  content: { dir: 'docs', include: ['**/*.md', '**/*.mdx'], exclude: [] },
  server: { port: 3000, host: 'localhost', openOnAgentEdit: false },
  persistence: { debounceMs: 2000, maxDebounceMs: 10000 },
  mcp: {
    tools: {
      read_document: { historyDepth: 5 },
      search: { maxResults: 50 },
    },
  },
};

type ToolHandler = () => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}>;

let tmpDir: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-init-content-test-'));
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
    tool(_name: string, _description: string, handler: ToolHandler) {
      captured = handler;
    },
  } as unknown as ServerInstance;

  register(server, { config: BASE_CONFIG, resolveCwd: async () => tmpDir });
  if (!captured) throw new Error('tool not registered');
  return captured;
}

describe('init-content — top-level ui block only (FR-2.6)', () => {
  test('emits the instructional body in content and a ui block in structuredContent', async () => {
    const handler = registerTool();
    const result = await handler();
    expect(result.content[0]?.text).toContain('Initialize a project knowledge base');
    expect(result.structuredContent).toEqual({ ui: { baseUrl: null, port: null } });
  });

  test('structuredContent.ui has no docName list (instructional tool)', async () => {
    const handler = registerTool();
    const result = await handler();
    expect(result.structuredContent).not.toHaveProperty('results');
    expect(result.structuredContent).not.toHaveProperty('documents');
  });
});
