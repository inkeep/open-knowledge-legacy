/**
 * Resolve the currently-active document name from the URL hash. The hash
 * route (`#/foo/bar`) is the canonical source of truth for the active doc;
 * `internal-link-helpers.ts:10` reads it the same way for link
 * classification.
 *
 * Pre-merge this module exposed a singleton (`setCurrentDocName` / module-
 * level `currentDocName`) populated by `TiptapEditor.tsx` on mount. Post-
 * supersession HEAD uses a per-editor WeakMap (`editorDocName` in
 * `extensions/doc-context.ts`) for callers that have an Editor instance —
 * but PropPanel's `runUpload` doesn't have one. The hash is stable,
 * race-free against editor mount/unmount, and aligned with how the rest of
 * the link layer already resolves the active doc.
 */

export function getCurrentDocName(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.hash.match(/^#\/([^?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
