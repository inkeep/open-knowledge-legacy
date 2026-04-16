import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Config } from '../../config/schema.ts';
import { buildSearchResult } from './search.ts';

const BASE_CONFIG: Config = {
  content: { dir: '.', include: ['**/*.md', '**/*.mdx'], exclude: [] },
  server: { port: 3000, host: 'localhost', openOnAgentEdit: false },
  persistence: { debounceMs: 2000, maxDebounceMs: 10000 },
  mcp: {
    tools: {
      read_document: { historyDepth: 5 },
      search: { maxResults: 50 },
    },
  },
};

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

describe('search — previewUrl + ui block', () => {
  test('each result row includes previewUrl + previewUrlSource when resolver resolves', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    mkdirSync(resolve(tmpDir, 'articles'), { recursive: true });
    writeFileSync(resolve(tmpDir, 'articles/auth.md'), '---\ntitle: Auth\n---\nneedle here\n');
    writeFileSync(resolve(tmpDir, 'articles/sso.md'), '---\ntitle: SSO\n---\nneedle too\n');

    const { structured } = await buildSearchResult(
      { query: 'needle' },
      { resolveCwd: async () => tmpDir, config: BASE_CONFIG, serverUrl: undefined },
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
      { resolveCwd: async () => tmpDir, config: BASE_CONFIG, serverUrl: undefined },
    );
    expect(structured?.results[0]?.previewUrl).toBeNull();
    expect(structured?.ui.baseUrl).toBeNull();
  });

  test('zero-match query still emits an empty structured block + ui', async () => {
    mkdirSync(resolve(tmpDir, 'articles'), { recursive: true });
    writeFileSync(resolve(tmpDir, 'articles/a.md'), 'no matches');

    const { text, structured } = await buildSearchResult(
      { query: 'needle' },
      { resolveCwd: async () => tmpDir, config: BASE_CONFIG, serverUrl: undefined },
    );
    expect(text).toContain('No matches');
    expect(structured?.matchCount).toBe(0);
    expect(structured?.results).toEqual([]);
    expect(structured?.ui).toEqual({ baseUrl: null, port: null });
  });
});
