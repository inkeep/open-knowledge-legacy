# Evidence D8: Lock-File Patterns for Subprocess Exclusivity

**Dimension:** D8 (P1) — Filesystem-level "only one owner" patterns
**Date:** 2026-04-17
**Sources:** proper-lockfile npm package (moxystudio), Electron docs on `requestSingleInstanceLock`

---

## Key sources

- [proper-lockfile — moxystudio/node-proper-lockfile](https://github.com/moxystudio/node-proper-lockfile)
- [proper-lockfile — npm docs cached copy via npm-compare](https://npm-compare.com/async-lock,lockfile,proper-lockfile)
- [Electron app.requestSingleInstanceLock()](https://www.electronjs.org/docs/latest/api/app) (referenced in D1/D2)

---

## Findings

### Finding D8a: `proper-lockfile` uses mkdir() as its atomic primitive, not O_CREAT|O_EXCL

**Confidence:** CONFIRMED
**Evidence:** [node-proper-lockfile README](https://github.com/moxystudio/node-proper-lockfile) (fetched via WebFetch)

> "The library uses the mkdir strategy, which works atomically on any kind of file system, even network based ones. The lockfile path is created by appending .lock to the target file path."

**Implications:**
- `mkdir` is atomic on every known filesystem (including NFS, SMB, overlay FS), whereas `open(O_CREAT|O_EXCL)` has known non-atomicity issues on some NFS implementations.
- For a `server.lock`-style exclusive-owner file, prefer `mkdir <path>.lock` over `open(path, O_CREAT|O_EXCL)` for cross-platform robustness.
- This has implications for shape: the "lock" is a directory, not a file. Metadata (pid, port, host) goes inside the directory as a separate file.

---

### Finding D8b: Stale-lock detection uses periodic mtime updates, not creation time

**Confidence:** CONFIRMED
**Evidence:** proper-lockfile README

> "The lockfile staleness check is done via ctime... which is unsuitable for long running processes. proper-lockfile constantly updates lockfiles mtime to do proper staleness check. When a lock is successfully acquired, the lockfile's mtime (modified time) is periodically updated to prevent staleness."

Default thresholds:
- `stale`: 10000 ms (minimum 5000 ms)
- `update`: `stale/2` by default (min 1000 ms, max `stale/2`)

**Implications:**
- A lock holder MUST maintain the mtime heartbeat to prevent other processes from stealing its lock after 10s of inactivity.
- If the holder pauses (e.g., debugger break), its lock may be considered stale.
- For a long-running Hocuspocus server, mtime heartbeats at <5s interval are required. A simple "PID in file" lock without heartbeats is insufficient for stale detection.

---

### Finding D8c: `onCompromised` callback handles the case where the holder loses the lock mid-use

**Confidence:** CONFIRMED
**Evidence:** proper-lockfile README

> "onCompromised: It gets called if the lock gets compromised. By default it simply throws an error that will probably cause the process to die."

Scenarios that compromise a lock mid-hold:
- mtime update fails (filesystem full, permission revoked)
- mtime update takes longer than the update interval (process paused or FS extremely slow)
- Another process successfully steals the lock (via stale detection race)

**Implications:**
- A holder must handle the compromised case gracefully — its assumptions about exclusivity are now invalid.
- For a server process that discovers its lock is compromised mid-run, the safe response is: refuse further writes, emit a "degraded/recover-needed" state to the UI, and eventually exit.

---

### Finding D8d: `requestSingleInstanceLock()` in Electron is whole-app, not per-project

**Confidence:** CONFIRMED
**Evidence:** `logseq/src/electron/electron/core.cljs:321-353` + `desktop/app/src/main-process/main.ts:175-193` (quoted in D2a + D8 context)

Electron provides `app.requestSingleInstanceLock()` at the *whole app* level. The second launch gets `false` and typically calls `app.quit()`, after emitting `second-instance` on the first.

```ts
// Pattern: desktop/app/src/main-process/main.ts
const gotSingleInstanceLock = app.requestSingleInstanceLock()
isDuplicateInstance = !gotSingleInstanceLock
app.on('second-instance', (event, args, workingDirectory) => {
  // Focus main window
  if (mainWindow) { mainWindow.focus() }
  handleCommandLineArguments(args)
})
if (isDuplicateInstance) { app.quit() }
```

**Implications:**
- `requestSingleInstanceLock` gives us "one app process per user" but does NOT give us "one subprocess per project."
- For per-project exclusivity (our case), we need an application-level lock file in each project directory, separate from the app-level lock.
- VS Code does NOT use a per-workspace lock file. Its exclusivity is enforced in-memory by `findWindowOnWorkspaceOrFolder` (since it's a single-instance app, all windows live in the same main process and can be iterated).

---

### Finding D8e: Foreign-host handling — no canonical npm solution; proper-lockfile stops at "mtime heartbeat"

**Confidence:** INFERRED
**Evidence:** proper-lockfile README silent on foreign-host detection; general POSIX semantics

proper-lockfile does not detect whether a pid in the lock file belongs to a different hostname. For desktop Electron apps this is mostly a non-issue (user's own machine), but it matters when the "content directory" is on a network filesystem (iCloud Drive, Dropbox, Nextcloud, NFS).

**Implications:**
- If the content directory may be synced across machines, the lock file pid is ambiguous (pid 1234 on Mac ≠ pid 1234 on Linux). Need to store `{pid, hostname, bootId?}` in the lock file.
- Safe default: if the hostname in the lock differs from `os.hostname()`, treat the lock as "held by another host" and refuse — don't claim stale unless heartbeat is verifiably dead (which requires out-of-band check, generally impossible cross-host).
- The Open Knowledge spec's server.lock already encodes `worktreeRoot` and `hostname` which is the correct direction.

---

### Finding D8f: Lock-file metadata — recommended shape

**Confidence:** INFERRED (synthesis across proper-lockfile + VS Code + Open Knowledge's own prior server.lock design)

Recommended fields for a per-project `server.lock`:
- `pid` (number) — lock holder PID
- `hostname` (string) — `os.hostname()` at acquire time; foreign-host gate
- `port` (number or 0) — HTTP port (once bound); 0 = "starting"
- `startedAt` (ISO string) — for debugging
- `worktreeRoot` (string) — which working tree claimed the lock
- `electronApp` (string) — identify which app brand/version holds it (useful for multi-app scenarios)

Acquisition protocol:
1. `mkdir <lockDir>` atomically (fails if exists)
2. If fails, read metadata from existing lock; decide: same-host+dead-pid → steal (rename+remove old, then step 1); same-host+live-pid → collision; different-host → collision-foreign
3. Write metadata JSON into `<lockDir>/meta.json`
4. Start mtime heartbeat thread

**Implications:**
- The "file-based lock" archetype is well-understood; the design risks are in the stale-detection edge cases, not the happy path.
- Our design's `runClean` on Electron boot handles "stale lock from crashed prior run" by checking pid liveness + host match — this matches proper-lockfile's stale detection mechanism but without the mtime heartbeat overhead.

---

## Gaps / follow-ups

- Did not inspect VS Code's `FileUserDataProvider` in detail — sample mentioned in research ask, but VS Code doesn't appear to use per-workspace filesystem locks at all.
- Did not test proper-lockfile's behavior on macOS iCloud Drive (known edge case for atomic ops).
