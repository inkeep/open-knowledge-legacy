import { spawn } from 'node:child_process';
import {
  existsSync,
  promises as fsPromises,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { homedir as osHomedir, hostname as osHostname } from 'node:os';
import { basename, join } from 'node:path';
import {
  ALL_EDITOR_IDS,
  detectInstalledEditors,
  EDITOR_TARGETS,
  initContent,
  type ProjectAiIntegrationsResult,
  previewContent,
  readExistingMcpEntry,
  writeProjectAiIntegrations,
  writeUserMcpConfigs,
} from '@inkeep/open-knowledge';
import {
  ensureProjectGit,
  findEnclosingGitRoot,
  findEnclosingProjectRoot,
  installUserSkill,
  isProcessAlive,
  readServerLock,
} from '@inkeep/open-knowledge-server';
import type { BrowserWindowConstructorOptions } from 'electron';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  session,
  shell,
  utilityProcess,
} from 'electron';
import { type EntryPoint, isEntryPoint } from '../shared/entry-point.ts';
import type {
  McpWiringEditorId,
  OnboardingShowPayload,
  RecentProject,
} from '../shared/ipc-channels.ts';
import { createHandler } from '../shared/ipc-handler.ts';
import { sendToRenderer } from '../shared/ipc-send.ts';
import { appendOkIgnoreSync } from './append-okignore.ts';
import { openAssetSafely, revealAssetSafely } from './asset-allowlist.ts';
import { popAssetMenu } from './asset-menu.ts';
import { attachAssetSafetyNet } from './asset-safety-net.ts';
import { bootAutoUpdater, type StartAutoUpdaterHandle } from './auto-updater.ts';
import { runBootstrap } from './bootstrap.ts';
import {
  createBrokenSymlinkRepairHandler,
  getInstallStatus,
  installCli,
  uninstallCli,
  wrapperPathInBundle,
} from './cli-install.ts';
import { requestUserConsent, walkExceedsCap } from './consent-dialog.ts';
import {
  CreateNewProjectError,
  folderState,
  resolveDefaultProjectsRoot,
  runCreateNew,
} from './create-new-project.ts';
import { createDebugIpc, type DebugIpcHandle } from './debug-ipc.ts';
import { promptForExistingFolder } from './dialog-helpers.ts';
import {
  type DriverUtilityLike,
  isDriverBootSmokeMode,
  runDriverBootSmoke,
} from './driver-boot-smoke.ts';
import { discoverProject, validateFolderPick } from './folder-admission.ts';
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
import { handleSeedApply, handleSeedListPacks, handleSeedPlan } from './ipc/seed.ts';
import {
  detectProtocol as detectProtocolImpl,
  recordHandoff as recordHandoffImpl,
  showItemInFolder as showItemInFolderImpl,
  spawnCursor as spawnCursorImpl,
} from './ipc-handlers.ts';
import { logIpcError } from './ipc-log.ts';
import {
  type McpWiringCliSurface,
  type RunMcpWiringHandle,
  runMcpWiringOnFirstLaunch,
} from './mcp-wiring.ts';
import { installApplicationMenu } from './menu.ts';
import { createNavigatorWindow, tryCloseNavigator } from './navigator-window.ts';
import {
  type OnboardingFlowKind,
  recordCreateNewBannerShown,
  recordOnboardingFlow,
} from './onboarding-telemetry.ts';
import {
  applyReducedTransparency,
  type BrowserWindowVibrancyTarget,
  type ReducedTransparencyDeps,
  type VibrancyMaterial,
} from './reduced-transparency-handler.ts';
import { handleShellOpenExternal } from './shell-allowlist.ts';
import { createShowGateRegistry, type ShowGateRegistry } from './show-gate.ts';
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
  setLastUsedProjectParent,
  setProjectSessionState,
} from './state-store.ts';
import { applyThemeApplied } from './theme-applied-handler.ts';
import { applyThemeSource, isOkThemeSource } from './theme-handler.ts';
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

const VIBRANCY_DEFAULT: VibrancyMaterial = 'sidebar';

const DEFAULT_WIN_OPTS: BrowserWindowConstructorOptions = {
  width: 1280,
  height: 800,
  show: false,
  ...(process.platform === 'darwin'
    ? {
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 22, y: 24 },
        vibrancy: VIBRANCY_DEFAULT,
        visualEffectState: 'followWindow',
        transparent: true,
      }
    : {}),
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
const showGate: ShowGateRegistry = createShowGateRegistry({
  log: {
    warn: (obj, msg) => {
      console.warn(JSON.stringify({ ...obj, msg }));
    },
  },
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
});

const reducedTransparencyDeps: ReducedTransparencyDeps = {
  getAllWindows: () =>
    BrowserWindow.getAllWindows() as unknown as readonly BrowserWindowVibrancyTarget[],
  defaultVibrancy: VIBRANCY_DEFAULT,
  warn: (line) => {
    console.warn(line);
  },
};
let autoUpdaterHandle: StartAutoUpdaterHandle | null = null;
let debugIpc: DebugIpcHandle | null = null;
let mcpWiringHandle: RunMcpWiringHandle | null = null;

const rendererDevUrl = process.env.ELECTRON_RENDERER_URL ?? null;

function isDebugKeyringSmokeAllowed(): boolean {
  return !app.isPackaged || process.env.OK_DEBUG_KEYRING_SMOKE === '1';
}

function resolveLocalOpCliArgs(): string[] {
  if (app.isPackaged) {
    return [wrapperPathInBundle(app.getPath('exe'))];
  }
  return ['open-knowledge'];
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
    showGate,
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
        width: 800,
        height: 750,
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
    showGate,
  });
}

function logAiIntegrationOutcomes(result: ProjectAiIntegrationsResult): number {
  const interesting = result.editorOutcomes.filter(
    (o) => o.outcome !== 'written' && o.outcome !== 'skipped-no-project-surface',
  );
  if (interesting.length === 0) return 0;
  console.warn(
    JSON.stringify({
      event: 'ai-integration-outcomes',
      outcomes: interesting.map((o) => ({
        editorId: o.editorId,
        outcome: o.outcome,
        ...(o.error !== undefined ? { error: o.error } : {}),
      })),
    }),
  );
  return interesting.filter((o) => o.outcome === 'failed').length;
}

const BOOT_BUDGET_FILE_CAP = 10_000;

async function openProject(
  projectPath: string,
  entryPoint: EntryPoint,
  pendingDeepLinkDoc?: string,
) {
  ensureWindowManager();

  const validation = validateFolderPick(projectPath);
  const discovery = await discoverProject(projectPath, {
    dirSizeProbe: async (dir) => {
      try {
        const exceedsCap = await walkExceedsCap(dir, BOOT_BUDGET_FILE_CAP);
        return { exceedsCap };
      } catch (err) {
        console.warn('[openProject] dirSizeProbe failed, failsafe to exceedsCap:true', err);
        return { exceedsCap: true };
      }
    },
  });

  if (discovery.kind === 'rejected') {
    dialog.showErrorBox(
      'Cannot open this folder',
      `${projectPath}\n\nReason: ${discovery.reason === 'symlink-escape' ? 'Symlink resolves outside its parent directory.' : 'Folder is unreadable or does not exist.'}`,
    );
    openNavigator();
    return;
  }

  const warningsCount = validation.warnings.length;
  const resolvedProjectDir = discovery.projectDir;
  let didEnsureGit = false;
  let flowKind: OnboardingFlowKind;
  let contentDirChanged = false;
  let aiIntegrationsFailedCount = 0;
  let toastPayload:
    | { kind: 'ancestor-promote'; ancestorPath: string }
    | { kind: 'git-root-promote'; gitRoot: string; contentDir: string }
    | null = null;

  if (discovery.kind === 'managed-requires-confirmation') {
    const ancestorName = basename(discovery.projectDir);
    const pickedName = basename(discovery.pickedPath);
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Cancel', `Open ${ancestorName}`],
      cancelId: 0,
      defaultId: 0,
      title: 'Open existing project?',
      message: `Open Knowledge wants to open the existing project at ${discovery.projectDir} (because it contains an .ok/ config). The folder you picked, ${pickedName}, is inside that project. Open ${ancestorName}?`,
    });
    if (response === 0) {
      recordOnboardingFlow({
        flowKind: 'managed-promote-cancelled',
        entryPoint,
        gitInitRequested: false,
        contentDirChanged: false,
        warningsCount,
      });
      openNavigator();
      return;
    }
    flowKind = 'managed-promote';
    if (entryPoint !== 'recents' && entryPoint !== 'create-new-nested-redirect') {
      toastPayload = { kind: 'ancestor-promote', ancestorPath: discovery.projectDir };
    }
  } else if (discovery.kind === 'managed') {
    flowKind = discovery.ancestorPromoted ? 'managed-promote' : 'managed-direct';
    if (
      discovery.ancestorPromoted &&
      entryPoint !== 'recents' &&
      entryPoint !== 'create-new-nested-redirect'
    ) {
      toastPayload = { kind: 'ancestor-promote', ancestorPath: discovery.projectDir };
    }
  } else {
    let navigator = navigatorWindow;
    if (!navigator) {
      openNavigator();
      navigator = navigatorWindow;
      if (!navigator) {
        dialog.showErrorBox(
          'Cannot open this folder',
          `${projectPath}\n\nFailed to open the Project Navigator.`,
        );
        return;
      }
      const navigatorWebContents = (navigator as unknown as { webContents: Electron.WebContents })
        .webContents;
      if (navigatorWebContents.isLoading()) {
        await new Promise<void>((resolve, reject) => {
          const onLoad = () => {
            navigatorWebContents.removeListener('destroyed', onDestroyed);
            resolve();
          };
          const onDestroyed = () => {
            navigatorWebContents.removeListener('did-finish-load', onLoad);
            reject(new Error('Navigator destroyed during load'));
          };
          navigatorWebContents.once('did-finish-load', onLoad);
          navigatorWebContents.once('destroyed', onDestroyed);
        });
      }
    }
    const showPayload: OnboardingShowPayload = {
      pickedPath: discovery.pickedPath,
      projectDir: discovery.projectDir,
      defaultContentDir: discovery.defaultContentDir,
      gitState: discovery.gitState,
      gitRootPromoted: discovery.gitRootPromoted,
      warnings: validation.warnings.map((w) => ({ kind: w.kind })),
      editorOptions: ALL_EDITOR_IDS.map((id) => ({
        id: id as McpWiringEditorId,
        label: EDITOR_TARGETS[id].label,
        hasProjectConfig: EDITOR_TARGETS[id].projectConfigPath !== undefined,
      })),
    };
    const decision = await requestUserConsent(
      {
        ipcMain,
        navigator: (navigator as unknown as { webContents: Electron.WebContents }).webContents,
        previewContent,
      },
      showPayload,
    );
    if (decision.outcome === 'cancel') {
      recordOnboardingFlow({
        flowKind: 'cancel',
        entryPoint,
        gitInitRequested: false,
        contentDirChanged: false,
        warningsCount,
      });
      return;
    }
    const { request } = decision;
    contentDirChanged = request.contentDir !== discovery.defaultContentDir;
    flowKind =
      contentDirChanged ||
      request.additionalIgnores.trim().length > 0 ||
      request.editorIds.length !== ALL_EDITOR_IDS.length
        ? 'fresh-customized'
        : 'fresh-default';
    if (
      request.initGit &&
      (discovery.gitState === 'absent' || discovery.gitState === 'shell-only')
    ) {
      await ensureProjectGit(discovery.projectDir);
      didEnsureGit = true;
    }
    await initContent(discovery.projectDir, {
      contentDir: request.contentDir !== '.' ? request.contentDir : undefined,
    });
    if (request.additionalIgnores.trim().length > 0) {
      appendOkIgnoreSync(discovery.projectDir, request.additionalIgnores);
    }
    aiIntegrationsFailedCount = logAiIntegrationOutcomes(
      writeProjectAiIntegrations(discovery.projectDir, [...request.editorIds]),
    );
    if (discovery.gitRootPromoted) {
      toastPayload = {
        kind: 'git-root-promote',
        gitRoot: discovery.projectDir,
        contentDir: request.contentDir,
      };
    }
  }

  recordOnboardingFlow({
    flowKind,
    entryPoint,
    gitInitRequested: didEnsureGit,
    contentDirChanged,
    warningsCount,
    failedCount: aiIntegrationsFailedCount,
  });

  const ctx = await wm.createProjectWindow({
    projectPath: resolvedProjectDir,
    pendingDeepLinkDoc,
    didEnsureGit,
    consentVersion: 1,
    localOpCliArgs: resolveLocalOpCliArgs(),
  });
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
  if (toastPayload !== null) {
    const payload = toastPayload;
    ctx.window.webContents.once('did-finish-load', () => {
      sendToRenderer(ctx.window.webContents, 'ok:onboarding:toast', payload);
    });
  }

  tryCloseNavigator(navigatorWindow, { projectPath });
  appState = addRecentProject(appState, resolvedProjectDir, ctx.projectName);
  saveAppState(appState);
  refreshApplicationMenu();
}

async function openProjectOrFallbackToNavigator(
  projectPath: string,
  entryPoint: EntryPoint,
  pendingDeepLinkDoc?: string,
) {
  try {
    await openProject(projectPath, entryPoint, pendingDeepLinkDoc);
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
    openProject: (path, entryPoint) => openProjectOrFallbackToNavigator(path, entryPoint),
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
    onCheckForUpdates: autoUpdaterHandle
      ? () => {
          void autoUpdaterHandle?.checkForUpdatesNow().catch((err) => {
            console.warn('[main] checkForUpdatesNow rejected', {
              message: err instanceof Error ? err.message : String(err),
            });
          });
        }
      : undefined,
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

  handle('ok:dialog:open-folder', async (_event, opts) => {
    return promptForExistingFolder(dialog, opts);
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
    const outcome = await spawnCursorImpl(
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
    if (!outcome.ok) {
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:shell:spawn-cursor',
        reason: outcome.reason,
        handler: 'spawnCursor',
      });
    }
    return outcome;
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
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:shell:open-asset',
        reason: 'path-escape',
        handler: 'openAsset',
      });
      return { ok: false, reason: 'path-escape' } as const;
    }
    const outcome = await openAssetSafely(
      {
        projectPath: callerProjectPath,
        platform: process.platform,
        openPath: (canonical) => shell.openPath(canonical),
      },
      relPath,
    );
    if (!outcome.ok) {
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:shell:open-asset',
        reason: outcome.reason,
        handler: 'openAsset',
      });
    }
    return outcome;
  });

  handle('ok:shell:reveal-asset', async (event, relPath) => {
    const callerWin = BrowserWindow.fromWebContents(event.sender);
    const callerProjectPath =
      callerWin && wm
        ? wm.getContextForBrowserWindow(callerWin as unknown as BrowserWindowLike)?.projectPath
        : undefined;
    if (!callerProjectPath) {
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:shell:reveal-asset',
        reason: 'path-escape',
        handler: 'revealAsset',
      });
      return { ok: false, reason: 'path-escape' } as const;
    }
    const outcome = await revealAssetSafely(
      {
        projectPath: callerProjectPath,
        platform: process.platform,
        showItemInFolder: (canonical) => shell.showItemInFolder(canonical),
      },
      relPath,
    );
    if (!outcome.ok) {
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:shell:reveal-asset',
        reason: outcome.reason,
        handler: 'revealAsset',
      });
    }
    return outcome;
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

  handle('ok:theme:set-source', async (_event, { source }) => {
    return applyThemeSource(
      {
        getThemeSource: () =>
          isOkThemeSource(nativeTheme.themeSource) ? nativeTheme.themeSource : 'system',
        setThemeSource: (s) => {
          nativeTheme.themeSource = s;
        },
        warn: (line) => console.warn(line),
      },
      source,
    );
  });

  handle('ok:theme:applied', async (event, opts) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    applyThemeApplied(
      {
        fireThemeApplied: (w) => showGate.fireThemeApplied(w as BrowserWindowLike),
        applyReducedTransparency: (reduced) =>
          applyReducedTransparency(reducedTransparencyDeps, reduced),
        warn: (line) => console.warn(line),
      },
      win as unknown as object | null,
      opts,
    );
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
    if (!win || !wm)
      return { openTabs: [], activeDocName: null, activeTabId: null, updatedAt: null };
    const ctx = wm.getContextForBrowserWindow(win as unknown as BrowserWindowLike);
    if (!ctx) return { openTabs: [], activeDocName: null, activeTabId: null, updatedAt: null };
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
    if (!isEntryPoint(request.entryPoint)) {
      throw new Error(
        `ok:project:open rejected: invalid entryPoint '${String(request.entryPoint)}'`,
      );
    }
    await openProjectOrFallbackToNavigator(request.path, request.entryPoint);
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

  handle('ok:fs:default-projects-root', async () => {
    return resolveDefaultProjectsRoot(appState.lastUsedProjectParent, app.getPath('documents'));
  });

  handle('ok:fs:folder-state', async (_event, path) => {
    if (typeof path !== 'string' || path.length === 0) {
      throw new Error('ok:fs:folder-state rejected: path must be a non-empty string');
    }
    return folderState(path);
  });

  handle('ok:fs:find-enclosing-project-root', async (_event, path) => {
    if (typeof path !== 'string' || path.length === 0) {
      throw new Error(
        'ok:fs:find-enclosing-project-root rejected: path must be a non-empty string',
      );
    }
    return findEnclosingProjectRoot(path);
  });

  handle('ok:fs:find-enclosing-git-root', async (_event, path) => {
    if (typeof path !== 'string' || path.length === 0) {
      throw new Error('ok:fs:find-enclosing-git-root rejected: path must be a non-empty string');
    }
    return findEnclosingGitRoot(path);
  });

  handle('ok:project:create-new', async (_event, args) => {
    let result: Awaited<ReturnType<typeof runCreateNew>>;
    try {
      result = await runCreateNew({
        parent: args.parent,
        name: args.name,
        editors: args.editors,
      });
    } catch (err) {
      if (err instanceof CreateNewProjectError) {
        logIpcError({
          event: 'ipc.error',
          channel: 'ok:project:create-new',
          reason: err.reason,
          handler: 'runCreateNew',
          cause: { message: err.message },
        });
      } else {
        logIpcError({
          event: 'ipc.error',
          channel: 'ok:project:create-new',
          reason: 'unexpected',
          handler: 'runCreateNew',
          cause: err,
        });
      }
      throw err;
    }

    const aiFailedCount = logAiIntegrationOutcomes(result.aiIntegrations);

    appState = setLastUsedProjectParent(appState, args.parent);
    saveAppState(appState);

    recordOnboardingFlow({
      flowKind: result.variant,
      entryPoint: 'create-new',
      gitInitRequested: !result.gitRootPromoted,
      contentDirChanged: result.defaultContentDir !== '.',
      warningsCount: 0,
      failedCount: aiFailedCount,
    });

    console.log(
      `[create-new] created project at ${result.projectDir} (target: ${result.target}, variant: ${result.variant}, gitRootPromoted: ${result.gitRootPromoted})`,
    );

    await openProjectOrFallbackToNavigator(result.projectDir, 'create-new');
    return undefined;
  });

  handle('ok:project:record-create-new-banner-shown', async (_event, banner) => {
    if (banner !== 'nested' && banner !== 'nonempty' && banner !== 'git-confirm') {
      throw new Error(
        `ok:project:record-create-new-banner-shown rejected: unknown banner ${JSON.stringify(banner)}`,
      );
    }
    recordCreateNewBannerShown(banner);
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
  handle('ok:seed:plan', async (event, options) => {
    const result = await handleSeedPlan(
      { resolveProjectRoot: () => resolveSeedProjectRoot(event) },
      options,
    );
    if (!result.ok) {
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:seed:plan',
        reason: result.error.kind,
        handler: 'handleSeedPlan',
        cause: { message: result.error.message },
      });
    }
    return result;
  });
  handle('ok:seed:apply', async (event, plan, options) => {
    const result = await handleSeedApply(
      { resolveProjectRoot: () => resolveSeedProjectRoot(event) },
      plan,
      options,
    );
    if (!result.ok) {
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:seed:apply',
        reason: result.error.kind,
        handler: 'handleSeedApply',
        cause: { message: result.error.message },
      });
    }
    return result;
  });
  handle('ok:seed:list-packs', async () => handleSeedListPacks());

  handle('ok:skill:detect-claude-desktop', async () => {
    return handleDetectClaudeDesktop();
  });
  handle('ok:skill:build-and-open', async (_event, opts) => {
    const result = await handleBuildAndOpen({ app, shell, force: opts?.force });
    if (!result.ok) {
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:skill:build-and-open',
        reason: result.reason,
        handler: 'handleBuildAndOpen',
        cause: result.message !== undefined ? { message: result.message } : undefined,
      });
    }
    return result;
  });

  const localOpDeps: LocalOpDeps = {
    resolveCliArgs: resolveLocalOpCliArgs,
    state: createLocalOpState(),
  };
  handle('ok:local-op:auth:start', async (event) => {
    const result = handleAuthStart(localOpDeps, event.sender);
    if (!result.ok) {
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:local-op:auth:start',
        reason: result.error,
        handler: 'handleAuthStart',
      });
    }
    return result;
  });
  handle('ok:local-op:auth:cancel', async (_event, streamId) => {
    handleAuthCancel(localOpDeps, streamId);
    return undefined;
  });
  handle('ok:local-op:clone:start', async (event, request) => {
    const result = handleCloneStart(localOpDeps, event.sender, request);
    if (!result.ok) {
      logIpcError({
        event: 'ipc.error',
        channel: 'ok:local-op:clone:start',
        reason: result.error,
        handler: 'handleCloneStart',
      });
    }
    return result;
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
      await openProjectOrFallbackToNavigator(projectPath, 'deep-link', opts?.pendingDeepLinkDoc);
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

  app
    .whenReady()
    .then(async () => {
      const result = await runBootstrap({
        loadAppState,
        evaluateSchemaCompatibility,
        installLocalhostCorsInjector,
        registerIpcHandlers,
        setNativeThemeSource: (source) => {
          nativeTheme.themeSource = source;
        },
        refreshApplicationMenu,
        installDockIcon,
        log: { warn: (msg, obj) => console.warn(msg, obj) },
        appVersion: app.getVersion(),
        maxSupportedSchemaVersion: MAX_SUPPORTED_SCHEMA_VERSION,
      });
      appState = result.appState;
      pendingSchemaIncompatibility = result.pendingSchemaIncompatibility;

      app.on('browser-window-created', (_event, win) => {
        win.webContents.once('did-finish-load', () => {
          const pending = appState.versionPendingInstall;
          if (!pending) return;
          sendToRenderer(win.webContents, 'ok:update:downloaded', { version: pending });
        });
      });

      void maybeOfferBrokenSymlinkRepair().catch((err) => {
        console.error('[main] broken-symlink repair prompt failed', {
          err: (err as Error).message,
        });
      });

      mcpWiringHandle = armMcpWiring();

      const optionHeld = process.argv.includes('--navigator');
      if (appState.lastOpenedProject && !optionHeld && existsSync(appState.lastOpenedProject)) {
        void openProjectOrFallbackToNavigator(appState.lastOpenedProject, 'recents');
      } else {
        openNavigator();
      }

      void installUserSkill({
        logger: {
          warn: (data, message) => console.warn(message, data),
          info: (data, message) => console.info(message, data),
        },
        surface: 'desktop-direct',
      }).catch(() => {
        /* installUserSkill is documented as never-throws; this is defense
         against a future regression that would otherwise crash the main
         process during the floating microtask. */
      });

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
        prepareForRelaunch: () => {
          wm?.killAllUtilities();
        },
        showCheckNowResult: (result) => {
          const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
          if (!target) return;
          if (result.kind === 'not-available') {
            void dialog.showMessageBox(target, {
              type: 'info',
              buttons: ['OK'],
              defaultId: 0,
              title: 'Up to Date',
              message: "You're on the latest version of Open Knowledge.",
              detail: `Open Knowledge ${result.currentVersion} is the most current version available.`,
            });
          } else if (result.kind === 'available') {
            void dialog.showMessageBox(target, {
              type: 'info',
              buttons: ['OK'],
              defaultId: 0,
              title: 'Update Available',
              message: `Open Knowledge ${result.latestVersion} is available.`,
              detail: `It's downloading in the background. You'll be prompted to relaunch when the install is ready.`,
            });
          } else {
            void dialog.showMessageBox(target, {
              type: 'warning',
              buttons: ['OK'],
              defaultId: 0,
              title: "Couldn't Check for Updates",
              message: "Open Knowledge couldn't check for updates right now.",
              detail: result.message,
            });
          }
        },
      });
      refreshApplicationMenu();
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? (err.stack ?? '') : '';
      console.error(JSON.stringify({ event: 'whenReady-unhandled-rejection', message, stack }));
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
