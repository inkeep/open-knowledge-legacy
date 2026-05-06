import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import simpleGit from 'simple-git';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { buildGrepResult } from './grep.ts';

const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

let tmpDir: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-grep-test-'));
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

describe('grep —.okignore exclusion', () => {
  test('files under a .okignore-excluded path do not appear in results', async () => {
    const project = await bootstrap();
    const drafts = resolve(project, 'drafts');
    const articles = resolve(project, 'articles');
    mkdirSync(drafts, { recursive: true });
    mkdirSync(articles, { recursive: true });
    writeFileSync(resolve(drafts, 'wip.md'), '# Draft\n\nsearchterm in draft\n');
    writeFileSync(resolve(articles, 'pub.md'), '# Article\n\nsearchterm in article\n');
    writeFileSync(resolve(project, '.okignore'), 'drafts/\n');

    const { structured } = await buildGrepResult(
      { query: 'searchterm' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    );

    const paths = (structured?.results ?? []).map((r) => r.path);
    expect(paths).toContain('articles/pub.md');
    expect(paths).not.toContain('drafts/wip.md');
  });

  test('cross-source negation — .okignore !pattern re-includes a .gitignore-excluded file', async () => {
    const project = await bootstrap();
    writeFileSync(resolve(project, 'secret.md'), '# Secret\n\nsearchterm in secret\n');
    writeFileSync(resolve(project, '.gitignore'), 'secret.md\n');
    writeFileSync(resolve(project, '.okignore'), '!secret.md\n');

    const { structured } = await buildGrepResult(
      { query: 'searchterm' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    );

    const paths = (structured?.results ?? []).map((r) => r.path);
    expect(paths).toContain('secret.md');
  });
});

describe('grep —previewUrl + ui block', () => {
  test('each result row includes previewUrl + previewUrlSource when resolver resolves', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    mkdirSync(resolve(tmpDir, 'articles'), { recursive: true });
    writeFileSync(resolve(tmpDir, 'articles/auth.md'), '---\ntitle: Auth\n---\nneedle here\n');
    writeFileSync(resolve(tmpDir, 'articles/sso.md'), '---\ntitle: SSO\n---\nneedle too\n');

    const { structured } = await buildGrepResult(
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

    const { structured } = await buildGrepResult(
      { query: 'needle' },
      { resolveCwd: async () => tmpDir, config: DEFAULT_CONFIG, serverUrl: undefined },
    );
    expect(structured?.results[0]?.previewUrl).toBeNull();
    expect(structured?.ui.baseUrl).toBeNull();
  });

  test('zero-match query still emits an empty structured block + ui', async () => {
    mkdirSync(resolve(tmpDir, 'articles'), { recursive: true });
    writeFileSync(resolve(tmpDir, 'articles/a.md'), 'no matches');

    const { text, structured } = await buildGrepResult(
      { query: 'needle' },
      { resolveCwd: async () => tmpDir, config: DEFAULT_CONFIG, serverUrl: undefined },
    );
    expect(text).toContain('No matches');
    expect(structured?.matchCount).toBe(0);
    expect(structured?.results).toEqual([]);
    expect(structured?.ui).toEqual({ baseUrl: null, port: null });
  });
});
