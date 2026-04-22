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
import { bootAutoUpdater, type StartAutoUpdaterHandle } from './auto-updater.ts';
import { promptForFolder } from './dialog-helpers.ts';
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

/**
 * Quarantine a corrupt `state.json` to a timestamped sibling and log so
 * operations can correlate "recents disappeared" reports to the corruption
 * event. Pure I/O — the return value is `emptyState()` either way; the
 * side effects are the log line and the `state.json.corrupt-<ts>` file.
 * Extracted so both the JSON-parse-failure branch and the schema-invalid
 * branch (Review Pass 4 Major #4) route through the same treatment.
 */
function quarantineCorruptState(statePath: string, reason: string, err?: unknown): void {
  console.warn('[main] state.json corrupt — quarantining and starting fresh', {
    reason,
    ...(err ? { err: (err as Error).message } : {}),
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
}

function loadAppState(): AppState {
  const statePath = join(app.getPath('userData'), 'state.json');
  if (!existsSync(statePath)) return emptyState();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(statePath, 'utf-8'));
  } catch (err) {
    // Unparseable JSON (truncated write, manual hand-edit gone wrong).
    quarantineCorruptState(statePath, 'unparseable-json', err);
    return emptyState();
  }
  // Schema-invalid (parseable JSON but wrong root type / missing required
  // fields). Review Pass 4 Major #4: route through the same quarantine
  // treatment as the unparseable branch so silent-fallback-on-corrupt-state
  // doesn't lose recents + M3 gates without a trace. Left-unquarantined
  // would re-arm Toast B on the next update for a version the user has
  // been running for months.
  const parsed = parseAppState(raw);
  if (!parsed) {
    quarantineCorruptState(statePath, 'schema-invalid');
    return emptyState();
  }
  return parsed;
}

/**
 * Persist app state atomically via the pure helper in `state-store.ts` —
 * separation so the atomic-write behavior can be unit-tested without
 * Electron's `app` module (`app.getPath('userData')` is the sole Electron
 * dependency). Returns the disk-persist success boolean so callers that
 * need it (M3 writeState rollback) can distinguish in-memory-only updates
 * from fully-persisted ones; callers that don't care get the same silent
 * behavior by ignoring the return.
 */
function saveAppState(state: AppState): boolean {
  return saveAppStateToDir(app.getPath('userData'), state);
}

let appState: AppState = emptyState();
let navigatorWindow: BrowserWindowLike | null = null;
let wm: WindowManager;
/**
 * M3 auto-updater handle — single instance per app launch. Wired at the
 * end of `app.whenReady()` and torn down on `app.on('will-quit')` per
 * parent D40 canonical shutdown ordering. Null before whenReady and
 * after destroy.
 */
let autoUpdaterHandle: StartAutoUpdaterHandle | null = null;

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

app.whenReady().then(async () => {
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

  // M3 auto-updater — wired as the LAST step in whenReady, after the window-
  // open branch (either openProjectOrFallbackToNavigator OR openNavigator).
  // F2 audit: not gated on createNavigatorWindow specifically — Navigator
  // only opens on the Option-held / no-last-project path, but the updater
  // must run on every boot path. `electron-updater` is imported dynamically
  // so unit tests that import main/index.ts indirectly don't pull in the
  // Electron-only runtime dependency.
  //
  // Routed through `bootAutoUpdater` — a thin testable wrapper that
  // centralizes the dynamic-import + startAutoUpdater try/catch contract
  // (Review Pass 4 Major #5). A silent dynamic-import failure (bundling
  // drift, corrupt node_modules, future Electron upgrade that desyncs the
  // electron-updater version) would leave the app session un-updateable
  // with no signal; the wrapper logs the failure at `error` level so
  // operators see it in the packaged-app console output and returns null
  // so `autoUpdaterHandle` stays null (destroy on will-quit no-ops).
  autoUpdaterHandle = await bootAutoUpdater(() => import('electron-updater'), {
    ipcMain,
    readState: () => appState,
    writeState: (next) => {
      // Rollback in-memory on disk-save failure so persistSafely-false in
      // auto-updater.ts truly means "no gate armed" (Review Pass 1
      // Finding #1). `saveAppStateToDir` returns a success boolean — on
      // failure it has already logged + cleaned up; we just revert the
      // in-memory commit and throw so persistSafely's catch registers
      // the failure, skips the broadcast, and leaves memory + disk
      // agreeing on "nothing armed." `saveAppStateToDir` itself never
      // throws, so the rollback path is reached purely via the return
      // value.
      const prev = appState;
      appState = next;
      const ok = saveAppState(appState);
      if (!ok) {
        appState = prev;
        throw new Error('saveAppState failed — rolled back in-memory state');
      }
    },
    // Target exactly one window per update event (D24 multi-window fix).
    // Prefer the currently-focused window so the toast lands on the window
    // the user is looking at; fall back to the first open window when none
    // is focused (e.g., editor minimized); return null when no window is
    // open so the broadcast helper no-ops.
    getPrimaryWindow: () => {
      const focused = BrowserWindow.getFocusedWindow();
      if (focused) return focused;
      const all = BrowserWindow.getAllWindows();
      return all[0] ?? null;
    },
    getAppVersion: () => app.getVersion(),
    isPackaged: app.isPackaged,
    forceDevBypass: process.env.OK_UPDATER_FORCE_DEV === '1',
    // Tier-2 smoke override: point the updater at a local mock HTTP server
    // that serves a hand-crafted `latest-mac.yml` + fake .zip with valid
    // sha512. Production leaves this unset and reads `publish: github`
    // from `app-update.yml`. Paired with `OK_UPDATER_FORCE_DEV=1` (above)
    // so the `checkForUpdates()` gate actually hits the network in a dev
    // build. See `packages/desktop/scripts/smoke-mock-update.mjs --keep-alive`
    // for the server side.
    feedUrl: process.env.OK_UPDATER_FEED_URL || undefined,
    // Toast B renderer-mount race (Review Pass 4 Major #1 part B) —
    // defer the dispatch until the primary window's renderer has
    // finished loading so its `<UpdateToast/>` subscribers are
    // attached. Without this, `webContents.send` sent from this very
    // `app.whenReady()` handler is dropped on the floor (Electron does
    // NOT buffer renderer-bound events before `did-finish-load`). If
    // the primary window has already loaded by the time Toast B fires
    // (rare — updater wires before loadURL resolves), fire immediately.
    whenRendererReady: (fn) => {
      // Three cases, all must deliver Toast B eventually because
      // `lastSeenVersion` has already advanced at the call site and the
      // AC7 contract ("user sees a toast on first launch post-update")
      // does not allow silent-drop (Review Pass 5 Minor #3 — close the
      // `lastSeenVersion`-advanced-but-broadcast-lost gap that the
      // original Pass 4 Major #1 fix left open for the no-window race).
      //
      //   1. Window exists + already loaded → fire immediately.
      //   2. Window exists + still loading  → wait for did-finish-load.
      //   3. No window yet                  → wait for the next
      //      `browser-window-created` event, then recurse into cases
      //      1/2 against the fresh window.
      //
      // Electron emits `browser-window-created` synchronously inside
      // `new BrowserWindow(opts)`; `once` self-detaches after the first
      // firing so this listener can't leak across future spawns. If
      // the user quits the app before any window ever opens (pathological
      // — macOS doesn't dispatch Cmd+Q without a window), the listener is
      // garbage-collected alongside the `app` object at process exit.
      const tryFire = (win: BrowserWindow): void => {
        if (win.webContents.isLoading()) {
          win.webContents.once('did-finish-load', fn);
        } else {
          fn();
        }
      };
      const focused = BrowserWindow.getFocusedWindow();
      const existing = focused ?? BrowserWindow.getAllWindows()[0] ?? null;
      if (existing) {
        tryFire(existing);
        return;
      }
      app.once('browser-window-created', (_event, createdWin) => {
        tryFire(createdWin as BrowserWindow);
      });
    },
  });
});

// F17 audit: cleared on `will-quit` (parent D40 canonical ordering — NOT
// `before-quit`, which fires earlier in the shutdown sequence). The handle
// is safe to call multiple times via `?.destroy()` in case of spurious
// will-quit emissions.
app.on('will-quit', () => {
  autoUpdaterHandle?.destroy();
  autoUpdaterHandle = null;
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
