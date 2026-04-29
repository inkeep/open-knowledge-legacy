import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { type Config, ConfigSchema } from '@inkeep/open-knowledge-server';
import simpleGit from 'simple-git';
import { buildSearchResult } from './search.ts';

const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

let tmpDir: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-search-test-'));
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

describe('search — folder-rule flow-through (US-005)', () => {
  test('search results include folder-rule-derived tags', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(resolve(specs, 'foo.md'), '# Foo\n\nsearchterm is in the body\n');

    const config: Config = ConfigSchema.parse({
      folders: [{ match: 'specs/**', frontmatter: { tags: ['spec'] } }],
    });

    const { text: result } = await buildSearchResult(
      { query: 'searchterm' },
      { resolveCwd: async () => project, serverUrl: undefined, config },
    );

    expect(result).toContain('specs/foo.md');
    expect(result).toContain('Tags: spec');
  });

  test('folder-rule title appears in search result heading when file has no title', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(resolve(specs, 'foo.md'), 'searchterm in body, no frontmatter\n');

    const config: Config = ConfigSchema.parse({
      folders: [
        {
          match: 'specs/**',
          frontmatter: { title: 'Specifications', description: 'Spec docs' },
        },
      ],
    });

    const { text: result } = await buildSearchResult(
      { query: 'searchterm' },
      { resolveCwd: async () => project, serverUrl: undefined, config },
    );

    expect(result).toContain('### Specifications (specs/foo.md)');
    expect(result).toContain('Spec docs');
  });

  test('file title wins over folder-rule title for scalar precedence', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(resolve(specs, 'foo.md'), '---\ntitle: File Title\n---\n\nsearchterm here\n');

    const config: Config = ConfigSchema.parse({
      folders: [{ match: 'specs/**', frontmatter: { title: 'Folder Title' } }],
    });

    const { text: result } = await buildSearchResult(
      { query: 'searchterm' },
      { resolveCwd: async () => project, serverUrl: undefined, config },
    );

    expect(result).toContain('### File Title (specs/foo.md)');
    expect(result).not.toContain('Folder Title');
  });

  test('folder-rule tags concatenate with file tags and dedup', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(
      resolve(specs, 'foo.md'),
      '---\ntitle: Foo\ntags:\n  - wip\n  - spec\n---\n\nsearchterm here\n',
    );

    const config: Config = ConfigSchema.parse({
      folders: [{ match: 'specs/**', frontmatter: { tags: ['spec', 'architecture'] } }],
    });

    const { text: result } = await buildSearchResult(
      { query: 'searchterm' },
      { resolveCwd: async () => project, serverUrl: undefined, config },
    );

    expect(result).toContain('Tags: spec, architecture, wip');
  });

  test('empty folders config behaves identically to no folders block (backwards compat)', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(
      resolve(specs, 'foo.md'),
      '---\ntitle: File Title\ntags:\n  - wip\n---\n\nsearchterm here\n',
    );

    const { text: result } = await buildSearchResult(
      { query: 'searchterm' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    );

    expect(result).toContain('### File Title (specs/foo.md)');
    expect(result).toContain('Tags: wip');
    expect(result).not.toContain('Folder');
    expect(result).not.toContain('spec,');
  });
});

describe('search — previewUrl + ui block', () => {
  test('each result row includes previewUrl + previewUrlSource when resolver resolves', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    mkdirSync(resolve(tmpDir, 'articles'), { recursive: true });
    writeFileSync(resolve(tmpDir, 'articles/auth.md'), '---\ntitle: Auth\n---\nneedle here\n');
    writeFileSync(resolve(tmpDir, 'articles/sso.md'), '---\ntitle: SSO\n---\nneedle too\n');

    const { structured } = await buildSearchResult(
      { query: 'needle' },
      { resolveCwd: async () => tmpDir, config: DEFAULT_CONFIG, serverUrl: undefined },
    );
    expect(structured).toBeTruthy();
    expect(structured?.matchCount).toBe(2);
    expect(structured?.fileCount).toBe(2);
    for (const row of structured?.results ?? []) {
      expect(row.previewUrl).toBe(`https://env.example/#/${row.docName}`);
      expect(row.previewUrlSource).toBe('env');
      expect(row.docName.endsWith('.md')).toBe(false);
    }
    expect(structured?.ui).toEqual({ baseUrl: null, port: null });
  });

  test('previewUrl null when resolver returns null', async () => {
    mkdirSync(resolve(tmpDir, 'articles'), { recursive: true });
    writeFileSync(resolve(tmpDir, 'articles/auth.md'), '---\ntitle: Auth\n---\nneedle\n');

    const { structured } = await buildSearchResult(
      { query: 'needle' },
      { resolveCwd: async () => tmpDir, config: DEFAULT_CONFIG, serverUrl: undefined },
    );
    expect(structured?.results[0]?.previewUrl).toBeNull();
    expect(structured?.ui.baseUrl).toBeNull();
  });

  test('zero-match query still emits an empty structured block + ui', async () => {
    mkdirSync(resolve(tmpDir, 'articles'), { recursive: true });
    writeFileSync(resolve(tmpDir, 'articles/a.md'), 'no matches');

    const { text, structured } = await buildSearchResult(
      { query: 'needle' },
      { resolveCwd: async () => tmpDir, config: DEFAULT_CONFIG, serverUrl: undefined },
    );
    expect(text).toContain('No matches');
    expect(structured?.matchCount).toBe(0);
    expect(structured?.results).toEqual([]);
    expect(structured?.ui).toEqual({ baseUrl: null, port: null });
  });
});
