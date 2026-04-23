/**
 * Editor context — exposes the TipTap `Editor` instance to descriptor-
 * dispatched React components rendered inside a `JsxComponentView` NodeView.
 *
 * **Why a local context, not `useCurrentEditor()`.** TipTap v3's
 * `useCurrentEditor()` only resolves under `<EditorProvider>`. Our root
 * editor is mounted via `useEditor()` + `<EditorContent />` (see
 * `TiptapEditor.tsx`), which does not expose the provider context. This
 * narrow context fills the gap: `JsxComponentView` wraps the rendered
 * `<Comp>` with the editor it already has as a NodeView prop.
 *
 * **Scope.** Only components that need to read editor state (e.g.
 * `InlineTOCView` walking headings for the live TOC) should consume this.
 * Most built-ins are pure-props and ignore it.
 */

import type { Editor } from '@tiptap/core';
import { createContext, use } from 'react';

const EditorContext = createContext<Editor | null>(null);

export const EditorContextProvider = EditorContext.Provider;

/**
 * Consume the editor instance. Returns `null` when called outside a
 * `JsxComponentView` subtree — components must handle the absence (e.g.
 * fall back to an empty list) rather than throwing.
 */
export function useEditorContext(): Editor | null {
  return use(EditorContext);
}
