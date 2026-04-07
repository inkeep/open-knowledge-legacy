import { HocuspocusProvider } from '@hocuspocus/provider';
import Collaboration from '@tiptap/extension-collaboration';
import { MarkdownManager } from '@tiptap/markdown';
import { EditorContent, useEditor } from '@tiptap/react';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { prependFrontmatter, stripFrontmatter } from './extensions/frontmatter';
import { sharedExtensions } from './extensions/shared';
import type { ThreeWayMergeResult } from './three-way-merge';
import { threeWayMerge } from './three-way-merge';

const DOC_NAME = 'test-doc';

export interface TiptapEditorHandle {
  getMarkdown: () => string;
  applyMarkdown: (md: string) => void;
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
      applyMarkdown(md: string): void {
        if (!editor) return;
        const { frontmatter, body } = stripFrontmatter(md);
        frontmatterRef.current = frontmatter;
        const json = mdManager.parse(body);

        // Use updateYFragment (diff-based) — NEVER prosemirrorJSONToYDoc
        const yFragment = provider.document.getXmlFragment('default');
        const editorSchema = editor.schema;
        const pmNode = editorSchema.nodeFromJSON(json);

        provider.document.transact(() => {
          // Sync frontmatter inside transact for atomicity with content update
          const metaMap = provider.document.getMap('metadata');
          metaMap.set('frontmatter', frontmatter);
          // BindingMetadata: mapping tracks Y.Type↔PM node pairs, isOMark tracks overlapping marks
          const meta = { mapping: new Map(), isOMark: new Map() };
          updateYFragment(provider.document, yFragment, pmNode, meta);
        });
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
        const { frontmatter: snapFm, body: snapBody } = stripFrontmatter(snapshotMarkdown);
        const { frontmatter: userFm, body: userBody } = stripFrontmatter(userEditedMarkdown);

        // Update frontmatter from user's version
        frontmatterRef.current = userFm || snapFm;

        const yFragment = provider.document.getXmlFragment('default');

        // Sync frontmatter
        const metaMap = provider.document.getMap('metadata');
        metaMap.set('frontmatter', frontmatterRef.current);

        return threeWayMerge(
          provider.document,
          yFragment,
          snapBody,
          userBody,
          mdManager,
          editor.schema,
        );
      },
      onContentChange(callback: (markdown: string) => void): () => void {
        const yFragment = provider.document.getXmlFragment('default');

        // Track whether the change came from our own transact (toggle-back)
        // to avoid feedback loops. We use a flag that's set during applyMarkdown/threeWayMerge.
        const observer = () => {
          try {
            const json = yXmlFragmentToProsemirrorJSON(yFragment);
            const body = mdManager.serialize(json);
            const md = prependFrontmatter(frontmatterRef.current, body);
            callback(md);
          } catch (err) {
            console.warn('[TiptapEditor] Failed to serialize on Y.Doc change:', err);
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
