import { markdown } from '@codemirror/lang-markdown';
import { MergeView, unifiedMergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicDarkInit, basicLightInit } from '@uiw/codemirror-theme-basic';
import { basicSetup } from 'codemirror';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';

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
}

export function DiffView({ oldContent, newContent, layout }: DiffViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MergeView | EditorView | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;

    const theme = resolvedTheme === 'dark' ? darkTheme : lightTheme;
    const readOnly = [EditorView.editable.of(false), EditorState.readOnly.of(true)];
    const sharedExtensions = [basicSetup, markdown(), ...readOnly, theme, EditorView.lineWrapping];

    // Clear any previous view
    if (viewRef.current) {
      if (viewRef.current instanceof MergeView) {
        viewRef.current.destroy();
      } else {
        viewRef.current.destroy();
      }
      viewRef.current = null;
    }

    if (layout === 'split') {
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
        if (viewRef.current instanceof MergeView) {
          viewRef.current.destroy();
        } else {
          viewRef.current.destroy();
        }
        viewRef.current = null;
      }
    };
  }, [oldContent, newContent, layout, resolvedTheme]);

  return <div ref={containerRef} className="diff-view h-full overflow-y-auto subtle-scrollbar" />;
}
