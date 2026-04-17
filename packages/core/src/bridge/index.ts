/**
 * Bridge utilities — consumed by the server-authoritative observer
 * (`packages/server/src/server-observers.ts`, writes under
 * `OBSERVER_SYNC_ORIGIN`) and the client observer shell
 * (`packages/app/src/editor/observers.ts`, read-only baseline tracker).
 *
 * See `packages/core/src/bridge/README.md` for the public API reference
 * and post-condition policy. Governing specs:
 * `specs/2026-04-15-server-authoritative-observer-bridge/SPEC.md` and
 * `specs/2026-04-16-bridge-correctness/SPEC.md`.
 */
export { applyFastDiff, applyIncrementalDiff } from './apply-diff.ts';
export { type DiffChange, diffLinesFast } from './diff-lines.ts';
export { getFrontmatter } from './frontmatter-y.ts';
export {
  assertContentPreservation,
  BridgeMergeContentLossError,
  type BridgeMergeContentLossInfo,
  type BridgeMergeContentLossLogPayload,
  type BridgeMergeContentLossSide,
  type BridgeMergeContentLossWhich,
  mergeThreeWay,
} from './merge-three-way.ts';
export { normalizeBridge } from './normalize.ts';
// Scheduler DI is retained as a shared core primitive for non-bridge consumers
// (idle-shutdown, ok-ui lifecycle). The dual-CRDT observer bridge does NOT use
// it (precedent #13(b) — see bridge-no-wallclock.test.ts enforcement).
export { defaultScheduler, type Scheduler } from './scheduler.ts';
