/**
 * App-specific JsxComponent extensions — extends core factory extensions with React NodeViews.
 *
 * The core extensions handle schema + markdown. These versions add
 * the React NodeView renderer for the browser editor.
 */
import { jsxComponentEditable, jsxComponentVoid } from '@inkeep/open-knowledge-core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { JsxComponentView } from './JsxComponentView';

// For now, both types use the same view component — US-010 will split them
// into registry-driven renderer (editable) and UnregisteredFallback (void).
export const JsxComponentEditable = jsxComponentEditable.extend({
  addNodeView() {
    return ReactNodeViewRenderer(JsxComponentView);
  },
});

export const JsxComponentVoid = jsxComponentVoid.extend({
  addNodeView() {
    return ReactNodeViewRenderer(JsxComponentView);
  },
});
