import { CodeBlockFidelity as BaseCodeBlockFidelity } from '@inkeep/open-knowledge-core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { common, createLowlight } from 'lowlight';
import { CodeBlockView } from './CodeBlockView';
import { type LowlightLike, LowlightPlugin } from './code-block-lowlight-plugin';

const lowlight = createLowlight(common) as unknown as LowlightLike;

export const CodeBlockFidelity = BaseCodeBlockFidelity.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      LowlightPlugin({
        name: this.name,
        lowlight,
        defaultLanguage: null,
      }),
    ];
  },
});
