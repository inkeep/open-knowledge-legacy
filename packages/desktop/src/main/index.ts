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
import {
  existsSync,
  promises as fsPromises,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { homedir as osHomedir, hostname as osHostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALL_EDITOR_IDS,
  detectInstalledEditors,
  EDITOR_TARGETS,
  readExistingMcpEntry,
  writeUserMcpConfigs,
} from '@inkeep/open-knowledge';
import { installUserSkill, isProcessAlive, readServerLock } from '@inkeep/open-knowledge-server';
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
import { sendToRenderer } from '../shared/ipc-send.ts';
import { bootAutoUpdater, type StartAutoUpdaterHandle } from './auto-updater.ts';
import {
  createBrokenSymlinkRepairHandler,
  getInstallStatus,
  installCli,
  uninstallCli,
} from './cli-install.ts';
import { createDebugIpc, type DebugIpcHandle } from './debug-ipc.ts';
import { promptForFolder } from './dialog-helpers.ts';
import {
  type DriverUtilityLike,
  isDriverBootSmokeMode,
  runDriverBootSmoke,
} from './driver-boot-smoke.ts';
import { handleDetectClaudeDesktop, handleDownloadAndOpen } from './ipc/install-skill.ts';
import { handleSeedApply, handleSeedPlan } from './ipc/seed.ts';
import {
  detectProtocol as detectProtocolImpl,
  recordHandoff as recordHandoffImpl,
  spawnCursor as spawnCursorImpl,
} from './ipc-handlers.ts';
import {
  type McpWiringCliSurface,
  type RunMcpWiringHandle,
  runMcpWiringOnFirstLaunch,
} from './mcp-wiring.ts';
import { installApplicationMenu } from './menu.ts';
import { createNavigatorWindow } from './navigator-window.ts';
import { handleShellOpenExternal } from './shell-allowlist.ts';
import {
  type AppState,
  addRecentProject,
  annotateMissing,
  emptyState,
  parseAppState,
  saveAppStateToDir,
} from './state-store.ts';
import { registerProtocolHandler } from './url-scheme.ts';
import { buildUtilityForkEnv } from './utility-fork-env.ts';
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
let debugIpc: DebugIpcHandle | null = null;
/**
 * M6b first-launch MCP consent handle. Armed by `runMcpWiringOnFirstLaunch`
 * inside `app.whenReady()` when the user-scoped marker is absent; torn down
 * on `app.on('will-quit')` so IPC handlers don't outlive the app. Null
 * when the wiring no-ops (marker present, dev mode, non-macOS, etc.).
 */
let mcpWiringHandle: RunMcpWiringHandle | null = null;

/**
 * electron-vite dev-server URL. Set by `electron-vite dev` at launch time.
 * When present, `loadURL(rendererDevUrl)` → live HMR via the Vite dev server
 * (configured in `electron.vite.config.ts` to serve `packages/app/`). When
 * absent (packaged / prod), fall back to `loadFile(rendererEntryPath)`.
 */
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL ?? null;

/**
 * Runtime gate for the debug keyring-smoke channel (SPEC D-M5-7). Returns true
 * when the app is not packaged (dev mode) OR the opt-in env var is set.
 */
function isDebugKeyringSmokeAllowed(): boolean {
  return !app.isPackaged || process.env.OK_DEBUG_KEYRING_SMOKE === '1';
}

function runDriverBootSmokeInProduction(): void {
  runDriverBootSmoke({
    fork: (entry) => utilityProcess.fork(entry, [], {}) as unknown as DriverUtilityLike,
    quit: () => {
      try {
        app.quit();
      } catch {
        // already quitting
      }
    },
    setTimeout: (fn, ms) => {
      setTimeout(fn, ms);
    },
    utilityEntryPath: join(__dirname, 'utility/server-entry.js'),
  });
}

/**
 * Appends the `--ok-debug-keyring-smoke=1` argv flag when the gate allows it,
 * so the preload can populate `bridge.debug` (SPEC D-M5-8). Preload reads the
 * flag via `parseArg` just like the other window-bound config fields.
 */
function withDebugFlagIfAllowed(args: readonly string[]): string[] {
  return isDebugKeyringSmokeAllowed() ? [...args, '--ok-debug-keyring-smoke=1'] : [...args];
}

function ensureDebugIpc(): DebugIpcHandle {
  if (debugIpc) return debugIpc;
  debugIpc = createDebugIpc({
    resolveUtility: (sender) => {
      const win = BrowserWindow.fromWebContents(sender as Electron.WebContents);
      if (!win || !wm) return null;
      const ctx = wm.getContextForBrowserWindow(win as unknown as BrowserWindowLike);
      return ctx?.utility ?? null;
    },
    isDebugAllowed: isDebugKeyringSmokeAllowed,
  });
  return debugIpc;
}

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
          additionalArguments: withDebugFlagIfAllowed(opts.additionalArguments),
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
      // Inject OK_ELECTRON_PROTOCOL_HOST=1 so the `preview-url.ts` helper
      // running inside this utility emits `openknowledge://` URLs for MCP
      // consumers instead of `http://localhost:...` (M4 SPEC AC8). CLI /
      // bunx invocations don't fork through here, so the flag never bleeds
      // into those consumers.
      const child = utilityProcess.fork(entry, [], {
        ...opts,
        env: buildUtilityForkEnv(process.env),
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
    // Canonicalize `windowsByPath` keys via realpath so a deep-link URL
    // carrying `realpathSync(contentDir)` (emitted by preview-url.ts) matches
    // a window opened via a symlinked project path. See window-manager.ts's
    // `canonicalizeKey` + `ProjectContext.canonicalKey` for the rationale.
    realpathSync: (p) => realpathSync(p),
    onUtilityMessage: (msg) => {
      ensureDebugIpc().handleUtilityMessage(msg);
    },
    onUtilityExit: (utility) => {
      ensureDebugIpc().cancelPendingForUtility(utility);
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
          additionalArguments: withDebugFlagIfAllowed(opts.additionalArguments),
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

async function openProject(projectPath: string, pendingDeepLinkDoc?: string) {
  ensureWindowManager();
  const ctx = await wm.createProjectWindow({ projectPath, pendingDeepLinkDoc });
  appState = addRecentProject(appState, ctx.projectPath, ctx.projectName);
  saveAppState(appState);
  // Keep File → Open Recent current. Menu rebuild is cheap (<1ms) and
  // Electron expects this pattern — there's no per-item mutation API.
  refreshApplicationMenu();
}

async function openProjectOrFallbackToNavigator(projectPath: string, pendingDeepLinkDoc?: string) {
  try {
    await openProject(projectPath, pendingDeepLinkDoc);
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
    // M6a (D52) CLI-on-PATH menu item. Probe returns `null` on non-darwin so
    // the menu item is hidden; otherwise returns 'installed' / 'not-installed'
    // / 'broken' per `getInstallStatus`. The exe path probed is `app.getPath('exe')`
    // which in dev mode is the electron binary, not a packaged bundle — `wrapperPathInBundle`
    // returns a path that doesn't exist, so `getInstallStatus` reports 'not-installed'
    // and clicking the menu item fires the "wrapper-missing" dialog (AC1.3 self-protective).
    cliInstallStatus: () =>
      process.platform === 'darwin' ? getInstallStatus(app.getPath('exe')) : null,
    // Toggle dispatches the install / uninstall flow then rebuilds the menu
    // so the label flip takes effect. Mirrors the `clearRecentProjects`
    // pattern at line 376: the deps function owns its own follow-up refresh.
    toggleCliInstall: async () => {
      const executablePath = app.getPath('exe');
      const status = getInstallStatus(executablePath);
      const deps = { executablePath, dialog };
      try {
        if (status === 'installed') {
          await uninstallCli(deps);
        } else {
          await installCli(deps);
        }
      } catch (err) {
        // installCli/uninstallCli handle their own admin-cancel + failure
        // dialogs internally (see cli-install.ts) — `AdminFailureError`
        // paths show their own modal. Uncaught throws reaching here mean
        // something pre-`runAsAdmin` (EACCES from existsSync, malformed
        // executablePath, a future edge case). Surface those to the user
        // so they see a signal instead of "menu does nothing" (Pass 0
        // Minor #20). `showErrorBox` is sync and self-contained; operators
        // still get the console trace for debugging.
        const message = err instanceof Error ? err.message : String(err);
        console.error('[main] toggleCliInstall failed', { err: message });
        dialog.showErrorBox(
          'Install Command-Line Tools failed',
          `Open Knowledge couldn't complete the Command-Line Tools ${status === 'installed' ? 'uninstall' : 'install'}:\n\n${message}`,
        );
      }
      refreshApplicationMenu();
    },
    // Pass 2 Major #5 — File → "Configure AI Tool Integrations…" re-trigger
    // for M6b consent. Only plumb the dep on darwin + packaged builds;
    // non-macOS has no MCP wiring, and dev-mode explicitly contaminates
    // the developer's real configs (D-M6-R7) — both should hide the row.
    // The handler tears down any prior mcpWiringHandle then arms a fresh
    // one with `forceShow: true` so the marker-present gate is bypassed.
    reconfigureMcpWiring:
      process.platform === 'darwin' && app.isPackaged
        ? async () => {
            mcpWiringHandle?.destroy();
            mcpWiringHandle = null;
            try {
              mcpWiringHandle = armMcpWiring({ forceShow: true });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.error('[main] reconfigureMcpWiring failed', { err: message });
              dialog.showErrorBox(
                'Configure AI Tool Integrations failed',
                `Open Knowledge couldn't re-arm the MCP consent dialog:\n\n${message}`,
              );
            }
          }
        : undefined,
  }).catch((err) => {
    console.error('[main] installApplicationMenu failed', { err: (err as Error).message });
  });
}

/**
 * Launch-time broken-symlink repair prompt (G5 / AC1.6).
 *
 * Full handler logic + guards live in
 * `createBrokenSymlinkRepairHandler` (`cli-install.ts`) — extracted per
 * Pass 1 Major #4 to unlock unit coverage for this privilege-adjacent
 * path. This function just binds Electron globals to the factory.
 *
 * Fires on every app launch while `getInstallStatus` reports 'broken' — the
 * drag-to-Trash-then-reinstall case. The per-boot (not per-bundle) firing
 * matches spec AC1.6 ("one-time-per-session"); recovery is the user's
 * Repair action OR moving the `.app` back into place, not a persistent
 * dismiss token. Dev mode is gated out because `app.getPath('exe')` in dev
 * resolves to the electron binary (not a packaged bundle); a prior DMG's
 * symlinks would always classify 'broken' relative to the dev exe, and the
 * Repair branch would install dev-path symlinks into the user's system
 * (STOP_IF (e) analogue for M6a).
 */
/**
 * Arm M6b first-launch MCP consent. Extracted as a helper so both the
 * `app.whenReady()` path (once-per-boot marker-respecting) AND the
 * "Configure AI Tool Integrations…" File menu path (forceShow, ignores
 * prior marker) share one wiring definition. The cli surface is
 * imported via the published-package name `@inkeep/open-knowledge` so
 * turbo's `^build` topology correctly invalidates desktop's cache when
 * CLI internals change.
 */
function armMcpWiring(opts: { forceShow?: boolean } = {}): RunMcpWiringHandle {
  const mcpWiringCli: McpWiringCliSurface = {
    detectInstalledEditors: (cwd, home) => detectInstalledEditors(cwd, home),
    writeUserMcpConfigs: (writeOpts) => writeUserMcpConfigs(writeOpts),
    readExistingMcpEntry: (editorId, home) =>
      readExistingMcpEntry(EDITOR_TARGETS[editorId], '', home),
    allEditorIds: ALL_EDITOR_IDS,
    editorTargets: EDITOR_TARGETS,
  };
  return runMcpWiringOnFirstLaunch({
    isPackaged: app.isPackaged,
    executablePath: app.getPath('exe'),
    home: osHomedir(),
    platform: process.platform,
    ipcMain,
    cli: mcpWiringCli,
    forceEnv: process.env.OK_M6B_FORCE ?? null,
    forceShow: opts.forceShow ?? false,
  });
}

function maybeOfferBrokenSymlinkRepair(): Promise<void> {
  const handler = createBrokenSymlinkRepairHandler({
    executablePath: app.getPath('exe'),
    platform: process.platform,
    isPackaged: app.isPackaged,
    dialog,
    install: installCli,
    refreshMenu: refreshApplicationMenu,
    // Per-bundle dismissal token (Pass 2 Major #3). `app.getVersion()`
    // advances on auto-update; `app.getPath('exe')` shifts on app-move;
    // either case rebuilds the token so the modal re-fires exactly once
    // against the new bundle. The in-memory `appState` is the authoritative
    // read + write surface; `saveAppState` persists atomically.
    appVersion: app.getVersion(),
    getDismissedToken: () => appState.dismissedRepairForBundle,
    setDismissedToken: (token) => {
      appState = { ...appState, dismissedRepairForBundle: token };
      saveAppState(appState);
    },
  });
  return handler();
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

  const shellOpenExternal = handleShellOpenExternal({
    openExternal: (url) => shell.openExternal(url),
  });
  handle('ok:shell:open-external', async (_event, url) => {
    await shellOpenExternal(url);
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

  handle('ok:shell:spawn-cursor', async (event, path) => {
    // Scope the spawn to the caller window's project directory (Review M5).
    // A BrowserWindow without a ProjectContext (e.g. the Navigator, before it
    // spawns an editor) should never reach this handler, but we treat that
    // case as "no project scope" — a missing `projectPath` passes through to
    // `spawnCursorImpl` which gates on the presence of the field. The
    // validateSpawnPath + isPathWithinProject checks inside the impl refuse
    // any out-of-scope path when a project IS bound.
    const callerWin = BrowserWindow.fromWebContents(event.sender);
    const callerProjectPath =
      callerWin && wm
        ? wm.getContextForBrowserWindow(callerWin as unknown as BrowserWindowLike)?.projectPath
        : undefined;
    return spawnCursorImpl(
      {
        platform: process.platform,
        projectPath: callerProjectPath,
        getApplicationInfoForProtocol: (url) => app.getApplicationInfoForProtocol(url),
        spawn: (exec, args, timeoutMs) =>
          new Promise((resolve) => {
            try {
              const child = spawn(exec, [...args], {
                shell: false,
                timeout: timeoutMs,
                stdio: ['ignore', 'ignore', 'pipe'],
              });
              // Drain stderr so a chatty child can't block on a full pipe buffer.
              child.stderr?.on('data', () => {});
              // `spawn` event fires once the process is successfully launched —
              // that's the success criterion per SPEC (not a clean exit). The
              // macOS `/usr/bin/open` helper exits immediately after handing
              // off to Launch Services, but the `spawn` event still resolves
              // before exit, so this remains correct under the open-a routing.
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

  handle('ok:shell:record-handoff', async (_event, line) => {
    await recordHandoffImpl(
      {
        homedir: osHomedir,
        appendFile: (path, content) => fsPromises.appendFile(path, content, 'utf-8'),
        mkdir: (path) => fsPromises.mkdir(path, { recursive: true }).then(() => undefined),
      },
      line,
    );
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

  handle('ok:debug:keyring-smoke', async (event) => {
    return ensureDebugIpc().requestKeyringSmoke(event.sender);
  });

  // `ok seed` — project-level scaffolder. Pure plan/apply handlers scoped to
  // the invoking window's ProjectContext (same pattern as `ok:shell:spawn-cursor`).
  // See packages/desktop/src/main/ipc/seed.ts + SPEC 2026-04-23-ok-seed-scaffold.
  const resolveSeedProjectRoot = (event: Electron.IpcMainInvokeEvent): string | undefined => {
    const callerWin = BrowserWindow.fromWebContents(event.sender);
    return callerWin && wm
      ? wm.getContextForBrowserWindow(callerWin as unknown as BrowserWindowLike)?.projectPath
      : undefined;
  };
  handle('ok:seed:plan', async (event) => {
    return handleSeedPlan({ resolveProjectRoot: () => resolveSeedProjectRoot(event) });
  });
  handle('ok:seed:apply', async (event, plan) => {
    return handleSeedApply({ resolveProjectRoot: () => resolveSeedProjectRoot(event) }, plan);
  });

  // Cowork skill install-dialog IPC — SPEC 2026-04-24 Ship 1e. Two channels:
  // (1) detect Claude Desktop's presence (gate for showing the Install CTA),
  // (2) download + invoke OS file association (the 2-click UX payload).
  // See packages/desktop/src/main/ipc/install-skill.ts.
  handle('ok:skill:detect-claude-desktop', async () => {
    return handleDetectClaudeDesktop();
  });
  handle('ok:skill:download-and-open', async (_event, url) => {
    return handleDownloadAndOpen({ app, shell }, url);
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

// Single-instance lock (M4) — required for `app.on('second-instance')` to
// fire AND to prevent a duplicate OK.app launch from racing state.json +
// server.lock with the primary. A duplicate launch that carries an
// `openknowledge://` URL in argv (`OK.app/Contents/MacOS/Open Knowledge
// openknowledge://...`) relinquishes the lock; Electron then dispatches its
// argv to the primary via the `second-instance` listener registered below.
// If we fail to acquire the lock we ARE the duplicate — exit without
// registering any of the boot-time handlers below.
//
// AC8 driver-mode exception (SPEC M5 D-M5-9): when the env triplet
// `OK_DEBUG_KEYRING_SMOKE=1 + OK_DEBUG_KEYRING_SMOKE_EXIT=1` is set, the
// packaged app is being launched by the `verify-keyring-in-packaged-dmg.mjs`
// driver for a creds-free packaged-DMG smoke. Short-circuit at the top of
// boot — spawn a standalone utility, wait for its auto-smoke + self-exit,
// then `app.quit()`. No single-instance lock, no Navigator, no window
// creation. The utility's auto-smoke writes `KeyringSmokeResult` JSON to
// `OK_DEBUG_KEYRING_SMOKE_OUT` before exiting; the driver reads the file.
if (isDriverBootSmokeMode(process.env)) {
  app.whenReady().then(() => {
    runDriverBootSmokeInProduction();
  });
} else {
  const GOT_SINGLE_INSTANCE_LOCK = app.requestSingleInstanceLock();
  if (!GOT_SINGLE_INSTANCE_LOCK) {
    app.quit();
  }

  if (GOT_SINGLE_INSTANCE_LOCK) {
    bootPrimaryInstance();
  }
}

function bootPrimaryInstance(): void {
  // URL-scheme handler (M4) — register BEFORE `whenReady` so macOS cold-start
  // `open-url` Apple Events are caught even if they fire before the ready hook.
  // Listener registration is synchronous; the actual routing defers URLs into a
  // queue and drains them after `whenReady` + the first BrowserWindow exists.
  // Also wires `second-instance` for CLI / dev invocations that deliver the URL
  // via argv rather than Apple Events.
  registerProtocolHandler({
    app: {
      on: (event, cb) => {
        // electron's `app.on` is overloaded — inject our typed shape by casting at
        // the call site. The `url-scheme` module owns the narrowing; this is just
        // the dispatch plumbing.
        app.on(event as Parameters<typeof app.on>[0], cb as Parameters<typeof app.on>[1]);
      },
      whenReady: () => app.whenReady(),
      isPackaged: app.isPackaged,
      setAsDefaultProtocolClient: (scheme) => app.setAsDefaultProtocolClient(scheme),
      removeAsDefaultProtocolClient: (scheme) => app.removeAsDefaultProtocolClient(scheme),
    },
    focusWindowForProject: (projectPath) => {
      if (!wm) return null;
      return wm.focusWindowForProject(projectPath) as unknown as object | null;
    },
    openProject: async (projectPath, opts) => {
      // Use the Navigator-fallback path: on failure (bad path, git-init error,
      // stale lock) the user sees a dialog and is returned to the Navigator
      // rather than a silent "link doesn't work." Success path returns the
      // BrowserWindow so the caller can dispatch `ok:deep-link`.
      //
      // `pendingDeepLinkDoc` threads through `wm.createProjectWindow`, which
      // registers `webContents.once('dom-ready', ...)` BEFORE `loadURL` awaits
      // — co-located with git-init-notice. The caller (url-scheme.ts routeUrl)
      // therefore does NOT call `sendDeepLink` after this resolves; delivery
      // happens inside the window-manager hook.
      await openProjectOrFallbackToNavigator(projectPath, opts?.pendingDeepLinkDoc);
      const ctx = wm?.getWindowFor(projectPath);
      if (!ctx) {
        // The fallback ran — dialog shown, Navigator reopened. Return null so
        // the caller knows the spawn failed (nothing to dispatch).
        return null;
      }
      return ctx.window as unknown as object;
    },
    sendDeepLink: (win, payload) => {
      const w = win as BrowserWindowLike;
      sendToRenderer(w.webContents, 'ok:deep-link', payload);
    },
    getAnyReadyWindow: () => {
      const first = BrowserWindow.getAllWindows()[0];
      return first ? (first as unknown as object) : null;
    },
    getInitialArgv: () => process.argv,
    log: {
      warn: (obj, msg) => console.warn(msg, obj),
      info: (obj, msg) => console.info(msg, obj),
    },
  });

  app.whenReady().then(async () => {
    appState = loadAppState();
    installLocalhostCorsInjector();
    registerIpcHandlers();
    refreshApplicationMenu();
    installDockIcon();

    // M6a launch-time repair hook (G5 / AC1.6). Fires once per boot; dev-
    // mode + non-darwin short-circuit inside `maybeOfferBrokenSymlinkRepair`.
    // Dispatched fire-and-forget so a pending dialog doesn't hold up window
    // open — the dialog is parentless and can stack over the Navigator or
    // editor window that opens a few lines below.
    void maybeOfferBrokenSymlinkRepair().catch((err) => {
      console.error('[main] broken-symlink repair prompt failed', {
        err: (err as Error).message,
      });
    });

    // M6b first-launch MCP consent (D-M6-R1 / D-M6-R7 / D-M6-R8 / D-M6-R10).
    // Armed before the window-open branch so the `ok:mcp-wiring:renderer-ready`
    // listener is installed BEFORE any renderer could possibly fire it —
    // otherwise a fast `did-finish-load` → React-mount would race and the
    // ack event lands on a dead channel. `runMcpWiringOnFirstLaunch` no-ops
    // (returns an inert handle) when the platform is non-darwin, the app is
    // in dev mode without `OK_M6B_FORCE=1`, the user-scoped marker is present,
    // or `app.getPath('exe')` doesn't match the bundle shape. The cli surface
    // is imported via the published-package name `@inkeep/open-knowledge` so
    // turbo's `^build` topology correctly invalidates desktop's cache when CLI
    // internals change (Pass 0 Major #2). Rollup tree-shakes unused CLI code
    // at electron-vite build time, keeping the DMG bundle size bounded.
    mcpWiringHandle = armMcpWiring();

    // D3 revised: every project open spawns a NEW editor window. App boot
    // restores the last-opened project (if any) into a fresh editor window OR
    // opens the Navigator if the user holds Option at launch (or no last project).
    const optionHeld = process.argv.includes('--navigator');
    if (appState.lastOpenedProject && !optionHeld && existsSync(appState.lastOpenedProject)) {
      void openProjectOrFallbackToNavigator(appState.lastOpenedProject);
    } else {
      openNavigator();
    }

    // Fire-and-forget user-global Agent Skill install per SPEC 2026-04-22
    // (FR13 / D21). Runs on every launch — idempotent via the sidecar at
    // `~/.open-knowledge/skill-installed-version`, so the no-op path is
    // ~50 ms when current. Never awaited so window rendering + menu are
    // unblocked. Failures log to main-process console and never surface to
    // the user.
    void installUserSkill({
      logger: {
        warn: (data, message) => console.warn(message, data),
        info: (data, message) => console.info(message, data),
      },
    }).catch(() => {
      /* installUserSkill is documented as never-throws; this is defense
         against a future regression that would otherwise crash the main
         process during the floating microtask. */
    });

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
    mcpWiringHandle?.destroy();
    mcpWiringHandle = null;
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
} // end bootPrimaryInstance
