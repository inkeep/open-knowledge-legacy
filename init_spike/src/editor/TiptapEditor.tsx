import { HocuspocusProvider } from '@hocuspocus/provider';
import { Extension, getSchema } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { MarkdownManager } from '@tiptap/markdown';
import { EditorContent, useEditor } from '@tiptap/react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type * as Y from 'yjs';
import { useIdentity } from '../presence/identity';
import { prependFrontmatter } from './extensions/frontmatter';
import { sharedExtensions } from './extensions/shared';
import { setupObservers } from './observers';
import { createAgentFlashPlugin } from './plugins/agent-flash-wysiwyg';

const DOC_NAME = 'test-doc';

/** Custom cursor renderer — agents don't get cursors (NG1: no fake cursor animation). */
function renderCursor(user: Record<string, string>): HTMLElement {
  const cursor = document.createElement('span');

  // Agents: return invisible element (no cursor per NG1)
  if (user.type === 'agent') {
    cursor.style.display = 'none';
    return cursor;
  }

  // Humans: colored caret + name label
  cursor.classList.add('collaboration-cursor__caret');
  cursor.style.borderColor = user.color;

  const label = document.createElement('div');
  label.classList.add('collaboration-cursor__label');
  label.style.backgroundColor = user.color;
  label.textContent = user.name;
  cursor.append(label);

  return cursor;
}

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
    console.log('[TiptapEditor] Creating provider singleton');
    singletonProvider = new HocuspocusProvider({
      url: 'ws://localhost:5173/collab',
      name: DOC_NAME,
    });

    // Set up bidirectional observers once after first sync
    const provider = singletonProvider;
    console.log('[TiptapEditor] Registering onSync handler');
    const onSync = () => {
      console.log('[TiptapEditor] onSync fired, observerCleanup=', !!observerCleanup);
      if (observerCleanup) return; // Already set up
      const doc = provider.document;
      const mdMgr = new MarkdownManager({ extensions: sharedExtensions });
      observerCleanup = setupObservers({
        doc,
        xmlFragment: doc.getXmlFragment('default'),
        ytext: doc.getText('source'),
        mdManager: mdMgr,
        schema: editorSchema,
        onSyncError: (direction, error) => {
          console.warn(`[Sync] ${direction} failed:`, error.message);
        },
      });
      provider.off('synced', onSync);
    };
    provider.on('synced', onSync);

    // Expose provider on window for E2E test access
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__hocuspocusProvider = provider;
    }
  }
  return singletonProvider;
}

export const TiptapEditor = forwardRef<TiptapEditorHandle>(function TiptapEditor(_props, ref) {
  const frontmatterRef = useRef<string>('');
  const provider = getProvider();
  const identity = useIdentity();

  const mdManager = useMemo(() => new MarkdownManager({ extensions: sharedExtensions }), []);

  const editor = useEditor({
    extensions: [
      ...sharedExtensions,
      Collaboration.configure({
        document: provider.document,
      }),
      CollaborationCursor.configure({
        provider,
        user: {
          name: identity.name,
          color: identity.color,
          type: 'human',
        },
        render: renderCursor,
      }),
      Extension.create({
        name: 'agentFlash',
        addProseMirrorPlugins() {
          return [createAgentFlashPlugin(provider.document)];
        },
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

  // Set awareness state on mount (user identity + mode)
  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    awareness.setLocalStateField('user', {
      name: identity.name,
      color: identity.color,
      type: 'human' as const,
      coeditor: identity.coeditor,
      tabId: identity.tabId,
    });
    awareness.setLocalStateField('mode', 'wysiwyg');
  }, [provider, identity]);

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
