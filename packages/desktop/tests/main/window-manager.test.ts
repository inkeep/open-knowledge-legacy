import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { setTimeout as wait } from 'node:timers/promises';
import type { ShowGateRegistry } from '../../src/main/show-gate.ts';
import {
  type BrowserWindowLike,
  type ServerLockMetadataLike,
  type UtilityProcessLike,
  WindowManager,
  type WindowManagerDeps,
} from '../../src/main/window-manager.ts';

interface MockUtility extends UtilityProcessLike {
  fire: (msg: unknown) => void;
  fireExit: (code: number | null) => void;
}

function makeUtility(pid: number): MockUtility {
  let messageHandler: ((m: unknown) => void) | null = null;
  let exitHandler: ((c: number | null) => void) | null = null;
  return {
    pid,
    postMessage: mock(() => {}),
    on: mock((event: 'message' | 'exit', cb: (msg: unknown) => void) => {
      if (event === 'message') messageHandler = cb;
      else if (event === 'exit') exitHandler = cb as (c: number | null) => void;
    }) as UtilityProcessLike['on'],
    once: mock(() => {}),
    removeListener: mock(() => {}),
    kill: mock(() => true),
    fire: (msg) => messageHandler?.(msg),
    fireExit: (code) => exitHandler?.(code),
  };
}

function makeWindow(opts?: { minimized?: boolean }): BrowserWindowLike & {
  fireClose: () => void;
  fireDomReady: () => void;
  markDestroyed: () => void;
} {
  let closeHandler: (() => void) | null = null;
  let domReadyHandler: (() => void) | null = null;
  let minimized = opts?.minimized ?? false;
  let destroyed = false;
  let visible = false;
  return {
    focus: mock(() => {}),
    show: mock(() => {
      visible = true;
    }),
    restore: mock(() => {
      minimized = false;
    }),
    isMinimized: mock(() => minimized),
    isDestroyed: mock(() => destroyed),
    isVisible: mock(() => visible),
    on: mock((_event: 'closed', cb: () => void) => {
      closeHandler = cb;
    }) as BrowserWindowLike['on'],
    once: mock((_event: 'ready-to-show', _cb: () => void) => {}) as BrowserWindowLike['once'],
    webContents: {
      send: mock(() => {}),
      once: mock((event: 'dom-ready', cb: () => void) => {
        if (event === 'dom-ready') domReadyHandler = cb;
      }),
    },
    loadFile: mock(() => Promise.resolve()),
    loadURL: mock(() => Promise.resolve()),
    fireClose: () => closeHandler?.(),
    markDestroyed: () => {
      destroyed = true;
    },
    fireDomReady: () => domReadyHandler?.(),
  };
}

interface ShowGateRegistration {
  window: BrowserWindowLike;
  kind: 'editor' | 'navigator';
  disposed: boolean;
}

interface TestEnv {
  utilities: MockUtility[];
  windows: Array<ReturnType<typeof makeWindow>>;
  createWindowOpts: Array<{ additionalArguments: string[]; title: string }>;
  timers: Array<{ cb: () => void; ms: number }>;
  killProbe: ReturnType<typeof mock>;
  showGateRegistrations: ShowGateRegistration[];
  deps: WindowManagerDeps;
}

function buildEnv(): TestEnv {
  const utilities: MockUtility[] = [];
  const windows: Array<ReturnType<typeof makeWindow>> = [];
  const createWindowOpts: Array<{ additionalArguments: string[]; title: string }> = [];
  const timers: Array<{ cb: () => void; ms: number }> = [];
  const killProbe = mock(() => {});
  const showGateRegistrations: ShowGateRegistration[] = [];
  const showGate: ShowGateRegistry = {
    register: (window, opts) => {
      const reg: ShowGateRegistration = {
        window,
        kind: opts?.kind ?? 'editor',
        disposed: false,
      };
      showGateRegistrations.push(reg);
      return () => {
        reg.disposed = true;
      };
    },
    fireThemeApplied: () => {},
  };
  let pidCounter = 10000;
  return {
    utilities,
    windows,
    createWindowOpts,
    timers,
    killProbe,
    showGateRegistrations,
    deps: {
      createWindow: (opts) => {
        createWindowOpts.push(opts);
        const w = makeWindow();
        windows.push(w);
        return w;
      },
      forkUtility: () => {
        const u = makeUtility(++pidCounter);
        utilities.push(u);
        return u;
      },
      utilityEntryPath: '/fake/utility-entry.js',
      rendererEntryPath: '/fake/renderer/index.html',
      setTimeout: (cb, ms) => {
        timers.push({ cb, ms });
        return null;
      },
      killProbe,
      showGate,
    },
  };
}

describe('WindowManager', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = buildEnv();
  });

  test('createProjectWindow sets BrowserWindow title to "<projectName> — Open Knowledge" (spawn path)', async () => {
    const wm = new WindowManager(env.deps);
    const promise = wm.createProjectWindow({ projectPath: '/tmp/dragon-wiki' });
    env.utilities[0]?.fire({ type: 'ready', port: 52010, apiOrigin: 'http://localhost:52010' });
    await promise;
    expect(env.createWindowOpts[0]?.title).toBe('dragon-wiki — Open Knowledge');
  });

  test('createProjectWindow forks utility, sends init, waits for ready, creates window', async () => {
    const wm = new WindowManager(env.deps);
    const promise = wm.createProjectWindow({ projectPath: '/tmp/test-project' });

    expect(env.utilities.length).toBe(1);
    const utility = env.utilities[0];
    if (!utility) throw new Error('utility not forked');
    expect(utility.postMessage).toHaveBeenCalledWith({
      type: 'init',
      opts: {
        contentDir: '/tmp/test-project',
        projectDir: '/tmp/test-project',
        port: 0,
        host: 'localhost',
        didEnsureGit: false,
        consentVersion: 1,
      },
    });

    utility.fire({ type: 'ready', port: 51234, apiOrigin: 'http://localhost:51234' });

    const ctx = await promise;
    expect(ctx.port).toBe(51234);
    expect(ctx.apiOrigin).toBe('http://localhost:51234');
    expect(ctx.projectName).toBe('test-project');

    expect(env.windows.length).toBe(1);
    expect(env.windows[0]?.loadFile).toHaveBeenCalledWith('/fake/renderer/index.html');
  });

  test('opening the same project twice focuses the existing window (D44 case a)', async () => {
    const wm = new WindowManager(env.deps);
    const p1 = wm.createProjectWindow({ projectPath: '/tmp/p1' });
    env.utilities[0]?.fire({ type: 'ready', port: 51001, apiOrigin: 'http://localhost:51001' });
    const ctx1 = await p1;

    const p2 = wm.createProjectWindow({ projectPath: '/tmp/p1' });
    const ctx2 = await p2;

    expect(env.utilities.length).toBe(1);
    expect(env.windows.length).toBe(1);
    expect(ctx2).toBe(ctx1);
    expect(ctx1.window.focus).toHaveBeenCalled();
  });

  test('stale destroyed-window entry does NOT throw; spawns fresh', async () => {
    const wm = new WindowManager(env.deps);
    const p1 = wm.createProjectWindow({ projectPath: '/tmp/destroyable' });
    env.utilities[0]?.fire({ type: 'ready', port: 51100, apiOrigin: 'http://localhost:51100' });
    await p1;

    env.windows[0]?.markDestroyed();

    const p2 = wm.createProjectWindow({ projectPath: '/tmp/destroyable' });
    expect(env.utilities.length).toBe(2);
    env.utilities[1]?.fire({ type: 'ready', port: 51101, apiOrigin: 'http://localhost:51101' });
    const ctx2 = await p2;
    expect(env.windows.length).toBe(2);
    expect(ctx2.port).toBe(51101);
    expect(env.windows[0]?.focus).not.toHaveBeenCalled();
  });

  test('utility error message rejects createProjectWindow', async () => {
    const wm = new WindowManager(env.deps);
    const promise = wm.createProjectWindow({ projectPath: '/tmp/err' });
    env.utilities[0]?.fire({ type: 'error', message: 'boot failed' });
    await expect(promise).rejects.toThrow('boot failed');
  });

  test('utility exits before ready → createProjectWindow rejects (no hang)', async () => {
    const wm = new WindowManager(env.deps);
    const promise = wm.createProjectWindow({ projectPath: '/tmp/early-exit' });
    env.utilities[0]?.fireExit(1);
    await expect(promise).rejects.toThrow(/utility exited before ready.*code=1/);
  });

  test('utility stays silent → init times out with actionable error', async () => {
    const fireList: Array<() => void> = [];
    env.deps.setTimeout = (cb, ms) => {
      fireList.push(cb);
      env.timers.push({ cb, ms });
      return null;
    };
    env.deps.utilityInitTimeoutMs = 500;

    const wm = new WindowManager(env.deps);
    const promise = wm.createProjectWindow({ projectPath: '/tmp/stuck' });
    expect(fireList.length).toBeGreaterThan(0);
    fireList[0]?.();
    await expect(promise).rejects.toThrow(/utility init timed out after 500ms/);
  });

  test('timeout timer is harmless if ready landed first (no double-settle)', async () => {
    const fireList: Array<() => void> = [];
    env.deps.setTimeout = (cb, ms) => {
      fireList.push(cb);
      env.timers.push({ cb, ms });
      return null;
    };

    const wm = new WindowManager(env.deps);
    const promise = wm.createProjectWindow({ projectPath: '/tmp/fast-ready' });
    env.utilities[0]?.fire({ type: 'ready', port: 51010, apiOrigin: 'http://localhost:51010' });
    await promise;

    expect(() => fireList[0]?.()).not.toThrow();
  });

  test('window close → utility shutdown IPC', async () => {
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/close-test' });
    env.utilities[0]?.fire({ type: 'ready', port: 51002, apiOrigin: 'http://localhost:51002' });
    await p;

    env.windows[0]?.fireClose();
    expect(env.utilities[0]?.postMessage).toHaveBeenCalledWith({ type: 'shutdown' });
  });

  test('utility exit removes project from map AND schedules liveness probe (D39)', async () => {
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/exit-test' });
    env.utilities[0]?.fire({ type: 'ready', port: 51003, apiOrigin: 'http://localhost:51003' });
    await p;

    expect(wm.windowCount()).toBe(1);
    env.utilities[0]?.fireExit(0);
    expect(wm.windowCount()).toBe(0);

    const livenessProbe = env.timers.find((t) => t.ms === 1000);
    expect(livenessProbe).toBeDefined();
  });

  test('liveness probe sends SIGTERM if pid still alive 1s after exit', async () => {
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/zombie-test' });
    env.utilities[0]?.fire({ type: 'ready', port: 51004, apiOrigin: 'http://localhost:51004' });
    await p;
    const utilityPid = env.utilities[0]?.pid;

    env.utilities[0]?.fireExit(0);
    const livenessProbe = env.timers.find((t) => t.ms === 1000);
    expect(livenessProbe).toBeDefined();

    livenessProbe?.cb();
    expect(env.killProbe).toHaveBeenCalledWith(utilityPid, 0);
    expect(env.killProbe).toHaveBeenCalledWith(utilityPid, 'SIGTERM');
  });

  test('liveness probe is silent if pid is truly gone (probe throws)', async () => {
    env.killProbe = mock(() => {
      throw new Error('No such process');
    });
    env.deps.killProbe = env.killProbe;
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/clean-exit' });
    env.utilities[0]?.fire({ type: 'ready', port: 51005, apiOrigin: 'http://localhost:51005' });
    await p;

    env.utilities[0]?.fireExit(0);
    const livenessProbe = env.timers.find((t) => t.ms === 1000);
    expect(livenessProbe).toBeDefined();
    expect(() => livenessProbe?.cb()).not.toThrow();
    expect(env.killProbe).toHaveBeenCalledTimes(1);
  });

  test('runClean (when provided) is called before forking utility', async () => {
    const runClean = mock(() => Promise.resolve());
    env.deps.runClean = runClean;
    const wm = new WindowManager(env.deps);
    const promise = wm.createProjectWindow({ projectPath: '/tmp/clean-run' });
    expect(env.utilities.length).toBe(0); // not forked yet
    await wait(5);
    expect(runClean).toHaveBeenCalledWith({ lockDir: '/tmp/clean-run/.ok/local' });
    env.utilities[0]?.fire({ type: 'ready', port: 51006, apiOrigin: 'http://localhost:51006' });
    await promise;
  });

  test('closeProjectWindow sends shutdown IPC + returns true', async () => {
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/close-via-api' });
    env.utilities[0]?.fire({ type: 'ready', port: 51007, apiOrigin: 'http://localhost:51007' });
    await p;
    expect(wm.closeProjectWindow('/tmp/close-via-api')).toBe(true);
    expect(env.utilities[0]?.postMessage).toHaveBeenCalledWith({ type: 'shutdown' });
  });

  test('closeProjectWindow on unknown project returns false', () => {
    const wm = new WindowManager(env.deps);
    expect(wm.closeProjectWindow('/tmp/never-opened')).toBe(false);
  });

  test('closeProjectWindow swallows postMessage errors (utility already exited)', async () => {
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/detached-port' });
    env.utilities[0]?.fire({ type: 'ready', port: 51099, apiOrigin: 'http://localhost:51099' });
    await p;

    const utility = env.utilities[0];
    if (!utility) throw new Error('utility missing');
    utility.postMessage = mock(() => {
      throw new Error('ERR_IPC_CHANNEL_CLOSED');
    });

    expect(() => wm.closeProjectWindow('/tmp/detached-port')).not.toThrow();
  });

  test('getContextForBrowserWindow resolves the project for a given window', async () => {
    const wm = new WindowManager(env.deps);
    const p1 = wm.createProjectWindow({ projectPath: '/tmp/ctx-a' });
    env.utilities[0]?.fire({ type: 'ready', port: 52001, apiOrigin: 'http://localhost:52001' });
    const ctxA = await p1;
    const p2 = wm.createProjectWindow({ projectPath: '/tmp/ctx-b' });
    env.utilities[1]?.fire({ type: 'ready', port: 52002, apiOrigin: 'http://localhost:52002' });
    const ctxB = await p2;

    expect(wm.getContextForBrowserWindow(ctxA.window)).toBe(ctxA);
    expect(wm.getContextForBrowserWindow(ctxB.window)).toBe(ctxB);
  });

  test('getContextForBrowserWindow returns undefined for unknown window', () => {
    const wm = new WindowManager(env.deps);
    const stranger = makeWindow();
    expect(wm.getContextForBrowserWindow(stranger)).toBeUndefined();
  });

  test('onUtilityMessage (when wired) receives post-init utility messages', async () => {
    const observed: unknown[] = [];
    env.deps.onUtilityMessage = (msg) => observed.push(msg);
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/post-init-listener' });
    env.utilities[0]?.fire({ type: 'ready', port: 52100, apiOrigin: 'http://localhost:52100' });
    await p;

    env.utilities[0]?.fire({
      type: 'debug-keyring-smoke-result',
      correlationId: 'cid-42',
      result: { ok: true, backend: 'keyring', durationMs: 9, timestamp: '2026-04-21T00:00:00Z' },
    });
    expect(observed).toHaveLength(1);
    expect(observed[0]).toMatchObject({
      type: 'debug-keyring-smoke-result',
      correlationId: 'cid-42',
    });
  });

  test('onUtilityMessage is not attached when not provided (no-op for back-compat)', async () => {
    delete env.deps.onUtilityMessage;
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/no-listener' });
    env.utilities[0]?.fire({ type: 'ready', port: 52101, apiOrigin: 'http://localhost:52101' });
    await p;
    expect(() =>
      env.utilities[0]?.fire({
        type: 'debug-keyring-smoke-result',
        correlationId: 'x',
        result: {},
      }),
    ).not.toThrow();
  });

  test('onUtilityExit (when wired) is invoked on utility exit with the utility ref', async () => {
    const observed: unknown[] = [];
    env.deps.onUtilityExit = (utility) => observed.push(utility);
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/exit-hook' });
    env.utilities[0]?.fire({ type: 'ready', port: 52200, apiOrigin: 'http://localhost:52200' });
    await p;

    const utilityRef = env.utilities[0];
    env.utilities[0]?.fireExit(0);

    expect(observed).toHaveLength(1);
    expect(observed[0]).toBe(utilityRef);
  });

  test('onUtilityExit is not attached when not provided (no-op for back-compat)', async () => {
    delete env.deps.onUtilityExit;
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/no-exit-hook' });
    env.utilities[0]?.fire({ type: 'ready', port: 52201, apiOrigin: 'http://localhost:52201' });
    await p;
    expect(() => env.utilities[0]?.fireExit(1)).not.toThrow();
  });

  describe('attach mode', () => {
    const liveLock: ServerLockMetadataLike = {
      pid: 65792,
      hostname: 'my-host',
      port: 59534,
      startedAt: '2026-04-17T20:23:20.713Z',
      worktreeRoot: '/tmp/dragon',
      kind: 'interactive',
      capabilities: ['http', 'ws'],
    };

    function enableAttachProbe(overrides?: {
      readServerLock?: WindowManagerDeps['readServerLock'];
      isProcessAlive?: WindowManagerDeps['isProcessAlive'];
      hostname?: WindowManagerDeps['hostname'];
      probeWsUpgrade?: WindowManagerDeps['probeWsUpgrade'];
    }) {
      env.deps.readServerLock = overrides?.readServerLock ?? (() => liveLock);
      env.deps.isProcessAlive = overrides?.isProcessAlive ?? (() => true);
      env.deps.hostname = overrides?.hostname ?? (() => 'my-host');
      env.deps.probeWsUpgrade = overrides?.probeWsUpgrade ?? (() => Promise.resolve(true));
    }

    test('attaches to live same-host lock — no utility forked', async () => {
      enableAttachProbe();
      const runClean = mock(() => Promise.resolve());
      env.deps.runClean = runClean;

      const wm = new WindowManager(env.deps);
      const ctx = await wm.createProjectWindow({ projectPath: '/tmp/dragon' });

      expect(env.utilities.length).toBe(0);
      expect(runClean).not.toHaveBeenCalled();
      expect(ctx.ownsServer).toBe(false);
      expect(ctx.utility).toBeNull();
      expect(ctx.port).toBe(59534);
      expect(ctx.apiOrigin).toBe('http://localhost:59534');
      expect(env.windows.length).toBe(1);
      expect(env.createWindowOpts[0]?.title).toBe('dragon — Open Knowledge');
    });

    test('stale lock (pid dead) falls through to spawn mode', async () => {
      enableAttachProbe({ isProcessAlive: () => false });
      const runClean = mock(() => Promise.resolve());
      env.deps.runClean = runClean;

      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/dragon' });

      await wait(5);
      expect(runClean).toHaveBeenCalled();
      expect(env.utilities.length).toBe(1);
      env.utilities[0]?.fire({ type: 'ready', port: 40001, apiOrigin: 'http://localhost:40001' });
      const ctx = await p;
      expect(ctx.ownsServer).toBe(true);
    });

    test('port=0 (holder still starting) falls through to spawn mode', async () => {
      enableAttachProbe({
        readServerLock: () => ({ ...liveLock, port: 0 }),
      });

      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/dragon' });
      await new Promise((r) => setTimeout(r, 5));
      expect(env.utilities.length).toBe(1);
      env.utilities[0]?.fire({ type: 'ready', port: 40002, apiOrigin: 'http://localhost:40002' });
      await p;
    });

    test('foreign-host lock falls through (D44 case c)', async () => {
      enableAttachProbe({ hostname: () => 'different-host' });

      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/dragon' });
      await new Promise((r) => setTimeout(r, 5));
      expect(env.utilities.length).toBe(1);
      env.utilities[0]?.fire({ type: 'ready', port: 40003, apiOrigin: 'http://localhost:40003' });
      await p;
    });

    test('no lock file falls through to spawn mode', async () => {
      enableAttachProbe({ readServerLock: () => null });

      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/dragon' });
      await new Promise((r) => setTimeout(r, 5));
      expect(env.utilities.length).toBe(1);
      env.utilities[0]?.fire({ type: 'ready', port: 40004, apiOrigin: 'http://localhost:40004' });
      await p;
    });

    test('window close on attached context does NOT send shutdown IPC', async () => {
      enableAttachProbe();
      const wm = new WindowManager(env.deps);
      const ctx = await wm.createProjectWindow({ projectPath: '/tmp/dragon' });
      expect(ctx.utility).toBeNull();

      env.windows[0]?.fireClose();
      expect(wm.getWindowFor('/tmp/dragon')).toBeUndefined();
    });

    test('closeProjectWindow on attached context returns true, sends no shutdown IPC', async () => {
      enableAttachProbe();
      const wm = new WindowManager(env.deps);
      await wm.createProjectWindow({ projectPath: '/tmp/dragon' });

      expect(wm.closeProjectWindow('/tmp/dragon')).toBe(true);
      expect(env.utilities.length).toBe(0);
    });

    test('re-opening an already-attached project focuses the existing window (case a still applies)', async () => {
      enableAttachProbe();
      const wm = new WindowManager(env.deps);
      const ctx1 = await wm.createProjectWindow({ projectPath: '/tmp/dragon' });
      const ctx2 = await wm.createProjectWindow({ projectPath: '/tmp/dragon' });

      expect(ctx2).toBe(ctx1);
      expect(env.windows.length).toBe(1);
      expect(ctx1.window.focus).toHaveBeenCalled();
    });

    test('attach-mode deps missing (back-compat) → tests without injection still spawn', async () => {
      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/no-probe' });
      await new Promise((r) => setTimeout(r, 5));
      expect(env.utilities.length).toBe(1);
      env.utilities[0]?.fire({ type: 'ready', port: 40005, apiOrigin: 'http://localhost:40005' });
      await p;
    });

    test('mcp-spawned lock falls through to spawn mode', async () => {
      enableAttachProbe({
        readServerLock: () => ({ ...liveLock, kind: 'mcp-spawned' }),
      });
      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/dragon' });
      await new Promise((r) => setTimeout(r, 5));
      expect(env.utilities.length).toBe(1);
      env.utilities[0]?.fire({ type: 'ready', port: 40010, apiOrigin: 'http://localhost:40010' });
      await p;
    });

    test('legacy lock (kind undefined) is conservatively refused', async () => {
      enableAttachProbe({
        readServerLock: () => {
          const { kind: _kind, ...rest } = liveLock;
          return rest;
        },
      });
      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/dragon' });
      await new Promise((r) => setTimeout(r, 5));
      expect(env.utilities.length).toBe(1);
      env.utilities[0]?.fire({ type: 'ready', port: 40011, apiOrigin: 'http://localhost:40011' });
      await p;
    });

    test('lock with capabilities missing "ws" falls through', async () => {
      enableAttachProbe({
        readServerLock: () => ({ ...liveLock, capabilities: ['http'] }),
      });
      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/dragon' });
      await new Promise((r) => setTimeout(r, 5));
      expect(env.utilities.length).toBe(1);
      env.utilities[0]?.fire({ type: 'ready', port: 40012, apiOrigin: 'http://localhost:40012' });
      await p;
    });

    test('WS-upgrade probe failure falls through to spawn mode', async () => {
      const probe = mock(() => Promise.resolve(false));
      enableAttachProbe({ probeWsUpgrade: probe });
      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/dragon' });
      await new Promise((r) => setTimeout(r, 5));
      expect(probe).toHaveBeenCalled();
      expect(env.utilities.length).toBe(1);
      env.utilities[0]?.fire({ type: 'ready', port: 40014, apiOrigin: 'http://localhost:40014' });
      await p;
    });

    test('WS-upgrade probe rejection (thrown error) falls through to spawn mode', async () => {
      const probe = mock(() => Promise.reject(new Error('socket refused')));
      enableAttachProbe({ probeWsUpgrade: probe });
      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/dragon' });
      await new Promise((r) => setTimeout(r, 5));
      expect(env.utilities.length).toBe(1);
      env.utilities[0]?.fire({ type: 'ready', port: 40015, apiOrigin: 'http://localhost:40015' });
      await p;
    });

    test('WS probe undefined → final gate skipped (back-compat for tests)', async () => {
      env.deps.readServerLock = () => liveLock;
      env.deps.isProcessAlive = () => true;
      env.deps.hostname = () => 'my-host';
      const wm = new WindowManager(env.deps);
      const ctx = await wm.createProjectWindow({ projectPath: '/tmp/dragon' });
      expect(env.utilities.length).toBe(0);
      expect(ctx.ownsServer).toBe(false);
    });
  });

  describe('lock-collision auto-kill', () => {
    const collisionExisting: ServerLockMetadataLike = {
      pid: 41420,
      hostname: 'my-host',
      port: 60000,
      startedAt: '2026-04-27T22:00:00.000Z',
      worktreeRoot: '/tmp/collision',
      kind: 'mcp-spawned',
      capabilities: ['http', 'ws'],
    };

    test('mcp-spawned collision → SIGTERM + retry + recovery', async () => {
      const kill = mock((_pid: number, _signal: NodeJS.Signals) => undefined);
      const waitReleased = mock(() => Promise.resolve(true));
      env.deps.killProcess = kill;
      env.deps.waitForLockReleased = waitReleased;

      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/collision' });

      await new Promise((r) => setTimeout(r, 5));
      expect(env.utilities.length).toBe(1);
      env.utilities[0]?.fire({
        type: 'error',
        message: `Open Knowledge server already running on port ${collisionExisting.port}`,
        kind: 'lock-collision',
        existingLock: collisionExisting,
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(kill).toHaveBeenCalledWith(collisionExisting.pid, 'SIGTERM');
      expect(waitReleased).toHaveBeenCalled();
      expect(env.utilities.length).toBe(2);

      env.utilities[1]?.fire({ type: 'ready', port: 60001, apiOrigin: 'http://localhost:60001' });
      const ctx = await p;
      expect(ctx.ownsServer).toBe(true);
      expect(ctx.port).toBe(60001);
    });

    test('mcp-spawned collision → second collision propagates as mcp-server-stuck', async () => {
      const kill = mock((_pid: number, _signal: NodeJS.Signals) => undefined);
      const waitReleased = mock(() => Promise.resolve(true));
      env.deps.killProcess = kill;
      env.deps.waitForLockReleased = waitReleased;

      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/collision' });
      await new Promise((r) => setTimeout(r, 5));
      env.utilities[0]?.fire({
        type: 'error',
        message: 'collision',
        kind: 'lock-collision',
        existingLock: collisionExisting,
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(env.utilities.length).toBe(2);
      env.utilities[1]?.fire({
        type: 'error',
        message: 'collision again',
        kind: 'lock-collision',
        existingLock: collisionExisting,
      });
      await expect(p).rejects.toThrow(/collision again/);
      expect(env.utilities.length).toBe(2);
      expect(kill).toHaveBeenCalledTimes(1);
    });

    test('lock fails to release → mcp-server-stuck error', async () => {
      const kill = mock((_pid: number, _signal: NodeJS.Signals) => undefined);
      const waitReleased = mock(() => Promise.resolve(false)); // never released
      env.deps.killProcess = kill;
      env.deps.waitForLockReleased = waitReleased;

      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/collision' });
      await new Promise((r) => setTimeout(r, 5));
      env.utilities[0]?.fire({
        type: 'error',
        message: 'collision',
        kind: 'lock-collision',
        existingLock: collisionExisting,
      });
      await expect(p).rejects.toThrow(/still holding the server lock/);
      expect(env.utilities.length).toBe(1);
    });

    test('interactive collision → no auto-kill, error propagates', async () => {
      const kill = mock((_pid: number, _signal: NodeJS.Signals) => undefined);
      env.deps.killProcess = kill;

      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/collision' });
      await new Promise((r) => setTimeout(r, 5));
      env.utilities[0]?.fire({
        type: 'error',
        message: 'Open Knowledge already running for this project',
        kind: 'lock-collision',
        existingLock: { ...collisionExisting, kind: 'interactive' },
      });
      await expect(p).rejects.toThrow(/Open Knowledge already running/);
      expect(kill).not.toHaveBeenCalled();
      expect(env.utilities.length).toBe(1);
    });

    test('non-collision error propagates without retry', async () => {
      const kill = mock((_pid: number, _signal: NodeJS.Signals) => undefined);
      env.deps.killProcess = kill;

      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/collision' });
      await new Promise((r) => setTimeout(r, 5));
      env.utilities[0]?.fire({
        type: 'error',
        message: 'something else broke',
      });
      await expect(p).rejects.toThrow(/something else broke/);
      expect(kill).not.toHaveBeenCalled();
      expect(env.utilities.length).toBe(1);
    });

    const HOSTILE_PIDS: ReadonlyArray<{ pid: unknown; label: string }> = [
      { pid: 0, label: 'PID 0 (process group)' },
      { pid: 1, label: 'PID 1 (init/launchd)' },
      { pid: -42, label: 'negative PID' },
      { pid: 1.5, label: 'non-integer PID' },
      { pid: Number.NaN, label: 'NaN PID' },
      { pid: 0x80000000, label: 'PID above 2^31-1' },
      { pid: 'abc', label: 'string PID' },
    ];
    for (const { pid, label } of HOSTILE_PIDS) {
      test(`hostile holder pid (${label}) — error propagates, no kill`, async () => {
        const kill = mock((_pid: number, _signal: NodeJS.Signals) => undefined);
        env.deps.killProcess = kill;

        const wm = new WindowManager(env.deps);
        const p = wm.createProjectWindow({ projectPath: '/tmp/collision' });
        await new Promise((r) => setTimeout(r, 5));
        env.utilities[0]?.fire({
          type: 'error',
          message: 'collision',
          kind: 'lock-collision',
          existingLock: {
            ...collisionExisting,
            pid: pid as number,
            kind: 'mcp-spawned',
          },
        });
        await expect(p).rejects.toThrow(/collision/);
        expect(kill).not.toHaveBeenCalled();
        expect(env.utilities.length).toBe(1);
      });
    }

    test('lock holder changes between collision and SIGTERM — no kill', async () => {
      const kill = mock((_pid: number, _signal: NodeJS.Signals) => undefined);
      const waitReleased = mock(() => Promise.resolve(true));
      env.deps.killProcess = kill;
      env.deps.waitForLockReleased = waitReleased;
      env.deps.readServerLock = () => ({
        ...collisionExisting,
        pid: collisionExisting.pid + 1,
      });

      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/collision' });
      await new Promise((r) => setTimeout(r, 5));
      env.utilities[0]?.fire({
        type: 'error',
        message: 'collision',
        kind: 'lock-collision',
        existingLock: collisionExisting,
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(env.utilities.length).toBe(2);
      env.utilities[1]?.fire({ type: 'ready', port: 60010, apiOrigin: 'http://localhost:60010' });
      await p;
      expect(kill).not.toHaveBeenCalled();
    });

    test('lock startedAt changes (same pid, different holder) — no kill', async () => {
      const kill = mock((_pid: number, _signal: NodeJS.Signals) => undefined);
      const waitReleased = mock(() => Promise.resolve(true));
      env.deps.killProcess = kill;
      env.deps.waitForLockReleased = waitReleased;
      env.deps.readServerLock = () => ({
        ...collisionExisting,
        startedAt: '2099-01-01T00:00:00.000Z',
      });

      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/collision' });
      await new Promise((r) => setTimeout(r, 5));
      env.utilities[0]?.fire({
        type: 'error',
        message: 'collision',
        kind: 'lock-collision',
        existingLock: collisionExisting,
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(env.utilities.length).toBe(2);
      env.utilities[1]?.fire({ type: 'ready', port: 60011, apiOrigin: 'http://localhost:60011' });
      await p;
      expect(kill).not.toHaveBeenCalled();
    });

    test('lock kind changes from mcp-spawned to interactive — no kill', async () => {
      const kill = mock((_pid: number, _signal: NodeJS.Signals) => undefined);
      const waitReleased = mock(() => Promise.resolve(true));
      env.deps.killProcess = kill;
      env.deps.waitForLockReleased = waitReleased;
      env.deps.readServerLock = () => ({
        ...collisionExisting,
        kind: 'interactive',
      });

      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/collision' });
      await new Promise((r) => setTimeout(r, 5));
      env.utilities[0]?.fire({
        type: 'error',
        message: 'collision',
        kind: 'lock-collision',
        existingLock: collisionExisting,
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(env.utilities.length).toBe(2);
      env.utilities[1]?.fire({ type: 'ready', port: 60012, apiOrigin: 'http://localhost:60012' });
      await p;
      expect(kill).not.toHaveBeenCalled();
    });

    test('lock released between collision and SIGTERM — no kill, retry succeeds', async () => {
      const kill = mock((_pid: number, _signal: NodeJS.Signals) => undefined);
      const waitReleased = mock(() => Promise.resolve(true));
      env.deps.killProcess = kill;
      env.deps.waitForLockReleased = waitReleased;
      env.deps.readServerLock = () => null;

      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/collision' });
      await new Promise((r) => setTimeout(r, 5));
      env.utilities[0]?.fire({
        type: 'error',
        message: 'collision',
        kind: 'lock-collision',
        existingLock: collisionExisting,
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(env.utilities.length).toBe(2);
      env.utilities[1]?.fire({ type: 'ready', port: 60013, apiOrigin: 'http://localhost:60013' });
      await p;
      expect(kill).not.toHaveBeenCalled();
    });

    test('lock holder changes between SIGTERM and SIGKILL — only SIGTERM sent', async () => {
      const kill = mock((_pid: number, _signal: NodeJS.Signals) => undefined);
      let released = 0;
      const waitReleased = mock(() => {
        released += 1;
        return Promise.resolve(false);
      });
      env.deps.killProcess = kill;
      env.deps.waitForLockReleased = waitReleased;
      let lookups = 0;
      env.deps.readServerLock = () => {
        lookups += 1;
        return lookups === 1
          ? collisionExisting
          : { ...collisionExisting, pid: collisionExisting.pid + 7 };
      };

      const wm = new WindowManager(env.deps);
      const p = wm.createProjectWindow({ projectPath: '/tmp/collision' });
      await new Promise((r) => setTimeout(r, 5));
      env.utilities[0]?.fire({
        type: 'error',
        message: 'collision',
        kind: 'lock-collision',
        existingLock: collisionExisting,
      });
      await expect(p).rejects.toThrow(/still holding the server lock/);
      expect(released).toBe(1); // Only the SIGTERM grace wait — SIGKILL was skipped.
      expect(kill).toHaveBeenCalledTimes(1);
      expect(kill).toHaveBeenCalledWith(collisionExisting.pid, 'SIGTERM');
    });
  });
});

describe('WindowManager.focusWindowForProject (M4 URL-scheme warm-start)', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = buildEnv();
  });

  test('returns null when no window is open for the project', () => {
    const wm = new WindowManager(env.deps);
    expect(wm.focusWindowForProject('/tmp/never-opened')).toBeNull();
  });

  test('returns the window when a project is open + calls focus+show', async () => {
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/warm-proj' });
    env.utilities[0]?.fire({ type: 'ready', port: 51200, apiOrigin: 'http://localhost:51200' });
    const ctx = await p;

    const win = wm.focusWindowForProject('/tmp/warm-proj');
    expect(win).toBe(ctx.window);
    expect(ctx.window.focus).toHaveBeenCalled();
    expect(ctx.window.show).toHaveBeenCalled();
  });

  test('restores a minimized window before focusing', async () => {
    const w = makeWindow({ minimized: true });
    env.deps.createWindow = () => {
      env.createWindowOpts.push({ additionalArguments: [], title: '' });
      env.windows.push(w);
      return w;
    };
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/min-proj' });
    env.utilities[0]?.fire({ type: 'ready', port: 51201, apiOrigin: 'http://localhost:51201' });
    await p;

    const result = wm.focusWindowForProject('/tmp/min-proj');
    expect(result).toBe(w);
    expect(w.isMinimized).toHaveBeenCalled();
    expect(w.restore).toHaveBeenCalled();
    expect(w.focus).toHaveBeenCalled();
  });

  test('canonicalizes project path before lookup (resolve equivalence)', async () => {
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/canon' });
    env.utilities[0]?.fire({ type: 'ready', port: 51202, apiOrigin: 'http://localhost:51202' });
    await p;

    expect(wm.focusWindowForProject('/tmp/canon/.')).not.toBeNull();
  });

  test('realpath canonicalization: open via symlink, focus via realpath matches', async () => {
    const realpathMap = new Map([
      ['/Users/me/workspaces/dragon', '/Users/me/projects/dragon'],
      ['/Users/me/projects/dragon', '/Users/me/projects/dragon'],
    ]);
    env.deps.realpathSync = (p: string) => {
      const mapped = realpathMap.get(p);
      if (mapped) return mapped;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    };
    const wm = new WindowManager(env.deps);
    const pending = wm.createProjectWindow({ projectPath: '/Users/me/workspaces/dragon' });
    env.utilities[0]?.fire({ type: 'ready', port: 51210, apiOrigin: 'http://localhost:51210' });
    const ctx = await pending;

    const found = wm.focusWindowForProject('/Users/me/projects/dragon');
    expect(found).toBe(ctx.window);
    expect(ctx.window.focus).toHaveBeenCalled();
    expect(wm.getWindowFor('/Users/me/projects/dragon')).toBe(ctx);
    expect(ctx.canonicalKey).toBe('/Users/me/projects/dragon');
    expect(ctx.projectPath).toBe('/Users/me/workspaces/dragon');
  });

  test('realpathSync throws (ENOENT) → falls back to resolve(projectPath)', async () => {
    env.deps.realpathSync = () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    };
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/ghost-path' });
    env.utilities[0]?.fire({ type: 'ready', port: 51211, apiOrigin: 'http://localhost:51211' });
    const ctx = await p;
    expect(wm.focusWindowForProject('/tmp/ghost-path')).toBe(ctx.window);
    expect(ctx.canonicalKey).toBe('/tmp/ghost-path');
  });
});

describe('WindowManager — pendingDeepLinkDoc dom-ready gate (M4 US-007 / Finding 2)', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = buildEnv();
  });

  test('spawn path: pendingDeepLinkDoc registers dom-ready listener BEFORE loadURL resolves', async () => {
    let onceCalledBeforeLoadResolved = false;
    let domReadyRegistrations = 0;
    env.deps.createWindow = () => {
      const w = makeWindow();
      const baseOnce = w.webContents.once as (event: 'dom-ready', cb: () => void) => void;
      w.webContents.once = ((event: 'dom-ready', cb: () => void) => {
        domReadyRegistrations++;
        baseOnce(event, cb);
      }) as typeof w.webContents.once;
      const baseLoadFile = w.loadFile as () => Promise<void>;
      w.loadFile = mock(async () => {
        onceCalledBeforeLoadResolved = domReadyRegistrations > 0;
        return baseLoadFile();
      }) as typeof w.loadFile;
      env.windows.push(w);
      env.createWindowOpts.push({ additionalArguments: [], title: '' });
      return w;
    };

    const wm = new WindowManager(env.deps);
    const pending = wm.createProjectWindow({
      projectPath: '/tmp/deep-link-proj',
      pendingDeepLinkDoc: 'notes/meeting',
    });
    env.utilities[0]?.fire({ type: 'ready', port: 51220, apiOrigin: 'http://localhost:51220' });
    await pending;

    expect(onceCalledBeforeLoadResolved).toBe(true);
    const window = env.windows[0];
    if (!window) throw new Error('expected window to be created');

    expect((window.webContents.send as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    window.fireDomReady();
    const sendCalls = (window.webContents.send as ReturnType<typeof mock>).mock.calls;
    const deepLinkCall = sendCalls.find((c) => c[0] === 'ok:deep-link');
    expect(deepLinkCall).toBeDefined();
    expect(deepLinkCall?.[1]).toEqual({ doc: 'notes/meeting' });
  });

  test('spawn path: no pendingDeepLinkDoc → no ok:deep-link event fires on dom-ready', async () => {
    const wm = new WindowManager(env.deps);
    const pending = wm.createProjectWindow({ projectPath: '/tmp/no-deep-link' });
    env.utilities[0]?.fire({ type: 'ready', port: 51221, apiOrigin: 'http://localhost:51221' });
    await pending;

    const window = env.windows[0];
    if (!window) throw new Error('expected window to be created');
    window.fireDomReady();
    const sendCalls = (window.webContents.send as ReturnType<typeof mock>).mock.calls;
    expect(sendCalls.find((c) => c[0] === 'ok:deep-link')).toBeUndefined();
  });

  test('attach path: pendingDeepLinkDoc also fires on dom-ready', async () => {
    const liveLock: ServerLockMetadataLike = {
      pid: 65793,
      hostname: 'my-host',
      port: 59600,
      startedAt: '2026-04-21T10:00:00.000Z',
      worktreeRoot: '/tmp/attach-deep-link',
      kind: 'interactive',
      capabilities: ['http', 'ws'],
    };
    env.deps.readServerLock = () => liveLock;
    env.deps.isProcessAlive = () => true;
    env.deps.hostname = () => 'my-host';
    env.deps.probeWsUpgrade = () => Promise.resolve(true);

    const wm = new WindowManager(env.deps);
    const ctx = await wm.createProjectWindow({
      projectPath: '/tmp/attach-deep-link',
      pendingDeepLinkDoc: 'attached/note',
    });
    expect(ctx.ownsServer).toBe(false);

    const window = env.windows[0];
    if (!window) throw new Error('expected window to be created');
    window.fireDomReady();
    const sendCalls = (window.webContents.send as ReturnType<typeof mock>).mock.calls;
    const deepLinkCall = sendCalls.find((c) => c[0] === 'ok:deep-link');
    expect(deepLinkCall).toBeDefined();
    expect(deepLinkCall?.[1]).toEqual({ doc: 'attached/note' });
  });
});

describe('WindowManager.getWindowFor — canonicalization symmetry with focusWindowForProject', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = buildEnv();
  });

  test('returns the window when caller passes a non-canonical path', async () => {
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/canon-get' });
    env.utilities[0]?.fire({ type: 'ready', port: 51300, apiOrigin: 'http://localhost:51300' });
    const ctx = await p;

    expect(wm.getWindowFor('/tmp/canon-get/.')).toBe(ctx);
  });
});

describe('WindowManager — show-gate integration', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = buildEnv();
  });

  test('spawn-path createProjectWindow registers the new window with showGate (kind=editor)', async () => {
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/show-gate-spawn' });
    env.utilities[0]?.fire({ type: 'ready', port: 51400, apiOrigin: 'http://localhost:51400' });
    const ctx = await p;

    expect(env.showGateRegistrations).toHaveLength(1);
    const reg = env.showGateRegistrations[0];
    expect(reg?.window).toBe(ctx.window);
    expect(reg?.kind).toBe('editor');
    expect(reg?.disposed).toBe(false);
  });

  test('attach-path createProjectWindow registers the new window with showGate (kind=editor)', async () => {
    env.deps.readServerLock = () => ({
      pid: 9001,
      hostname: 'test-host',
      port: 51500,
      startedAt: '2026-05-07T00:00:00Z',
      worktreeRoot: '/tmp/attach-gate',
      kind: 'interactive',
      capabilities: ['http', 'ws'],
    });
    env.deps.isProcessAlive = () => true;
    env.deps.hostname = () => 'test-host';
    env.deps.probeWsUpgrade = () => Promise.resolve(true);

    const wm = new WindowManager(env.deps);
    const ctx = await wm.createProjectWindow({ projectPath: '/tmp/attach-gate' });

    expect(env.utilities).toHaveLength(0);
    expect(env.showGateRegistrations).toHaveLength(1);
    const reg = env.showGateRegistrations[0];
    expect(reg?.window).toBe(ctx.window);
    expect(reg?.kind).toBe('editor');
  });

  test('show-gate registration is disposed when the window closes (spawn path)', async () => {
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/dispose-spawn' });
    env.utilities[0]?.fire({ type: 'ready', port: 51410, apiOrigin: 'http://localhost:51410' });
    await p;

    const win = env.windows[0];
    if (!win) throw new Error('window not created');
    expect(env.showGateRegistrations[0]?.disposed).toBe(false);
    win.fireClose();
    expect(env.showGateRegistrations[0]?.disposed).toBe(true);
  });

  test('show-gate registration is disposed when the window closes (attach path)', async () => {
    env.deps.readServerLock = () => ({
      pid: 9002,
      hostname: 'test-host',
      port: 51510,
      startedAt: '2026-05-07T00:00:00Z',
      worktreeRoot: '/tmp/dispose-attach',
      kind: 'interactive',
      capabilities: ['http', 'ws'],
    });
    env.deps.isProcessAlive = () => true;
    env.deps.hostname = () => 'test-host';
    env.deps.probeWsUpgrade = () => Promise.resolve(true);

    const wm = new WindowManager(env.deps);
    await wm.createProjectWindow({ projectPath: '/tmp/dispose-attach' });

    const win = env.windows[0];
    if (!win) throw new Error('window not created');
    expect(env.showGateRegistrations[0]?.disposed).toBe(false);
    win.fireClose();
    expect(env.showGateRegistrations[0]?.disposed).toBe(true);
  });

  test('window-manager no longer schedules its own ready-to-show 5_000ms timer (gate owns timeout)', async () => {
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/no-direct-timer' });
    env.utilities[0]?.fire({ type: 'ready', port: 51420, apiOrigin: 'http://localhost:51420' });
    await p;

    const fiveSecondTimers = env.timers.filter((t) => t.ms === 5_000);
    expect(fiveSecondTimers).toHaveLength(0);
  });
});
