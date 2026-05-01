import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { spawn as NativeSpawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { hostname, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
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
    lockDir = resolve(tmpDir, '.ok');
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
      expect(childEnv?.PORT).toBeUndefined();
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

function makeTestConfig(): Config {
  return {
    content: { dir: '.', include: ['**/*.md', '**/*.mdx'], exclude: [] },
    github: { oauthAppClientId: 'Ov23liqlSd0V1MwR6rhI' },
    server: { host: '127.0.0.1', openOnAgentEdit: false },
    preview: {},
    folders: [],
    mcp: {
      tools: { read_document: { historyDepth: 5 }, search: { maxResults: 50 } },
      autoStart: true,
    },
    appearance: {},
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
      } catch {}
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
    });
    const res = await fetchText(booted.port, '/');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    const body = JSON.parse(res.body);
    expect(body.error).toContain('React UI is served by `ok ui`');
    expect(body.path).toBe('/');
  });

  test('GET /assets/anything also returns the same pointer (no static fallthrough)', async () => {
    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      skipUiAutoSpawn: true,
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
    });
    await booted.ready;

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
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(600);
  });

  test('GET /api/nonexistent-route returns the API-route-not-found 404 (not the SPA pointer)', async () => {
    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      skipUiAutoSpawn: true,
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
      spawn: fakeSpawn,
    });

    expect(spawnCalls.length).toBe(1);
    expect(spawnCalls[0]?.cmd).toBe(process.execPath);
    const spawnCallArgs = spawnCalls[0]?.args ?? [];
    expect(spawnCallArgs[spawnCallArgs.length - 1]).toBe('ui');
    expect(booted.uiSpawnDecision).toEqual({ action: 'spawn', reason: 'absent' });
  });

  test('skip auto-spawn when ui.lock alive (idempotent re-acquire path)', async () => {
    const lockDir = join(tmpDir, '.ok');
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
    });

    expect(spawnCalls.length).toBe(0);
    expect(booted.uiSpawnDecision).toEqual({ action: 'spawn', reason: 'absent' });
  });

  test('destroy() is idempotent — second call is a no-op', async () => {
    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      skipUiAutoSpawn: true,
    });
    await booted.destroy();
    await booted.destroy();
    booted = null; // Prevent afterEach from calling destroy again — already done.
  });

  test('booted.port reflects the kernel-assigned port (server.port=0)', async () => {
    booted = await bootStartServer({
      config: makeTestConfig(),
      cwd: tmpDir,
      skipAutoInit: true,
      skipUiAutoSpawn: true,
    });
    expect(booted.port).toBeGreaterThan(0);
    expect(booted.port).toBeLessThan(65536);
  });

  test('D-034: /collab/keepalive accepts a bare WS upgrade without routing to Hocuspocus', async () => {
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

      await wait(100);
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
      } catch {}
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

    expect(existsSync(join(tmpDir, '.git'))).toBe(false);
  });
});

describe('awaitUiSiblingPort', () => {
  test('returns the bound port immediately when ui.lock has port > 0 on first read', async () => {
    const port = await awaitUiSiblingPort({
      readUiLock: () => ({ port: 51887 }),
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
        return reads >= 3 ? { port: 4444 } : null;
      },
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      timeoutMs: 100,
      pollIntervalMs: 50,
    });
    expect(port).toBe(4444);
  });
});

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
      } catch {}
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
    const cfg = ConfigSchema.parse({});
    const fakeSpawn: typeof NativeSpawn = ((_cmd: string, args: readonly string[]) => {
      const lastArg = args[args.length - 1];
      if (lastArg === 'ui') {
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
      uiBindTimeoutMs: 10_000,
    });

    expect(booted.uiSpawnDecision).toEqual({ action: 'spawn', reason: 'absent' });
    expect(booted.resolvedUiPort).not.toBeNull();
    expect(booted.resolvedUiPort).not.toBe(3000);
    const handleDeadline = Date.now() + 5_000;
    while (uiHandle === null) {
      if (Date.now() > handleDeadline) {
        throw new Error('in-process UI handle never settled within 5s');
      }
      await wait(10);
    }
    expect(booted.resolvedUiPort).toBe(uiHandle.port);

    const configRes = await fetch(`http://127.0.0.1:${booted.resolvedUiPort}/api/config`);
    expect(configRes.status).toBe(200);
    const configBody = (await configRes.json()) as { port: number };
    expect(configBody.port).toBe(booted.resolvedUiPort);
  });

  test('skip path: resolvedUiPort reflects the pre-existing ok ui lock port', async () => {
    const lockDir = join(tmpDir, '.ok');
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

    expect(booted.uiSpawnDecision).toEqual({ action: 'spawn', reason: 'absent' });
    expect(booted.resolvedUiPort).toBeNull();
  });

  test('timeout path: resolvedUiPort is null when the spawned UI never binds in time', async () => {
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
