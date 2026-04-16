import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { type ReadDocumentDeps, register } from './read-document.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: true;
}

interface RegisteredTool {
  handler: (args: { path: string; since?: string; cwd?: string }) => Promise<ToolResult>;
}

function createFakeServer() {
  let registered: RegisteredTool | undefined;
  const server = {
    tool(
      _name: string,
      _description: string,
      _schema: Record<string, unknown>,
      handler: RegisteredTool['handler'],
    ) {
      registered = { handler };
    },
  } as unknown as ServerInstance;
  return {
    server,
    getTool(): RegisteredTool {
      if (!registered) throw new Error('Tool was not registered');
      return registered;
    },
  };
}

let tmpDir: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-read-doc-'));
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

async function writeDoc(relPath: string, content: string): Promise<void> {
  const abs = resolve(tmpDir, relPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf-8');
}

function makeDeps(): ReadDocumentDeps {
  return {
    resolveCwd: async () => tmpDir,
    config: BASE_CONFIG,
    serverUrl: undefined,
  };
}

describe('read_document — previewUrl emission', () => {
  test('emits previewUrl in structuredContent when resolver resolves', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    await writeDoc('docs/article.md', '# Hello\n\nbody');

    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({ path: 'docs/article.md' });

    expect(result.structuredContent).toEqual({
      previewUrl: 'https://env.example/#/docs/article',
      previewUrlSource: 'env',
    });
    expect(result.content[0]?.text).toContain('Hello');
  });

  test('emits previewUrl null when resolver returns null', async () => {
    await writeDoc('docs/article.md', '# Hello');

    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({ path: 'docs/article.md' });

    expect(result.structuredContent).toEqual({ previewUrl: null });
  });

  test('strips .mdx extension from path before resolving previewUrl', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://x.example';
    await writeDoc('docs/article.mdx', '# Hello');

    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({ path: 'docs/article.mdx' });

    expect(result.structuredContent).toEqual({
      previewUrl: 'https://x.example/#/docs/article',
      previewUrlSource: 'env',
    });
  });
});
