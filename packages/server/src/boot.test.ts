import { describe as _bunDescribe, afterEach, beforeEach, expect, mock, test } from 'bun:test';

const describe = process.env.CI ? _bunDescribe.skip : _bunDescribe;

import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { bootServer } from './boot.ts';
import { ConfigSchema } from './config/schema.ts';
import { parseKeepaliveConnectionId } from './mcp-mount.ts';

const execFileAsync = promisify(execFile);
const TEST_CONFIG = ConfigSchema.parse({});

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-boot-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('bootServer — ensureProjectGitFn wiring (US-001)', () => {
  test('ensureProjectGitFn throw propagates — bootServer rejects before listen', async () => {
    const contentDir = resolve(tmpDir, 'fails');
    writeFileSync(resolve(tmpDir, 'placeholder'), '');

    const expectedError = new Error('simulated git-missing failure');
    const ensureProjectGitFn = mock(() => Promise.reject(expectedError));
    const autoInitFn = mock(() => true);

    await expect(
      bootServer({
        config: TEST_CONFIG,
        contentDir,
        port: 0,
        quiet: true,
        gitEnabled: false,
        ensureProjectGitFn,
        autoInitFn,
      }),
    ).rejects.toThrow('simulated git-missing failure');

    expect(ensureProjectGitFn.mock.calls.length).toBe(1);
    expect(autoInitFn.mock.calls.length).toBe(0);
  });

  test('didGitInit is populated from hook return value', async () => {
    const contentDir = mkdtempSync(resolve(tmpDir, 'bootdir-'));
    await execFileAsync('git', ['init', '--initial-branch=main', contentDir]);

    const ensureProjectGitFn = mock(() => Promise.resolve({ didInit: true }));

    const booted = await bootServer({
      config: TEST_CONFIG,
      contentDir,
      port: 0,
      quiet: true,
      gitEnabled: false,
      ensureProjectGitFn,
      idleShutdownMs: null,
      attachUiSibling: false,
    });

    try {
      expect(ensureProjectGitFn.mock.calls.length).toBe(1);
      expect(booted.didGitInit).toBe(true);
      expect(existsSync(resolve(contentDir, '.git/HEAD'))).toBe(true);
    } finally {
      await booted.destroy();
    }
  });

  test('skipAutoInit:true skips BOTH ensureProjectGitFn and autoInitFn', async () => {
    const contentDir = mkdtempSync(resolve(tmpDir, 'skip-'));
    await execFileAsync('git', ['init', '--initial-branch=main', contentDir]);

    const ensureProjectGitFn = mock(() => Promise.resolve({ didInit: true }));
    const autoInitFn = mock(() => true);

    const booted = await bootServer({
      config: TEST_CONFIG,
      contentDir,
      port: 0,
      quiet: true,
      gitEnabled: false,
      ensureProjectGitFn,
      autoInitFn,
      skipAutoInit: true,
      idleShutdownMs: null,
      attachUiSibling: false,
    });

    try {
      expect(ensureProjectGitFn.mock.calls.length).toBe(0);
      expect(autoInitFn.mock.calls.length).toBe(0);
      expect(booted.didGitInit).toBe(false);
      expect(booted.didAutoInit).toBe(false);
    } finally {
      await booted.destroy();
    }
  });

  test('omitting ensureProjectGitFn leaves didGitInit false (backward compat)', async () => {
    const contentDir = mkdtempSync(resolve(tmpDir, 'noop-'));
    await execFileAsync('git', ['init', '--initial-branch=main', contentDir]);

    const booted = await bootServer({
      config: TEST_CONFIG,
      contentDir,
      port: 0,
      quiet: true,
      gitEnabled: false,
      idleShutdownMs: null,
      attachUiSibling: false,
    });

    try {
      expect(booted.didGitInit).toBe(false);
    } finally {
      await booted.destroy();
    }
  });
});

describe('parseKeepaliveConnectionId', () => {
  test('returns null for undefined URL (defensive)', () => {
    expect(parseKeepaliveConnectionId(undefined)).toBeNull();
  });

  test('returns null for empty URL', () => {
    expect(parseKeepaliveConnectionId('')).toBeNull();
  });

  test('returns null when connectionId query param is absent', () => {
    expect(parseKeepaliveConnectionId('/collab/keepalive?pid=1234')).toBeNull();
  });

  test('returns null when connectionId is present but empty', () => {
    expect(parseKeepaliveConnectionId('/collab/keepalive?pid=1234&connectionId=')).toBeNull();
  });

  test('returns the connectionId when present (happy path)', () => {
    expect(parseKeepaliveConnectionId('/collab/keepalive?pid=1234&connectionId=uuid-A')).toBe(
      'uuid-A',
    );
  });

  test('rejects percent-encoded connectionId values that decode to invalid chars', () => {
    expect(
      parseKeepaliveConnectionId('/collab/keepalive?connectionId=user%2Fagent%3D1%262'),
    ).toBeNull();
  });

  test('rejects connectionId containing CR/LF (log-injection defense)', () => {
    expect(parseKeepaliveConnectionId('/collab/keepalive?connectionId=abc%0D%0Aadmin')).toBeNull();
  });

  test('tolerates query order', () => {
    expect(parseKeepaliveConnectionId('/collab/keepalive?connectionId=foo&pid=1')).toBe('foo');
  });

  test('tolerates a UUID-shaped connectionId', () => {
    expect(
      parseKeepaliveConnectionId(
        '/collab/keepalive?connectionId=abcdef12-3456-7890-abcd-ef1234567890',
      ),
    ).toBe('abcdef12-3456-7890-abcd-ef1234567890');
  });

  test('does not throw on a blatantly malformed URL', () => {
    expect(() => parseKeepaliveConnectionId('?connectionId=foo')).not.toThrow();
    expect(parseKeepaliveConnectionId('?connectionId=foo')).toBe('foo');
  });

  test('never throws on garbage input', () => {
    expect(() => parseKeepaliveConnectionId('not a url at all')).not.toThrow();
    expect(parseKeepaliveConnectionId('/collab/keepalive')).toBeNull();
  });
});
