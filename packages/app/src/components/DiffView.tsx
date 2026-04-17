import { markdown } from '@codemirror/lang-markdown';
import { getChunks, MergeView, unifiedMergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicDarkInit, basicLightInit } from '@uiw/codemirror-theme-basic';
import { basicSetup } from 'codemirror';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { Button } from './ui/button';

const darkTheme = basicDarkInit({
  settings: {
    background: 'var(--background)',
    gutterBackground: 'var(--muted)',
  },
});

const lightTheme = basicLightInit({
  settings: {
    background: 'var(--background)',
    gutterBackground: 'var(--muted)',
  },
});

export type DiffLayout = 'unified' | 'split';

interface DiffViewProps {
  oldContent: string;
  newContent: string;
  layout: DiffLayout;
  /** When true, renders a conflict-resolution editor with per-hunk Accept/Reject. */
  conflictMode?: boolean;
  /** Called with the merged document when all hunks are resolved. */
  onResolve?: (content: string) => void;
  /** Called when the user aborts the merge. */
  onAbort?: () => void;
}

export function DiffView({
  oldContent,
  newContent,
  layout,
  conflictMode,
  onResolve,
  onAbort,
}: DiffViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MergeView | EditorView | null>(null);
  const { resolvedTheme } = useTheme();
  const onResolveRef = useRef(onResolve);
  const onAbortRef = useRef(onAbort);
  useEffect(() => {
    onResolveRef.current = onResolve;
    onAbortRef.current = onAbort;
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const theme = resolvedTheme === 'dark' ? darkTheme : lightTheme;
    const readOnly = [EditorView.editable.of(false), EditorState.readOnly.of(true)];
    const sharedExtensions = [basicSetup, markdown(), ...readOnly, theme, EditorView.lineWrapping];

    // Clear any previous view
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    if (conflictMode) {
      // Conflict mode: unified diff with per-hunk Accept/Reject buttons.
      // editable=false prevents typing; readOnly is NOT set so merge ops can mutate the doc.
      const conflictExtensions = [
        basicSetup,
        markdown(),
        EditorView.editable.of(false),
        theme,
        EditorView.lineWrapping,
        unifiedMergeView({
          original: oldContent,
          highlightChanges: true,
          gutter: true,
          mergeControls: true,
          collapseUnchanged: { margin: 3, minSize: 4 },
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const result = getChunks(update.state);
          if (result && result.chunks.length === 0) {
            onResolveRef.current?.(update.state.doc.toString());
          }
        }),
      ];
      const view = new EditorView({
        doc: newContent,
        extensions: conflictExtensions,
        parent: containerRef.current,
      });
      viewRef.current = view;
    } else if (layout === 'split') {
      const mv = new MergeView({
        a: { doc: oldContent, extensions: sharedExtensions },
        b: { doc: newContent, extensions: sharedExtensions },
        parent: containerRef.current,
        highlightChanges: true,
        gutter: true,
        collapseUnchanged: { margin: 3, minSize: 4 },
      });
      viewRef.current = mv;
    } else {
      const view = new EditorView({
        doc: newContent,
        extensions: [
          ...sharedExtensions,
          unifiedMergeView({
            original: oldContent,
            highlightChanges: true,
            gutter: true,
            mergeControls: false,
            collapseUnchanged: { margin: 3, minSize: 4 },
          }),
        ],
        parent: containerRef.current,
      });
      viewRef.current = view;
    }

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [oldContent, newContent, layout, resolvedTheme, conflictMode]);

  return (
    <div className={conflictMode ? 'flex flex-col h-full' : 'h-full'}>
      <div ref={containerRef} className="diff-view flex-1 overflow-y-auto subtle-scrollbar" />
      {conflictMode && onAbort && (
        <div className="flex justify-end px-3 py-2 border-t shrink-0">
          <Button variant="ghost" size="sm" onClick={onAbort}>
            Exit merge
          </Button>
        </div>
      )}
    </div>
  );
}
