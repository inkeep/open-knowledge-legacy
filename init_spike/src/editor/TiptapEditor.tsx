import { HocuspocusProvider } from '@hocuspocus/provider';
import Collaboration from '@tiptap/extension-collaboration';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table } from '@tiptap/extension-table';
import { MarkdownManager } from '@tiptap/markdown';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { updateYFragment } from '@tiptap/y-tiptap';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { prependFrontmatter, stripFrontmatter } from './extensions/frontmatter';
import { JsxComponent } from './extensions/jsx-component';

const DOC_NAME = 'test-doc';

export interface TiptapEditorHandle {
  getMarkdown: () => string;
  applyMarkdown: (md: string) => void;
}

// Extensions shared between the editor and MarkdownManager
const sharedExtensions = [
  StarterKit.configure({ undoRedo: false }),
  Link,
  Table,
  Image,
  TaskList,
  TaskItem,
  JsxComponent,
];

export const TiptapEditor = forwardRef<TiptapEditorHandle>(function TiptapEditor(_props, ref) {
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const frontmatterRef = useRef<string>('');

  if (!providerRef.current) {
    providerRef.current = new HocuspocusProvider({
      url: 'ws://localhost:5173/collab',
      name: DOC_NAME,
    });
  }

  const provider = providerRef.current;

  const mdManager = useMemo(() => new MarkdownManager({ extensions: sharedExtensions }), []);

  const editor = useEditor({
    extensions: [
      ...sharedExtensions,
      Collaboration.configure({
        document: provider.document,
      }),
    ],
  });

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown(): string {
        if (!editor) return '';
        const json = editor.getJSON();
        const body = mdManager.serialize(json);
        return prependFrontmatter(frontmatterRef.current, body);
      },
      applyMarkdown(md: string): void {
        if (!editor) return;
        const { frontmatter, body } = stripFrontmatter(md);
        frontmatterRef.current = frontmatter;
        const json = mdManager.parse(body);

        // Use updateYFragment (diff-based) — NEVER prosemirrorJSONToYDoc
        const yFragment = provider.document.getXmlFragment('default');
        const schema = editor.schema;
        const pmNode = schema.nodeFromJSON(json);

        provider.document.transact(() => {
          // BindingMetadata: mapping tracks Y.Type↔PM node pairs, isOMark tracks overlapping marks
          const meta = { mapping: new Map(), isOMark: new Map() };
          updateYFragment(provider.document, yFragment, pmNode, meta);
        });
      },
    }),
    [editor, mdManager, provider.document],
  );

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
});
