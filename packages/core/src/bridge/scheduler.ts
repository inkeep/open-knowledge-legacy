/**
 * Scheduler interface for bridge observer debounces, typing-defer timers,
 * and the clock reference used by elapsed-time comparisons.
 *
 * Production: arrow-wrapped passthrough to `globalThis.setTimeout` /
 * `clearTimeout` / `Date.now()`. Tests inject a manual scheduler for
 * synchronous deterministic flush AND a virtual clock so that `now()`
 * advances in lockstep with `setTimeout` dueAt calculations.
 *
 * The `now()` method is essential: observer callbacks use elapsed-time
 * comparisons (typing defer, remote-tree grace window) to decide whether
 * to reschedule their debounce. Under ManualScheduler, those comparisons
 * must use the same virtual clock as `setTimeout` — mixing `Date.now()`
 * (real) with scheduler `dueAt` (virtual) produces unbounded skew and
 * breaks the deterministic timing model.
 *
 * Shared between client (`packages/app/src/editor/observers.ts`) and
 * server (`packages/server/src/server-observers.ts`). Extracted here
 * per precedent #4 ("Shared computation, per-surface rendering") so the
 * interface is declared once and all bridge consumers satisfy the same
 * type. Identity matching is structural — a locally-declared interface
 * with identical shape satisfies it.
 */
export interface Scheduler {
  setTimeout: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  /** Current clock reading in milliseconds. Production: `Date.now()`.
   *  Tests with ManualScheduler: virtual time advanced by `advanceTime`. */
  now: () => number;
}

/**
 * Real-clock scheduler — wraps `globalThis.setTimeout` / `clearTimeout` /
 * `Date.now()`. Used by both client and server observers when no test
 * scheduler is injected.
 */
export const defaultScheduler: Scheduler = {
  setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
  now: () => Date.now(),
};
