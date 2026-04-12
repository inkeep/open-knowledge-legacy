import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';
import { yCollab } from 'y-codemirror.next';
import type * as Y from 'yjs';
import { markUserTyping } from './observers';
import { createAgentFlashSourceExtension } from './plugins/agent-flash-source';
import { createWikiLinkSourceExtension } from './plugins/wiki-link-source';

interface SourceEditorProps {
  ytext: Y.Text;
  provider: HocuspocusProvider;
}

export function SourceEditor({ ytext, provider }: SourceEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Update awareness mode to 'source' when SourceEditor mounts
  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    awareness.setLocalStateField('mode', 'source');
    return () => {
      awareness.setLocalStateField('mode', 'wysiwyg');
    };
  }, [provider]);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        basicSetup,
        markdown(),
        yCollab(ytext, provider.awareness),
        createAgentFlashSourceExtension(provider.document),
        createWikiLinkSourceExtension(),
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

  return <div ref={containerRef} className="source-editor h-full" />;
}
