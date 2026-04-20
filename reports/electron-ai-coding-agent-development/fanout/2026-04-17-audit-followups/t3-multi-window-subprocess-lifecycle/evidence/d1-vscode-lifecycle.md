# Evidence D1: VS Code Workspace-Process Lifecycle

**Dimension:** D1 (P0) — VS Code lifecycle: open-same-workspace-twice, ext-host crash, close-cleanup, quit ordering
**Date:** 2026-04-17
**Sources:** `~/.claude/oss-repos/vscode/` (Microsoft VS Code, MIT)

---

## Key files referenced

- `src/vs/platform/lifecycle/electron-main/lifecycleMainService.ts` — lifecycle phases, `before-quit` → `will-quit` choreography, 1 s `kill()` timeout
- `src/vs/platform/windows/electron-main/windowsMainService.ts` (L640-697) — workspace-dedupe on open
- `src/vs/platform/windows/electron-main/windowsFinder.ts` (L44-60) — `findWindowOnWorkspaceOrFolder`
- `src/vs/platform/windows/electron-main/windowsStateHandler.ts` — `IWindowsState` persistence, `restoreWindows`
- `src/vs/workbench/services/extensions/common/abstractExtensionService.ts` — ext-host crash classification + `ExtensionHostCrashTracker` (L1545-1568)
- `src/vs/platform/utilityProcess/electron-main/utilityProcess.ts` — `UtilityProcess`/`WindowUtilityProcess` wrapper
- `src/vs/platform/extensions/electron-main/extensionHostStarter.ts` — per-host utilityProcess orchestration
- `src/vs/platform/extensions/common/extensionHostStarter.ts` (L12) — `extensionHostGraceTimeMs = 6000`

---

## Findings

### Finding D1a: VS Code silently focuses the existing window when asked to open a workspace that is already open (no collision dialog)

**Confidence:** CONFIRMED
**Evidence:** `windowsMainService.ts:640-664` + `windowsFinder.ts:44-60`

```ts
// windowsMainService.ts L640
const windowsOnWorkspace = coalesce(
  allWorkspacesToOpen.map(workspaceToOpen =>
    findWindowOnWorkspaceOrFolder(this.getWindows(), workspaceToOpen.workspace.configPath)));
if (windowsOnWorkspace.length > 0) {
  const windowOnWorkspace = windowsOnWorkspace[0];
  // ...
  addUsedWindow(this.doOpenFilesInExistingWindow(openConfig, windowOnWorkspace, filesToOpenInWindow), ...);
  openFolderInNewWindow = true; // any other folders must open in new window
}
// ...
for (const workspaceToOpen of allWorkspacesToOpen) {
  if (windowsOnWorkspace.some(window => ... window.openedWorkspace.id === workspaceToOpen.workspace.id)) {
    continue; // ignore folders that are already open
  }
  // ...
}
```

`findWindowOnWorkspaceOrFolder` compares by canonical URI (workspace config path OR single-folder URI). There is **no user-facing dialog**: the existing window is focused, the intent is routed to it via `doOpenFilesInExistingWindow`, and the duplicate is dropped silently.

**Implications:** The "reference production" collision UX in VS Code is *silent focus-existing*, not a confirmation dialog. Users do not get "Open Anyway / Read-Only" choices; duplicate-open attempts are always redirected. Third-party extensions requesting `code <path>` from the terminal get the same treatment.

---

### Finding D1b: VS Code uses Electron `utilityProcess.fork` for extension hosts; each CodeWindow gets its own utility process bound to window lifecycle

**Confidence:** CONFIRMED
**Evidence:** `utilityProcess.ts:260-268` + `extensionHostStarter.ts:114-126`

```ts
// utilityProcess.ts L260-268
this.process = utilityProcess.fork(modulePath, args, {
  serviceName, env, execArgv,
  allowLoadingUnsignedLibraries,
  respondToAuthRequestsFromMainProcess,
  stdio: 'pipe'
});
```

```ts
// extensionHostStarter.ts L114
extHost.start({
  ...opts,
  type: 'extensionHost',
  entryPoint: 'vs/workbench/api/node/extensionHostProcess',
  windowLifecycleBound: true,                 // <-- tied to CodeWindow
  windowLifecycleGraceTime: extensionHostGraceTimeMs,  // 6000 ms
  correlationId: id
});
```

`WindowUtilityProcess.registerWindowListeners` (`utilityProcess.ts:500-515`) binds termination to both `onWillLoadWindow` (window navigated away) and `closed`:

```ts
if (configuration.windowLifecycleBound) {
  const graceTime = configuration.windowLifecycleGraceTime;
  const terminate = graceTime && graceTime > 0
    ? () => this.waitForExit(graceTime)
    : () => this.kill();
  this._register(Event.filter(this.lifecycleMainService.onWillLoadWindow, e => e.window.win === window)(terminate));
  this._register(Event.fromNodeEventEmitter(window, 'closed')(terminate));
}
```

`waitForExit` (L450-462) races exit vs. `setTimeout(graceTime)`; on timeout it calls `kill()` (SIGTERM).

**Implications:** VS Code validates the "one utility subprocess per BrowserWindow with graceful-then-forced termination" pattern. 6-second grace is the reference value. Lifecycle tied to *both* `onWillLoadWindow` (the window is navigating to a new workspace — old extension host for old workspace must die) AND `closed` (window gone). This is more precise than Electron docs imply: lifecycle tie-in must trigger on navigation, not just close, because a user who switches workspace inside one window deserves a fresh utility process for the new workspace.

---

### Finding D1c: VS Code ext-host crash recovery is "auto-restart up to 3 crashes per 5-minute window, then prompt with Restart button"

**Confidence:** CONFIRMED
**Evidence:** `abstractExtensionService.ts:1545-1568` + L911-938

```ts
// L1545-1568
export class ExtensionHostCrashTracker {
  private static _TIME_LIMIT = 5 * 60 * 1000;   // 5 minutes
  private static _CRASH_LIMIT = 3;
  private readonly _recentCrashes: IExtensionHostCrashInfo[] = [];
  // ...
  public shouldAutomaticallyRestart(): boolean {
    this._removeOldCrashes();
    return (this._recentCrashes.length < ExtensionHostCrashTracker._CRASH_LIMIT);
  }
}
```

```ts
// L911-934
private async _onRemoteExtensionHostCrashed(extensionHost, reconnectionToken): Promise<void> {
  // ...
  this._remoteCrashTracker.registerCrash();
  if (this._remoteCrashTracker.shouldAutomaticallyRestart()) {
    this._logService.info(`Automatically restarting the remote extension host.`);
    this._notificationService.status(nls.localize('extensionService.autoRestart',
      "The remote extension host terminated unexpectedly. Restarting..."), { hideAfter: 5000 });
    this._startExtensionHostsIfNecessary(false, Array.from(this._allRequestedActivateEvents.keys()));
  } else {
    this._notificationService.prompt(Severity.Error, nls.localize('extensionService.crash',
      "Remote Extension host terminated unexpectedly 3 times within the last 5 minutes."),
      [{ label: nls.localize('restart', "Restart Remote Extension Host"),
         run: () => { this._startExtensionHostsIfNecessary(...); } }]);
  }
}
```

Local-process extension hosts (`L886: extensionHost.kind === ExtensionHostKind.LocalProcess`) behave differently — `_doStopExtensionHosts()` is called (no auto-restart cascade), and crash telemetry is recorded via `utilityProcess.ts:345-374` `child-process-gone`.

**Implications:**
- Auto-restart budget is 3/5min, not unlimited — prevents restart storms from rapidly-faulting subprocesses.
- Notification is non-modal ("status with hideAfter: 5000"), not a blocking dialog — user can keep working while autorestart happens.
- Only the failure case prompts with a user-facing "Restart" button, and that button re-invokes the start sequence; it does NOT close the window.

---

### Finding D1d: VS Code shutdown ordering is a 5-phase choreography with phased Barriers

**Confidence:** CONFIRMED
**Evidence:** `lifecycleMainService.ts:187-211` + `L275-343`

```ts
// L187-211
export const enum LifecycleMainPhase {
  Starting = 1,
  Ready = 2,
  AfterWindowOpen = 3,
  Eventually = 4
}
```

```ts
// L275-343 — registerListeners
electron.app.addListener('before-quit', beforeQuitListener);
// On before-quit: set _quitRequested, fire onBeforeShutdown
// macOS-with-no-windows: fireOnWillShutdown directly

electron.app.addListener('window-all-closed', windowAllClosedListener);
// Only quit if _quitRequested || !isMacintosh

electron.app.once('will-quit', e => {
  e.preventDefault();                                  // block native quit
  const shutdownPromise = this.fireOnWillShutdown(ShutdownReason.QUIT);
  shutdownPromise.finally(() => {
    // ... remove listeners, call app.quit() for real
    electron.app.quit();
  });
});
```

The `onWillShutdown` event passes a `join(id, promise)` callback (L358-364) — each subsystem (extension hosts, state service, file watchers) can register an async cleanup promise and `Promises.settled(joiners)` blocks the real `app.quit()` until all have resolved. This is the orderly-drain mechanism.

Force-kill fallback (`L705-746 kill()`):
```ts
async kill(code?: number): Promise<void> {
  await this.fireOnWillShutdown(ShutdownReason.KILL);
  await Promise.race([
    timeout(1000),                                     // 1 s max
    (async () => {
      for (const window of getAllWindowsExcludingOffscreen()) {
        if (window && !window.isDestroyed()) {
          // destroy() each; wait for 'closed'
        }
      }
    })()
  ]);
  electron.app.exit(code);
}
```

Extension host starter registers a joiner with 6 s budget (`extensionHostStarter.ts:37-40`):
```ts
this._register(this._lifecycleMainService.onWillShutdown(e => {
  this._shutdown = true;
  e.join('extHostStarter', this._waitForAllExit(6000));
}));
```

**Implications:**
- The `onWillShutdown` join pattern is the textbook orderly-drain — multiple subsystems concurrently flush, one barrier waits for all.
- Extension host grace is 6s (matching the per-process `windowLifecycleGraceTime`); server `kill()` fallback is 1s max to destroy windows before `app.exit()`.
- `will-quit` with `e.preventDefault()` is what gates the real quit until subsystem drain completes — the canonical pattern.
- Per-phase Barriers (`when(LifecycleMainPhase)`) let post-startup work defer ("run after window open").

---

### Finding D1e: ExtensionHostStarter has a manual "force kill after 1s" fallback for PIDs that report exit but stay alive

**Confidence:** CONFIRMED
**Evidence:** `extensionHostStarter.ts:79-101`

```ts
// L79-101
const disposable = extHost.onExit(({ pid, code, signal }) => {
  disposable.dispose();
  this._logService.info(`Extension host with pid ${pid} exited...`);
  setTimeout(() => { extHost.dispose(); this._extHosts.delete(id); });

  // See https://github.com/microsoft/vscode/issues/194477
  // We have observed that sometimes the process sends an exit
  // event, but does not really exit and is stuck in an endless
  // loop. In these cases we kill the process forcefully after
  // a certain timeout.
  setTimeout(() => {
    try {
      process.kill(pid, 0); // throws if process doesn't exist
      this._logService.error(`Extension host with pid ${pid} still exists, forcefully killing it...`);
      process.kill(pid);
    } catch (er) {
      // ignore, as the process is already gone
    }
  }, 1000);
});
```

**Implications:**
- Electron utilityProcess's `exit` event is **not** a reliable "process is gone" signal — MS observed cases where `exit` fired but the PID remained alive in a loop. Production code must post-verify with `process.kill(pid, 0)` (liveness probe — signal 0 is "just check").
- The 1 s post-exit re-kill is a cross-platform hardening pattern, not paranoia.

---

### Finding D1f: Windows state persisted as `windowsState` storage key; `restoreWindows: 'all' | 'folders' | 'one' | 'none'` is the user-settable restore policy

**Confidence:** CONFIRMED
**Evidence:** `windowsStateHandler.ts:55-75,156-219`

```ts
// L55-58
private static readonly windowsStateStorageKey = 'windowsState';
private readonly _state: IWindowsState;
```

```ts
// L156-219 (onBeforeShutdown captures)
const currentWindowsState: IWindowsState = {
  openedWindows: [],
  lastPluginDevelopmentHostWindow: ...,
  lastActiveWindow: this.lastClosedState
};
// ... enumerate windows, filter out extension-dev hosts
if (this.windowsMainService.getWindowCount() > 1) {
  currentWindowsState.openedWindows = this.windowsMainService.getWindows()
    .filter(window => !window.isExtensionDevelopmentHost)
    .map(window => this.toWindowState(window));
}
this.stateService.setItem(WindowsStateHandler.windowsStateStorageKey, state);
```

**Implications:**
- The shutdown-time snapshot of open windows (with workspace identity) is the durable state for relaunch.
- Filter: extension-dev hosts are excluded from `openedWindows` (those are "child development windows," not user surfaces to restore).
- Utility processes themselves are **not** restored — they're recreated lazily when the window loads its workspace. Workspace identity + window geometry is sufficient state.

---

## Gaps / follow-ups

- Did not inspect VS Code's `restoreWindows` user setting parse logic in detail — only the persistence side.
- Did not find an in-tree "lock file" for workspace exclusivity. VS Code's per-workspace exclusivity is achieved through the single-instance `app.requestSingleInstanceLock()` + in-process `findWindowOnWorkspaceOrFolder`, not via a filesystem lock. This is a key divergence from our "per-project file lock" design.
