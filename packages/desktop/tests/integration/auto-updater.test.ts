/**
 * US-007: auto-updater unit + integration tests.
 *
 * Drives the full `startAutoUpdater(...)` event flow via a fake
 * `UpdaterLike` (event-stub pattern per evidence/electron-updater-api.md
 * §4 approach 3) + fake `ipcMain` + fake `WebContents` sink + injected
 * clock. No Electron runtime needed — tests run under `bun test`.
 *
 * Coverage map (AC9, AC18):
 *   - 6 events wired + dispatch shape (channel names, payloads)
 *   - 13 ERR_UPDATER_* / HTTP_ERROR_* codes route to classified log
 *   - Bare Error (no .code) routes to unclassified log
 *   - Successful check updates lastSuccessfulCheckAt + resets stuckHintShown
 *   - Stuck-hint fires once per installation; resets on success; re-arms
 *   - First-launch post-update (Toast B) once per version transition
 *   - Periodic check singleton via injectable clock
 *   - Relaunch-now IPC calls quitAndInstall
 *   - Dev-mode guard skips first-launch check but keeps handlers wired
 */

import { describe, expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import {
  bootAutoUpdater,
  type DispatchKind,
  type IpcMainLike,
  isClassifiedUpdaterError,
  releaseUrlFor,
  STUCK_HINT_DOWNLOAD_URL,
  STUCK_HINT_THRESHOLD_MS,
  startAutoUpdater,
  UPDATE_CHECK_INTERVAL_MS,
  type UpdaterLike,
} from '../../src/main/auto-updater.ts';
import { type AppState, emptyState } from '../../src/main/state-store.ts';
import type { SendableWebContents } from '../../src/shared/ipc-send.ts';

interface SendTarget {
  webContents: SendableWebContents;
}

class FakeUpdater extends EventEmitter implements UpdaterLike {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  channel: string | null = null;
  allowPrerelease = true; // deliberately non-default so the lock-down is observable
  allowDowngrade = true;
  forceDevUpdateConfig = false;
  setFeedURL = mock((_urlOrOptions: string) => {});
  checkForUpdates = mock(() => Promise.resolve(undefined));
  quitAndInstall = mock(() => {});
  override on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }
  override off(event: string, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }
}

interface FakeIpc extends IpcMainLike {
  handlers: Map<string, (event: unknown, ...args: unknown[]) => unknown>;
  invoke(channel: string, ...args: unknown[]): unknown;
}

function makeFakeIpc(): FakeIpc {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  return {
    handlers,
    handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void {
      handlers.set(channel, listener);
    },
    removeHandler(channel: string): void {
      handlers.delete(channel);
    },
    invoke(channel: string, ...args: unknown[]): unknown {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`no handler for ${channel}`);
      return handler({}, ...args);
    },
  } as FakeIpc;
}

interface CapturedSend {
  channel: string;
  payload: unknown;
}

function makeFakeWindow(captured: CapturedSend[]): SendTarget {
  return {
    webContents: {
      send: (channel: string, ...args: unknown[]) => {
        captured.push({ channel, payload: args[0] });
      },
    },
  };
}

interface FakeClock {
  setInterval: ReturnType<typeof mock>;
  clearInterval: ReturnType<typeof mock>;
  lastCallback: (() => void) | null;
  lastHandle: unknown;
  lastMs: number | null;
}

function makeFakeClock(): FakeClock {
  const clock: FakeClock = {
    setInterval: mock(() => Symbol('interval-handle')),
    clearInterval: mock(() => {}),
    lastCallback: null,
    lastHandle: null,
    lastMs: null,
  };
  clock.setInterval = mock((cb: () => void, ms: number) => {
    clock.lastCallback = cb;
    clock.lastMs = ms;
    const handle = Symbol('interval-handle');
    clock.lastHandle = handle;
    return handle as unknown as ReturnType<typeof setInterval>;
  });
  clock.clearInterval = mock((h: unknown) => {
    if (h === clock.lastHandle) {
      clock.lastCallback = null;
      clock.lastHandle = null;
    }
  });
  return clock;
}

interface TestRig {
  updater: FakeUpdater;
  ipc: FakeIpc;
  clock: FakeClock;
  captured: CapturedSend[];
  state: AppState;
  dispatches: DispatchKind[];
  now: Date;
  logger: {
    info: ReturnType<typeof mock>;
    warn: ReturnType<typeof mock>;
    error: ReturnType<typeof mock>;
    debug: ReturnType<typeof mock>;
  };
}

function makeRig(
  overrides?: Partial<AppState> & {
    appVersion?: string;
    isPackaged?: boolean;
    forceDevBypass?: boolean;
    feedUrl?: string;
  },
): {
  rig: TestRig;
  handle: ReturnType<typeof startAutoUpdater>;
} {
  const {
    appVersion = '0.3.1',
    isPackaged = true,
    forceDevBypass,
    feedUrl,
    ...stateOverrides
  } = overrides ?? {};
  const rig: TestRig = {
    updater: new FakeUpdater(),
    ipc: makeFakeIpc(),
    clock: makeFakeClock(),
    captured: [],
    state: { ...emptyState(), ...stateOverrides },
    dispatches: [],
    now: new Date('2026-04-21T12:00:00.000Z'),
    logger: {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
    },
  };
  const primaryWindow = makeFakeWindow(rig.captured);
  const handle = startAutoUpdater({
    updater: rig.updater,
    ipcMain: rig.ipc,
    readState: () => rig.state,
    writeState: (next) => {
      rig.state = next;
    },
    getPrimaryWindow: () => primaryWindow,
    getAppVersion: () => appVersion,
    isPackaged,
    forceDevBypass,
    feedUrl,
    clock: rig.clock,
    now: () => rig.now,
    onDispatch: (kind) => {
      rig.dispatches.push(kind);
    },
    logger: rig.logger,
  });
  return { rig, handle };
}

const CLASSIFIED_CODES: readonly string[] = [
  'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND',
  'ERR_UPDATER_LATEST_VERSION_NOT_FOUND',
  'ERR_UPDATER_INVALID_RELEASE_FEED',
  'ERR_UPDATER_NO_PUBLISHED_VERSIONS',
  'ERR_UPDATER_INVALID_UPDATE_INFO',
  'ERR_UPDATER_NO_FILES_PROVIDED',
  'ERR_UPDATER_NO_CHECKSUM',
  'ERR_UPDATER_INVALID_VERSION',
  'ERR_UPDATER_INVALID_CHANNEL',
  'ERR_UPDATER_ZIP_FILE_NOT_FOUND',
  'ERR_CHECKSUM_MISMATCH', // not ERR_UPDATER_-prefixed but should classify under a future extension
  'HTTP_ERROR_404',
  'HTTP_ERROR_429',
  'HTTP_ERROR_500',
];

describe('startAutoUpdater — initial configuration (parent §8.10 LOCKED)', () => {
  test('sets autoDownload=true, autoInstallOnAppQuit=true, channel=latest', () => {
    const { rig } = makeRig();
    expect(rig.updater.autoDownload).toBe(true);
    expect(rig.updater.autoInstallOnAppQuit).toBe(true);
    expect(rig.updater.channel).toBe('latest');
  });

  test('feedUrl opt → updater.setFeedURL(url) called before first check', () => {
    const { rig } = makeRig({ feedUrl: 'http://127.0.0.1:54321' } as Partial<AppState> & {
      feedUrl?: string;
    });
    expect(rig.updater.setFeedURL).toHaveBeenCalledTimes(1);
    expect(rig.updater.setFeedURL).toHaveBeenCalledWith('http://127.0.0.1:54321');
  });

  test('feedUrl unset → setFeedURL NOT called (production default path)', () => {
    const { rig } = makeRig();
    expect(rig.updater.setFeedURL).not.toHaveBeenCalled();
  });

  test('forceDevBypass=true flips updater.forceDevUpdateConfig so checkForUpdates hits network', () => {
    const { rig } = makeRig({
      appVersion: '0.3.0',
      isPackaged: false,
      forceDevBypass: true,
    } as Partial<AppState> & {
      appVersion?: string;
      isPackaged?: boolean;
      forceDevBypass?: boolean;
    });
    expect(rig.updater.forceDevUpdateConfig).toBe(true);
  });

  test('forceDevBypass=false (default) leaves forceDevUpdateConfig=false (prod default)', () => {
    const { rig } = makeRig();
    expect(rig.updater.forceDevUpdateConfig).toBe(false);
  });

  test('explicitly locks allowPrerelease=false + allowDowngrade=false (Finding #6)', () => {
    const { rig } = makeRig();
    expect(rig.updater.allowPrerelease).toBe(false);
    expect(rig.updater.allowDowngrade).toBe(false);
  });
});

describe('persist-before-emit ordering (Finding #2)', () => {
  test('update-downloaded: writeState failure → NO Toast A dispatch', () => {
    const { rig, handle } = makeRig();
    handle.destroy(); // detach and re-wire with throwing writeState

    const updater = new FakeUpdater();
    const ipc = makeFakeIpc();
    const clock = makeFakeClock();
    const captured: CapturedSend[] = [];
    const primaryWindow = makeFakeWindow(captured);
    const state: AppState = emptyState();
    const dispatches: DispatchKind[] = [];
    const logger = {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
    };
    startAutoUpdater({
      updater,
      ipcMain: ipc,
      readState: () => state,
      writeState: () => {
        throw new Error('EACCES');
      },
      getPrimaryWindow: () => primaryWindow,
      getAppVersion: () => '0.3.1',
      isPackaged: true,
      clock,
      now: () => new Date(),
      onDispatch: (k) => dispatches.push(k),
      logger,
    });

    updater.emit('update-downloaded', { version: '0.3.2' });
    expect(captured.filter((c) => c.channel === 'ok:update:downloaded')).toHaveLength(0);
    expect(dispatches).not.toContain('update-downloaded-toast-a' as DispatchKind);
    expect(state.versionPendingInstall).toBeNull();
    expect(logger.error).toHaveBeenCalled();
    expect(state.versionPendingInstall).toBeNull();
    void rig;
  });

  test('stuck-hint: writeState failure → NO Toast C dispatch', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const updater = new FakeUpdater();
    const ipc = makeFakeIpc();
    const clock = makeFakeClock();
    const captured: CapturedSend[] = [];
    const primaryWindow = makeFakeWindow(captured);
    const state: AppState = { ...emptyState(), lastSuccessfulCheckAt: eightDaysAgo };
    const dispatches: DispatchKind[] = [];
    startAutoUpdater({
      updater,
      ipcMain: ipc,
      readState: () => state,
      writeState: () => {
        throw new Error('EACCES');
      },
      getPrimaryWindow: () => primaryWindow,
      getAppVersion: () => '0.3.1',
      isPackaged: true,
      clock,
      now: () => new Date(),
      onDispatch: (k) => dispatches.push(k),
      logger: {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        debug: mock(() => {}),
      },
    });

    updater.emit('error', new Error('network'));
    expect(captured.filter((c) => c.channel === 'ok:update:stuck-hint')).toHaveLength(0);
    expect(dispatches).not.toContain('stuck-hint-toast-c' as DispatchKind);
    expect(state.stuckHintShown).toBe(false);
  });
});

describe('event subscription surface (AC2)', () => {
  test('registers listeners for the six AC2 events', () => {
    const { rig } = makeRig();
    expect(rig.updater.listenerCount('checking-for-update')).toBe(1);
    expect(rig.updater.listenerCount('update-available')).toBe(1);
    expect(rig.updater.listenerCount('update-not-available')).toBe(1);
    expect(rig.updater.listenerCount('download-progress')).toBe(1);
    expect(rig.updater.listenerCount('update-downloaded')).toBe(1);
    expect(rig.updater.listenerCount('error')).toBe(1);
  });

  test('does NOT subscribe to login / update-cancelled / appimage-filename-updated', () => {
    const { rig } = makeRig();
    expect(rig.updater.listenerCount('login')).toBe(0);
    expect(rig.updater.listenerCount('update-cancelled')).toBe(0);
    expect(rig.updater.listenerCount('appimage-filename-updated')).toBe(0);
  });
});

describe('update-downloaded → Toast A (AC6)', () => {
  test('first dispatch for a new version fires ok:update:downloaded + records versionPendingInstall', () => {
    const { rig } = makeRig();
    rig.updater.emit('update-downloaded', { version: '0.3.2' });
    const toastA = rig.captured.filter((c) => c.channel === 'ok:update:downloaded');
    expect(toastA).toHaveLength(1);
    expect(toastA[0]?.payload).toEqual({ version: '0.3.2' });
    expect(rig.state.versionPendingInstall).toBe('0.3.2');
    expect(rig.dispatches).toContain('update-downloaded-toast-a' as DispatchKind);
  });

  test('re-firing with the SAME version is deduped — no second dispatch', () => {
    const { rig } = makeRig();
    rig.updater.emit('update-downloaded', { version: '0.3.2' });
    rig.updater.emit('update-downloaded', { version: '0.3.2' });
    const toastA = rig.captured.filter((c) => c.channel === 'ok:update:downloaded');
    expect(toastA).toHaveLength(1);
    expect(rig.dispatches).toContain('update-downloaded-deduped' as DispatchKind);
  });

  test('re-firing with a NEWER version dispatches a new Toast A and updates state', () => {
    const { rig } = makeRig();
    rig.updater.emit('update-downloaded', { version: '0.3.2' });
    rig.updater.emit('update-downloaded', { version: '0.3.3' });
    const toastA = rig.captured.filter((c) => c.channel === 'ok:update:downloaded');
    expect(toastA).toHaveLength(2);
    expect(toastA[1]?.payload).toEqual({ version: '0.3.3' });
    expect(rig.state.versionPendingInstall).toBe('0.3.3');
  });

  test('empty-version payload is skipped defensively (no dispatch, no state write)', () => {
    const { rig } = makeRig();
    rig.updater.emit('update-downloaded', {});
    const toastA = rig.captured.filter((c) => c.channel === 'ok:update:downloaded');
    expect(toastA).toHaveLength(0);
    expect(rig.state.versionPendingInstall).toBeNull();
    expect(rig.dispatches).toContain('update-downloaded-empty-version' as DispatchKind);
  });
});

describe('error routing (AC3, D5)', () => {
  test.each(CLASSIFIED_CODES)('classified err.code %s → bracket log, no IPC dispatch', (code) => {
    const { rig } = makeRig();
    const err = Object.assign(new Error(`failure ${code}`), { code });
    rig.updater.emit('error', err);
    expect(rig.captured.some((c) => c.channel.startsWith('ok:update:error'))).toBe(false);
    const isClassified = code.startsWith('ERR_UPDATER_') || code.startsWith('HTTP_ERROR_');
    expect(
      rig.dispatches.includes(
        (isClassified ? 'error-classified' : 'error-unclassified') as DispatchKind,
      ),
    ).toBe(true);
  });

  test('bare Error (no .code) → unclassified log + no dispatch', () => {
    const { rig } = makeRig();
    const err = new Error('signature mismatch from Squirrel.Mac');
    rig.updater.emit('error', err);
    expect(rig.captured).toHaveLength(0);
    expect(rig.dispatches).toContain('error-unclassified' as DispatchKind);
    expect(rig.logger.error).toHaveBeenCalled();
  });

  test('error with non-matching .code prefix → unclassified branch', () => {
    const { rig } = makeRig();
    const err = Object.assign(new Error('oops'), { code: 'EPERM' });
    rig.updater.emit('error', err);
    expect(rig.dispatches).toContain('error-unclassified' as DispatchKind);
  });

  test('isClassifiedUpdaterError narrows the type correctly', () => {
    expect(isClassifiedUpdaterError(new Error('bare'))).toBe(false);
    expect(isClassifiedUpdaterError(Object.assign(new Error('x'), { code: 'ERR_UPDATER_X' }))).toBe(
      true,
    );
    expect(
      isClassifiedUpdaterError(Object.assign(new Error('x'), { code: 'HTTP_ERROR_500' })),
    ).toBe(true);
    expect(
      isClassifiedUpdaterError(Object.assign(new Error('x'), { code: 'SOMETHING_ELSE' })),
    ).toBe(false);
    expect(isClassifiedUpdaterError(null)).toBe(false);
    expect(isClassifiedUpdaterError('string')).toBe(false);
  });
});

describe('stuck-hint logic (AC17, D12)', () => {
  test('update-not-available updates lastSuccessfulCheckAt', () => {
    const { rig } = makeRig();
    rig.updater.emit('update-not-available', { version: '0.3.1' });
    expect(rig.state.lastSuccessfulCheckAt).toBe(rig.now.toISOString());
  });

  test('update-available also counts as a successful check', () => {
    const { rig } = makeRig();
    rig.updater.emit('update-available', { version: '0.3.2' });
    expect(rig.state.lastSuccessfulCheckAt).toBe(rig.now.toISOString());
  });

  test('error does NOT update lastSuccessfulCheckAt', () => {
    const { rig } = makeRig({ lastSuccessfulCheckAt: '2026-01-01T00:00:00.000Z' });
    rig.updater.emit('error', new Error('boom'));
    expect(rig.state.lastSuccessfulCheckAt).toBe('2026-01-01T00:00:00.000Z');
  });

  test('>7 days since last success + error fires ok:update:stuck-hint exactly once', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const { rig } = makeRig({
      lastSuccessfulCheckAt: eightDaysAgo,
      stuckHintShown: false,
    });
    rig.now = new Date();

    rig.updater.emit('error', new Error('network'));
    const hint = rig.captured.filter((c) => c.channel === 'ok:update:stuck-hint');
    expect(hint).toHaveLength(1);
    expect(hint[0]?.payload).toEqual({ downloadUrl: STUCK_HINT_DOWNLOAD_URL });
    expect(rig.state.stuckHintShown).toBe(true);
    expect(rig.dispatches).toContain('stuck-hint-toast-c' as DispatchKind);

    rig.updater.emit('error', new Error('network again'));
    const hint2 = rig.captured.filter((c) => c.channel === 'ok:update:stuck-hint');
    expect(hint2).toHaveLength(1);
  });

  test('<7 days since last success + error does NOT fire stuck-hint', () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const { rig } = makeRig({
      lastSuccessfulCheckAt: sixDaysAgo,
      stuckHintShown: false,
    });
    rig.now = new Date();
    rig.updater.emit('error', new Error('network'));
    const hint = rig.captured.filter((c) => c.channel === 'ok:update:stuck-hint');
    expect(hint).toHaveLength(0);
    expect(rig.state.stuckHintShown).toBe(false);
  });

  test('no baseline (lastSuccessfulCheckAt=null) + error does NOT fire — fresh install cannot be stuck', () => {
    const { rig } = makeRig({ lastSuccessfulCheckAt: null, stuckHintShown: false });
    rig.updater.emit('error', new Error('boom'));
    expect(rig.captured).toHaveLength(0);
    expect(rig.state.stuckHintShown).toBe(false);
  });

  test('successful check resets stuckHintShown so gate re-arms', () => {
    const { rig } = makeRig({
      lastSuccessfulCheckAt: '2026-01-01T00:00:00.000Z',
      stuckHintShown: true,
    });
    rig.updater.emit('update-not-available', {});
    expect(rig.state.stuckHintShown).toBe(false);
    expect(rig.state.lastSuccessfulCheckAt).toBe(rig.now.toISOString());

    rig.state.lastSuccessfulCheckAt = new Date(
      rig.now.getTime() - 8 * 24 * 60 * 60 * 1000,
    ).toISOString();
    rig.updater.emit('error', new Error('stuck again'));
    const hint = rig.captured.filter((c) => c.channel === 'ok:update:stuck-hint');
    expect(hint).toHaveLength(1);
    expect(rig.state.stuckHintShown).toBe(true);
  });

  test('malformed lastSuccessfulCheckAt (not ISO) — does not throw, no dispatch', () => {
    const { rig } = makeRig({
      lastSuccessfulCheckAt: 'not-a-date',
      stuckHintShown: false,
    });
    expect(() => rig.updater.emit('error', new Error('boom'))).not.toThrow();
    expect(rig.captured).toHaveLength(0);
  });

  test('STUCK_HINT_THRESHOLD_MS equals 7 days', () => {
    expect(STUCK_HINT_THRESHOLD_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('first-launch post-update (Toast B — AC7, D9)', () => {
  test('lastSeenVersion differs from current → dispatch whats-new + update state', () => {
    const { rig } = makeRig({ lastSeenVersion: '0.3.0', appVersion: '0.3.1' });
    const whatsNew = rig.captured.filter((c) => c.channel === 'ok:update:whats-new');
    expect(whatsNew).toHaveLength(1);
    expect(whatsNew[0]?.payload).toEqual({
      version: '0.3.1',
      releaseUrl: releaseUrlFor('0.3.1'),
    });
    expect(rig.state.lastSeenVersion).toBe('0.3.1');
    expect(rig.dispatches).toContain('whats-new-toast-b' as DispatchKind);
  });

  test('lastSeenVersion === current → no dispatch, no state change', () => {
    const { rig } = makeRig({ lastSeenVersion: '0.3.1', appVersion: '0.3.1' });
    const whatsNew = rig.captured.filter((c) => c.channel === 'ok:update:whats-new');
    expect(whatsNew).toHaveLength(0);
    expect(rig.state.lastSeenVersion).toBe('0.3.1');
  });

  test('lastSeenVersion is null (fresh install) → NO dispatch, but state advances', () => {
    const { rig } = makeRig({ lastSeenVersion: null, appVersion: '0.3.1' });
    const whatsNew = rig.captured.filter((c) => c.channel === 'ok:update:whats-new');
    expect(whatsNew).toHaveLength(0);
    expect(rig.state.lastSeenVersion).toBe('0.3.1');
  });

  test('releaseUrlFor produces the GitHub tag URL', () => {
    expect(releaseUrlFor('1.2.3')).toBe(
      'https://github.com/inkeep/open-knowledge/releases/tag/v1.2.3',
    );
  });

  test('releaseUrlFor percent-encodes path-traversal chars (Finding #11)', () => {
    expect(releaseUrlFor('../../../etc/passwd')).toBe(
      'https://github.com/inkeep/open-knowledge/releases/tag/v..%2F..%2F..%2Fetc%2Fpasswd',
    );
    expect(releaseUrlFor('1.2.3/..')).toBe(
      'https://github.com/inkeep/open-knowledge/releases/tag/v1.2.3%2F..',
    );
  });
});

describe('periodic check singleton (AC10, D10)', () => {
  test('registers exactly one interval after the first launch check resolves', async () => {
    const { rig } = makeRig();
    await rig.updater.checkForUpdates();
    await Promise.resolve();
    await Promise.resolve();
    expect(rig.clock.setInterval).toHaveBeenCalledTimes(1);
    expect(rig.clock.lastMs).toBe(UPDATE_CHECK_INTERVAL_MS);
    expect(rig.clock.lastMs).toBe(60 * 60 * 1000);
  });

  test('interval callback calls checkForUpdates', async () => {
    const { rig } = makeRig();
    await rig.updater.checkForUpdates();
    await Promise.resolve();
    await Promise.resolve();
    rig.updater.checkForUpdates.mockClear();
    rig.clock.lastCallback?.();
    expect(rig.updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  test('destroy() clears the interval', async () => {
    const { rig, handle } = makeRig();
    await rig.updater.checkForUpdates();
    await Promise.resolve();
    await Promise.resolve();
    handle.destroy();
    expect(rig.clock.clearInterval).toHaveBeenCalled();
  });

  test('UPDATE_CHECK_INTERVAL_MS is 1 hour', () => {
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(60 * 60 * 1000);
  });

  test('first-launch check rejection still registers the periodic interval', async () => {
    const updater = new FakeUpdater();
    const ipc = makeFakeIpc();
    const clock = makeFakeClock();
    const captured: CapturedSend[] = [];
    let state: AppState = emptyState();
    updater.checkForUpdates = mock(() =>
      Promise.reject(new Error('net::ERR_INTERNET_DISCONNECTED')),
    );
    const primaryWindow = makeFakeWindow(captured);
    const logger = {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
    };
    startAutoUpdater({
      updater,
      ipcMain: ipc,
      readState: () => state,
      writeState: (next) => {
        state = next;
      },
      getPrimaryWindow: () => primaryWindow,
      getAppVersion: () => '0.3.1',
      isPackaged: true,
      clock,
      now: () => new Date(),
      logger,
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(clock.setInterval).toHaveBeenCalledTimes(1);
    expect(clock.lastMs).toBe(UPDATE_CHECK_INTERVAL_MS);
    expect(logger.debug).toHaveBeenCalled();
  });
});

describe('ok:update:relaunch-now IPC handler (AC18)', () => {
  test('registers the handler on startup', () => {
    const { rig } = makeRig();
    expect(rig.ipc.handlers.has('ok:update:relaunch-now')).toBe(true);
  });

  test('handler invocation WITH versionPendingInstall calls autoUpdater.quitAndInstall', () => {
    const { rig } = makeRig({ versionPendingInstall: '0.3.2' });
    rig.ipc.invoke('ok:update:relaunch-now');
    expect(rig.updater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(rig.dispatches).toContain('relaunch-now' as DispatchKind);
  });

  test('handler invocation WITHOUT versionPendingInstall is ignored (Finding #5 guard)', () => {
    const { rig } = makeRig({ versionPendingInstall: null });
    rig.ipc.invoke('ok:update:relaunch-now');
    expect(rig.updater.quitAndInstall).not.toHaveBeenCalled();
    expect(rig.dispatches).not.toContain('relaunch-now' as DispatchKind);
    expect(rig.logger.warn).toHaveBeenCalled();
  });

  test('destroy() removes the IPC handler', () => {
    const { rig, handle } = makeRig();
    handle.destroy();
    expect(rig.ipc.handlers.has('ok:update:relaunch-now')).toBe(false);
  });
});

describe('dev-mode guard (isPackaged=false)', () => {
  test('skips first-launch checkForUpdates when isPackaged=false and forceDevBypass=false', async () => {
    const { rig } = makeRig({ isPackaged: false });
    await Promise.resolve();
    expect(rig.updater.checkForUpdates).not.toHaveBeenCalled();
    expect(rig.dispatches).toContain('skipped-dev-mode' as DispatchKind);
  });

  test('forceDevBypass=true allows the check to run even when isPackaged=false', async () => {
    const updater = new FakeUpdater();
    const ipc = makeFakeIpc();
    const clock = makeFakeClock();
    const captured: CapturedSend[] = [];
    let state: AppState = emptyState();
    const primaryWindow = makeFakeWindow(captured);
    startAutoUpdater({
      updater,
      ipcMain: ipc,
      readState: () => state,
      writeState: (next) => {
        state = next;
      },
      getPrimaryWindow: () => primaryWindow,
      getAppVersion: () => '0.3.1',
      isPackaged: false,
      forceDevBypass: true,
      clock,
      now: () => new Date(),
      logger: {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        debug: mock(() => {}),
      },
    });
    await Promise.resolve();
    expect(updater.checkForUpdates).toHaveBeenCalled();
  });

  test('event handlers stay wired in dev-mode so unit tests can drive them', () => {
    const { rig } = makeRig({ isPackaged: false });
    rig.updater.emit('update-downloaded', { version: '0.3.2' });
    const toastA = rig.captured.filter((c) => c.channel === 'ok:update:downloaded');
    expect(toastA).toHaveLength(1);
  });
});

describe('download-progress (log-only, no UI surface)', () => {
  test('emits debug log without IPC dispatch or state write', () => {
    const { rig } = makeRig();
    const prevState = { ...rig.state };
    rig.updater.emit('download-progress', { percent: 50, bytesPerSecond: 1_000_000 });
    expect(rig.captured).toHaveLength(0);
    expect(rig.state).toEqual(prevState);
    expect(rig.logger.debug).toHaveBeenCalled();
  });
});

describe('destroy() teardown', () => {
  test('detaches all 6 event listeners', () => {
    const { rig, handle } = makeRig();
    handle.destroy();
    expect(rig.updater.listenerCount('checking-for-update')).toBe(0);
    expect(rig.updater.listenerCount('update-available')).toBe(0);
    expect(rig.updater.listenerCount('update-not-available')).toBe(0);
    expect(rig.updater.listenerCount('download-progress')).toBe(0);
    expect(rig.updater.listenerCount('update-downloaded')).toBe(0);
    expect(rig.updater.listenerCount('error')).toBe(0);
  });

  test('after destroy(), emitting an event does NOT fire handler side-effects', () => {
    const { rig, handle } = makeRig();
    handle.destroy();
    rig.updater.emit('update-downloaded', { version: '0.3.3' });
    const toastA = rig.captured.filter((c) => c.channel === 'ok:update:downloaded');
    expect(toastA).toHaveLength(0);
  });
});

describe('single-window dispatch (Finding #1 guard)', () => {
  test('update-downloaded sends to exactly one target even when primary changes between dispatches', () => {
    const updater = new FakeUpdater();
    const ipc = makeFakeIpc();
    const clock = makeFakeClock();
    const capturedA: CapturedSend[] = [];
    const capturedB: CapturedSend[] = [];
    const windowA = makeFakeWindow(capturedA);
    const windowB = makeFakeWindow(capturedB);
    let primary: SendTarget = windowA;
    let state: AppState = emptyState();
    startAutoUpdater({
      updater,
      ipcMain: ipc,
      readState: () => state,
      writeState: (next) => {
        state = next;
      },
      getPrimaryWindow: () => primary,
      getAppVersion: () => '0.3.1',
      isPackaged: true,
      clock,
      now: () => new Date(),
    });

    updater.emit('update-downloaded', { version: '0.3.3' });
    expect(capturedA.filter((c) => c.channel === 'ok:update:downloaded')).toHaveLength(1);
    expect(capturedB.filter((c) => c.channel === 'ok:update:downloaded')).toHaveLength(0);

    primary = windowB;
    updater.emit('update-downloaded', { version: '0.3.4' });
    expect(capturedA.filter((c) => c.channel === 'ok:update:downloaded')).toHaveLength(1);
    expect(capturedB.filter((c) => c.channel === 'ok:update:downloaded')).toHaveLength(1);
  });

  test('getPrimaryWindow returning null → broadcast no-ops (no crash)', () => {
    const updater = new FakeUpdater();
    const ipc = makeFakeIpc();
    const clock = makeFakeClock();
    let state: AppState = emptyState();
    expect(() => {
      startAutoUpdater({
        updater,
        ipcMain: ipc,
        readState: () => state,
        writeState: (next) => {
          state = next;
        },
        getPrimaryWindow: () => null,
        getAppVersion: () => '0.3.1',
        isPackaged: true,
        clock,
        now: () => new Date(),
      });
      updater.emit('update-downloaded', { version: '0.3.3' });
    }).not.toThrow();
    expect(state.versionPendingInstall).toBe('0.3.3');
  });
});

describe('markCheckSucceeded routes through persistSafely (Critical #1)', () => {
  test('update-available: writeState throws → caught, no rethrow', () => {
    const updater = new FakeUpdater();
    const ipc = makeFakeIpc();
    const clock = makeFakeClock();
    const captured: CapturedSend[] = [];
    const primaryWindow = makeFakeWindow(captured);
    const state: AppState = emptyState();
    const logger = {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
    };
    startAutoUpdater({
      updater,
      ipcMain: ipc,
      readState: () => state,
      writeState: () => {
        throw new Error('EACCES');
      },
      getPrimaryWindow: () => primaryWindow,
      getAppVersion: () => '0.3.1',
      isPackaged: true,
      clock,
      now: () => new Date(),
      logger,
    });
    expect(() => updater.emit('update-available', { version: '0.3.2' })).not.toThrow();
    expect(logger.error).toHaveBeenCalled();
    expect(state.lastSuccessfulCheckAt).toBeNull();
  });

  test('update-not-available: writeState throws → caught, no rethrow', () => {
    const updater = new FakeUpdater();
    const ipc = makeFakeIpc();
    const clock = makeFakeClock();
    const captured: CapturedSend[] = [];
    const primaryWindow = makeFakeWindow(captured);
    const state: AppState = emptyState();
    startAutoUpdater({
      updater,
      ipcMain: ipc,
      readState: () => state,
      writeState: () => {
        throw new Error('disk full');
      },
      getPrimaryWindow: () => primaryWindow,
      getAppVersion: () => '0.3.1',
      isPackaged: true,
      clock,
      now: () => new Date(),
      logger: {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        debug: mock(() => {}),
      },
    });
    expect(() => updater.emit('update-not-available', { version: '0.3.1' })).not.toThrow();
    expect(state.lastSuccessfulCheckAt).toBeNull();
  });
});

describe('Toast B persist-before-emit + whenRendererReady (Major #1)', () => {
  test('persist failure on lastSeenVersion advance → no Toast B broadcast', () => {
    const updater = new FakeUpdater();
    const ipc = makeFakeIpc();
    const clock = makeFakeClock();
    const captured: CapturedSend[] = [];
    const primaryWindow = makeFakeWindow(captured);
    const state: AppState = { ...emptyState(), lastSeenVersion: '0.3.0' };
    startAutoUpdater({
      updater,
      ipcMain: ipc,
      readState: () => state,
      writeState: () => {
        throw new Error('EACCES');
      },
      getPrimaryWindow: () => primaryWindow,
      getAppVersion: () => '0.3.1',
      isPackaged: true,
      clock,
      now: () => new Date(),
      logger: {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        debug: mock(() => {}),
      },
    });
    const whatsNew = captured.filter((c) => c.channel === 'ok:update:whats-new');
    expect(whatsNew).toHaveLength(0);
    expect(state.lastSeenVersion).toBe('0.3.0');
  });

  test('whenRendererReady defers Toast B until scheduler fires', () => {
    const updater = new FakeUpdater();
    const ipc = makeFakeIpc();
    const clock = makeFakeClock();
    const captured: CapturedSend[] = [];
    const primaryWindow = makeFakeWindow(captured);
    let state: AppState = { ...emptyState(), lastSeenVersion: '0.3.0' };
    let deferredFn: (() => void) | null = null;
    startAutoUpdater({
      updater,
      ipcMain: ipc,
      readState: () => state,
      writeState: (next) => {
        state = next;
      },
      getPrimaryWindow: () => primaryWindow,
      getAppVersion: () => '0.3.1',
      isPackaged: true,
      whenRendererReady: (fn) => {
        deferredFn = fn;
      },
      clock,
      now: () => new Date(),
    });
    expect(state.lastSeenVersion).toBe('0.3.1');
    const beforeFire = captured.filter((c) => c.channel === 'ok:update:whats-new');
    expect(beforeFire).toHaveLength(0);
    expect(deferredFn).not.toBeNull();
    deferredFn?.();
    const afterFire = captured.filter((c) => c.channel === 'ok:update:whats-new');
    expect(afterFire).toHaveLength(1);
  });

  test('no whenRendererReady → immediate fire (pre-fix behavior for tests)', () => {
    const updater = new FakeUpdater();
    const ipc = makeFakeIpc();
    const clock = makeFakeClock();
    const captured: CapturedSend[] = [];
    const primaryWindow = makeFakeWindow(captured);
    let state: AppState = { ...emptyState(), lastSeenVersion: '0.3.0' };
    startAutoUpdater({
      updater,
      ipcMain: ipc,
      readState: () => state,
      writeState: (next) => {
        state = next;
      },
      getPrimaryWindow: () => primaryWindow,
      getAppVersion: () => '0.3.1',
      isPackaged: true,
      clock,
      now: () => new Date(),
    });
    const whatsNew = captured.filter((c) => c.channel === 'ok:update:whats-new');
    expect(whatsNew).toHaveLength(1);
  });
});

describe('relaunch-now idempotency (Major #2)', () => {
  test('second invocation sees cleared versionPendingInstall → no second quitAndInstall', () => {
    const { rig } = makeRig({ versionPendingInstall: '0.3.2' });
    rig.ipc.invoke('ok:update:relaunch-now');
    rig.ipc.invoke('ok:update:relaunch-now');
    expect(rig.updater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(rig.state.versionPendingInstall).toBeNull();
  });

  test('persistSafely failure → no quitAndInstall call (better to retry)', () => {
    const updater = new FakeUpdater();
    const ipc = makeFakeIpc();
    const clock = makeFakeClock();
    const captured: CapturedSend[] = [];
    const primaryWindow = makeFakeWindow(captured);
    const state: AppState = { ...emptyState(), versionPendingInstall: '0.3.2' };
    startAutoUpdater({
      updater,
      ipcMain: ipc,
      readState: () => state,
      writeState: () => {
        throw new Error('EACCES');
      },
      getPrimaryWindow: () => primaryWindow,
      getAppVersion: () => '0.3.1',
      isPackaged: true,
      clock,
      now: () => new Date(),
      logger: {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        debug: mock(() => {}),
      },
    });
    ipc.invoke('ok:update:relaunch-now');
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(state.versionPendingInstall).toBe('0.3.2');
  });
});

describe('bootAutoUpdater catch-path (Major #5)', () => {
  test('dynamic-import failure → returns null + logs error, no throw', async () => {
    const logger = {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
    };
    const captured: CapturedSend[] = [];
    const primaryWindow = makeFakeWindow(captured);
    const state: AppState = emptyState();
    const handle = await bootAutoUpdater(
      () => Promise.reject(new Error('Cannot find module electron-updater')),
      {
        ipcMain: makeFakeIpc(),
        readState: () => state,
        writeState: () => {},
        getPrimaryWindow: () => primaryWindow,
        getAppVersion: () => '0.3.1',
        isPackaged: true,
        clock: makeFakeClock(),
        now: () => new Date(),
        logger,
      },
    );
    expect(handle).toBeNull();
    expect(logger.error).toHaveBeenCalled();
    const errorCall = logger.error.mock.calls[0];
    expect(errorCall?.[1]).toMatchObject({
      message: expect.stringContaining('Cannot find module'),
    });
  });

  test('successful import → returns a real handle with destroy', async () => {
    const fakeUpdater = new FakeUpdater();
    const ipc = makeFakeIpc();
    const clock = makeFakeClock();
    const captured: CapturedSend[] = [];
    const primaryWindow = makeFakeWindow(captured);
    let state: AppState = emptyState();
    const handle = await bootAutoUpdater(() => Promise.resolve({ autoUpdater: fakeUpdater }), {
      ipcMain: ipc,
      readState: () => state,
      writeState: (next) => {
        state = next;
      },
      getPrimaryWindow: () => primaryWindow,
      getAppVersion: () => '0.3.1',
      isPackaged: true,
      clock,
      now: () => new Date(),
    });
    expect(handle).not.toBeNull();
    expect(typeof handle?.destroy).toBe('function');
    handle?.destroy();
    expect(clock.clearInterval).toHaveBeenCalled();
  });

  test('startAutoUpdater synchronous throw during wire-up is caught', async () => {
    const logger = {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
    };
    const hostileUpdater = {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      channel: null,
      allowPrerelease: false,
      allowDowngrade: false,
      on: () => {
        throw new Error('API drift — event contract changed');
      },
      off: () => hostileUpdater as unknown as UpdaterLike,
      checkForUpdates: () => Promise.resolve(undefined),
      quitAndInstall: () => {},
    } as unknown as UpdaterLike;
    const handle = await bootAutoUpdater(() => Promise.resolve({ autoUpdater: hostileUpdater }), {
      ipcMain: makeFakeIpc(),
      readState: () => emptyState(),
      writeState: () => {},
      getPrimaryWindow: () => null,
      getAppVersion: () => '0.3.1',
      isPackaged: true,
      clock: makeFakeClock(),
      now: () => new Date(),
      logger,
    });
    expect(handle).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  test('resolveAutoUpdater handles .default.autoUpdater shape (real CJS-from-ESM)', async () => {
    const fakeUpdater = new FakeUpdater();
    const handle = await bootAutoUpdater(
      () => Promise.resolve({ default: { autoUpdater: fakeUpdater } }),
      {
        ipcMain: makeFakeIpc(),
        readState: () => emptyState(),
        writeState: () => {},
        getPrimaryWindow: () => null,
        getAppVersion: () => '0.3.1',
        isPackaged: true,
        clock: makeFakeClock(),
        now: () => new Date(),
      },
    );
    expect(handle).not.toBeNull();
    expect(fakeUpdater.autoDownload).toBe(true);
    expect(fakeUpdater.autoInstallOnAppQuit).toBe(true);
    expect(fakeUpdater.channel).toBe('latest');
    handle?.destroy();
  });

  test('resolveAutoUpdater still accepts the flat { autoUpdater } shape (test-mock compat)', async () => {
    const fakeUpdater = new FakeUpdater();
    const handle = await bootAutoUpdater(() => Promise.resolve({ autoUpdater: fakeUpdater }), {
      ipcMain: makeFakeIpc(),
      readState: () => emptyState(),
      writeState: () => {},
      getPrimaryWindow: () => null,
      getAppVersion: () => '0.3.1',
      isPackaged: true,
      clock: makeFakeClock(),
      now: () => new Date(),
    });
    expect(handle).not.toBeNull();
    expect(fakeUpdater.autoDownload).toBe(true);
    handle?.destroy();
  });

  test('module exposes neither top-level nor .default.autoUpdater → logs + returns null', async () => {
    const logger = {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
    };
    const handle = await bootAutoUpdater(
      () => Promise.resolve({ default: {} }) as unknown as Promise<{ autoUpdater: UpdaterLike }>,
      {
        ipcMain: makeFakeIpc(),
        readState: () => emptyState(),
        writeState: () => {},
        getPrimaryWindow: () => null,
        getAppVersion: () => '0.3.1',
        isPackaged: true,
        clock: makeFakeClock(),
        now: () => new Date(),
        logger,
      },
    );
    expect(handle).toBeNull();
    expect(logger.error).toHaveBeenCalled();
    const errorCall = logger.error.mock.calls[0];
    expect(errorCall?.[1]).toMatchObject({
      message: expect.stringContaining('electron-updater did not expose'),
    });
  });
});
