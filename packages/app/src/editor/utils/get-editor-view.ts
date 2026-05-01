import type { Editor } from '@tiptap/core';
import type { EditorView } from '@tiptap/pm/view';

export function getEditorView(editor: Editor): EditorView | undefined {
  return (editor as unknown as { editorView?: EditorView }).editorView;
}
