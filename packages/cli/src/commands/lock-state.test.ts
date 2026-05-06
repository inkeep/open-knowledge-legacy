import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectLock } from './lock-state.ts';

function freshLockDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ok-lock-state-'));
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('inspectLock', () => {
  test('missing lock file', () => {
    const dir = freshLockDir();
    const result = inspectLock(dir, 'server');
    expect(result.status).toBe('missing');
    expect(result.lockPath.endsWith('/server.lock')).toBe(true);
  });

  test('corrupt JSON', () => {
    const dir = freshLockDir();
    writeFileSync(join(dir, 'ui.lock'), 'not-json{{{', 'utf-8');
    const result = inspectLock(dir, 'ui');
    expect(result.status).toBe('corrupt');
  });

  test('valid JSON but missing pid is treated as corrupt', () => {
    const dir = freshLockDir();
    writeFileSync(join(dir, 'server.lock'), JSON.stringify({ port: 3000 }), 'utf-8');
    const result = inspectLock(dir, 'server');
    expect(result.status).toBe('corrupt');
  });

  test('foreign host', () => {
    const dir = freshLockDir();
    writeFileSync(
      join(dir, 'server.lock'),
      JSON.stringify({
        pid: 12345,
        hostname: 'other-box',
        port: 3000,
        startedAt: '2026-04-16T00:00:00Z',
        worktreeRoot: '/x',
      }),
      'utf-8',
    );
    const result = inspectLock(dir, 'server', { host: 'this-box' });
    expect(result.status).toBe('foreign-host');
    if (result.status === 'foreign-host') {
      expect(result.lock.hostname).toBe('other-box');
    }
  });

  test('dead pid on same host', () => {
    const dir = freshLockDir();
    writeFileSync(
      join(dir, 'ui.lock'),
      JSON.stringify({
        pid: 999999,
        hostname: hostname(),
        port: 3000,
        startedAt: '2026-04-16T00:00:00Z',
        worktreeRoot: '/x',
      }),
      'utf-8',
    );
    const result = inspectLock(dir, 'ui', { isAlive: () => false });
    expect(result.status).toBe('dead-pid');
    if (result.status === 'dead-pid') {
      expect(result.lock.pid).toBe(999999);
    }
  });

  test('alive pid on same host', () => {
    const dir = freshLockDir();
    writeFileSync(
      join(dir, 'server.lock'),
      JSON.stringify({
        pid: 4242,
        hostname: hostname(),
        port: 52831,
        startedAt: '2026-04-16T00:00:00Z',
        worktreeRoot: '/x',
      }),
      'utf-8',
    );
    const result = inspectLock(dir, 'server', { isAlive: (pid) => pid === 4242 });
    expect(result.status).toBe('alive');
    if (result.status === 'alive') {
      expect(result.lock.pid).toBe(4242);
      expect(result.lock.port).toBe(52831);
    }
  });

  test('peeks do not mutate filesystem (dead pid lock remains for ok clean)', () => {
    const dir = freshLockDir();
    writeFileSync(
      join(dir, 'server.lock'),
      JSON.stringify({
        pid: 999999,
        hostname: hostname(),
        port: 0,
        startedAt: '2026-04-16T00:00:00Z',
        worktreeRoot: '/x',
      }),
      'utf-8',
    );
    const first = inspectLock(dir, 'server', { isAlive: () => false });
    expect(first.status).toBe('dead-pid');
    const second = inspectLock(dir, 'server', { isAlive: () => false });
    expect(second.status).toBe('dead-pid');
  });
});
