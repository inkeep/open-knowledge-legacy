import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { encodeShareUrl } from '@inkeep/open-knowledge-core';
import type { ShareDeepLinkPayload } from '../../src/main/url-scheme.ts';
import { registerProtocolHandler } from '../../src/main/url-scheme.ts';

type AppEvent = 'open-url' | 'second-instance' | 'before-quit' | 'continue-activity';
type OpenUrlListener = (event: { preventDefault: () => void }, url: string) => void;
type SecondInstanceListener = (event: unknown, argv: readonly string[]) => void;
type BeforeQuitListener = () => void;
type ContinueActivityListener = (
  event: { preventDefault: () => void },
  type: string,
  userInfo: unknown,
  details?: { webpageURL?: string },
) => void;
type AppListener =
  | OpenUrlListener
  | SecondInstanceListener
  | BeforeQuitListener
  | ContinueActivityListener;

interface FakeApp {
  on: ReturnType<typeof mock>;
  whenReady: () => Promise<void>;
  isPackaged: boolean;
  setAsDefaultProtocolClient: ReturnType<typeof mock>;
  removeAsDefaultProtocolClient: ReturnType<typeof mock>;
  fireOpenUrl: (url: string) => void;
  fireSecondInstance: (argv: readonly string[]) => void;
  fireBeforeQuit: () => void;
  fireContinueActivity: (
    type: string,
    userInfo: unknown,
    details?: { webpageURL?: string },
  ) => { preventDefault: ReturnType<typeof mock> };
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
    fireContinueActivity: (type, userInfo, details) => {
      const cb = listeners.get('continue-activity') as ContinueActivityListener | undefined;
      if (!cb) throw new Error('continue-activity listener not registered');
      const event = { preventDefault: mock(() => {}) };
      cb(event, type, userInfo, details);
      return event;
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

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

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
    expect(() => env.app.fireBeforeQuit()).toThrow(/before-quit listener not registered/);
    expect(env.app.removeAsDefaultProtocolClient).not.toHaveBeenCalled();
  });

  test('does NOT register before-quit handler when setAsDefaultProtocolClient returned false', () => {
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

    await flushPromises();
    expect(env.openProject).toHaveBeenCalledWith('/tmp/p', { pendingDeepLinkDoc: 'a.md' });
    expect(env.sendDeepLink).not.toHaveBeenCalled();
  });

  test('two deep-links received before whenReady both drain in FIFO order', async () => {
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

    expect(env.openProject).not.toHaveBeenCalled();

    env.app.resolveReady();
    await flushPromises();
    await flushPromises();

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

    for (let retryIndex = 1; retryIndex <= 9; retryIndex++) {
      expect(env.timers.length).toBe(1);
      expect(env.timers[0]?.ms).toBe(500);
      expect(env.openProject).not.toHaveBeenCalled();
      tickTimer(env);
      await flushPromises();
      expect(env.openProject).not.toHaveBeenCalled();
    }
    expect(env.timers.length).toBe(1);
    expect(env.timers[0]?.ms).toBe(500);
    expect(env.openProject).not.toHaveBeenCalled();
    tickTimer(env);
    await flushPromises();
    expect(env.openProject).toHaveBeenCalledWith('/tmp/p', { pendingDeepLinkDoc: 'a.md' });
    expect(env.timers.length).toBe(0);
    expect(env.openProject).toHaveBeenCalledTimes(1);
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

    expect(env.openProject).toHaveBeenCalledWith('/tmp/B', { pendingDeepLinkDoc: 'x.md' });
    expect(env.sendDeepLink).not.toHaveBeenCalled();
  });

  test('handles openProject resolving null without throwing (failure already surfaced)', async () => {
    env.readyWindow = { id: 'primary' };
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

describe('registerProtocolHandler — share-flow routing', () => {
  test('warm path: routes ok-kind share to focused window via sendShareDeepLink', async () => {
    const env = makeEnv();
    const focusedWin: FakeWindowHandle = { id: 'focused' };
    env.readyWindow = focusedWin;
    const sendShareDeepLink = mock((_win: FakeWindowHandle, _payload: ShareDeepLinkPayload) => {});
    const getFocusedWindow = mock(() => focusedWin as FakeWindowHandle | null);

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      sendShareDeepLink,
      getFocusedWindow,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.resolveReady();
    await flushPromises();

    const encoded = encodeShareUrl('https://github.com/inkeep/playbooks/blob/main/x.md');
    env.app.fireOpenUrl(`https://openknowledge.ai/d/${encoded}`);
    await flushPromises();

    expect(getFocusedWindow).toHaveBeenCalled();
    expect(sendShareDeepLink).toHaveBeenCalledTimes(1);
    expect(sendShareDeepLink).toHaveBeenCalledWith(focusedWin, {
      kind: 'ok',
      owner: 'inkeep',
      repo: 'playbooks',
      branch: 'main',
      path: 'x.md',
      blobUrl: 'https://github.com/inkeep/playbooks/blob/main/x.md',
    });
    expect(env.openProject).not.toHaveBeenCalled();
    expect(env.sendDeepLink).not.toHaveBeenCalled();
  });

  test('routes custom-scheme share URLs (openknowledge://share?url=...)', async () => {
    const env = makeEnv();
    const focusedWin: FakeWindowHandle = { id: 'focused' };
    env.readyWindow = focusedWin;
    const sendShareDeepLink = mock((_win: FakeWindowHandle, _payload: ShareDeepLinkPayload) => {});

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      sendShareDeepLink,
      getFocusedWindow: () => focusedWin,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.resolveReady();
    await flushPromises();

    const blobUrl = 'https://github.com/inkeep/playbooks/blob/main/x.md';
    env.app.fireOpenUrl(`openknowledge://share?url=${encodeURIComponent(blobUrl)}`);
    await flushPromises();

    expect(sendShareDeepLink).toHaveBeenCalledTimes(1);
    expect(sendShareDeepLink).toHaveBeenCalledWith(focusedWin, {
      kind: 'ok',
      owner: 'inkeep',
      repo: 'playbooks',
      branch: 'main',
      path: 'x.md',
      blobUrl,
    });
  });

  test('falls back to getAnyReadyWindow when getFocusedWindow returns null', async () => {
    const env = makeEnv();
    const readyWin: FakeWindowHandle = { id: 'fallback' };
    env.readyWindow = readyWin;
    const sendShareDeepLink = mock((_win: FakeWindowHandle, _payload: ShareDeepLinkPayload) => {});

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      sendShareDeepLink,
      getFocusedWindow: () => null,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.resolveReady();
    await flushPromises();

    const encoded = encodeShareUrl('https://github.com/o/r/blob/main/x.md');
    env.app.fireOpenUrl(`https://openknowledge.ai/d/${encoded}`);
    await flushPromises();

    expect(sendShareDeepLink).toHaveBeenCalledTimes(1);
    expect(sendShareDeepLink.mock.calls[0]?.[0]).toBe(readyWin);
  });

  test('dispatches unsupported-version payload + logs [receive] action=url-parse', async () => {
    const env = makeEnv();
    const focusedWin: FakeWindowHandle = { id: 'focused' };
    env.readyWindow = focusedWin;
    const warnLog: Array<{ obj: object; msg: string }> = [];
    const sendShareDeepLink = mock((_win: FakeWindowHandle, _payload: ShareDeepLinkPayload) => {});

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      sendShareDeepLink,
      getFocusedWindow: () => focusedWin,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
      log: { warn: (obj, msg) => warnLog.push({ obj, msg }) },
    });
    env.app.resolveReady();
    await flushPromises();

    const blobBytes = new TextEncoder().encode('https://github.com/o/r/blob/main/x.md');
    const v2 = new Uint8Array(blobBytes.length + 1);
    v2[0] = 0x02;
    v2.set(blobBytes, 1);
    let raw = '';
    for (const b of v2) raw += String.fromCharCode(b);
    const encoded = btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    env.app.fireOpenUrl(`https://openknowledge.ai/d/${encoded}`);
    await flushPromises();

    expect(sendShareDeepLink).toHaveBeenCalledWith(focusedWin, { kind: 'unsupported-version' });
    expect(
      warnLog.some(
        (entry) =>
          entry.msg.includes('[receive] action=url-parse') &&
          (entry.obj as { result?: string }).result === 'unsupported-version',
      ),
    ).toBe(true);
  });

  test('dispatches invalid payload + logs [receive] for corrupt base64', async () => {
    const env = makeEnv();
    const focusedWin: FakeWindowHandle = { id: 'focused' };
    env.readyWindow = focusedWin;
    const warnLog: Array<{ obj: object; msg: string }> = [];
    const sendShareDeepLink = mock((_win: FakeWindowHandle, _payload: ShareDeepLinkPayload) => {});

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      sendShareDeepLink,
      getFocusedWindow: () => focusedWin,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
      log: { warn: (obj, msg) => warnLog.push({ obj, msg }) },
    });
    env.app.resolveReady();
    await flushPromises();

    env.app.fireOpenUrl('https://openknowledge.ai/d/!!!not-base64!!!');
    await flushPromises();

    expect(sendShareDeepLink).toHaveBeenCalledWith(focusedWin, { kind: 'invalid' });
    expect(
      warnLog.some(
        (entry) =>
          entry.msg.includes('[receive] action=url-parse') &&
          (entry.obj as { result?: string }).result === 'invalid',
      ),
    ).toBe(true);
  });

  test('share URL with no window available surfaces warn + no dispatch', async () => {
    const env = makeEnv();
    env.readyWindow = { id: 'ready' };
    const sendShareDeepLink = mock((_win: FakeWindowHandle, _payload: ShareDeepLinkPayload) => {});
    const warnLog: Array<{ obj: object; msg: string }> = [];

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: mock(() => null),
      sendShareDeepLink,
      getFocusedWindow: () => null,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
      log: { warn: (obj, msg) => warnLog.push({ obj, msg }) },
    });
    env.app.resolveReady();
    await flushPromises();

    const encoded = encodeShareUrl('https://github.com/o/r/blob/main/x.md');
    env.app.fireOpenUrl(`https://openknowledge.ai/d/${encoded}`);
    await flushPromises();

    expect(sendShareDeepLink).not.toHaveBeenCalled();
    expect(warnLog.some((e) => e.msg.includes('no target window'))).toBe(true);
  });

  test('open-action URLs continue routing through the legacy path (regression check)', async () => {
    const env = makeEnv();
    const focusedWin: FakeWindowHandle = { id: 'focused' };
    env.existingWindows.set('/tmp/p', focusedWin);
    env.readyWindow = focusedWin;
    const sendShareDeepLink = mock((_win: FakeWindowHandle, _payload: ShareDeepLinkPayload) => {});

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      sendShareDeepLink,
      getFocusedWindow: () => focusedWin,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.resolveReady();
    await flushPromises();

    env.app.fireOpenUrl('openknowledge://open?project=/tmp/p&doc=a.md');
    await flushPromises();

    expect(env.sendDeepLink).toHaveBeenCalledWith(focusedWin, { doc: 'a.md' });
    expect(sendShareDeepLink).not.toHaveBeenCalled();
  });
});

describe('registerProtocolHandler — continue-activity Handoff path', () => {
  test('routes Universal Link to share dispatch via enqueueOrRoute', async () => {
    const env = makeEnv();
    const focusedWin: FakeWindowHandle = { id: 'focused' };
    env.readyWindow = focusedWin;
    const sendShareDeepLink = mock((_win: FakeWindowHandle, _payload: ShareDeepLinkPayload) => {});

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      sendShareDeepLink,
      getFocusedWindow: () => focusedWin,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.resolveReady();
    await flushPromises();

    const encoded = encodeShareUrl('https://github.com/inkeep/playbooks/blob/main/x.md');
    const url = `https://openknowledge.ai/d/${encoded}`;
    const event = env.app.fireContinueActivity('NSUserActivityTypeBrowsingWeb', null, {
      webpageURL: url,
    });
    await flushPromises();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(sendShareDeepLink).toHaveBeenCalledTimes(1);
    expect(sendShareDeepLink).toHaveBeenCalledWith(focusedWin, {
      kind: 'ok',
      owner: 'inkeep',
      repo: 'playbooks',
      branch: 'main',
      path: 'x.md',
      blobUrl: 'https://github.com/inkeep/playbooks/blob/main/x.md',
    });
  });

  test('accepts www.openknowledge.ai host (dual-host AASA discipline)', async () => {
    const env = makeEnv();
    const focusedWin: FakeWindowHandle = { id: 'focused' };
    env.readyWindow = focusedWin;
    const sendShareDeepLink = mock((_win: FakeWindowHandle, _payload: ShareDeepLinkPayload) => {});

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      sendShareDeepLink,
      getFocusedWindow: () => focusedWin,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.resolveReady();
    await flushPromises();

    const encoded = encodeShareUrl('https://github.com/o/r/blob/main/x.md');
    env.app.fireContinueActivity('NSUserActivityTypeBrowsingWeb', null, {
      webpageURL: `https://www.openknowledge.ai/d/${encoded}`,
    });
    await flushPromises();

    expect(sendShareDeepLink).toHaveBeenCalledTimes(1);
  });

  test('reads webpageURL from userInfo as a fallback when details is undefined', async () => {
    const env = makeEnv();
    const focusedWin: FakeWindowHandle = { id: 'focused' };
    env.readyWindow = focusedWin;
    const sendShareDeepLink = mock((_win: FakeWindowHandle, _payload: ShareDeepLinkPayload) => {});

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      sendShareDeepLink,
      getFocusedWindow: () => focusedWin,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.resolveReady();
    await flushPromises();

    const encoded = encodeShareUrl('https://github.com/o/r/blob/main/x.md');
    env.app.fireContinueActivity(
      'NSUserActivityTypeBrowsingWeb',
      { webpageURL: `https://openknowledge.ai/d/${encoded}` },
      undefined,
    );
    await flushPromises();

    expect(sendShareDeepLink).toHaveBeenCalledTimes(1);
  });

  test('ignores non-NSUserActivityTypeBrowsingWeb activity types silently', async () => {
    const env = makeEnv();
    const focusedWin: FakeWindowHandle = { id: 'focused' };
    env.readyWindow = focusedWin;
    const sendShareDeepLink = mock((_win: FakeWindowHandle, _payload: ShareDeepLinkPayload) => {});
    const warnLog: Array<{ obj: object; msg: string }> = [];

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      sendShareDeepLink,
      getFocusedWindow: () => focusedWin,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
      log: { warn: (obj, msg) => warnLog.push({ obj, msg }) },
    });
    env.app.resolveReady();
    await flushPromises();

    const event = env.app.fireContinueActivity(
      'com.example.unrelated.activity',
      { webpageURL: 'https://openknowledge.ai/d/x' },
      { webpageURL: 'https://openknowledge.ai/d/x' },
    );
    await flushPromises();

    expect(sendShareDeepLink).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(warnLog.some((e) => e.msg.includes('continue-activity-received'))).toBe(false);
  });

  test('ignores activities whose webpageURL is on a non-AASA host', async () => {
    const env = makeEnv();
    const focusedWin: FakeWindowHandle = { id: 'focused' };
    env.readyWindow = focusedWin;
    const sendShareDeepLink = mock((_win: FakeWindowHandle, _payload: ShareDeepLinkPayload) => {});
    const warnLog: Array<{ obj: object; msg: string }> = [];

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      sendShareDeepLink,
      getFocusedWindow: () => focusedWin,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
      log: { warn: (obj, msg) => warnLog.push({ obj, msg }) },
    });
    env.app.resolveReady();
    await flushPromises();

    const event = env.app.fireContinueActivity('NSUserActivityTypeBrowsingWeb', null, {
      webpageURL: 'https://attacker.example.com/d/payload',
    });
    await flushPromises();

    expect(sendShareDeepLink).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(warnLog.some((e) => e.msg.includes('continue-activity-received'))).toBe(false);
  });

  test('ignores activities with no webpageURL on either details or userInfo', async () => {
    const env = makeEnv();
    const focusedWin: FakeWindowHandle = { id: 'focused' };
    env.readyWindow = focusedWin;
    const sendShareDeepLink = mock((_win: FakeWindowHandle, _payload: ShareDeepLinkPayload) => {});

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      sendShareDeepLink,
      getFocusedWindow: () => focusedWin,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.resolveReady();
    await flushPromises();

    const event = env.app.fireContinueActivity('NSUserActivityTypeBrowsingWeb', null, undefined);
    await flushPromises();

    expect(sendShareDeepLink).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  test('ignores activities whose webpageURL is not a parseable URL', async () => {
    const env = makeEnv();
    const focusedWin: FakeWindowHandle = { id: 'focused' };
    env.readyWindow = focusedWin;
    const sendShareDeepLink = mock((_win: FakeWindowHandle, _payload: ShareDeepLinkPayload) => {});

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      sendShareDeepLink,
      getFocusedWindow: () => focusedWin,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.resolveReady();
    await flushPromises();

    const event = env.app.fireContinueActivity('NSUserActivityTypeBrowsingWeb', null, {
      webpageURL: 'not a url',
    });
    await flushPromises();

    expect(sendShareDeepLink).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  test('emits [receive] action=continue-activity-received log with type + url-host', async () => {
    const env = makeEnv();
    const focusedWin: FakeWindowHandle = { id: 'focused' };
    env.readyWindow = focusedWin;
    const sendShareDeepLink = mock((_win: FakeWindowHandle, _payload: ShareDeepLinkPayload) => {});
    const warnLog: Array<{ obj: object; msg: string }> = [];

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      sendShareDeepLink,
      getFocusedWindow: () => focusedWin,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
      log: { warn: (obj, msg) => warnLog.push({ obj, msg }) },
    });
    env.app.resolveReady();
    await flushPromises();

    const encoded = encodeShareUrl('https://github.com/o/r/blob/main/x.md');
    env.app.fireContinueActivity('NSUserActivityTypeBrowsingWeb', null, {
      webpageURL: `https://openknowledge.ai/d/${encoded}`,
    });
    await flushPromises();

    const entry = warnLog.find((e) => e.msg.includes('continue-activity-received'));
    expect(entry).toBeDefined();
    expect(entry?.obj).toMatchObject({
      type: 'NSUserActivityTypeBrowsingWeb',
      urlHost: 'openknowledge.ai',
    });
  });

  test('queue-then-flush: activity received before whenReady is drained after', async () => {
    const env = makeEnv();
    const focusedWin: FakeWindowHandle = { id: 'focused' };
    env.readyWindow = focusedWin;
    const sendShareDeepLink = mock((_win: FakeWindowHandle, _payload: ShareDeepLinkPayload) => {});

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      sendShareDeepLink,
      getFocusedWindow: () => focusedWin,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });

    const encoded = encodeShareUrl('https://github.com/o/r/blob/main/x.md');
    env.app.fireContinueActivity('NSUserActivityTypeBrowsingWeb', null, {
      webpageURL: `https://openknowledge.ai/d/${encoded}`,
    });
    expect(sendShareDeepLink).not.toHaveBeenCalled();

    env.app.resolveReady();
    await flushPromises();

    expect(sendShareDeepLink).toHaveBeenCalledTimes(1);
  });

  test('existing open-url + share-flow paths still route correctly after adding continue-activity', async () => {
    const env = makeEnv();
    const focusedWin: FakeWindowHandle = { id: 'focused' };
    env.existingWindows.set('/tmp/p', focusedWin);
    env.readyWindow = focusedWin;
    const sendShareDeepLink = mock((_win: FakeWindowHandle, _payload: ShareDeepLinkPayload) => {});

    registerProtocolHandler({
      app: env.app,
      focusWindowForProject: env.focusWindowForProject,
      openProject: env.openProject,
      sendDeepLink: env.sendDeepLink,
      getAnyReadyWindow: env.getAnyReadyWindow,
      sendShareDeepLink,
      getFocusedWindow: () => focusedWin,
      setTimeout: (cb, ms) => env.timers.push({ cb, ms }),
    });
    env.app.resolveReady();
    await flushPromises();

    env.app.fireOpenUrl('openknowledge://open?project=/tmp/p&doc=a.md');
    await flushPromises();
    expect(env.sendDeepLink).toHaveBeenCalledWith(focusedWin, { doc: 'a.md' });

    const blobUrl = 'https://github.com/o/r/blob/main/x.md';
    env.app.fireOpenUrl(`openknowledge://share?url=${encodeURIComponent(blobUrl)}`);
    await flushPromises();
    expect(sendShareDeepLink).toHaveBeenCalledTimes(1);
  });
});
