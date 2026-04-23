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
 * Main-process dispatch goes through `sendToRenderer` in `./ipc-send.ts` —
 * the D19 typed wrapper that's the canonical path for main→renderer push
 * events. Direct `webContents.send(...)` calls are banned outside allowlisted
 * wrapper files by the D19 lint rule in
 * `tests/integration/no-loosely-typed-webcontents-ipc.test.ts`.
 */

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
  /**
   * Main → renderer on an `openknowledge://open?project=…&doc=<name>` URL
   * that routed to this window (M4). Renderer updates `location.hash` to
   * open the target doc — the existing hash-route listener handles the rest.
   */
  'ok:deep-link': { payload: { doc: string } };
}
