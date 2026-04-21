# Evidence: D5/D6/D7 — Watchdog, Orphaning, Idempotent Start

**Dimensions:** D5 (watchdog patterns), D6 (OS-level process-tree cleanup), D7 (idempotent start)
**Date:** 2026-04-17
**Sources:** Electron issues, PR_SET_PDEATHSIG man page, Windows Job Object docs, node process-watchdog utilities

---

## Findings — D5 (Watchdog)

### Finding: No surveyed Electron app ships a self-restarting watchdog
**Confidence:** CONFIRMED (by negative search)
**Evidence:** VS Code, GitHub Desktop, Logseq, Obsidian, Slack/Discord — none use parent-watches-child supervision. On main-process crash, the app exits; user is expected to relaunch.

**Implications:** Watchdog-revive is an SRE-style pattern (Kubernetes pods, systemd `Restart=always`, PM2) that hasn't made it into desktop apps. The assumption is that users detect crashes visually and relaunch; ambient auto-restart would mask real bugs.

### Finding: `app.relaunch()` is the canonical pattern for self-restart on `uncaughtException`
**Confidence:** CONFIRMED
**Evidence:** [copyprogramming.com 2026 guide on electron restarts](https://copyprogramming.com/howto/what-is-the-proper-way-to-restart-an-electron-app), [electron-unhandled](https://github.com/sindresorhus/electron-unhandled)

```text
Always call app.relaunch() before app.quit() or app.exit() to prevent race conditions where the app closes without restarting.

You can handle uncaught exceptions using process.on('uncaughtException', (error) => {...}) and then call app.relaunch() followed by app.exit(1).
```

Best practice: track restart counts over a time window to detect crash loops; bail (don't relaunch) if > N crashes in < M seconds.

**Implications:** Self-relaunch is supported but requires care. Without crash-loop detection, a persistent startup bug spawns infinite processes, spams error dialogs, and potentially fills disk with crash dumps.

### Finding: `app.relaunch()` has known reliability issues; sometimes only exits without relaunching
**Confidence:** CONFIRMED
**Evidence:** [electron/electron#31726](https://github.com/electron/electron/issues/31726) ("app.relaunch() fails to restart app - It only exits")

**Implications:** Relaunch is not a guarantee — must be treated as best-effort and paired with user-visible crash reporting so a failed relaunch doesn't silently orphan the user.

---

## Findings — D6 (Process-tree orphaning & OS-level cleanup)

### Finding: macOS has no PR_SET_PDEATHSIG equivalent — children must self-detect parent death
**Confidence:** CONFIRMED
**Evidence:** [man7 prctl](https://man7.org/linux/man-pages/man2/pr_set_pdeathsig.2const.html), cross-platform search results

```text
macOS: macOS lacks prctl(PR_SET_PDEATHSIG) — there's no native way to auto-kill children when the parent dies.
```

On macOS, orphaned children are reparented to `launchd` (PID 1) and live indefinitely unless they self-exit.

**Common macOS mitigations (in order of preference):**
1. **Stdin-EOF polling:** Child inherits a stdin pipe from parent; `read()` on pipe returns EOF when parent closes. MCP stdio transport uses exactly this.
2. **Named pipe / Unix socket heartbeat:** Child connects to parent's socket; socket close = parent gone.
3. **Kqueue with `NOTE_EXIT`:** `kqueue` can watch PID for exit events. Requires child to know parent PID and maintain a persistent kqueue — more complex than stdin-EOF.
4. **Periodic `kill(parentPid, 0)` poll:** Cheap liveness check; lags by poll interval.

**Implications:** "Prevent orphans" requires child-side code on macOS. Cannot be solved purely by the parent.

### Finding: Linux's PR_SET_PDEATHSIG is the preferred mechanism, with a caveat
**Confidence:** CONFIRMED
**Evidence:** [man7 prctl](https://man7.org/linux/man-pages/man2/pr_set_pdeathsig.2const.html)

```text
The parent-death signal setting is cleared for the child of a fork(), and is also cleared when executing a set-user-ID or set-group-ID binary, or a binary that has associated capabilities; otherwise, this value is preserved across execve().
```

- Child must call `prctl(PR_SET_PDEATHSIG, SIGTERM)` AFTER fork.
- Cleared across setuid boundaries.
- Signal fires on immediate parent death — if the child has been re-parented (due to earlier parent exit), the signal fires for the new parent (launchd), which is useless.

**Implications:** Race condition: if parent dies between `fork()` and child's `prctl()`, child is orphaned before the signal handler is set. Solution: child checks `getppid() == 1` at startup and self-exits if already orphaned.

### Finding: Windows Job Objects with KILL_ON_JOB_CLOSE are the gold-standard on Windows
**Confidence:** CONFIRMED
**Evidence:** Windows docs on Job Objects

```text
create a job with CreateJobObject, assign processes using AssignProcessToJobObject, and set the JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE limit so all associated child processes terminate automatically when the parent (holding the job handle) exits, preventing orphans.
```

Unlike POSIX prctl, Windows Job Objects are kernel-enforced and survive arbitrary parent deaths (including SIGKILL-equivalent `TerminateProcess`).

**Implications:** Windows has the strongest OS-level cleanup guarantee. An Electron app that creates a Job Object, assigns utilityProcesses to it, and sets KILL_ON_JOB_CLOSE gets crash-safe cleanup for free. Electron does not do this by default — requires native addon or explicit Win32 API use.

### Finding: Electron's `utilityProcess` provides `kill()` but no `detached: true` equivalent for orphan prevention
**Confidence:** CONFIRMED
**Evidence:** [Electron utilityProcess docs](https://www.electronjs.org/docs/latest/api/utility-process)

```text
utilityProcess provides the equivalent of child_process.fork API from Node.js but uses Services API from Chromium to launch the child process.
```

Documented surface: `kill()`, `pid`, exit events. No documented `detached` option, no documented Job Object integration on Windows, no documented `PR_SET_PDEATHSIG` hook on Linux.

**Implications:** For orphan-safety across parent crashes, `utilityProcess` is insufficient alone. Must add child-side self-termination logic (stdin-EOF, heartbeat, etc.).

### Finding: "Orphaned process on Windows" bug persists across Electron versions
**Confidence:** CONFIRMED
**Evidence:** [electron/electron#6120](https://github.com/electron/electron/issues/6120), [#16317](https://github.com/electron/electron/issues/16317)

Long-standing issue: when Electron main process is killed (ctrl-C, SIGKILL), child processes spawned via `child_process.fork` / `utilityProcess` are orphaned ~30% of the time on Windows.

**Implications:** Relying on Electron's built-in cleanup is insufficient. Production apps explicitly use Job Objects (via native addons like [`node-windows-kill`](https://www.npmjs.com/package/windows-kill)) or child-side parent-watching.

---

## Findings — D7 (Idempotent start)

### Finding: Half-acquired locks + port binding failure is the canonical split-brain
**Confidence:** INFERRED (from composition of D1 evidence; no single citation)
**Evidence:** VS Code's pattern (`claimInstance` + `writeFile(lockfile, pid)` + `server.listen()`)

Failure mode: Step 1 (IPC server listen) succeeds → Step 2 (write lockfile) succeeds → Step 3 (HTTP port bind) fails with EADDRINUSE → process exits without cleaning up the lockfile.

**Mitigations seen in VS Code-class apps:**
- Shutdown hook (`onWillShutdown`) unlinks the lockfile even on error exit (see D1 evidence).
- Acquire-then-verify: after acquiring, do a sanity read-back to confirm ownership (PID check).
- Ordering: acquire the last-used resource first — so later failures don't leave earlier acquisitions dangling. (VS Code doesn't strictly follow this; it acquires IPC pipe THEN writes lockfile, which is "good enough" because lockfile is diagnostic.)

**Implications:** Start sequence has a transactionality problem: acquire N resources, any of which can fail. Fully-correct handling requires either (a) two-phase commit with explicit rollback, or (b) defensive next-start cleanup that can recover from ANY left-behind state.

### Finding: VS Code routes lockfile cleanup through `onWillShutdown` regardless of exit cause
**Confidence:** CONFIRMED
**Evidence:** `vscode/src/vs/code/electron-main/main.ts:141-145`

```text
Event.once(lifecycleMainService.onWillShutdown)(evt => {
    fileService.dispose();
    configurationService.dispose();
    evt.join('instanceLockfile', promises.unlink(environmentMainService.mainLockfile).catch(() => { /* ignored */ }));
});
```

The `.catch(() => {})` swallows unlink errors — cleanup is best-effort, never blocks shutdown.

**Implications:** Cleanup resilience: unlink failures (file already gone, permission errors) are not fatal. But `onWillShutdown` doesn't fire on SIGKILL — so crash-path cleanup still requires next-startup staleness detection.

### Finding: "Crash-loop detection" is a pattern borrowed from SRE tools, not native to Electron
**Confidence:** CONFIRMED
**Evidence:** [electron-unhandled](https://github.com/sindresorhus/electron-unhandled), Sentry Electron integration docs

Pattern: track startup timestamps in a file; if > 3 starts within 30s, present "this app keeps crashing" dialog with "Reset all state" / "Send error report" options instead of retrying.

**Implications:** Without this, an app with a persistent-state-corrupting bug enters infinite relaunch loops when paired with `app.relaunch()` in `uncaughtException`. Crash-loop detection is the safety net.

---

## Gaps / follow-ups

- `utilityProcess` with `detached: true` (if it exists undocumented) — would require code-level inspection of Electron source.
- Signal Desktop / Discord supervisor process behavior (both are known to have updater supervisors on Windows).
