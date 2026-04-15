# Evidence: Git-Editor Auto-Sync Scheduler Dynamics

**Dimension:** D8 extension — Auto-Sync Scheduler Dynamics
**Date:** 2026-04-15
**Sources:** Vinzent03/obsidian-git, logseq/git-auto, siyuan-note/dejavu, siyuan-note/siyuan, laurent22/joplin

---

## Key files referenced

- `Vinzent03/obsidian-git/src/automaticsManager.ts` — timer chain scheduling, debounce wiring, pause/resume, last-auto persistence
- `Vinzent03/obsidian-git/src/promiseQueue.ts` — FIFO task queue, serialization
- `Vinzent03/obsidian-git/src/main.ts` — vault event registration, command-to-queue wiring
- `logseq/git-auto` (shell script) — `while true; sleep $interval; done` loop
- `siyuan-note/siyuan/kernel/model/sync.go` — `SyncDataJob()`, `planSyncAfter()`, `autoSyncErrCount`, sync mode gating
- `siyuan-note/dejavu/sync_lock.go` — cloud-level distributed mutex (65s TTL, 30s refresh, 3-retry)
- `laurent22/joplin/packages/lib/Synchronizer.ts` — lock-based serialization, `TaskQueue`, `progressReport_`

---

## Findings

### Finding: Obsidian-Git uses chained one-shot setTimeout, not setInterval
**Confidence:** CONFIRMED
**Evidence:** `automaticsManager.ts:124-165`

The scheduler uses `window.setTimeout` chained through the PromiseQueue's completion callback. The next timer starts only after the current operation completes, meaning interval is measured from end-of-operation, not wall-clock cadence. Three independent timers: `timeoutIDCommitAndSync`, `timeoutIDPush`, `timeoutIDPull`.

### Finding: Obsidian-Git persists last-auto timestamps for restart resumption
**Confidence:** CONFIRMED
**Evidence:** `automaticsManager.ts:19-30, 51-68, 244-252`

On restart, `loadLastAuto()` reads `localStorage` timestamps and computes remaining wait. A 20-min interval with 12 min elapsed resumes at 8 min, not 20. This is the only surveyed git editor that prevents burst-on-restart behavior.

### Finding: Obsidian-Git's PromiseQueue serializes user-triggered and auto-triggered operations identically
**Confidence:** CONFIRMED
**Evidence:** `promiseQueue.ts`, `main.ts`

User-triggered commands (via Obsidian command palette) and auto-triggered operations both call `promiseQueue.addTask()`. No preemption — user tasks queue behind running auto tasks.

### Finding: Obsidian-Git has zero idle/activity detection for commit gating
**Confidence:** CONFIRMED
**Evidence:** `automaticsManager.ts`

The debouncer fires after the last file change regardless of active editing. No concept of "user is idle" before committing. The `autoBackupAfterFileChange` debounce triggers from vault modify/delete/create/rename events via Obsidian's `debounce()`, trailing-edge.

### Finding: Obsidian-Git has zero error backoff — errors are logged and the timer reschedules normally
**Confidence:** CONFIRMED
**Evidence:** `promiseQueue.ts`

On error: `displayError(e)` is called, the queue continues to next task, and the scheduler reschedules at the normal interval. No error counter, no backoff, no circuit-breaker.

### Finding: logseq/git-auto is a stateless shell loop with no retry, debounce, or persistence
**Confidence:** CONFIRMED
**Evidence:** `git-auto` shell script (archived Nov 2022)

`while true; sleep $interval; done` with default 20s. Fixed sleep after git commands complete. `set -e` commented out — failures are silent. No queue, no debounce, no state persistence, no user-triggered coordination (standalone daemon).

### Finding: SiYuan implements counted exponential-equivalent backoff after 7+ failures
**Confidence:** CONFIRMED
**Evidence:** `siyuan/kernel/model/sync.go:241-245, 282-284, 332, 571-575`

After 7 consecutive auto-sync failures, auto-sync is blocked (manual still works via `byHand=true`). On 8th failure, `planSyncAfter(fixSyncInterval)` schedules a 5-minute retry. After 15 failures total, backoff extends to 64 minutes. Minimum interval floor: 30s; maximum: 43200s (12h).

### Finding: SiYuan/dejavu implements a distributed cloud-level mutex for multi-device sync
**Confidence:** CONFIRMED
**Evidence:** `dejavu/sync_lock.go`

Cloud-stored `lock-sync` object with 65-second TTL, refreshed every 30s. Acquisition retried 3 times with 5-second backoff. Prevents two devices from syncing simultaneously. The only surveyed tool with a distributed concurrency primitive.

### Finding: Joplin uses lock-based serialization with per-item error tracking
**Confidence:** CONFIRMED
**Evidence:** `Synchronizer.ts`

Sync serialized by `lockHandler().acquireLock(LockType.Sync)`. `isCannotSyncError()` classifies items that should be disabled from future sync attempts. `cancelling_` flag for graceful mid-cycle abort. `TaskQueue('syncDownload')` parallelizes downloads within a cycle.

### Finding: Foam and Dendron have no auto-git-sync capability
**Confidence:** INFERRED
**Evidence:** GitHub repos, community docs

Foam is VS Code-only, focused on linking/graph. Dendron has a manual `SyncCommand` (git pull + push) but no auto-interval scheduling.

---

## Comparative Table

| Tool | Trigger | Debounce | Queue | Concurrent Guard | Error Recovery | Restart State |
|------|---------|----------|-------|-----------------|----------------|---------------|
| Obsidian-Git | Hybrid (timer chain + event debounce) | Trailing, per-setting | FIFO PromiseQueue | Queue serialization | None — log + continue | Last-auto timestamps in localStorage |
| logseq/git-auto | Interval loop (shell sleep) | None | None | Shell loop implicit | None — silent fail | None |
| SiYuan/dejavu | Hybrid (poll gate + manual) | `planSyncAfter()` | Mutex serialization | Mutex + `isSyncing` atomic | Counted backoff (7→block, 8→5min, 15→64min) | In-memory only |
| Joplin | External scheduler | External | TaskQueue + lock | Lock acquisition | Per-item disablement | Sync token in DB |

---

## Gaps / follow-ups

- TinaCMS debounce timing was not confirmed at source level
- Obsidian-Git mobile background execution constraints (OS-level timer throttling) not verified
- Joplin's external scheduler cadence ("few seconds / few minutes") not confirmed at source level
