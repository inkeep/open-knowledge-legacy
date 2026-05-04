import type { Editor } from '@tiptap/core';

const editors = new Map<string, Editor>();

export function registerEditor(docName: string, editor: Editor): void {
  editors.set(docName, editor);
}

export function unregisterEditor(docName: string, editor: Editor): void {
  if (editors.get(docName) === editor) {
    editors.delete(docName);
  }
}

export function getEditorForDoc(docName: string): Editor | null {
  return editors.get(docName) ?? null;
}
