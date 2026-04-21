/**
 * M3 auto-updater — main-process orchestration for electron-updater.
 *
 * Boots at the end of `app.whenReady()` (see main/index.ts), tears down
 * on `app.on('will-quit')` per parent D40 canonical shutdown ordering.
 * Every time-dependent path (now, setInterval, clearInterval) and every
 * Electron boundary (autoUpdater, BrowserWindow, ipcMain, app.isPackaged,
 * app.getVersion) is injectable so the module unit-tests under bun
 * without a real Electron runtime.
 *
 * Spec: specs/2026-04-21-m3-electron-updater/SPEC.md §4 + §7 D1–D12 +
 * §5 AC2–AC3, AC10, AC17, AC18.
 *
 * Six events subscribed (AC2): checking-for-update, update-available,
 * update-not-available, download-progress (debug log only), update-
 * downloaded, error. Not wired: login, update-cancelled,
 * appimage-filename-updated.
 *
 * Error-routing (D5): classified `ERR_UPDATER_*` / `HTTP_ERROR_*` → silent
 * retry + structured bracket log; unclassified (bare Squirrel.Mac Error) →
 * same silent path with full err.stack. Zero user-visible signal per-error;
 * D12 stuck-hint closes the escape hatch after 7 consecutive failed days.
 *
 * Cadence (D10 revised): `checkForUpdatesAndNotify()` at boot, then every
 * 1 hour via setInterval(60 * 60 * 1000). Singleton per app launch.
 */

import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron';
import { createHandler } from '../shared/ipc-handler.ts';
import type { AppState } from './state-store.ts';

// ————————————————————————————————————————————————————————
// Types + injection seams
// ————————————————————————————————————————————————————————

/**
 * Minimal shape the module needs from electron-updater's AppUpdater. The
 * production binding wraps the real `autoUpdater` singleton; tests pass
 * a stub subclass that exposes `emit()` (see US-007).
 */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  channel: string | null;
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
  checkForUpdatesAndNotify(): Promise<unknown>;
  quitAndInstall(): void;
}

/** `BrowserWindow.getAllWindows()` shape — we only need `webContents.send`. */
export interface WebContentsSink {
  webContents: { send(channel: string, payload: unknown): void };
}

/** Minimal `ipcMain` surface — ipcMain.removeHandler() for teardown. */
export interface IpcMainLike extends Pick<IpcMain, 'handle' | 'removeHandler'> {}

/** Injectable `setInterval` / `clearInterval` for deterministic tests. */
export interface Clock {
  setInterval(cb: () => void, ms: number): ReturnType<typeof setInterval>;
  clearInterval(handle: ReturnType<typeof setInterval>): void;
}

/**
 * `onDispatch` observability — invoked after every event-handler outcome so
 * tests can assert which code path fired. Production binding can pass
 * undefined; US-007 wires a mock to count event dispatches.
 */
export type DispatchKind =
  | 'update-downloaded-toast-a'
  | 'update-downloaded-deduped'
  | 'whats-new-toast-b'
  | 'stuck-hint-toast-c'
  | 'check-success'
  | 'error-classified'
  | 'error-unclassified'
  | 'relaunch-now'
  | 'skipped-dev-mode';

export interface StartAutoUpdaterOpts {
  updater: UpdaterLike;
  ipcMain: IpcMainLike;
  readState: () => AppState;
  writeState: (next: AppState) => void;
  getWindows: () => WebContentsSink[];
  getAppVersion: () => string;
  isPackaged: boolean;
  /** True when `OK_UPDATER_FORCE_DEV=1` — lets Tier-2 smoke harness opt in. */
  forceDevBypass?: boolean;
  clock?: Clock;
  now?: () => Date;
  onDispatch?: (kind: DispatchKind) => void;
  logger?: Logger;
}

export interface StartAutoUpdaterHandle {
  destroy(): void;
}

export interface Logger {
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

/** D10 revised: match Obsidian's hourly cadence. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** D12: 7 calendar days before Toast C fires. */
export const STUCK_HINT_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/** D12: manual-download URL for Toast C. */
export const STUCK_HINT_DOWNLOAD_URL = 'https://inkeep.com/open-knowledge/download';

/** D9: GitHub Releases tag URL shape for Toast B. */
export function releaseUrlFor(version: string): string {
  return `https://github.com/inkeep/open-knowledge/releases/tag/v${version}`;
}

/** Classified `err.code` prefixes per evidence/electron-updater-api.md §2. */
export function isClassifiedUpdaterError(err: unknown): err is Error & { code: string } {
  if (!(err instanceof Error)) return false;
  const code = (err as Error & { code?: unknown }).code;
  if (typeof code !== 'string') return false;
  return code.startsWith('ERR_UPDATER_') || code.startsWith('HTTP_ERROR_');
}

// ————————————————————————————————————————————————————————
// Main entry
// ————————————————————————————————————————————————————————

export function startAutoUpdater(opts: StartAutoUpdaterOpts): StartAutoUpdaterHandle {
  const {
    updater,
    ipcMain,
    readState,
    writeState,
    getWindows,
    getAppVersion,
    isPackaged,
    forceDevBypass = false,
    clock = DEFAULT_CLOCK,
    now = () => new Date(),
    onDispatch,
    logger = DEFAULT_LOGGER,
  } = opts;

  // Parent §8.10 LOCKED — autoDownload=true, autoInstallOnAppQuit=true,
  // channel='latest'. Documented here at the single wire-up site.
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.channel = 'latest';

  // ————————————————————————————————————————————————————————
  // Helpers over AppState — isolate persistence seam
  // ————————————————————————————————————————————————————————

  const broadcast = <P>(channel: string, payload: P): void => {
    for (const win of getWindows()) {
      win.webContents.send(channel, payload);
    }
  };

  /** Evaluate D12 stuck-hint gate on every `error` emission. */
  const maybeFireStuckHint = (): void => {
    const state = readState();
    if (state.stuckHintShown) return;
    if (!state.lastSuccessfulCheckAt) return; // no baseline yet — fresh install can't be "stuck"
    const last = Date.parse(state.lastSuccessfulCheckAt);
    if (Number.isNaN(last)) return;
    const elapsedMs = now().getTime() - last;
    if (elapsedMs < STUCK_HINT_THRESHOLD_MS) return;

    broadcast('ok:update:stuck-hint', { downloadUrl: STUCK_HINT_DOWNLOAD_URL });
    writeState({ ...state, stuckHintShown: true });
    logger.warn('stuck-hint dispatched', {
      lastSuccessfulCheckAt: state.lastSuccessfulCheckAt,
      elapsedDays: Math.floor(elapsedMs / (24 * 60 * 60 * 1000)),
    });
    onDispatch?.('stuck-hint-toast-c');
  };

  /**
   * Mark a successful check outcome — advances `lastSuccessfulCheckAt` and
   * resets `stuckHintShown` so the Toast C gate can re-arm if the update
   * pipeline breaks again after a repaired window. D12.
   */
  const markCheckSucceeded = (): void => {
    const state = readState();
    writeState({
      ...state,
      lastSuccessfulCheckAt: now().toISOString(),
      stuckHintShown: false,
    });
    onDispatch?.('check-success');
  };

  // ————————————————————————————————————————————————————————
  // Event subscriptions (6 total per AC2)
  // ————————————————————————————————————————————————————————

  const onCheckingForUpdate = (): void => {
    logger.info('checking-for-update');
  };

  const onUpdateAvailable = (info: { version?: string }): void => {
    logger.info('update-available — download will auto-start', { version: info.version });
    markCheckSucceeded();
  };

  const onUpdateNotAvailable = (info: { version?: string }): void => {
    logger.info('update-not-available', { version: info.version });
    markCheckSucceeded();
  };

  const onDownloadProgress = (info: { percent?: number; bytesPerSecond?: number }): void => {
    // Debug-level; M3 has no UI surface for progress (per SPEC R5 + NG: no
    // progress toast). Log stays for operator diagnosis only.
    logger.debug('download-progress', {
      percent: info.percent,
      bytesPerSecond: info.bytesPerSecond,
    });
  };

  const onUpdateDownloaded = (info: { version?: string }): void => {
    const version = typeof info.version === 'string' ? info.version : '';
    if (!version) {
      logger.warn('update-downloaded with empty version — skipping dispatch');
      return;
    }
    const state = readState();
    if (state.versionPendingInstall === version) {
      logger.info('update-downloaded re-fired for same pending version — deduped', { version });
      onDispatch?.('update-downloaded-deduped');
      return;
    }
    broadcast('ok:update:downloaded', { version });
    writeState({ ...state, versionPendingInstall: version });
    logger.info('update-downloaded dispatched Toast A', { version });
    onDispatch?.('update-downloaded-toast-a');
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
    maybeFireStuckHint();
  };

  updater.on('checking-for-update', onCheckingForUpdate);
  updater.on('update-available', onUpdateAvailable);
  updater.on('update-not-available', onUpdateNotAvailable);
  updater.on('download-progress', onDownloadProgress);
  updater.on('update-downloaded', onUpdateDownloaded);
  updater.on('error', onError);

  // ————————————————————————————————————————————————————————
  // IPC handler — Toast A's "Relaunch now"
  // ————————————————————————————————————————————————————————

  const register = createHandler(ipcMain as IpcMain);
  register('ok:update:relaunch-now', (_event: IpcMainInvokeEvent): undefined => {
    logger.info('relaunch-now invoked — calling autoUpdater.quitAndInstall');
    onDispatch?.('relaunch-now');
    updater.quitAndInstall();
    return undefined;
  });

  // ————————————————————————————————————————————————————————
  // First-launch-post-update (Toast B) detection
  // ————————————————————————————————————————————————————————

  const currentVersion = getAppVersion();
  const state = readState();
  if (state.lastSeenVersion !== null && state.lastSeenVersion !== currentVersion) {
    broadcast('ok:update:whats-new', {
      version: currentVersion,
      releaseUrl: releaseUrlFor(currentVersion),
    });
    logger.info('whats-new dispatched Toast B', {
      from: state.lastSeenVersion,
      to: currentVersion,
    });
    onDispatch?.('whats-new-toast-b');
  }
  // Always advance lastSeenVersion so the toast fires at most once per
  // transition (fresh-install case: null → current, silent; no toast).
  if (state.lastSeenVersion !== currentVersion) {
    writeState({ ...readState(), lastSeenVersion: currentVersion });
  }

  // ————————————————————————————————————————————————————————
  // Launch check + periodic interval (D10 revised = 1h)
  // ————————————————————————————————————————————————————————

  let intervalHandle: ReturnType<typeof setInterval> | null = null;

  const startPeriodicChecks = (): void => {
    // Singleton interval — caller guaranteed to only invoke startAutoUpdater
    // once per app launch (US-006). Guard against accidental re-entry.
    if (intervalHandle) return;
    intervalHandle = clock.setInterval(() => {
      void updater.checkForUpdatesAndNotify().catch((err: unknown) => {
        // checkForUpdatesAndNotify rejects on network / manifest errors; the
        // updater also emits `error` for these, so the catch here is just a
        // defensive log. Event handler runs either way.
        logger.debug('checkForUpdatesAndNotify rejected', {
          message: err instanceof Error ? err.message : String(err),
        });
      });
    }, UPDATE_CHECK_INTERVAL_MS);
  };

  if (isPackaged || forceDevBypass) {
    void updater
      .checkForUpdatesAndNotify()
      .then(() => {
        startPeriodicChecks();
      })
      .catch((err: unknown) => {
        logger.debug('first-launch checkForUpdatesAndNotify rejected', {
          message: err instanceof Error ? err.message : String(err),
        });
        // Still start the interval — next fire may succeed.
        startPeriodicChecks();
      });
  } else {
    logger.info(
      'skipping checkForUpdatesAndNotify — app.isPackaged=false and OK_UPDATER_FORCE_DEV unset (handlers remain wired for tests + IPC)',
    );
    onDispatch?.('skipped-dev-mode');
  }

  // ————————————————————————————————————————————————————————
  // Teardown (AC10 + F17: cleared on will-quit, parent D40 order)
  // ————————————————————————————————————————————————————————

  return {
    destroy(): void {
      if (intervalHandle) {
        clock.clearInterval(intervalHandle);
        intervalHandle = null;
      }
      try {
        updater.off('checking-for-update', onCheckingForUpdate as (...args: unknown[]) => void);
        updater.off('update-available', onUpdateAvailable as (...args: unknown[]) => void);
        updater.off('update-not-available', onUpdateNotAvailable as (...args: unknown[]) => void);
        updater.off('download-progress', onDownloadProgress as (...args: unknown[]) => void);
        updater.off('update-downloaded', onUpdateDownloaded as (...args: unknown[]) => void);
        updater.off('error', onError as (...args: unknown[]) => void);
      } catch (err) {
        logger.warn('updater.off failed during destroy', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        ipcMain.removeHandler('ok:update:relaunch-now');
      } catch (err) {
        logger.warn('ipcMain.removeHandler failed during destroy', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
      logger.info('destroyed');
    },
  };
}

// ————————————————————————————————————————————————————————
// Type compatibility shim — BrowserWindow satisfies WebContentsSink.
// Exists as a compile-time assertion; not exported for runtime use.
// ————————————————————————————————————————————————————————

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _BrowserWindowIsWebContentsSink = BrowserWindow extends WebContentsSink ? true : false;
