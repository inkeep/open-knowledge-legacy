---
name: Bridge surface map
description: File-by-file map of the bridge layer, debounce sites, origin objects, scheduler topology, and Path A/B selection
sources:
  - packages/core/src/bridge/
  - packages/server/src/server-observers.ts
  - packages/server/src/server-observer-extension.ts
  - packages/app/src/editor/observers.ts
  - packages/app/tests/integration/test-harness.ts
  - packages/app/tests/integration/network-control.ts
  - packages/app/tests/stress/bridge-convergence.fuzz.test.ts
date: 2026-04-16
---

# Bridge surface map (pre-refactor)

Produced by Opus /explore subagent. Authoritative for current-state SPEC §8.

## Module structure

```
packages/core/src/bridge/
├── apply-diff.ts         — applyIncrementalDiff + applyFastDiff (shared write primitives)
├── diff-lines.ts         — diffLinesFast (helper for applyIncrementalDiff)
├── frontmatter-y.ts      — getFrontmatter (Y.Map ↔ Y.Text bridge)
├── index.ts              — barrel export
├── merge-three-way.ts    — hybrid diff3+DMP three-way merge (Path B)
├── normalize.ts          — normalizeBridge (trailing ws, blank-line collapse)
└── scheduler.ts          — Scheduler interface + defaultScheduler passthrough

Bridge consumers:
├── packages/server/src/server-observers.ts           — Observer A + Observer B
├── packages/server/src/server-observer-extension.ts  — Hocuspocus lifecycle wiring
├── packages/server/src/agent-sessions.ts             — applyAgentMarkdownWrite
├── packages/server/src/external-change.ts            — applyExternalChange (file-watcher)
├── packages/server/src/api-extension.ts              — rollback + managed-rename
└── packages/app/src/editor/observers.ts              — CLIENT baseline tracker only (write paths deleted)
```

## Debounce + scheduler topology (Bucket B target)

Total `setTimeout`-family calls across bridge surfaces:

| File | Line | Call | Why |
|---|---|---|---|
| `packages/core/src/bridge/scheduler.ts` | 38 | `globalThis.setTimeout` | defaultScheduler passthrough |
| `packages/server/src/server-observers.ts` | 234 | `sched.setTimeout(runObserverASync, DEBOUNCE_MS)` | Observer A debounce (paired-write error fallback) |
| `packages/server/src/server-observers.ts` | 240 | `sched.setTimeout(runObserverASync, DEBOUNCE_MS)` | Observer A debounce (normal path) |
| `packages/server/src/server-observers.ts` | 286 | `sched.setTimeout(runObserverBSync, DEBOUNCE_MS)` | Observer B self-reschedule when Observer A pending |
| `packages/server/src/server-observers.ts` | 387 | `sched.setTimeout(runObserverBSync, DEBOUNCE_MS)` | Observer B debounce (normal path) |
| `packages/server/src/server-observer-extension.ts` | 77 | `setTimeout(...)` — **NOT via scheduler** | 5000ms observer-attach retry; escape hatch (NOT a debounce) |
| `packages/app/src/editor/observers.ts` | 292 | `sched.setTimeout(runObserverASync, DEBOUNCE_MS)` | Client Observer A (baseline only now; deleted cross-CRDT writes) |
| `packages/app/src/editor/observers.ts` | 315 | `sched.setTimeout(runObserverBSync, waitMs)` | Client Observer B typing-defer reschedule |
| `packages/app/src/editor/observers.ts` | 321 | `sched.setTimeout(runObserverBSync, ...)` | Client Observer B remote-tree grace reschedule |
| `packages/app/src/editor/observers.ts` | 410 | `sched.setTimeout(runObserverBSync, DEBOUNCE_MS)` | Client Observer B debounce |

**Test-side `wait(ms)`:** 190 occurrences across 28 files in `packages/app/tests/` (verified at baseline `432a834b`). Load-bearing in fuzz harness (line 353 `wait(1500)` initial settle, line 387 `wait(800)` per convergence-poll attempt).

**`afterAllTransactions` listeners in repo today: ZERO** (grep confirmed).
**`afterTransaction` listeners: 11** (`attachBridgeInvariantWatcher` + 8 server-observer test listeners + 1 client observers test + the watcher's detach handler). PRECEDENT: `attachBridgeInvariantWatcher` already uses transaction-based hook, not debounce.

## Origin objects (precedent #1)

| Origin | File | Line | `skipStoreHooks` | Context label |
|---|---|---|---|---|
| `OBSERVER_SYNC_ORIGIN` | `packages/server/src/server-observers.ts` | 56-60 | `true` | `'observer-sync'` |
| `AGENT_WRITE_ORIGIN` | `packages/server/src/agent-sessions.ts` | 52-56 | `false` | `'agent-write'` |
| `FILE_WATCHER_ORIGIN` | `packages/server/src/external-change.ts` | 27-31 | `true` | `'file-watcher'` |
| `ROLLBACK_ORIGIN` | `packages/server/src/api-extension.ts` | 104-108 | `false` | `'rollback-apply'` |
| `MANAGED_RENAME_ORIGIN` | `packages/server/src/api-extension.ts` | 110-114 | `false` | `'managed-rename'` (not exported) |
| `ORIGIN_TREE_TO_TEXT` | `packages/app/src/editor/observers.ts` | 57-61 | `false` | `'sync-from-tree'` (client; no-op writers) |
| `ORIGIN_TEXT_TO_TREE` | `packages/app/src/editor/observers.ts` | 67-71 | `false` | `'sync-from-text'` (client; no-op writers) |

**`BRIDGE_ENFORCING_ORIGINS`** (`test-harness.ts:526-533`): 6 entries — all except `MANAGED_RENAME_ORIGIN`. Surfaces a question: is the omission intentional or an oversight?

## Path A vs Path B selection

`server-observers.ts:166-175`:

```ts
doc.transact(() => {
  if (currentText === lastSyncedXmlMd) {
    // Path A: Y.Text in sync with baseline — use diffLines
    applyIncrementalDiff(ytext, currentText, md);
  } else {
    // Path B: Y.Text diverged — hybrid diff3+DMP three-way merge
    const mergedText = mergeThreeWay(lastSyncedXmlMd, md, currentText);
    applyFastDiff(ytext, currentText, mergedText);
  }
}, OBSERVER_SYNC_ORIGIN);
```

Pre-branch normalized gate (`server-observers.ts:161`): `if (normalizeBridge(currentText) === normalizeBridge(md)) early-exit` — handles trivial in-sync case.

## Observer A/B early-exit on origin

**Observer A** (`server-observers.ts:204-241`):
- `if (transaction.origin === OBSERVER_SYNC_ORIGIN) return;` — self-skip (line 206)
- `if (isPairedWriteOrigin(transaction.origin)) { sync baseline + cancel debounce + return; }` — paired-write handling (line 214)
- `isPairedWriteOrigin` matches `AGENT_WRITE_ORIGIN || FILE_WATCHER_ORIGIN` (line 82-83)

**Observer B** (`server-observers.ts:378-388`):
- `if (transaction.origin === OBSERVER_SYNC_ORIGIN) return;` — self-skip (line 380)
- **NO `isPairedWriteOrigin` check** — relies on internal `runObserverBSync`'s already-in-sync gate (line 298) to early-exit harmlessly
- Comment at lines 382-384 calls this asymmetry out explicitly (line 381 is blank)

**This asymmetry is the proximate cause of the seed `1776386718697` failure** (see `evidence/seed-1776386718697-characterization.md`).

## `applyFastDiff` call sites (precedent #11)

| File | Line | Caller | Origin | Wrapped in `doc.transact` |
|---|---|---|---|---|
| `packages/server/src/server-observers.ts` | 173 | Observer A Path B | `OBSERVER_SYNC_ORIGIN` | Yes (line 166) |
| `packages/server/src/agent-sessions.ts` | 130 | `applyAgentMarkdownWrite` | typically `AGENT_WRITE_ORIGIN` | Caller's responsibility |
| `packages/server/src/external-change.ts` | 70 | `applyExternalChange` | `FILE_WATCHER_ORIGIN` | Yes (line 61) |
| `packages/server/src/api-extension.ts` | 814 | `applyManagedRenameToLoadedDocument` | `MANAGED_RENAME_ORIGIN` | Yes (line 794) |

`applyFastDiff` precondition (`currentText === ytext.toString()`) is implicit — not asserted. All callers satisfy it, but the implicit dependency is a refactor risk.

## `attachBridgeInvariantWatcher` is transaction-settlement-based (precedent)

`test-harness.ts:572-611`:
```ts
const afterTx = (tx: Y.Transaction): void => {
  if (!enforcing.has(tx.origin)) return;
  // compare normalized Y.Text vs serialized XmlFragment, throw on mismatch
};
doc.on('afterTransaction', afterTx);
```

This is the in-house precedent for transaction-hook-based bridge code. Note: uses `afterTransaction` (per-tx) not `afterAllTransactions` (per-drain). Both are stable Yjs APIs; for bridge propagation we want per-drain.

## CLAUDE.md precedent anchors

**Precedent #11(b)** (`CLAUDE.md:87`):
> (b) **Hybrid diff3+DMP merge for divergent paths** — line-level diff3 handles structural merge and deduplication (D8/T3); character-level DMP within conflict regions handles sub-line edits. `applyFastDiff` (DMP `diff_main`) applies the merged result to Y.Text with character-level precision, preserving CRDT Items for unchanged content.

**Precedent #13(b)** (`CLAUDE.md:93`):
> (b) **Implicit time-coupling is a test smell.** Observer debounces go through an injected `Scheduler` so tests are deterministic; production gets `setTimeout` passthrough. `wait(ms)` in new bridge tests requires justification.

Both will need updating post-refactor (see SPEC §6 R11).
