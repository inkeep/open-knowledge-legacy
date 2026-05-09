import type { BrowserWindowLike, WindowManagerDeps } from './window-manager.ts';

export function tryCloseNavigator(
  nav: BrowserWindowLike | null,
  context: { projectPath: string },
  log: (event: string, fields: Record<string, unknown>) => void = (event, fields) =>
    console.warn(`[main] ${event}`, fields),
): void {
  try {
    if (nav && nav.isDestroyed?.() !== true) nav.close?.();
  } catch (err) {
    log('failed to close Navigator after project open', {
      projectPath: context.projectPath,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

interface NavigatorDeps {
  createWindow: WindowManagerDeps['createWindow'];
  rendererEntryPath: string;
  /** Dev-server URL injected by electron-vite (`process.env.ELECTRON_RENDERER_URL`).
   *  When set, main uses `loadURL` for HMR; otherwise falls back to `loadFile`. */
  rendererDevUrl?: string | null;
  appVersion: string;
}

export function createNavigatorWindow(deps: NavigatorDeps): BrowserWindowLike {
  const window = deps.createWindow({
    additionalArguments: [
      '--ok-mode=navigator',
      `--ok-app-version=${deps.appVersion}`,
      '--ok-collab-url=',
      '--ok-api-origin=',
      '--ok-project-path=',
      '--ok-project-name=Project Navigator',
    ],
    title: 'Open Knowledge',
  });
  window.once('ready-to-show', () => {
    window.show?.();
  });
  setTimeout(() => {
    if (window.isDestroyed?.() || window.isVisible?.()) return;
    console.warn('[main] ready-to-show did not fire within 5s — falling back');
    window.show?.();
  }, 5000);
  if (deps.rendererDevUrl) {
    void window.loadURL(deps.rendererDevUrl);
  } else {
    void window.loadFile(deps.rendererEntryPath);
  }
  return window;
}
