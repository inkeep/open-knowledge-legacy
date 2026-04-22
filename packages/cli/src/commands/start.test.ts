import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { spawn as NativeSpawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { hostname, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type Config, ConfigSchema } from '../config/schema.ts';
import {
  awaitUiSiblingPort,
  type BootedStartServer,
  bootStartServer,
  buildIdleShutdownHandler,
  decideUiSpawn,
  spawnOkUi,
  type UiSpawnDecision,
} from './start.ts';
import { closeHttpServers, startUiServer, type UiServerHandle } from './ui.ts';

describe('decideUiSpawn', () => {
  test('absent lock → spawn(absent)', () => {
    const result = decideUiSpawn({ uiLock: null, isAlive: () => true });
    expect(result).toEqual<UiSpawnDecision>({ action: 'spawn', reason: 'absent' });
  });

  test('lock with dead pid → spawn(stale)', () => {
    const result = decideUiSpawn({
      uiLock: { pid: 999999, port: 3000 },
      isAlive: () => false,
    });
    expect(result).toEqual<UiSpawnDecision>({
      action: 'spawn',
      reason: 'stale',
      stalePid: 999999,
    });
  });

  test('lock with live pid → skip(alive)', () => {
    const result = decideUiSpawn({
      uiLock: { pid: 4242, port: 3001 },
      isAlive: (pid) => pid === 4242,
    });
    expect(result).toEqual<UiSpawnDecision>({
      action: 'skip',
      reason: 'alive',
      pid: 4242,
      port: 3001,
    });
  });

  test('isAlive probe receives the lock pid', () => {
    const seen: number[] = [];
    decideUiSpawn({
      uiLock: { pid: 7777, port: 3000 },
      isAlive: (pid) => {
        seen.push(pid);
        return true;
      },
    });
    expect(seen).toEqual([7777]);
  });
});

describe('buildIdleShutdownHandler', () => {
  test('SIGTERMs UI sibling; if it exits within grace, awaits destroy', async () => {
    const events: string[] = [];
    // Simulate a well-behaved UI: stays alive initially, exits after SIGTERM.
    let alive = true;
    const onShutdown = buildIdleShutdownHandler({
      readUiLock: () => ({ pid: 1234, port: 3000 }),
      isAlive: () => alive,
      killPid: (pid, sig) => {
        events.push(`kill:${pid}:${sig}`);
        if (sig === 'SIGTERM') alive = false;
      },
      destroy: async () => {
        events.push('destroy');
      },
      sigtermGraceMs: 100,
      sigtermPollIntervalMs: 5,
      sleep: async () => {},
    });
    await onShutdown();
    expect(events).toEqual(['kill:1234:SIGTERM', 'destroy']);
  });

  test('escalates to SIGKILL when SIGTERM grace expires', async () => {
    const events: string[] = [];
    // Simulate a wedged UI: stays alive through SIGTERM, never exits.
    const warned: object[] = [];
    const onShutdown = buildIdleShutdownHandler({
      readUiLock: () => ({ pid: 1234, port: 3000 }),
      isAlive: () => true,
      killPid: (pid, sig) => {
        events.push(`kill:${pid}:${sig}`);
      },
      destroy: async () => {
        events.push('destroy');
      },
      sigtermGraceMs: 20,
      sigtermPollIntervalMs: 5,
      sleep: async () => {},
      log: {
        info: () => {},
        warn: (obj) => warned.push(obj),
        error: () => {},
      },
    });
    await onShutdown();
    expect(events).toEqual(['kill:1234:SIGTERM', 'kill:1234:SIGKILL', 'destroy']);
    expect(warned.find((w) => (w as { pid?: number }).pid === 1234)).toBeDefined();
  });

  test('skips kill when UI lock absent', async () => {
    const events: string[] = [];
    const onShutdown = buildIdleShutdownHandler({
      readUiLock: () => null,
      isAlive: () => true,
      killPid: (pid, sig) => events.push(`kill:${pid}:${sig}`),
      destroy: async () => {
        events.push('destroy');
      },
    });
    await onShutdown();
    expect(events).toEqual(['destroy']);
  });

  test('skips kill when UI process is dead (stale lock)', async () => {
    const events: string[] = [];
    const onShutdown = buildIdleShutdownHandler({
      readUiLock: () => ({ pid: 4242, port: 3000 }),
      isAlive: () => false,
      killPid: (pid, sig) => events.push(`kill:${pid}:${sig}`),
      destroy: async () => {
        events.push('destroy');
      },
    });
    await onShutdown();
    expect(events).toEqual(['destroy']);
  });

  test('still calls destroy when killPid throws', async () => {
    const events: string[] = [];
    const warned: object[] = [];
    const onShutdown = buildIdleShutdownHandler({
      readUiLock: () => ({ pid: 4242, port: 3000 }),
      isAlive: () => true,
      killPid: () => {
        throw new Error('EPERM');
      },
      destroy: async () => {
        events.push('destroy');
      },
      log: {
        info: () => {},
        warn: (obj) => warned.push(obj),
        error: () => {},
      },
    });
    await onShutdown();
    expect(events).toEqual(['destroy']);
    expect(warned[0]).toMatchObject({ pid: 4242 });
  });

  test('still calls destroy when readUiLock throws', async () => {
    const events: string[] = [];
    const onShutdown = buildIdleShutdownHandler({
      readUiLock: () => {
        throw new Error('lock read failed');
      },
      isAlive: () => true,
      killPid: () => {},
      destroy: async () => {
        events.push('destroy');
      },
      log: { info: () => {}, warn: () => {}, error: () => {} },
    });
    await onShutdown();
    expect(events).toEqual(['destroy']);
  });
});

describe('spawnOkUi', () => {
  let tmpDir: string;
  let lockDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-start-spawnui-'));
    lockDir = resolve(tmpDir, '.open-knowledge');
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('creates lockDir if missing and opens last-spawn-error.log', () => {
    const calls: Array<{ cmd: string; args: readonly string[]; opts: object }> = [];
    spawnOkUi({
      lockDir,
      cwd: tmpDir,
      // biome-ignore lint/suspicious/noExplicitAny: minimal mock matches ChildProcess shape
      spawn: ((cmd: string, args: readonly string[], opts: any) => {
        calls.push({ cmd, args, opts });
        return { unref: () => {}, on: () => {}, kill: () => {} } as unknown as ReturnType<
          typeof spawnOkUi
        >;
      }) as never,
    });

    expect(existsSync(lockDir)).toBe(true);
    expect(existsSync(join(lockDir, 'last-spawn-error.log'))).toBe(true);
    expect(calls.length).toBe(1);
    // Re-exec via the current CLI binary (not npx) — see self-spawn.ts.
    expect(calls[0]?.cmd).toBe(process.execPath);
    const callArgs = calls[0]?.args ?? [];
    expect(callArgs[callArgs.length - 1]).toBe('ui');
  });

  test('passes detached + ignore stdio + cwd to spawn', () => {
    const calls: Array<{ opts: { detached?: boolean; cwd?: string; stdio?: unknown[] } }> = [];
    spawnOkUi({
      lockDir,
      cwd: tmpDir,
      spawn: ((_cmd: string, _args: readonly string[], opts: object) => {
        calls.push({ opts: opts as never });
        return { unref: () => {}, on: () => {}, kill: () => {} } as unknown as ReturnType<
          typeof spawnOkUi
        >;
      }) as never,
    });

    const opts = calls[0]?.opts;
    expect(opts?.detached).toBe(true);
    expect(opts?.cwd).toBe(tmpDir);
    expect(Array.isArray(opts?.stdio)).toBe(true);
    expect(opts?.stdio?.[0]).toBe('ignore');
    expect(opts?.stdio?.[1]).toBe('ignore');
    // The third stdio entry is a numeric file descriptor.
    expect(typeof opts?.stdio?.[2]).toBe('number');
  });

  test('honors custom args (e.g. testable arg list)', () => {
    const calls: Array<{ args: readonly string[] }> = [];
    spawnOkUi({
      lockDir,
      cwd: tmpDir,
      args: ['ui', '--port', '9999'],
      spawn: ((_cmd: string, args: readonly string[]) => {
        calls.push({ args });
        return { unref: () => {}, on: () => {}, kill: () => {} } as unknown as ReturnType<
          typeof spawnOkUi
        >;
      }) as never,
    });
    // Re-exec mode (self-spawn.ts): args[0] is the CLI entry script, followed
    // by the subcommand args in order.
    expect(calls[0]?.args.slice(-3)).toEqual(['ui', '--port', '9999']);
  });

  test('strips PORT env from the spawned child (QA-007 — prevents same-port bind race)', () => {
    const originalPort = process.env.PORT;
    try {
      process.env.PORT = '51234';
      const calls: Array<{ env: NodeJS.ProcessEnv | undefined }> = [];
      spawnOkUi({
        lockDir,
        cwd: tmpDir,
        spawn: ((_cmd: string, _args: readonly string[], options: { env?: NodeJS.ProcessEnv }) => {
          calls.push({ env: options.env });
          return {
            unref: () => {},
            on: () => {},
            kill: () => {},
          } as unknown as ReturnType<typeof spawnOkUi>;
        }) as never,
      });

      const childEnv = calls[0]?.env;
      expect(childEnv).toBeDefined();
      // PORT must be stripped so the child does NOT inherit the parent's
      // bind port — otherwise both processes race to bind the same port.
      expect(childEnv?.PORT).toBeUndefined();
      // Other env vars propagate normally so the child can locate npx,
      // node, HOME, etc.
      expect(typeof childEnv?.PATH).toBe('string');
    } finally {
      if (originalPort === undefined) {
        delete process.env.PORT;
      } else {
        process.env.PORT = originalPort;
      }
    }
  });

  test('truncates last-spawn-error.log on each invocation', () => {
    const errorLog = join(lockDir, 'last-spawn-error.log');
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(errorLog, 'previous run error\n', 'utf-8');
    expect(readFileSync(errorLog, 'utf-8')).toBe('previous run error\n');

    spawnOkUi({
      lockDir,
      cwd: tmpDir,
      spawn: ((_cmd: string, _args: readonly string[]) =>
        ({ unref: () => {}, on: () => {}, kill: () => {} }) as unknown as ReturnType<
          typeof spawnOkUi
        >) as never,
    });

    expect(readFileSync(errorLog, 'utf-8')).toBe('');
  });
});

// ----------------------------------------------------------------------------
// bootStartServer (integration)
// ----------------------------------------------------------------------------
//
// These exercise the composed boot path the Commander action wraps:
//   - HTTP server bound on the configured/kernel port
//   - GET / returns 404 with the React-UI-served-by-ok-ui pointer (no static
//     asset serving from `ok start` after the lifecycle split)
//   - /api/* dispatches via Hocuspocus onRequest hook (proves API routes
//     survive the split — not falling through to the SPA pointer)
//   - Auto-spawn-of-ok-ui-sibling fires when ui.lock is absent
//   - Auto-spawn skips when ui.lock is alive (idempotent re-acquire path)
//
// Each test gets a unique tmpdir and disposes via `booted.destroy()` in
// afterEach. We pass a no-op logger to silence pino in test output.

function makeTestConfig(): Config {
  return {
    content: { dir: '.', include: ['**/*.md', '**/*.mdx'], exclude: [] },
    server: { port: 0, host: '127.0.0.1', openOnAgentEdit: false },
    persistence: { debounceMs: 200, maxDebounceMs: 1000 },
    preview: {},
    mcp: {
      tools: { read_document: { historyDepth: 5 }, search: { maxResults: 50 } },
      autoStart: true,
    },
  } as Config;
}

function fetchText(
  port: number,
  path: string,
): Promise<{
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}> {
  return new Promise((resolveFetch, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolveFetch({ status: res.statusCode ?? 0, body, headers: res.headers });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

describe('bootStartServer (integration)', () => {
  let tmpDir: string;
  let booted: BootedStartServer | null = null;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-start-boot-'));
    booted = null;
  });

  afterEach(async () => {
    if (booted) {
      try {
        await booted.destroy();
      } catch {
        // Tests may have already triggered destroy via assertion failure paths;
        // the destroy itself is idempotent so the second call is a no-op.
      }
      booted = null;
    }
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('GET / returns 404 with React-UI-served-by-ok-ui pointer', async () => {
    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      skipUiAutoSpawn: true,
      // PinoLogger is silent in NODE_ENV=test by default; no override needed.
    });
    const res = await fetchText(booted.port, '/');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    const body = JSON.parse(res.body);
    expect(body.error).toContain('React UI is served by `ok ui`');
    expect(body.path).toBe('/');
  });

  test('GET /assets/anything also returns the same pointer (no static fallthrough)', async () => {
    // Pre-split the SPA fell through to dist/public/. Post-split there is no
    // static handler in `ok start` at all — every non-/api path returns the
    // pointer. This is the behavior the lifecycle split promises.
    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      skipUiAutoSpawn: true,
      // PinoLogger is silent in NODE_ENV=test by default; no override needed.
    });
    const res = await fetchText(booted.port, '/assets/main-abcdef.js');
    expect(res.status).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('React UI is served by `ok ui`');
    expect(body.path).toBe('/assets/main-abcdef.js');
  });

  test('GET /api/document is routed through Hocuspocus onRequest (not the SPA pointer)', async () => {
    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      skipUiAutoSpawn: true,
      // PinoLogger is silent in NODE_ENV=test by default; no override needed.
    });
    await booted.ready;

    // /api/document is the canonical health-check endpoint exposed by the API
    // extension. The exact response body depends on persistence's docName
    // semantics, but importantly the response MUST NOT be the
    // 'React UI is served by `ok ui`' pointer — that would mean the request
    // fell through to the catch-all branch instead of hitting the API hook.
    const res = await fetchText(booted.port, '/api/document?docName=integration-test-doc');
    if (res.body.length > 0 && res.headers['content-type']?.toString().includes('json')) {
      const parsed = (() => {
        try {
          return JSON.parse(res.body);
        } catch {
          return null;
        }
      })();
      if (parsed && typeof parsed.error === 'string') {
        expect(parsed.error).not.toContain('React UI is served by `ok ui`');
      }
    }
    // Status is whatever the API extension chose — we accept 200, 404, or any
    // 4xx; the assertion is purely 'not a 404 with the SPA pointer payload'.
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(600);
  });

  test('GET /api/nonexistent-route returns the API-route-not-found 404 (not the SPA pointer)', async () => {
    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      skipUiAutoSpawn: true,
      // PinoLogger is silent in NODE_ENV=test by default; no override needed.
    });
    await booted.ready;

    const res = await fetchText(booted.port, '/api/totally-nonexistent-xyz');
    expect(res.status).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('API route not found');
    expect(body.path).toBe('/api/totally-nonexistent-xyz');
  });

  test('auto-spawn ok ui when ui.lock absent — invokes spawn with correct args', async () => {
    const spawnCalls: Array<{ cmd: string; args: readonly string[] }> = [];
    const fakeSpawn: typeof NativeSpawn = ((cmd: string, args: readonly string[]) => {
      spawnCalls.push({ cmd, args });
      return {
        unref: () => {},
        on: () => {},
        kill: () => {},
      } as unknown as ReturnType<typeof NativeSpawn>;
    }) as never;

    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      // Note: skipUiAutoSpawn is intentionally false — we WANT the spawn to fire.
      spawn: fakeSpawn,
      // PinoLogger is silent in NODE_ENV=test by default; no override needed.
    });

    expect(spawnCalls.length).toBe(1);
    // Re-exec via the current CLI binary (not npx) — see self-spawn.ts.
    expect(spawnCalls[0]?.cmd).toBe(process.execPath);
    const spawnCallArgs = spawnCalls[0]?.args ?? [];
    expect(spawnCallArgs[spawnCallArgs.length - 1]).toBe('ui');
    expect(booted.uiSpawnDecision).toEqual({ action: 'spawn', reason: 'absent' });
  });

  test('skip auto-spawn when ui.lock alive (idempotent re-acquire path)', async () => {
    // Pre-populate ui.lock with the test process' own pid (which is alive).
    // process-lock treats same-pid as idempotent, so this simulates a
    // pre-existing live UI sibling without actually spawning one.
    const lockDir = join(tmpDir, '.open-knowledge');
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(
      join(lockDir, 'ui.lock'),
      JSON.stringify({
        pid: process.pid,
        hostname: hostname(),
        port: 9876,
        startedAt: new Date().toISOString(),
        worktreeRoot: tmpDir,
      }),
    );

    const spawnCalls: Array<{ cmd: string }> = [];
    const fakeSpawn: typeof NativeSpawn = ((cmd: string) => {
      spawnCalls.push({ cmd });
      return {
        unref: () => {},
        on: () => {},
        kill: () => {},
      } as unknown as ReturnType<typeof NativeSpawn>;
    }) as never;

    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      spawn: fakeSpawn,
      // PinoLogger is silent in NODE_ENV=test by default; no override needed.
    });

    expect(spawnCalls.length).toBe(0);
    expect(booted.uiSpawnDecision).toEqual({
      action: 'skip',
      reason: 'alive',
      pid: process.pid,
      port: 9876,
    });
  });

  test('skipUiAutoSpawn=true bypasses spawn even when ui.lock is absent', async () => {
    const spawnCalls: Array<{ cmd: string }> = [];
    const fakeSpawn: typeof NativeSpawn = ((cmd: string) => {
      spawnCalls.push({ cmd });
      return {
        unref: () => {},
        on: () => {},
        kill: () => {},
      } as unknown as ReturnType<typeof NativeSpawn>;
    }) as never;

    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      skipUiAutoSpawn: true,
      spawn: fakeSpawn,
      // PinoLogger is silent in NODE_ENV=test by default; no override needed.
    });

    expect(spawnCalls.length).toBe(0);
    // Decision is still 'spawn(absent)' — the gate is only on the ACTION,
    // not the decision. This lets the booted handle still report what would
    // have been done (useful for tests + potentially for `ok status`).
    expect(booted.uiSpawnDecision).toEqual({ action: 'spawn', reason: 'absent' });
  });

  test('destroy() is idempotent — second call is a no-op', async () => {
    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      skipUiAutoSpawn: true,
      // PinoLogger is silent in NODE_ENV=test by default; no override needed.
    });
    await booted.destroy();
    // Second call must not throw; it short-circuits via the internal guard.
    await booted.destroy();
    booted = null; // Prevent afterEach from calling destroy again — already done.
  });

  test('booted.port reflects the kernel-assigned port (server.port=0)', async () => {
    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      skipUiAutoSpawn: true,
      // PinoLogger is silent in NODE_ENV=test by default; no override needed.
    });
    expect(booted.port).toBeGreaterThan(0);
    expect(booted.port).toBeLessThan(65536);
  });

  test('D-034: /collab/keepalive accepts a bare WS upgrade without routing to Hocuspocus', async () => {
    // The MCP keep-alive path is served by a special upgrade branch in
    // start.ts that completes the WS handshake without handing off to
    // Hocuspocus. The WS has no docName, no Y.Doc — it exists purely so
    // the idle-shutdown primitive (which counts `/collab*` upgrades) sees
    // MCP as an active WebSocket client. Without this test, a future
    // refactor could silently route /collab/keepalive to Hocuspocus and
    // the WS would close immediately when Hocuspocus couldn't resolve a
    // docName, defeating the keep-alive.
    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      skipUiAutoSpawn: true,
    });

    const ws = new WebSocket(`ws://localhost:${booted.port}/collab/keepalive?pid=${process.pid}`);
    try {
      await new Promise<void>((done, fail) => {
        const onOpen = () => {
          ws.removeEventListener('error', onError);
          done();
        };
        const onError = () => {
          ws.removeEventListener('open', onOpen);
          fail(new Error('keepalive WS did not open'));
        };
        ws.addEventListener('open', onOpen, { once: true });
        ws.addEventListener('error', onError, { once: true });
      });
      expect(ws.readyState).toBe(1); // OPEN

      // The WS should stay open — not get closed by the server after the
      // handshake. We wait 100ms and re-check readyState.
      await new Promise((r) => setTimeout(r, 100));
      expect(ws.readyState).toBe(1);
    } finally {
      ws.close();
    }
  });
});

describe('bootStartServer — ensureProjectGit wiring (US-004)', () => {
  let tmpDir: string;
  let booted: BootedStartServer | null = null;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-start-git-'));
    booted = null;
  });

  afterEach(async () => {
    if (booted) {
      try {
        await booted.destroy();
      } catch {
        // idempotent
      }
      booted = null;
    }
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('fresh tmpdir (no .git/) → booted.didGitInit is true + .git/HEAD exists', async () => {
    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: false,
      skipUiAutoSpawn: true,
    });

    expect(booted.didGitInit).toBe(true);
    expect(existsSync(join(tmpDir, '.git/HEAD'))).toBe(true);
    const head = readFileSync(join(tmpDir, '.git/HEAD'), 'utf-8');
    expect(head).toBe('ref: refs/heads/main\n');
  });

  test('pre-existing .git/ → booted.didGitInit is false (no re-init)', async () => {
    // Seed .git/ as a plain directory so existsSync short-circuits — matches
    // the production existsSync semantics (D6: match any .git form).
    mkdirSync(join(tmpDir, '.git'));

    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: false,
      skipUiAutoSpawn: true,
    });

    expect(booted.didGitInit).toBe(false);
  });

  test('skipAutoInit:true suppresses ensureProjectGit (no project .git/HEAD created)', async () => {
    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      skipUiAutoSpawn: true,
    });

    expect(booted.didGitInit).toBe(false);
    // `.git/` may exist as a side effect of initShadowRepo's recursive mkdir
    // (creating `.git/open-knowledge/` implicitly creates the `.git/` parent).
    // The discriminator is `.git/HEAD` — ensureProjectGit's responsibility.
    expect(existsSync(join(tmpDir, '.git/HEAD'))).toBe(false);
  });

  test('ProjectGitInitError propagates when git binary is missing', async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = '/nonexistent-path';
    try {
      await expect(
        bootStartServer({
          config: makeTestConfig(),
          cwd: tmpDir,
          skipAutoInit: false,
          skipUiAutoSpawn: true,
        }),
      ).rejects.toThrow();
    } finally {
      process.env.PATH = originalPath;
    }

    // Error fired BEFORE listen() bound a port — no dangling server
    expect(existsSync(join(tmpDir, '.git'))).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// awaitUiSiblingPort — pure poll helper
// ----------------------------------------------------------------------------

describe('awaitUiSiblingPort', () => {
  test('returns the bound port immediately when ui.lock has port > 0 on first read', async () => {
    const port = await awaitUiSiblingPort({
      readUiLock: () => ({ port: 51887 }),
      // `now` stays constant — the first read returns a good value so the
      // loop exits before the deadline is re-checked.
      now: () => 0,
      sleep: async () => {},
      timeoutMs: 3000,
      pollIntervalMs: 50,
    });
    expect(port).toBe(51887);
  });

  test('returns null when the lock never populates before the timeout', async () => {
    let t = 0;
    const port = await awaitUiSiblingPort({
      readUiLock: () => null,
      now: () => t,
      // Virtual clock: every sleep advances `t` by exactly its duration, so
      // the poll deterministically hits the deadline in a bounded number of
      // iterations without any real wall-clock wait.
      sleep: async (ms) => {
        t += ms;
      },
      timeoutMs: 200,
      pollIntervalMs: 50,
    });
    expect(port).toBeNull();
  });

  test('skips port=0 sentinel (child is binding) and returns once port > 0', async () => {
    let t = 0;
    let reads = 0;
    const port = await awaitUiSiblingPort({
      readUiLock: () => {
        reads++;
        if (reads === 1) return null; //                lock not written yet
        if (reads === 2) return { port: 0 }; //         acquired, not bound
        return { port: 9999 }; //                        bound
      },
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      timeoutMs: 1000,
      pollIntervalMs: 50,
    });
    expect(port).toBe(9999);
    expect(reads).toBeGreaterThanOrEqual(3);
  });

  test('reads once more after the loop exits, catching a lock that lands in the grace window', async () => {
    let t = 0;
    let reads = 0;
    const port = await awaitUiSiblingPort({
      readUiLock: () => {
        reads++;
        // First two reads in-loop return null; after the deadline check
        // exits the loop the post-loop read sees the populated lock.
        return reads >= 3 ? { port: 4444 } : null;
      },
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      // Loop runs ~twice (50ms sleeps vs 100ms budget), then falls through
      // to the final read which returns the populated lock.
      timeoutMs: 100,
      pollIntervalMs: 50,
    });
    expect(port).toBe(4444);
  });
});

// ----------------------------------------------------------------------------
// Regression: "unable to get any documents to load" on packaged CLI
// ----------------------------------------------------------------------------
//
// Slack report (2026-04-22) — against `main` at 58317bbb — running
//     $ bun run packages/cli/dist/cli.mjs start
// produced a banner pointing the user at http://localhost:3000, but
// nothing listened there. Documents never loaded because the React app
// never loaded.
//
// Empirical repro:
//   1. ok start auto-spawns ok ui via `spawnOkUi`, which strips PORT from
//      the child env (start.ts:91). The child resolves its bind port via
//      `resolveRequestedPort` → undefined flag + undefined env → 0 (D-033
//      default, kernel-allocated).
//   2. Kernel assigns a free port to ok ui (e.g. 54281) and writes it to
//      `<contentDir>/.open-knowledge/ui.lock`.
//   3. Meanwhile ok start's banner had hardcoded port 3000 on the spawn
//      branch — leftover from before D-033 changed ok ui's default to 0.
//   4. Banner prints http://localhost:3000; user follows it; ECONNREFUSED.
//
// Fix: bootStartServer now polls `ui.lock` after spawn and exposes
// `resolvedUiPort` on `BootedStartServer`. The banner uses that instead
// of a hardcoded default, so the printed URL always reaches the port the
// child actually bound (or falls back to the API URL on timeout).
//
// The `bun run dev` path is unaffected because the Vite plugin serves
// everything same-origin on one port — no banner mismatch possible.

describe('bootStartServer — resolvedUiPort tracks the port ok ui actually binds', () => {
  let tmpDir: string;
  let booted: BootedStartServer | null = null;
  let uiHandle: UiServerHandle | null = null;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-start-banner-'));
    booted = null;
    uiHandle = null;
  });

  afterEach(async () => {
    if (booted) {
      try {
        await booted.destroy();
      } catch {
        // idempotent
      }
      booted = null;
    }
    if (uiHandle) {
      uiHandle.release();
      await closeHttpServers(uiHandle.httpServers);
      uiHandle = null;
    }
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('auto-spawn path: resolvedUiPort matches the in-process ok ui that the fake spawn brought up', async () => {
    // Simulate the production detached-spawn flow hermetically: the `spawn`
    // hook, instead of execing a real `ok ui` subprocess, fires up ok ui
    // IN-PROCESS against the same lockDir. The in-process UI writes ui.lock
    // with a kernel-assigned port (D-033 default), so bootStartServer's new
    // `awaitUiSiblingPort` poll sees a real port appear.
    const cfg = ConfigSchema.parse({});
    const fakeSpawn: typeof NativeSpawn = ((_cmd: string, args: readonly string[]) => {
      const lastArg = args[args.length - 1];
      if (lastArg === 'ui') {
        // Fire-and-forget — production spawn also returns immediately and
        // the child binds asynchronously. We record the handle so afterEach
        // can tear it down.
        void startUiServer({
          config: cfg,
          cwd: tmpDir,
          port: 0,
          host: '127.0.0.1',
          safetyNetMs: 0,
        }).then((handle) => {
          uiHandle = handle;
        });
      }
      return {
        unref: () => {},
        on: () => {},
        kill: () => {},
      } as unknown as ReturnType<typeof NativeSpawn>;
    }) as never;

    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      spawn: fakeSpawn,
      // Generous timeout in case the CI event loop is under load — typical
      // in-process bind is <50 ms.
      uiBindTimeoutMs: 10_000,
    });

    expect(booted.uiSpawnDecision).toEqual({ action: 'spawn', reason: 'absent' });
    expect(booted.resolvedUiPort).not.toBeNull();
    expect(booted.resolvedUiPort).not.toBe(3000);
    // Wait for the fire-and-forget in-process UI handle to settle so
    // afterEach can tear it down; also lets us cross-check ports.
    while (uiHandle === null) await new Promise((r) => setTimeout(r, 10));
    expect(booted.resolvedUiPort).toBe(uiHandle.port);

    // End-to-end proof: the port bootStartServer reports as `resolvedUiPort`
    // is a working UI — /api/config returns the shape the React app boots
    // from. This is the invariant the banner URL depends on.
    const configRes = await fetch(`http://127.0.0.1:${booted.resolvedUiPort}/api/config`);
    expect(configRes.status).toBe(200);
    const configBody = (await configRes.json()) as { port: number };
    expect(configBody.port).toBe(booted.resolvedUiPort);
  });

  test('skip path: resolvedUiPort reflects the pre-existing ok ui lock port', async () => {
    // Pre-populate ui.lock with a live pid (this process) + a non-zero port.
    // decideUiSpawn returns {action: 'skip', ...} and bootStartServer
    // short-circuits the poll, using the lock's port directly.
    const lockDir = join(tmpDir, '.open-knowledge');
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(
      join(lockDir, 'ui.lock'),
      JSON.stringify({
        pid: process.pid,
        hostname: hostname(),
        port: 57890,
        startedAt: new Date().toISOString(),
        worktreeRoot: tmpDir,
      }),
    );

    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
    });

    expect(booted.uiSpawnDecision).toEqual({
      action: 'skip',
      reason: 'alive',
      pid: process.pid,
      port: 57890,
    });
    expect(booted.resolvedUiPort).toBe(57890);
  });

  test('spawn-skipped path: resolvedUiPort is null when skipUiAutoSpawn=true and no prior sibling', async () => {
    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      skipUiAutoSpawn: true,
    });

    // Decision is still 'spawn(absent)' — the gate is only on the ACTION —
    // but no UI was actually started, so there's no port to report.
    expect(booted.uiSpawnDecision).toEqual({ action: 'spawn', reason: 'absent' });
    expect(booted.resolvedUiPort).toBeNull();
  });

  test('timeout path: resolvedUiPort is null when the spawned UI never binds in time', async () => {
    // The fake spawn never starts an in-process UI, so ui.lock never gains
    // a port. bootStartServer's poll should give up cleanly and report null
    // — the banner falls back to the API URL.
    const silentSpawn: typeof NativeSpawn = ((_cmd: string, _args: readonly string[]) => {
      return {
        unref: () => {},
        on: () => {},
        kill: () => {},
      } as unknown as ReturnType<typeof NativeSpawn>;
    }) as never;

    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      spawn: silentSpawn,
      uiBindTimeoutMs: 200,
    });

    expect(booted.uiSpawnDecision).toEqual({ action: 'spawn', reason: 'absent' });
    expect(booted.resolvedUiPort).toBeNull();
  });
});
