import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { acquireUiLock, updateUiLockPort } from '@inkeep/open-knowledge-server';
import type { Config } from '../../config/schema.ts';
import { OK_DIR } from '../../constants.ts';
import { buildGetPreviewUrlResult } from './get-preview-url.ts';

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
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-get-preview-url-'));
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

const resolveCwd = async (): Promise<string> => tmpDir;

describe('buildGetPreviewUrlResult', () => {
  test('returns resolved URL + source when env is set', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    const outcome = await buildGetPreviewUrlResult(
      { docName: 'docs/test' },
      { resolveCwd, config: BASE_CONFIG },
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.previewUrl).toBe('https://env.example/#/docs/test');
      expect(outcome.result.previewUrlSource).toBe('env');
    }
  });

  test('returns null previewUrl when nothing resolves', async () => {
    const outcome = await buildGetPreviewUrlResult(
      { docName: 'docs/test' },
      { resolveCwd, config: BASE_CONFIG },
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.previewUrl).toBeNull();
      expect(outcome.result.previewUrlSource).toBeUndefined();
    }
  });

  test('uses local lock file when present', async () => {
    const lockDir = resolve(tmpDir, OK_DIR);
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 4242);

    const outcome = await buildGetPreviewUrlResult(
      { docName: 'docs/test' },
      { resolveCwd, config: BASE_CONFIG },
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.previewUrl).toBe('http://localhost:4242/#/docs/test');
      expect(outcome.result.previewUrlSource).toBe('lock');
    }
  });

  test('strips .md extension from docName before building URL', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://x.example';
    const outcome = await buildGetPreviewUrlResult(
      { docName: 'docs/test.md' },
      { resolveCwd, config: BASE_CONFIG },
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.previewUrl).toBe('https://x.example/#/docs/test');
    }
  });

  test('rejects .markdown extension', async () => {
    const outcome = await buildGetPreviewUrlResult(
      { docName: 'docs/test.markdown' },
      { resolveCwd, config: BASE_CONFIG },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toContain('.markdown');
    }
  });

  test('rejects docName outside content.include', async () => {
    const mdOnly: Config = {
      ...BASE_CONFIG,
      content: { ...BASE_CONFIG.content, include: ['docs/**/*.md'] },
    };
    const outcome = await buildGetPreviewUrlResult(
      { docName: 'src/index' },
      { resolveCwd, config: mdOnly },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toContain('content.include');
    }
  });

  test('accepts docName inside content.include', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://x.example';
    const mdOnly: Config = {
      ...BASE_CONFIG,
      content: { ...BASE_CONFIG.content, include: ['docs/**/*.md'] },
    };
    const outcome = await buildGetPreviewUrlResult(
      { docName: 'docs/test' },
      { resolveCwd, config: mdOnly },
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.previewUrl).toBe('https://x.example/#/docs/test');
    }
  });
});
