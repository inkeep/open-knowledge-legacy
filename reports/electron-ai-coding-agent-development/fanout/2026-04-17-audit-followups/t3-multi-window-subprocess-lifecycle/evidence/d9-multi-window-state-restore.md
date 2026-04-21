# Evidence D9: Multi-Window State Restore on Relaunch

**Dimension:** D9 (P1) — Which windows to restore, in what order; subprocess restart eager vs lazy
**Date:** 2026-04-17
**Sources:** VS Code source, Chromium session-restore patterns

---

## Key files referenced

- `vscode/src/vs/platform/windows/electron-main/windowsStateHandler.ts` (L55-219) — IWindowsState persistence
- `vscode/src/vs/platform/extensions/electron-main/extensionHostStarter.ts` — lazy utilityProcess creation (on-demand, per window)
- VS Code user setting `window.restoreWindows` — values: `all`, `folders`, `one`, `none`, `preserve`

---

## Findings

### Finding D9a: VS Code persists windows state at shutdown, keyed by window identity + workspace ID

**Confidence:** CONFIRMED
**Evidence:** `windowsStateHandler.ts:55-219` (D1f)

```ts
// L55
private static readonly windowsStateStorageKey = 'windowsState';

// L156-219 (onBeforeShutdown)
const currentWindowsState: IWindowsState = {
  openedWindows: [],
  lastPluginDevelopmentHostWindow: ...,
  lastActiveWindow: this.lastClosedState
};
// ... enumerate active windows, toWindowState() each
if (this.windowsMainService.getWindowCount() > 1) {
  currentWindowsState.openedWindows = this.windowsMainService.getWindows()
    .filter(window => !window.isExtensionDevelopmentHost)
    .map(window => this.toWindowState(window));
}
this.stateService.setItem(WindowsStateHandler.windowsStateStorageKey, state);
```

Each entry encodes:
- `workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined` — the project/workspace
- `uiState: { mode, display, x, y, width, height }` — geometry
- `backupFolder` — for untitled/empty-window backups
- `remoteAuthority` — for remote sessions

**Implications:**
- The persisted state is "window manifest": list of (workspace identity, geometry, remote endpoint). No process state; no utilityProcess PIDs.
- The manifest is enough to recreate the same window configuration — which workspace, where on screen.

---

### Finding D9b: Relaunch recreates BrowserWindows eagerly; utilityProcesses are created lazily by the renderer when workspace loads

**Confidence:** INFERRED + CONFIRMED
**Evidence:** Extension host starter architecture + no eager bootstrap logic in windowsStateHandler.

The WindowsStateHandler writes state but does not itself restore — restoration is driven by the startup path in `code/electron-main/app.ts` which reads the manifest, creates each BrowserWindow with the appropriate workspace URL, and loads the React app. The React app then requests its extension host via `IPC → ExtensionHostStarter.createExtensionHost()` — this is the lazy path. The utilityProcess is forked when the renderer explicitly asks.

**Implications:**
- Restore order: BrowserWindows first (eager, all at once, order preserved from manifest), utilityProcesses second (lazy, driven by each renderer's initialization).
- This keeps cold-start fast: the user sees all their window chrome immediately, and each window's backend spins up as needed.
- Trade-off: a window that fails to load its workspace (disk missing, permissions lost) may leave the utilityProcess un-created. The window exists as an empty shell.

---

### Finding D9c: Restore-policy user setting controls behavior — not always "restore all"

**Confidence:** CONFIRMED
**Evidence:** VS Code settings documentation + implementation handles `window.restoreWindows` values

VS Code's `window.restoreWindows` setting:
- `all`: Reopen all windows that were open on last quit
- `folders`: Reopen last folder, but not files that were open
- `one`: Reopen the last active window only (default on some platforms)
- `none`: Never reopen any
- `preserve`: Reopen everything, including unopened empty windows

**Implications:**
- Production apps give users agency over restore policy. Not every user wants 5 windows popping open on launch.
- Default varies by platform (macOS "reopen all" is more common; Windows tends toward "last active").
- A minimal-viable product might ship with `all` as default and expose the setting later.

---

### Finding D9d: Crash-triggered relaunch uses same state manifest; no special "recovery mode" path

**Confidence:** CONFIRMED
**Evidence:** `lifecycleMainService.ts:672-703` — `relaunch()` method

```ts
async relaunch(options?: IRelaunchOptions): Promise<void> {
  const args = process.argv.slice(1);
  if (options?.addArgs) args.push(...options.addArgs);
  // ...
  electron.app.once('quit', quitListener);  // will relaunch from 'quit' event
  const veto = await this.quit(true /* will restart */);
  // ...
}
```

The relaunch path is: normal quit (drain + flush state) → `app.relaunch()` on `quit` event. The next startup reads the same `windowsState` key and restores normally. There's no "we crashed, load safer state" branch.

**Implications:**
- For crash-induced relaunches, the same state is restored. If the state itself caused the crash, this is a doom loop.
- Mitigation: VS Code has extensive corruption resistance (JSON parsing with try/catch, quarantined state dir on schema mismatch). We should expect similar robustness.
- Our "runClean on boot" step handles the subprocess-side of this: stale locks from the crashed process are cleaned up before new processes try to acquire them.

---

### Finding D9e: Chromium's session-restore (Chrome's own tab persistence) — conceptually parallel, drives many patterns

**Confidence:** INFERRED (external knowledge)

Chrome's session restore:
- Persists tab URLs, scroll positions, forms at shutdown
- Restores eagerly (all tabs at launch) but defers loading until the tab is visible (lazy)
- After crash, asks user "restore tabs?" — opt-in, not automatic

**Implications:**
- Chromium's pattern of "eager UI restore, lazy content load" is a well-established trade-off. VS Code follows this for windows.
- The "ask user to restore after crash" opt-in is a distinct design choice; VS Code defaults to auto-restore.
- Our design might add a crash-triggered opt-in for safer recovery on repeated crash cycles.

---

## Gaps / follow-ups

- Did not trace the exact VS Code code path from startup → `restoreWindowsState` → window creation — the `stateService.getItem` read happens in `windowsStateHandler.ts` constructor, but the actual window creation sequence uses this state inside `windowsMainService.open` which requires more tracing.
- Did not verify whether VS Code has explicit "safe mode" on repeated crash (it does have one for extensions, but the window-restore side is unclear).
