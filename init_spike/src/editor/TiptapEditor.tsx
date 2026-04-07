import { HocuspocusProvider } from '@hocuspocus/provider';
import Collaboration from '@tiptap/extension-collaboration';
import { MarkdownManager } from '@tiptap/markdown';
import { EditorContent, useEditor } from '@tiptap/react';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { prependFrontmatter, stripFrontmatter } from './extensions/frontmatter';
import { sharedExtensions } from './extensions/shared';
import type { ThreeWayMergeResult } from './three-way-merge';
import { threeWayMerge } from './three-way-merge';

const DOC_NAME = 'test-doc';

export interface TiptapEditorHandle {
  getMarkdown: () => string;
  /** Three-way merge: apply only user's changes, preserving concurrent agent writes */
  applyThreeWayMerge: (snapshotMarkdown: string, userEditedMarkdown: string) => ThreeWayMergeResult;
  /** Subscribe to Y.Doc content changes. Returns unsubscribe function. */
  onContentChange: (callback: (markdown: string) => void) => () => void;
}

// Singleton provider outside React lifecycle — survives StrictMode double-mount.
// Provider is created once and persists for the app lifetime.
let singletonProvider: HocuspocusProvider | null = null;

function getProvider(): HocuspocusProvider {
  if (!singletonProvider) {
    singletonProvider = new HocuspocusProvider({
      url: 'ws://localhost:5173/collab',
      name: DOC_NAME,
    });
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
    // Also observe future changes (e.g., if server loads the file after client connects)
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
      applyThreeWayMerge(
        snapshotMarkdown: string,
        userEditedMarkdown: string,
      ): ThreeWayMergeResult {
        if (!editor) {
          return {
            selective: false,
            userChangedCount: 0,
            agentPreservedCount: 0,
            conflicts: [],
            fallbackReason: 'No editor',
          };
        }
        const { body: snapBody } = stripFrontmatter(snapshotMarkdown);
        const { frontmatter: userFm, body: userBody } = stripFrontmatter(userEditedMarkdown);

        // Update frontmatter from user's version — user has full control in source mode,
        // so empty string (deleted frontmatter) is intentional, not a fallback trigger.
        frontmatterRef.current = userFm;

        const yFragment = provider.document.getXmlFragment('default');

        // Wrap frontmatter + content merge in a single transaction for atomicity
        // (matches the pattern in applyMarkdown). Yjs nested transactions are supported —
        // threeWayMerge's inner doc.transact() merges into this outer transaction.
        let mergeResult: ThreeWayMergeResult = {
          selective: false,
          userChangedCount: 0,
          agentPreservedCount: 0,
          conflicts: [],
          fallbackReason: 'Transaction did not complete',
        };
        provider.document.transact(() => {
          const metaMap = provider.document.getMap('metadata');
          metaMap.set('frontmatter', frontmatterRef.current);

          mergeResult = threeWayMerge(
            provider.document,
            yFragment,
            snapBody,
            userBody,
            mdManager,
            editor.schema,
          );
        });

        return mergeResult;
      },
      onContentChange(callback: (markdown: string) => void): () => void {
        const yFragment = provider.document.getXmlFragment('default');

        // Feedback loops are prevented by App.tsx unsubscribing this observer
        // before calling applyThreeWayMerge on toggle-back.
        const observer = () => {
          let md: string;
          try {
            const json = yXmlFragmentToProsemirrorJSON(yFragment);
            const body = mdManager.serialize(json);
            md = prependFrontmatter(frontmatterRef.current, body);
          } catch (err) {
            console.warn('[TiptapEditor] Failed to serialize on Y.Doc change:', err);
            return;
          }
          try {
            callback(md);
          } catch (err) {
            console.warn('[TiptapEditor] Content change callback threw:', err);
          }
        };

        yFragment.observeDeep(observer);
        return () => yFragment.unobserveDeep(observer);
      },
    }),
    [editor, mdManager, provider.document],
  );

  // No cleanup — provider is a singleton that survives component lifecycle.
  // In production, proper cleanup would happen on app unmount.

  return (
    <div className="tiptap-editor">
      <EditorContent editor={editor} />
    </div>
  );
});
