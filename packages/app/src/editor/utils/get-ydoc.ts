import type { Editor } from '@tiptap/core';
import type * as Y from 'yjs';

/**
 * Extract the Y.Doc from the editor's Collaboration extension.
 * The Collaboration extension is configured with `document: provider.document`
 * in TiptapEditor.tsx — this retrieves that same doc instance.
 */
export function getYDoc(editor: Editor): Y.Doc {
  const collab = editor.extensionManager.extensions.find((e) => e.name === 'collaboration');
  if (!collab?.options?.document) {
    throw new Error('Collaboration extension not found or has no document');
  }
  return collab.options.document as Y.Doc;
}
