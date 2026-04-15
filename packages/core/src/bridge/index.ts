/**
 * Bridge utilities — shared between the client observer (baseline
 * tracking) and the server observer (cross-CRDT writes under
 * OBSERVER_SYNC_ORIGIN, precedent #14).
 *
 * See `packages/server/src/server-observers.ts` for the primary consumer
 * and `specs/2026-04-15-server-authoritative-observer-bridge/SPEC.md`
 * for the architectural rationale.
 */
export { applyIncrementalDiff, applyUserDelta } from './apply-diff.ts';
export { type DiffChange, diffLinesFast } from './diff-lines.ts';
export { getFrontmatter } from './frontmatter-y.ts';
export { normalizeBridge } from './normalize.ts';
export { defaultScheduler, type Scheduler } from './scheduler.ts';
