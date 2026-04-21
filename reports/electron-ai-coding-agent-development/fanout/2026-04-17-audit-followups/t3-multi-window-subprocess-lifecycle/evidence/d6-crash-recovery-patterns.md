# Evidence D6: Crash Recovery Patterns for Utility Processes

**Dimension:** D6 (P0) — When an Electron utilityProcess crashes, what do production apps do?
**Date:** 2026-04-17
**Sources:** VS Code source, GitHub Desktop source, Electron GitHub issues

---

## Key files referenced

- `vscode/src/vs/workbench/services/extensions/common/abstractExtensionService.ts` (L884-934, L1545-1568) — crash tracker + remote-host auto-restart
- `vscode/src/vs/platform/extensions/electron-main/extensionHostStarter.ts` (L79-101) — 1 s force-kill fallback after exit event
- `desktop/app/src/main-process/show-uncaught-exception.ts` (full file) — GitHub Desktop CrashWindow launch
- `desktop/app/src/main-process/crash-window.ts` (L1-100) — dedicated BrowserWindow for fatal errors
- [Electron Issue #19887 — App crash after render process crash](https://github.com/electron/electron/issues/19887)
- [Electron RenderProcessGoneDetails](https://www.electronjs.org/docs/latest/api/structures/render-process-gone-details)

---

## Findings

### Finding D6a: VS Code distinguishes two kinds of "gone" events and handles them differently

**Confidence:** CONFIRMED
**Evidence:** `utilityProcess.ts:334-374` + `abstractExtensionService.ts:872-893`

```ts
// utilityProcess.ts
// 'exit' event — clean or requested termination
this._onExit.fire({ pid, code, signal: 'unknown' });

// 'child-process-gone' event (on electron app) — crash with reason
this._onCrash.fire({ pid, code: details.exitCode, reason: details.reason });
// reason: 'clean-exit' | 'abnormal-exit' | 'killed' | 'crashed' | 'oom'
//       | 'launch-failed' | 'integrity-failure' | 'memory-eviction'
```

```ts
// abstractExtensionService.ts L872
private _onExtensionHostCrashOrExit(extensionHost, code, signal): void {
  const isExtensionDevHost = parseExtensionDevOptions(this._environmentService).isExtensionDevHost;
  if (!isExtensionDevHost) {
    this._onExtensionHostCrashed(extensionHost, code, signal);
    return;
  }
  this._onExtensionHostExit(code);  // dev-mode: propagate exit cleanly
}

protected _onExtensionHostCrashed(extensionHost, code, signal): void {
  console.error(`Extension host (${extensionHost.friendyName}) terminated unexpectedly. Code: ${code}, Signal: ${signal}`);
  if (extensionHost.kind === ExtensionHostKind.LocalProcess) {
    this._doStopExtensionHosts();      // local: stop all hosts (caller decides restart)
  } else if (extensionHost.kind === ExtensionHostKind.Remote) {
    if (signal) { this._onRemoteExtensionHostCrashed(extensionHost, signal); }
    this._extensionHostManagers.stopOne(extensionHost);
  }
}
```

**Implications:**
- Two signals: `exit` (a code integer) and `child-process-gone` (a crash reason enum). The `reason` distinguishes OOM from abnormal-exit from integrity-failure.
- Treatment depends on *why* the process went: clean exit vs. crash vs. OOM.
- Local-process crashes don't auto-restart by default; remote-process crashes do (budgeted). The budget policy should probably be identical, but the code reflects historical asymmetry.

---

### Finding D6b: Auto-restart with budget (3/5min) + non-modal "Restarting…" toast is the pattern for recoverable crashes

**Confidence:** CONFIRMED
**Evidence:** `abstractExtensionService.ts:919-934`

Quoted fully in D1c. The budget is 3 crashes in 5 minutes; exceeding that budget escalates to a modal prompt with a user-clickable "Restart" action.

**Implications:**
- Auto-restart is the default response to a crash, for the first few crashes. Budget prevents infinite restart loops.
- User UX for the first N crashes: a transient "Restarting…" status message, dismissed automatically after 5s.
- User UX for budget-exceeded: a persistent prompt requiring user action.
- This is the **industry-reference pattern** for utility-process crash recovery. Our "Restart / Close Window" dialog design matches the budget-exceeded side but could benefit from the budgeted-auto-restart layer.

---

### Finding D6c: The `onExit` event is not reliable as "process is gone" — post-verify with `process.kill(pid, 0)`

**Confidence:** CONFIRMED
**Evidence:** `extensionHostStarter.ts:79-101` (quoted in D1e) + comment linking to [VS Code Issue #194477](https://github.com/microsoft/vscode/issues/194477)

The extensionHostStarter schedules a 1 s post-exit check that sends signal 0 (liveness probe — doesn't actually signal, just checks if the PID exists). If the PID still exists, it sends SIGTERM (via `process.kill(pid)`).

**Implications:**
- Production code must not trust Electron's `exit` event as a guarantee that the OS process is actually gone.
- The post-exit check is cheap and safe: signal 0 throws if PID not found, which is the normal case.
- Applies to us: after we signal our utility process to shut down and receive `exit`, we should still liveness-check before considering the slot free.

---

### Finding D6d: GitHub Desktop handles *main-process* uncaught exceptions via a separate CrashWindow + relaunch, not via auto-recovery

**Confidence:** CONFIRMED
**Evidence:** `show-uncaught-exception.ts:1-52` (full file)

```ts
export function showUncaughtException(isLaunchError: boolean, error: Error) {
  if (hasReportedUncaughtException) return;      // idempotent
  hasReportedUncaughtException = true;
  setCrashMenu();
  const window = new CrashWindow(isLaunchError ? 'launch' : 'generic', error);
  window.onDidLoad(() => window.show());
  window.onFailedToLoad(async () => {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Unrecoverable Error',
      message: `GitHub Desktop has encountered an unrecoverable error...`,
    });
    if (!__DEV__) { app.relaunch(); }
    app.quit();
  });
  window.onClose(() => {
    if (!__DEV__) { app.relaunch(); }
    app.quit();
  });
  window.load();
}
```

**Implications:**
- GitHub Desktop's CrashWindow is a dedicated BrowserWindow (not a dialog) that renders a React view with error context, report-bug button, and relaunch option. It uses `app.relaunch() + app.quit()` to restart.
- This is heavier than VS Code's in-app restart (which keeps the main window alive) because GitHub Desktop has a monolithic main-renderer architecture — when it dies, the app dies.
- The pattern still fits our design: on a serious crash (especially the main process), relaunch via `app.relaunch()` is the graceful path.

---

### Finding D6e: Electron's `render-process-gone` is the equivalent event for renderer crashes (different from `child-process-gone`)

**Confidence:** CONFIRMED
**Evidence:** [Electron RenderProcessGoneDetails](https://www.electronjs.org/docs/latest/api/structures/render-process-gone-details) + webContents docs

```ts
// webContents emits 'render-process-gone' with details.reason:
// 'clean-exit' | 'abnormal-exit' | 'killed' | 'crashed' | 'oom' | 'launch-failed' | 'integrity-failure'
```

The recommended pattern ([Electron Issue #19887](https://github.com/electron/electron/issues/19887)): call `webContents.reload()` to spin up a new renderer, but NOT from inside the crash callback (causes main-process re-entry). Use `setTimeout(0)` or `Promise.resolve().then()` to defer.

**Implications:**
- Our utilityProcess crashes are `child-process-gone`. Renderer crashes in the same window are separately reported via `render-process-gone`. Both must be handled.
- The "defer reload to next tick" pattern is necessary because Electron's crash emitter runs inside the main process's own critical section.

---

### Finding D6f: Crash-recovery pattern summary across reference apps (comparative table)

**Confidence:** CONFIRMED (synthesis)

| App | Subprocess type | Crash detection | Recovery action | User surface |
| --- | --- | --- | --- | --- |
| **VS Code** (local ext-host) | utilityProcess | `onExit` + `child-process-gone` | Stop (no auto-restart); budget on remote hosts | Log entry only; no UI for local unless repeated |
| **VS Code** (remote ext-host) | node.js worker | Remote protocol disconnect | Auto-restart 3x/5min, then modal prompt | Non-modal toast → modal prompt |
| **GitHub Desktop** (main uncaught) | main process itself | `process.on('uncaughtException')` | `app.relaunch()` + `app.quit()` | Dedicated CrashWindow (separate BrowserWindow) |
| **GitHub Desktop** (renderer) | single renderer | (not handled specifically) | — | Main-process error handler takes over |
| **Logseq** | no utilityProcess | N/A | N/A | Main-renderer crash = user-facing white screen |
| **Obsidian** | unclear | unclear | unclear | Community reports stuck states, no dialog |

**Implications:**
- The ONE consistent pattern across apps with real subprocesses (VS Code, our target): **budgeted auto-restart → user prompt on budget exceeded**. This is the canonical pattern.
- The "show error dialog with Restart button" we designed matches the budget-exceeded rung; we should consider adding the budgeted auto-restart rung below it.

---

## Gaps / follow-ups

- Did not inspect Signal Desktop (in research-ask list but not in cached repos).
- Did not verify what happens in VS Code when the ext-host crashes but the user hasn't activated any extensions — likely a silent log entry (since there's nothing to restart for).
