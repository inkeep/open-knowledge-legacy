# Evidence: D2 — Transition Edge Cases

**Dimension:** D2 — Transition edge cases (crash, OOM, orphan, sync-service, deep-link)
**Date:** 2026-04-17
**Sources:** Electron issue tracker, Logseq issue tracker, VS Code source, proper-lockfile docs, apenwarr locking essay

---

## Key files / pages referenced

- [electron/electron#5620](https://github.com/electron/electron/issues/5620) — release single-instance lock before exit
- [electron/electron#35680](https://github.com/electron/electron/issues/35680) — requestSingleInstanceLock returns true twice on Windows 10
- [electron/electron#34808](https://github.com/electron/electron/issues/34808) — unref'd child prevents Electron exit
- [electron/electron#6120](https://github.com/electron/electron/issues/6120) — orphaned processes on Windows
- [electron/electron#49261](https://github.com/electron/electron/issues/49261) — SIGKILL on macOS Tahoe without crash reports
- [electron/electron#27201](https://github.com/electron/electron/issues/27201) — `will-quit` terminates before async resolves
- [logseq/logseq#3386](https://github.com/logseq/logseq/issues/3386) — hostname-based cross-machine lock proposal
- [anthropics/claude-code#33947](https://github.com/anthropics/claude-code/issues/33947) — MCP subprocess orphan accumulation PPID=1
- [proper-lockfile](https://www.npmjs.com/package/proper-lockfile) — mtime-heartbeat staleness detection
- [apenwarr locking essay](https://apenwarr.ca/log/20101213) — flock/fcntl over NFS/SMB (NOT FOUND over fetch; content summary via cache)

---

## Findings

### Finding: Electron's `will-quit` can terminate before async cleanup resolves
**Confidence:** CONFIRMED
**Evidence:** [electron/electron#27201](https://github.com/electron/electron/issues/27201)

```text
The 'will-quit' event might be terminating before asynchronous operations have a chance to be executed.
```

Async lock-release code registered on `will-quit` may race against process termination — Electron does not await arbitrary promises returned from the handler. Only `event.preventDefault()` + explicit later call reliably blocks quit.

**Implications:** Lock files written in `will-quit` can be left behind if the release IO hadn't flushed. Shutdown ordering must treat lock release as best-effort from the lifecycle perspective, and cleanup on next startup must tolerate presence of stale locks.

### Finding: SIGKILL and OS-forced termination leave no cleanup window
**Confidence:** CONFIRMED
**Evidence:** [electron/electron#49261](https://github.com/electron/electron/issues/49261)

```text
On macOS, multiple Electron-based applications have been force-terminated by the system (SIGKILL) without generating crash reports. Apps such as VS Code, Slack, Chrome, and other Electron apps are killed by the OS abruptly without crash logs.
```

macOS 26.2 Tahoe observed pattern: OS kills apps under memory pressure, lifecycle events do not fire, no crash log emitted.

**Implications:** Lock release via `before-quit`/`will-quit` is NOT crash-safe. Every lock must be designed with "next-startup stale recovery" as the primary path, not the edge case.

### Finding: `proper-lockfile` uses mtime-heartbeat for stale detection
**Confidence:** CONFIRMED
**Evidence:** [proper-lockfile npm](https://www.npmjs.com/package/proper-lockfile)

```text
stale: Duration in milliseconds in which the lock is considered stale, defaults to 10000 (minimum value is 5000)
update: The interval in milliseconds in which the lockfile's mtime will be updated, defaults to stale/2 (minimum value is 1000, maximum value is stale/2)
```

The canonical Node.js lock library: every `update` ms (default 5s), the holder touches mtime; readers consider the lock dead if mtime is older than `stale` (default 10s). ctime-based staleness is rejected as "unsuitable for long running processes."

**Implications:** Heartbeat-based staleness is the industry-standard alternative to "writer alive?" process-liveness checks. Works across file systems and across OSes — works on any filesystem that preserves mtime. Does not require reading PID at all. Works across machines over a shared filesystem (with sync-latency caveats).

### Finding: Process-liveness checks (PID + hostname) are the complementary pattern
**Confidence:** CONFIRMED
**Evidence:** [logseq/logseq#3386](https://github.com/logseq/logseq/issues/3386)

```text
On start, logseq reads the current machine's hostname (or read/generate some other unique identifier) and create a file in a new lock/ directory. When this folder contains any file other than the current instance's file, it shows a warning to the user that a different instance of Logseq is running and goes into a read-only mode. The application also provides a button to force-exit this read-only mode for situations where the user knows better.
```

Logseq's proposed pattern: one file per instance rather than one shared lockfile. Hostname + instance ID distinguishes the two holders. User override exists for "I know better" (e.g. stale lockfile from crashed machine across network drive).

**Implications:** For cross-machine scenarios (iCloud/Dropbox sync), hostname is the only reliable discriminator — PIDs collide across machines. The "dir of files, one per holder" pattern scales to N readers + 1 writer (MVCC-like) more naturally than single-lockfile semantics.

### Finding: Electron child processes orphan on Windows during process-tree termination
**Confidence:** CONFIRMED
**Evidence:** [electron/electron#6120](https://github.com/electron/electron/issues/6120)

Production-reported: when killing Electron started from `child_process.fork` with ctrl-c, Electron orphans child processes approximately 30% of the time. `utilityProcess` inherits similar behavior on Windows.

**Implications:** Even "graceful" Electron shutdowns leak child processes a nontrivial fraction of the time. The cleanup strategy cannot rely on cascading kill. Two OS-level mitigations exist:
- **Windows:** Job Objects with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` — children assigned to the job die when the job handle (held by parent) closes, regardless of how the parent exits.
- **Linux:** `prctl(PR_SET_PDEATHSIG, SIGTERM)` — kernel signals child on parent death.
- **macOS:** NO equivalent primitive exists. Children are reparented to `launchd` (PID 1) and must self-detect parent death via polling, pipe-EOF, or a named IPC channel.

### Finding: macOS orphan adoption by launchd is documented as "expected, not solved"
**Confidence:** CONFIRMED
**Evidence:** [anthropics/claude-code#33947](https://github.com/anthropics/claude-code/issues/33947)

```text
Claude Code does not terminate MCP server child processes or subagent processes when a session ends (normal exit, crash, or terminal close). On macOS, these become orphans with PPID=1 (adopted by launchd) and accumulate indefinitely.
```

Real-world example of "MCP subprocess not cleaned up after parent death" — the exact pattern where a stdio MCP subprocess loses its parent and lingers.

**Implications:** MCP stdio subprocesses spawned by AI tools (Claude Desktop, Cursor) are at particular risk for accumulation when the parent crashes. Mitigation requires the subprocess itself to monitor stdin-EOF (standard MCP pattern — stdin close signals parent gone).

### Finding: Electron `requestSingleInstanceLock` has a Windows 10 race bug
**Confidence:** CONFIRMED
**Evidence:** [electron/electron#35680](https://github.com/electron/electron/issues/35680)

```text
On Windows, app.requestSingleInstanceLock() incorrectly returns true for both the first and second instance launches, when it should return false for the second instance. This prevents the single-instance lock mechanism from working as intended.
```

Reported in Electron 18.0.3 on Windows 10 Pro. Both instances claim the lock; first instance receives `second-instance` event with empty `additionalInfo`; new window is created instead of focusing existing.

**Implications:** The Electron built-in primitive is not 100% reliable on Windows. Production apps that layer on top of it (VS Code's three-layer approach) gain resilience precisely because the IPC pipe's EADDRINUSE is a strong primitive independent of Electron's implementation.

### Finding: File locks on network/sync filesystems are unreliable
**Confidence:** CONFIRMED
**Evidence:** apenwarr 2010-12-13 "Everything you never wanted to know about file locking"

```text
flock() does not work over NFS. For fcntl() locks... different kernels just lock the file locally, and don't notify the server. Some notify the server, but do it wrong.
fcntl() locks don't work on SMB filesystems mounted on MacOS X. There is no locking method that works reliably on all remote filesystems.
```

**Implications:** If a project directory lives on iCloud Drive, Dropbox, OneDrive, or a network share, OS-level file locks cannot be relied on. Application-level lockfiles with hostname + mtime-heartbeat become the only viable design.

### Finding: Dropbox/iCloud conflict-copy semantics produce `filename (Hostname's conflicted copy)` files
**Confidence:** INFERRED
**Evidence:** Dropbox help docs (general — conflict resolution) + iCloud general behavior (vendor convention)

Both services resolve concurrent writes by preserving both versions with hostname-suffixed filenames rather than blocking. A lockfile named `server.lock` written concurrently from two machines produces `server.lock` and `server (MacBook-Pro's conflicted copy).lock`.

**Implications:** The lockfile itself becomes a source of spurious "files" if two machines use it simultaneously. Readers must tolerate encountering conflict copies (skip them, don't treat as active locks).

### Finding: Electron deep-link cold-start passes URL via `process.argv`, with no pre-registration fallback
**Confidence:** CONFIRMED
**Evidence:** [Electron deep links docs](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app)

```text
If the app is completely closed and a protocol request is made, the second-instance event won't be triggered since the app is starting for the first time. Instead, you can retrieve the custom URL from process.argv
```

If no app is registered for a custom protocol (`myapp://`), the OS intercepts and shows an error dialog or browser "no app for this protocol" page. The `app.setAsDefaultProtocolClient()` call must have been made by a *previous* run of *some* app.

**Implications:** First-ever URL click cannot be handled by an app that isn't installed. Any "bootstrap via URL" flow must degrade to a web page (download link) for never-installed users. Secondary apps (CLI that could handle the URL without Electron) get no opportunity unless pre-registered.

### Finding: VS Code's stale-IPC-pipe retry path demonstrates the "unlink + retry once" pattern
**Confidence:** CONFIRMED
**Evidence:** `vscode/src/vs/code/electron-main/main.ts:336-360`

See D1 evidence file — one-shot unlink+retry on `ECONNREFUSED` (pipe exists but no listener — prior crash).

**Implications:** The pattern generalizes: on "lock exists but holder unreachable," one-shot recovery (unlink, re-acquire) with limited retry. Infinite retry loops are unsafe (could mask corruption); no retry is user-hostile (every crash requires manual cleanup).

### Finding: Electron child with `unref()` can prevent parent exit on Linux
**Confidence:** CONFIRMED
**Evidence:** [electron/electron#34808](https://github.com/electron/electron/issues/34808)

```text
When spawning a detached child process with unref() in Electron 19.0.7, the framework doesn't properly exit even though the child process is unreferenced. Electron emits the correct events, however some electron processes linger until the child process has completed.
```

**Implications:** Unreferenced children are not a safe way to "fire and forget" in Electron. Full `detached: true` + `stdio: 'ignore'` + `unref()` chain is required on Linux; even then, platform bugs observed.

---

## Negative searches (for NOT FOUND)

- **GitKraken/Tower "repository already open" dialog:** Searched "GitKraken Tower 'repository already open' dialog single instance" — no public documentation or issue threads found. Git GUI apps likely allow multiple open repos with implicit in-process routing, not dialog-based gating.
- **Xcode/Android Studio concurrent-access lock mechanism:** Searched "Xcode Android Studio 'project is already open' concurrent access" — no clear public documentation of lock primitives. Both IDEs rely on JVM/IDEA single-instance lock plus per-project `.idea/` directory writes, but specific cross-IDE collision behavior not documented.

---

## Gaps / follow-ups

- Electron's `utilityProcess` specific behavior under macOS OOM-kill of the parent is not documented — would require experimental verification.
- Whether `proper-lockfile` defaults (10s stale / 5s heartbeat) are appropriate for project-level locks (where a crash during a long operation might exceed 10s) is a per-product decision.
