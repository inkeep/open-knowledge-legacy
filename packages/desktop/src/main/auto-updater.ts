import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { EventChannels } from '../shared/ipc-events.ts';
import { createHandler } from '../shared/ipc-handler.ts';
import { type SendableWebContents, sendToRenderer } from '../shared/ipc-send.ts';
import type { AppState, UpdateChannel } from './state-store.ts';

export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  channel: string | null;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  forceDevUpdateConfig: boolean;
  setFeedURL(urlOrOptions: string): void;
  on(event: 'checking-for-update', listener: () => void): this;
  on(event: 'update-available', listener: (info: { version?: string }) => void): this;
  on(event: 'update-not-available', listener: (info: { version?: string }) => void): this;
  on(
    event: 'download-progress',
    listener: (info: { percent?: number; bytesPerSecond?: number }) => void,
  ): this;
  on(event: 'update-downloaded', listener: (info: { version?: string }) => void): this;
  on(event: 'error', listener: (err: Error & { code?: string }) => void): this;
  off(event: string, listener: (...args: unknown[]) => void): this;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface IpcMainLike extends Pick<IpcMain, 'handle' | 'removeHandler'> {}

interface Clock {
  setInterval(cb: () => void, ms: number): ReturnType<typeof setInterval>;
  clearInterval(handle: ReturnType<typeof setInterval>): void;
}

export type DispatchKind =
  | 'update-downloaded-toast-a'
  | 'update-downloaded-deduped'
  | 'update-downloaded-empty-version'
  | 'whats-new-toast-b'
  | 'stuck-hint-toast-c'
  | 'check-success'
  | 'error-classified'
  | 'error-unclassified'
  | 'relaunch-now'
  | 'downgrade-warning-fired'
  | 'skipped-dev-mode';

interface StartAutoUpdaterOpts {
  updater: UpdaterLike;
  ipcMain: IpcMainLike;
  readState: () => AppState;
  writeState: (next: AppState) => void;
  getPrimaryWindow: () => { webContents: SendableWebContents } | null;
  getAllWindows?: () => readonly { webContents: SendableWebContents }[];
  getAppVersion: () => string;
  isPackaged: boolean;
  forceDevBypass?: boolean;
  feedUrl?: string;
  whenRendererReady?: (fn: () => void) => void;
  prepareForRelaunch?: () => void;
  showCheckNowResult?: (result: CheckNowResult) => void;
  clock?: Clock;
  now?: () => Date;
  onDispatch?: (kind: DispatchKind) => void;
  logger?: Logger;
}

type CheckNowResult =
  | { kind: 'available'; currentVersion: string; latestVersion: string }
  | { kind: 'not-available'; currentVersion: string }
  | { kind: 'error'; message: string };

export interface StartAutoUpdaterHandle {
  destroy(): void;
  setChannel(channel: UpdateChannel): void;
  confirmDowngrade(): Promise<void>;
  checkForUpdatesNow(): Promise<unknown>;
}

interface Logger {
  info(msg: string, ctx?: object): void;
  warn(msg: string, ctx?: object): void;
  error(msg: string, ctx?: object): void;
  debug(msg: string, ctx?: object): void;
}

const DEFAULT_CLOCK: Clock = {
  setInterval: (cb, ms) => globalThis.setInterval(cb, ms),
  clearInterval: (h) => {
    globalThis.clearInterval(h);
  },
};

const DEFAULT_LOGGER: Logger = {
  info: (msg, ctx) => console.info('[updater]', msg, ctx ?? ''),
  warn: (msg, ctx) => console.warn('[updater]', msg, ctx ?? ''),
  error: (msg, ctx) => console.error('[updater]', msg, ctx ?? ''),
  debug: (msg, ctx) => console.debug('[updater]', msg, ctx ?? ''),
};

export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export const STUCK_HINT_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export const STUCK_HINT_DOWNLOAD_URL = 'https://inkeep.com/open-knowledge/download';

export function releaseUrlFor(version: string): string {
  return `https://github.com/inkeep/open-knowledge/releases/tag/v${encodeURIComponent(version)}`;
}

export function isClassifiedUpdaterError(err: unknown): err is Error & { code: string } {
  if (!(err instanceof Error)) return false;
  const code = (err as Error & { code?: unknown }).code;
  if (typeof code !== 'string') return false;
  return code.startsWith('ERR_UPDATER_') || code.startsWith('HTTP_ERROR_');
}

export function applyChannelSettings(
  updater: Pick<UpdaterLike, 'channel' | 'allowPrerelease' | 'allowDowngrade'>,
  channel: UpdateChannel,
): void {
  updater.channel = channel;
  updater.allowPrerelease = channel === 'beta';
  updater.allowDowngrade = channel === 'latest';
}

export function compareSemver(a: string, b: string): -1 | 0 | 1 | null {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);
  if (!parsedA || !parsedB) return null;

  for (let i = 0; i < 3; i++) {
    const ai = parsedA.main[i] ?? 0;
    const bi = parsedB.main[i] ?? 0;
    if (ai !== bi) return ai < bi ? -1 : 1;
  }

  if (parsedA.pre.length === 0 && parsedB.pre.length === 0) return 0;
  if (parsedA.pre.length === 0) return 1;
  if (parsedB.pre.length === 0) return -1;

  const max = Math.max(parsedA.pre.length, parsedB.pre.length);
  for (let i = 0; i < max; i++) {
    const aPart = parsedA.pre[i];
    const bPart = parsedB.pre[i];
    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;
    const aNumeric = /^\d+$/.test(aPart);
    const bNumeric = /^\d+$/.test(bPart);
    if (aNumeric && bNumeric) {
      const an = Number(aPart);
      const bn = Number(bPart);
      if (an !== bn) return an < bn ? -1 : 1;
    } else if (aNumeric) {
      return -1;
    } else if (bNumeric) {
      return 1;
    } else if (aPart !== bPart) {
      return aPart < bPart ? -1 : 1;
    }
  }
  return 0;
}

interface ParsedSemver {
  main: [number, number, number];
  pre: readonly string[];
}

function parseSemver(version: string): ParsedSemver | null {
  if (typeof version !== 'string' || version === '') return null;
  const stripped = version.split('+', 1)[0] ?? version;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?$/.exec(stripped);
  if (!match) return null;
  const [, majorRaw, minorRaw, patchRaw, preRaw] = match;
  const major = Number(majorRaw);
  const minor = Number(minorRaw);
  const patch = Number(patchRaw);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null;
  return {
    main: [major, minor, patch],
    pre: preRaw ? preRaw.split('.') : [],
  };
}

export function startAutoUpdater(opts: StartAutoUpdaterOpts): StartAutoUpdaterHandle {
  const {
    updater,
    ipcMain,
    readState,
    writeState,
    getPrimaryWindow,
    getAllWindows,
    getAppVersion,
    isPackaged,
    forceDevBypass = false,
    feedUrl,
    whenRendererReady,
    showCheckNowResult,
    clock = DEFAULT_CLOCK,
    now = () => new Date(),
    onDispatch,
    logger = DEFAULT_LOGGER,
  } = opts;

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  applyChannelSettings(updater, readState().updateChannel);

  updater.forceDevUpdateConfig = forceDevBypass;
  if (feedUrl) {
    updater.setFeedURL(feedUrl);
    logger.info('setFeedURL (dev override) — updater will pull manifest from local mock', {
      feedUrl,
    });
  }

  const broadcast = <K extends keyof EventChannels>(
    channel: K,
    payload: EventChannels[K]['payload'],
  ): void => {
    const target = getPrimaryWindow();
    if (!target) {
      logger.debug('broadcast skipped — no primary window');
      return;
    }
    sendToRenderer(target.webContents, channel, payload);
  };

  const persistSafely = (next: AppState, ctx: string): boolean => {
    try {
      writeState(next);
      return true;
    } catch (err) {
      logger.error('writeState failed — state gate not armed', {
        ctx,
        message: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  };

  const maybeFireStuckHint = (): void => {
    const state = readState();
    if (state.stuckHintShown) return;
    if (!state.lastSuccessfulCheckAt) return; // no baseline yet — fresh install can't be "stuck"
    const last = Date.parse(state.lastSuccessfulCheckAt);
    if (Number.isNaN(last)) return;
    const elapsedMs = now().getTime() - last;
    if (elapsedMs < STUCK_HINT_THRESHOLD_MS) return;

    if (!persistSafely({ ...state, stuckHintShown: true }, 'stuck-hint')) return;

    const fireToastC = () => {
      broadcast('ok:update:stuck-hint', { downloadUrl: STUCK_HINT_DOWNLOAD_URL });
      logger.warn('stuck-hint dispatched', {
        lastSuccessfulCheckAt: state.lastSuccessfulCheckAt,
        elapsedDays: Math.floor(elapsedMs / (24 * 60 * 60 * 1000)),
      });
      onDispatch?.('stuck-hint-toast-c');
    };
    if (whenRendererReady) whenRendererReady(fireToastC);
    else fireToastC();
  };

  const markCheckSucceeded = (): void => {
    const state = readState();
    if (
      !persistSafely(
        {
          ...state,
          lastSuccessfulCheckAt: now().toISOString(),
          stuckHintShown: false,
        },
        'check-success',
      )
    )
      return;
    onDispatch?.('check-success');
  };

  const onCheckingForUpdate = (): void => {
    logger.info('checking-for-update');
  };

  let pendingDowngrade = false;
  let menuCheckPending = false;

  const onUpdateAvailable = (info: { version?: string }): void => {
    logger.info('update-available', { version: info.version });
    markCheckSucceeded();

    const availableVersion = info.version;
    if (typeof availableVersion !== 'string' || availableVersion === '') return;
    if (readState().updateChannel !== 'latest') return;
    const currentVersion = getAppVersion();
    const cmp = compareSemver(availableVersion, currentVersion);
    if (cmp === null) {
      logger.warn('compareSemver returned null — downgrade check skipped', {
        availableVersion,
        currentVersion,
      });
      return;
    }
    if (cmp !== -1) return;

    updater.autoDownload = false;
    pendingDowngrade = true;
    broadcast('ok:update:downgrade-warning', {
      currentVersion,
      targetVersion: availableVersion,
    });
    logger.info('downgrade detected — autoDownload paused awaiting user confirmation', {
      currentVersion,
      targetVersion: availableVersion,
    });
    onDispatch?.('downgrade-warning-fired');
    if (menuCheckPending) {
      menuCheckPending = false;
    }
  };

  const onUpdateAvailableForMenuCheck = (info: { version?: string }): void => {
    if (!menuCheckPending) return;
    menuCheckPending = false;
    if (pendingDowngrade) return;
    showCheckNowResult?.({
      kind: 'available',
      currentVersion: getAppVersion(),
      latestVersion: typeof info.version === 'string' ? info.version : 'unknown',
    });
  };

  const onUpdateNotAvailable = (info: { version?: string }): void => {
    logger.info('update-not-available', { version: info.version });
    markCheckSucceeded();
    if (menuCheckPending) {
      menuCheckPending = false;
      showCheckNowResult?.({
        kind: 'not-available',
        currentVersion: getAppVersion(),
      });
    }
  };

  const onDownloadProgress = (info: { percent?: number; bytesPerSecond?: number }): void => {
    logger.debug('download-progress', {
      percent: info.percent,
      bytesPerSecond: info.bytesPerSecond,
    });
  };

  const onUpdateDownloaded = (info: { version?: string }): void => {
    const version = typeof info.version === 'string' ? info.version : '';
    if (!version) {
      logger.warn('update-downloaded with empty version — skipping dispatch');
      onDispatch?.('update-downloaded-empty-version');
      return;
    }
    const state = readState();
    if (state.versionPendingInstall === version) {
      logger.info('update-downloaded re-fired for same pending version — deduped', { version });
      onDispatch?.('update-downloaded-deduped');
      return;
    }
    if (!persistSafely({ ...state, versionPendingInstall: version }, 'update-downloaded')) return;
    const fireToastA = () => {
      broadcast('ok:update:downloaded', { version });
      logger.info('update-downloaded dispatched Toast A', { version });
      onDispatch?.('update-downloaded-toast-a');
    };
    if (whenRendererReady) whenRendererReady(fireToastA);
    else fireToastA();
  };

  const onError = (err: Error & { code?: string }): void => {
    if (isClassifiedUpdaterError(err)) {
      logger.warn('error (classified)', {
        code: err.code,
        message: err.message,
        timestamp: now().toISOString(),
      });
      onDispatch?.('error-classified');
    } else {
      logger.error('error (unclassified)', {
        message: err.message,
        stack: err.stack,
        timestamp: now().toISOString(),
      });
      onDispatch?.('error-unclassified');
    }
    if (menuCheckPending) {
      menuCheckPending = false;
      showCheckNowResult?.({
        kind: 'error',
        message: err.message || 'Update check failed',
      });
    }
    maybeFireStuckHint();
  };

  updater.on('checking-for-update', onCheckingForUpdate);
  updater.on('update-available', onUpdateAvailable);
  updater.on('update-available', onUpdateAvailableForMenuCheck);
  updater.on('update-not-available', onUpdateNotAvailable);
  updater.on('download-progress', onDownloadProgress);
  updater.on('update-downloaded', onUpdateDownloaded);
  updater.on('error', onError);

  const register = createHandler(ipcMain as IpcMain);
  register('ok:update:relaunch-now', (_event: IpcMainInvokeEvent): undefined => {
    const snapshot = readState();
    if (!snapshot.versionPendingInstall) {
      logger.warn('relaunch-now invoked without versionPendingInstall — ignoring');
      return undefined;
    }
    const pending = snapshot.versionPendingInstall;
    if (!persistSafely({ ...snapshot, versionPendingInstall: null }, 'relaunch-now'))
      return undefined;
    if (opts.prepareForRelaunch) {
      try {
        opts.prepareForRelaunch();
      } catch (err) {
        logger.warn('prepareForRelaunch threw — proceeding to quitAndInstall anyway', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    logger.info('relaunch-now invoked — calling autoUpdater.quitAndInstall', { pending });
    onDispatch?.('relaunch-now');
    updater.quitAndInstall();
    return undefined;
  });

  register('ok:update:check-now', (_event: IpcMainInvokeEvent): undefined => {
    menuCheckPending = true;
    void updater.checkForUpdates().catch((err: unknown) => {
      logger.debug('check-now checkForUpdates rejected', {
        message: err instanceof Error ? err.message : String(err),
      });
      if (menuCheckPending) {
        menuCheckPending = false;
        showCheckNowResult?.({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
    return undefined;
  });

  const currentVersion = getAppVersion();
  const state = readState();
  const shouldShowVersionNotice = state.lastSeenVersion !== currentVersion;
  const needsStateAdvance = state.lastSeenVersion !== currentVersion;

  if (needsStateAdvance) {
    const advanced = persistSafely(
      { ...state, lastSeenVersion: currentVersion },
      'lastSeenVersion-advance',
    );
    if (advanced && shouldShowVersionNotice) {
      const fireToastB = (): void => {
        broadcast('ok:update:whats-new', {
          version: currentVersion,
          releaseUrl: releaseUrlFor(currentVersion),
        });
        logger.info('whats-new dispatched Toast B', {
          from: state.lastSeenVersion,
          to: currentVersion,
        });
        onDispatch?.('whats-new-toast-b');
      };
      if (whenRendererReady) whenRendererReady(fireToastB);
      else fireToastB();
    }
  }

  let intervalHandle: ReturnType<typeof setInterval> | null = null;

  const startPeriodicChecks = (): void => {
    if (intervalHandle) return;
    intervalHandle = clock.setInterval(() => {
      void updater.checkForUpdates().catch((err: unknown) => {
        logger.debug('checkForUpdates rejected', {
          message: err instanceof Error ? err.message : String(err),
        });
      });
    }, UPDATE_CHECK_INTERVAL_MS);
  };

  if (isPackaged || forceDevBypass) {
    void updater
      .checkForUpdates()
      .then(() => {
        startPeriodicChecks();
      })
      .catch((err: unknown) => {
        logger.debug('first-launch checkForUpdates rejected', {
          message: err instanceof Error ? err.message : String(err),
        });
        startPeriodicChecks();
      });
  } else {
    logger.info(
      'skipping checkForUpdates — app.isPackaged=false and OK_UPDATER_FORCE_DEV unset (handlers remain wired for tests + IPC)',
    );
    onDispatch?.('skipped-dev-mode');
  }

  return {
    setChannel(channel: UpdateChannel): void {
      applyChannelSettings(updater, channel);
      pendingDowngrade = false;
      updater.autoDownload = true;
      if (getAllWindows) {
        for (const win of getAllWindows()) {
          sendToRenderer(win.webContents, 'ok:state:update-channel-changed', { channel });
        }
      }
      logger.info('channel changed at runtime', { channel });
    },
    async confirmDowngrade(): Promise<void> {
      if (!pendingDowngrade) {
        logger.warn('confirmDowngrade invoked without pending downgrade — ignoring');
        return;
      }
      pendingDowngrade = false;
      updater.autoDownload = true;
      try {
        await updater.downloadUpdate();
        logger.info('downgrade confirmed — downloadUpdate completed');
      } catch (err) {
        pendingDowngrade = true;
        updater.autoDownload = false;
        logger.warn('downloadUpdate failed after confirmDowngrade', {
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    checkForUpdatesNow(): Promise<unknown> {
      logger.info('check-now invoked from menu');
      return updater.checkForUpdates();
    },
    destroy(): void {
      if (intervalHandle) {
        clock.clearInterval(intervalHandle);
        intervalHandle = null;
      }
      const detach = (event: string, handler: (...args: unknown[]) => void): void => {
        try {
          updater.off(event, handler);
        } catch (err) {
          logger.warn('updater.off failed during destroy', {
            event,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      };
      detach('checking-for-update', onCheckingForUpdate as (...args: unknown[]) => void);
      detach('update-available', onUpdateAvailable as (...args: unknown[]) => void);
      detach('update-available', onUpdateAvailableForMenuCheck as (...args: unknown[]) => void);
      detach('update-not-available', onUpdateNotAvailable as (...args: unknown[]) => void);
      detach('download-progress', onDownloadProgress as (...args: unknown[]) => void);
      detach('update-downloaded', onUpdateDownloaded as (...args: unknown[]) => void);
      detach('error', onError as (...args: unknown[]) => void);
      const removeHandlerSafely = (channel: string): void => {
        try {
          ipcMain.removeHandler(channel);
        } catch (err) {
          logger.warn('ipcMain.removeHandler failed during destroy', {
            channel,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      };
      removeHandlerSafely('ok:update:relaunch-now');
      removeHandlerSafely('ok:update:check-now');
      logger.info('destroyed');
    },
  };
}

interface ElectronUpdaterModule {
  autoUpdater?: UpdaterLike;
  default?: { autoUpdater?: UpdaterLike };
}

function resolveAutoUpdater(mod: ElectronUpdaterModule): UpdaterLike | null {
  return mod.default?.autoUpdater ?? mod.autoUpdater ?? null;
}

export async function bootAutoUpdater(
  importUpdater: () => Promise<ElectronUpdaterModule>,
  opts: Omit<StartAutoUpdaterOpts, 'updater'>,
): Promise<StartAutoUpdaterHandle | null> {
  const logger = opts.logger ?? DEFAULT_LOGGER;
  try {
    const mod = await importUpdater();
    const autoUpdater = resolveAutoUpdater(mod);
    if (!autoUpdater) {
      throw new Error(
        "electron-updater did not expose 'autoUpdater' on either the module namespace or .default — check electron-updater version + Node ESM-CJS interop",
      );
    }
    return startAutoUpdater({ updater: autoUpdater, ...opts });
  } catch (err) {
    logger.error('auto-updater boot failed — app will run without updates this session', {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return null;
  }
}
