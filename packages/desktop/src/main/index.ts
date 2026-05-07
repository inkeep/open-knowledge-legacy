import { spawn } from 'node:child_process';
import {
  existsSync,
  promises as fsPromises,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { homedir as osHomedir, hostname as osHostname } from 'node:os';
import { join } from 'node:path';
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
  Menu,
  nativeImage,
  session,
  shell,
  utilityProcess,
} from 'electron';
import type { RecentProject } from '../shared/ipc-channels.ts';
import { createHandler } from '../shared/ipc-handler.ts';
import { sendToRenderer } from '../shared/ipc-send.ts';
import { openAssetSafely, revealAssetSafely } from './asset-allowlist.ts';
import { popAssetMenu } from './asset-menu.ts';
import { attachAssetSafetyNet } from './asset-safety-net.ts';
import { bootAutoUpdater, type StartAutoUpdaterHandle } from './auto-updater.ts';
import {
  createBrokenSymlinkRepairHandler,
  getInstallStatus,
  installCli,
  uninstallCli,
  wrapperPathInBundle,
} from './cli-install.ts';
import { createDebugIpc, type DebugIpcHandle } from './debug-ipc.ts';
import { promptForFolder } from './dialog-helpers.ts';
import {
  type DriverUtilityLike,
  isDriverBootSmokeMode,
  runDriverBootSmoke,
} from './driver-boot-smoke.ts';
import { handleBuildAndOpen, handleDetectClaudeDesktop } from './ipc/install-skill.ts';
import {
  createLocalOpState,
  handleAuthCancel,
  handleAuthRepos,
  handleAuthStart,
  handleAuthStatus,
  handleCloneCancel,
  handleCloneStart,
  type LocalOpDeps,
} from './ipc/local-op.ts';
import { handleSeedApply, handleSeedPlan } from './ipc/seed.ts';
import {
  detectProtocol as detectProtocolImpl,
  recordHandoff as recordHandoffImpl,
  showItemInFolder as showItemInFolderImpl,
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
  evaluateSchemaCompatibility,
  getProjectSessionState,
  MAX_SUPPORTED_SCHEMA_VERSION,
  parseAppState,
  type SchemaIncompatibilityDiagnostic,
  saveAppStateToDir,
  setProjectSessionState,
} from './state-store.ts';
import {
  applyConfirmDowngrade,
  applyResetIncompatible,
  applySetChannel,
  applyStateQuery,
  type UpdateStateHandlerDeps,
} from './update-state-handlers.ts';
import { registerProtocolHandler } from './url-scheme.ts';
import { buildUtilityForkEnv } from './utility-fork-env.ts';
import {
  type BrowserWindowLike,
  type UtilityProcessLike,
  WindowManager,
} from './window-manager.ts';

const DEFAULT_WIN_OPTS = {
  width: 1280,
  height: 800,
  show: false,
  backgroundColor: '#171717',
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
};

function probeWsUpgrade(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolveProbe) => {
    let settled = false;
    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {}
      resolveProbe(ok);
    };
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => settle(true));
    ws.addEventListener('close', () => settle(false));
    ws.addEventListener('error', () => settle(false));
    setTimeout(() => settle(false), timeoutMs);
  });
}

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
    quarantineCorruptState(statePath, 'unparseable-json', err);
    return emptyState();
  }
  const parsed = parseAppState(raw);
  if (!parsed) {
    quarantineCorruptState(statePath, 'schema-invalid');
    return emptyState();
  }
  return parsed;
}

function saveAppState(state: AppState): boolean {
  return saveAppStateToDir(app.getPath('userData'), state);
}

let appState: AppState = emptyState();
let pendingSchemaIncompatibility: SchemaIncompatibilityDiagnostic | null = null;
export function getPendingSchemaIncompatibility(): SchemaIncompatibilityDiagnostic | null {
  return pendingSchemaIncompatibility;
}
export function clearPendingSchemaIncompatibility(): void {
  pendingSchemaIncompatibility = null;
}
let navigatorWindow: BrowserWindowLike | null = null;
let wm: WindowManager;
let autoUpdaterHandle: StartAutoUpdaterHandle | null = null;
let debugIpc: DebugIpcHandle | null = null;
let mcpWiringHandle: RunMcpWiringHandle | null = null;

const rendererDevUrl = process.env.ELECTRON_RENDERER_URL ?? null;

function isDebugKeyringSmokeAllowed(): boolean {
  return !app.isPackaged || process.env.OK_DEBUG_KEYRING_SMOKE === '1';
}

function runDriverBootSmokeInProduction(): void {
  runDriverBootSmoke({
    fork: (entry) => utilityProcess.fork(entry, [], {}) as unknown as DriverUtilityLike,
    quit: () => {
      try {
        app.quit();
      } catch {}
    },
    setTimeout: (fn, ms) => {
      setTimeout(fn, ms);
    },
    utilityEntryPath: join(__dirname, 'utility/server-entry.js'),
  });
}

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
  const rendererEntryPath = app.isPackaged
    ? join(process.resourcesPath, 'app', 'index.html')
    : join(__dirname, '../renderer/index.html');
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
      win.on('page-title-updated', (e) => {
        e.preventDefault();
      });
      return win as unknown as BrowserWindowLike;
    },
    forkUtility: (entry, opts) => {
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
    readServerLock: (lockDir) => readServerLock(lockDir),
    isProcessAlive: (pid) => isProcessAlive(pid),
    hostname: () => osHostname(),
    probeWsUpgrade: (url, timeoutMs) => probeWsUpgrade(url, timeoutMs),
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
  attachAssetSafetyNet(ctx.window.webContents, {
    editorOrigin: ctx.apiOrigin,
    openAsset: (relPath) =>
      openAssetSafely(
        {
          projectPath: ctx.projectPath,
          platform: process.platform,
          openPath: (canonical) => shell.openPath(canonical),
        },
        relPath,
      ),
    openExternal: handleShellOpenExternal({
      openExternal: (url) => shell.openExternal(url),
    }),
  });
  appState = addRecentProject(appState, ctx.projectPath, ctx.projectName);
  saveAppState(appState);
  refreshApplicationMenu();
}

async function openProjectOrFallbackToNavigator(projectPath: string, pendingDeepLinkDoc?: string) {
  try {
    await openProject(projectPath, pendingDeepLinkDoc);
  } catch (err) {
    const errorMessage = (err as Error).message;
    const kind = (err as Error & { kind?: string }).kind;
    const holderPid = (err as Error & { holderPid?: number }).holderPid;
    console.error('[main] openProject failed, falling back to Navigator', {
      projectPath,
      kind,
      err: errorMessage,
    });
    let dialogTitle = 'Unable to open project';
    let dialogBody = `${projectPath}\n\n${errorMessage}`;
    if (kind === 'mcp-server-stuck') {
      dialogTitle = "Couldn't reclaim project lock";
      dialogBody =
        `${projectPath}\n\n` +
        `Another process${typeof holderPid === 'number' ? ` (pid ${holderPid})` : ''} ` +
        `is holding the server lock and didn't release it after a SIGTERM. ` +
        `Quit it manually and try again, or restart Open Knowledge.`;
    } else if (kind === 'lock-collision') {
      dialogTitle = 'Open Knowledge is already running for this project';
      dialogBody = `${projectPath}\n\n${errorMessage}`;
    }
    dialog.showErrorBox(dialogTitle, dialogBody);
    openNavigator();
  }
}

function refreshApplicationMenu() {
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
    openExternalUrl: (url: string) => {
      void shell.openExternal(url);
    },
    cliInstallStatus: () =>
      process.platform === 'darwin' ? getInstallStatus(app.getPath('exe')) : null,
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
        const message = err instanceof Error ? err.message : String(err);
        console.error('[main] toggleCliInstall failed', { err: message });
        dialog.showErrorBox(
          'Install Command-Line Tools failed',
          `Open Knowledge couldn't complete the Command-Line Tools ${status === 'installed' ? 'uninstall' : 'install'}:\n\n${message}`,
        );
      }
      refreshApplicationMenu();
    },
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
    openInstallSkillDialog: () => {
      const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      if (!target) return;
      target.webContents.executeJavaScript(
        "window.location.hash = '#install-claude-desktop'; undefined",
      );
    },
    openSettings: () => {
      const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      if (!target) return;
      target.webContents.executeJavaScript("window.location.hash = '#settings'; undefined");
    },
  }).catch((err) => {
    console.error('[main] installApplicationMenu failed', { err: (err as Error).message });
  });
}

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
              child.stderr?.on('data', () => {});
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

  handle('ok:shell:open-asset', async (event, relPath) => {
    const callerWin = BrowserWindow.fromWebContents(event.sender);
    const callerProjectPath =
      callerWin && wm
        ? wm.getContextForBrowserWindow(callerWin as unknown as BrowserWindowLike)?.projectPath
        : undefined;
    if (!callerProjectPath) {
      return { ok: false, reason: 'path-escape' } as const;
    }
    return openAssetSafely(
      {
        projectPath: callerProjectPath,
        platform: process.platform,
        openPath: (canonical) => shell.openPath(canonical),
      },
      relPath,
    );
  });

  handle('ok:shell:reveal-asset', async (event, relPath) => {
    const callerWin = BrowserWindow.fromWebContents(event.sender);
    const callerProjectPath =
      callerWin && wm
        ? wm.getContextForBrowserWindow(callerWin as unknown as BrowserWindowLike)?.projectPath
        : undefined;
    if (!callerProjectPath) {
      return { ok: false, reason: 'path-escape' } as const;
    }
    return revealAssetSafely(
      {
        projectPath: callerProjectPath,
        platform: process.platform,
        showItemInFolder: (canonical) => shell.showItemInFolder(canonical),
      },
      relPath,
    );
  });

  handle('ok:shell:show-asset-menu', async (event, params) => {
    const callerWin = BrowserWindow.fromWebContents(event.sender);
    if (!callerWin || !wm) return undefined;
    const projectPath = wm.getContextForBrowserWindow(
      callerWin as unknown as BrowserWindowLike,
    )?.projectPath;
    if (!projectPath) return undefined;
    popAssetMenu(
      {
        Menu,
        window: callerWin,
      },
      {
        kind: params.kind,
        platform: process.platform,
        actions: {
          reveal: async () => {
            await revealAssetSafely(
              {
                projectPath,
                platform: process.platform,
                showItemInFolder: (canonical) => shell.showItemInFolder(canonical),
              },
              params.relPath,
            );
          },
          openInDefault: async () => {
            await openAssetSafely(
              {
                projectPath,
                platform: process.platform,
                openPath: (canonical) => shell.openPath(canonical),
              },
              params.relPath,
            );
          },
          copyLink: () => {
            clipboard.writeText(params.relPath);
          },
        },
      },
    );
    return undefined;
  });

  handle('ok:shell:show-item-in-folder', async (event, path) => {
    const callerWin = BrowserWindow.fromWebContents(event.sender);
    const callerProjectPath =
      callerWin && wm
        ? wm.getContextForBrowserWindow(callerWin as unknown as BrowserWindowLike)?.projectPath
        : undefined;
    const result = showItemInFolderImpl(
      {
        platform: process.platform,
        projectPath: callerProjectPath,
        showItemInFolder: (p) => shell.showItemInFolder(p),
      },
      path,
    );
    if (!result.ok) {
      console.warn('[main] show-item-in-folder refused', { reason: result.reason });
    }
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

  handle('ok:project:get-session-state', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !wm) return { openTabs: [], activeDocName: null, updatedAt: null };
    const ctx = wm.getContextForBrowserWindow(win as unknown as BrowserWindowLike);
    if (!ctx) return { openTabs: [], activeDocName: null, updatedAt: null };
    return getProjectSessionState(appState, ctx.projectPath);
  });

  handle('ok:project:set-session-state', async (event, state) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !wm) return undefined;
    const ctx = wm.getContextForBrowserWindow(win as unknown as BrowserWindowLike);
    if (!ctx) return undefined;
    appState = setProjectSessionState(appState, ctx.projectPath, state);
    saveAppState(appState);
    return undefined;
  });

  handle('ok:project:open', async (_event, request) => {
    await openProjectOrFallbackToNavigator(request.path);
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

  handle('ok:navigator:open', async () => {
    openNavigator();
    return undefined;
  });

  const updateStateDeps = (): UpdateStateHandlerDeps => ({
    getAppState: () => appState,
    setAppState: (s) => {
      appState = s;
    },
    saveAppState,
    setUpdaterChannel: (channel) => {
      autoUpdaterHandle?.setChannel(channel);
    },
    confirmDowngrade: async () => {
      if (!autoUpdaterHandle) {
        throw new Error('Auto-updater is not available — please restart the app');
      }
      await autoUpdaterHandle.confirmDowngrade();
    },
    getPendingSchemaIncompatibility,
    clearPendingSchemaIncompatibility,
  });
  handle('ok:update:set-channel', async (_event, request) =>
    applySetChannel(updateStateDeps(), request),
  );
  handle('ok:update:confirm-downgrade', async () => applyConfirmDowngrade(updateStateDeps()));
  handle('ok:state:reset-incompatible', async () => applyResetIncompatible(updateStateDeps()));
  handle('ok:state:query', async () => applyStateQuery(updateStateDeps()));

  handle('ok:debug:keyring-smoke', async (event) => {
    return ensureDebugIpc().requestKeyringSmoke(event.sender);
  });

  const resolveSeedProjectRoot = (event: Electron.IpcMainInvokeEvent): string | undefined => {
    const callerWin = BrowserWindow.fromWebContents(event.sender);
    return callerWin && wm
      ? wm.getContextForBrowserWindow(callerWin as unknown as BrowserWindowLike)?.projectPath
      : undefined;
  };
  handle('ok:seed:plan', async (event, rootDir) => {
    return handleSeedPlan({ resolveProjectRoot: () => resolveSeedProjectRoot(event) }, rootDir);
  });
  handle('ok:seed:apply', async (event, plan) => {
    return handleSeedApply({ resolveProjectRoot: () => resolveSeedProjectRoot(event) }, plan);
  });

  handle('ok:skill:detect-claude-desktop', async () => {
    return handleDetectClaudeDesktop();
  });
  handle('ok:skill:build-and-open', async (_event, opts) => {
    return handleBuildAndOpen({ app, shell, force: opts?.force });
  });

  const localOpDeps: LocalOpDeps = {
    resolveCliArgs: () => {
      if (app.isPackaged) {
        return [wrapperPathInBundle(app.getPath('exe'))];
      }
      return ['open-knowledge'];
    },
    state: createLocalOpState(),
  };
  handle('ok:local-op:auth:start', async (event) => {
    return handleAuthStart(localOpDeps, event.sender);
  });
  handle('ok:local-op:auth:cancel', async (_event, streamId) => {
    handleAuthCancel(localOpDeps, streamId);
    return undefined;
  });
  handle('ok:local-op:clone:start', async (event, request) => {
    return handleCloneStart(localOpDeps, event.sender, request);
  });
  handle('ok:local-op:clone:cancel', async (_event, streamId) => {
    handleCloneCancel(localOpDeps, streamId);
    return undefined;
  });
  handle('ok:local-op:auth:status', async (_event, request) => {
    return handleAuthStatus(localOpDeps, request);
  });
  handle('ok:local-op:auth:repos', async (_event, request) => {
    return handleAuthRepos(localOpDeps, request);
  });
}

const ICON_PNG_PATH = join(__dirname, '..', '..', 'build', 'icon.png');

function installDockIcon() {
  if (process.platform !== 'darwin') return;
  if (app.isPackaged) return; // packaged build uses the bundle's .icns
  if (!existsSync(ICON_PNG_PATH)) {
    console.warn('[main] skipping dock icon — build/icon.png missing');
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
  registerProtocolHandler({
    app: {
      on: (event, cb) => {
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
      await openProjectOrFallbackToNavigator(projectPath, opts?.pendingDeepLinkDoc);
      const ctx = wm?.getWindowFor(projectPath);
      if (!ctx) {
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
    const compat = evaluateSchemaCompatibility(
      appState,
      MAX_SUPPORTED_SCHEMA_VERSION,
      app.getVersion(),
    );
    if (compat.status === 'incompatible') {
      pendingSchemaIncompatibility = compat.diagnostic;
      console.warn('[main] schemaVersion incompatibility detected', compat.diagnostic);
    }
    installLocalhostCorsInjector();
    registerIpcHandlers();
    refreshApplicationMenu();
    installDockIcon();

    void maybeOfferBrokenSymlinkRepair().catch((err) => {
      console.error('[main] broken-symlink repair prompt failed', {
        err: (err as Error).message,
      });
    });

    mcpWiringHandle = armMcpWiring();

    const optionHeld = process.argv.includes('--navigator');
    if (appState.lastOpenedProject && !optionHeld && existsSync(appState.lastOpenedProject)) {
      void openProjectOrFallbackToNavigator(appState.lastOpenedProject);
    } else {
      openNavigator();
    }

    void installUserSkill({
      logger: {
        warn: (data, message) => console.warn(message, data),
        info: (data, message) => console.info(message, data),
      },
      surface: 'desktop-direct',
    }).catch(() => {});

    autoUpdaterHandle = await bootAutoUpdater(() => import('electron-updater'), {
      ipcMain,
      readState: () => appState,
      writeState: (next) => {
        const prev = appState;
        appState = next;
        const ok = saveAppState(appState);
        if (!ok) {
          appState = prev;
          throw new Error('saveAppState failed — rolled back in-memory state');
        }
      },
      getPrimaryWindow: () => {
        const focused = BrowserWindow.getFocusedWindow();
        if (focused) return focused;
        const all = BrowserWindow.getAllWindows();
        return all[0] ?? null;
      },
      getAllWindows: () => BrowserWindow.getAllWindows(),
      getAppVersion: () => app.getVersion(),
      isPackaged: app.isPackaged,
      forceDevBypass: process.env.OK_UPDATER_FORCE_DEV === '1',
      feedUrl: process.env.OK_UPDATER_FEED_URL || undefined,
      whenRendererReady: (fn) => {
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

  app.on('will-quit', () => {
    autoUpdaterHandle?.destroy();
    autoUpdaterHandle = null;
    mcpWiringHandle?.destroy();
    mcpWiringHandle = null;
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openNavigator();
    }
  });
} // end bootPrimaryInstance
