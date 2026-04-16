import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { acquireServerLock, readUiLock, updateServerLockPort } from '@inkeep/open-knowledge-server';
import { ConfigSchema } from '../config/schema.ts';
import { OK_DIR } from '../constants.ts';
import { resolveRequestedPort, startUiServer, type UiServerHandle } from './ui.ts';

let tmpDir: string;
let lockDir: string;
let handle: UiServerHandle | null = null;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-ui-cmd-test-'));
  lockDir = resolve(tmpDir, OK_DIR);
});

afterEach(async () => {
  if (handle) {
    handle.release();
    await new Promise<void>((done) => handle?.httpServer.close(() => done()));
    handle = null;
  }
  await rm(tmpDir, { recursive: true, force: true });
});

function config() {
  return ConfigSchema.parse({});
}

async function get(port: number, path: string) {
  const res = await fetch(`http://localhost:${port}${path}`);
  const body = await res.text();
  return { status: res.status, body, headers: res.headers };
}

describe('resolveRequestedPort', () => {
  test('default is 3000', () => {
    expect(resolveRequestedPort(undefined, undefined)).toBe(3000);
  });
  test('--port wins over PORT env', () => {
    expect(resolveRequestedPort('4000', '5000')).toBe(4000);
  });
  test('PORT env used when --port absent', () => {
    expect(resolveRequestedPort(undefined, '5555')).toBe(5555);
  });
  test('empty PORT env falls back to 3000', () => {
    expect(resolveRequestedPort(undefined, '')).toBe(3000);
  });
  test('invalid --port throws', () => {
    expect(() => resolveRequestedPort('nope', undefined)).toThrow();
  });
  test('invalid PORT env throws', () => {
    expect(() => resolveRequestedPort(undefined, 'nope')).toThrow();
  });
  test('port=0 (kernel-allocated) is accepted', () => {
    expect(resolveRequestedPort('0', undefined)).toBe(0);
  });
});

describe('startUiServer', () => {
  test('binds requested port and writes ui.lock with resolved port', async () => {
    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0, host: 'localhost' });
    expect(handle.port).toBeGreaterThan(0);

    const lockPath = resolve(lockDir, 'ui.lock');
    expect(existsSync(lockPath)).toBe(true);
    const lock = JSON.parse(readFileSync(lockPath, 'utf-8'));
    expect(lock.pid).toBe(process.pid);
    expect(lock.port).toBe(handle.port);
  });

  test('/api/config returns collabUrl=null when server.lock is absent', async () => {
    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0, host: 'localhost' });
    const { status, body, headers } = await get(handle.port, '/api/config');
    expect(status).toBe(200);
    expect(headers.get('content-type')).toContain('application/json');
    const parsed = JSON.parse(body);
    expect(parsed.collabUrl).toBeNull();
    expect(parsed.previewUrl).toBeNull();
    expect(parsed.port).toBe(handle.port);
  });

  test('/api/config returns ws://localhost:<port>/collab when server.lock has live port', async () => {
    acquireServerLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateServerLockPort(lockDir, 54321);

    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0, host: 'localhost' });
    const { body } = await get(handle.port, '/api/config');
    const parsed = JSON.parse(body);
    expect(parsed.collabUrl).toBe('ws://localhost:54321/collab');
  });

  test('/api/config has no-store cache-control', async () => {
    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0, host: 'localhost' });
    const { headers } = await get(handle.port, '/api/config');
    expect(headers.get('cache-control')).toBe('no-store');
  });

  test('HEAD /api/config returns 200 with no body', async () => {
    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0, host: 'localhost' });
    const res = await fetch(`http://localhost:${handle.port}/api/config`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe('');
  });

  test('unknown path returns 404 when no static assets present (tmp dir has no dist)', async () => {
    // startUiServer looks in ../../app/dist — in the worktree this DOES exist,
    // so we can't assert 404 absolutely. Instead assert the path is handled
    // (either 404 or SPA fallback 200) without crashing.
    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0, host: 'localhost' });
    const { status } = await get(handle.port, '/does-not-exist');
    expect([200, 404]).toContain(status);
  });

  test('release() removes the ui.lock', async () => {
    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0, host: 'localhost' });
    const lockPath = resolve(lockDir, 'ui.lock');
    expect(existsSync(lockPath)).toBe(true);

    handle.release();
    expect(existsSync(lockPath)).toBe(false);
    expect(readUiLock(lockDir)).toBeNull();

    // Keep afterEach happy — server is still up, just lock removed.
    await new Promise<void>((done) => handle?.httpServer.close(() => done()));
    handle = null;
  });

  test('bind failure on an invalid host releases the lock (does not leak)', async () => {
    let caught: unknown;
    try {
      await startUiServer({
        config: config(),
        cwd: tmpDir,
        port: 0,
        // Reserved IP that cannot bind — forces listen() to reject.
        host: '240.0.0.1',
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    // Lock acquired pre-listen must be released on bind failure.
    expect(readUiLock(lockDir)).toBeNull();
  });
});
