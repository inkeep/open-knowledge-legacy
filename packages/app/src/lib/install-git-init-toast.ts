/**
 * Install a one-shot sonner toast subscriber for the Desktop `git-init-notice`
 * bridge event (SPEC 2026-04-21-shadow-repo-single-mode R5b / D10).
 *
 * Registered imperatively during main.tsx module init (not inside a React
 * effect) so the `ipcRenderer.on` listener is in place before the main process
 * fires the event on `dom-ready`. Electron's IPC does NOT buffer past
 * emissions, so the renderer-side subscription must exist before the send.
 *
 * No-op in web / CLI distribution (window.okDesktop undefined). In Desktop,
 * returns the bridge-provided unsubscribe so the caller can detach on
 * hot-module-replacement or teardown.
 */

import { toast } from 'sonner';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

export interface InstallGitInitToastOptions {
  /** Bridge resolved from `window.okDesktop`. Absent in web/CLI. */
  bridge: OkDesktopBridge | undefined;
  /** Override for `toast.info` in tests. */
  toastImpl?: (message: string) => void;
}

export function installGitInitToast(opts: InstallGitInitToastOptions): (() => void) | undefined {
  const bridge = opts.bridge;
  if (!bridge) return undefined;

  const fire = opts.toastImpl ?? ((msg: string) => toast.info(msg));
  return bridge.onGitInitNotice((evt) => {
    fire(`Initialized git repo at ${evt.gitDir}`);
  });
}
