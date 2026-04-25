# Implementation plan: Client-side y-indexeddb + buffer-and-replay replaces the server-side sidecar (Shape 2+)

**Date:** 2026-04-24
**Branch:** `fix-crdt-restart-sidecar` (worktree at `/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/fix-crdt-restart-sidecar`)
**Supersedes:** The original plan to ship PR #311 as-is with a server-side sidecar. This plan carries forward PR #311's instance-ID defense + test suite unchanged, and replaces the sidecar module with a client-side y-indexeddb + buffer-and-replay implementation.
**Architectural research:** [`reports/yjs-client-persistence-alternatives/REPORT.md`](../../projects/open-knowledge/.claude/worktrees/fix-crdt-restart-sidecar/reports/yjs-client-persistence-alternatives/REPORT.md) (this adoption plan); [`reports/y-indexeddb-adoption-for-ok-restart-recovery/REPORT.md`](../../projects/open-knowledge/.claude/worktrees/fix-crdt-restart-sidecar/reports/y-indexeddb-adoption-for-ok-restart-recovery/REPORT.md) (prior report whose Shape 0 recommendation this plan revises).

---

## Context

PR #311 added a server-side Yjs binary sidecar (~1100 LOC) + server-instance-ID defense (~500 LOC) + 11-test scenario suite (~1700 LOC) to fix CRDT content-duplication on server restart.

Follow-on research (`reports/yjs-client-persistence-alternatives/`) surveyed alternative persistence layers (`@toeverything/y-indexeddb`, y-sweet, OPFS, SQLite-WASM, and others) and concluded:
1. The Yjs client-persistence ecosystem has effectively one production-grade library: upstream `yjs/y-indexeddb`.
2. Client-side persistence can replace the server-side sidecar entirely if paired with **buffer-and-replay** on mismatch-recycle — this closes the unsynced-edit preservation gap that naive Shape 2 had.
3. This combination (Shape 2+) eliminates ~1100 LOC of server-side sidecar in favor of ~1100 LOC of idiomatic Yjs-ecosystem client-side code + ~50-100 LOC of buffer-and-replay — net LOC-neutral, architecturally cleaner, UX-better (instant Cmd-R, offline editing).

**User directive (greenfield mindset):** "NO DEFERRED TECH DEBT — optimize for best architecture, clean codebase, best product experience without over-engineering." This plan incorporates buffer-and-replay rather than deferring it. Instance-ID defense + test suite from PR #311 are preserved.

---

## Execution mode

Work continues in the existing worktree `fix-crdt-restart-sidecar`. This PR (#311) is amended in place — force-push after each phase lands. This preserves the history of arriving at the architecturally-correct solution and surfaces the research that informed the pivot.

### Skills to load at start of implementation

**Load, in order, before beginning Phase 1:**

1. **`/eng:tdd`** — anchors every production change to a failing test first. Applies throughout Phases 1-6.
2. **`/eng:type-safety`** — governs Zod `.loose()` schemas, branded types, discriminated unions. Applies primarily to Phases 2 + 4 (new modules with exported APIs).
3. **`/eng:typescript-api-design`** — boundary shape design for new modules. Applies to Phases 2, 3, 4 (new files with exported API surface).

### Skills to load for QA validation (Phase 7)

**Load at start of Phase 7:**

1. **`/eng:qa-plan`** — structures the QA plan covering every scenario and surface affected.
2. **`/eng:qa`** — executes QA plan; produces coverage evidence.
3. **`/nest-claude`** — dispatches QA execution as a sub-orchestrator so the main session context isn't consumed by QA iteration.

---

## 8-phase commit sequence

Each phase is independently reviewable + revertible. Gate: `bun run check` at root must stay green after each phase's commits land (with the explicit exception of Phase 1, which intentionally leaves T1/T2/T4/T6/T9/T10 red as the TDD-driving failures for Phases 2-3).

### Phase 0 — Setup

**Goal:** Load skills, add dependencies, bootstrap test environment. No behavior change.

**Changes:**

1. `packages/app/package.json`: add `y-indexeddb@9.0.12` to `dependencies`; add `fake-indexeddb@^6.0.0` to `devDependencies`.
2. `package.json` (root): add `patchedDependencies["y-indexeddb@9.0.12"] = "patches/y-indexeddb@9.0.12.patch"` (file created in Phase 2).
3. `packages/app/bunfig.toml` (create or modify):
   ```toml
   [test]
   preload = ["./tests/integration/idb-preload.ts"]
   ```
4. `packages/app/tests/integration/idb-preload.ts` (new, 1 LOC):
   ```ts
   import 'fake-indexeddb/auto';
   ```
5. Run `bun install` to regenerate `bun.lock`; commit.

**Test impact:** None. Tests pass identically.

**Commit message:** `chore(app): set up y-indexeddb + fake-indexeddb + test preload for client persistence`

---

### Phase 1 — Remove server-side sidecar

**Goal:** Strip the sidecar module and its integration. This creates the TDD red-gate that Phases 2-3 will close. Intentionally temporary intermediate state.

**Changes:**

1. Delete `packages/server/src/sidecar.ts`.
2. Delete `packages/server/src/sidecar.test.ts`.
3. Modify `packages/server/src/persistence.ts`:
   - Remove `tryLoadFromSidecar` helper (~100 LOC).
   - Remove `writeSidecar` call from `onStoreDocument`.
   - Remove `sidecar-*-failed/divergent` structured log events.
   - `onLoadDocument` simplifies to the pre-PR-311 markdown-only path.
4. Modify `packages/server/src/persistence.test.ts`: remove sidecar-specific test cases (~200 LOC removed). Keep existing markdown-path tests intact.
5. Modify `packages/server/src/standalone.ts`:
   - Remove `deleteSidecarsForBranch` call in `onBatchBegin`.
6. Modify `packages/server/src/index.ts`: remove sidecar re-exports.
7. Modify `packages/server/src/fs-traced.ts`: if `tracedUnlink` / `tracedRm` are used ONLY by sidecar (grep to verify), remove them. Otherwise keep.
8. Modify `packages/cli/src/content/init.ts`: remove `.open-knowledge/ystate/` scaffold (if present).

**Verification:**

- `bun run check`: linting + typechecking pass. Tests: T3, T5, T7, T8, T11 still green. **T1, T2, T4, T6, T9, T10 go RED** (duplicate content on restart; no sidecar + no client persistence yet).
- This is the expected TDD red-gate. Do NOT revert; continue to Phase 2-3.

**Commit message:** `refactor(server): remove Yjs binary sidecar — prepares for client-side replacement`

---

### Phase 2 — Client-persistence primitive (TDD-led)

**Goal:** Create `client-persistence.ts` + buffer-and-replay helpers. Unit-tested in isolation. No production integration yet.

**TDD protocol per `/eng:tdd`:** every production change below is preceded by a failing test.

#### 2.1 Create the y-indexeddb patch

`patches/y-indexeddb@9.0.12.patch` (new):

```diff
--- a/src/y-indexeddb.js
+++ b/src/y-indexeddb.js
@@ -82,8 +82,11 @@ export class IndexeddbPersistence extends Observable {
       /**
        * @param {IDBObjectStore} updatesStore
        */
-      const beforeApplyUpdatesCallback = (updatesStore) => idb.addAutoKey(updatesStore, Y.encodeStateAsUpdate(doc))
+      const beforeApplyUpdatesCallback = async (updatesStore) => {
+        const existing = await idb.count(updatesStore)
+        if (existing > 0) idb.addAutoKey(updatesStore, Y.encodeStateAsUpdate(doc))
+      }
       const afterApplyUpdatesCallback = () => {
@@ -105,7 +108,9 @@ export class IndexeddbPersistence extends Observable {
     this._storeUpdate = (update, origin) => {
       if (this.db && origin !== this) {
         const [updatesStore] = idb.transact(this.db, [updatesStoreName])
-        idb.addAutoKey(updatesStore, update)
+        idb.addAutoKey(updatesStore, update).catch(err => {
+          console.warn(JSON.stringify({ event: 'ok-ydb-write-failed', err: err?.message ?? String(err) }))
+        })
         if (++this._dbsize >= PREFERRED_TRIM_SIZE) {
```

Addresses [y-indexeddb #31](https://github.com/yjs/y-indexeddb/issues/31) (doc grows on refresh) + [#44](https://github.com/yjs/y-indexeddb/issues/44) (silent write failures).

#### 2.2 `packages/app/src/editor/client-persistence.ts` (new)

**Exports (typed per `/eng:type-safety`):**

- `type DocName = string & { readonly __brand: 'DocName' }`
- `interface ClientPersistenceProvider { whenSynced: Promise<this>; readonly synced: boolean; destroy(): Promise<void>; clearData(): Promise<void>; }`
- `createClientPersistence(docName: DocName, doc: Y.Doc): ClientPersistenceProvider`
- `captureStateVector(doc: Y.Doc): Uint8Array` — thin wrapper on `Y.encodeStateVector`.
- `computeUnsyncedUpdate(doc: Y.Doc, lastAckedSV: Uint8Array | null): Uint8Array` — computes update payload since last ack. `null` treated as "all updates."

Internals: wraps `IndexeddbPersistence` from y-indexeddb; adds OTel spans via `withSpan('ok.client_persistence.hydrate', ...)` and `withSpan('ok.client_persistence.clearData', ...)`. Cardinality-safe attributes per CLAUDE.md observability rules.

#### 2.3 `packages/app/src/editor/client-persistence.test.ts` (new)

Unit tests (RED → GREEN → REFACTOR):
- `'createClientPersistence hydrates Y.Doc from empty fake-IDB'`
- `'createClientPersistence persists updates applied to Y.Doc'`
- `'createClientPersistence filters self-originated updates (no write-back loop)'`
- `'createClientPersistence clearData wipes fake-IDB for this docName'`
- `'createClientPersistence destroy preserves fake-IDB data'`
- `'computeUnsyncedUpdate returns Y.applyUpdate-equivalent delta when SVs equal'`
- `'computeUnsyncedUpdate returns full state when lastAckedSV is null'`
- `'computeUnsyncedUpdate round-trips: apply-to-fresh-doc yields same unsynced content'`

**Verification:**

- Unit suite green.
- `bun run check`: lint/typecheck green; integration tests unchanged (still 6 red from Phase 1).

**Commit messages:**
- `build(app): apply patchedDependencies fix for y-indexeddb issues #31 + #44`
- `feat(app): add client-persistence primitive + buffer-and-replay helpers (TDD unit-tested)`

---

### Phase 3 — ProviderPool integration + buffer-and-replay

**Goal:** Wire client persistence into ProviderPool. Add buffer-and-replay on `authenticationFailed` recycle. This phase CLOSES the 6 red tests from Phase 1.

#### 3.1 Attach persistence in `open()`

`provider-pool.test.ts` additions (RED-first):
- `'open() constructs client persistence for each docName'`
- `'open() reuses existing persistence on repeated open() of same docName'`
- `'recycleDisconnectedEntry destroys persistence BEFORE destroying provider'`
- `'evictLru destroys persistence for evicted entry'`
- `'disposeAll destroys all persistences'`

`provider-pool.ts` modifications:
- Add `persistence: ClientPersistenceProvider | null` to `PoolEntry` interface.
- In `open()`, after `new HocuspocusProvider(...)`, construct `entry.persistence = createClientPersistence(docName, provider.document)`.
- In `recycleDisconnectedEntry`, `evictLru`, `disposeAll`, `recycleAllEntries`: `await entry.persistence?.destroy()` BEFORE `provider.destroy()`.

#### 3.2 Buffer-and-replay on mismatch-recycle

`provider-pool-buffer-replay.test.ts` (new, T12 RED-first):

Scenario:
1. Open pool + provider; sync with test server.
2. Client types rapidly (simulates unsynced burst).
3. Restart server with new `serverInstanceId`.
4. Client's `authenticationFailed` fires.
5. Pool enters buffer-and-replay flow.
6. Assert: post-recycle, Y.Doc content includes the pre-recycle burst.
7. Assert: server receives replayed updates via normal sync.

`provider-pool.ts` further modifications:
- On `provider.on('synced')`: `entry.lastServerSyncedSV = captureStateVector(provider.document)`. Refresh on every 'synced' event.
- On `authenticationFailed` handler, when `reason === 'server-instance-mismatch'`:
  1. For each entry, compute `unsyncedBytes = computeUnsyncedUpdate(entry.provider.document, entry.lastServerSyncedSV)`. Store in `this.bufferedUpdates: Map<DocName, Uint8Array>`.
  2. Await `entry.persistence.clearData()`.
  3. Call existing recycle path (destroys provider + entry).
- When re-`open()` is called for a docName with `bufferedUpdates.get(docName)` present:
  - Subscribe to the fresh provider's FIRST `synced` event.
  - At that moment: `Y.applyUpdate(newEntry.provider.document, bufferedBytes, TAB_REPLAY_ORIGIN)`. Delete from `bufferedUpdates`.

**Type-safety:** `TAB_REPLAY_ORIGIN = Object.freeze({ kind: 'tab-replay' } as const)` — discriminable origin for tests and future observers.

#### 3.3 New scenario tests

`cold-start-empty-idb.test.ts` (T13):
- Fresh fake-IDB, no prior state. Server restart happens before first open. Client opens tab fresh; syncs from markdown-rebuilt server. Assert: no duplication; content matches server.

`populated-idb-stale-server.test.ts` (T14):
- Pre-populate fake-IDB with pre-restart items. Open pool pointing at server with different `serverInstanceId`. `authenticationFailed` fires on first connection. `clearData` wipes IDB. Fresh sync. Assert: no duplication; content matches current server state.

**Verification after Phase 3:**

- `bun run check`: ALL 11 TESTS + T12 + T13 + T14 PASS. This is the architectural completion point.
- Pre-existing test suite (bridge invariants, etc.) unchanged.
- Expected state: 14 tests, 0 red.

**Commit messages:**
- `feat(app): attach client persistence to each provider-pool entry`
- `feat(app): buffer-and-replay unsynced edits across provider-pool recycle (T12)`
- `test(app): T13 cold-start-empty-idb + T14 populated-idb-stale-server scenario tests`

---

### Phase 4 — Branch-switch CC1 invalidation

**Goal:** Coordinate client-side IDB invalidation when server switches branches, via a new CC1 `branch-switched` channel.

#### 4.1 Server-side CC1 broadcast

`packages/server/src/cc1-broadcast.ts` additions:
- Add channel constant `CC1_CHANNEL_BRANCH_SWITCHED = 'branch-switched' as const`.
- Add `emitBranchSwitched(broadcaster, branch: string): void` helper.

`packages/server/src/cc1-broadcast.test.ts`: unit test for payload shape.

`packages/server/src/standalone.ts`:
- In `onBatchEnd` (or wherever branch-normalization completes), invoke `emitBranchSwitched(broadcaster, newBranch)`.

#### 4.2 Client-side CC1 subscription + invalidation

`packages/app/src/lib/cc1.ts` additions:
- `CC1BranchSwitchedSchema` — Zod `.loose()` with `{ v: 1, ch: 'branch-switched', seq: number, branch: string }`.
- `parseCC1BranchSwitched(payload: string): CC1BranchSwitchedSignal | null`.

`packages/app/src/editor/branch-invalidation.ts` (new):
- `handleBranchSwitched(pool: ProviderPool, newBranch: string): Promise<void>` — orchestrates `await pool.clearAllPersistences()` + `pool.recycleAllEntries()` (may need to expose methods on pool).

`packages/app/src/components/SystemDocSubscriber.tsx`:
- In `onStateless`, after `parseCC1ServerInfo`, try `parseCC1BranchSwitched`. On match, invoke `onBranchSwitchedRef.current(branchSwitched.branch)`.

`packages/app/src/editor/DocumentContext.tsx`:
- Add `branchSwitched` dispatcher wired to `handleBranchSwitched`. Provide as context value / ref to `SystemDocSubscriber`.

#### 4.3 Update T5 (branch-switch-live-client)

`packages/app/tests/integration/branch-switch-live-client.test.ts`:
- Remove the `.open-knowledge/ystate/` mechanism-specific assertion (the dir doesn't exist under Shape 2+).
- Add: after branch switch completes + CC1 signal roundtrip, assert client's fake-IDB is empty of pre-switch items via a new `assertIDBEmpty` helper in test-harness.

#### 4.4 Unit tests

`branch-invalidation.test.ts` (new):
- `'on branch-switched CC1 signal, all client persistences clearData'`
- `'after clearData, all providers recycle'`
- `'signals for unchanged branch name are no-op'`

**Verification after Phase 4:**

- `bun run check`: all 14 tests + unit additions green.
- T5's new assertion validates client-side IDB empty post-switch.

**Commit messages:**
- `feat(server): emit CC1 branch-switched signal on branch normalization`
- `feat(app): client-side IDB invalidation on CC1 branch-switched`
- `test(app): T5 branch-switch assertion migrated to client-persistence mechanism`

---

### Phase 5 — Composition hardening

**Goal:** Verify managed-rename + external-edit scenarios still work; add minor observability if needed.

#### 5.1 Verify T8 (managed-rename-populated-target)

The existing T8 test should still pass without changes — docName change means accessing a different fake-IDB entry for the new name. Stale IDB for old name accumulates but doesn't affect correctness.

#### 5.2 Verify T9 (external-edit-stale-client)

Existing T9 tests the scenario where an external process edits markdown while the server is down. With Shape 2+:
- Server restarts from markdown (now includes external edits).
- Client's stale IDB has pre-edit items.
- `authenticationFailed` fires → buffer computes empty delta (client had no local unsynced typing) → `clearData` → fresh sync.
- Client ends up with external-edit content, no duplication.

Existing test assertions should pass unchanged. Verify empirically; add a specific assertion for "client's final Y.Doc matches server's current markdown" if the current assertion is too loose.

#### 5.3 Optional: rename-time IDB GC

Not required for correctness; deferred as future optimization. Emit `emitDocRenamed(broadcaster, oldName, newName)` + client `clearData(oldName)` if future telemetry shows IDB bloat from renamed docs. Document as a non-blocking improvement.

**Verification after Phase 5:**

- `bun run check`: all tests green.

**Commit message:** `test(app): verify T8 + T9 pass under Shape 2+ client-persistence topology`

---

### Phase 6 — Observability, docs, rollup

#### 6.1 Telemetry wrap

`client-persistence.ts` wraps `persistence.whenSynced` + write hooks in `withSpan('ok.client_persistence.hydrate', ...)` + `withSpan('ok.client_persistence.write', ...)`. Cardinality-bounded attrs: `doc.name` (bounded), `persistence.event` (enum: `hydrate-success | hydrate-error | write-batch | clear-data | destroy`).

#### 6.2 Documentation

`packages/server/README.md`:
- Rewrite §"CRDT server-restart recovery". Remove sidecar references. Describe new topology:
  - Markdown is source of truth (precedent #1) — unchanged.
  - Server-instance-ID is the authority signal — unchanged from PR #311.
  - Client-side y-indexeddb is the recovery cache — NEW.
  - Buffer-and-replay preserves unsynced edits across mismatch-recycle — NEW.
- Document the CC1 `branch-switched` channel + client-side handler.

`CLAUDE.md`:
- Remove the sidecar STOP rule (was: "Yjs binary sidecar is disposable — must never fail the L1 cycle").
- Add NEW STOP rule: "Client-persistence `clearData` MUST run BEFORE provider recycle on `server-instance-mismatch`. Buffer unsynced edits FIRST via `computeUnsyncedUpdate`. Order violations reintroduce the content-duplication bug class."
- Add NEW WARN rule: "Buffer-and-replay is MEMORY only during recycle window. Tab crash within the 50-500ms recycle window loses the unsynced buffer. Acceptable; alternative is `localStorage` persistence of the buffer which adds complexity for an edge case."
- Add §"Client-side Yjs persistence" subsection under Package: app, documenting the `client-persistence.ts` wrapper + buffer-and-replay pattern.

`reports/crdt-server-restart-recovery/REPORT.md` (prior research):
- Append dated corrigendum breadcrumb per CLAUDE.md §"Post-ship corrigendum annotations": "_[Corrected 2026-04-24 post-ship: architectural recommendation updated to Shape 2+ (client-side y-indexeddb + buffer-and-replay) per `reports/yjs-client-persistence-alternatives/REPORT.md`.]_"

#### 6.3 Final verification

- `bun run check` at workspace root: every tier green.
- `bun run check:full:parallel`: Playwright E2E tier green.
- Confirm cross-package coordination: server emits `branch-switched` during `onBatchEnd`; client subscribes + invalidates.

**Commit messages:**
- `feat(app): OTel spans for client-persistence lifecycle`
- `docs: rewrite CRDT restart-recovery section + CLAUDE.md STOP/WARN rules for Shape 2+`

---

### Phase 7 — QA validation

**Skills to load:**

1. **`/eng:qa-plan`** — structures the QA plan.
2. **`/eng:qa`** — executes.
3. **`/nest-claude`** — dispatches execution as a sub-orchestrator to preserve main-session context.

#### 7.1 Build QA plan (`/qa-plan`)

Produce a structured QA plan covering:
- All 14 automated scenario tests (T1-T14) — expected to all pass under Shape 2+.
- Manual smoke-test matrix:
  - (a) Cold Cmd-R with populated IDB — content appears instantly; sync completes afterward.
  - (b) Offline typing (disconnect Hocuspocus) — edits persist in IDB; reconnect merges.
  - (c) Branch-switch while two tabs open — both tabs invalidate IDB + reconverge.
  - (d) Agent-write during server restart — agent's writes reach the post-restart server; no duplication.
  - (e) Tab crash during unsynced burst — user loses sub-recycle-window edits (documented limitation).
  - (f) Quota exceeded simulation (Chrome DevTools) — write failures log to console, user sees no crash.
  - (g) Safari private browsing — y-indexeddb falls back gracefully; degrades to current behavior.

#### 7.2 Execute QA plan (`/qa` via `/nest-claude`)

Dispatch nest-claude:
> "Execute the QA plan at [path] for branch `fix-crdt-restart-sidecar`. Replace the server-side Yjs binary sidecar with client-side y-indexeddb + buffer-and-replay + branch-switch CC1 invalidation. Validate every scenario in the 14-test suite (T1-T14), plus the manual smoke matrix (a-g above). For each defect, report reproduction steps + expected-vs-actual. Do NOT attempt fixes — return findings only."

#### 7.3 Address QA findings

For each reported defect, route through `/assess-findings`:
- Bug / correctness issue → fix in-scope (greenfield: no deferred tech debt).
- Spec deviation → verify design intent; update spec OR fix implementation.
- Regression → identify root cause + fix + add regression test.
- Flake → verify as true flake (not an undiagnosed bug); track or fix.

Only after all findings are resolved or explicitly accepted with evidence, proceed to merge.

---

## Success criteria

- All 14 automated tests (T1-T14) pass.
- `bun run check` at root: green.
- `bun run check:full:parallel`: green (Playwright).
- Manual smoke matrix (a-g): each verified.
- Every QA finding resolved in-scope or accepted with documented evidence via `/assess-findings`.
- PR #311 amended; architectural-pivot story clear in the commit history.
- Manual smoke by the human reviewer (optional but recommended): open editor, type, Cmd-R → content reappears instantly; kill dev server, immediately restart → reconnect is invisible; Cmd-R again → still instant; no duplication anywhere.

---

## Rollback criteria

**Rollback the current phase if:**
1. Two or more previously-passing tests regress (excluding the Phase 1 intentional red-gate).
2. Fidelity gate regresses (I1-I11 invariants).
3. Flakiness appears.
4. `bun run check:full:parallel` E2E tier fails under the phase's changes.

**Escalate to user if:**
1. Four fix iterations on the same phase without achieving expected test outcome.
2. Any architectural assumption in this plan is invalidated by implementation reality (e.g., buffer-and-replay doesn't work as designed for some subtle Yjs reason).
3. Manual smoke reveals a new failure mode the 14 tests didn't catch.

---

## Out of scope (deferred)

- **y-sweet migration** — separate architectural decision; not this plan.
- **OPFS adoption** — deferred unless OK handles >10MB Y.Doc states.
- **Rename-time IDB GC** — future optimization; not required for correctness.
- **Sub-document support** — AFFiNE nbstore patterns; deferred unless OK adds hierarchical docs.
- **Worker-thread isolation of `Y.applyUpdate` (issue #479 defense)** — complex; pre-existing risk that affects any Yjs consumer; document manual recovery.
- **Multi-tab offline sync** (y-broadcastchannel) — orthogonal UX enhancement; defer unless users hit multi-tab-offline pain.

---

## Cross-reference: PR body for amended PR #311

The PR body (updated at the end of implementation) will describe:
- Updated recommendation (Shape 2+) + link to this plan.
- Links to both research reports (`y-indexeddb-adoption-for-ok-restart-recovery/`, `yjs-client-persistence-alternatives/`).
- Before/after test counts (11 → 14 tests, 0 red).
- Manual smoke-test instructions for the reviewer.
- LOC summary table (~-1054 server-side, ~+1064 client-side, net ≈ 0).
- Migration notes for existing deployments (sidecar files in user's `.open-knowledge/ystate/` directories should be cleaned; `init.ts` removal of scaffold ensures fresh installs don't create it).

---

## Appendix: Plan-at-a-glance

| Phase | Scope | Expected test state | Skills |
|-------|-------|---------------------|--------|
| 0 | Setup (deps + bunfig) | 11/11 unchanged | `/tdd`, `/type-safety`, `/typescript-api-design` |
| 1 | Remove server sidecar | 5 pass / 6 red (expected TDD red-gate) | `/tdd` |
| 2 | Client-persistence primitive | 5 pass / 6 red; unit tests green | `/tdd`, `/type-safety` |
| 3 | ProviderPool + buffer-replay | 14 pass / 0 red (closes the gate) | `/tdd`, `/type-safety` |
| 4 | Branch-switch CC1 | 14+ pass / 0 red | `/tdd`, `/type-safety` |
| 5 | Composition hardening | 14+ pass / 0 red | `/tdd` |
| 6 | OTel + docs | all green | — |
| 7 | QA via `/nest-claude` | full E2E validation | `/qa-plan`, `/qa`, `/nest-claude` |
