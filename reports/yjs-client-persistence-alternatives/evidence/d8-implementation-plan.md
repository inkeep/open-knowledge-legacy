# Evidence: D8 — Implementation plan (synthesis, operational)

**Dimension:** End-to-end commit-by-commit plan to adopt Shape 2+ (y-indexeddb + instance-ID defense + buffer-and-replay + branch-invalidation broadcasting), removing the server-side sidecar.
**Date:** 2026-04-24
**Sources:** D1–D7 evidence; prior PR #311 experience; OK's CLAUDE.md conventions.

This file is the **operational spec** for the implementation. See also `reports/yjs-client-persistence-alternatives/REPORT.md` for the synthesis and `plans/` directory for the TDD-anchored execution checklist derived from this spec.

---

## Phase 0 — Pre-implementation preparation

### 0.1 Skill loads (at start of implementation session)

Load, in order:
1. **`/eng:tdd`** — anchors every production change to a failing test first. Applies throughout Phases 1-6.
2. **`/eng:type-safety`** — governs schema design (Zod `.loose()`, branded types, discriminated unions). Applies primarily to Phases 2 + 4.
3. **`/eng:typescript-api-design`** — boundary shape design for new modules. Applies to Phases 2, 3, 4 (new files with exported API).

### 0.2 Worktree setup

Already in worktree `fix-crdt-restart-sidecar`. New work creates a branch off current HEAD. Since this supersedes PR #311's architectural direction, either:
- **Option A:** Amend the current PR #311 branch with Shape 2+ changes (revert sidecar + add client persistence + add buffer-and-replay). Keeps history as "fix CRDT restart" evolving.
- **Option B:** New branch `feat-client-persistence-replaces-sidecar` off `main`; close PR #311 unmerged; open new PR.

**Recommendation:** Option A. History tells the fuller story of arriving at the correct architecture; the PR is not yet merged; force-pushing is appropriate for an evolving PR.

### 0.3 Dependencies

Add to `packages/app/package.json`:
```json
{
  "dependencies": {
    "y-indexeddb": "9.0.12"
  },
  "devDependencies": {
    "fake-indexeddb": "^6.0.0"
  }
}
```

Add to root `package.json`:
```json
{
  "patchedDependencies": {
    "remark-prosemirror@0.1.5": "patches/remark-prosemirror@0.1.5.patch",
    "y-indexeddb@9.0.12": "patches/y-indexeddb@9.0.12.patch"
  }
}
```

Run `bun install` after each package.json change (and commit `bun.lock`).

### 0.4 Test environment bootstrap

`packages/app/bunfig.toml` (create or modify):
```toml
[test]
preload = ["./tests/integration/idb-preload.ts"]
```

`packages/app/tests/integration/idb-preload.ts`:
```ts
import 'fake-indexeddb/auto';
```

Commit as "chore(app): set up fake-indexeddb test preload" — isolated, non-breaking.

---

## Phase 1 — Revert server-side sidecar (TDD-led)

### 1.1 Remove server-side sidecar module and integration

**TDD stance:** Existing passing tests act as the regression gate. Removing sidecar should not break any test in the 11-test suite EXCEPT T5's specific mechanism assertion. Other test behavior stays intact because:
- Instance-ID defense remains.
- Markdown remains source of truth.
- `updateYFragment` on markdown remains the server's rebuild path.
- Client side is unchanged at this phase — tests T1-T11 still exercise the same behavior.

**Order of changes:**

1. Delete `packages/server/src/sidecar.ts`.
2. Delete `packages/server/src/sidecar.test.ts`.
3. Modify `packages/server/src/persistence.ts`:
   - Remove `tryLoadFromSidecar` helper (~100 LOC).
   - Remove `writeSidecar` call from `onStoreDocument` (~8 LOC).
   - Remove sidecar-specific log events.
   - `onLoadDocument` simplifies back to markdown-only path.
4. Modify `packages/server/src/persistence.test.ts`:
   - Remove sidecar-specific test cases (~200 LOC removed).
   - Keep existing markdown-path tests unchanged.
5. Modify `packages/server/src/standalone.ts`:
   - Remove `deleteSidecarsForBranch` call in `onBatchBegin`.
6. Modify `packages/server/src/index.ts`:
   - Remove sidecar re-exports.
7. Modify `packages/server/src/fs-traced.ts`:
   - Check if `tracedUnlink` / `tracedRm` are used elsewhere. If sidecar-only, remove. If used by any other site, keep.
8. Modify `packages/cli/src/content/init.ts`:
   - Remove `.open-knowledge/ystate/` scaffolding (if present).

**Verification after Phase 1:**
- `bun run check` at workspace root — all non-T1/T2/T4/T6/T9/T10 tests should remain passing.
- **T1/T2/T4/T6/T9/T10 regression expected.** These PASSED on PR #311's Shape 0. Without sidecar AND without client persistence, they now FAIL (content duplication on restart). This is the temporary intermediate state.
- T3, T5, T7, T8, T11 should still PASS — they either test unrelated mechanisms or don't exercise the sidecar path.

Commit: `refactor(server): remove sidecar module in preparation for client-side replacement`.

Expected state after Phase 1: 11 tests, 5 pass / 6 fail. Direction is clear; tests are red-gating the next phases.

---

## Phase 2 — Client-side persistence primitive

### 2.1 Create `client-persistence.ts`

TDD: write failing tests FIRST for each new primitive.

**File:** `packages/app/src/editor/client-persistence.ts`

**Exports:**
- `interface ClientPersistenceProvider { whenSynced: Promise<this>; destroy(): Promise<void>; clearData(): Promise<void>; }`
- `createClientPersistence(docName: string, doc: Y.Doc): ClientPersistenceProvider` — wraps `IndexeddbPersistence` with OK's error-handling and OTel telemetry.
- `computeUnsyncedUpdate(doc: Y.Doc, lastAckedStateVector: Uint8Array): Uint8Array` — buffer-and-replay helper.
- `captureStateVector(doc: Y.Doc): Uint8Array` — trivial wrapper around `Y.encodeStateVector`; typed.

**Type safety (per /type-safety skill):**
- Brand `DocName` as `string & { __brand: 'DocName' }`.
- Return types: `HydrationResult = { kind: 'hydrated-from-idb' } | { kind: 'empty' } | { kind: 'error', err: unknown }`.
- Zod schema for custom kv values stored (if any).

**Test plan (per /tdd skill):** RED → GREEN → REFACTOR

`packages/app/src/editor/client-persistence.test.ts`:
- `test('createClientPersistence hydrates Y.Doc from empty fake-IDB')` — RED first (function doesn't exist).
- `test('createClientPersistence persists updates applied to Y.Doc')`
- `test('createClientPersistence filters out self-originated updates')` (origin check).
- `test('createClientPersistence clearData wipes fake-IDB for this docName')`
- `test('createClientPersistence destroy preserves fake-IDB data')`
- `test('computeUnsyncedUpdate returns empty-update when state vectors equal')`
- `test('computeUnsyncedUpdate returns only items not in lastAckedStateVector')`
- `test('computeUnsyncedUpdate round-trips: apply to fresh doc yields same unsynced content')`

Each test written red-first, then minimal production code to green. Then refactor.

**Success criteria:** Unit suite green. Client-persistence module is unit-tested in isolation.

Commit: `feat(app): add client-persistence primitive with buffer-and-replay helpers`.

### 2.2 Create `y-indexeddb@9.0.12.patch`

Patch contents per D7. Apply and test that upstream's `PREFERRED_TRIM_SIZE` behavior + issue #31 fix both work under fake-indexeddb.

Commit: `build(app): apply patchedDependencies patch for y-indexeddb`.

---

## Phase 3 — Wire client persistence into ProviderPool

### 3.1 Attach persistence in `open()`

TDD first: failing tests for provider-pool with persistence.

`packages/app/src/editor/provider-pool.test.ts` additions:
- `test('open() constructs client persistence for each docName')`
- `test('open() reuses existing persistence on repeated open() of same docName')`
- `test('recycleDisconnectedEntry destroys persistence BEFORE destroying provider')`
- `test('evictLru destroys persistence for evicted entry')`
- `test('disposeAll destroys all persistences')`

Production code in `packages/app/src/editor/provider-pool.ts`:
- Add `persistence: ClientPersistenceProvider | null` to `PoolEntry`.
- In `open()`, after `new HocuspocusProvider(...)`, construct persistence: `entry.persistence = createClientPersistence(docName, provider.document)`.
- In `recycleDisconnectedEntry` + `evictLru` + `disposeAll` + `recycleAllEntries`: `await entry.persistence?.destroy()` BEFORE `provider.destroy()`.

**Expected impact on 11-test suite:** T1-T11 behavior unchanged at this point because `authenticationFailed` recycle path doesn't yet call `clearData()`. Still 5 pass / 6 fail (same as Phase 1).

Commit: `feat(app): attach y-indexeddb persistence to each provider-pool entry`.

### 3.2 Wire buffer-and-replay into `recycleAllEntries`

TDD: write failing tests that exercise buffer-and-replay during mismatch-recycle.

`packages/app/tests/integration/provider-pool-buffer-replay.test.ts` (new, T12):
- Simulate: client syncs with server → server restarts (new instance ID) → client has unsynced burst of typing → authenticationFailed fires → client recycles → fresh sync → assert burst content is present.
- This test fails pre-implementation.

Production code in `provider-pool.ts`:
- On `provider.on('synced')`, capture `entry.lastServerSyncedSV = Y.encodeStateVector(provider.document)`.
- On `authenticationFailed` with `reason: 'server-instance-mismatch'`:
  1. For each entry, compute `unsyncedBytes = computeUnsyncedUpdate(entry.provider.document, entry.lastServerSyncedSV)`.
  2. Store `unsyncedBytes` in memory on a new `bufferedUpdates` map, keyed by `docName`.
  3. Call `entry.persistence.clearData()`.
  4. Call existing recycle path (destroys provider, triggers re-open on next access).
- On subsequent `open(docName)` re-construction:
  - Subscribe to the fresh provider's first `synced` event.
  - At that moment, check `bufferedUpdates.get(docName)`. If present:
    - `Y.applyUpdate(newDoc, bufferedUpdates.get(docName), origin=clientId)` to re-apply.
    - Delete from `bufferedUpdates`.
  - HocuspocusProvider will propagate replayed updates to server via normal sync.

Type-safety: `bufferedUpdates: Map<DocName, Uint8Array>`.

**Expected impact on 11-test suite after Phase 3.2:**
- T1, T2, T4, T6, T9, T10: PASS (previously FAILED after Phase 1). Buffer-and-replay restores user state across recycle.
- T5 still has its mechanism-specific assertion (pre-Shape 2+ era) — update in Phase 4.
- T12 (new): PASS.

**New test: T13 cold-start-empty-idb** — fresh tab, no IDB state, restart happens, client connects fresh. Just sync-from-scratch. PASS.

**New test: T14 populated-idb-stale-server** — tab has IDB from yesterday, server instance has changed since. On first connection, authenticationFailed fires immediately, clearData wipes IDB, fresh sync. PASS.

Commit: `feat(app): buffer-and-replay unsynced edits across provider-pool recycle`.

---

## Phase 4 — Branch-switch invalidation via CC1

### 4.1 Server emits `branch-switched` CC1 signal

TDD first: test that CC1 channel exists + payload shape is correct.

`packages/server/src/cc1-broadcast.test.ts` additions:
- `test('emitBranchSwitched broadcasts on __system__ with correct payload shape')` — RED.

Production code in `packages/server/src/cc1-broadcast.ts`:
```ts
export function emitBranchSwitched(broadcaster, branch: string): void {
  broadcaster.broadcast('__system__', JSON.stringify({
    v: 1,
    ch: 'branch-switched',
    seq: nextSeq('branch-switched'),
    branch,
  }));
}
```

In `packages/server/src/standalone.ts` `onBatchEnd` handler (or wherever branch normalization lands):
- After branch-switch-induced Y.Doc reset completes, call `emitBranchSwitched(broadcaster, newBranch)`.

### 4.2 Client subscribes + invalidates IDB

TDD first:
`packages/app/src/editor/branch-invalidation.test.ts` (new):
- `test('on branch-switched CC1 signal, all client persistences clearData')` — RED.
- `test('after clearData, all providers recycle to get fresh sync')` — RED.
- `test('ignored signals for unchanged branch name do not trigger clearData')`.

`packages/app/src/lib/cc1.ts` — add:
```ts
export const CC1_CHANNEL_BRANCH_SWITCHED = 'branch-switched' as const;
export const CC1BranchSwitchedSchema = z.object({
  v: z.literal(1),
  ch: z.literal(CC1_CHANNEL_BRANCH_SWITCHED),
  seq: z.number(),
  branch: z.string(),
}).loose();
export type CC1BranchSwitchedSignal = z.infer<typeof CC1BranchSwitchedSchema>;
export function parseCC1BranchSwitched(payload: string): CC1BranchSwitchedSignal | null { ... }
```

`packages/app/src/components/SystemDocSubscriber.tsx` onStateless handler:
```ts
const branchSwitched = parseCC1BranchSwitched(payload);
if (branchSwitched) {
  onBranchSwitchedRef.current(branchSwitched.branch);
  return;
}
```

`packages/app/src/editor/branch-invalidation.ts` (new):
- Export `handleBranchSwitched(pool: ProviderPool, newBranch: string): void` — orchestrates `clearData` + recycle across all pool entries when branch changes.

`packages/app/src/editor/DocumentContext.tsx`:
- Wire `handleBranchSwitched` setter; provide to `SystemDocSubscriber`.

**Expected impact on 11-test suite after Phase 4:**
- T5: PASS — but with updated mechanism assertion (client IDB empty after switch, not server ystate dir).
- All others continue to PASS.

Commit: `feat: CC1 branch-switched signal with client-side IDB invalidation`.

### 4.3 Revise T5 assertion

`packages/app/tests/integration/branch-switch-live-client.test.ts`:
- Remove the `.open-knowledge/ystate/` assertion (the dir doesn't exist in Shape 2+).
- Add assertion: after branch switch completes, client's fake-IDB has no pre-switch items.

Commit: `test(app): update T5 branch-switch assertion to client-persistence mechanism`.

---

## Phase 5 — Composition hardening

### 5.1 Managed-rename coordination

On `/api/rename`, the server changes the doc's docName. Client's IDB for old `docName` becomes stale (never accessed again). Options:
- Accept staleness + let IDB accumulate (low-growth; IDB quota large).
- Emit CC1 `doc-renamed` channel that triggers clearData on old name.

**Recommendation:** Accept staleness. GC-ing stale IDB is a future optimization; no functional risk from not doing it.

If we later want it:
- `emitDocRenamed(broadcaster, oldName, newName)` — new CC1 channel.
- Client handles by `clearData(oldName)`.

### 5.2 Test updates for existing scenarios

- T8 (managed-rename-populated-target): verify that rename-time behavior works with client persistence. Usually a no-op since rename just means "open different docName" — fresh IDB entry for new name.
- T9 (external-edit-stale-client): client's fake-IDB has stale state; server has new markdown. Instance-ID defense forces recycle; buffer-and-replay catches nothing (no unsynced edits on stale client); clean resync.

Commit: `test(app): verify T8/T9 still pass with client persistence`.

---

## Phase 6 — Observability, docs, rollup

### 6.1 OTel instrumentation for client-side

y-indexeddb's fire-and-forget writes don't emit spans. Options:
- In-patch instrumentation (via `patchedDependencies`) — adds span creation inside `_storeUpdate`.
- Wrap at `createClientPersistence` boundary — spans around each write + hydrate.

**Recommendation:** Wrap at boundary (cleaner, doesn't fork upstream).

`client-persistence.ts` additions:
- Import `withSpan` from `@/telemetry` (frontend telemetry, gated by `VITE_OTEL_ENABLED`).
- Wrap `persistence.whenSynced` in `withSpan('ok.client_persistence.hydrate', ...)`.
- Wrap update-persist hook in `withSpan('ok.client_persistence.write', ...)`. (Needs patched hookable `_storeUpdate` OR separate observer that counts writes.)

Cardinality discipline (per CLAUDE.md `doc.name` attribute):
- `attr: 'doc.name': docName` — bounded per user's doc count (typically <1000).
- `attr: 'persistence.event': 'hydrate-success' | 'hydrate-error' | 'write-batch'`.
- Do NOT include raw update bytes or user content.

Commit: `feat(app): OTel spans for client-persistence lifecycle`.

### 6.2 Documentation updates

- `packages/server/README.md` §"CRDT server-restart recovery" — rewrite. Remove sidecar reference. Describe the new topology: markdown authoritative + instance-ID defense + client-side IDB + buffer-and-replay.
- `CLAUDE.md` — remove sidecar STOP rule; add:
  - New STOP rule: client-persistence clearData must run BEFORE provider recycle on mismatch.
  - New WARN rule: unsynced edits buffer is MEMORY only during recycle window; tab crash within that window loses them.
  - New §"Client-side Yjs persistence" sub-section under Package: app, documenting the wrapper + buffer-and-replay pattern.
- `reports/crdt-server-restart-recovery/REPORT.md` — add corrigendum breadcrumb noting that the landed architecture diverges from the original sidecar recommendation in favor of Shape 2+ (this research report).

Commit: `docs: update CLAUDE.md + package READMEs for client-persistence architecture`.

### 6.3 Final check

- `bun run check` at workspace root — ALL tiers green.
- `bun run check:full:parallel` — Playwright E2E tier green.
- Regression: confirm all pre-existing tests that were green still are; new tests all green.

---

## Phase 7 — QA validation

Per user's direction: load `/eng:qa-plan` and `/eng:qa` at the tail end. Use `/nest-claude` to dispatch the QA as a sub-orchestrator so the main Claude doesn't consume context for QA execution.

### 7.1 Load QA skills

At the start of Phase 7:
1. **`/eng:qa-plan`** — builds a structured QA plan covering every scenario and feature surface affected.
2. **`/eng:qa`** — executes QA plan; produces evidence of coverage.

### 7.2 Invoke `/nest-claude` for E2E validation

Dispatch:
> "Run QA for this feature branch. The change replaces the server-side Yjs binary sidecar with a client-side y-indexeddb + buffer-and-replay mechanism. Validate every scenario in the 11-test suite (T1-T14), plus manual smoke of: (a) cold Cmd-R with populated IDB, (b) offline typing then reconnect, (c) branch-switch while two tabs open, (d) agent-write during server restart. Report every defect with reproduction steps and expected-vs-actual."

`/nest-claude` runs this in a separate context, preserves our main context, and returns a QA report.

### 7.3 Address QA findings

For each reported defect:
- Route through `/assess-findings` (per greenfield directive — no deferred tech debt).
- Classify: bug, spec deviation, regression, flake. 
- Fix in-scope; do not defer.

---

## Summary

**8 phases** of changes, each independently TDD-anchored:

| Phase | Change | Tests | Skills loaded |
|-------|--------|-------|--------------|
| 0 | Setup: skill loads, deps, bunfig | N/A | `/tdd`, `/type-safety`, `/typescript-api-design` |
| 1 | Remove server sidecar | T1-T11 (6 expected to go red) | `/tdd` |
| 2 | Create client-persistence primitive | client-persistence.test.ts | `/tdd`, `/type-safety` |
| 3 | ProviderPool integration + buffer-and-replay | provider-pool.test.ts, T12, T13, T14 | `/tdd`, `/type-safety` |
| 4 | Branch-switch CC1 invalidation | cc1, branch-invalidation tests, T5 updated | `/tdd`, `/type-safety` |
| 5 | Composition hardening (managed-rename, T8/T9) | existing tests validated | `/tdd` |
| 6 | OTel, docs, final rollup | `bun run check` green | — |
| 7 | QA via `/nest-claude` | E2E manual + automated | `/qa-plan`, `/qa` |

**Expected rollout:** 3-5 days of focused work, including QA.

**Rollback plan:** Phase 1's server-side sidecar removal is the highest-risk commit (creates red tests). If Phases 2-4 don't land cleanly, revert Phase 1 and iterate.

**Shape alignment:** This is Shape 2+ from the evidence files — the architecturally-correct version of Shape 2 (replace sidecar) that doesn't have Shape 2's unsynced-edit regression.

See REPORT.md for the synthesis and recommendation; see `plans/` directory for the per-phase execution checklist.
