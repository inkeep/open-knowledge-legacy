/**
 * Pure wrapper: composes the retry contract consumed by `NavigationPendingBar`
 * tier 3 "Try again" (spec §D7) and invoked from the nav-render layer (US-009).
 *
 * The retry recycles the pool entry (which destroys + recreates the provider
 * and clears the cached syncPromise via `destroyEntry`'s `invalidateSyncPromise`
 * call) and re-enters navigation via `openDocumentTransition` to the same
 * docName. When `activeDocName` is absent the returned handler is a no-op —
 * there's nothing to retry.
 *
 * Why recycle (not just invalidate): the bar's tier-3 fires after sync has
 * exceeded 25s. The most likely failure modes (network-stuck WebSocket,
 * server-rejected handshake, `setupObservers` crash) all leave the existing
 * provider in a state where simply re-attaching to the cached promise would
 * either hang again on the same broken socket (network) or warm-path-resolve
 * immediately on a `synced=true` provider with no observers wired
 * (`BridgeSetupError` — see `provider-pool.ts:setupObservers` catch). Recycle
 * gives a clean-slate retry.
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
   * Called first — destroys + recreates the pool entry so the new
   * `DocumentBoundary` render attaches to a fresh provider. `recycleDocument`
   * preserves `activeDocName` across the swap so `EditorArea` does not flash
   * the "Select a document" empty state. The internal `destroyEntry` call
   * also invalidates the cached syncPromise as a side effect — no separate
   * invalidate call needed.
   */
  recycleDocument: (docName: string) => void;
  /**
   * Called second — re-enters the doc via `startTransition`. React re-renders
   * `DocumentBoundary`, which `use()`s the freshly-cached promise, which
   * suspends with `isPending` flipping true again.
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
 * Build a retry handler that recycles the pool entry for the currently-active
 * doc, then re-enters navigation to the same doc via `startTransition`.
 * Ordering is load-bearing: the recycle MUST destroy the broken provider
 * before the re-enter schedules a new Suspense render.
 *
 * No-op when there is no active doc.
 *
 * **Rapid-click safety:** each `pool.recycle(docName)` call runs
 * `destroyEntry` on the CURRENT entry (disconnects WebSocket, clears
 * syncPromise timeout, calls `provider.disconnect()`) before creating a
 * fresh entry. So rapid clicks are sequential destroy→create cycles, not
 * parallel accumulations — no orphaned providers or leaked WebSockets.
 * The churn is wasteful (create then immediately destroy) but bounded by
 * human click speed (~200ms minimum inter-click interval). A debounce
 * guard is unnecessary given this self-cleaning property.
 */
export function createNavigationRetryHandler(args: CreateNavigationRetryHandlerArgs): () => void {
  const { recycleDocument, openDocumentTransition, getActiveDocName } = args;
  return () => {
    const docName = getActiveDocName();
    if (!docName) return;
    recycleDocument(docName);
    openDocumentTransition(docName);
  };
}
