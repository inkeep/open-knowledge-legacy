import type { Editor } from '@tiptap/core';
import type { EditorView } from '@tiptap/pm/view';

/**
 * Non-throwing alternative to `editor.view`.
 *
 * TipTap v3's `editor.view` is a proxy that throws when accessed before the
 * underlying ProseMirror EditorView has been mounted — and during recycle/
 * remount races (Activity visible→hidden→visible cycle, DocumentErrorBoundary
 * retry, any race where React runs a passive effect on an editor mid-creation).
 * The proxy intercepts property access on `editor.view`; the underlying field
 * `editor.editorView` is the real reference and returns `undefined` pre-mount.
 *
 * Use this helper anywhere you would otherwise reach for `editor.view`. The
 * returned value is either a fully-mounted EditorView or `undefined` — callers
 * guard with `if (!view) return` and the call site is safe across the
 * recycle-race window.
 *
 * Reference: CLAUDE.md WARN rule on TipTap throwing-proxy semantics; precedent
 * #18(b) on hybrid Activity + Suspense render trees.
 */
export function getEditorView(editor: Editor): EditorView | undefined {
  return (editor as unknown as { editorView?: EditorView }).editorView;
}
