import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { bootServer } from './boot.ts';

const execFileAsync = promisify(execFile);

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
    // contentDir does not need to exist — we fail before createServer runs

    const expectedError = new Error('simulated git-missing failure');
    const ensureProjectGitFn = mock(() => Promise.reject(expectedError));
    const autoInitFn = mock(() => true);

    await expect(
      bootServer({
        contentDir,
        port: 0,
        quiet: true,
        gitEnabled: false,
        ensureProjectGitFn,
        autoInitFn,
      }),
    ).rejects.toThrow('simulated git-missing failure');

    // Hook called once; autoInitFn NEVER called because ensureProjectGitFn runs first
    expect(ensureProjectGitFn.mock.calls.length).toBe(1);
    expect(autoInitFn.mock.calls.length).toBe(0);
  });

  test('didGitInit is populated from hook return value', async () => {
    const contentDir = mkdtempSync(resolve(tmpDir, 'bootdir-'));
    // Pre-init real .git/ so createServer + shadow repo init succeed fast
    await execFileAsync('git', ['init', '--initial-branch=main', contentDir]);

    const ensureProjectGitFn = mock(() => Promise.resolve({ didInit: true }));

    const booted = await bootServer({
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
