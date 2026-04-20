import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGitInstance } from './git-handle.ts';
import { withParentLock } from './git-mutex.ts';

describe('createGitInstance (credential.helper opt-in)', () => {
  // simple-git 3.36+ blocks `credential.helper` in `config` unless the caller
  // opts into `unsafe.allowUnsafeCredentialHelper`. Tier A (gh) and Tier B/C
  // (stored token) both pass a `credential.helper=!…` string — regression
  // guard so a future refactor can't silently drop the opt-in.
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ok-git-handle-test-'));
    execSync('git init -q', { cwd: tmpDir });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('accepts credential.helper config without throwing the allowUnsafeCredentialHelper error', async () => {
    const handle = createGitInstance(tmpDir, {
      credentialArgs: ['-c', 'credential.helper=!open-knowledge auth git-credential'],
    });
    // Any command triggers simple-git's block-unsafe-operations plugin, which
    // scans argv synchronously before spawning git. `--version` is the lightest
    // probe that exercises that plugin path.
    const version = await handle.git.raw(['--version']);
    expect(version).toContain('git version');
  });
});

describe('withParentLock', () => {
  test('serializes concurrent operations in enqueue order', async () => {
    const order: number[] = [];

    await Promise.all([
      withParentLock(async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(1);
      }),
      withParentLock(async () => {
        order.push(2);
      }),
      withParentLock(async () => {
        order.push(3);
      }),
    ]);

    expect(order).toEqual([1, 2, 3]);
  });

  test('continues after a failed task', async () => {
    const results: string[] = [];

    await Promise.allSettled([
      withParentLock(async () => {
        throw new Error('task 1 failed');
      }),
      withParentLock(async () => {
        results.push('task 2');
      }),
    ]);

    expect(results).toContain('task 2');
  });

  test('returns the resolved value', async () => {
    const result = await withParentLock(async () => 42);
    expect(result).toBe(42);
  });

  test('propagates errors to caller', async () => {
    await expect(
      withParentLock(async () => {
        throw new Error('deliberate failure');
      }),
    ).rejects.toThrow('deliberate failure');
  });
});

// Suppress unused import warnings for lifecycle hooks
void beforeEach;
void afterEach;
