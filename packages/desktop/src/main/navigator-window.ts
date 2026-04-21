/**
 * Project Navigator window — persistent launcher (D24 revised).
 *
 * Single window, no utilityProcess attached. Renders the same React bundle
 * as editor windows but with `--ok-mode=navigator` so the renderer renders
 * `<NavigatorApp />` (US-011) instead of the editor shell.
 *
 * Lifecycle (D3 revised):
 *   - App boot: opens Navigator (unless `lastOpenedProject` was set + Option NOT held)
 *   - User picks a project → main spawns NEW editor BrowserWindow + utility
 *     (does NOT close or reuse the Navigator)
 *   - Closing Navigator while editor windows remain: app stays running
 *   - Closing the last editor window with Navigator still open: app stays
 *   - Dock click while no windows visible: re-open Navigator
 */

import type { BrowserWindowLike, WindowManagerDeps } from './window-manager.ts';

export interface NavigatorDeps {
  createWindow: WindowManagerDeps['createWindow'];
  /** Path to the built renderer HTML (used in packaged/prod mode). */
  rendererEntryPath: string;
  /** Dev-server URL injected by electron-vite (`process.env.ELECTRON_RENDERER_URL`).
   *  When set, main uses `loadURL` for HMR; otherwise falls back to `loadFile`. */
  rendererDevUrl?: string | null;
  /** App version, passed to the preload via additionalArguments. */
  appVersion: string;
}

export function createNavigatorWindow(deps: NavigatorDeps): BrowserWindowLike {
  const window = deps.createWindow({
    additionalArguments: [
      '--ok-mode=navigator',
      `--ok-app-version=${deps.appVersion}`,
      // Editor windows pass collab-url / project-path; navigator omits them
      // (renderer's useCollabUrl short-circuit returns null/empty when missing
      // and just renders the Navigator component).
      '--ok-collab-url=',
      '--ok-api-origin=',
      '--ok-project-path=',
      '--ok-project-name=Project Navigator',
    ],
  });
  if (deps.rendererDevUrl) {
    void window.loadURL(deps.rendererDevUrl);
  } else {
    void window.loadFile(deps.rendererEntryPath);
  }
  return window;
}
