# Evidence: Upstream sync flow — how git pull reaches the shadow repo and timeline

**Date:** 2026-04-14
**Sources:** `packages/server/src/standalone.ts`, `shadow-repo.ts`, `head-watcher.ts`, `persistence.ts`, `file-watcher.ts`, `reconciliation.ts`, `api-extension.ts`, `timeline-query.ts`

---

## Finding: The upstream-import pipeline is fully functional during active server sessions

When a user runs `git pull origin main` while the server is running:

1. HEAD watcher detects `.git/HEAD` change → `handleGitEvent()` → `inBatch = true` → `onBatchBegin()` fires
2. `onBatchBegin` flushes L1/L2, parks Y.Doc state, sets `setBatchInProgress(true)`
3. Working tree files change; file-watcher buffers DiskEvents
4. 100ms quiet window → `onBatchEnd` fires → `setBatchInProgress(false)` → `drainEventBuffer()`
5. Reconciliation runs per-doc (three-way merge: base=reconciledBase, ours=Y.Doc, theirs=disk)
6. `commitUpstreamImport()` creates a shadow commit on `refs/wip/<branch>/upstream`

**commitUpstreamImport trigger condition** (`standalone.ts:1056`):
```
if (info.headMoved && info.newHead && shadowRef.current && bufferedCount > 0)
```

Requires: HEAD moved AND at least one file changed. User's local `git commit` (HEAD moves, no disk change) does NOT trigger upstream import.

## Finding: No mechanism persists state across server restarts

Confirmed absent by end-to-end read:

| State | Persisted? | Location |
|---|---|---|
| `reconciledBaseByBranch` | No | In-memory Map (`persistence.ts:56-114`) |
| `lastKnownHash` | No | In-memory Map (`file-watcher.ts:108-127`) |
| `oldHead` / `lastKnownBranch` | No | Local variables (`head-watcher.ts:150-151`) |
| Shadow WIP refs | Yes | Git refs in shadow repo — but never compared against disk at startup |
| `lastKnownHead` file | Does not exist | No file in `.open-knowledge/` or shadow dir stores this |

## Finding: onLoadDocument() always reads from disk, not shadow

`persistence.ts:317-390`: `readFileSync(filePath)` → parse → populate Y.Doc. Shadow WIP from prior session is silently orphaned. `reconciledBase` is set to current (possibly post-pull) disk content.

## Finding: Direct file edits (non-HEAD) are treated as session-local both online and offline

- Online: file-watcher → `applyExternalChange()` → Y.Doc updated → folded into next WIP commit (server writer, not upstream)
- Offline: `onLoadDocument()` loads from disk → same treatment on next WIP commit
- Consistent behavior: non-git file changes are never classified as `type: 'upstream'`

## Finding: The `!oldHead` message branch in commitUpstreamImport already supports T0

`shadow-repo.ts:220-224`:
```typescript
const message = oldHead
  ? `upstream: import from ${oldHead.slice(0, 8)}..${newHead.slice(0, 8)}`
  : `upstream: initial import at ${newHead.slice(0, 8)}`;
```

This code path exists but is never called today. The startup HEAD-drift check activates it.

## Proposed mechanism: startup HEAD-drift check

```
On server startup (after initShadowRepo):
  1. Read <shadowDir>/last-known-head (one-line text file)
  2. Read current project HEAD SHA
  3. If different (including null → SHA for fresh shadow):
     → commitUpstreamImport(shadow, contentRoot, lastKnownHead, currentHead, branch)
  4. Write currentHead to <shadowDir>/last-known-head

On server shutdown (in destroy(), before shadow lock release):
  → Write currentHead to <shadowDir>/last-known-head
```

Handles: fresh clone (null → SHA), offline git pull (old SHA → new SHA), offline git checkout, offline git merge. Does NOT fire for: direct file edits (no HEAD movement) — consistent with online behavior.
