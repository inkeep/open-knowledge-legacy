import { indentWithTab } from '@codemirror/commands';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { placeholder as cmPlaceholder, EditorView, keymap } from '@codemirror/view';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { basicSetup } from 'codemirror';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { yCollab } from 'y-codemirror.next';
import type * as Y from 'yjs';
import { OUTLINE_NAV_EVENT, type OutlineNavDetail } from '@/components/OutlinePanel';
import {
  createNestedCMExtensions,
  darkTheme,
  lightTheme,
} from '@/editor/extensions/nested-cm-extensions';
import { RAW_MDX_NAV_EVENT, type RawMdxNavDetail } from '@/editor/extensions/RawMdxFallbackView';
import { createSourceClipboardExtension } from './clipboard/index.ts';
import { markUserTyping } from './observers';
import { createSourcePolishExtension } from './source-polish';

interface SourceEditorProps {
  ytext: Y.Text;
  provider: HocuspocusProvider;
  placeholder?: string;
}

const themeCompartment = new Compartment();
const placeholderCompartment = new Compartment();

export function SourceEditor({ ytext, provider, placeholder }: SourceEditorProps) {
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

    // Source clipboard (FR-4, FR-5, D4, D5): copy writes both text/plain
    // markdown AND text/html canonical rendered HTML via the shared
    // mdast-to-html pipeline; paste routes through a 4-branch dispatcher
    // parallel to the WYSIWYG 5-branch. The dispatcher needs only the
    // ydoc + ytext — serialisation uses `markdownToHtml(string)` which
    // runs its own unified pipeline and has no MarkdownManager dependency.
    const sourceClipboard = createSourceClipboardExtension({
      ydoc: provider.document,
      ytext,
    });

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        basicSetup,
        // Tab inserts indentation instead of escaping focus. CM6's default is
        // to let Tab move focus (WCAG "no keyboard trap") — for a code-style
        // editor this is unexpected UX. Users who need to escape focus can
        // press Esc → Tab, or Ctrl+M (Shift+Alt+M on macOS) to toggle tab-
        // focus mode. Upstream convention per codemirror.net/examples/tab/.
        keymap.of([indentWithTab]),
        yCollab(ytext, provider.awareness),
        // Nested-CM / SourceEditor convergence: the factory provides markdown
        // (with GFM + codeLanguages), wiki-link + md-link decorations,
        // agent-flash, theme compartment, line-wrapping. Source mode adds the
        // extras below (source-polish, placeholder, full-height theme).
        ...createNestedCMExtensions({
          themeCompartment,
          resolvedTheme,
          ydoc: provider.document,
        }),
        createSourcePolishExtension(),
        sourceClipboard,
        placeholderCompartment.of(cmPlaceholder(placeholder ?? '')),
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
    const mark = () => markUserTyping();
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

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: placeholderCompartment.reconfigure(cmPlaceholder(placeholder ?? '')),
    });
  }, [placeholder]);

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
