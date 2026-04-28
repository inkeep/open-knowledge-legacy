# Evidence: D3 — PR #311 components mapped against y-indexeddb (3P)

**Dimension:** Classify each component added in PR #311 as OBSOLETE / UNCHANGED / COMPLEMENTARY under a "adopt y-indexeddb" scenario. Distinguish what y-indexeddb REPLACES vs. what remains necessary.
**Date:** 2026-04-24
**Sources:** `git diff origin/main --stat` (PR #311), `reports/crdt-server-restart-recovery/REPORT.md`, D1 + D2 evidence files.

---

## Framework

Two adoption scenarios to evaluate:

**Scenario A — y-indexeddb INSTEAD of the server-side sidecar.**
Remove PR #311's server-side `sidecar.ts` / `writeSidecar` / `readSidecar` / `deleteSidecar` / `deleteSidecarsForBranch` / `.open-knowledge/ystate/`. Keep the server-instance-ID defense. Add y-indexeddb on the client.

**Scenario B — y-indexeddb IN ADDITION TO the server-side sidecar.**
Keep everything in PR #311. Add y-indexeddb on top as a second-layer client cache.

D3 classifies components for BOTH scenarios. D7 evaluates which scenario is preferable.

---

## Component map

Components grouped by subsystem. Each row: `{component name, LOC added, Scenario A status, Scenario B status}`.

### Server-side: Sidecar module

| Component | LOC | Scenario A | Scenario B |
|-----------|-----|------------|------------|
| `packages/server/src/sidecar.ts` | 319 | **OBSOLETE** | UNCHANGED |
| `packages/server/src/sidecar.test.ts` | 347 | **OBSOLETE** | UNCHANGED |
| `.open-knowledge/ystate/` directory + `.gitignore` init scaffold | ~5 | **OBSOLETE** | UNCHANGED |
| `fs-traced.ts` additions (`tracedUnlink`, `tracedRm`) | 16 | **OBSOLETE** (if only the sidecar used them; otherwise UNCHANGED) | UNCHANGED |

**Reasoning (Scenario A):**
- The entire sidecar module exists to preserve server-side Y.Doc binary across restart. y-indexeddb on the client performs the analogous preservation on the OTHER side of the WebSocket.
- In Scenario A, the server restarts with no Y.Doc state. It rebuilds from markdown via `updateYFragment`. But the server-instance-ID rejection path forces the client to recycle before Yjs sync runs. After recycle, the CLIENT loads its IDB-preserved Y.Doc state into a FRESH provider, which then performs a clean sync-up with the post-restart server. The CLIENT brings the pre-restart state; the server is markdown-only.
- Net: no need to preserve server-side Y.Doc across restart if client always brings the canonical pre-restart state.

**Reasoning (Scenario B):**
- Keeping both is defense-in-depth. If the client is fresh (e.g. new tab, first visit, or post-clearData), IDB is empty — the server's sidecar still lets the server preserve identity across restart. But the gain over Scenario A is marginal because a "fresh tab, no IDB" client would start a fresh Y.Doc anyway, and the pre-restart server state is ephemeral to that tab.

### Server-side: Instance-ID defense

| Component | LOC | Scenario A | Scenario B |
|-----------|-----|------------|------------|
| `packages/server/src/auth-token-schema.ts` (Zod schema) | 77 | **UNCHANGED** | UNCHANGED |
| `packages/server/src/standalone.ts` `randomUUID()` + `serverInstanceId` | ~20 | **UNCHANGED** | UNCHANGED |
| `packages/server/src/api-extension.ts` — `GET /api/server-info` | 34 | **UNCHANGED** | UNCHANGED |
| `packages/server/src/cc1-broadcast.ts` — `server-info` channel | 45 | **UNCHANGED** | UNCHANGED |
| `packages/server/src/standalone.ts` `onAuthenticate` enforcement (mismatch rejection) | ~25 | **UNCHANGED** | UNCHANGED |
| `packages/server/src/principal-auth-extension` `__kind` marker | ~3 | **UNCHANGED** | UNCHANGED |

**Reasoning:** Instance-ID is the **one thing y-indexeddb cannot replace**. It is the only guaranteed way to detect "this server is a different process than what my Y.Doc was last synced to." Without it, the client's IDB-restored Y.Doc might successfully sync against a RESTARTED server but still duplicate content (as D2 proved: y-indexeddb alone does NOT prevent the `updateYFragment` duplicate-item path). The rejection signal is what forces the client to `recycleAllEntries()` BEFORE any Yjs sync runs — that's the defense.

This holds in both scenarios. Adoption of y-indexeddb does NOT let us drop the instance-ID work.

### Client-side: Server-instance-ID cache + claim

| Component | LOC | Scenario A | Scenario B |
|-----------|-----|------------|------------|
| `packages/app/src/editor/provider-pool.ts` `cachedServerInstanceId` + `setExpectedServerInstanceId` | ~30 | **UNCHANGED** | UNCHANGED |
| `packages/app/src/editor/provider-pool.ts` `buildAuthToken()` helper | ~15 | **UNCHANGED** | UNCHANGED |
| `packages/app/src/editor/provider-pool.ts` `onAuthenticationFailed` + `recycleAllEntries` | ~35 | **UNCHANGED** | UNCHANGED |
| `packages/app/src/editor/DocumentContext.tsx` boot-time `/api/server-info` fetch | 32 | **UNCHANGED** | UNCHANGED |
| `packages/app/src/components/SystemDocSubscriber.tsx` CC1 `server-info` listener | 26 | **UNCHANGED** | UNCHANGED |
| `packages/app/src/lib/cc1.ts` `parseCC1ServerInfo` | 39 | **UNCHANGED** | UNCHANGED |

**Reasoning:** This is the client-side half of the instance-ID defense. It is completely orthogonal to whether client-side Y.Doc is persisted in IDB. Keeping it intact in both scenarios.

**Note:** In Scenario A, the `recycleAllEntries()` path becomes slightly more important — it's the moment when the CLIENT's Y.Doc is discarded, a fresh provider is constructed, and THAT fresh provider re-opens the same IDB (same `docName` → same IDB name) and rehydrates from IDB. So the recycle does NOT lose the client's state (IDB preserves it). That's a key enabler for "server restart is invisible."

### Server-side: Persistence load path

| Component | LOC | Scenario A | Scenario B |
|-----------|-----|------------|------------|
| `packages/server/src/persistence.ts` `tryLoadFromSidecar` + Strategy A divergence logic | ~100 | **OBSOLETE** | UNCHANGED |
| `packages/server/src/persistence.ts` `writeSidecar` call in onStoreDocument | ~8 | **OBSOLETE** | UNCHANGED |
| `packages/server/src/persistence.ts` `sidecar-*-failed/divergent` structured logs | ~10 | **OBSOLETE** | UNCHANGED |
| `packages/server/src/persistence.test.ts` new sidecar-path tests | 239 | **OBSOLETE** | UNCHANGED |

**Reasoning (Scenario A):** Persistence load path reverts to markdown-only. `updateYFragment` produces items under the fresh server's clientID as before — the instance-ID mismatch catches the problem BEFORE sync, so the duplication path is never triggered. (In tests today, client recycle happens at `authenticationFailed` reception, strictly before any sync message arrives on the new connection.)

### Server-side: Branch-switch handling

| Component | LOC | Scenario A | Scenario B |
|-----------|-----|------------|------------|
| `packages/server/src/standalone.ts` `deleteSidecarsForBranch` call in onBatchBegin | ~5 | **OBSOLETE** | UNCHANGED |
| `packages/server/src/sidecar.ts` `deleteSidecarsForBranch` function | ~40 | **OBSOLETE** | UNCHANGED |

**Reasoning (Scenario A):** No sidecars exist on the server → nothing to wipe.

**But wait — there's a client-side equivalent concern.** On branch switch (T5 test scenario), the server's Y.Doc gets wholesale-replaced by the new branch's markdown. If the client's IDB retains PRE-switch items and the server's Y.Doc now has fresh post-switch items, the same duplicate-content hazard appears at the server's single clientID (unless the instance-ID changes; but branch switch does NOT restart the server, so same instance-ID).

This means y-indexeddb ADOPTION REQUIRES handling client-side IDB clearing on branch switch. Options:
1. Server emits a CC1 `branch-switched` signal. Clients clear IDB for all affected docs via `provider.clearData()` then recycle.
2. Use a versioned IDB `docName` (e.g. `docName@<branch>`) so branch switch naturally rotates the IDB name. But this means per-branch IDB dbs and cross-branch state doesn't ferry.
3. Decorate every IDB-persisted Y.Doc with its own branch name in the `custom` store. On hydration, if the branch doesn't match current server branch, discard IDB and refetch.

Whichever option is chosen, there's irreducible branch-switch work **even in Scenario A**. So the `deleteSidecarsForBranch` LOC is replaced with client-side IDB rotation logic of comparable size.

**Scenario B:** Both are kept; branch switch clears both server-side sidecar and (via whatever mechanism) client-side IDB.

### Test harness & test suite

| Component | LOC | Scenario A | Scenario B |
|-----------|-----|------------|------------|
| `packages/app/tests/integration/test-harness.ts` — `createRestartableServer`, clientID drift helpers, multi-client context | 584 | UNCHANGED (most of it) / some slight adjustments | UNCHANGED |
| `packages/app/tests/integration/provider-pool-reconnect.test.ts` (T1, T3, T4) | 459 | UNCHANGED | UNCHANGED |
| `packages/app/tests/integration/provider-pool-multi-client-restart.test.ts` (T2) | 178 | UNCHANGED | UNCHANGED |
| `packages/app/tests/integration/branch-switch-live-client.test.ts` (T5) | 235 | **REVISED** (sidecar assertion → IDB-state assertion) | UNCHANGED |
| `packages/app/tests/integration/agent-write-during-restart.test.ts` (T6) | 150 | UNCHANGED | UNCHANGED |
| `packages/app/tests/integration/rollback-multi-client.test.ts` (T7) | 143 | UNCHANGED | UNCHANGED |
| `packages/app/tests/integration/managed-rename-populated-target.test.ts` (T8) | 111 | UNCHANGED | UNCHANGED |
| `packages/app/tests/integration/external-edit-stale-client.test.ts` (T9) | 152 | UNCHANGED | UNCHANGED |
| `packages/app/tests/integration/ytext-source-mode-restart.test.ts` (T10) | 144 | UNCHANGED | UNCHANGED |
| `packages/app/tests/integration/mid-drain-restart.test.ts` (T11) | 128 | UNCHANGED | UNCHANGED |
| `packages/app/tests/integration/c10-server-restart.test.ts` header amendment | 39 | UNCHANGED | UNCHANGED |
| Meta-test attribution-sweep allowlist (handleServerInfo) | 3 | UNCHANGED | UNCHANGED |

**Reasoning:** 11-test suite is defined behaviorally (client content at rest after restart), not mechanism-specifically. Scenario A still passes all 11 because the instance-ID defense IS the mechanism that cuts the duplicate-content path; y-indexeddb just makes the post-recycle UX invisible (no reconnect flash, state is instant). The only mechanism-specific assertion is T5's `.open-knowledge/ystate/` check — replaced with an IDB-state assertion.

**Test harness needs `setupIndexedDB` or similar.** Bun test runner is node-based; IDB is a browser API. Must use `fake-indexeddb` polyfill. Adds ~5 LOC to test-harness.

### Research + docs artifacts

| Component | LOC | Scenario A | Scenario B |
|-----------|-----|------------|------------|
| `reports/crdt-server-restart-recovery/REPORT.md` + evidence files | 601 + 1349 | **REVISE** (sidecar decision replaced) | UNCHANGED |
| `packages/server/README.md` §"CRDT server-restart recovery" + §"Sidecar recovery cache" | ~49 | **REVISE** (reorganize around server-instance-ID + y-indexeddb) | UNCHANGED |
| `CLAUDE.md` Sidecar STOP rule | ~10 | **REVISE** (y-indexeddb STOP rule if needed) | UNCHANGED |
| `AGENTS.md` minor updates | 4 | UNCHANGED | UNCHANGED |
| `packages/server/package.json` + `packages/server/src/index.ts` re-exports | ~10 | **OBSOLETE** (sidecar exports removed) | UNCHANGED |

---

## LOC summary

| Scenario | LOC OBSOLETE | LOC UNCHANGED | LOC ADDED (new y-indexeddb wiring) |
|----------|-------------:|---------------:|------------------------------------:|
| Current PR #311 (baseline) | 0 | 6093 | 0 |
| Scenario A (y-indexeddb REPLACES sidecar) | ~1100 | ~4993 | ~200 (provider wiring + test polyfill + branch-switch IDB rotation) |
| Scenario B (y-indexeddb ADDS to sidecar) | 0 | 6093 | ~200 (provider wiring + test polyfill + branch-switch IDB rotation) |

**Scenario A net:** saves roughly 900 LOC (1100 obsolete − 200 added). Most of that is concentrated in sidecar.ts + sidecar.test.ts + persistence.ts sidecar integration + persistence.test.ts sidecar cases.

**Scenario B net:** pure addition of ~200 LOC on top of PR #311.

---

## Components that are UNCHANGED in both scenarios (the "y-indexeddb can't replace" set)

These are the **load-bearing fix primitives**:

1. **Server instance ID generation + broadcast + `onAuthenticate` rejection** (~45 LOC)
2. **Auth-token schema + Zod parse** (~77 LOC)
3. **`/api/server-info` endpoint + CC1 `server-info` channel** (~79 LOC)
4. **Client-side provider-pool cache + claim + recycle on rejection** (~80 LOC)
5. **DocumentContext boot-time fetch + SystemDocSubscriber CC1 listener** (~58 LOC)
6. **Test harness primitives + 11-test suite** (~1700 LOC — tests are behavioral assertions)

**Total "irreducible" LOC:** ~2039 LOC of PR #311 that remains necessary regardless of y-indexeddb adoption.

---

## Components that y-indexeddb REPLACES (Scenario A only)

1. **Server-side `sidecar.ts`** (319 LOC + 347 test LOC + 239 LOC persistence tests + 100 LOC persistence integration + branch-switch delete ≈ **~1100 LOC**)
2. **`.open-knowledge/ystate/` directory lifecycle** (init scaffold, branch-switch delete, log events) — small
3. **fs-traced additions for sidecar-only use** (`tracedUnlink`, `tracedRm`) — 16 LOC, only if no other callsite keeps them

---

## What y-indexeddb ALONE does NOT do (independent of scenario)

From D2 evidence:

1. **Does not prevent duplicate-content items on server restart.** y-indexeddb preserves CLIENT state across reload, not across server restart. When a restarted server runs `updateYFragment` on fresh markdown, it generates items under a new clientID. Without instance-ID rejection to force client recycle, the client would try to sync its IDB-preserved pre-restart items with the post-restart server's fresh items — producing the same duplicate-content bug PR #311 was written to fix.
2. **Does not provide live multi-tab coordination.** No BroadcastChannel. Two tabs open on same origin without a network provider diverge and merge only on reload. (Not a concern when Hocuspocus is available.)
3. **Does not handle quota exceeded.** Silent write failures.
4. **Does not handle schema migrations.** Fixed schema (`updates` + `custom` stores). Changing anything requires `provider.clearData()` + refetch from network.
5. **Does not prevent branch-switch Y.Doc replacement on the server side.** A separate mechanism is still needed to either rotate IDB (`docName@<branch>`) or emit a cross-tab signal.

---

## Implications for decision-making

The question "does y-indexeddb replace PR #311?" has a nuanced answer:

- **It replaces roughly 18% of PR #311's LOC** (the sidecar module + its integration + tests).
- **It does NOT replace the other 82%** (instance-ID defense, auth-token schema, client-side recycle, test harness, 11-test suite).
- **It adds ~200 LOC of NEW client-side integration** (y-indexeddb wiring, branch-switch IDB rotation, test polyfill).
- **It shifts the state-preservation burden from server to client.** Server becomes purely markdown-driven (with instance-ID defense); client does the binary Y.Doc preservation via IDB.

The choice between scenarios is primarily an **architectural preference** question (D7), not a "which saves more LOC" question.

Further, y-indexeddb adoption ADDS user-visible value independent of the restart bug:
- Cmd-R becomes instant (no sync round-trip to populate Y.Doc).
- Offline edits survive tab close.
- These are NEW capabilities neither PR #311 nor the status quo currently provide.

---

## Negative findings

- y-indexeddb does NOT replace `provider-pool.ts` entry management, entry ref-counting, or the tab-session/principal token flow. Those are product-level concerns orthogonal to persistence.
- y-indexeddb does NOT affect the server-authoritative observer bridge. The bridge fires when Y.Doc updates arrive; IDB is just another update source. The existing origin-guard truth table (precedent #14, SPEC §6 R0) handles IDB-originated updates transparently.
- y-indexeddb does NOT replace the `shadow-repo` / `safetyCheckpoint` machinery for divergence attribution. Those concerns are git-tree-level (writer-ID taxonomy, precedent #25) and orthogonal to Y.Doc binary preservation.

---

## Gaps / follow-ups

- Confirmed that the test suite is behavior-level, not sidecar-specific, EXCEPT T5's `.open-knowledge/ystate/` directory assertion. Confirmed during D3 that this is the only mechanism-specific line and can be straightforwardly replaced.
- `fs-traced.ts` additions (`tracedUnlink`, `tracedRm`) — check if these are used elsewhere in the PR or are sidecar-only. Not a critical blocker; 16 LOC. (Quick grep check during D4.)
- Branch-switch client-side IDB rotation strategy is an open design question. Cost estimate of ~200 LOC new code ASSUMES something like Option 1 (server emits CC1 `branch-switched` signal + client clears IDB + recycles). Actual chosen strategy in D7.
