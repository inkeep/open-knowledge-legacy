import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { sanitizeClientName } from '@inkeep/open-knowledge-server';
import {
  findProjectDir,
  resolveCwdWithFallback,
  rootUriToFsPath,
  tryListRootsFallback,
} from './server.ts';

describe('findProjectDir', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-mcp-resolve-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function seedProjectMarker(dir: string): void {
    mkdirSync(resolve(dir, '.ok'), { recursive: true });
    writeFileSync(resolve(dir, '.ok', 'config.yml'), '', 'utf-8');
  }

  test('returns the dir itself when `.ok/config.yml` is at the start', () => {
    seedProjectMarker(tmpDir);
    expect(findProjectDir(tmpDir)).toBe(resolve(tmpDir));
  });

  test('walks up from a subdirectory to the nearest project root', () => {
    seedProjectMarker(tmpDir);
    const sub = resolve(tmpDir, 'a', 'b', 'c');
    mkdirSync(sub, { recursive: true });
    expect(findProjectDir(sub)).toBe(resolve(tmpDir));
  });

  test('throws with a clear message when no `.ok/config.yml` ancestor exists', () => {
    expect(() => findProjectDir(tmpDir)).toThrow(/No Open Knowledge project found/);
  });

  test('rejects a regular file named `.ok` and keeps walking up', () => {
    writeFileSync(resolve(tmpDir, '.ok'), 'oops');
    expect(() => findProjectDir(tmpDir)).toThrow(/No Open Knowledge project found/);
  });

  test('rejects a dangling symlink at `.ok` and keeps walking up', () => {
    symlinkSync(resolve(tmpDir, 'does-not-exist'), resolve(tmpDir, '.ok'));
    expect(() => findProjectDir(tmpDir)).toThrow(/No Open Knowledge project found/);
  });

  test('rejects an empty `.ok/` directory with no config.yml and keeps walking up', () => {
    mkdirSync(resolve(tmpDir, '.ok'), { recursive: true });
    expect(() => findProjectDir(tmpDir)).toThrow(/No Open Knowledge project found/);
  });

  test('rejects a folder-rule-style `.ok/frontmatter.yml` without config.yml', () => {
    mkdirSync(resolve(tmpDir, '.ok'), { recursive: true });
    writeFileSync(resolve(tmpDir, '.ok', 'frontmatter.yml'), 'title: oops\n', 'utf-8');
    expect(() => findProjectDir(tmpDir)).toThrow(/No Open Knowledge project found/);
  });

  test('rejects a directory at `.ok/config.yml` (not a file) and keeps walking up', () => {
    mkdirSync(resolve(tmpDir, '.ok', 'config.yml'), { recursive: true });
    expect(() => findProjectDir(tmpDir)).toThrow(/No Open Knowledge project found/);
  });

  test('walks past a folder-rule `.ok/` sidecar to the real project root above', () => {
    seedProjectMarker(tmpDir);
    const inner = resolve(tmpDir, 'specs', 'foo');
    mkdirSync(resolve(inner, '.ok'), { recursive: true });
    writeFileSync(resolve(inner, '.ok', 'frontmatter.yml'), 'title: x\n', 'utf-8');
    expect(findProjectDir(inner)).toBe(resolve(tmpDir));
  });

  test('prefers the nearest project root over a deeper stray `.ok` file', () => {
    seedProjectMarker(tmpDir);
    const inner = resolve(tmpDir, 'inner');
    mkdirSync(inner, { recursive: true });
    writeFileSync(resolve(inner, '.ok'), 'oops');
    expect(findProjectDir(inner)).toBe(resolve(tmpDir));
  });
});

describe('sanitizeClientName', () => {
  test('returns fallback for undefined input', () => {
    expect(sanitizeClientName(undefined, 'fallback-id')).toBe('fallback-id');
  });

  test('returns fallback for empty string', () => {
    expect(sanitizeClientName('', 'fallback-id')).toBe('fallback-id');
  });

  test('returns fallback for whitespace-only input', () => {
    expect(sanitizeClientName('   \t\n  ', 'fallback-id')).toBe('fallback-id');
  });

  test('strips ASCII control characters (0x00-0x1F, 0x7F)', () => {
    expect(sanitizeClientName('cl\x00aud\x07e\x1Fco\x7Fde', 'fb')).toBe('cl aud e co de');
  });

  test('collapses runs of whitespace to a single space', () => {
    expect(sanitizeClientName('claude    code\t\tcli', 'fb')).toBe('claude code cli');
  });

  test('truncates at 128 chars', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeClientName(long, 'fb').length).toBe(128);
  });

  test('preserves ordinary printable input unchanged', () => {
    expect(sanitizeClientName('Claude v2.1.0', 'fb')).toBe('Claude v2.1.0');
  });
});

describe('rootUriToFsPath', () => {
  test('decodes a standard file:// URI to an absolute path', () => {
    expect(rootUriToFsPath('file:///Users/me/proj')).toBe('/Users/me/proj');
  });

  test('decodes percent-encoded path components', () => {
    expect(rootUriToFsPath('file:///Users/me/My%20Project')).toBe('/Users/me/My Project');
  });

  test('returns undefined for non-file: schemes', () => {
    expect(rootUriToFsPath('http://example.com/proj')).toBeUndefined();
    expect(rootUriToFsPath('ws://localhost:8080')).toBeUndefined();
    expect(rootUriToFsPath('vscode://settings')).toBeUndefined();
  });

  test('returns undefined for malformed URIs', () => {
    expect(rootUriToFsPath('not a uri')).toBeUndefined();
    expect(rootUriToFsPath('')).toBeUndefined();
  });
});

describe('tryListRootsFallback', () => {
  const failIfCalled = (): never => {
    throw new Error('listRoots() should not be called');
  };

  test('returns undefined when client has no roots capability', async () => {
    const result = await tryListRootsFallback({
      getClientCapabilities: () => ({}),
      listRoots: failIfCalled,
    });
    expect(result).toBeUndefined();
  });

  test('returns undefined when getClientCapabilities returns undefined', async () => {
    const result = await tryListRootsFallback({
      getClientCapabilities: () => undefined,
      listRoots: failIfCalled,
    });
    expect(result).toBeUndefined();
  });

  test('returns the fsPath of the sole file:// root', async () => {
    const result = await tryListRootsFallback({
      getClientCapabilities: () => ({ roots: {} }),
      listRoots: async () => ({ roots: [{ uri: 'file:///Users/me/proj' }] }),
    });
    expect(result).toBe('/Users/me/proj');
  });

  test('returns undefined when the client advertises zero roots', async () => {
    const result = await tryListRootsFallback({
      getClientCapabilities: () => ({ roots: {} }),
      listRoots: async () => ({ roots: [] }),
    });
    expect(result).toBeUndefined();
  });

  test('returns undefined when the client advertises multiple roots', async () => {
    const result = await tryListRootsFallback({
      getClientCapabilities: () => ({ roots: {} }),
      listRoots: async () => ({
        roots: [{ uri: 'file:///a' }, { uri: 'file:///b' }],
      }),
    });
    expect(result).toBeUndefined();
  });

  test('returns undefined for a non-file scheme root', async () => {
    const result = await tryListRootsFallback({
      getClientCapabilities: () => ({ roots: {} }),
      listRoots: async () => ({ roots: [{ uri: 'vscode://settings' }] }),
    });
    expect(result).toBeUndefined();
  });

  test('logs when the single root URI cannot be resolved to a fs path', async () => {
    const logs: string[] = [];
    const result = await tryListRootsFallback({
      getClientCapabilities: () => ({ roots: {} }),
      listRoots: async () => ({ roots: [{ uri: 'vscode://settings' }] }),
      log: (msg) => logs.push(msg),
    });
    expect(result).toBeUndefined();
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('single root URI not usable as fs path');
    expect(logs[0]).toContain('vscode://settings');
  });

  test('returns undefined when the listRoots response omits the roots array', async () => {
    const result = await tryListRootsFallback({
      getClientCapabilities: () => ({ roots: {} }),
      listRoots: async () => ({}) as unknown as { roots: { uri: string }[] },
    });
    expect(result).toBeUndefined();
  });

  test('returns undefined and logs when listRoots() throws', async () => {
    const logs: string[] = [];
    const result = await tryListRootsFallback({
      getClientCapabilities: () => ({ roots: {} }),
      listRoots: async () => {
        throw new Error('transport closed');
      },
      log: (msg) => logs.push(msg),
    });
    expect(result).toBeUndefined();
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('listRoots fallback failed');
    expect(logs[0]).toContain('transport closed');
  });

  test('coerces non-Error throwables in the log message', async () => {
    const logs: string[] = [];
    const result = await tryListRootsFallback({
      getClientCapabilities: () => ({ roots: {} }),
      listRoots: async () => {
        throw 'string-shaped failure';
      },
      log: (msg) => logs.push(msg),
    });
    expect(result).toBeUndefined();
    expect(logs[0]).toContain('string-shaped failure');
  });
});

describe('resolveCwdWithFallback', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-mcp-resolve-cwd-'));
    mkdirSync(resolve(tmpDir, '.ok'), { recursive: true });
    writeFileSync(resolve(tmpDir, '.ok', 'config.yml'), '', 'utf-8');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('prefers explicit cwd over the fallback', async () => {
    let fallbackCalls = 0;
    const result = await resolveCwdWithFallback(tmpDir, async () => {
      fallbackCalls += 1;
      return undefined;
    });
    expect(result).toBe(resolve(tmpDir));
    expect(fallbackCalls).toBe(0);
  });

  test('uses the fallback when cwd is omitted', async () => {
    const result = await resolveCwdWithFallback(undefined, async () => tmpDir);
    expect(result).toBe(resolve(tmpDir));
  });

  test('throws when cwd is omitted and the fallback returns undefined', async () => {
    await expect(resolveCwdWithFallback(undefined, async () => undefined)).rejects.toThrow(
      /`cwd` is required/,
    );
  });

  test('throws (via findProjectDir) when explicit cwd has no .ok ancestor', async () => {
    const noOkDir = await mkdtemp(resolve(tmpdir(), 'ok-mcp-no-project-'));
    try {
      await expect(resolveCwdWithFallback(noOkDir, async () => undefined)).rejects.toThrow(
        /No Open Knowledge project found/,
      );
    } finally {
      await rm(noOkDir, { recursive: true, force: true });
    }
  });

  test('throws (via findProjectDir) when the fallback returns a non-OK path', async () => {
    const noOkDir = await mkdtemp(resolve(tmpdir(), 'ok-mcp-fallback-no-project-'));
    try {
      await expect(resolveCwdWithFallback(undefined, async () => noOkDir)).rejects.toThrow(
        /No Open Knowledge project found/,
      );
    } finally {
      await rm(noOkDir, { recursive: true, force: true });
    }
  });
});
