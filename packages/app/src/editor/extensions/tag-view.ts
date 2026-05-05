import { Tag as BaseTag } from '@inkeep/open-knowledge-core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TagView } from '../components/TagView.tsx';

export const Tag = BaseTag.extend({
  addNodeView() {
    return ReactNodeViewRenderer(TagView);
  },
});
