/**
 * Scheduler interface — test-deterministic DI around `setTimeout`,
 * `clearTimeout`, and the clock reference used by elapsed-time comparisons.
 *
 * Production: arrow-wrapped passthrough to `globalThis.setTimeout` /
 * `clearTimeout` / `Date.now()`. Tests inject a manual scheduler for
 * synchronous deterministic flush plus a virtual clock so that `now()`
 * advances in lockstep with `setTimeout` dueAt calculations.
 *
 * **Non-bridge primitive.** Under bridge-correctness SPEC §6 R4/R5b +
 * precedent #13(b), the dual-CRDT server observer bridge MUST NOT
 * consume this — `packages/server/src/bridge-no-wallclock.test.ts` fails
 * CI on any `Scheduler` / `setTimeout` / `sched.*` call-site in
 * `server-observers.ts` or `observers.ts`. The primitive lives in
 * `@inkeep/open-knowledge-core` for consumers outside the bridge
 * (idle-shutdown, ok-ui lifecycle, future time-coupled machinery that
 * needs deterministic test control) — they depend on it legitimately.
 *
 * Identity matching is structural — a locally-declared interface with
 * identical shape satisfies this one.
 */
export interface Scheduler {
  setTimeout: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  /** Current clock reading in milliseconds. Production: `Date.now()`.
   *  Tests with a manual scheduler: virtual time advanced by `advanceTime`. */
  now: () => number;
}

/**
 * Real-clock scheduler — wraps `globalThis.setTimeout` / `clearTimeout` /
 * `Date.now()`. Used by non-bridge consumers when no test scheduler is
 * injected.
 */
export const defaultScheduler: Scheduler = {
  setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
  now: () => Date.now(),
};
