/**
 * Typed IPC event channels (main → renderer, push/broadcast pattern).
 *
 * Paired with `./ipc-channels.ts`'s request/response surface. Events are
 * fire-and-forget — no reply, no failure handling at the renderer (if the
 * preload listener throws, main continues). Renderer subscribes via preload-
 * side listener wrappers (electron/electron#33328 — returned unsubscribe
 * closures must retain the wrapped-listener reference for
 * `ipcRenderer.removeListener` to match).
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
}

export type EventChannelName = keyof EventChannels;
