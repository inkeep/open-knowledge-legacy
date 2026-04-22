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
 * Cadence (D10 revised): `checkForUpdates()` at boot, then every
 * 1 hour via setInterval(60 * 60 * 1000). Singleton per app launch.
 */

import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { EventChannels } from '../shared/ipc-events.ts';
import { createHandler } from '../shared/ipc-handler.ts';
import { type SendableWebContents, sendToRenderer } from '../shared/ipc-send.ts';
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
  /** NG3 — no beta channel; locked via explicit set alongside `channel`. */
  allowPrerelease: boolean;
  /** Locked via explicit set — no downgrade path. */
  allowDowngrade: boolean;
  /**
   * electron-updater gates `checkForUpdates()` on `app.isPackaged ||
   * forceDevUpdateConfig`. The Tier-2 mock-update smoke runs against an
   * unpackaged dev build, so we flip this to `true` when `forceDevBypass`
   * is set so the manifest fetch actually proceeds. Packaged builds leave
   * this `false`. Per evidence/electron-updater-api.md §4 approach 2.
   */
  forceDevUpdateConfig: boolean;
  /**
   * Override the feed URL at runtime. Tier-2 smoke passes a bare string
   * pointing at a local HTTP server — electron-updater routes bare
   * strings through `GenericProvider`. Production leaves this unset and
   * the updater reads the `publish:` block from `app-update.yml`.
   */
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
  quitAndInstall(): void;
}

/** Minimal `ipcMain` surface — ipcMain.removeHandler() for teardown. */
export interface IpcMainLike extends Pick<IpcMain, 'handle' | 'removeHandler'> {}

/** Injectable `setInterval` / `clearInterval` for deterministic tests. */
interface Clock {
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
  | 'update-downloaded-empty-version'
  | 'whats-new-toast-b'
  | 'stuck-hint-toast-c'
  | 'check-success'
  | 'error-classified'
  | 'error-unclassified'
  | 'relaunch-now'
  | 'skipped-dev-mode';

interface StartAutoUpdaterOpts {
  updater: UpdaterLike;
  ipcMain: IpcMainLike;
  readState: () => AppState;
  writeState: (next: AppState) => void;
  /**
   * Single target for update-toast delivery. With D24 multi-window mode
   * ("every project pick spawns a new editor window"), fanning out to every
   * open BrowserWindow would render N independent toasts per event and give
   * the user N "Relaunch now" buttons. Production passes
   * `() => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null`
   * so the toast lands on the window the user is looking at (falling back
   * to the first open window when none is focused). Returns null if no
   * window is open — broadcast is a no-op.
   */
  getPrimaryWindow: () => { webContents: SendableWebContents } | null;
  getAppVersion: () => string;
  isPackaged: boolean;
  /** True when `OK_UPDATER_FORCE_DEV=1` — lets Tier-2 smoke harness opt in. */
  forceDevBypass?: boolean;
  /**
   * Tier-2 smoke override — when set, call `updater.setFeedURL(feedUrl)`
   * before the first check. Forwards the bare string to electron-updater's
   * `GenericProvider`. Production leaves this unset (the updater reads the
   * `publish: github` block from `app-update.yml` / `electron-builder.yml`).
   * Wired from `OK_UPDATER_FEED_URL` env var at main-process boot.
   */
  feedUrl?: string;
  /**
   * Optional scheduler for events that might fire before the renderer
   * finishes mounting its subscribers. Only Toast B (first-launch-post-
   * update) is affected — `startAutoUpdater` runs from `app.whenReady()`
   * and dispatches Toast B synchronously, which races the renderer's
   * React mount of `<UpdateToast/>`. Electron drops `webContents.send`
   * messages that arrive before the renderer has attached its listener
   * (the docs call out this race for `send` but not `handle`). Production
   * wires this to `win.webContents.once('did-finish-load', fn)` on the
   * primary window so Toast B lands after the renderer is listening.
   * Tests can pass `undefined` (or an immediate-fire scheduler) and get
   * the pre-fix behavior. Toast A + Toast C don't need the deferral —
   * they fire off subsequent electron-updater events (update-downloaded,
   * error), which by definition arrive long after the renderer mount.
   * Fixes Review Pass 4 Major #1 (renderer-mount race).
   */
  whenRendererReady?: (fn: () => void) => void;
  clock?: Clock;
  now?: () => Date;
  onDispatch?: (kind: DispatchKind) => void;
  logger?: Logger;
}

export interface StartAutoUpdaterHandle {
  destroy(): void;
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

/** D10 revised: match Obsidian's hourly cadence. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** D12: 7 calendar days before Toast C fires. */
export const STUCK_HINT_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/** D12: manual-download URL for Toast C. */
export const STUCK_HINT_DOWNLOAD_URL = 'https://inkeep.com/open-knowledge/download';

/**
 * D9: GitHub Releases tag URL shape for Toast B.
 *
 * `version` is `app.getVersion()` output (effectively trusted — read from
 * the app's own package.json at boot), but encode it defensively so a
 * malformed version string (e.g. containing `/` or `..`) cannot produce a
 * path-confusion URL. The resulting URL still passes the D47 scheme
 * allowlist; the encoding only locks the path segment shape.
 */
export function releaseUrlFor(version: string): string {
  return `https://github.com/inkeep/open-knowledge/releases/tag/v${encodeURIComponent(version)}`;
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
    getPrimaryWindow,
    getAppVersion,
    isPackaged,
    forceDevBypass = false,
    feedUrl,
    whenRendererReady,
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
  // NG3: single `latest` channel, no beta. Locking the electron-updater
  // defaults explicitly so a future library bump can't silently flip them.
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;

  // Tier-2 smoke plumbing (evidence/electron-updater-api.md §4 approach 2).
  // When `forceDevBypass` is true we flip `forceDevUpdateConfig` so the
  // underlying `checkForUpdates()` actually hits the network even without a
  // packaged `.app`. When `feedUrl` is set we point the updater at a local
  // HTTP server (via electron-updater's `GenericProvider`). Production
  // leaves both unset — `isPackaged` true on signed DMGs + `publish: github`
  // in `app-update.yml` drives the real update path.
  updater.forceDevUpdateConfig = forceDevBypass;
  if (feedUrl) {
    updater.setFeedURL(feedUrl);
    logger.info('setFeedURL (dev override) — updater will pull manifest from local mock', {
      feedUrl,
    });
  }

  // ————————————————————————————————————————————————————————
  // Helpers over AppState — isolate persistence seam
  // ————————————————————————————————————————————————————————

  /**
   * Send an update event to a single window (D24 multi-window fan-out fix).
   * Routes through `sendToRenderer` — the canonical D19 main→renderer wrapper
   * (also used by window-manager for `ok:git-init-notice`). We target ONE
   * window (not `BrowserWindow.getAllWindows()`) because fan-out would render
   * N independent toasts across N editor windows with N "Relaunch now"
   * buttons. When no window is open (unusual — updater is wired after the
   * first window opens), the broadcast no-ops; the state gate still arms so
   * the event doesn't re-emit repeatedly once a window opens.
   */
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

  /**
   * Persist state, swallowing any I/O error so the caller can treat a failed
   * write as "no gate armed, will retry next event." Returns true on success,
   * false on failure — callers that must gate user-visible effects on the
   * write succeeding (Toast A / Toast C) check this before emitting.
   */
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

  /** Evaluate D12 stuck-hint gate on every `error` emission. */
  const maybeFireStuckHint = (): void => {
    const state = readState();
    if (state.stuckHintShown) return;
    if (!state.lastSuccessfulCheckAt) return; // no baseline yet — fresh install can't be "stuck"
    const last = Date.parse(state.lastSuccessfulCheckAt);
    if (Number.isNaN(last)) return;
    const elapsedMs = now().getTime() - last;
    if (elapsedMs < STUCK_HINT_THRESHOLD_MS) return;

    // Persist-before-emit: arm the dedupe gate first so a disk-write failure
    // cannot leave Toast C visible with no state to prevent re-emission on
    // subsequent error events. If the write fails, skip dispatch; the next
    // error event will try again.
    if (!persistSafely({ ...state, stuckHintShown: true }, 'stuck-hint')) return;

    // Defer through `whenRendererReady` for the same reason Toast A does:
    // in dev / Tier-2 / any environment where the error fires before the
    // editor window's `did-finish-load`, a plain broadcast would skip
    // AFTER the state gate already marked `stuckHintShown = true`,
    // meaning the user never sees Toast C for this installation.
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

  /**
   * Mark a successful check outcome — advances `lastSuccessfulCheckAt` and
   * resets `stuckHintShown` so the Toast C gate can re-arm if the update
   * pipeline breaks again after a repaired window. D12.
   *
   * Routes through `persistSafely` (same discipline as every other mutation
   * site in this module). `update-available` / `update-not-available` are
   * emitted synchronously from electron-updater's promise-chain inside
   * `doCheckForUpdates()` (AppUpdater.js:401-429) — a thrown writeState
   * propagates out of the emitter and breaks the check pipeline before
   * `autoDownload` can trigger. Catching the throw keeps the updater event
   * loop alive even when `saveAppState` fails mid-session (EACCES, disk
   * full), logs the failure at `error` level, and lets the next event
   * retry. Skipping `onDispatch('check-success')` on failure is intentional
   * — the observability surface mirrors the state: "success was not
   * recorded." Fixes Review Pass 4 Critical #1.
   */
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
      onDispatch?.('update-downloaded-empty-version');
      return;
    }
    const state = readState();
    if (state.versionPendingInstall === version) {
      logger.info('update-downloaded re-fired for same pending version — deduped', { version });
      onDispatch?.('update-downloaded-deduped');
      return;
    }
    // Persist-before-emit: arm the versionPendingInstall gate BEFORE Toast A
    // so an atomic-write failure (disk full, EACCES, etc.) cannot produce a
    // user-visible toast with no state to prevent re-emission on the next
    // update-downloaded event. If persist fails, skip dispatch — electron-
    // updater will re-fire from its on-disk cache and we get another shot.
    if (!persistSafely({ ...state, versionPendingInstall: version }, 'update-downloaded')) return;
    // Defer the broadcast through `whenRendererReady` so it lands AFTER the
    // primary window has loaded and its renderer subscriber is attached.
    // In dev + Tier-2 smoke the mock download completes in ~300ms — before
    // Electron finishes `did-finish-load` on the editor window — so a plain
    // `broadcast()` would skip with "no primary window" AFTER the state
    // gate already armed, dropping Toast A for the rest of the installation.
    // `whenRendererReady` handles the three timing cases (loaded / loading /
    // no window yet — see main/index.ts) so Toast A reliably lands once
    // there's a window to render it. Production is less affected (download
    // takes minutes) but the scheduler is safe on the happy path too —
    // fires immediately when the window is already ready.
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
    // Gate on versionPendingInstall — the only legitimate caller is Toast A's
    // "Relaunch now" button, which the renderer only shows after the main-side
    // `onUpdateDownloaded` gate armed the state. Invoking `quitAndInstall()`
    // with nothing staged is undefined behavior in Squirrel.Mac (best case:
    // app quits and relaunches same version; worst case: inconsistent state).
    // Ignore + log any invocation that reaches main without state backing it.
    //
    // Single `readState()` snapshot feeds both the gate check AND the
    // persist spread — Electron's main process is single-threaded so no
    // TOCTOU risk exists, and the dedup is cleaner than two reads with
    // identical results (Review Pass 5 Consider #1).
    const snapshot = readState();
    if (!snapshot.versionPendingInstall) {
      logger.warn('relaunch-now invoked without versionPendingInstall — ignoring');
      return undefined;
    }
    const pending = snapshot.versionPendingInstall;
    // Double-invoke guard (Review Pass 4 Major #2): clear the state gate
    // BEFORE calling `quitAndInstall()` so a second IPC fire (rapid
    // double-click on Toast A's "Relaunch now" — sonner doesn't debounce
    // the action button) sees `pending === null` and short-circuits.
    // `autoUpdater.quitAndInstall()` is not documented as idempotent on
    // Squirrel.Mac; observed outcomes range from no-op to "update staging
    // is interrupted and the app relaunches at the old version" (the J7a
    // failure mode AC15 is specifically designed to prevent). If the
    // persist fails, skip the call entirely — better to leave the toast
    // visible and let the user click again (with a healthy disk) than to
    // fire a non-idempotent operation on unreliable state.
    if (!persistSafely({ ...snapshot, versionPendingInstall: null }, 'relaunch-now'))
      return undefined;
    logger.info('relaunch-now invoked — calling autoUpdater.quitAndInstall', { pending });
    onDispatch?.('relaunch-now');
    updater.quitAndInstall();
    return undefined;
  });

  // ————————————————————————————————————————————————————————
  // First-launch-post-update (Toast B) detection
  // ————————————————————————————————————————————————————————

  const currentVersion = getAppVersion();
  const state = readState();
  const isVersionTransition =
    state.lastSeenVersion !== null && state.lastSeenVersion !== currentVersion;
  const needsStateAdvance = state.lastSeenVersion !== currentVersion;

  // Persist-before-emit (Review Pass 4 Major #1 part A) — advance
  // `lastSeenVersion` BEFORE any broadcast so a disk-write failure cannot
  // leave Toast B un-armed-with-broadcast-already-sent (which would re-fire
  // on every boot). Peer sites (Toast A, Toast C) use this same order.
  // `lastSeenVersion === null` (fresh install) still advances silently —
  // no broadcast, just seed the baseline for future transitions.
  if (needsStateAdvance) {
    const advanced = persistSafely(
      { ...state, lastSeenVersion: currentVersion },
      'lastSeenVersion-advance',
    );
    if (advanced && isVersionTransition) {
      // Toast B broadcast — deferred via `whenRendererReady` when provided
      // (Review Pass 4 Major #1 part B: renderer-mount race). `startAutoUpdater`
      // runs from `app.whenReady()`, which fires BEFORE the first window's
      // renderer has mounted `<UpdateToast/>` and attached its preload-side
      // listener via the bridge subscription method. A synchronous
      // `webContents.send` at this point is dropped. Production passes a
      // scheduler that waits for `did-finish-load` on the primary window;
      // tests that don't care inject `undefined` and get the pre-fix
      // immediate-fire behavior.
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

  // ————————————————————————————————————————————————————————
  // Launch check + periodic interval (D10 revised = 1h)
  // ————————————————————————————————————————————————————————

  let intervalHandle: ReturnType<typeof setInterval> | null = null;

  const startPeriodicChecks = (): void => {
    // Singleton interval — caller guaranteed to only invoke startAutoUpdater
    // once per app launch (US-006). Guard against accidental re-entry.
    if (intervalHandle) return;
    intervalHandle = clock.setInterval(() => {
      void updater.checkForUpdates().catch((err: unknown) => {
        // checkForUpdates rejects on network / manifest errors; the
        // updater also emits `error` for these, so the catch here is just a
        // defensive log. Event handler runs either way.
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
        // Still start the interval — next fire may succeed.
        startPeriodicChecks();
      });
  } else {
    logger.info(
      'skipping checkForUpdates — app.isPackaged=false and OK_UPDATER_FORCE_DEV unset (handlers remain wired for tests + IPC)',
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
      // Note: listeners detached per-event below.
      // Detach each listener under its own try/catch — a single `updater.off`
      // throw must not leave the remaining subscribers wired. electron-
      // updater extends Node's EventEmitter so `off` is unlikely to throw,
      // but teardown is exactly where defensive code earns its keep.
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
      detach('update-not-available', onUpdateNotAvailable as (...args: unknown[]) => void);
      detach('download-progress', onDownloadProgress as (...args: unknown[]) => void);
      detach('update-downloaded', onUpdateDownloaded as (...args: unknown[]) => void);
      detach('error', onError as (...args: unknown[]) => void);
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

/**
 * Shape returned by `() => import('electron-updater')`. The npm package is
 * published as CommonJS with the `autoUpdater` member installed via
 * `Object.defineProperty(exports, 'autoUpdater', { get: ... })` — a dynamic
 * getter that Node's CJS → ESM interop wraps behind `.default` when loaded
 * via `await import(...)`. Static named exports (AppUpdater, MacUpdater, …)
 * are also re-exposed at the top level, but `autoUpdater` is NOT. We must
 * read it off `.default`, with the top-level path kept as a fallback for
 * test mocks that still pass `{ autoUpdater }` directly.
 *
 * See electron-updater `out/main.js` for the `Object.defineProperty` site.
 */
export interface ElectronUpdaterModule {
  autoUpdater?: UpdaterLike;
  default?: { autoUpdater?: UpdaterLike };
}

/**
 * Resolve `autoUpdater` from the imported module across both the real
 * CJS-wrapped-by-ESM shape and the flat shape used by test mocks. Returns
 * `null` if neither path exposes the member so the caller can log + bail
 * cleanly instead of throwing on the subsequent property assignment.
 */
export function resolveAutoUpdater(mod: ElectronUpdaterModule): UpdaterLike | null {
  return mod.default?.autoUpdater ?? mod.autoUpdater ?? null;
}

/**
 * Catch-path-tested wrapper around the dynamic `electron-updater` import +
 * `startAutoUpdater` call. Review Pass 4 Major #5: a failed dynamic import
 * (bundling drift, corrupt node_modules, future Electron upgrade that
 * desyncs electron-updater) must not crash the boot or leave the app
 * silently un-updateable with no user-facing or log signal. This helper
 * centralizes the try/catch contract so `main/index.ts` boot code stays
 * one line AND the catch branch is reachable from a `bun test` harness
 * without an Electron runtime.
 *
 * Tests pass a throwing `importUpdater` OR a flat `{ autoUpdater }` mock +
 * a captured logger; production passes `() => import('electron-updater')`
 * which resolves via `mod.default.autoUpdater` (see ElectronUpdaterModule).
 */
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
