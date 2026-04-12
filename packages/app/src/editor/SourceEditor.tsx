import { markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { githubDarkInit } from '@uiw/codemirror-theme-github';

// Customize the dark editor surface colors here.
const darkTheme = githubDarkInit({
  settings: {
    background: 'var(--background)',
    gutterBackground: 'var(--muted)',
  },
});

import { basicSetup } from 'codemirror';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { yCollab } from 'y-codemirror.next';
import type * as Y from 'yjs';
import { markUserTyping } from './observers';
import { createAgentFlashSourceExtension } from './plugins/agent-flash-source';

interface SourceEditorProps {
  ytext: Y.Text;
  provider: HocuspocusProvider;
}

const themeCompartment = new Compartment();

export function SourceEditor({ ytext, provider }: SourceEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { resolvedTheme } = useTheme();

  // Update awareness mode to 'source' when SourceEditor mounts
  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    awareness.setLocalStateField('mode', 'source');
    return () => {
      awareness.setLocalStateField('mode', 'wysiwyg');
    };
  }, [provider]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: resolvedTheme is intentionally excluded — the second effect (below) reconfigures the theme Compartment on change. Adding it here would trigger a full editor remount on every theme switch, which is exactly what Compartment is designed to avoid (per spec D6/D16).
  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        basicSetup,
        markdown(),
        yCollab(ytext, provider.awareness),
        createAgentFlashSourceExtension(provider.document),
        themeCompartment.of(resolvedTheme === 'dark' ? darkTheme : []),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': {
            height: '100%',
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });
    viewRef.current = view;

    // Mirror the TiptapEditor DOM listeners so Observer B's typing-defer
    // window applies uniformly regardless of which editor has focus (R7 fix).
    const mark = () => markUserTyping(provider.document);
    const dom = view.contentDOM;
    dom.addEventListener('keydown', mark);
    dom.addEventListener('paste', mark);
    dom.addEventListener('drop', mark);
    dom.addEventListener('cut', mark);

    return () => {
      dom.removeEventListener('keydown', mark);
      dom.removeEventListener('paste', mark);
      dom.removeEventListener('drop', mark);
      dom.removeEventListener('cut', mark);
      view.destroy();
      viewRef.current = null;
    };
  }, [ytext, provider]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: themeCompartment.reconfigure(resolvedTheme === 'dark' ? darkTheme : []),
    });
  }, [resolvedTheme]);

  return <div ref={containerRef} className="source-editor h-full" />;
}
