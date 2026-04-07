import { HocuspocusProvider } from '@hocuspocus/provider';
import Collaboration from '@tiptap/extension-collaboration';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef } from 'react';

const DOC_NAME = 'test-doc';

export function TiptapEditor() {
  const providerRef = useRef<HocuspocusProvider | null>(null);

  if (!providerRef.current) {
    providerRef.current = new HocuspocusProvider({
      url: 'ws://localhost:5173/collab',
      name: DOC_NAME,
    });
  }

  const provider = providerRef.current;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
      }),
      Link,
      Table,
      Collaboration.configure({
        document: provider.document,
      }),
    ],
  });

  useEffect(() => {
    return () => {
      provider.destroy();
    };
  }, [provider]);

  return (
    <div className="tiptap-editor">
      <EditorContent editor={editor} />
    </div>
  );
}
