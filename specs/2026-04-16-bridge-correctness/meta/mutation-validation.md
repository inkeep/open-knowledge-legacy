# Mutation validation matrix

Defensive validation that Bucket 0 / A / B changes are load-bearing. Each
mutation describes a revert; the linked tests MUST fail under the revert.

## Mutation H — Revert Observer B's paired-write short-circuit

**Revert:** delete the `isPairedWriteOrigin(transaction.origin)` branch added to
`observerB` in `packages/server/src/server-observers.ts` (return to the
pre-US-001 shape where Observer B falls through to the generic debounce path).

**Tests that MUST fail under the revert:**
- `packages/server/src/server-observers.test.ts` → `T8 — FILE_WATCHER paired-write: Observer B short-circuits debounceB symmetrically`
- `packages/server/src/server-observers.test.ts` → `T9 — ROLLBACK paired-write: Observer B short-circuits debounceB symmetrically`
- `packages/server/src/server-observers.test.ts` → `T10 — MANAGED_RENAME paired-write: Observer B short-circuits debounceB symmetrically`

Each test asserts that immediately after a paired-write transaction, no Observer B
debounce is pending. Reverting the branch leaves a scheduled timer, which the
test detects via the injected `ManualScheduler`'s `pending()` API.

## D12 spike decision — determinism path

**Chosen:** unit-level deterministic via `ManualScheduler` dependency injection
(matches the existing seed-1776325179241 pattern at
`packages/server/src/server-observers.test.ts:448`).

**Rationale:** the paired-write race at the observer layer is fully
characterized by a same-process Y.Doc sequence (paired transaction under
origin → concurrent non-paired mutation → scheduler flush). Adding
`pauseOutbound` on `ControllableWebSocket` was considered (symmetric to
`pauseInbound`) but rejected for this story because the deterministic
reproduction already lives at the server-observers unit surface. If a
future story requires multi-client WebSocket-level paired-write determinism
(e.g., fuzz harness needs `pauseOutbound`), add the primitive then.

**Probabilistic fallback (rejected):** 100-run rate-based acceptance was
available as a fallback per SPEC R0e, but the deterministic path succeeds on
the first attempt, so no probabilistic runs are needed.
