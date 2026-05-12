import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { bindTestUiLock } from './preview-url-test-helpers.ts';
import { type ReadDocumentDeps, register } from './read-document.ts';
import type { ServerInstance } from './shared.ts';

const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

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

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-read-doc-test-'));
});

afterEach(async () => {
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
    config: DEFAULT_CONFIG,
    serverUrl: undefined,
  };
}

describe('read_document — path containment (mcp-tool-path-traversal cluster)', () => {
  test('rejects `../`-relative escape from project root', async () => {
    const siblingName = `escape-${Date.now()}.md`;
    const outsideFile = resolve(tmpDir, '..', siblingName);
    await writeFile(outsideFile, '# SECRET\n', 'utf-8');

    try {
      const { server, getTool } = createFakeServer();
      register(server, makeDeps());

      const result = await getTool().handler({ path: `../${siblingName}` });

      expect(result.isError).toBe(true);
      const text = result.content[0]?.text ?? '';
      expect(text).toContain('Refusing to read outside project root');
      expect(text).not.toContain('SECRET');
    } finally {
      await rm(outsideFile, { force: true });
    }
  });

  test('rejects absolute path outside the project root', async () => {
    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({ path: '/etc/passwd' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text ?? '').toContain('Refusing to read outside project root');
  });

  test('rejects deep `../../` escape even when target file does not exist', async () => {
    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({ path: '../../../../etc/passwd' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text ?? '').toContain('Refusing to read outside project root');
  });
});

describe('read_document — previewUrl emission', () => {
  test('emits previewUrl in structuredContent when resolver resolves', async () => {
    const uiBase = bindTestUiLock(tmpDir);
    await writeDoc('docs/article.md', '# Hello\n\nbody');

    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({ path: 'docs/article.md' });

    expect(result.structuredContent).toEqual({
      previewUrl: `${uiBase}/#/docs/article`,
      previewUrlSource: 'lock',
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
    const uiBase = bindTestUiLock(tmpDir);
    await writeDoc('docs/article.mdx', '# Hello');

    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({ path: 'docs/article.mdx' });

    expect(result.structuredContent).toEqual({
      previewUrl: `${uiBase}/#/docs/article`,
      previewUrlSource: 'lock',
    });
  });
});
