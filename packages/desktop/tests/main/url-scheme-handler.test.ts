import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { registerProtocolHandler } from '../../src/main/url-scheme.ts';

/**
 * Unit tests for `registerProtocolHandler`'s queue-then-flush behavior.
 *
 * Uses a fake `app` that captures listeners + exposes a trigger surface so
 * tests can drive the cold-start / warm / argv paths deterministically. No
 * real `electron` import — the pure `app` dep interface is tested against a
 * stub.
 */

type AppEvent = 'open-url' | 'second-instance' | 'before-quit';
type OpenUrlListener = (event: { preventDefault: () => void }, url: string) => void;
type SecondInstanceListener = (event: unknown, argv: readonly string[]) => void;
type BeforeQuitListener = () => void;
type AppListener = OpenUrlListener | SecondInstanceListener | BeforeQuitListener;

interface FakeApp {
  on: ReturnType<typeof mock>;
  whenReady: () => Promise<void>;
  isPackaged: boolean;
  setAsDefaultProtocolClient: ReturnType<typeof mock>;
  removeAsDefaultProtocolClient: ReturnType<typeof mock>;
  fireOpenUrl: (url: string) => void;
  fireSecondInstance: (argv: readonly string[]) => void;
  fireBeforeQuit: () => void;
  resolveReady: () => void;
}

function makeFakeApp(opts?: { isPackaged?: boolean }): FakeApp {
  const listeners = new Map<AppEvent, AppListener>();
  let resolveReadyFn: (() => void) | null = null;
  const whenReady = () =>
    new Promise<void>((resolve) => {
      resolveReadyFn = resolve;
    });
  const on = mock((event: AppEvent, cb: AppListener) => {
    listeners.set(event, cb);
  });
  return {
    on,
    whenReady,
    isPackaged: opts?.isPackaged ?? true,
    setAsDefaultProtocolClient: mock(() => true),
    removeAsDefaultProtocolClient: mock(() => true),
    fireOpenUrl: (url) => {
      const cb = listeners.get('open-url') as OpenUrlListener | undefined;
      if (!cb) throw new Error('open-url listener not registered');
      const event = { preventDefault: mock(() => {}) };
      cb(event, url);
    },
    fireSecondInstance: (argv) => {
      const cb = listeners.get('second-instance') as SecondInstanceListener | undefined;
      if (!cb) throw new Error('second-instance listener not registered');
      cb({}, argv);
    },
    fireBeforeQuit: () => {
      const cb = listeners.get('before-quit') as BeforeQuitListener | undefined;
      if (!cb) throw new Error('before-quit listener not registered');
      cb();
    },
    resolveReady: () => {
      if (!resolveReadyFn) throw new Error('whenReady not awaited yet');
      resolveReadyFn();
    },
  };
}

interface FakeWindowHandle {
  id: string;
}

interface TestEnv {
  app: FakeApp;
  focusWindowForProject: ReturnType<typeof mock>;
  openProject: ReturnType<typeof mock>;
  sendDeepLink: ReturnType<typeof mock>;
  getAnyReadyWindow: ReturnType<typeof mock>;
  timers: Array<{ cb: () => void; ms: number }>;
  warnLog: Array<{ obj: object; msg: string }>;
  existingWindows: Map<string, FakeWindowHandle>;
  readyWindow: FakeWindowHandle | null;
}

function makeEnv(opts?: { isPackaged?: boolean }): TestEnv {
  const existingWindows = new Map<string, FakeWindowHandle>();
  let readyWindow: FakeWindowHandle | null = null;
  const timers: Array<{ cb: () => void; ms: number }> = [];
  const warnLog: Array<{ obj: object; msg: string }> = [];
  return {
    app: makeFakeApp(opts),
    focusWindowForProject: mock((p: string) => existingWindows.get(p) ?? null),
    openProject: mock(
      async (
        p: string,
        _opts?: { pendingDeepLinkDoc?: string },
      ): Promise<FakeWindowHandle | null> => {
        const win: FakeWindowHandle = { id: `win-${p}` };
        existingWindows.set(p, win);
        if (!readyWindow) readyWindow = win;
        return win;
      },
    ),
    sendDeepLink: mock(() => {}),
    getAnyReadyWindow: mock(() => readyWindow),
    timers,
    warnLog,
    existingWindows,
    get readyWindow() {
      return readyWindow;
    },
    set readyWindow(w: FakeWindowHandle | null) {
      readyWindow = w;
    },
  } as unknown as TestEnv;
}

/** Flush pending microtasks/promises so then-chains observable downstream. */
async function flushPromises() {
  // Two await ticks to settle nested .then in the handler's flush loop.
  await Promise.resolve();
  await Promise.resolve();
}

/** Tick scheduler: fires the next enqueued timer in env.timers. */
function tickTimer(env: TestEnv): void {
  const next = env.timers.shift();
  if (!next) throw new Error('no timer to tick');
  next.cb();
}

describe('registerProtocolHandler — setAsDefaultProtocolClient', () => {
  test('calls setAsDefaultProtocolClient in dev mode (!isPackaged)', () => {
    const env = makeEnv({ isPackaged: false });
    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    expect(env.app.setAsDefaultProtocolClient).toHaveBeenCalledWith('openknowledge');
  });

  test('does NOT call setAsDefaultProtocolClient in packaged builds', () => {
    const env = makeEnv({ isPackaged: true });
    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    expect(env.app.setAsDefaultProtocolClient).not.toHaveBeenCalled();
  });

  test('logs a warn when setAsDefaultProtocolClient returns false', () => {
    // Per Electron docs the method is non-throwing; `false` signals the OS
    // refused the binding. Must surface as a warn so developers don't stare
    // at "dev deep-links not working" without a breadcrumb.
    const env = makeEnv({ isPackaged: false });
    env.app.setAsDefaultProtocolClient = mock(() => false);
    const warnLog: Array<{ obj: object; msg: string }> = [];
    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
      log: { warn: (obj, msg) => warnLog.push({ obj, msg }) },
    });
    expect(warnLog).toHaveLength(1);
    expect(warnLog[0]?.msg).toContain('returned false');
  });
});

describe('registerProtocolHandler — before-quit Launch Services cleanup', () => {
  test('registers before-quit handler that calls removeAsDefaultProtocolClient in dev mode', () => {
    const env = makeEnv({ isPackaged: false });
    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    // Dev-mode: `setAsDefaultProtocolClient` succeeded → `before-quit` handler
    // should have been registered. Firing it calls `removeAsDefaultProtocolClient`
    // so Launch Services doesn't leave a stale binding pointing at this worktree.
    env.app.fireBeforeQuit();
    expect(env.app.removeAsDefaultProtocolClient).toHaveBeenCalledWith('openknowledge');
  });

  test('does NOT register before-quit handler in packaged builds', () => {
    const env = makeEnv({ isPackaged: true });
    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    // Packaged builds don't touch Launch Services at runtime — the binding
    // comes from the DMG's Info.plist (electron-builder). Nothing to remove.
    expect(() => env.app.fireBeforeQuit()).toThrow(/before-quit listener not registered/);
    expect(env.app.removeAsDefaultProtocolClient).not.toHaveBeenCalled();
  });

  test('does NOT register before-quit handler when setAsDefaultProtocolClient returned false', () => {
    // If the OS refused the binding, we never claimed the scheme, so we must
    // NOT call `removeAsDefaultProtocolClient` on quit — it would remove a
    // binding that another app owns, breaking their deep-links.
    const env = makeEnv({ isPackaged: false });
    env.app.setAsDefaultProtocolClient = mock(() => false);
    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    expect(() => env.app.fireBeforeQuit()).toThrow(/before-quit listener not registered/);
    expect(env.app.removeAsDefaultProtocolClient).not.toHaveBeenCalled();
  });

  test('swallows removeAsDefaultProtocolClient throws with a warn log line', () => {
    const env = makeEnv({ isPackaged: false });
    env.app.removeAsDefaultProtocolClient = mock(() => {
      throw new Error('launch services refused');
    });
    const warnLog: Array<{ obj: object; msg: string }> = [];
    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
      log: { warn: (obj, msg) => warnLog.push({ obj, msg }) },
    });
    // Must NOT bubble up past the listener — app quit would be aborted.
    expect(() => env.app.fireBeforeQuit()).not.toThrow();
    expect(warnLog.some((e) => e.msg.includes('removeAsDefaultProtocolClient failed'))).toBe(true);
  });
});

describe('registerProtocolHandler — queue-then-flush', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = makeEnv();
  });

  test('queues URLs received before whenReady resolves', async () => {
    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });

    env.app.fireOpenUrl('openknowledge://open?project=/tmp/p&doc=a.md');
    // Not yet flushed — routing should not have happened.
    expect(env.openProject).not.toHaveBeenCalled();
    expect(env.sendDeepLink).not.toHaveBeenCalled();
  });

  test('flushes queued URLs after whenReady when a window is already ready', async () => {
    env.readyWindow = { id: 'pre-existing' };
    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.fireOpenUrl('openknowledge://open?project=/tmp/p&doc=a.md');
    env.app.resolveReady();
    await flushPromises();

    // Cold path — project not in existingWindows, so focusWindowForProject
    // returned null and routeUrl took the openProject branch. The deep-link
    // threads through as `pendingDeepLinkDoc`; delivery happens inside
    // window-manager's dom-ready hook, NOT via deps.sendDeepLink (which is
    // reserved for the warm focus-existing path).
    await flushPromises();
    expect(env.openProject).toHaveBeenCalledWith('/tmp/p', { pendingDeepLinkDoc: 'a.md' });
    expect(env.sendDeepLink).not.toHaveBeenCalled();
  });

  test('two deep-links received before whenReady both drain in FIFO order', async () => {
    // QA-054 regression: the real-OS "two URLs in rapid cold-start" case
    // (parent spec §7 OQ-3) is blocked on signed-DMG, but the queue-drain
    // mechanism is deterministic and testable here. Fires two open-url
    // events pre-ready, resolves ready, asserts BOTH routeUrl calls fire
    // in arrival order.
    env.readyWindow = { id: 'pre-existing' };
    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.fireOpenUrl('openknowledge://open?project=/tmp/p1&doc=a.md');
    env.app.fireOpenUrl('openknowledge://open?project=/tmp/p2&doc=b.md');

    // Pre-ready: neither routed.
    expect(env.openProject).not.toHaveBeenCalled();

    env.app.resolveReady();
    await flushPromises();
    await flushPromises();

    // Both URLs drained in FIFO order — no URL lost, no duplicate. Each
    // cold-path call threads the doc through pendingDeepLinkDoc; the
    // dom-ready hook inside createProjectWindow handles the send.
    expect(env.openProject).toHaveBeenCalledTimes(2);
    expect(env.openProject).toHaveBeenNthCalledWith(1, '/tmp/p1', {
      pendingDeepLinkDoc: 'a.md',
    });
    expect(env.openProject).toHaveBeenNthCalledWith(2, '/tmp/p2', {
      pendingDeepLinkDoc: 'b.md',
    });
    expect(env.sendDeepLink).not.toHaveBeenCalled();
  });

  test('retries flush up to 10 × 500ms while no window is up, then drains anyway', async () => {
    env.readyWindow = null;
    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.fireOpenUrl('openknowledge://open?project=/tmp/p&doc=a.md');
    env.app.resolveReady();
    await flushPromises();

    // First flush attempt schedules a retry because no window exists yet.
    // Walk 10 retries, none should dispatch the route.
    for (let i = 0; i < 10; i++) {
      expect(env.timers.length).toBe(1);
      expect(env.timers[0]?.ms).toBe(500);
      expect(env.openProject).not.toHaveBeenCalled();
      tickTimer(env);
      await flushPromises();
    }
    // 10th tick is the final attempt — drain fires regardless. Cold-path
    // always threads pendingDeepLinkDoc through openProject.
    expect(env.openProject).toHaveBeenCalledWith('/tmp/p', { pendingDeepLinkDoc: 'a.md' });
  });

  test('silent-drops malformed URLs with a single warn log line', async () => {
    const warnLog: Array<{ obj: object; msg: string }> = [];
    env.readyWindow = { id: 'pre-existing' };
    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
      log: {
        warn: (obj, msg) => warnLog.push({ obj, msg }),
      },
    });
    env.app.fireOpenUrl('openknowledge://open?doc=a.md'); // missing project
    env.app.resolveReady();
    await flushPromises();

    expect(env.openProject).not.toHaveBeenCalled();
    expect(env.sendDeepLink).not.toHaveBeenCalled();
    expect(warnLog).toHaveLength(1);
    expect(warnLog[0]?.msg).toContain('dropped malformed URL');
  });

  test('focuses existing window when project is already open (warm same-project)', async () => {
    const existingWin: FakeWindowHandle = { id: 'existing' };
    env.existingWindows.set('/tmp/p', existingWin);
    env.readyWindow = existingWin;

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.resolveReady();
    await flushPromises();

    env.app.fireOpenUrl('openknowledge://open?project=/tmp/p&doc=b.md');
    await flushPromises();

    expect(env.focusWindowForProject).toHaveBeenCalledWith('/tmp/p');
    expect(env.openProject).not.toHaveBeenCalled();
    expect(env.sendDeepLink).toHaveBeenCalledWith(existingWin, { doc: 'b.md' });
  });

  test('spawns new window when project is not yet open (warm different-project)', async () => {
    env.existingWindows.set('/tmp/A', { id: 'A' });
    env.readyWindow = { id: 'A' };

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.resolveReady();
    await flushPromises();

    env.app.fireOpenUrl('openknowledge://open?project=/tmp/B&doc=x.md');
    await flushPromises();
    await flushPromises();

    // Cold path: pendingDeepLinkDoc threads through; sendDeepLink not used.
    expect(env.openProject).toHaveBeenCalledWith('/tmp/B', { pendingDeepLinkDoc: 'x.md' });
    expect(env.sendDeepLink).not.toHaveBeenCalled();
  });

  test('handles openProject resolving null without throwing (failure already surfaced)', async () => {
    env.readyWindow = { id: 'primary' };
    // Stub openProject to resolve null — simulates the Navigator-fallback
    // path where the user already saw a dialog + the Navigator reopened.
    // The cold path no longer calls sendDeepLink at all (delivery happens
    // inside window-manager via dom-ready), so the null return just means
    // "no window was created, nothing more to do." Regression assertion is
    // "no throw, no stray sendDeepLink," not "sendDeepLink skipped."
    const openProjectStub = mock(
      async (
        _p: string,
        _opts?: { pendingDeepLinkDoc?: string },
      ): Promise<FakeWindowHandle | null> => null,
    );

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: openProjectStub,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.resolveReady();
    await flushPromises();

    env.app.fireOpenUrl('openknowledge://open?project=/tmp/broken&doc=x.md');
    await flushPromises();
    await flushPromises();

    expect(openProjectStub).toHaveBeenCalledWith('/tmp/broken', {
      pendingDeepLinkDoc: 'x.md',
    });
    expect(env.sendDeepLink).not.toHaveBeenCalled();
  });
});

describe('registerProtocolHandler — second-instance argv parsing', () => {
  test('extracts openknowledge:// entries from second-instance argv', async () => {
    const env = makeEnv();
    env.readyWindow = { id: 'primary' };
    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.resolveReady();
    await flushPromises();

    env.app.fireSecondInstance([
      '/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge',
      'openknowledge://open?project=/tmp/si&doc=readme.md',
    ]);
    await flushPromises();
    await flushPromises();

    expect(env.openProject).toHaveBeenCalledWith('/tmp/si', { pendingDeepLinkDoc: 'readme.md' });
  });

  test('ignores argv entries that are not openknowledge:// URLs', async () => {
    const env = makeEnv();
    env.readyWindow = { id: 'primary' };
    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.resolveReady();
    await flushPromises();

    env.app.fireSecondInstance(['--some-flag', 'random-positional', 'https://example.com']);
    await flushPromises();

    expect(env.openProject).not.toHaveBeenCalled();
    expect(env.sendDeepLink).not.toHaveBeenCalled();
  });
});

describe('registerProtocolHandler — cold-start process.argv scan', () => {
  test('queues openknowledge:// URL from process.argv on cold-start CLI launch', async () => {
    // Simulates: `OK.app/Contents/MacOS/Open\ Knowledge
    // openknowledge://open?project=/tmp/cs&doc=a.md` — primary-instance boot
    // where no prior app is running, so no Apple Event fires and no
    // `second-instance` dispatch. The URL lives in `process.argv`.
    const env = makeEnv();
    env.readyWindow = { id: 'pre-existing' };
    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
      getInitialArgv: () => [
        '/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge',
        'openknowledge://open?project=/tmp/cs&doc=a.md',
      ],
    });
    env.app.resolveReady();
    await flushPromises();
    await flushPromises();

    expect(env.openProject).toHaveBeenCalledWith('/tmp/cs', { pendingDeepLinkDoc: 'a.md' });
  });

  test('no-op when no openknowledge:// URLs in initial argv', async () => {
    const env = makeEnv();
    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
      getInitialArgv: () => ['/path/to/electron', '/path/to/main.js', '--some-flag'],
    });
    env.app.resolveReady();
    await flushPromises();

    expect(env.openProject).not.toHaveBeenCalled();
    expect(env.sendDeepLink).not.toHaveBeenCalled();
  });

  test('defaults to no-op when getInitialArgv is omitted', async () => {
    // Without the dep, the handler treats initial argv as empty — the
    // production call site injects `() => process.argv`; unit tests that
    // don't care about argv delivery simply omit it.
    const env = makeEnv();
    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.resolveReady();
    await flushPromises();

    expect(env.openProject).not.toHaveBeenCalled();
  });
});
