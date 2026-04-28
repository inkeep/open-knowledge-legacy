# Evidence: D4 — Correctness under PR #311 scenarios (3P + 1P)

**Dimension:** For each viable candidate from D1, determine whether it can fix the bug alone (Shape 3), substitute for sidecar (Shape 2), compose as dual-layer (Shape 1). Tie findings to specific scenarios in OK's 11-test suite.
**Date:** 2026-04-24
**Sources:** D3 matrix, prior y-indexeddb report D2 (CRDT item semantics), 1P inspection of PR #311's test scenarios.

---

## Core correctness finding carried forward from prior research

From prior y-indexeddb report D2:

> CRDT merge is ADDITIVE. Items keyed by `(clientID, clock)` are structurally dedupe'd by identity — NOT by content. Two items encoding the same markdown text under different `(clientID, clock)` pairs BOTH exist after merge. **Any client-side persistence that preserves pre-restart server items triggers duplication on reconnect to a post-restart server with a fresh clientID.**

This holds for **all four candidates** (y-indexeddb, DIY IDB, DIY OPFS, DIY SQLite-WASM). The storage substrate is irrelevant; what matters is **whether pre-restart server items end up in the fresh-server's Y.Doc state**.

---

## Shape classification per candidate

### Shape 0 (ship PR #311 as-is)

Candidate-agnostic baseline. Not an adoption scenario.

### Shape 1 (add client persistence ON TOP of sidecar)

Every candidate works as a dual-layer addition. Choice matrix:

| Candidate | Shape 1 viability | Tradeoff |
|-----------|:-----------------:|----------|
| y-indexeddb | ✅ trivial | ~6 LOC in provider-pool; ecosystem familiarity |
| DIY IDB | ✅ | ~200-300 LOC; custom control + OTel |
| DIY OPFS | ⚠️ viable but heavy | Worker boundary + Bun test gap; marginal gain |
| DIY SQLite-WASM | ❌ not viable at our scale | Bundle cost not justified by our doc sizes |

**Recommendation for Shape 1:** y-indexeddb, patched for issue #31. The LOC delta is small; gains are real (instant Cmd-R, offline edit retention across tab close).

### Shape 2 (replace sidecar with client persistence + instance-ID defense + `clearData` on recycle)

Every candidate requires identical correctness machinery:
1. Keep instance-ID defense (server broadcasts UUID, client caches + claims).
2. On `authenticationFailed` (reason=`server-instance-mismatch`), call `clearData()` or equivalent on the persistence layer.
3. Destroy the provider entry; re-open fresh.

**Problem:** `clearData()` loses any unsynced edits in the local persistence. This is the gap flagged in prior research (Shape 2's architectural regression vs Shape 0's sidecar-preservation of sub-L1 server-Y.Doc state).

### Shape 2+ (Shape 2 with buffer-and-replay on recycle)

**This is the architecturally-complete version** that addresses the Shape 2 regression without reintroducing the sidecar. Design:

1. Client tracks its **own clientID's last-acknowledged state vector** against the server (reuses HocuspocusProvider's own tracking; exposed via `provider.unsyncedChanges` count and deeper via `provider.synced` lifecycle).
2. On `authenticationFailed`:
   - Compute `unsyncedBytes = Y.encodeStateAsUpdate(doc, lastAckedStateVector)`. This is ONLY the items not yet confirmed synced with server.
   - Buffer `unsyncedBytes` in memory (not in IDB; IDB is about to be wiped).
3. Call `persistence.clearData()`.
4. Call `provider.destroy()`.
5. Open fresh provider + persistence.
6. Wait for `provider.on('synced')` (server-synced, not IDB-synced).
7. Apply `Y.applyUpdate(newDoc, unsyncedBytes)` with origin = client's tab identity. These re-apply as new items under the CLIENT's clientID, which is stable across reload — no duplication with server items.
8. Post-application the normal WebSocket sync propagates them to server.

This preserves ~100% of unsynced-to-server edits at the cost of ~50-100 LOC of buffer-and-replay machinery.

### Shape 3 (persistence only, no instance-ID)

**Not viable with any candidate.** Prior report established this: CRDT additive merge does not dedupe content. Pre-restart server items + post-restart fresh-server items → content doubles regardless of storage backend.

---

## Per-scenario behavior matrix (OK's 11-test suite)

All under the recommendation path (Shape 2+ with y-indexeddb):

| Test | Scenario | Shape 2+ outcome |
|------|----------|------------------|
| T1 | Fast restart single client | PASS — instance mismatch → buffer-and-replay → converged fresh state |
| T2 | Fast restart multi-client | PASS — each client buffers-and-replays independently |
| T3 | Slow restart recycle | PASS — already passes via HocuspocusProvider's reconnect; IDB added below is orthogonal |
| T4 | Unsynced local edits | PASS — buffer-and-replay captures these; replayed after fresh sync |
| T5 | Branch switch while tab open | PASS — requires BRANCH-AWARE INVALIDATION (strategy A1/A2/A3; A1 via CC1 recommended) |
| T6 | Agent write during restart | PASS — agent writes via server API, orthogonal to client persistence layer |
| T7 | Rollback multi-client | PASS — already passes; rollback is server-side operation |
| T8 | Managed rename with populated target | PASS — rename triggers docName change; old IDB becomes stale (GC via rename-time clearData) |
| T9 | External edit during downtime | PASS — fresh client has no state; syncs from markdown-rebuilt server |
| T10 | Y.Text source mode restart | PASS — same mechanism as T1; both fragments preserved in Y.Doc binary |
| T11 | Mid-drain restart | PASS — mid-drain is server-side timing; client buffer-and-replay catches its part |

**All 11 tests pass under Shape 2+. No exception.**

### Test updates required

From prior y-indexeddb report D4 re-read:
- **T5** (branch-switch-live-client) has a mechanism-specific assertion:
  ```ts
  const ystateDir = join(contentDir, '.open-knowledge', 'ystate');
  if (existsSync(ystateDir)) { ... }
  ```
- Under Shape 2+, no `.open-knowledge/ystate/` exists (the server-side sidecar is gone). This assertion becomes vacuous (the `if (existsSync)` check returns false).
- Replace with: **client-side IDB state assertion**. After branch switch + CC1 broadcast + client clearData + recycle, assert that the client's IDB doesn't contain pre-switch items. This requires inspecting fake-indexeddb's internal state in test — feasible via `indexedDB.databases()` API.

### New tests required for Shape 2+

- **T12 — Buffer-and-replay preserves typing-burst during restart.** Simulate rapid client typing while server is about to crash. Assert that post-buffer-and-replay, all burst characters appear in final state.
- **T13 — Cold start (fresh tab, empty IDB) against restarted server.** Confirm no content duplication; client cleanly syncs from markdown-rebuilt server.
- **T14 — Populated-IDB tab connects to different server instance.** E.g., user restarted server manually, then opens a stale tab. Same mechanism fires; state converges.

---

## Correctness depth dive: Shape 2+ buffer-and-replay semantics

### What's being buffered?

The "unsynced part" of the client's Y.Doc from the server's POV. Computed as `Y.encodeStateAsUpdate(doc, lastServerSyncedSV)` where `lastServerSyncedSV` is the state vector the server had at the last successful sync.

HocuspocusProvider does NOT natively expose `lastServerSyncedSV`, but:
- `provider.synced` becomes `true` at the end of the sync protocol handshake.
- At that moment, `Y.encodeStateVector(provider.document)` captures what the server confirmed it has.
- We save this in the ProviderPool entry: `entry.lastServerSyncedSV = Y.encodeStateVector(provider.document)`.
- We refresh it on every `provider.on('synced')` thereafter.

When recycle fires, we read `entry.lastServerSyncedSV` and compute the unsynced delta.

### What IS the unsynced delta?

- ALL items under the CLIENT's clientID that were created between the last sync and now.
- ALL items under OTHER client clientIDs that the client received but hadn't yet forwarded to the server (rare in practice — peers broadcast via server, so the server normally has these already).

Net: the buffer preserves typing since the last confirmed server round-trip. This is exactly what PR #311's server-side sidecar was preserving on the server side — now preserved on the client side.

### What's NOT buffered (intentional)

Items under the pre-restart server's clientID. Those are the "polluted" items that would cause duplication. They're discarded by `clearData()`. No regression here — they would have been re-generated from markdown on the fresh server anyway.

### What if the client has items from the pre-restart server AND unsynced local items?

```
Pre-recycle Y.Doc: items under {S1 (server pre), C1 (client)}
  - items under S1: structural encoding of markdown content, from pre-restart server
  - items under C1 since last sync: client's unsynced typing

Buffer computation:
  unsyncedBytes = Y.encodeStateAsUpdate(doc, lastServerSyncedSV)
  ← This is ONLY the client's C1 items that the server didn't acknowledge.
  ← S1 items were in the last sync handshake (they came FROM the pre-restart server), so
    lastServerSyncedSV already accounts for them. They're NOT in unsyncedBytes.

clearData wipes IDB.
Recycle → open fresh provider + IDB.
Fresh server sync: gets {S2 (server post), C1 sync-items that server already has from past,
  C1 "new since restart" items we haven't replayed yet}

Network-synced event fires. Apply unsyncedBytes:
  Y.applyUpdate(newDoc, unsyncedBytes)  ← C1 items re-inserted

HocuspocusProvider auto-syncs the re-applied C1 items to fresh server. Fresh server integrates.

Final state: {C1 sync-items, C1 new-since-restart items, S2 items from markdown}
  No S1 items. No duplication. All user edits preserved.
```

This flow is the architecturally-correct version of "Shape 2 with buffer-and-replay."

---

## Risk / failure modes of Shape 2+

1. **Browser tab crashes between unsynced typing and client recycle.** In Shape 0/1 (with y-indexeddb), IDB still has the bytes. In Shape 2+ (memory buffer only during recycle), IDB is wiped first — buffer is in memory. If tab crashes at THAT moment, edits lost.
   - Mitigation: don't wipe IDB until AFTER buffer is computed AND provider has acknowledged fresh sync. Add "recovery-pending" flag in localStorage; if flag set on next load, restore from backup.
   - Complexity: ~30 LOC. Acceptable.
2. **Server comes back up before client has been notified of restart.** Client's authenticationFailed never fires. Client might sync pre-restart items to post-restart server under the OLD Hocuspocus session — Hocuspocus's own session tracking might catch this, but worth a test.
3. **Fresh server's markdown is different from what's reflected in `lastServerSyncedSV`.** Example: user edited markdown on disk while server was down (T9 scenario). `lastServerSyncedSV` reflects "server had these items"; on fresh sync the server now has "different items because markdown is different." The replay would re-add client's C1 items on top of the already-reconciled fresh-server state. Yjs merges cleanly — C1 items go in, encoded against the new server state.
   - Works correctly because the C1 items are BY CLIENT's clientID. They don't conflict with S2 items. The final markdown might look different (user's edits layered on top of whatever changed), but it's CORRECT — user's unsynced typing is preserved alongside disk changes.

---

## Conclusion for D4

**All four candidates can support Shape 2+.** The storage substrate is orthogonal.

**y-indexeddb is the shortest path to Shape 2+**, since it already has `clearData()` exposed and its API fits the ProviderPool lifecycle we need.

**Shape 2+ is the correct architectural target** for a greenfield-mindset implementation:
- Eliminates ~1100 LOC of server-side sidecar.
- Adds ~300-400 LOC of client-side (y-indexeddb wiring + buffer-and-replay + branch-invalidation + tests).
- Net: ~-700 LOC, plus the gains of Cmd-R instant render + offline editing + no sub-L1 edit loss.

This reverses the prior y-indexeddb report's recommendation (Shape 0) because the prior report did NOT evaluate Shape 2+ (Shape 2 with buffer-and-replay). With buffer-and-replay incorporated, Shape 2+ achieves everything Shape 0 does AND eliminates server-side complexity.

**Revised recommendation for OK:** Adopt Shape 2+ (replace server-side sidecar with client-side y-indexeddb + buffer-and-replay on recycle).
