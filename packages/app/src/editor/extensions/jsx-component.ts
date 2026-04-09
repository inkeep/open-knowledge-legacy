/**
 * App-specific JsxComponent extensions — extends core factory extensions with React NodeViews.
 *
 * The core extensions handle schema + markdown. These versions add
 * the React NodeView renderer for the browser editor.
 *
 * - jsxComponentEditable → JsxComponentView (registry-driven, prop panel, NodeViewContent)
 * - jsxComponentVoid → JsxComponentVoidView (UnregisteredFallback, raw JSX display)
 */
import { jsxComponentEditable, jsxComponentVoid } from '@inkeep/open-knowledge-core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { JsxComponentView } from './JsxComponentView';
import { JsxComponentVoidView } from './JsxComponentVoidView';

export const JsxComponentEditable = jsxComponentEditable.extend({
  addNodeView() {
    return ReactNodeViewRenderer(JsxComponentView);
  },
});

export const JsxComponentVoid = jsxComponentVoid.extend({
  addNodeView() {
    return ReactNodeViewRenderer(JsxComponentVoidView);
  },
});
