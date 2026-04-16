/**
 * Pure wrapper: composes the two-step retry contract consumed by
 * `NavigationPendingBar` tier 3 "Try again?" (spec §D7) and invoked from the
 * nav-render layer (US-009).
 *
 * The retry drops the cached syncPromise entry (so the next Suspense-read in
 * `DocumentBoundary` sees a fresh promise) and re-enters navigation via
 * `openDocumentTransition` to the same docName. When `activeDocName` is absent
 * the returned handler is a no-op — there's nothing to retry.
 *
 * Extracted as a standalone function so the wrapping contract can be
 * unit-tested without a React rendering harness (matches the
 * `createOpenDocumentTransition` precedent from iter 8, and the pure-function
 * convention established by iterations 4 through 7). Runtime "clicking Try
 * again during isPending re-enters Suspense with a fresh promise" behavior is
 * Playwright-asserted in US-012.
 */
export interface CreateNavigationRetryHandlerArgs {
  /**
   * Called first — removes the cached promise for this doc so the next render
   * of `DocumentBoundary` calls `syncPromise(docName, provider)` and gets a
   * fresh promise reference instead of the stuck-pending one.
   */
  invalidateSyncPromise: (docName: string) => void;
  /**
   * Called second — re-enters the doc via `startTransition`. React re-renders
   * `DocumentBoundary`, which `use()`s the new cached promise, which suspends
   * afresh with `isPending` flipping true again.
   */
  openDocumentTransition: (docName: string) => void;
  /**
   * Thunk resolved at call time (not at construction time) so the handler
   * always sees the current active doc — not a stale snapshot captured when
   * the retry button was first mounted.
   */
  getActiveDocName: () => string | null;
}

/**
 * Build a retry handler that invalidates the cached syncPromise for the
 * currently-active doc, then re-enters navigation to the same doc via
 * `startTransition`. Ordering is load-bearing: the cache MUST be cleared
 * before the re-enter schedules a new Suspense render.
 *
 * No-op when there is no active doc.
 */
export function createNavigationRetryHandler(args: CreateNavigationRetryHandlerArgs): () => void {
  const { invalidateSyncPromise, openDocumentTransition, getActiveDocName } = args;
  return () => {
    const docName = getActiveDocName();
    if (!docName) return;
    invalidateSyncPromise(docName);
    openDocumentTransition(docName);
  };
}
