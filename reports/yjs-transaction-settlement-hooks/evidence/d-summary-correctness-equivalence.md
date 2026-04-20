# Evidence: Synthesis — correctness equivalence of `setTimeout(50)` debounce vs `afterAllTransactions`

**Dimension:** Cross-cutting — concrete correctness comparison for the 1-way-door decision
**Date:** 2026-04-16
**Sources:**
- All evidence files D1-D9 in this directory.
- `packages/server/src/server-observers.ts` (current implementation).
- `packages/server/src/agent-sessions.ts` (paired-write origin behavior).
- `packages/server/src/external-change.ts` (paired-write origin behavior).

---

## What the current `setTimeout(50)` debounce achieves

`server-observers.ts:240, 387` — `debounceA = sched.setTimeout(runObserverASync, DEBOUNCE_MS)` (50 ms).

Behavioral roles:

1. **Coalesce within the 50 ms window:** Multiple observer fires within 50 ms collapse to one `runObserverASync`. Useful when many small mutations land in close sequence (e.g., per-keystroke YPM events triggered by `updateYFragment`).

2. **Defer reaction past the same-tick observer cascade:** Even within one drain, observer-triggered sub-transactions fire their own observers. Without a deferral, `runObserverASync` could fire mid-drain on a partially-applied state. The 50 ms gap lets the entire drain settle before the sync runs.

3. **Inject test-time control via `Scheduler` interface:** `scheduler.setTimeout` is mockable; tests use `createManualScheduler()` to step time deterministically.

4. **Collide-safe with paired-writes:** The synchronous baseline refresh + `clearTimeout(debounceA)` for paired writes (lines 220-237) ensures the debounce queue is purged when a paired-write origin (`AGENT_WRITE_ORIGIN`, `FILE_WATCHER_ORIGIN`) atomically wrote both sides. This prevents Path B duplication.

---

## What `afterAllTransactions` provides (per D1-D5)

1. **Per-drain settlement guarantee, synchronous:** Fires once after the outermost `transact()` call drains its entire queue (initial + cascade-triggered). Same call stack, no microtask, no setTimeout.

2. **No coalescing across separate `transact()` calls:** If two distinct WebSocket messages arrive, or a remote message arrives followed by a server-side direct write, `afterAllTransactions` fires twice. The 50 ms `setTimeout` would have collapsed them.

3. **Reentrancy-safe via origin-skip:** Listener-triggered writes start a new drain that re-fires `afterAllTransactions`; standard pattern is `transactions.every(tr => tr.origin === OBSERVER_SYNC_ORIGIN)` to skip.

4. **Mockable only by mocking the Y.Doc itself, OR by directly invoking handler in tests:** No native `Scheduler` knob.

---

## Side-by-side: behavior under each propagation case

| Scenario | `setTimeout(50)` debounce behavior | `afterAllTransactions` behavior | Equivalent? |
|---|---|---|---|
| Single client edit (one `transact`) | Observer fires → 50 ms debounce → 1 sync | `afterAllTransactions` fires once → 1 sync | ✅ Yes (faster) |
| 2 client edits 30 ms apart | Both observers fire; 2nd resets debounce; 1 sync at ~80 ms | 2 separate `afterAllTransactions`; 2 syncs | ❌ Different (more syncs without explicit coalescing) |
| Inbound message merging N peer edits | 1 observer per merged edit (or N for `observe`); all collapse to 1 debounced sync | 1 `afterAllTransactions` (one outer transact per message); 1 sync | ✅ Yes (same number of syncs) |
| Paired-write (agent or file-watcher) | Synchronous baseline refresh + `clearTimeout(debounceA)`; no sync | Origin guard skips the entire reaction; no sync | ✅ Yes |
| Bridge self-write (`OBSERVER_SYNC_ORIGIN`) | Origin guard skips at observer level | Origin guard skips at handler level | ✅ Yes |
| Test running with `ManualScheduler` | `scheduler.flush()` runs pending sync | Mock the Y.Doc OR call handler directly | ❌ Different (test ergonomics change) |
| Cascade: observer triggers sub-transaction | Sub-transaction's observer also debounces (typically same 50 ms window) → 1 sync | Sub-transaction is in same drain; 1 `afterAllTransactions` fires after both → 1 sync | ✅ Yes (`afterAllTransactions` is more correct here — no risk of mid-cascade fire) |
| Burst of 10 server writes within 50 ms | 1 sync (coalesced) | 10 syncs (one per `transact`) | ❌ Different (debounce hides work) |

---

## Concrete correctness deltas

### Δ1: `afterAllTransactions` ELIMINATES coalescing across separate `transact` calls.

Where this matters:
- **Server burst writes:** If a future code path issues many small `transact()` calls in close succession (streaming MCP ingest, multi-write atomic operations done as separate transacts), the bridge runs once per transact instead of once per 50 ms window. Bridge work cost is per-fire, not per-mutation, so 10x fires = 10x serialize+diff cost.
- **Mitigation:** Either (a) make sure server burst paths bundle into one `transact` (idiomatic Yjs guidance — "bundle as many changes as possible," `Transaction.js:23-44`), or (b) layer an explicit coalescing primitive (e.g., a microtask-batched queue) on top of `afterAllTransactions`. Pure setTimeout coalescing was opportunistic; explicit coalescing would be intentional.
- **Status quo coverage:** Current code paths (WebSocket = one transact, agent-write = one transact, file-watcher = one transact) generate exactly one transact per logical operation. The deltas above are hypothetical future patterns. Today's load profile is fine.

### Δ2: `afterAllTransactions` ELIMINATES the test-time `Scheduler` knob.

Where this matters:
- **Existing test harness:** `createTestClient` passes `scheduler` as a DI seam. Tests currently call `scheduler.flush()` to drive the sync deterministically. Removing this DI changes the test contract.
- **Replacement strategy:** Tests using `flush()` would either (a) call the bridge's settlement handler directly (export it from `setupServerObservers`), or (b) wait for the next `afterAllTransactions` fire via a Promise-wrapping helper. Both are workable; both require changing test code.
- **CLAUDE.md precedent #13(b):** "Implicit time-coupling is a test smell." The current `Scheduler` injection IS a defense against implicit time-coupling — moving to `afterAllTransactions` actually *strengthens* this principle (no time at all, only causal settlement). But the migration itself is non-trivial.
- **Status quo coverage:** D18 fuzz coverage gate, ~30 integration tests across `c1-c10-*.test.ts`, and the bridge-convergence regression tests all use `wait(N ms)` or `scheduler.flush()`. Each must be re-evaluated.

### Δ3: `afterAllTransactions` REPLACES "deferral past mid-drain observer cascade" with a stronger guarantee.

Where this matters:
- **Today:** The 50 ms debounce was set conservatively to ensure observer cascades complete before sync. Empirically, most cascades finish in under 1 ms; the 50 ms was a safety margin.
- **Tomorrow:** `afterAllTransactions` IS the cascade-completion signal. Stronger guarantee, no margin needed. This is a pure win for correctness.

### Δ4: `afterAllTransactions` is FASTER for the single-event case (no 50 ms wait).

Where this matters:
- **Latency:** Bridge sync starts ~50 ms sooner. Aggregated over thousands of edits, observable but not user-facing (server-side bridge isn't on the hot path of typing).
- **Status quo coverage:** The CRDT-observer-bridge-latency-analysis report identifies the 50 ms debounce as a NON-bottleneck (`<5%` of the 7s 10K-line cycle). Eliminating it doesn't unlock significant headroom but doesn't hurt either.

### Δ5: Bug-A / paired-write origin behavior MUST be re-implemented in the new model.

Where this matters:
- **Today:** `observerA` does synchronous baseline refresh + `clearTimeout` when a paired-write origin is detected. This prevents Path B duplication when a Y.Text mutation lands in the debounce window.
- **Tomorrow:** No debounce window. Paired writes still need handling: when an `afterAllTransactions` batch contains a paired-write transaction, the bridge's reaction logic should still recognize "both sides were written by the same caller — no work needed, just refresh baseline."
- **Equivalent implementation:** In `afterAllTransactions(doc, transactions)`:
  - If `transactions.every(tr => tr.origin === OBSERVER_SYNC_ORIGIN)`: skip (self-fire).
  - Else if `transactions.some(tr => isPairedWriteOrigin(tr.origin))`: refresh baseline, no sync work.
  - Else: read current state, compute delta, write.
- This is a mechanical translation of the current `observerA` callback's structure.

### Δ6: Run-to-completion semantics ELIMINATE one class of race entirely.

Where this matters:
- **Today's race:** A second remote update can arrive within the 50 ms debounce window. Observer A fires (sets debounce), then debounce fires `runObserverASync`, which reads CRDT state — state may now reflect BOTH the original AND the second update. The original observer's reaction conflates two distinct settled states.
- **Tomorrow:** Each `transact()` call (each WebSocket message) gets its own `afterAllTransactions` fire. No conflation possible. Each fire reflects exactly the state at the end of its drain.
- This is a pure correctness improvement and is one of the strongest reasons to make the move.

---

## Migration verification checklist (for a future implementation spec)

Before flipping the switch in `server-observers.ts`:

1. **Test harness:** Decide on the replacement for `ManualScheduler`. Probably: export `runObserverASync` / `runObserverBSync` for direct invocation, plus a `nextSettlement(doc): Promise<void>` helper that resolves on the next `afterAllTransactions`.

2. **Bug-A regression:** Re-run `STRESS_FUZZ_SEED=1776325179241` and verify the new model handles paired-write origins correctly. Add a property fuzz that asserts no Path B duplication when a paired-write origin is in the batch.

3. **Mutation E (server Observer B attachment) and Mutation F (`skipStoreHooks`):** Verify both still detect their target regression. The `skipStoreHooks` flag is on the `OBSERVER_SYNC_ORIGIN` object itself, so it survives the migration unchanged.

4. **Mutation G (deletion of client Observer A/B write paths):** Unchanged — server-authoritative remains.

5. **Multi-client convergence fuzzer (D18):** Add a fuzzer op that triggers cascade-heavy patterns (one outer transact with many in-observer sub-transacts). Verify settlement-driven bridge produces the same converged state as debounce-driven.

6. **WebSocket burst pattern:** Add an integration test where 5 clients send 10 messages each in rapid succession. Verify the bridge produces N separate sync calls (one per message), and that none are missed or duplicated.

7. **Late-arriving structs:** Construct a test case where `pendingStructs` are filled across two messages. Verify both messages produce their own `afterAllTransactions` fire and the bridge correctly handles both settlements.

8. **Cleanup ordering (CC8):** Verify `setupServerObservers` cleanup unhooks the `afterAllTransactions` listener. The current returned-cleanup function unhooks observer + clears timeouts; the new one unhooks the handler.

---

## Negative correctness items (not at risk)

- **Initial sync (XmlFragment → empty Y.Text):** Wrapped in `doc.transact(..., OBSERVER_SYNC_ORIGIN)`. Self-skip continues to work via origin guard.
- **Server-observer feedback loop (E4 blocker):** `skipStoreHooks: true` on `OBSERVER_SYNC_ORIGIN` continues to short-circuit persistence. Independent of the settlement mechanism.
- **CC1 broadcasts:** No interaction with bridge observers; emits via `__system__` doc, gated by `isSystemDoc()`.
- **Y.UndoManager origin filtering:** Tracks via `LocalTransactionOrigin` object identity; no change required.

---

## Verdict (correctness only — does not address performance/latency rationale)

The migration from `setTimeout(50)` to `afterAllTransactions` is a **net correctness win** with one non-trivial implementation constraint:

- Stronger settlement guarantee (Δ3 + Δ6 are pure wins).
- Removes one whole-class race (Δ6).
- Is faster (Δ4).
- Aligns with ecosystem norm (D4 — y-prosemirror uses `afterAllTransactions` for bracket bookkeeping; no ecosystem editor uses setTimeout debouncing for cross-CRDT bridges).

The constraints:
- Test harness must be re-architected (Δ2). Workable but non-trivial.
- Coalescing across multiple `transact()` calls is gone (Δ1). Today's code paths don't depend on it; future paths must be designed around it (use one `transact` per logical operation, idiomatic Yjs).
- Paired-write handling translates mechanically (Δ5) — no new design.
