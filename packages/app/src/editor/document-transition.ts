/**
 * Pure wrapper: given a raw `openDocument` function and React's
 * `startTransition`, returns an `openDocumentTransition` that wraps the
 * doc-open call in a transition scope.
 *
 * Extracted as a standalone function so the wrapping contract can be
 * unit-tested without a React rendering harness (see iteration 4 / iteration
 * 5 notes for the repo's "pure helper + Playwright for render behavior"
 * convention).
 *
 * React semantics: wrapping `openDocument` in `startTransition` marks the
 * subsequent state updates (and their suspending re-renders) as non-urgent,
 * which (a) keeps previously-revealed content visible while the next entry
 * suspends (content-continuity; SPEC G2) and (b) keeps `isPending` true for
 * the full duration of the suspending re-render (SPEC G3 — consumed by
 * `NavigationPendingBar`).
 */
export function createOpenDocumentTransition(
  openDocument: (docName: string) => void,
  startTransition: (scope: () => void) => void,
): (docName: string) => void {
  return (docName: string) => {
    startTransition(() => {
      openDocument(docName);
    });
  };
}
