import { describe as _bunDescribe, afterEach, beforeEach, expect, test } from 'bun:test';

const describe = process.env.CI ? _bunDescribe.skip : _bunDescribe;

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { LOCAL_DIR, OK_DIR } from '@inkeep/open-knowledge-core';
import { acquireUiLock, updateUiLockPort } from '../../ui-lock.ts';
import { resolvePreviewUrl } from './preview-url.ts';

let tmpDir: string;
let lockDir: string;
let originalElectronProtocolEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-preview-url-'));
  lockDir = resolve(tmpDir, OK_DIR, LOCAL_DIR);
  originalElectronProtocolEnv = process.env.OK_ELECTRON_PROTOCOL_HOST;
  delete process.env.OK_ELECTRON_PROTOCOL_HOST;
});

afterEach(async () => {
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
    const result = resolvePreviewUrl('docs/a', { lockDir, contentDir: tmpDir });

    expect(result?.source).toBe('electron-protocol');
    expect(result?.url).toMatch(/^openknowledge:\/\/open\?project=.+&doc=docs%2Fa$/);
  });

  test('encoded project + doc per-segment via encodeURIComponent', () => {
    process.env.OK_ELECTRON_PROTOCOL_HOST = '1';
    const result = resolvePreviewUrl('sub/My Doc.md', { lockDir, contentDir: tmpDir });
    expect(result?.url).toContain('doc=sub%2FMy%20Doc.md');
  });

  test('falls through to lock when OK_ELECTRON_PROTOCOL_HOST is absent', () => {
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 5173);
    const result = resolvePreviewUrl('docs/a', { lockDir, contentDir: tmpDir });
    expect(result?.source).toBe('lock');
  });

  test('falls through when OK_ELECTRON_PROTOCOL_HOST is not exactly "1"', () => {
    process.env.OK_ELECTRON_PROTOCOL_HOST = '0';
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 5173);
    const result = resolvePreviewUrl('docs/a', { lockDir, contentDir: tmpDir });
    expect(result?.source).toBe('lock');
  });

  test('falls through when contentDir is missing (no project context)', () => {
    process.env.OK_ELECTRON_PROTOCOL_HOST = '1';
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 5173);
    const result = resolvePreviewUrl('docs/a', { lockDir });
    expect(result?.source).toBe('lock');
  });

  test('falls through when contentDir does not exist on disk (realpath throws)', () => {
    process.env.OK_ELECTRON_PROTOCOL_HOST = '1';
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 5173);
    const result = resolvePreviewUrl('docs/a', {
      lockDir,
      contentDir: '/nonexistent/path/that/should/never/exist/xyz',
    });
    expect(result?.source).toBe('lock');
  });

  test('attach-mode contract: desktop attach to running CLI emits http://, not openknowledge://', () => {
    expect(process.env.OK_ELECTRON_PROTOCOL_HOST).toBeUndefined();

    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 5173);
    const result = resolvePreviewUrl('docs/a', { lockDir, contentDir: tmpDir });

    expect(result?.source).toBe('lock');
    expect(result?.url.startsWith('http://')).toBe(true);
    expect(result?.url.startsWith('openknowledge://')).toBe(false);
  });
});

describe('resolvePreviewUrl — priority + lock edges', () => {
  test('electron-protocol wins over lock when both available', () => {
    process.env.OK_ELECTRON_PROTOCOL_HOST = '1';
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 5173);
    const result = resolvePreviewUrl('docs/a', { lockDir, contentDir: tmpDir });
    expect(result?.source).toBe('electron-protocol');
  });

  test('lock returns http://localhost URL when ui.lock is bound', () => {
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 5173);
    const result = resolvePreviewUrl('docs/a', { lockDir });
    expect(result).toEqual({ url: 'http://localhost:5173/#/docs/a', source: 'lock' });
  });

  test('lock with port=0 returns null (no further sources)', () => {
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    const result = resolvePreviewUrl('docs/a', { lockDir });
    expect(result).toBeNull();
  });

  test('lock always uses localhost, ignores hostname field', () => {
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 4242);
    const result = resolvePreviewUrl('docs/a', { lockDir });
    expect(result?.url.startsWith('http://localhost:4242/')).toBe(true);
  });

  test('null when no lock and no electron-protocol', () => {
    const result = resolvePreviewUrl('docs/a', { lockDir });
    expect(result).toBeNull();
  });
});

describe('resolvePreviewUrl — docName encoding (via lock branch)', () => {
  beforeEach(() => {
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 5173);
  });

  test('simple nested path', () => {
    const result = resolvePreviewUrl('notes/meeting', { lockDir });
    expect(result?.url).toBe('http://localhost:5173/#/notes/meeting');
  });

  test('spaces and em-dashes encoded', () => {
    const result = resolvePreviewUrl('notes/My Doc — 2026', { lockDir });
    expect(result?.url).toBe('http://localhost:5173/#/notes/My%20Doc%20%E2%80%94%202026');
  });

  test('question marks and hash signs encoded per-segment', () => {
    const result = resolvePreviewUrl('weird/? name', { lockDir });
    expect(result?.url).toBe('http://localhost:5173/#/weird/%3F%20name');
  });

  test('percent literal encoded', () => {
    const result = resolvePreviewUrl('with%percent', { lockDir });
    expect(result?.url).toBe('http://localhost:5173/#/with%25percent');
  });
});

describe('resolvePreviewUrl — round-trip via docNameFromHash', () => {
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

  beforeEach(() => {
    acquireUiLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateUiLockPort(lockDir, 5173);
  });

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
    const result = resolvePreviewUrl(docName, { lockDir });
    expect(result).not.toBeNull();
    const hashIdx = result?.url.indexOf('#') ?? -1;
    expect(hashIdx).toBeGreaterThan(-1);
    const hash = result?.url.slice(hashIdx);
    const decoded = docNameFromHash(hash ?? '');
    expect(decoded).toBe(docName);
  });

  test('trailing slash docName: decoder is lossy but safe', () => {
    const result = resolvePreviewUrl('trail/', { lockDir });
    const hash = result?.url.slice(result.url.indexOf('#'));
    expect(hash).toBe('#/trail/');
  });
});
