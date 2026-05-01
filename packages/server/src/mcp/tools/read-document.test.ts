import { describe as _bunDescribe, afterEach, beforeEach, expect, test } from 'bun:test';

const describe = process.env.CI ? _bunDescribe.skip : _bunDescribe;

import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import simpleGit from 'simple-git';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { buildReadResult, type ReadDocumentDeps, register } from './read-document.ts';
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
let originalEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-read-doc-test-'));
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

async function bootstrap(): Promise<string> {
  const project = resolve(tmpDir, 'project');
  mkdirSync(project, { recursive: true });
  const git = simpleGit(project);
  await git.init();
  await git.raw('config', 'user.name', 'Test');
  await git.raw('config', 'user.email', 't@t.test');
  writeFileSync(resolve(project, 'README.md'), '# probe\n');
  await git.add('README.md');
  await git.commit('init');
  return project;
}

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

describe('read_document — folder-rule flow-through (US-005 / QA-002)', () => {
  test('folder rule fills in description + tags when file omits them', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(resolve(specs, 'foo.md'), '---\ntitle: Foo\n---\nBody content\n');

    const config: Config = ConfigSchema.parse({
      folders: [
        {
          match: 'specs/**',
          frontmatter: { description: 'Specifications', tags: ['spec'] },
        },
      ],
    });

    const result = await buildReadResult(
      { path: 'specs/foo.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config },
    );

    expect(result).toContain('## Foo');
    expect(result).toContain('**Description:** Specifications');
    expect(result).toContain('spec');
  });

  test('file frontmatter wins over folder rule for scalars', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(
      resolve(specs, 'foo.md'),
      '---\ntitle: File Title\ndescription: File desc\n---\nBody\n',
    );

    const config: Config = ConfigSchema.parse({
      folders: [
        {
          match: 'specs/**',
          frontmatter: { title: 'Folder Title', description: 'Folder desc' },
        },
      ],
    });

    const result = await buildReadResult(
      { path: 'specs/foo.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config },
    );

    expect(result).toContain('## File Title');
    expect(result).not.toContain('Folder Title');
    expect(result).toContain('**Description:** File desc');
    expect(result).not.toContain('Folder desc');
  });

  test('tags concat across folder rule + file frontmatter with dedup', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(
      resolve(specs, 'foo.md'),
      '---\ntitle: Foo\ntags:\n  - wip\n  - spec\n---\nBody\n',
    );

    const config: Config = ConfigSchema.parse({
      folders: [{ match: 'specs/**', frontmatter: { tags: ['spec', 'architecture'] } }],
    });

    const result = await buildReadResult(
      { path: 'specs/foo.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config },
    );

    expect(result).toContain('spec');
    expect(result).toContain('architecture');
    expect(result).toContain('wip');
    const specOccurrences = (result.match(/spec/g) ?? []).length;
    expect(specOccurrences).toBeGreaterThanOrEqual(1);
  });

  test('no folder rule matches → file-only frontmatter behavior', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(resolve(specs, 'foo.md'), '---\ntitle: Foo\ntags:\n  - wip\n---\nBody\n');

    const config: Config = ConfigSchema.parse({
      folders: [
        {
          match: 'reports/**',
          frontmatter: { title: 'Should not appear', tags: ['report'] },
        },
      ],
    });

    const result = await buildReadResult(
      { path: 'specs/foo.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config },
    );

    expect(result).toContain('## Foo');
    expect(result).not.toContain('Should not appear');
    expect(result).not.toContain('report');
    expect(result).toContain('wip');
  });

  test('empty folders config behaves identically to no folders block (backwards compat)', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(resolve(specs, 'foo.md'), '---\ntitle: Foo\ndescription: Bar\n---\nBody\n');

    const result = await buildReadResult(
      { path: 'specs/foo.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    );

    expect(result).toContain('## Foo');
    expect(result).toContain('**Description:** Bar');
  });
});

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
