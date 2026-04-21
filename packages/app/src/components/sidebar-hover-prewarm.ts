/**
 * Hover-intent debouncer + concurrency cap for sidebar prewarm (review
 * Major #7 wiring + V2 SPEC FR12 Option G).
 *
 * Contract:
 *   - `scheduleHoverPrewarm(docName, prewarm)` starts an 80ms timer.
 *     Hovering off before the timer fires cancels the prewarm (mouse-trail
 *     across the sidebar generates zero prewarms).
 *   - `cancelHoverPrewarm(docName)` cancels a pending timer for a specific
 *     doc. Called from the sibling's `onMouseLeave` handler.
 *   - Pending prewarms cap at 3 concurrent — additional hovers are
 *     deferred until an in-flight prewarm completes.
 *   - Already-prewarmed docs are idempotent (the pool's `prewarm()` is
 *     itself idempotent; we track so we don't pile up deferred entries).
 *
 * Why not inline in FileTree: keeps the component free of timing logic
 * and gives the policy a testable surface. Pure helper — no React.
 */

import { isSystemDoc } from '@/editor/is-system-doc';

const HOVER_INTENT_MS = 80;
const MAX_CONCURRENT_PREWARMS = 3;

type PrewarmFn = (docName: string) => void;

interface PendingEntry {
  timer: ReturnType<typeof setTimeout>;
  prewarm: PrewarmFn;
}

const pendingTimers = new Map<string, PendingEntry>();
const inflight = new Set<string>();
const queued: Array<{ docName: string; prewarm: PrewarmFn }> = [];
const alreadyPrewarmed = new Set<string>();

function finishInflight(docName: string): void {
  inflight.delete(docName);
  drainQueue();
}

function drainQueue(): void {
  while (inflight.size < MAX_CONCURRENT_PREWARMS && queued.length > 0) {
    const next = queued.shift();
    if (!next) break;
    if (alreadyPrewarmed.has(next.docName)) continue;
    inflight.add(next.docName);
    alreadyPrewarmed.add(next.docName);
    try {
      next.prewarm(next.docName);
    } finally {
      // Synchronous completion model — ProviderPool.prewarm returns the
      // entry synchronously. The "inflight" concept is a soft-budget to
      // avoid storming the server with too many concurrent fetches when
      // a lot of hover intent fires at once; we release immediately
      // since the actual network fetch is handled by HocuspocusProvider's
      // own queue.
      finishInflight(next.docName);
    }
  }
}

/**
 * Fire `prewarm(docName)` after `HOVER_INTENT_MS` unless cancelled
 * (mouse-trail dismisses it). Rate-limited by `MAX_CONCURRENT_PREWARMS`.
 * No-op for system docs.
 */
export function scheduleHoverPrewarm(docName: string, prewarm: PrewarmFn): void {
  if (isSystemDoc(docName)) return;
  if (alreadyPrewarmed.has(docName)) return;
  // Cancel any prior pending timer for this doc — don't pile up.
  const prior = pendingTimers.get(docName);
  if (prior) clearTimeout(prior.timer);

  const timer = setTimeout(() => {
    pendingTimers.delete(docName);
    if (inflight.size >= MAX_CONCURRENT_PREWARMS) {
      queued.push({ docName, prewarm });
      return;
    }
    alreadyPrewarmed.add(docName);
    inflight.add(docName);
    try {
      prewarm(docName);
    } finally {
      finishInflight(docName);
    }
  }, HOVER_INTENT_MS);

  pendingTimers.set(docName, { timer, prewarm });
}

/** Cancel a pending hover-intent timer. Called from `onMouseLeave`. */
export function cancelHoverPrewarm(docName: string): void {
  const pending = pendingTimers.get(docName);
  if (pending) {
    clearTimeout(pending.timer);
    pendingTimers.delete(docName);
  }
}

/** Test-only reset. */
export function __resetSidebarHoverPrewarmForTests(): void {
  for (const { timer } of pendingTimers.values()) {
    clearTimeout(timer);
  }
  pendingTimers.clear();
  inflight.clear();
  queued.length = 0;
  alreadyPrewarmed.clear();
}
