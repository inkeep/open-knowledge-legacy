import Collaboration from '@tiptap/extension-collaboration';
import { EditorContent, useEditor } from '@tiptap/react';
import { getProvider } from '@/client/provider';
import { sharedExtensions } from './extensions/shared';

export function TiptapEditor() {
  const provider = getProvider();

  const editor = useEditor({
    extensions: [...sharedExtensions, Collaboration.configure({ document: provider.document })],
  });

  return (
    <div className="tiptap-editor">
      <EditorContent editor={editor} />
    </div>
  );
}
