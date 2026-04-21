# Evidence D7: Graceful Shutdown Ordering

**Dimension:** D7 (P1) — `before-quit` → drain subprocesses → flush state → quit. Avoiding hangs.
**Date:** 2026-04-17
**Sources:** Electron docs + VS Code lifecycleMainService

---

## Key sources

- [Electron app docs](https://www.electronjs.org/docs/latest/api/app) — event ordering for `before-quit`, `window-all-closed`, `will-quit`, `quit`
- [Electron utilityProcess docs](https://www.electronjs.org/docs/latest/api/utility-process) — `kill()` sends SIGTERM
- `vscode/src/vs/platform/lifecycle/electron-main/lifecycleMainService.ts` (L275-343, L705-746)
- `vscode/src/vs/platform/utilityProcess/electron-main/utilityProcess.ts` (L450-462 — `waitForExit`)
- `vscode/src/vs/platform/extensions/electron-main/extensionHostStarter.ts` (L37-40)

---

## Findings

### Finding D7a: The canonical Electron shutdown choreography is before-quit → will-quit.preventDefault() → drain → app.quit()

**Confidence:** CONFIRMED
**Evidence:** Electron docs + VS Code `lifecycleMainService.ts:275-343` (quoted in D1d)

Event sequence:
1. `before-quit` fires when the app is about to close windows. `_quitRequested = true` at this point.
2. `window-all-closed` fires when the last window closes (ignored on macOS unless quit was requested).
3. `will-quit` fires when all windows are closed AND the app is about to terminate. Call `e.preventDefault()` to block the real quit while draining.
4. After drain resolves, call `app.quit()` again — this time without the prevent handler (registered via `.once()`).

```ts
// VS Code's pattern (lifecycleMainService.ts L316-343)
electron.app.once('will-quit', e => {
  e.preventDefault();                                    // block
  const shutdownPromise = this.fireOnWillShutdown(ShutdownReason.QUIT);
  shutdownPromise.finally(() => {
    // all subsystems drained
    electron.app.removeListener('before-quit', beforeQuitListener);
    electron.app.removeListener('window-all-closed', windowAllClosedListener);
    electron.app.quit();                                 // the real quit
  });
});
```

**Implications:**
- Use `will-quit` for the drain gate, not `before-quit`. `before-quit` is too early (windows haven't closed yet).
- Use `.once('will-quit', ...)` so the handler auto-removes after first fire. The second `app.quit()` inside the handler will be uninterrupted.
- All subsystem cleanup should be registered via an event-emitter pattern (VS Code's `onWillShutdown.fire({ reason, join })`) so each subsystem returns its own drain promise, and one `Promise.settled` gates the real quit.

---

### Finding D7b: SIGTERM → grace period → SIGKILL is the subprocess-drain pattern

**Confidence:** CONFIRMED
**Evidence:** `utilityProcess.ts:450-462` + Electron utilityProcess docs

```ts
// utilityProcess.ts L450
async waitForExit(maxWaitTimeMs: number): Promise<void> {
  if (!this.process) return;
  this.log('waiting to exit...', Severity.Info);
  await Promise.race([Event.toPromise(this.onExit), timeout(maxWaitTimeMs)]);
  if (this.process) {
    this.log(`did not exit within ${maxWaitTimeMs}ms, will kill it now...`, Severity.Info);
    this.kill();                                         // SIGTERM
  }
}
```

The caller (`_waitForAllExit(6000)`) uses 6 seconds as grace. On POSIX, Electron's `utilityProcess.kill()` sends SIGTERM. There is NO separate SIGKILL escalation in this path — the assumption is that 6 seconds is enough, and if it isn't, Electron's own process reaping will eventually finish the job. The extension-host-starter's additional `process.kill(pid)` at T+1s after onExit (D1e) is a separate concern: catching processes that claim to have exited but haven't.

**Implications:**
- The reference pattern is: request graceful exit via IPC → wait N seconds for `exit` event → fall back to SIGTERM → trust OS reaping.
- A true SIGKILL escalation (SIGTERM + sleep + SIGKILL) is NOT what VS Code uses. It relies on the OS to reap after the Electron process itself dies.
- For our HTTP-server-in-utilityProcess case, the IPC `{type: 'shutdown'}` message is the "request graceful exit" step; the utilityProcess SIGTERM is the fallback.

---

### Finding D7c: Per-subsystem drain is coordinated via a join pattern — each subsystem returns a Promise; Promise.settled is the barrier

**Confidence:** CONFIRMED
**Evidence:** `lifecycleMainService.ts:346-385` + consumer in `extensionHostStarter.ts:37-40`

```ts
// lifecycleMainService.ts
private fireOnWillShutdown(reason: ShutdownReason): Promise<void> {
  // ...
  const joiners: Promise<void>[] = [];
  this._onWillShutdown.fire({
    reason,
    join(id, promise) {
      logService.trace(`Lifecycle#onWillShutdown - begin '${id}'`);
      joiners.push(promise.finally(() => {
        logService.trace(`Lifecycle#onWillShutdown - end '${id}'`);
      }));
    }
  });
  this.pendingWillShutdownPromise = (async () => {
    try {
      await Promises.settled(joiners);                   // barrier
    } catch (error) { this.logService.error(error); }
    try {
      await this.stateService.close();                   // always flush state last
    } catch (error) { this.logService.error(error); }
  })();
  return this.pendingWillShutdownPromise;
}
```

```ts
// Consumer — extensionHostStarter.ts
this._register(this._lifecycleMainService.onWillShutdown(e => {
  this._shutdown = true;
  e.join('extHostStarter', this._waitForAllExit(6000));
}));
```

**Implications:**
- Each subsystem registers itself by listening to `onWillShutdown` and calling `e.join(id, promise)`. The lifecycle service collects all promises and blocks `will-quit` until they settle.
- The pattern is **fail-soft**: `Promises.settled` waits for settled (fulfilled OR rejected), not all-fulfilled. A rejected cleanup doesn't hang the shutdown; the error is logged.
- Critically, state-service close happens AFTER subsystem drains. The ordering matters: subsystems may write state during their drain, and those writes must be persisted.

---

### Finding D7d: Force-quit via `kill()` uses a 1-second window-destroy race and then `app.exit()`

**Confidence:** CONFIRMED
**Evidence:** `lifecycleMainService.ts:705-746` (quoted in D1d)

When the app needs to die fast (smoke tests, health-check escalation), the `kill()` path:
1. Fires `onWillShutdown` with `reason: KILL` — subsystems get *one last chance* to drain.
2. Races 1 s timeout against destroying all open BrowserWindows.
3. Calls `electron.app.exit(code)` (synchronous, non-negotiable).

**Implications:**
- Force-quit bypasses `will-quit` entirely — this is for unrecoverable health states, not normal quit.
- 1 s is the VS Code budget for "we need to die NOW but try to be clean."
- `app.exit()` vs `app.quit()`: `exit()` is forceful, does NOT fire `will-quit`. `quit()` is the normal path.

---

## Gaps / follow-ups

- Did not dig into how the VS Code shared-process drain coordinates with the ext-host starter — presumably serial joins.
- Did not explore Electron's own per-window grace (in `WindowUtilityProcess`) vs the app-wide shutdown join; they appear to be separately-budgeted.
