/**
 * Main-process entry for `@inkeep/open-knowledge-desktop`.
 *
 * Boot sequence (D3 revised + D24 revised):
 *   1. app.whenReady()
 *   2. Load app state from userData/state.json
 *   3. If lastOpenedProject set AND not Option-held → open editor for that project
 *      Else → open Navigator window
 *   4. Register IPC handlers (dialog / shell / clipboard / project)
 *   5. macOS Dock icon click → re-open Navigator
 *
 * Process model: one BrowserWindow ↔ one utilityProcess ↔ one Hocuspocus
 * server ↔ one contentDir (D6). The window manager owns spawn/teardown;
 * this entry wires it into Electron lifecycle + IPC handlers.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname as osHostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProcessAlive, readServerLock } from '@inkeep/open-knowledge-server';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  session,
  shell,
  utilityProcess,
} from 'electron';
import type { RecentProject } from '../shared/ipc-channels.ts';
import { createHandler } from '../shared/ipc-handler.ts';
import { promptForFolder } from './dialog-helpers.ts';
import {
  detectProtocol as detectProtocolImpl,
  spawnCursor as spawnCursorImpl,
} from './ipc-handlers.ts';
import { installApplicationMenu } from './menu.ts';
import { createNavigatorWindow } from './navigator-window.ts';
import { checkOutboundUrl } from './shell-allowlist.ts';
import {
  type AppState,
  addRecentProject,
  annotateMissing,
  emptyState,
  parseAppState,
  saveAppStateToDir,
} from './state-store.ts';
import {
  type BrowserWindowLike,
  type UtilityProcessLike,
  WindowManager,
} from './window-manager.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_WIN_OPTS = {
  width: 1280,
  height: 800,
  show: true,
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
};

function loadAppState(): AppState {
  const statePath = join(app.getPath('userData'), 'state.json');
  if (!existsSync(statePath)) return emptyState();
  try {
    const raw = JSON.parse(readFileSync(statePath, 'utf-8'));
    return parseAppState(raw) ?? emptyState();
  } catch (err) {
    // Corrupt state — rename + start fresh per OQ-G. Log so operations teams
    // can correlate "recents disappeared" reports to a corruption event
    // instead of staring at a silent file swap.
    console.warn('[main] state.json parse failed — quarantining and starting fresh', {
      err: (err as Error).message,
      statePath,
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    try {
      const corruptPath = `${statePath}.corrupt-${stamp}`;
      const buf = readFileSync(statePath);
      writeFileSync(corruptPath, buf);
      console.warn('[main] corrupt state.json backed up', { corruptPath });
    } catch (backupErr) {
      console.warn('[main] corrupt state.json backup failed', {
        err: (backupErr as Error).message,
      });
    }
    return emptyState();
  }
}

/**
 * Persist app state atomically via the pure helper in `state-store.ts` —
 * separation so the atomic-write behavior can be unit-tested without
 * Electron's `app` module (`app.getPath('userData')` is the sole Electron
 * dependency).
 */
function saveAppState(state: AppState) {
  saveAppStateToDir(app.getPath('userData'), state);
}

let appState: AppState = emptyState();
let navigatorWindow: BrowserWindowLike | null = null;
let wm: WindowManager;

/**
 * electron-vite dev-server URL. Set by `electron-vite dev` at launch time.
 * When present, `loadURL(rendererDevUrl)` → live HMR via the Vite dev server
 * (configured in `electron.vite.config.ts` to serve `packages/app/`). When
 * absent (packaged / prod), fall back to `loadFile(rendererEntryPath)`.
 */
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL ?? null;

function ensureWindowManager() {
  if (wm) return;
  // Renderer entry (prod path): electron-builder copies packages/cli/dist/public/ to
  // <Resources>/app/, so the renderer is at process.resourcesPath/app/index.html.
  // Dev path: we prefer rendererDevUrl (electron-vite's Vite dev server serving
  // packages/app/), falling back to the local shell only when dev-server URL is
  // unset (e.g., running out/main/index.js directly without `electron-vite dev`).
  const rendererEntryPath = app.isPackaged
    ? join(process.resourcesPath, 'app', 'index.html')
    : join(__dirname, '../renderer/index.html');
  // Utility entry: electron-vite piggybacks the utility build into main's
  // bundle (see electron.vite.config.ts main.build.rollupOptions comment),
  // so it lands at `out/main/utility/server-entry.js` — same folder tree as
  // `out/main/index.js`, nested one level deeper. Not `out/utility/...`.
  const utilityEntryPath = join(__dirname, 'utility/server-entry.js');

  wm = new WindowManager({
    createWindow: (opts) => {
      const win = new BrowserWindow({
        ...DEFAULT_WIN_OPTS,
        title: opts.title,
        webPreferences: {
          ...DEFAULT_WIN_OPTS.webPreferences,
          additionalArguments: opts.additionalArguments,
          preload: join(__dirname, '../preload/index.js'),
        },
      });
      // Electron defaults to updating the window title from the renderer's
      // `<title>` tag after page load — that would clobber our per-project
      // title with `packages/app/index.html`'s static "Open Knowledge" on
      // every navigation. `preventDefault()` in the event handler keeps our
      // title, while still letting the renderer read `document.title` for
      // its own purposes if it wants to.
      win.on('page-title-updated', (e) => {
        e.preventDefault();
      });
      return win as unknown as BrowserWindowLike;
    },
    forkUtility: (entry, opts) => {
      const child = utilityProcess.fork(entry, [], {
        ...opts,
      } as unknown as Parameters<typeof utilityProcess.fork>[2]);
      return child as unknown as UtilityProcessLike;
    },
    utilityEntryPath,
    rendererEntryPath,
    rendererDevUrl,
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    killProbe: (pid, signal) => {
      process.kill(pid, signal as NodeJS.Signals | 0);
    },
    // Attach-mode wiring — when a same-host `ok start` CLI (or any other
    // bootServer caller) is already holding the server.lock for this
    // contentDir, window-manager reads the lock + verifies liveness and
    // connects the renderer directly instead of trying to spawn a duplicate.
    readServerLock: (lockDir) => readServerLock(lockDir),
    isProcessAlive: (pid) => isProcessAlive(pid),
    hostname: () => osHostname(),
  });
}

function openNavigator() {
  if (navigatorWindow) {
    (navigatorWindow as unknown as { focus: () => void }).focus();
    return;
  }
  navigatorWindow = createNavigatorWindow({
    createWindow: (opts) => {
      const win = new BrowserWindow({
        ...DEFAULT_WIN_OPTS,
        width: 720,
        height: 520,
        webPreferences: {
          ...DEFAULT_WIN_OPTS.webPreferences,
          additionalArguments: opts.additionalArguments,
          preload: join(__dirname, '../preload/index.js'),
        },
      });
      win.on('closed', () => {
        navigatorWindow = null;
      });
      return win as unknown as BrowserWindowLike;
    },
    rendererEntryPath: app.isPackaged
      ? join(process.resourcesPath, 'app', 'index.html')
      : join(__dirname, '../renderer/index.html'),
    rendererDevUrl,
    appVersion: app.getVersion(),
  });
}

async function openProject(projectPath: string) {
  ensureWindowManager();
  const ctx = await wm.createProjectWindow({ projectPath });
  appState = addRecentProject(appState, ctx.projectPath, ctx.projectName);
  saveAppState(appState);
  // Keep File → Open Recent current. Menu rebuild is cheap (<1ms) and
  // Electron expects this pattern — there's no per-item mutation API.
  refreshApplicationMenu();
}

async function openProjectOrFallbackToNavigator(projectPath: string) {
  try {
    await openProject(projectPath);
  } catch (err) {
    const errorMessage = (err as Error).message;
    console.error('[main] openProject failed, falling back to Navigator', {
      projectPath,
      err: errorMessage,
    });
    // Surface the failure so users know why the Navigator reappeared. Without
    // this, a `ProjectGitInitError` (D12 fail-fast — git missing, permission
    // denied, partial init) drops the user back into the picker with zero
    // explanation, which reads as "the app is broken." Modal is blocking and
    // self-acknowledgeable — no follow-up actions needed beyond OK. SPEC R6
    // has the authoritative install-or-init-yourself copy for the CLI; the
    // utility's IPC error message already includes the git-init details in
    // its body.
    dialog.showErrorBox('Unable to open project', `${projectPath}\n\n${errorMessage}`);
    openNavigator();
  }
}

/**
 * Rebuild the application menu. Called on app boot AND whenever the recent-
 * projects list changes, so File → Open Recent stays current.
 */
function refreshApplicationMenu() {
  // Fire-and-forget: installApplicationMenu is async because it dynamically
  // imports `electron.Menu` (see menu.ts header — keeps `buildMenuTemplate`
  // unit-testable under Bun). Failures are logged; an uninstallable menu
  // shouldn't crash the app.
  void installApplicationMenu({
    appName: app.name,
    dialog,
    openNavigator,
    openProject: openProjectOrFallbackToNavigator,
    getRecentProjects: () => appState.recentProjects,
    clearRecentProjects: () => {
      appState = { ...appState, recentProjects: [] };
      saveAppState(appState);
      refreshApplicationMenu();
    },
    // D47 scheme allowlist is enforced in the renderer IPC path (shell-allowlist.ts).
    // Help-menu URLs are hardcoded in menu.ts (always `https://github.com/inkeep/…`),
    // so they're trusted at build time — direct shell.openExternal is fine here.
    openExternalUrl: (url: string) => {
      void shell.openExternal(url);
    },
  }).catch((err) => {
    console.error('[main] installApplicationMenu failed', { err: (err as Error).message });
  });
}

function registerIpcHandlers() {
  const handle = createHandler(ipcMain);

  handle('ok:dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  handle('ok:dialog:create-folder', async () => {
    // Shared with the File → Open Folder menu handler — both pick an existing
    // directory OR create a new one. See dialog-helpers.ts for the one
    // definition of "what does Open Folder do."
    return promptForFolder(dialog);
  });

  handle('ok:shell:open-external', async (_event, url) => {
    const check = checkOutboundUrl(url);
    if (!check.ok) {
      throw new Error(`shell.openExternal blocked: ${check.reason}`);
    }
    await shell.openExternal(url);
    return undefined;
  });

  handle('ok:shell:detect-protocol', async (_event, scheme) => {
    return detectProtocolImpl(
      {
        platform: process.platform,
        getApplicationInfoForProtocol: (url) => app.getApplicationInfoForProtocol(url),
      },
      scheme,
    );
  });

  handle('ok:shell:spawn-cursor', async (_event, path) => {
    return spawnCursorImpl(
      {
        platform: process.platform,
        getApplicationInfoForProtocol: (url) => app.getApplicationInfoForProtocol(url),
        spawn: (binaryPath, userPath, timeoutMs) =>
          new Promise((resolve) => {
            try {
              const child = spawn(binaryPath, [userPath], {
                shell: false,
                timeout: timeoutMs,
                stdio: ['ignore', 'ignore', 'pipe'],
              });
              // Drain stderr so a chatty Cursor binary can't block on a full pipe buffer.
              child.stderr?.on('data', () => {});
              // `spawn` event fires once the process is successfully launched —
              // that's the success criterion per SPEC (not a clean exit).
              child.once('spawn', () => resolve({ ok: true }));
              child.once('error', () => resolve({ ok: false, reason: 'spawn-error' }));
            } catch {
              resolve({ ok: false, reason: 'spawn-error' });
            }
          }),
      },
      path,
    );
  });

  handle('ok:clipboard:write-text', async (_event, text) => {
    clipboard.writeText(text);
    return undefined;
  });

  handle('ok:project:get-info', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('webContents has no parent BrowserWindow');
    const ctx = wm?.getContextForBrowserWindow(win as unknown as BrowserWindowLike);
    if (!ctx) throw new Error('No project context for this window');
    return {
      collabUrl: `ws://localhost:${ctx.port}/collab`,
      apiOrigin: ctx.apiOrigin,
      projectPath: ctx.projectPath,
      projectName: ctx.projectName,
      mode: 'editor' as const,
    };
  });

  handle('ok:project:list-recent', async () => {
    return annotateMissing(appState) as RecentProject[];
  });

  handle('ok:project:open', async (_event, request) => {
    await openProject(request.path);
    return undefined;
  });

  handle('ok:project:close', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !wm) return undefined;
    const ctx = wm.getContextForBrowserWindow(win as unknown as BrowserWindowLike);
    if (ctx) {
      wm.closeProjectWindow(ctx.projectPath);
    }
    return undefined;
  });
}

/**
 * Path to the Dock/app icon PNG. Rasterized from packages/app/public/favicon.svg
 * by `scripts/rasterize-icon.mjs` at postinstall time. In packaged builds,
 * electron-builder copies this file into the app bundle and generates .icns
 * from it (electron-builder.yml `icon:` key) — `app.dock.setIcon()` is a no-op
 * for the packaged case because Gatekeeper already knows the bundle's icon.
 * In dev mode, we set it at runtime so the Dock shows the real icon instead
 * of the generic Electron diamond.
 */
const ICON_PNG_PATH = join(__dirname, '..', '..', 'build', 'icon.png');

function installDockIcon() {
  if (process.platform !== 'darwin') return;
  if (app.isPackaged) return; // packaged build uses the bundle's .icns
  if (!existsSync(ICON_PNG_PATH)) {
    console.warn(
      '[main] skipping dock icon — build/icon.png missing (run `node scripts/rasterize-icon.mjs`)',
    );
    return;
  }
  try {
    const image = nativeImage.createFromPath(ICON_PNG_PATH);
    if (!image.isEmpty()) {
      app.dock?.setIcon(image);
    } else {
      console.warn('[main] dock icon image loaded empty; skipping', { ICON_PNG_PATH });
    }
  } catch (err) {
    console.warn('[main] dock icon install failed', { err: (err as Error).message });
  }
}

/**
 * Defensive CORS injector for localhost responses — bulletproofs the attach
 * path against older `ok start` CLI servers that predate the api-extension
 * CORS change. Background: the renderer origin (electron-vite dev server OR
 * `file://` in packaged builds) is cross-origin to the utility process's
 * `http://localhost:<port>`, so browser CORS policy applies to every `/api/*`
 * fetch. Our current server emits `Access-Control-Allow-Origin: *` natively,
 * but if an older CLI owns the `server.lock` (attach mode) it does NOT — every
 * sidebar load surfaces as "Could not reach server" even though `curl` shows
 * HTTP 200 + valid JSON.
 *
 * Two behaviors:
 *   1. Any localhost response missing `Access-Control-Allow-Origin` gets
 *      `*` + `Allow-Methods` + `Allow-Headers` injected. Safe because the
 *      server binds 127.0.0.1 only — no remote origin could ever reach it.
 *   2. A `405`/`404` to an `OPTIONS` preflight from such a server is rewritten
 *      to `204 No Content` with the CORS headers so POSTs with a JSON body
 *      (which trigger a preflight) don't fail before the real request fires.
 *
 * Both are gated on hostname (`localhost` / `127.0.0.1`) and on `hasAcao`
 * being false — we leave responses from CORS-aware servers (our current
 * api-extension + any future release) untouched.
 */
function installLocalhostCorsInjector() {
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['http://localhost:*/*', 'http://127.0.0.1:*/*'] },
    (details, callback) => {
      const headers: Record<string, string[]> = { ...(details.responseHeaders ?? {}) };
      const hasAcao = Object.keys(headers).some(
        (k) => k.toLowerCase() === 'access-control-allow-origin',
      );
      if (hasAcao) {
        callback({});
        return;
      }
      headers['Access-Control-Allow-Origin'] = ['*'];
      headers['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
      headers['Access-Control-Allow-Headers'] = ['Content-Type, Authorization'];
      const isPreflightReject =
        details.method === 'OPTIONS' && details.statusCode >= 400 && details.statusCode < 500;
      if (isPreflightReject) {
        callback({ responseHeaders: headers, statusLine: 'HTTP/1.1 204 No Content' });
        return;
      }
      callback({ responseHeaders: headers });
    },
  );
}

app.whenReady().then(() => {
  appState = loadAppState();
  installLocalhostCorsInjector();
  registerIpcHandlers();
  refreshApplicationMenu();
  installDockIcon();

  // D3 revised: every project open spawns a NEW editor window. App boot
  // restores the last-opened project (if any) into a fresh editor window OR
  // opens the Navigator if the user holds Option at launch (or no last project).
  const optionHeld = process.argv.includes('--navigator');
  if (appState.lastOpenedProject && !optionHeld && existsSync(appState.lastOpenedProject)) {
    void openProjectOrFallbackToNavigator(appState.lastOpenedProject);
  } else {
    openNavigator();
  }
});

app.on('window-all-closed', () => {
  // macOS convention — keep app running so Dock icon click can re-open Navigator.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // macOS Dock icon click while no windows visible — re-open Navigator.
  if (BrowserWindow.getAllWindows().length === 0) {
    openNavigator();
  }
});
