/**
 * HeadingAnchors — app-only ProseMirror decoration plugin that adds a slug-based
 * `id` attribute to every heading element in the WYSIWYG editor DOM.
 *
 * IDs are derived with the same `toWikiLinkSlug` function used to write anchor
 * values in wiki links, so `[[page#my-heading]]` navigates to the heading
 * whose rendered text slugifies to "my-heading".
 *
 * This is deliberately kept out of core/shared extensions because:
 *   - The server doesn't render interactive HTML (IDs serve no purpose there).
 *   - Decorations don't mutate the ProseMirror document or serialised markdown.
 */
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { toWikiLinkSlug } from './wiki-link-helpers';

export const HeadingAnchors = Extension.create({
  name: 'headingAnchors',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name === 'heading') {
                const id = toWikiLinkSlug(node.textContent);
                if (id) {
                  decos.push(Decoration.node(pos, pos + node.nodeSize, { id }));
                }
              }
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
