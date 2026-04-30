import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { acquireUiLock, updateUiLockPort } from '@inkeep/open-knowledge-server';
import type { Config } from '../../config/schema.ts';
import { OK_DIR } from '../../constants.ts';
import { resolvePreviewUrl } from './preview-url.ts';

const BASE_CONFIG: Config = {
  content: { dir: '.', include: ['**/*.md'], exclude: [] },
  server: { host: 'localhost', openOnAgentEdit: false },
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
let originalElectronProtocolEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-preview-url-'));
  lockDir = resolve(tmpDir, OK_DIR);
  originalEnv = process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
  originalElectronProtocolEnv = process.env.OK_ELECTRON_PROTOCOL_HOST;
  delete process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
  delete process.env.OK_ELECTRON_PROTOCOL_HOST;
});

afterEach(async () => {
  if (originalEnv === undefined) {
    delete process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
  } else {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = originalEnv;
  }
  if (originalElectronProtocolEnv === undefined) {
    delete process.env.OK_ELECTRON_PROTOCOL_HOST;
  } else {
    process.env.OK_ELECTRON_PROTOCOL_HOST = originalElectronProtocolEnv;
  }
  await rm(tmpDir, { recursive: true, force: true });
});

describe('resolvePreviewUrl — electron-protocol branch (M4 AC8)', () => {
  test('emits openknowledge:// URL when OK_ELECTRON_PROTOCOL_HOST=1 + contentDir is real', () => {
    process.env.OK_ELECTRON_PROTOCOL_HOST = '1';
    const result = resolvePreviewUrl('docs/a', {
      config: BASE_CONFIG,
      lockDir,
      contentDir: tmpDir,
    });

    expect(result?.source).toBe('electron-protocol');
    // realpath flattens symlinks; on macOS `/tmp` is a symlink to `/private/tmp`.
    // Accept either the raw tmpDir OR its realpath-resolved form.
    expect(result?.url).toMatch(/^openknowledge:\/\/open\?project=.+&doc=docs%2Fa$/);
  });

  test('wins over env when both set (highest precedence)', () => {
    process.env.OK_ELECTRON_PROTOCOL_HOST = '1';
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    const result = resolvePreviewUrl('docs/a', {
      config: BASE_CONFIG,
      lockDir,
      contentDir: tmpDir,
    });
    expect(result?.source).toBe('electron-protocol');
  });

  test('encoded project + doc per-segment via encodeURIComponent', () => {
    process.env.OK_ELECTRON_PROTOCOL_HOST = '1';
    const result = resolvePreviewUrl('sub/My Doc.md', {
      config: BASE_CONFIG,
      lockDir,
      contentDir: tmpDir,
    });
    // `/` in docName is encoded as `%2F` (encodeURIComponent of the whole
    // string — distinct from the http-hash-path encoding that keeps `/`).
    expect(result?.url).toContain('doc=sub%2FMy%20Doc.md');
  });

  test('falls through to http sources when OK_ELECTRON_PROTOCOL_HOST is absent', () => {
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 5173);
    const result = resolvePreviewUrl('docs/a', {
      config: BASE_CONFIG,
      lockDir,
      contentDir: tmpDir,
    });
    expect(result?.source).toBe('lock');
  });

  test('falls through when OK_ELECTRON_PROTOCOL_HOST is not exactly "1"', () => {
    process.env.OK_ELECTRON_PROTOCOL_HOST = '0';
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 5173);
    const result = resolvePreviewUrl('docs/a', {
      config: BASE_CONFIG,
      lockDir,
      contentDir: tmpDir,
    });
    expect(result?.source).toBe('lock');
  });

  test('falls through when contentDir is missing (no project context)', () => {
    process.env.OK_ELECTRON_PROTOCOL_HOST = '1';
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 5173);
    // No contentDir in ctx → Electron branch cannot compute realpath.
    const result = resolvePreviewUrl('docs/a', {
      config: BASE_CONFIG,
      lockDir,
    });
    expect(result?.source).toBe('lock');
  });

  test('falls through when contentDir does not exist on disk (realpath throws)', () => {
    process.env.OK_ELECTRON_PROTOCOL_HOST = '1';
    const config = { ...BASE_CONFIG, preview: { baseUrl: 'https://fallback.example' } };
    const result = resolvePreviewUrl('docs/a', {
      config,
      lockDir,
      contentDir: '/nonexistent/path/that/should/never/exist/xyz',
    });
    expect(result?.source).toBe('config');
  });

  test('attach-mode contract: desktop attach to running CLI emits http://, not openknowledge://', () => {
    // QA-056 regression pin. When the desktop app attaches to an already-
    // running `ok start` CLI (window-manager attach-mode branch), it does
    // NOT fork a utility — so OK_ELECTRON_PROTOCOL_HOST=1 never lands in
    // the CLI's utility env. The MCP server runs in the CLI's process and
    // resolvePreviewUrl sees no env var → emits http://localhost/... via the
    // `lock` source. This matches the SPEC §3 NG contract: CLI/bunx consumers
    // always get http URLs, never the openknowledge:// scheme. Document this
    // explicitly so a future change to attach-mode can't silently flip the
    // contract without a failing test.
    // Precondition: env var is NOT set (attach mode is env-less from the
    // CLI's perspective — desktop never forked it).
    expect(process.env.OK_ELECTRON_PROTOCOL_HOST).toBeUndefined();

    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 5173);
    const result = resolvePreviewUrl('docs/a', {
      config: BASE_CONFIG,
      lockDir,
      contentDir: tmpDir,
    });

    expect(result?.source).toBe('lock');
    expect(result?.url.startsWith('http://')).toBe(true);
    expect(result?.url.startsWith('openknowledge://')).toBe(false);
  });
});

describe('resolvePreviewUrl — priority', () => {
  test('env wins over lock and config', () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 5173);
    const config = { ...BASE_CONFIG, preview: { baseUrl: 'https://config.example' } };

    const result = resolvePreviewUrl('docs/a', { config, lockDir });

    expect(result).toEqual({ url: 'https://env.example/#/docs/a', source: 'env' });
  });

  test('lock wins over config when env absent', () => {
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 5173);
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
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    const config = { ...BASE_CONFIG, preview: { baseUrl: 'https://x.example' } };

    const result = resolvePreviewUrl('docs/a', { config, lockDir });

    expect(result).toEqual({ url: 'https://x.example/#/docs/a', source: 'config' });
  });

  test('lock always uses localhost, ignores hostname field', () => {
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 4242);

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
