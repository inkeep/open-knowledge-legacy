import { html } from '@codemirror/lang-html';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { GFM } from '@lezer/markdown';
import { basicDarkInit, basicLightInit } from '@uiw/codemirror-theme-basic';
import { OUTLINE_NAV_EVENT, type OutlineNavDetail } from '@/components/OutlinePanel';
import { RAW_MDX_NAV_EVENT, type RawMdxNavDetail } from '@/editor/extensions/RawMdxFallbackView';
import { codeLanguages } from './markdown-code-languages';
import { createPolishEngineExtension } from './polish-engine';

// Customize the dark editor surface colors here.
const darkTheme = basicDarkInit({
  settings: {
    background: 'var(--background)',
    gutterBackground: 'var(--background)',
  },
});

const lightTheme = basicLightInit({
  settings: {
    background: 'var(--background)',
    gutterBackground: 'var(--background)',
  },
});

import { basicSetup } from 'codemirror';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { yCollab } from 'y-codemirror.next';
import type * as Y from 'yjs';
import { markUserTyping } from './observers';
import { createAgentFlashSourceExtension } from './plugins/agent-flash-source';
import { createMdLinkSourceExtension } from './plugins/md-link-source';
import { createWikiLinkSourceExtension } from './plugins/wiki-link-source';

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
        markdown({
          base: markdownLanguage,
          extensions: [GFM],
          codeLanguages,
          htmlTagLanguage: html({ matchClosingTags: false }),
        }),
        yCollab(ytext, provider.awareness),
        createAgentFlashSourceExtension(provider.document),
        createWikiLinkSourceExtension(),
        createMdLinkSourceExtension(),
        ...createPolishEngineExtension(),
        themeCompartment.of(resolvedTheme === 'dark' ? darkTheme : lightTheme),
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
      effects: themeCompartment.reconfigure(resolvedTheme === 'dark' ? darkTheme : lightTheme),
    });
  }, [resolvedTheme]);

  // Outline panel click → jump to the Nth heading line in the CodeMirror doc.
  useEffect(() => {
    function onNav(e: Event) {
      const detail = (e as CustomEvent<OutlineNavDetail>).detail;
      if (!detail || detail.mode !== 'source') return;
      const view = viewRef.current;
      if (!view) return;
      const doc = view.state.doc;
      let startLine = 1;
      if (doc.lines >= 1 && doc.line(1).text === '---') {
        for (let i = 2; i <= doc.lines; i++) {
          if (doc.line(i).text === '---') {
            startLine = i + 1;
            break;
          }
        }
      }
      let seen = 0;
      for (let i = startLine; i <= doc.lines; i++) {
        const line = doc.line(i);
        if (/^#{1,6}\s/.test(line.text)) {
          if (seen === detail.index) {
            view.dispatch({
              selection: EditorSelection.cursor(line.from),
              effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
            });
            view.focus();
            return;
          }
          seen++;
        }
      }
    }
    window.addEventListener(OUTLINE_NAV_EVENT, onNav);
    return () => window.removeEventListener(OUTLINE_NAV_EVENT, onNav);
  }, []);

  // R7: rawMdxFallback click → scroll CodeMirror to the broken region's offset.
  // EditorPane handles the mode switch; this hook scrolls once the view is active.
  useEffect(() => {
    function onRawMdxNav(e: Event) {
      const detail = (e as CustomEvent<RawMdxNavDetail>).detail;
      if (!detail) return;
      // Delay to allow the source view to mount/become visible after mode switch
      requestAnimationFrame(() => {
        const view = viewRef.current;
        if (!view) return;
        const doc = view.state.doc;
        // Clamp offset to doc length (offset may exceed doc length if content differs between Y.Text and originalSpan)
        const pos = Math.min(detail.offset, doc.length);
        view.dispatch({
          selection: EditorSelection.cursor(pos),
          effects: EditorView.scrollIntoView(pos, { y: 'center' }),
        });
        view.focus();
      });
    }
    window.addEventListener(RAW_MDX_NAV_EVENT, onRawMdxNav);
    return () => window.removeEventListener(RAW_MDX_NAV_EVENT, onRawMdxNav);
  }, []);

  return <div ref={containerRef} className="source-editor h-full py-3" />;
}
