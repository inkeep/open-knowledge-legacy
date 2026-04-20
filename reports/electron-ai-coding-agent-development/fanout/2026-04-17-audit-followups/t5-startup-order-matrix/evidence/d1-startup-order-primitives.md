# Evidence: D1 — Startup Primitives Across Production Apps

**Dimension:** D1 — Full startup-order enumeration (primitive mechanisms)
**Date:** 2026-04-17
**Sources:** microsoft/vscode, desktop/desktop, logseq/logseq, Electron docs

---

## Key files / pages referenced

- `microsoft/vscode` — `src/vs/code/electron-main/main.ts:129-156` — `claimInstance` + lockfile write
- `microsoft/vscode` — `src/vs/platform/environment/electron-main/environmentMainService.ts:55` — `code.lock` path
- `microsoft/vscode` — `src/vs/platform/windows/electron-main/windowsFinder.ts:44-59` — `findWindowOnWorkspaceOrFolder`
- `microsoft/vscode` — `src/vs/platform/windows/electron-main/windowsMainService.ts:640-672` — reuse existing window on folder open
- `desktop/desktop` — `app/src/main-process/main.ts:170-198` — GitHub Desktop single-instance pattern
- `logseq/logseq` — `src/electron/electron/core.cljs:322` — Logseq single-instance lock
- [electron/electron#35680](https://github.com/electron/electron/issues/35680) — bug: lock returns true twice on Windows
- [electron/electron#24447](https://github.com/electron/electron/issues/24447) — lock does not detect cross-user instances
- [Electron deep links docs](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app) — cold-start URL via `process.argv`

---

## Findings

### Finding: VS Code uses a *three-layer* claim: IPC pipe + lockfile + workspace-window registry
**Confidence:** CONFIRMED
**Evidence:** `vscode/src/vs/code/electron-main/main.ts:126-156`

```text
// Create the main IPC server by trying to be the server
// If this throws an error it means we are not the first
// instance of VS Code running and so we would quit.
const mainProcessNodeIpcServer = await this.claimInstance(...);

// Write a lockfile to indicate an instance is running
// (https://github.com/microsoft/vscode/issues/127861#issuecomment-877417451)
FSPromises.writeFile(environmentMainService.mainLockfile, String(process.pid))
```

Layer 1: Node IPC server at `mainIPCHandle` — authoritative single-instance via socket/pipe EADDRINUSE.
Layer 2: `code.lock` file containing PID — used for diagnostic correlation ([GH #127861](https://github.com/microsoft/vscode/issues/127861)), not for mutual exclusion.
Layer 3: In-memory `windows[]` registry queried by `findWindowOnWorkspaceOrFolder` for workspace-reuse decisions.

**Implications:** Production-grade Electron apps separate "is any instance running?" (IPC/socket) from "which workspace is open where?" (in-memory registry). A single lockfile answers the first but not the second.

### Finding: Second VS Code instance forwards CLI args to first instance, then exits
**Confidence:** CONFIRMED
**Evidence:** `vscode/src/vs/code/electron-main/main.ts:386-419`

```text
const otherInstanceLaunchMainService = ProxyChannel.toService<ILaunchMainService>(client.getChannel('launch'), ...);
// ...
await otherInstanceLaunchMainService.start(environmentMainService.args, process.env as IProcessEnvironment);
// Cleanup
client.dispose();
// ...
throw new ExpectedError('Sent env to running instance. Terminating...');
```

The second invocation behaves as a thin CLI client: connects to the first instance's IPC pipe, forwards arguments and env, then exits with an expected (non-error) status.

**Implications:** "CLI sibling" model — `code .` from a terminal IS a second-instance launch; the architectural boundary between "app" and "CLI entry point" does not exist as separate binaries in VS Code's design.

### Finding: VS Code retries lock acquisition exactly once after deleting stale IPC handle (Linux/macOS)
**Confidence:** CONFIRMED
**Evidence:** `vscode/src/vs/code/electron-main/main.ts:336-361`

```text
// it happens on Linux and OS X that the pipe is left behind
// let's delete it, since we can't connect to it and then
// retry the whole thing
try {
    unlinkSync(environmentMainService.mainIPCHandle);
} catch (error) {
    logService.warn('Could not delete obsolete instance handle', error);
    throw error;
}
return this.claimInstance(..., false);  // retry=false; one-shot
```

On `EADDRINUSE` → `ECONNREFUSED` (pipe orphaned from prior crash), VS Code `unlink`s the pipe and retries once. Windows is excluded (pipes auto-cleanup). `EPERM` triggers "another instance running as administrator" dialog.

**Implications:** Canonical stale-lock recovery pattern: detect-then-replace, not detect-then-fail. The one-shot retry avoids infinite loops if the unlink itself corrupts state.

### Finding: 10-second timeout dialog for "instance not responding"
**Confidence:** CONFIRMED
**Evidence:** `vscode/src/vs/code/electron-main/main.ts:376-384`

```text
if (!environmentMainService.args.wait && !environmentMainService.args.status) {
    startupWarningDialogHandle = setTimeout(() => {
        this.showStartupWarningDialog(
            localize('secondInstanceNoResponse', "Another instance of {0} is running but not responding", ...),
            localize('secondInstanceNoResponseDetail', "Please close all other instances and try again."),
            ...
        );
    }, 10000);
}
```

**Implications:** When the running first instance is deadlocked (not crashed — still holds the socket), VS Code surfaces a modal after 10s telling the user to kill the first instance. No auto-kill; user-in-loop.

### Finding: VS Code's workspace-reuse is positional (open-in-existing-window if that window has the workspace)
**Confidence:** CONFIRMED
**Evidence:** `vscode/src/vs/platform/windows/electron-main/windowsMainService.ts:640-672`

```text
// Check for existing instances
const windowsOnWorkspace = coalesce(allWorkspacesToOpen.map(
    workspaceToOpen => findWindowOnWorkspaceOrFolder(this.getWindows(), workspaceToOpen.workspace.configPath)
));
if (windowsOnWorkspace.length > 0) {
    const windowOnWorkspace = windowsOnWorkspace[0];
    // ...opens files in THAT window
}
```

**Implications:** Opening `code ~/foo` when `~/foo` is already open in window B focuses window B rather than creating a duplicate. The first-match heuristic (`windowsOnWorkspace[0]`) silently ignores the theoretical case of the same workspace in two windows (which cannot happen under this flow).

### Finding: GitHub Desktop uses simpler single-instance + focus pattern (no workspace-level routing)
**Confidence:** CONFIRMED
**Evidence:** `desktop/desktop/app/src/main-process/main.ts:174-198`

```text
const gotSingleInstanceLock = app.requestSingleInstanceLock()
isDuplicateInstance = !gotSingleInstanceLock

app.on('second-instance', (event, args, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        if (!mainWindow.isVisible()) mainWindow.show()
        mainWindow.focus()
    }
    handleCommandLineArguments(args)
})

if (isDuplicateInstance) {
    app.quit()
}
```

Compared to VS Code: no IPC pipe, no workspace registry, no lockfile. Pure `requestSingleInstanceLock()` + `second-instance` event. Squirrel (updater) event is a named exception that bypasses the lock.

**Implications:** One-window apps can use the Electron built-in primitive alone. Multi-workspace apps need additional routing.

### Finding: Logseq uses single-instance + Squirrel-style relaunch-on-graph-switch
**Confidence:** CONFIRMED
**Evidence:** `logseq/logseq/src/electron/electron/core.cljs:321-323`

```text
(defn main []
  (if-not (.requestSingleInstanceLock app)
    (.quit app)
    ...
```

Same primitive as GitHub Desktop. Logseq does NOT currently support multi-graph-same-window nor multi-window-same-graph — user-requested feature.

**Implications:** Single-instance lock is baseline for "one state machine per user per machine." Multi-document-context requires explicit work on top.

### Finding: Electron's `requestSingleInstanceLock` has known cross-user blind spots on Windows
**Confidence:** CONFIRMED
**Evidence:** [electron/electron#24447](https://github.com/electron/electron/issues/24447)

```text
The function uses DIR_USER_DATA as its lock directory. This path is user-specific, so "each user gets their own lock file location, allowing multiple users to bypass the single-instance protection."
```

On Windows fast-user-switching, User A's running instance is invisible to User B's request. Both instances run simultaneously and can corrupt shared user-accessible files.

**Implications:** Lock-file location must be on a shared path (e.g., project directory) if the resource being protected is shared across users. User-data-directory locks are single-user-scoped.

### Finding: Electron deep-link cold start surfaces differently than warm start
**Confidence:** CONFIRMED
**Evidence:** [Electron deep-links docs](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app)

Cold start: URL arrives via `process.argv[]`, app reads at startup.
Warm start (macOS): `open-url` event on `app`.
Warm start (Windows/Linux): `second-instance` event with URL in `argv` of second invocation.

**Implications:** Three distinct code paths for the same user action ("click a link"). Protocol handler must handle all three for consistency. If no app is registered for the protocol, OS shows "no app" dialog — app has no opportunity to self-register lazily.

---

## Gaps / follow-ups

- Discord/Slack single-instance implementations are closed-source; patterns inferred from user-forum behavior only.
- Figma Desktop's exact multi-window-same-file mechanism (does it dedupe? route to server?) is closed-source.
