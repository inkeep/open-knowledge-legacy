/**
 * Source-mode navigation helper — scrolls CodeMirror to a specific region.
 *
 * Used by rawMdxFallback badge click: opens source mode and scrolls to the
 * line range corresponding to the fallback's originalSpan attr.
 */

/**
 * Scroll the CodeMirror source editor to a specific character offset region.
 * No-op if CodeMirror is not mounted.
 */
export function scrollSourceToRegion(originalSpan: { start: number; end: number }): void {
  // Source mode scrolling requires access to the CodeMirror EditorView.
  // The view is not globally accessible — it's owned by SourceEditor.tsx.
  // For now, dispatch a custom DOM event that SourceEditor can listen for.
  // Full integration deferred to follow-up.
  window.dispatchEvent(
    new CustomEvent('ok:scroll-source', {
      detail: { start: originalSpan.start, end: originalSpan.end },
    }),
  );
}
