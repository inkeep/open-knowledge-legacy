import { markdown } from '@codemirror/lang-markdown';
import { getChunks, MergeView, unifiedMergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicDarkInit, basicLightInit } from '@uiw/codemirror-theme-basic';
import { basicSetup } from 'codemirror';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
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
  // Tracks unresolved hunk count in conflictMode so the "Save resolution"
  // button can gate on it. null = pre-init (no view yet).
  const [chunksRemaining, setChunksRemaining] = useState<number | null>(null);
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
          // @codemirror/merge's acceptChunk dispatches effects-only (no doc
          // change), so we cannot gate on update.docChanged. Re-read chunks
          // on every update and let the explicit "Save resolution" button
          // drive completion.
          const result = getChunks(update.state);
          setChunksRemaining(result ? result.chunks.length : 0);
        }),
      ];
      const view = new EditorView({
        doc: newContent,
        extensions: conflictExtensions,
        parent: containerRef.current,
      });
      viewRef.current = view;
      // Seed initial hunk count (updateListener only fires on subsequent updates).
      const initial = getChunks(view.state);
      setChunksRemaining(initial ? initial.chunks.length : 0);
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

  function handleSaveResolution() {
    const view = viewRef.current;
    if (!view || !(view instanceof EditorView)) return;
    onResolveRef.current?.(view.state.doc.toString());
  }

  const allResolved = chunksRemaining === 0;
  const hunksLabel =
    chunksRemaining === null
      ? ''
      : chunksRemaining === 0
        ? 'All hunks resolved'
        : `${chunksRemaining} unresolved hunk${chunksRemaining === 1 ? '' : 's'}`;

  return (
    <div className="flex flex-col h-full">
      <div
        ref={containerRef}
        className="diff-view min-h-0 flex-1 overflow-y-auto subtle-scrollbar"
      />
      {conflictMode && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t shrink-0">
          <span
            className={`text-xs ${allResolved ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}
          >
            {hunksLabel}
          </span>
          <div className="flex items-center gap-2">
            {onAbort && (
              <Button variant="ghost" size="sm" onClick={onAbort}>
                Exit merge
              </Button>
            )}
            {onResolve && (
              <Button
                variant="default"
                size="sm"
                disabled={!allResolved}
                onClick={handleSaveResolution}
              >
                Save resolution
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
