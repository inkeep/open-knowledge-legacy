import type { BrowserWindowLike, WindowManagerDeps } from './window-manager.ts';

interface NavigatorDeps {
  createWindow: WindowManagerDeps['createWindow'];
  rendererEntryPath: string;
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
