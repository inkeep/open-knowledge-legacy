import { HocuspocusProvider } from '@hocuspocus/provider';
import { getSchema } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import { MarkdownManager } from '@tiptap/markdown';
import { EditorContent, useEditor } from '@tiptap/react';
import type * as Y from 'yjs';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { prependFrontmatter } from './extensions/frontmatter';
import { sharedExtensions } from './extensions/shared';
import { setupObservers } from './observers';

const DOC_NAME = 'test-doc';

export interface TiptapEditorHandle {
  getMarkdown: () => string;
  /** Get Y.Text('source') for CodeMirror CRDT binding */
  getYText: () => Y.Text;
  /** Get HocuspocusProvider for awareness (cursor presence) */
  getProvider: () => HocuspocusProvider;
}

const editorSchema = getSchema(sharedExtensions);

// Singleton provider outside React lifecycle — survives StrictMode double-mount.
// Provider is created once and persists for the app lifetime.
let singletonProvider: HocuspocusProvider | null = null;
let observerCleanup: (() => void) | null = null;

function getProvider(): HocuspocusProvider {
  if (!singletonProvider) {
    singletonProvider = new HocuspocusProvider({
      url: 'ws://localhost:5173/collab',
      name: DOC_NAME,
    });

    // Set up bidirectional observers once after first sync
    const provider = singletonProvider;
    const onSync = () => {
      if (observerCleanup) return; // Already set up
      const doc = provider.document;
      const mdMgr = new MarkdownManager({ extensions: sharedExtensions });
      observerCleanup = setupObservers({
        doc,
        xmlFragment: doc.getXmlFragment('default'),
        ytext: doc.getText('source'),
        mdManager: mdMgr,
        schema: editorSchema,
      });
      provider.off('synced', onSync);
    };
    provider.on('synced', onSync);
  }
  return singletonProvider;
}

export const TiptapEditor = forwardRef<TiptapEditorHandle>(function TiptapEditor(_props, ref) {
  const frontmatterRef = useRef<string>('');
  const provider = getProvider();

  const mdManager = useMemo(() => new MarkdownManager({ extensions: sharedExtensions }), []);

  const editor = useEditor({
    extensions: [
      ...sharedExtensions,
      Collaboration.configure({
        document: provider.document,
      }),
    ],
  });

  // Read frontmatter from Y.Doc metadata map (set by server persistence on load)
  useEffect(() => {
    const metaMap = provider.document.getMap('metadata');
    const fm = metaMap.get('frontmatter');
    if (typeof fm === 'string' && fm) {
      frontmatterRef.current = fm;
    }
    const observer = () => {
      const updated = metaMap.get('frontmatter');
      if (typeof updated === 'string') {
        frontmatterRef.current = updated;
      }
    };
    metaMap.observe(observer);
    return () => metaMap.unobserve(observer);
  }, [provider.document]);

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown(): string {
        if (!editor) return '';
        const json = editor.getJSON();
        const body = mdManager.serialize(json);
        return prependFrontmatter(frontmatterRef.current, body);
      },
      getYText(): Y.Text {
        return provider.document.getText('source');
      },
      getProvider(): HocuspocusProvider {
        return provider;
      },
    }),
    [editor, mdManager, provider.document, provider],
  );

  return (
    <div className="tiptap-editor">
      <EditorContent editor={editor} />
    </div>
  );
});
