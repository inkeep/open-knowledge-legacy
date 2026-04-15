/**
 * App-specific RawMdxFallback extension — extends core with React NodeView.
 *
 * The core RawMdxFallback handles schema + markdown. This version adds
 * the React NodeView renderer for the browser editor (R7 visual chrome).
 */
import { RawMdxFallback as BaseRawMdxFallback } from '@inkeep/open-knowledge-core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { RawMdxFallbackView } from './RawMdxFallbackView';

export const RawMdxFallback = BaseRawMdxFallback.extend({
  addNodeView() {
    return ReactNodeViewRenderer(RawMdxFallbackView);
  },
});
