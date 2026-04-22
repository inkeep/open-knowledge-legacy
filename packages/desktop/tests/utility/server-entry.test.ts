import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { KeyringSmokeResult } from '../../src/utility/keyring-smoke.ts';
import { setupUtility } from '../../src/utility/server-entry.ts';

/**
 * Utility-process unit tests.
 *
 * Don't fork an actual utilityProcess — Bun's test runner can't host one. The
 * `setupUtility(deps)` factory takes an injected parentPort + injected server
 * import + injected exit/setInterval, so we mock all of these and assert the
 * IPC + lifecycle branches.
 *
 * Full forked-utility behavior is covered by the US-013 M1 smoke test which
 * launches a real Electron BrowserWindow.
 */

interface MockParentPort {
  on: ReturnType<typeof mock>;
  postMessage: ReturnType<typeof mock>;
  /** Helper — fire a message into the registered handler. */
  fire: (msg: unknown) => void;
}

function mockParentPort(): MockParentPort {
  let handler: ((event: { data: unknown }) => void) | null = null;
  const on = mock((_event: 'message', h: (event: { data: unknown }) => void) => {
    handler = h;
  });
  return {
    on,
    postMessage: mock(() => {}),
    fire: (msg: unknown) => handler?.({ data: msg }),
  };
}

interface MockEnv {
  parentPort: MockParentPort;
  exit: ReturnType<typeof mock>;
  killProbe: ReturnType<typeof mock>;
  signalHandlers: Map<string, () => void>;
  intervals: Array<{ cb: () => void; ms: number }>;
  intervalCancel: ReturnType<typeof mock>;
}

function buildEnv(): MockEnv {
  const env: MockEnv = {
    parentPort: mockParentPort(),
    exit: mock(() => {}),
    killProbe: mock(() => {}),
    signalHandlers: new Map(),
    intervals: [],
    intervalCancel: mock(() => {}),
  };
  return env;
}

describe('setupUtility (IPC handshake + lifecycle)', () => {
  let env: MockEnv;

  beforeEach(() => {
    env = buildEnv();
  });

  test('on init message: imports server, calls bootServer with M1 opt-outs, posts ready', async () => {
    const fakeBooted = {
      port: 51234,
      destroy: mock(() => Promise.resolve()),
      degraded: [] as readonly string[],
    };
    const bootServer = mock(() => Promise.resolve(fakeBooted));
    const importServer = mock(() =>
      Promise.resolve({ bootServer } as unknown as typeof import('@inkeep/open-knowledge-server')),
    );

    const handle = setupUtility({
      parentPort: env.parentPort,
      importServer,
      exit: env.exit,
      parentPid: 99999,
      killProbe: env.killProbe,
      onSignal: (sig, h) => env.signalHandlers.set(sig, h),
      setInterval: (cb, ms) => {
        env.intervals.push({ cb, ms });
        return { unref: mock(() => {}), clear: env.intervalCancel };
      },
    });

    env.parentPort.fire({
      type: 'init',
      opts: {
        contentDir: '/tmp/test-project',
        projectDir: '/tmp/test-project',
        port: 0,
        host: 'localhost',
      },
    });

    const ready = await handle.readyPromise;
    expect(ready.type).toBe('ready');
    expect(ready.port).toBe(51234);
    expect(ready.apiOrigin).toBe('http://localhost:51234');

    // Asserts the M1 opt-outs (D36)
    const callArgs = bootServer.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(callArgs?.attachUiSibling).toBe(false);
    expect(callArgs?.idleShutdownMs).toBe(null);
    expect(callArgs?.skipAutoInit).toBe(false);

    expect(env.parentPort.postMessage).toHaveBeenCalledWith({
      type: 'ready',
      port: 51234,
      apiOrigin: 'http://localhost:51234',
    });
  });

  test('on init failure: posts error and exits non-zero', async () => {
    const importServer = mock(() => Promise.reject(new Error('boot failed')));
    const handle = setupUtility({
      parentPort: env.parentPort,
      importServer,
      exit: env.exit,
      parentPid: 99999,
      killProbe: env.killProbe,
      onSignal: (sig, h) => env.signalHandlers.set(sig, h),
      setInterval: (cb, ms) => {
        env.intervals.push({ cb, ms });
        return { unref: mock(() => {}), clear: env.intervalCancel };
      },
    });

    env.parentPort.fire({
      type: 'init',
      opts: { contentDir: '/tmp/x', projectDir: '/tmp/x', port: 0, host: 'localhost' },
    });

    await expect(handle.readyPromise).rejects.toThrow('boot failed');
    expect(env.exit).toHaveBeenCalledWith(1);
  });

  test('parent-death poll: triggers shutdown on EPERM/ESRCH', async () => {
    const fakeBooted = {
      port: 51234,
      destroy: mock(() => Promise.resolve()),
      degraded: [] as readonly string[],
    };
    const bootServer = mock(() => Promise.resolve(fakeBooted));

    const handle = setupUtility({
      parentPort: env.parentPort,
      importServer: () =>
        Promise.resolve({
          bootServer,
        } as unknown as typeof import('@inkeep/open-knowledge-server')),
      exit: env.exit,
      parentPid: 99999,
      killProbe: () => {
        const err = new Error('No such process') as NodeJS.ErrnoException;
        err.code = 'ESRCH';
        throw err;
      },
      onSignal: (sig, h) => env.signalHandlers.set(sig, h),
      setInterval: (cb, ms) => {
        env.intervals.push({ cb, ms });
        return { unref: mock(() => {}), clear: env.intervalCancel };
      },
      parentPollMs: 100,
    });

    // Trigger the polled callback manually
    expect(env.intervals.length).toBeGreaterThan(0);
    const pollCb = env.intervals[0]?.cb;
    expect(pollCb).toBeDefined();
    pollCb?.();

    // Allow async shutdown to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(env.exit).toHaveBeenCalledWith(0);
    void handle;
  });

  test('shutdown IPC: drains booted server then exits 0', async () => {
    const destroy = mock(() => Promise.resolve());
    const fakeBooted = { port: 51234, destroy, degraded: [] as readonly string[] };
    const bootServer = mock(() => Promise.resolve(fakeBooted));

    const handle = setupUtility({
      parentPort: env.parentPort,
      importServer: () =>
        Promise.resolve({
          bootServer,
        } as unknown as typeof import('@inkeep/open-knowledge-server')),
      exit: env.exit,
      parentPid: 99999,
      killProbe: env.killProbe,
      onSignal: (sig, h) => env.signalHandlers.set(sig, h),
      setInterval: (cb, ms) => {
        env.intervals.push({ cb, ms });
        return { unref: mock(() => {}), clear: env.intervalCancel };
      },
    });

    env.parentPort.fire({
      type: 'init',
      opts: { contentDir: '/tmp/x', projectDir: '/tmp/x', port: 0, host: 'localhost' },
    });
    await handle.readyPromise;

    env.parentPort.fire({ type: 'shutdown' });
    await new Promise((r) => setTimeout(r, 10));

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(env.exit).toHaveBeenCalledWith(0);
    // stopParentPoll must actually stop the interval on shutdown — otherwise
    // the parent-death poll keeps firing and can re-enter shutdown in tests
    // where `exit` is mocked.
    expect(env.intervalCancel).toHaveBeenCalled();
  });

  test('SIGTERM handler triggers same shutdown path as IPC', async () => {
    const destroy = mock(() => Promise.resolve());
    const fakeBooted = { port: 51234, destroy, degraded: [] as readonly string[] };
    const bootServer = mock(() => Promise.resolve(fakeBooted));

    const handle = setupUtility({
      parentPort: env.parentPort,
      importServer: () =>
        Promise.resolve({
          bootServer,
        } as unknown as typeof import('@inkeep/open-knowledge-server')),
      exit: env.exit,
      parentPid: 99999,
      killProbe: env.killProbe,
      onSignal: (sig, h) => env.signalHandlers.set(sig, h),
      setInterval: (cb, ms) => {
        env.intervals.push({ cb, ms });
        return { unref: mock(() => {}), clear: env.intervalCancel };
      },
    });

    env.parentPort.fire({
      type: 'init',
      opts: { contentDir: '/tmp/x', projectDir: '/tmp/x', port: 0, host: 'localhost' },
    });
    await handle.readyPromise;

    const sigtermHandler = env.signalHandlers.get('SIGTERM');
    expect(sigtermHandler).toBeDefined();
    sigtermHandler?.();
    await new Promise((r) => setTimeout(r, 10));

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(env.exit).toHaveBeenCalledWith(0);
  });

  test('shutdown is idempotent — multiple calls drain once', async () => {
    const destroy = mock(() => Promise.resolve());
    const fakeBooted = { port: 51234, destroy, degraded: [] as readonly string[] };
    const bootServer = mock(() => Promise.resolve(fakeBooted));

    const handle = setupUtility({
      parentPort: env.parentPort,
      importServer: () =>
        Promise.resolve({
          bootServer,
        } as unknown as typeof import('@inkeep/open-knowledge-server')),
      exit: env.exit,
      parentPid: 99999,
      killProbe: env.killProbe,
      onSignal: (sig, h) => env.signalHandlers.set(sig, h),
      setInterval: (cb, ms) => {
        env.intervals.push({ cb, ms });
        return { unref: mock(() => {}), clear: env.intervalCancel };
      },
    });

    env.parentPort.fire({
      type: 'init',
      opts: { contentDir: '/tmp/x', projectDir: '/tmp/x', port: 0, host: 'localhost' },
    });
    await handle.readyPromise;

    await handle.shutdown('test-1');
    await handle.shutdown('test-2');
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  test('debug-keyring-smoke IPC: invokes injected runSmoke and echoes correlationId', async () => {
    const smokeResult: KeyringSmokeResult = {
      ok: true,
      backend: 'keyring',
      durationMs: 7,
      timestamp: '2026-04-21T00:00:00.000Z',
    };
    const runSmoke = mock(() => Promise.resolve(smokeResult));

    setupUtility({
      parentPort: env.parentPort,
      importServer: () =>
        Promise.resolve({
          bootServer: mock(() => Promise.resolve({})),
        } as unknown as typeof import('@inkeep/open-knowledge-server')),
      exit: env.exit,
      parentPid: 99999,
      killProbe: env.killProbe,
      onSignal: (sig, h) => env.signalHandlers.set(sig, h),
      setInterval: (cb, ms) => {
        env.intervals.push({ cb, ms });
        return { unref: mock(() => {}), clear: env.intervalCancel };
      },
      runSmoke,
    });

    env.parentPort.fire({ type: 'debug-keyring-smoke', correlationId: 'abc-123' });
    await new Promise((r) => setTimeout(r, 5));

    expect(runSmoke).toHaveBeenCalledTimes(1);
    expect(env.parentPort.postMessage).toHaveBeenCalledWith({
      type: 'debug-keyring-smoke-result',
      correlationId: 'abc-123',
      result: smokeResult,
    });
  });

  test('degraded subsystems are reported via separate IPC after ready', async () => {
    const fakeBooted = {
      port: 51234,
      destroy: mock(() => Promise.resolve()),
      degraded: ['shadow-repo'] as readonly string[],
    };
    const bootServer = mock(() => Promise.resolve(fakeBooted));

    const handle = setupUtility({
      parentPort: env.parentPort,
      importServer: () =>
        Promise.resolve({
          bootServer,
        } as unknown as typeof import('@inkeep/open-knowledge-server')),
      exit: env.exit,
      parentPid: 99999,
      killProbe: env.killProbe,
      onSignal: (sig, h) => env.signalHandlers.set(sig, h),
      setInterval: (cb, ms) => {
        env.intervals.push({ cb, ms });
        return { unref: mock(() => {}), clear: env.intervalCancel };
      },
    });

    env.parentPort.fire({
      type: 'init',
      opts: { contentDir: '/tmp/x', projectDir: '/tmp/x', port: 0, host: 'localhost' },
    });
    await handle.readyPromise;

    expect(env.parentPort.postMessage).toHaveBeenCalledWith({
      type: 'degraded',
      subsystems: ['shadow-repo'],
    });
  });
});
