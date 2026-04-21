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

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, utilityProcess } from 'electron';
import type { RecentProject } from '../shared/ipc-channels.ts';
import { createHandler } from '../shared/ipc-handler.ts';
import { installApplicationMenu } from './menu.ts';
import { createNavigatorWindow } from './navigator-window.ts';
import { checkOutboundUrl } from './shell-allowlist.ts';
import {
  type AppState,
  addRecentProject,
  annotateMissing,
  emptyState,
  parseAppState,
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
 * Persist app state atomically. Writes to a `.tmp-<pid>-<ms>` sibling first,
 * then renames — so a crash mid-write leaves either the prior file intact OR
 * the fully-formed new file, never a half-written blob that `loadAppState`'s
 * quarantine path would discard.
 *
 * A failure here logs but does NOT throw. The caller (IPC handler or
 * `before-quit` flush) should not bring down the app because a recents-list
 * save failed.
 */
function saveAppState(state: AppState) {
  const userDataDir = app.getPath('userData');
  try {
    if (!existsSync(userDataDir)) mkdirSync(userDataDir, { recursive: true });
    const statePath = join(userDataDir, 'state.json');
    const tmpPath = `${statePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      writeFileSync(tmpPath, JSON.stringify(state, null, 2));
      renameSync(tmpPath, statePath);
    } catch (err) {
      console.error('[main] saveAppState failed', { err: (err as Error).message, statePath });
      try {
        unlinkSync(tmpPath);
      } catch {
        // tmp file may not exist — best-effort cleanup.
      }
    }
  } catch (err) {
    console.error('[main] saveAppState userData setup failed', {
      err: (err as Error).message,
      userDataDir,
    });
  }
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
  // Utility entry: electron-vite builds it into out/utility/server-entry.js.
  const utilityEntryPath = join(__dirname, '../utility/server-entry.js');

  wm = new WindowManager({
    createWindow: (opts) => {
      const win = new BrowserWindow({
        ...DEFAULT_WIN_OPTS,
        webPreferences: {
          ...DEFAULT_WIN_OPTS.webPreferences,
          additionalArguments: opts.additionalArguments,
          preload: join(__dirname, '../preload/index.js'),
        },
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
    console.error('[main] openProject failed, falling back to Navigator', {
      projectPath,
      err: (err as Error).message,
    });
    openNavigator();
  }
}

/**
 * Rebuild the application menu. Called on app boot AND whenever the recent-
 * projects list changes, so File → Open Recent stays current.
 */
function refreshApplicationMenu() {
  installApplicationMenu({
    openNavigator,
    openProject: openProjectOrFallbackToNavigator,
    getRecentProjects: () => appState.recentProjects,
    clearRecentProjects: () => {
      appState = { ...appState, recentProjects: [] };
      saveAppState(appState);
      refreshApplicationMenu();
    },
  });
}

function registerIpcHandlers() {
  const handle = createHandler(ipcMain);

  handle('ok:dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  handle('ok:dialog:create-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  handle('ok:shell:open-external', async (_event, url) => {
    const check = checkOutboundUrl(url);
    if (!check.ok) {
      throw new Error(`shell.openExternal blocked: ${check.reason}`);
    }
    await shell.openExternal(url);
    return undefined;
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

app.whenReady().then(() => {
  appState = loadAppState();
  registerIpcHandlers();
  refreshApplicationMenu();

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
