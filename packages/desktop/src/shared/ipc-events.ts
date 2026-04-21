/**
 * Typed IPC event channels (main → renderer, push/broadcast pattern).
 *
 * Paired with `./ipc-channels.ts`'s request/response surface. Events are
 * fire-and-forget — no reply, no failure handling at the renderer (if the
 * preload listener throws, main continues). Renderer subscribes via preload-
 * side listener wrappers (electron/electron#33328 — returned unsubscribe
 * closures must retain the wrapped-listener reference for
 * `ipcRenderer.removeListener` to match).
 *
 * Main-process dispatch goes through `createSender(getWindows)` — a typed
 * factory that mirrors `createHandler` / `createInvoker`. Direct
 * `webContents.send(...)` calls are banned outside this file by the D19
 * lint rule in `tests/integration/no-loosely-typed-webcontents-ipc.test.ts`.
 */

import type { WebContents } from 'electron';
import type { OkDesktopConfig, OkMenuAction } from './bridge-contract.ts';

export interface EventChannels {
  /** Informational — "we're about to switch, show loading state". */
  'ok:project:switching': { payload: { projectPath: string } };
  /** After a project switch: renderer re-exposes `window.okDesktop.config` + fires `onProjectSwitched` subscribers. */
  'ok:project:switched': { payload: OkDesktopConfig };
  /** Main → renderer menu-action dispatch (File → New Doc, Edit → Toggle Sidebar, etc.). */
  'ok:menu-action': { payload: OkMenuAction };
  /**
   * Main → renderer one-shot after `ensureProjectGit` ran `git init` during
   * utility boot. Renderer subscriber (app-side) surfaces a sonner `toast.info`
   * per SPEC R5b / D10. Absent when the project already had `.git/`.
   */
  'ok:git-init-notice': { payload: { gitDir: string } };
  /**
   * `autoUpdater.on('update-downloaded')` fan-out to every open BrowserWindow
   * so renderer Toast A ("Update downloaded" + "Relaunch now" action) can
   * render. Main gates firing to once-per-version via
   * `AppState.versionPendingInstall`. M3 D11.
   */
  'ok:update:downloaded': { payload: { version: string } };
  /**
   * First-launch-post-update signal: main compared `app.getVersion()` to
   * `AppState.lastSeenVersion` at updater start and decided a version
   * transition happened. Renderer Toast B (`"Updated to v${VERSION} —
   * see what's new"` + link to GitHub Releases). M3 D9/D11.
   */
  'ok:update:whats-new': { payload: { version: string; releaseUrl: string } };
  /**
   * D12 stuck-update hint: main detected `>7 calendar days` since the last
   * successful update check AND `!stuckHintShown`. Renderer Toast C points
   * the user at the manual-download page. Fires at most once per installation.
   */
  'ok:update:stuck-hint': { payload: { downloadUrl: string } };
}

export type EventChannelName = keyof EventChannels;

/**
 * Minimum shape the sender needs — `webContents.send(channel, payload)`.
 * `BrowserWindow` satisfies this structurally, as does any mock-object in
 * tests. Accepting the wider `WebContents` type from electron keeps the
 * production call site honest.
 */
export interface SendTarget {
  webContents: Pick<WebContents, 'send'>;
}

/**
 * Build a typed sender that fan-outs an EventChannels-declared event to
 * every target returned by `getTargets()` (e.g., `BrowserWindow.getAllWindows`).
 *
 * Channel name + payload shape are type-checked against the EventChannels
 * map — a typo on the channel literal fails at compile time, which is the
 * guarantee direct `webContents.send(...)` calls cannot provide.
 *
 * Usage:
 * ```ts
 * const send = createSender(() => BrowserWindow.getAllWindows());
 * send('ok:update:downloaded', { version: '0.3.1' });
 * ```
 *
 * D19: this is the only place in `packages/desktop/src/` (outside the
 * allowlist) where `webContents.send` is legal. The lint rule
 * `tests/integration/no-loosely-typed-webcontents-ipc.test.ts` enforces it.
 */
export function createSender(getTargets: () => readonly SendTarget[]) {
  return <K extends EventChannelName>(channel: K, payload: EventChannels[K]['payload']): void => {
    for (const target of getTargets()) {
      target.webContents.send(channel, payload);
    }
  };
}

/**
 * Build a typed sender that delivers an EventChannels-declared event to a
 * SINGLE target returned by `getTarget()`. Companion to `createSender` for
 * channels that must not fan-out across multiple BrowserWindows — update-
 * toast channels under D24 multi-window mode would otherwise render N
 * independent toasts with N "Relaunch now" buttons (see `auto-updater.ts`).
 *
 * `getTarget()` may return `null` when no suitable window is open — the
 * returned sender no-ops in that case. Production wires this to
 * `() => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null`.
 */
export function createSingleSender(getTarget: () => SendTarget | null) {
  return <K extends EventChannelName>(channel: K, payload: EventChannels[K]['payload']): void => {
    const target = getTarget();
    if (!target) return;
    target.webContents.send(channel, payload);
  };
}
