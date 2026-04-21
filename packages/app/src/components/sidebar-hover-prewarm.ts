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
import { mark } from '@/lib/perf';

const HOVER_INTENT_MS = 80;
const MAX_CONCURRENT_PREWARMS = 3;
/**
 * Upper bound on `alreadyPrewarmed` (review Pass-2 Minor #5). Over a long
 * session, unbounded growth would accumulate strings for every doc ever
 * hovered; cap at 2× MAX_POOL so a pool eviction naturally follows a
 * prewarm eviction and the next hover can re-prewarm if needed. LRU-
 * drop on overflow is acceptable — the worst case is a rare extra
 * prewarm call for a doc that was evicted a long time ago.
 */
const MAX_ALREADY_PREWARMED = 20;

type PrewarmFn = (docName: string) => void;

interface PendingEntry {
  timer: ReturnType<typeof setTimeout>;
  prewarm: PrewarmFn;
}

const pendingTimers = new Map<string, PendingEntry>();
const inflight = new Set<string>();
const queued: Array<{ docName: string; prewarm: PrewarmFn }> = [];
// LRU-bounded via insertion-order iteration over a Map — we use a Map
// (not Set) so we can efficiently trim the oldest entry on overflow.
// Value is unused; the Map's insertion-order iteration gives us LRU.
const alreadyPrewarmed = new Map<string, true>();

function markAlreadyPrewarmed(docName: string): void {
  // Re-insert to move to end of insertion order (Map LRU pattern).
  alreadyPrewarmed.delete(docName);
  alreadyPrewarmed.set(docName, true);
  while (alreadyPrewarmed.size > MAX_ALREADY_PREWARMED) {
    const oldest = alreadyPrewarmed.keys().next().value;
    if (oldest === undefined) break;
    alreadyPrewarmed.delete(oldest);
  }
}

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
    markAlreadyPrewarmed(next.docName);
    try {
      next.prewarm(next.docName);
    } catch (err) {
      // A synchronous throw from the prewarm path (transitive failure in
      // HocuspocusProvider ctor, WebSocket creation, etc.) would escape
      // into `window.onerror` without this catch — no React boundary
      // catches setTimeout/drainQueue exceptions (review Pass-2 Major
      // #9). Emit telemetry + swallow so a sidebar hover never takes
      // down the page.
      mark('ok/sidebar/prewarm-failed', {
        docName: next.docName,
        message: err instanceof Error ? err.message : String(err),
      });
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
    markAlreadyPrewarmed(docName);
    inflight.add(docName);
    try {
      prewarm(docName);
    } catch (err) {
      // review Pass-2 Major #9 — same rationale as `drainQueue`.
      mark('ok/sidebar/prewarm-failed', {
        docName,
        message: err instanceof Error ? err.message : String(err),
      });
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
