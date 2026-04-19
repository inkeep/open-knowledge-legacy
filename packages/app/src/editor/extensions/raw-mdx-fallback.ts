/**
 * App-specific RawMdxFallback extension — extends core with React NodeView.
 *
 * The core RawMdxFallback handles schema + markdown. This version adds
 * the React NodeView renderer for the browser editor.
 *
 * FR-30..FR-35: NodeView embeds a CodeMirror 6 editor for inline editing
 * of raw MDX source, replacing the previous plain-text badge view.
 * Direct PM dispatch pattern (Precedent #24), NOT y-codemirror.next.
 */
import { RawMdxFallback as BaseRawMdxFallback } from '@inkeep/open-knowledge-core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { RawMdxFallbackView } from './RawMdxFallbackCMView';

export const RawMdxFallback = BaseRawMdxFallback.extend({
  addNodeView() {
    return ReactNodeViewRenderer(RawMdxFallbackView, {
      // FR-34: stopEvent + ignoreMutation prevent PM's DOM observer
      // from interpreting CM's internal DOM mutations as PM changes.
      stopEvent: () => true,
      ignoreMutation: () => true,
    });
  },
});
