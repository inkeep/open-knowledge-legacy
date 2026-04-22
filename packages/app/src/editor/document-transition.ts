/**
 * Pure wrapper: given a raw `openDocument` function, React's `startTransition`,
 * and an `isWarm(docName)` predicate, returns an `openDocumentTransition` that
 * splits fast-path and slow-path navigation:
 *
 *   WARM (isWarm returns true)
 *     Wrap `openDocument` in `startTransition`. The previously-revealed subtree
 *     stays visible while the new entry's `use(syncPromise)` resolves in the
 *     same render (cache-hit — `hasSynced=true`), delivering flash-free
 *     content-continuity (SPEC G2 / precedent #18(f)).
 *
 *   COLD (isWarm returns false)
 *     Call `openDocument` directly WITHOUT `startTransition`. React's default
 *     Suspense behavior paints the `<EditorSkeleton />` fallback immediately,
 *     so the shell (sidebar, header, tabs) updates synchronously before the
 *     expensive editor mount + sync work runs. The skeleton gives the user
 *     immediate "something's happening" feedback on cold loads where the
 *     previous content staying visible would feel like lag.
 *
 * Extracted as a pure helper so the split can be unit-tested without a React
 * rendering harness.
 */
export function createOpenDocumentTransition(
  openDocument: (docName: string) => void,
  startTransition: (scope: () => void) => void,
  isWarm: (docName: string) => boolean,
): (docName: string) => void {
  return (docName: string) => {
    if (isWarm(docName)) {
      startTransition(() => {
        openDocument(docName);
      });
      return;
    }
    openDocument(docName);
  };
}
