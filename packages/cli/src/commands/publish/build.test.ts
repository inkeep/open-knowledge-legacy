import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Config } from '../../config/schema.ts';
import { OK_DIR } from '../../constants.ts';
import { runPublishBuild } from './build.ts';

function config(): Config {
  return {
    content: { dir: '.', include: ['**/*.md', '**/*.mdx'], exclude: [] },
    github: { oauthAppClientId: 'test' },
    sync: {
      pushIntervalSeconds: 60,
      pullIntervalSeconds: 30,
      autoCommit: true,
      autoPush: true,
      autoPull: true,
      commitMessage: 'auto',
    },
    server: { port: 0, host: 'localhost', openOnAgentEdit: false },
    persistence: { debounceMs: 2000, maxDebounceMs: 10000 },
    preview: {},
    folders: [],
    mcp: {
      autoStart: true,
      tools: { read_document: { historyDepth: 5 }, search: { maxResults: 50 } },
    },
  };
}

describe('runPublishBuild', () => {
  let root: string;

  beforeEach(() => {
    root = resolve(
      tmpdir(),
      `ok-publish-command-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(root, OK_DIR), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('builds using publish.yml and command overrides', async () => {
    writeFileSync(join(root, 'index.md'), '# Hello');
    writeFileSync(join(root, OK_DIR, 'publish.yml'), 'siteTitle: Config Title\noutputDir: site\n');

    const result = await runPublishBuild(config(), {
      cwd: root,
      siteTitle: 'CLI Title',
      basePath: '/kb',
    });

    expect(result.status).toBe('built');
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain('Built static site');
    const htmlPath = join(root, 'site', 'index.html');
    expect(existsSync(htmlPath)).toBe(true);
    expect(readFileSync(htmlPath, 'utf-8')).toContain('Hello · CLI Title');
    expect(readFileSync(htmlPath, 'utf-8')).toContain('href="/kb/"');
  });

  test('returns failed result for invalid publish.yml', async () => {
    writeFileSync(join(root, OK_DIR, 'publish.yml'), 'exclude: nope\n');

    const result = await runPublishBuild(config(), { cwd: root });

    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('Invalid publish configuration');
  });
});
