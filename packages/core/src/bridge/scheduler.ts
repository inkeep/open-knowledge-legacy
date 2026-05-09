export interface Scheduler {
  setTimeout: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  /** Current clock reading in milliseconds. Production: `Date.now()`.
   *  Tests with a manual scheduler: virtual time advanced by `advanceTime`. */
  now: () => number;
}

export const defaultScheduler: Scheduler = {
  setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
  now: () => Date.now(),
};
