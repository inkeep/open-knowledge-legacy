import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  acquireServerLock,
  type ServerLockMetadata,
  updateServerLockPort,
} from '@inkeep/open-knowledge-server';
import { discoverServerUrl } from './mcp.ts';

let tmpDir: string;
let lockDir: string;
let lockPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-mcp-discovery-'));
  lockDir = resolve(tmpDir, '.open-knowledge');
  lockPath = resolve(lockDir, 'server.lock');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('discoverServerUrl', () => {
  test('no lock file → disk-only (no serverUrl)', () => {
    const result = discoverServerUrl({ lockDir, host: 'localhost', portOverride: undefined });
    expect(result.serverUrl).toBeUndefined();
    expect(result.message).toContain('no running instance');
  });

  test('live lock with port > 0 → ws://127.0.0.1:<port>', () => {
    acquireServerLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateServerLockPort(lockDir, 5173);

    const result = discoverServerUrl({ lockDir, host: 'localhost', portOverride: undefined });
    expect(result.serverUrl).toBe('ws://127.0.0.1:5173');
    expect(result.message).toContain('connected to running instance');
    expect(result.message).toContain('5173');
  });

  test('lock with port=0 → disk-only (server still starting)', () => {
    acquireServerLock(lockDir, { port: 0, worktreeRoot: tmpDir });

    const result = discoverServerUrl({ lockDir, host: 'localhost', portOverride: undefined });
    expect(result.serverUrl).toBeUndefined();
    expect(result.message).toContain('still starting');
  });

  test('stale lock (dead pid) → disk-only, lock is unlinked', () => {
    const stale: ServerLockMetadata = {
      pid: 99999999,
      hostname: hostname(),
      port: 5173,
      startedAt: new Date().toISOString(),
      worktreeRoot: tmpDir,
    };
    // Seed lockDir then overwrite with a dead-pid lock
    acquireServerLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    writeFileSync(lockPath, JSON.stringify(stale), 'utf-8');

    const result = discoverServerUrl({ lockDir, host: 'localhost', portOverride: undefined });
    expect(result.serverUrl).toBeUndefined();
    expect(result.message).toContain('no running instance');
    expect(existsSync(lockPath)).toBe(false);
  });

  test('cross-host lock → disk-only, lock preserved on disk', () => {
    const remote: ServerLockMetadata = {
      pid: 1,
      hostname: 'some-other-host',
      port: 5173,
      startedAt: new Date().toISOString(),
      worktreeRoot: tmpDir,
    };
    acquireServerLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    writeFileSync(lockPath, JSON.stringify(remote), 'utf-8');

    const result = discoverServerUrl({ lockDir, host: 'localhost', portOverride: undefined });
    expect(result.serverUrl).toBeUndefined();
    expect(existsSync(lockPath)).toBe(true);
  });

  test('--port override bypasses lock discovery (live lock present)', () => {
    acquireServerLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateServerLockPort(lockDir, 5173);

    const result = discoverServerUrl({ lockDir, host: 'localhost', portOverride: '9999' });
    expect(result.serverUrl).toBe('ws://localhost:9999');
    expect(result.message).toContain('--port override');
  });

  test('--port=0 override → disk-only regardless of lock', () => {
    acquireServerLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateServerLockPort(lockDir, 5173);

    const result = discoverServerUrl({ lockDir, host: 'localhost', portOverride: '0' });
    expect(result.serverUrl).toBeUndefined();
    expect(result.message).toContain('disk-only');
  });

  test('--port override uses provided host', () => {
    const result = discoverServerUrl({ lockDir, host: '0.0.0.0', portOverride: '4444' });
    expect(result.serverUrl).toBe('ws://0.0.0.0:4444');
  });

  test('--port with non-numeric value → disk-only with invalid message', () => {
    const result = discoverServerUrl({ lockDir, host: 'localhost', portOverride: 'abc' });
    expect(result.serverUrl).toBeUndefined();
    expect(result.message).toContain('invalid');
    expect(result.message).toContain('abc');
  });
});
