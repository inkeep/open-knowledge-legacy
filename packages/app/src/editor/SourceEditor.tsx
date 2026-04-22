import { indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { placeholder as cmPlaceholder, EditorView, keymap } from '@codemirror/view';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { createCodeFenceTracker } from '@inkeep/open-knowledge-core';
import { GFM } from '@lezer/markdown';
import { basicDarkInit, basicLightInit } from '@uiw/codemirror-theme-basic';
import { basicSetup } from 'codemirror';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { yCollab } from 'y-codemirror.next';
import type * as Y from 'yjs';
import { OUTLINE_NAV_EVENT, type OutlineNavDetail } from '@/components/OutlinePanel';
import type { RawMdxNavDetail } from '@/editor/extensions/RawMdxFallbackView';
import { createSourceClipboardExtension } from './clipboard/index.ts';
import { codeLanguages } from './markdown-code-languages';
import { markUserTyping } from './observers';
import { createAgentFlashSourceExtension } from './plugins/agent-flash-source';
import { createMdLinkSourceExtension } from './plugins/md-link-source';
import { createWikiLinkSourceExtension } from './plugins/wiki-link-source';
import {
  clearPendingSourceNavigation,
  consumePendingSourceNavigation,
} from './source-editor-navigation';
import { createSourcePolishExtension } from './source-polish';

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

interface SourceEditorProps {
  docName: string;
  ytext: Y.Text;
  provider: HocuspocusProvider;
  placeholder?: string;
  isSourceModeActive: boolean;
}

const themeCompartment = new Compartment();
const placeholderCompartment = new Compartment();

function applyOutlineNavigation(view: EditorView, detail: OutlineNavDetail): void {
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

  // Skip `#` comments inside fenced code blocks — they render as code, not
  // headings, so they must stay out of the heading count that maps 1:1 onto
  // the outline index.
  const isInCodeFence = createCodeFenceTracker();
  let seen = 0;
  for (let i = startLine; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (isInCodeFence(line.text)) continue;
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

function applyRawMdxNavigation(view: EditorView, detail: RawMdxNavDetail): void {
  requestAnimationFrame(() => {
    const doc = view.state.doc;
    // Clamp offset to doc length (offset may exceed doc length if content
    // differs between Y.Text and originalSpan).
    const pos = Math.min(detail.offset, doc.length);
    view.dispatch({
      selection: EditorSelection.cursor(pos),
      effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    });
    view.focus();
  });
}

export function SourceEditor({
  docName,
  ytext,
  provider,
  placeholder,
  isSourceModeActive,
}: SourceEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { resolvedTheme } = useTheme();

  // Keep awareness aligned with the currently visible editor for this doc.
  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    awareness.setLocalStateField('mode', isSourceModeActive ? 'source' : 'wysiwyg');
    return () => {
      awareness.setLocalStateField('mode', 'wysiwyg');
    };
  }, [provider, isSourceModeActive]);

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
        markdown({ base: markdownLanguage, extensions: [GFM], codeLanguages }),
        yCollab(ytext, provider.awareness),
        createAgentFlashSourceExtension(provider.document),
        createWikiLinkSourceExtension(),
        createMdLinkSourceExtension(),
        createSourcePolishExtension(),
        sourceClipboard,
        themeCompartment.of(resolvedTheme === 'dark' ? darkTheme : lightTheme),
        placeholderCompartment.of(cmPlaceholder(placeholder ?? '')),
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
      if (!detail || detail.mode !== 'source' || !isSourceModeActive) return;
      const view = viewRef.current;
      if (!view) return;
      applyOutlineNavigation(view, detail);
      clearPendingSourceNavigation(docName);
    }
    window.addEventListener(OUTLINE_NAV_EVENT, onNav);
    return () => window.removeEventListener(OUTLINE_NAV_EVENT, onNav);
  }, [docName, isSourceModeActive]);

  // Replays the most recent source-navigation intent once the editor chunk is
  // mounted and visible for this doc. This preserves first-open raw-MDX and
  // outline jumps even when SourceEditor was lazy-loaded off the initial path.
  useEffect(() => {
    if (!isSourceModeActive) return;
    const view = viewRef.current;
    if (!view) return;

    const pendingNavigation = consumePendingSourceNavigation(docName);
    if (!pendingNavigation) return;

    if (pendingNavigation.kind === 'outline') {
      applyOutlineNavigation(view, pendingNavigation.detail);
      return;
    }

    applyRawMdxNavigation(view, pendingNavigation.detail);
  }, [docName, isSourceModeActive]);

  return <div ref={containerRef} className="source-editor h-full py-3" />;
}
