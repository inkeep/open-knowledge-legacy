import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  acquireProcessLock,
  type LockName,
  lockFilePath,
  ProcessLockCollisionError,
  type ProcessLockMetadata,
  readProcessLock,
  releaseProcessLock,
  updateProcessLockPort,
} from './process-lock';

const LOCK_NAME: LockName = 'ui';

let tmpDir: string;
let lockDir: string;
let lockPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-process-lock-test-'));
  lockDir = resolve(tmpDir, '.open-knowledge');
  lockPath = lockFilePath(lockDir, LOCK_NAME);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('acquireProcessLock', () => {
  test('creates lock file at <lockDir>/<lockName>.lock with correct metadata', () => {
    const handle = acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 3000, worktreeRoot: '/my/wt' },
    });

    expect(handle.lockPath).toBe(lockPath);
    expect(existsSync(lockPath)).toBe(true);
    expect(lockPath.endsWith('ui.lock')).toBe(true);

    const md: ProcessLockMetadata = JSON.parse(readFileSync(lockPath, 'utf-8'));
    expect(md.pid).toBe(process.pid);
    expect(md.hostname).toBe(hostname());
    expect(md.port).toBe(3000);
    expect(md.worktreeRoot).toBe('/my/wt');
    expect(Number.isNaN(Date.parse(md.startedAt))).toBe(false);
  });

  test('creates lockDir when missing', () => {
    expect(existsSync(lockDir)).toBe(false);
    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 0, worktreeRoot: '/wt' },
    });
    expect(existsSync(lockDir)).toBe(true);
  });

  test('accepts port=0 sentinel (process starting)', () => {
    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 0, worktreeRoot: '/wt' },
    });
    const md: ProcessLockMetadata = JSON.parse(readFileSync(lockPath, 'utf-8'));
    expect(md.port).toBe(0);
  });

  test('writes distinct files for different lockNames in the same lockDir', () => {
    acquireProcessLock({
      lockName: 'server',
      lockDir,
      metadata: { port: 1111, worktreeRoot: '/wt' },
    });
    acquireProcessLock({ lockName: 'ui', lockDir, metadata: { port: 2222, worktreeRoot: '/wt' } });

    expect(existsSync(lockFilePath(lockDir, 'server'))).toBe(true);
    expect(existsSync(lockFilePath(lockDir, 'ui'))).toBe(true);

    const serverMd = JSON.parse(readFileSync(lockFilePath(lockDir, 'server'), 'utf-8'));
    const uiMd = JSON.parse(readFileSync(lockFilePath(lockDir, 'ui'), 'utf-8'));
    expect(serverMd.port).toBe(1111);
    expect(uiMd.port).toBe(2222);
  });

  test('replaces stale lock from dead process', () => {
    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 1, worktreeRoot: '/old' },
    });
    const stale: ProcessLockMetadata = {
      pid: 99999999,
      hostname: hostname(),
      port: 1234,
      startedAt: new Date().toISOString(),
      worktreeRoot: '/old',
    };
    writeFileSync(lockPath, JSON.stringify(stale), 'utf-8');

    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 3000, worktreeRoot: '/new' },
    });

    const md: ProcessLockMetadata = JSON.parse(readFileSync(lockPath, 'utf-8'));
    expect(md.pid).toBe(process.pid);
    expect(md.port).toBe(3000);
    expect(md.worktreeRoot).toBe('/new');
  });

  test('throws ProcessLockCollisionError when lock owner is alive', () => {
    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 0, worktreeRoot: '/seed' },
    });
    const live: ProcessLockMetadata = {
      pid: 1, // init/launchd, always alive on POSIX
      hostname: hostname(),
      port: 9000,
      startedAt: new Date().toISOString(),
      worktreeRoot: '/other',
    };
    writeFileSync(lockPath, JSON.stringify(live), 'utf-8');

    const tryAgain = () =>
      acquireProcessLock({
        lockName: LOCK_NAME,
        lockDir,
        metadata: { port: 3000, worktreeRoot: '/me' },
      });
    expect(tryAgain).toThrow(ProcessLockCollisionError);
    try {
      tryAgain();
    } catch (err) {
      expect(err).toBeInstanceOf(ProcessLockCollisionError);
      if (err instanceof ProcessLockCollisionError) {
        expect(err.existing.pid).toBe(1);
        expect(err.existing.port).toBe(9000);
        expect(err.lockName).toBe(LOCK_NAME);
        expect(err.lockPath).toBe(lockPath);
        expect(err.message).toContain('already running on port 9000');
        expect(err.message).toContain(LOCK_NAME);
      }
    }
  });

  test('replaces corrupt lock file', () => {
    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 0, worktreeRoot: '/wt' },
    });
    writeFileSync(lockPath, 'not valid json', 'utf-8');

    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 3000, worktreeRoot: '/me' },
    });
    const md: ProcessLockMetadata = JSON.parse(readFileSync(lockPath, 'utf-8'));
    expect(md.pid).toBe(process.pid);
    expect(md.port).toBe(3000);
  });

  test('is idempotent for same process (refreshes port/startedAt)', () => {
    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 1111, worktreeRoot: '/wt1' },
    });
    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 2222, worktreeRoot: '/wt2' },
    });

    const md: ProcessLockMetadata = JSON.parse(readFileSync(lockPath, 'utf-8'));
    expect(md.pid).toBe(process.pid);
    expect(md.port).toBe(2222);
    expect(md.worktreeRoot).toBe('/wt2');
  });

  test('replaces lock from different hostname', () => {
    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 0, worktreeRoot: '/tmp' },
    });
    const remote: ProcessLockMetadata = {
      pid: 1,
      hostname: 'some-other-host',
      port: 3000,
      startedAt: new Date().toISOString(),
      worktreeRoot: '/remote',
    };
    writeFileSync(lockPath, JSON.stringify(remote), 'utf-8');

    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 3001, worktreeRoot: '/me' },
    });
    const md: ProcessLockMetadata = JSON.parse(readFileSync(lockPath, 'utf-8'));
    expect(md.pid).toBe(process.pid);
    expect(md.port).toBe(3001);
  });

  test('handle.release removes the lock we just acquired', () => {
    const handle = acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 3000, worktreeRoot: '/me' },
    });
    expect(existsSync(lockPath)).toBe(true);
    handle.release();
    expect(existsSync(lockPath)).toBe(false);
  });

  test('handle.updatePort updates only port, preserving other fields', () => {
    const handle = acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 0, worktreeRoot: '/me' },
    });
    const before: ProcessLockMetadata = JSON.parse(readFileSync(lockPath, 'utf-8'));
    handle.updatePort(3000);
    const after: ProcessLockMetadata = JSON.parse(readFileSync(lockPath, 'utf-8'));
    expect(after.port).toBe(3000);
    expect(after.pid).toBe(before.pid);
    expect(after.startedAt).toBe(before.startedAt);
    expect(after.worktreeRoot).toBe(before.worktreeRoot);
  });
});

describe('updateProcessLockPort', () => {
  test('no-op when lock file is missing', () => {
    updateProcessLockPort({ lockName: LOCK_NAME, lockDir, port: 3000 });
    expect(existsSync(lockPath)).toBe(false);
  });

  test('refuses to overwrite a lock owned by a different pid', () => {
    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 0, worktreeRoot: '/me' },
    });
    const foreign: ProcessLockMetadata = {
      pid: 1,
      hostname: hostname(),
      port: 1234,
      startedAt: new Date().toISOString(),
      worktreeRoot: '/other',
    };
    writeFileSync(lockPath, JSON.stringify(foreign), 'utf-8');

    updateProcessLockPort({ lockName: LOCK_NAME, lockDir, port: 9999 });

    const md: ProcessLockMetadata = JSON.parse(readFileSync(lockPath, 'utf-8'));
    expect(md.pid).toBe(1);
    expect(md.port).toBe(1234);
  });

  test('ignores corrupt lock file', () => {
    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 0, worktreeRoot: '/wt' },
    });
    writeFileSync(lockPath, 'garbage', 'utf-8');
    updateProcessLockPort({ lockName: LOCK_NAME, lockDir, port: 3000 });
    expect(readFileSync(lockPath, 'utf-8')).toBe('garbage');
  });
});

describe('readProcessLock', () => {
  test('returns metadata when live lock exists on this host', () => {
    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 3000, worktreeRoot: '/me' },
    });
    const md = readProcessLock({ lockName: LOCK_NAME, lockDir });
    expect(md).not.toBeNull();
    expect(md?.pid).toBe(process.pid);
    expect(md?.port).toBe(3000);
  });

  test('returns null + unlinks stale lock (dead pid)', () => {
    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 0, worktreeRoot: '/wt' },
    });
    const stale: ProcessLockMetadata = {
      pid: 99999999,
      hostname: hostname(),
      port: 3000,
      startedAt: new Date().toISOString(),
      worktreeRoot: '/old',
    };
    writeFileSync(lockPath, JSON.stringify(stale), 'utf-8');

    expect(readProcessLock({ lockName: LOCK_NAME, lockDir })).toBeNull();
    expect(existsSync(lockPath)).toBe(false);
  });

  test('returns null for cross-host lock (does not unlink)', () => {
    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 0, worktreeRoot: '/wt' },
    });
    const remote: ProcessLockMetadata = {
      pid: 1,
      hostname: 'other-host',
      port: 3000,
      startedAt: new Date().toISOString(),
      worktreeRoot: '/remote',
    };
    writeFileSync(lockPath, JSON.stringify(remote), 'utf-8');

    expect(readProcessLock({ lockName: LOCK_NAME, lockDir })).toBeNull();
    expect(existsSync(lockPath)).toBe(true);
  });

  test('returns null when lock is missing', () => {
    expect(readProcessLock({ lockName: LOCK_NAME, lockDir })).toBeNull();
  });

  test('returns null for corrupt lock', () => {
    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 0, worktreeRoot: '/wt' },
    });
    writeFileSync(lockPath, 'garbage', 'utf-8');
    expect(readProcessLock({ lockName: LOCK_NAME, lockDir })).toBeNull();
  });

  test('reads only the named lock (does not cross-contaminate)', () => {
    acquireProcessLock({
      lockName: 'server',
      lockDir,
      metadata: { port: 1111, worktreeRoot: '/wt' },
    });
    expect(readProcessLock({ lockName: 'server', lockDir })?.port).toBe(1111);
    expect(readProcessLock({ lockName: 'ui', lockDir })).toBeNull();
  });
});

describe('releaseProcessLock', () => {
  test('removes lock owned by this process', () => {
    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 3000, worktreeRoot: '/me' },
    });
    expect(existsSync(lockPath)).toBe(true);
    releaseProcessLock({ lockName: LOCK_NAME, lockDir });
    expect(existsSync(lockPath)).toBe(false);
  });

  test('is safe to call multiple times', () => {
    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 3000, worktreeRoot: '/me' },
    });
    releaseProcessLock({ lockName: LOCK_NAME, lockDir });
    releaseProcessLock({ lockName: LOCK_NAME, lockDir });
    expect(existsSync(lockPath)).toBe(false);
  });

  test('no-op if lock does not exist', () => {
    releaseProcessLock({ lockName: LOCK_NAME, lockDir });
  });

  test('refuses to remove a lock owned by a different pid', () => {
    acquireProcessLock({
      lockName: LOCK_NAME,
      lockDir,
      metadata: { port: 0, worktreeRoot: '/me' },
    });
    const foreign: ProcessLockMetadata = {
      pid: 1,
      hostname: hostname(),
      port: 9000,
      startedAt: new Date().toISOString(),
      worktreeRoot: '/other',
    };
    writeFileSync(lockPath, JSON.stringify(foreign), 'utf-8');

    releaseProcessLock({ lockName: LOCK_NAME, lockDir });

    expect(existsSync(lockPath)).toBe(true);
    const md: ProcessLockMetadata = JSON.parse(readFileSync(lockPath, 'utf-8'));
    expect(md.pid).toBe(1);
  });
});
