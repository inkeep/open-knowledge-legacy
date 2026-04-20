import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  type BrowserWindowLike,
  type UtilityProcessLike,
  WindowManager,
  type WindowManagerDeps,
} from '../../src/main/window-manager.ts';

/**
 * WindowManager unit tests.
 *
 * No real Electron — uses BrowserWindowLike + UtilityProcessLike subset
 * interfaces with mocked implementations. Asserts:
 *   - createProjectWindow forks utility, sends init, waits for ready, creates window
 *   - re-opening an already-open project focuses the existing window (D44 case a)
 *   - utility 'exit' event removes the project from the map + schedules liveness probe
 *   - window close → utility shutdown IPC
 */

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

function makeWindow(): BrowserWindowLike & { fireClose: () => void } {
  let closeHandler: (() => void) | null = null;
  return {
    focus: mock(() => {}),
    on: mock((_event: 'closed', cb: () => void) => {
      closeHandler = cb;
    }) as BrowserWindowLike['on'],
    webContents: { send: mock(() => {}) },
    loadFile: mock(() => Promise.resolve()),
    loadURL: mock(() => Promise.resolve()),
    fireClose: () => closeHandler?.(),
  };
}

interface TestEnv {
  utilities: MockUtility[];
  windows: Array<ReturnType<typeof makeWindow>>;
  timers: Array<{ cb: () => void; ms: number }>;
  killProbe: ReturnType<typeof mock>;
  deps: WindowManagerDeps;
}

function buildEnv(): TestEnv {
  const utilities: MockUtility[] = [];
  const windows: Array<ReturnType<typeof makeWindow>> = [];
  const timers: Array<{ cb: () => void; ms: number }> = [];
  const killProbe = mock(() => {});
  let pidCounter = 10000;
  return {
    utilities,
    windows,
    timers,
    killProbe,
    deps: {
      createWindow: () => {
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
    },
  };
}

describe('WindowManager', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = buildEnv();
  });

  test('createProjectWindow forks utility, sends init, waits for ready, creates window', async () => {
    const wm = new WindowManager(env.deps);
    const promise = wm.createProjectWindow({ projectPath: '/tmp/test-project' });

    // Utility must have been forked + init sent
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
      },
    });

    // Reply with ready
    utility.fire({ type: 'ready', port: 51234, apiOrigin: 'http://localhost:51234' });

    const ctx = await promise;
    expect(ctx.port).toBe(51234);
    expect(ctx.apiOrigin).toBe('http://localhost:51234');
    expect(ctx.projectName).toBe('test-project');

    // Window must have been created with the right additionalArguments
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

  test('utility error message rejects createProjectWindow', async () => {
    const wm = new WindowManager(env.deps);
    const promise = wm.createProjectWindow({ projectPath: '/tmp/err' });
    env.utilities[0]?.fire({ type: 'error', message: 'boot failed' });
    await expect(promise).rejects.toThrow('boot failed');
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

    // Liveness probe scheduled at 1000ms
    expect(env.timers.length).toBe(1);
    expect(env.timers[0]?.ms).toBe(1000);
  });

  test('liveness probe sends SIGTERM if pid still alive 1s after exit', async () => {
    const wm = new WindowManager(env.deps);
    const p = wm.createProjectWindow({ projectPath: '/tmp/zombie-test' });
    env.utilities[0]?.fire({ type: 'ready', port: 51004, apiOrigin: 'http://localhost:51004' });
    await p;
    const utilityPid = env.utilities[0]?.pid;

    env.utilities[0]?.fireExit(0);
    expect(env.timers.length).toBe(1);

    // Simulate "pid still alive" — killProbe doesn't throw
    env.timers[0]?.cb();
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
    // Should NOT throw — probe throws are caught
    expect(() => env.timers[0]?.cb()).not.toThrow();
    // Only the initial probe (pid, 0) was called; no SIGTERM follow-up
    expect(env.killProbe).toHaveBeenCalledTimes(1);
  });

  test('runClean (when provided) is called before forking utility', async () => {
    const runClean = mock(() => Promise.resolve());
    env.deps.runClean = runClean;
    const wm = new WindowManager(env.deps);
    const promise = wm.createProjectWindow({ projectPath: '/tmp/clean-run' });
    expect(env.utilities.length).toBe(0); // not forked yet
    // Wait a microtask so runClean's promise resolves
    await new Promise((r) => setTimeout(r, 5));
    expect(runClean).toHaveBeenCalledWith({ lockDir: '/tmp/clean-run/.open-knowledge' });
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
});
