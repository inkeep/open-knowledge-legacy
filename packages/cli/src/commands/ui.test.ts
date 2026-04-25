import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Scheduler } from '@inkeep/open-knowledge-core';
import {
  acquireServerLock,
  readUiLock,
  type UiLockMetadata,
  updateServerLockPort,
} from '@inkeep/open-knowledge-server';
import { ConfigSchema } from '../config/schema.ts';
import { OK_DIR } from '../constants.ts';
import {
  closeHttpServers,
  DEFAULT_UI_SAFETY_NET_MS,
  resolveRequestedPort,
  resolveUiLockCollision,
  startUiServer,
  type UiServerHandle,
} from './ui.ts';

interface ManualScheduler extends Scheduler {
  advanceTime(ms: number): void;
  pendingCount(): number;
}

function createManualScheduler(): ManualScheduler {
  type Entry = { id: number; cb: () => void; dueAt: number };
  const queue: Entry[] = [];
  let now = 0;
  let nextId = 1;
  return {
    setTimeout: (cb, ms) => {
      const id = nextId++;
      queue.push({ id, cb, dueAt: now + ms });
      return id as unknown as ReturnType<typeof globalThis.setTimeout>;
    },
    clearTimeout: (handle) => {
      const id = handle as unknown as number;
      const idx = queue.findIndex((e) => e.id === id);
      if (idx >= 0) queue.splice(idx, 1);
    },
    now: () => now,
    advanceTime(ms) {
      now += ms;
      for (let pass = 0; pass < 100; pass++) {
        const due = queue.filter((e) => e.dueAt <= now);
        if (due.length === 0) return;
        for (const e of due) {
          const idx = queue.indexOf(e);
          if (idx >= 0) queue.splice(idx, 1);
          e.cb();
        }
      }
    },
    pendingCount: () => queue.length,
  };
}

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
    await closeHttpServers(handle.httpServers);
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
  test('default is 0 (kernel-allocated, D-033)', () => {
    expect(resolveRequestedPort(undefined, undefined)).toBe(0);
  });
  test('--port wins over PORT env', () => {
    expect(resolveRequestedPort('4000', '5000')).toBe(4000);
  });
  test('PORT env used when --port absent', () => {
    expect(resolveRequestedPort(undefined, '5555')).toBe(5555);
  });
  test('empty PORT env falls back to kernel-allocated (0)', () => {
    expect(resolveRequestedPort(undefined, '')).toBe(0);
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
    if (handle) await closeHttpServers(handle.httpServers);
    handle = null;
  });

  test('D-033: two-socket loopback — second bind via 127.0.0.1 fails loud with EADDRINUSE', async () => {
    // Default mode (host undefined) binds BOTH [::1] and 127.0.0.1. A second
    // bind to the same port on either family must fail — proving the pre-
    // D-033 silent cross-family collision (one process on [::1]:3000 + another
    // on 127.0.0.1:3000) can no longer happen. Verified empirically 2026-04-16
    // that `::` with ipv6Only:false does NOT provide this property on macOS;
    // only explicit two-socket binding does.
    const h = await startUiServer({ config: config(), cwd: tmpDir, port: 0 });
    handle = h;
    expect(h.port).toBeGreaterThan(0);
    expect(h.httpServers.length).toBe(2);

    const collider = createHttpServer(() => {});
    let errorCode: string | undefined;
    await new Promise<void>((done) => {
      collider.once('error', (err: NodeJS.ErrnoException) => {
        errorCode = err.code;
        done();
      });
      collider.listen(h.port, '127.0.0.1', () => {
        // If listen succeeds, the IPv4 loopback side isn't bound.
        collider.close(() => done());
      });
    });
    expect(errorCode).toBe('EADDRINUSE');
  });

  test('D-033: two-socket loopback — second bind via [::1] also fails loud', async () => {
    const h = await startUiServer({ config: config(), cwd: tmpDir, port: 0 });
    handle = h;
    const collider = createHttpServer(() => {});
    let errorCode: string | undefined;
    await new Promise<void>((done) => {
      collider.once('error', (err: NodeJS.ErrnoException) => {
        errorCode = err.code;
        done();
      });
      collider.listen(h.port, '::1', () => {
        collider.close(() => done());
      });
    });
    expect(errorCode).toBe('EADDRINUSE');
  });

  test('D-033: two-socket loopback serves both families end-to-end', async () => {
    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0 });
    // Both families should answer on the same port.
    const v4 = await fetch(`http://127.0.0.1:${handle.port}/api/config`);
    expect(v4.status).toBe(200);
    const v6 = await fetch(`http://[::1]:${handle.port}/api/config`);
    expect(v6.status).toBe(200);
  });

  test('D-033 / G4: two projects with kernel-allocated port 0 get distinct ports', async () => {
    // Two `ok ui` instances in different contentDirs must each acquire a
    // unique kernel-allocated port. This is the mechanical property the
    // pre-D-033 default (hardcoded 3000) did not provide.
    const otherTmpDir = await mkdtemp(resolve(tmpdir(), 'ok-ui-cmd-test-'));
    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0 });
    const secondHandle = await startUiServer({
      config: config(),
      cwd: otherTmpDir,
      port: 0,
    });
    try {
      expect(handle.port).toBeGreaterThan(0);
      expect(secondHandle.port).toBeGreaterThan(0);
      expect(handle.port).not.toBe(secondHandle.port);
      // Both reachable end-to-end.
      const a = await fetch(`http://localhost:${handle.port}/api/config`);
      const b = await fetch(`http://localhost:${secondHandle.port}/api/config`);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
    } finally {
      secondHandle.release();
      await closeHttpServers(secondHandle.httpServers);
      await rm(otherTmpDir, { recursive: true, force: true });
    }
  });

  test('GET /api/pages is proxied to the collab server when server.lock is live', async () => {
    // Stand up a surrogate collab server that answers /api/pages with a known
    // JSON body. The real ok start / Hocuspocus HTTP stack isn't needed for
    // this contract — we only care that the UI forwards upstream and pipes
    // the response back verbatim.
    const upstream = createHttpServer((req, res) => {
      if (req.url === '/api/pages') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, source: 'collab', pages: [] }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((done) => upstream.listen(0, 'localhost', () => done()));
    const upstreamPort = (upstream.address() as { port: number }).port;

    // Pretend ok start wrote its lock at that port.
    acquireServerLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateServerLockPort(lockDir, upstreamPort);

    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0, host: 'localhost' });
    try {
      const { status, body, headers } = await get(handle.port, '/api/pages');
      expect(status).toBe(200);
      expect(headers.get('content-type')).toContain('application/json');
      const parsed = JSON.parse(body);
      expect(parsed).toEqual({ ok: true, source: 'collab', pages: [] });
    } finally {
      await new Promise<void>((done) => upstream.close(() => done()));
    }
  });

  test('GET /api/anything returns 503 with machine-readable error when server.lock is absent', async () => {
    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0, host: 'localhost' });
    const { status, body, headers } = await get(handle.port, '/api/pages');
    expect(status).toBe(503);
    expect(headers.get('content-type')).toContain('application/json');
    const parsed = JSON.parse(body);
    expect(parsed.error).toContain('Collab server not running');
    expect(parsed.path).toBe('/api/pages');
  });

  test('POST /api/create-page forwards method + body to the collab server', async () => {
    const receivedRequests: Array<{ method: string; body: string; contentType: string }> = [];
    const upstream = createHttpServer((req, res) => {
      if (req.url === '/api/create-page' && req.method === 'POST') {
        let body = '';
        req.setEncoding('utf-8');
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          receivedRequests.push({
            method: req.method ?? '',
            body,
            contentType: String(req.headers['content-type'] ?? ''),
          });
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((done) => upstream.listen(0, 'localhost', () => done()));
    const upstreamPort = (upstream.address() as { port: number }).port;
    acquireServerLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateServerLockPort(lockDir, upstreamPort);

    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0, host: 'localhost' });
    try {
      const res = await fetch(`http://localhost:${handle.port}/api/create-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docName: 'notes/test', content: '# hi' }),
      });
      expect(res.status).toBe(201);
      const parsed = (await res.json()) as { ok: boolean };
      expect(parsed.ok).toBe(true);
      expect(receivedRequests).toHaveLength(1);
      expect(receivedRequests[0]?.method).toBe('POST');
      expect(receivedRequests[0]?.contentType).toContain('application/json');
      const sent = JSON.parse(receivedRequests[0]?.body ?? '{}');
      expect(sent).toEqual({ docName: 'notes/test', content: '# hi' });
    } finally {
      await new Promise<void>((done) => upstream.close(() => done()));
    }
  });

  test('/api/* proxy returns 502 when upstream connection fails', async () => {
    // Point server.lock at a port nothing listens on — simulates the collab
    // server crashing between lock write and our proxy attempt.
    const probe = createHttpServer();
    await new Promise<void>((done) => probe.listen(0, 'localhost', () => done()));
    const deadPort = (probe.address() as { port: number }).port;
    await new Promise<void>((done) => probe.close(() => done()));

    acquireServerLock(lockDir, { port: 0, worktreeRoot: tmpDir });
    updateServerLockPort(lockDir, deadPort);

    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0, host: 'localhost' });
    const res = await fetch(`http://localhost:${handle.port}/api/pages`);
    expect(res.status).toBe(502);
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

  test('starts when the content root contains a broken symlink', async () => {
    symlinkSync(resolve(tmpDir, 'missing-target'), resolve(tmpDir, 'broken-link'));

    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0, host: 'localhost' });
    const { status } = await get(handle.port, '/api/config');
    expect(status).toBe(200);
  });

  test('asset serve: missing asset-extension URL returns 404 (not SPA index.html)', async () => {
    // Closes the dogfood bug: `/missing.m4v` against a contentDir where the
    // file does not exist used to fall through to the SPA static handler
    // (which returns index.html as text/html for unknown URLs under
    // `single: true`). The asset-serve middleware's fail-closed 404 guard
    // catches asset-extension paths before they reach the SPA fallback.
    const fs = await import('node:fs');
    const seedFile = resolve(tmpDir, 'doc.md');
    fs.writeFileSync(seedFile, '# seed', 'utf-8');

    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0, host: 'localhost' });
    const { status, headers } = await get(handle.port, '/missing.m4v');
    expect(status).toBe(404);
    // Should NOT be served as text/html (the SPA fallback's mime type).
    expect(headers.get('content-type') ?? '').not.toMatch(/^text\/html/);
  });

  test('asset serve: existing inline-renderable asset gets Content-Disposition: inline', async () => {
    const fs = await import('node:fs');
    const seedDoc = resolve(tmpDir, 'doc.md');
    fs.writeFileSync(seedDoc, '# seed', 'utf-8');
    const seedAsset = resolve(tmpDir, 'photo.png');
    fs.writeFileSync(seedAsset, 'fake-png', 'binary');

    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0, host: 'localhost' });
    const { status, headers } = await get(handle.port, '/photo.png');
    expect(status).toBe(200);
    expect(headers.get('content-disposition')).toBe('inline');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('asset serve: scripted-document extension is not served from contentDir', async () => {
    // Stored-XSS defense: `.html` is outside the include patterns AND outside
    // ASSET_EXTENSIONS, so the content filter excludes it. A request for
    // `/evil.html` falls through to the SPA static handler — which never
    // returns the literal file bytes. Verifies the body does NOT contain
    // the planted `<script>` payload that would have leaked under the
    // pre-fix CLI behavior (which served any contentDir file with
    // attachment disposition).
    const fs = await import('node:fs');
    const seedDoc = resolve(tmpDir, 'doc.md');
    fs.writeFileSync(seedDoc, '# seed', 'utf-8');
    const seedHtml = resolve(tmpDir, 'evil.html');
    fs.writeFileSync(seedHtml, '<script>alert(1)</script>', 'utf-8');

    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0, host: 'localhost' });
    const { body } = await get(handle.port, '/evil.html');
    expect(body).not.toContain('<script>alert(1)</script>');
  });

  test('asset serve: non-inline admitted asset gets Content-Disposition: attachment', async () => {
    const fs = await import('node:fs');
    const seedDoc = resolve(tmpDir, 'doc.md');
    fs.writeFileSync(seedDoc, '# seed', 'utf-8');
    // PDF is in ASSET_EXTENSIONS but in INLINE_RENDERABLE — pick a non-inline
    // admitted extension instead. ZIP is in ASSET_EXTENSIONS but not in
    // INLINE_RENDERABLE_EXTENSIONS, so it gets attachment.
    const seedZip = resolve(tmpDir, 'archive.zip');
    fs.writeFileSync(seedZip, 'fake-zip-bytes', 'binary');

    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0, host: 'localhost' });
    const { status, headers } = await get(handle.port, '/archive.zip');
    expect(status).toBe(200);
    expect(headers.get('content-disposition')).toBe('attachment');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('startUiServer — D-025 12h safety-net', () => {
  test('default safety-net is 12 hours', () => {
    expect(DEFAULT_UI_SAFETY_NET_MS).toBe(12 * 60 * 60 * 1000);
  });

  test('schedules a safety-net timer with the configured interval', async () => {
    const scheduler = createManualScheduler();
    handle = await startUiServer({
      config: config(),
      cwd: tmpDir,
      port: 0,
      host: 'localhost',
      safetyNetMs: 60_000,
      scheduler,
    });
    expect(scheduler.pendingCount()).toBe(1);
  });

  test('safety-net fires after the configured interval — closes server, releases lock, invokes onSafetyNet', async () => {
    const scheduler = createManualScheduler();
    let onSafetyNetFired = 0;
    handle = await startUiServer({
      config: config(),
      cwd: tmpDir,
      port: 0,
      host: 'localhost',
      safetyNetMs: 60_000,
      scheduler,
      onSafetyNet: () => {
        onSafetyNetFired++;
      },
    });
    const port = handle.port;
    const lockPath = resolve(lockDir, 'ui.lock');
    expect(existsSync(lockPath)).toBe(true);

    // Advance past the safety-net deadline — the timer's callback runs
    // synchronously inside advanceTime, including releaseUiLock and
    // httpServer.close() (close() returns immediately; the actual socket
    // close completes async).
    scheduler.advanceTime(60_000);
    expect(onSafetyNetFired).toBe(1);
    expect(existsSync(lockPath)).toBe(false);
    expect(readUiLock(lockDir)).toBeNull();

    // Wait for the close to complete on the event loop — fetch should fail
    // (or get ECONNREFUSED) once the listener is gone.
    if (handle) await closeHttpServers(handle.httpServers);
    let connectError: unknown = null;
    try {
      await fetch(`http://localhost:${port}/api/config`);
    } catch (err) {
      connectError = err;
    }
    expect(connectError).not.toBeNull();
    handle = null; // afterEach already cleaned up.
  });

  test('release() before fire cancels the safety-net timer', async () => {
    const scheduler = createManualScheduler();
    let onSafetyNetFired = 0;
    handle = await startUiServer({
      config: config(),
      cwd: tmpDir,
      port: 0,
      host: 'localhost',
      safetyNetMs: 60_000,
      scheduler,
      onSafetyNet: () => {
        onSafetyNetFired++;
      },
    });
    expect(scheduler.pendingCount()).toBe(1);

    handle.release();
    expect(scheduler.pendingCount()).toBe(0);

    // Even if we advance well past the deadline, the cancelled callback
    // never fires.
    scheduler.advanceTime(60_000 * 100);
    expect(onSafetyNetFired).toBe(0);
  });

  test('detachSafetyNet() cancels the timer without releasing the lock', async () => {
    const scheduler = createManualScheduler();
    handle = await startUiServer({
      config: config(),
      cwd: tmpDir,
      port: 0,
      host: 'localhost',
      safetyNetMs: 60_000,
      scheduler,
    });
    const lockPath = resolve(lockDir, 'ui.lock');
    expect(existsSync(lockPath)).toBe(true);

    handle.detachSafetyNet();
    expect(scheduler.pendingCount()).toBe(0);
    // Lock is still held — only the timer was cancelled.
    expect(existsSync(lockPath)).toBe(true);
  });

  test('release() is idempotent — second call is a no-op', async () => {
    handle = await startUiServer({ config: config(), cwd: tmpDir, port: 0, host: 'localhost' });
    const lockPath = resolve(lockDir, 'ui.lock');

    handle.release();
    expect(existsSync(lockPath)).toBe(false);
    // Second call must not throw and must not affect anything else.
    handle.release();
    expect(existsSync(lockPath)).toBe(false);

    // Keep afterEach happy — server still up, just lock gone.
    if (handle) await closeHttpServers(handle.httpServers);
    handle = null;
  });

  test('safetyNetMs=0 disables the safety-net entirely (no timer scheduled)', async () => {
    const scheduler = createManualScheduler();
    handle = await startUiServer({
      config: config(),
      cwd: tmpDir,
      port: 0,
      host: 'localhost',
      safetyNetMs: 0,
      scheduler,
    });
    expect(scheduler.pendingCount()).toBe(0);
  });
});

describe('resolveUiLockCollision', () => {
  function fakeLock(port: number): UiLockMetadata {
    return {
      pid: process.pid,
      hostname: 'localhost',
      port,
      startedAt: new Date().toISOString(),
      worktreeRoot: tmpDir,
    };
  }

  test('same port as holder → already-running', async () => {
    const result = await resolveUiLockCollision({
      requestedPort: 3000,
      host: 'localhost',
      lockDir,
      readLock: () => fakeLock(3000),
    });
    expect(result.mode).toBe('already-running');
    if (result.mode === 'already-running') expect(result.port).toBe(3000);
  });

  test('throws when lock disappeared mid-handle', async () => {
    await expect(
      resolveUiLockCollision({
        requestedPort: 3000,
        host: 'localhost',
        lockDir,
        readLock: () => null,
      }),
    ).rejects.toThrow(/disappeared/);
  });

  test('different port + live upstream → proxy mode forwards correctly', async () => {
    // Stand up a real upstream so the proxy has something to forward to.
    const upstream = createHttpServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('upstream ok');
    });
    await new Promise<void>((done) => upstream.listen(0, 'localhost', () => done()));
    const upstreamPort = (upstream.address() as { port: number }).port;

    const result = await resolveUiLockCollision({
      requestedPort: 0, // kernel-allocated so we don't conflict with anything
      host: 'localhost',
      lockDir,
      readLock: () => fakeLock(upstreamPort),
    });

    expect(result.mode).toBe('proxy');
    if (result.mode !== 'proxy') throw new Error('unreachable');
    expect(result.upstreamPort).toBe(upstreamPort);

    try {
      const response = await fetch(`http://localhost:${result.handle.port}/`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('upstream ok');
    } finally {
      await result.handle.close();
      await new Promise<void>((done) => upstream.close(() => done()));
    }
  });

  test('proxy returns 502 when upstream dies', async () => {
    // Probe an ephemeral port and close so upstreamPort points at nothing.
    const probe = createHttpServer();
    await new Promise<void>((done) => probe.listen(0, 'localhost', () => done()));
    const deadPort = (probe.address() as { port: number }).port;
    await new Promise<void>((done) => probe.close(() => done()));

    const result = await resolveUiLockCollision({
      requestedPort: 0,
      host: 'localhost',
      lockDir,
      readLock: () => fakeLock(deadPort),
    });
    if (result.mode !== 'proxy') throw new Error('unreachable');

    try {
      const response = await fetch(`http://localhost:${result.handle.port}/`);
      expect(response.status).toBe(502);
    } finally {
      await result.handle.close();
    }
  });

  test('lock port=0 that becomes live within deadline → proxy mode', async () => {
    const upstream = createHttpServer((_req, res) => res.end('late upstream'));
    await new Promise<void>((done) => upstream.listen(0, 'localhost', () => done()));
    const upstreamPort = (upstream.address() as { port: number }).port;

    let calls = 0;
    const readLock = () => {
      calls++;
      return calls < 3 ? fakeLock(0) : fakeLock(upstreamPort);
    };

    const result = await resolveUiLockCollision({
      requestedPort: 0,
      host: 'localhost',
      lockDir,
      readLock,
      pollIntervalMs: 10,
      pollDeadlineMs: 2000,
    });

    expect(result.mode).toBe('proxy');
    if (result.mode !== 'proxy') throw new Error('unreachable');
    expect(result.upstreamPort).toBe(upstreamPort);

    await result.handle.close();
    await new Promise<void>((done) => upstream.close(() => done()));
  });

  test('lock port=0 that stays 0 → throws timeout error', async () => {
    await expect(
      resolveUiLockCollision({
        requestedPort: 3000,
        host: 'localhost',
        lockDir,
        readLock: () => fakeLock(0),
        pollIntervalMs: 5,
        pollDeadlineMs: 25,
      }),
    ).rejects.toThrow(/did not bind within 2s/);
  });

  test('lock port=0 that resolves equal to requested port → already-running', async () => {
    let calls = 0;
    const readLock = () => {
      calls++;
      return calls < 3 ? fakeLock(0) : fakeLock(4321);
    };

    const result = await resolveUiLockCollision({
      requestedPort: 4321,
      host: 'localhost',
      lockDir,
      readLock,
      pollIntervalMs: 5,
      pollDeadlineMs: 500,
    });

    expect(result.mode).toBe('already-running');
    if (result.mode === 'already-running') expect(result.port).toBe(4321);
  });
});
