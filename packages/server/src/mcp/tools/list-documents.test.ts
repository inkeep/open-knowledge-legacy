import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { register } from './list-documents.ts';
import { bindTestUiLock } from './preview-url-test-helpers.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

type ToolHandler = (args: { dir?: string }) => Promise<{
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
        documents: [
          { kind: 'folder', path: 'notes', size: 0, modified: '2026-01-01' },
          { docName: 'alpha', size: 10, modified: '2026-01-01', isSymlink: false },
          { docName: 'notes/beta', size: 20, modified: '2026-01-02', isSymlink: false },
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
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-list-docs-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function registerTool(serverUrl: string | undefined): ToolHandler {
  let captured: ToolHandler | null = null;
  const server = {
    registerTool(_name: string, _config: unknown, handler: ToolHandler) {
      captured = handler;
    },
  } as unknown as ServerInstance;

  register(server, {
    serverUrl,
    config: BASE_CONFIG,
    resolveCwd: async () => tmpDir,
  });
  if (!captured) throw new Error('tool not registered');
  return captured;
}

describe('list_documents — previewUrl + ui block', () => {
  test('each row includes previewUrl + previewUrlSource when resolver resolves', async () => {
    const uiBase = bindTestUiLock(tmpDir);
    const handler = registerTool(baseUrl);
    const result = await handler({});
    const s = result.structuredContent as {
      documents: Array<{ docName: string; previewUrl: string; previewUrlSource: string }>;
      ui: { baseUrl: string | null; port: number | null };
    };
    expect(s.documents).toHaveLength(2);
    expect(s.documents.some((row) => row.docName === undefined)).toBe(false);
    expect(s.documents[0]?.previewUrl).toBe(`${uiBase}/#/alpha`);
    expect(s.documents[0]?.previewUrlSource).toBe('lock');
    expect(s.documents[1]?.previewUrl).toBe(`${uiBase}/#/notes/beta`);
    expect(s.ui).toEqual({ baseUrl: uiBase, port: 5173 });
  });

  test('previewUrl null when resolver returns null', async () => {
    const handler = registerTool(baseUrl);
    const result = await handler({});
    const s = result.structuredContent as {
      documents: Array<{ docName: string; previewUrl: string | null }>;
      ui: { baseUrl: string | null; port: number | null };
    };
    expect(s.documents[0]?.previewUrl).toBeNull();
    expect(s.ui.baseUrl).toBeNull();
  });
});
