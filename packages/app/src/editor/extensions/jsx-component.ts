import { JsxComponent as BaseJsxComponent } from '@inkeep/open-knowledge-core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { JsxComponentView } from './JsxComponentView';

export const JsxComponent = BaseJsxComponent.extend({
  addNodeView() {
    return ReactNodeViewRenderer(JsxComponentView);
  },
});
