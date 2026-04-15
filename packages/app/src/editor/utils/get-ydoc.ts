/**
 * Extract Y.Doc from a TipTap Editor's Collaboration extension.
 * Returns undefined if no Collaboration extension is found.
 */
import type { Editor } from '@tiptap/core';
import type { Doc } from 'yjs';

export function getYDoc(editor: Editor): Doc | undefined {
  try {
    const collabExt = editor.extensionManager.extensions.find((e) => e.name === 'collaboration');
    return collabExt?.options?.document as Doc | undefined;
  } catch {
    return undefined;
  }
}
