/**
 * Agent Flash Plugin — WYSIWYG (ProseMirror)
 *
 * Pure decoration plugin: responds to 'agentFlashTrigger' transaction
 * metadata to apply/remove flash decorations on all top-level blocks.
 *
 * Activity map observation is handled in TiptapEditor.tsx's useEffect
 * (avoids StrictMode double-mount issues with stale view references).
 */

import type { Transaction } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const agentFlashPluginKey = new PluginKey('agentFlash');

/** Transaction metadata key for triggering flash */
export const FLASH_META_KEY = 'agentFlashTrigger';

function createFlashDecorations(doc: import('@tiptap/pm/model').Node): DecorationSet {
  const decorations: Decoration[] = [];
  doc.forEach((node, offset) => {
    decorations.push(
      Decoration.node(offset, offset + node.nodeSize, {
        class: 'agent-flash',
      }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

export function createAgentFlashPlugin(): Plugin {
  return new Plugin({
    key: agentFlashPluginKey,

    state: {
      init() {
        return { decorations: DecorationSet.empty };
      },
      apply(tr: Transaction, value: { decorations: DecorationSet }) {
        const meta = tr.getMeta(FLASH_META_KEY);
        if (meta === true) {
          return { decorations: createFlashDecorations(tr.doc) };
        }
        if (meta === false) {
          return { decorations: DecorationSet.empty };
        }
        if (tr.docChanged) {
          return { decorations: value.decorations.map(tr.mapping, tr.doc) };
        }
        return value;
      },
    },

    props: {
      decorations(state) {
        return agentFlashPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
}
