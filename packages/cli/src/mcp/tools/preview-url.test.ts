import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { acquireServerLock, updateServerLockPort } from '@inkeep/open-knowledge-server';
import type { Config } from '../../config/schema.ts';
import { OK_DIR } from '../../constants.ts';
import { resolvePreviewUrl } from './preview-url.ts';

const BASE_CONFIG: Config = {
  content: { dir: '.', include: ['**/*.md'], exclude: [] },
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
let lockDir: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-preview-url-'));
  lockDir = resolve(tmpDir, OK_DIR);
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

describe('resolvePreviewUrl — priority', () => {
  test('env wins over lock and config', () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    acquireServerLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateServerLockPort(lockDir, 5173);
    const config = { ...BASE_CONFIG, preview: { baseUrl: 'https://config.example' } };

    const result = resolvePreviewUrl('docs/a', { config, lockDir });

    expect(result).toEqual({ url: 'https://env.example/#/docs/a', source: 'env' });
  });

  test('lock wins over config when env absent', () => {
    acquireServerLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateServerLockPort(lockDir, 5173);
    const config = { ...BASE_CONFIG, preview: { baseUrl: 'https://wiki.acme.com' } };

    const result = resolvePreviewUrl('docs/a', { config, lockDir });

    expect(result).toEqual({ url: 'http://localhost:5173/#/docs/a', source: 'lock' });
  });

  test('config used when env + lock absent', () => {
    const config = { ...BASE_CONFIG, preview: { baseUrl: 'https://wiki.acme.com' } };

    const result = resolvePreviewUrl('docs/a', { config, lockDir });

    expect(result).toEqual({ url: 'https://wiki.acme.com/#/docs/a', source: 'config' });
  });

  test('null when nothing resolves', () => {
    const result = resolvePreviewUrl('docs/a', { config: BASE_CONFIG, lockDir });
    expect(result).toBeNull();
  });
});

describe('resolvePreviewUrl — lock branch edge cases', () => {
  test('lock with port=0 falls through to config', () => {
    acquireServerLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    const config = { ...BASE_CONFIG, preview: { baseUrl: 'https://x.example' } };

    const result = resolvePreviewUrl('docs/a', { config, lockDir });

    expect(result).toEqual({ url: 'https://x.example/#/docs/a', source: 'config' });
  });

  test('lock always uses localhost, ignores hostname field', () => {
    acquireServerLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateServerLockPort(lockDir, 4242);

    const result = resolvePreviewUrl('docs/a', { config: BASE_CONFIG, lockDir });

    expect(result?.url.startsWith('http://localhost:4242/')).toBe(true);
  });
});

describe('resolvePreviewUrl — malformed sources', () => {
  test('invalid env URL falls through', () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'not a url';
    const config = { ...BASE_CONFIG, preview: { baseUrl: 'https://ok.example' } };

    const result = resolvePreviewUrl('docs/a', { config, lockDir });

    expect(result).toEqual({ url: 'https://ok.example/#/docs/a', source: 'config' });
  });

  test('invalid config URL → null (no fallback)', () => {
    // We deliberately bypass schema validation to simulate a runtime-corrupted
    // config (e.g., user hand-edited the parsed object).
    const config = { ...BASE_CONFIG, preview: { baseUrl: 'not a url' } } as Config;

    const result = resolvePreviewUrl('docs/a', { config, lockDir });

    expect(result).toBeNull();
  });

  test('empty string env is ignored', () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = '';
    const result = resolvePreviewUrl('docs/a', { config: BASE_CONFIG, lockDir });
    expect(result).toBeNull();
  });
});

describe('resolvePreviewUrl — docName encoding', () => {
  test('simple nested path', () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://x.example';
    const result = resolvePreviewUrl('notes/meeting', { config: BASE_CONFIG, lockDir });
    expect(result?.url).toBe('https://x.example/#/notes/meeting');
  });

  test('spaces and em-dashes encoded', () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://x.example';
    const result = resolvePreviewUrl('notes/My Doc — 2026', { config: BASE_CONFIG, lockDir });
    expect(result?.url).toBe('https://x.example/#/notes/My%20Doc%20%E2%80%94%202026');
  });

  test('question marks and hash signs encoded per-segment', () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://x.example';
    const result = resolvePreviewUrl('weird/? name', { config: BASE_CONFIG, lockDir });
    expect(result?.url).toBe('https://x.example/#/weird/%3F%20name');
  });

  test('percent literal encoded', () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://x.example';
    const result = resolvePreviewUrl('with%percent', { config: BASE_CONFIG, lockDir });
    expect(result?.url).toBe('https://x.example/#/with%25percent');
  });

  test('trailing slash baseUrl does not produce double slash', () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://x.example/';
    const result = resolvePreviewUrl('docs/a', { config: BASE_CONFIG, lockDir });
    expect(result?.url).toBe('https://x.example/#/docs/a');
  });
});

describe('resolvePreviewUrl — round-trip via docNameFromHash', () => {
  // Mirror of packages/app/src/lib/doc-hash.ts:7-20 (docNameFromHash).
  function docNameFromHash(hash: string): string | null {
    if (!hash.startsWith('#/')) return null;
    const rest = hash.slice(2);
    const qmark = rest.indexOf('?');
    const encoded = qmark >= 0 ? rest.slice(0, qmark) : rest;
    if (!encoded) return null;
    try {
      return encoded.split('/').map(decodeURIComponent).join('/');
    } catch {
      return encoded;
    }
  }

  test.each([
    'docs/a',
    'notes/My Doc — 2026',
    'weird/name with spaces',
    'with#hash',
    'with%percent',
    'deeply/nested/path/here',
    'leading-dash',
    'unicode/日本語',
  ])('round-trip: %s', (docName: string) => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://x.example';
    const result = resolvePreviewUrl(docName, { config: BASE_CONFIG, lockDir });
    expect(result).not.toBeNull();
    // Extract the hash portion `#/...` from the full URL.
    const hashIdx = result?.url.indexOf('#') ?? -1;
    expect(hashIdx).toBeGreaterThan(-1);
    const hash = result?.url.slice(hashIdx);
    const decoded = docNameFromHash(hash ?? '');
    expect(decoded).toBe(docName);
  });

  test('trailing slash docName: decoder is lossy but safe', () => {
    // Trailing slashes produce empty trailing segments. The decoder joins
    // back with '/' and the trailing empty segment survives. Verify round-trip
    // holds for this edge case too.
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://x.example';
    const result = resolvePreviewUrl('trail/', { config: BASE_CONFIG, lockDir });
    const hash = result?.url.slice(result.url.indexOf('#'));
    expect(hash).toBe('#/trail/');
  });
});
