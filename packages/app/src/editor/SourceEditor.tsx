import { indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { placeholder as cmPlaceholder, EditorView, keymap } from '@codemirror/view';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { GFM } from '@lezer/markdown';
import { basicDarkInit, basicLightInit } from '@uiw/codemirror-theme-basic';
import { OUTLINE_NAV_EVENT, type OutlineNavDetail } from '@/components/OutlinePanel';
import { RAW_MDX_NAV_EVENT, type RawMdxNavDetail } from '@/editor/extensions/raw-mdx-nav-event';
import { createSourceClipboardExtension } from './clipboard/index.ts';
import { codeLanguages } from './markdown-code-languages';

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
import { type CmCacheEntry, mountCmEditor, parkCmEditor } from './editor-cache';
import { markUserTyping } from './observers';
import { createAgentFlashSourceExtension } from './plugins/agent-flash-source';
import { createMdLinkSourceExtension } from './plugins/md-link-source';
import { createWikiLinkSourceExtension } from './plugins/wiki-link-source';
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

  // V2 EDITOR CACHE WIRING (US-008)
  //
  // Replaces the inline `new EditorView({ parent })` + `view.destroy()` on
  // unmount with mountCmEditor + parkCmEditor (precedent #18(g) — H1 12/12
  // probe). The view's DOM is reparented across Activity flips instead of
  // being destroyed, which preserves selection / undo / yCollab binding /
  // Y.Text identity / scroll position (cm6-reparent-contract.md §7).
  //
  // Cache key is the docName from provider.configuration.name — same key
  // EditorActivityPool uses for setActivityMountList. Park never destroys;
  // only evictCmEditor (LRU) does.
  //
  // The DOM listener for markUserTyping (R7 fix) attaches to the cached
  // view's contentDOM exactly once per editor lifetime — the listeners
  // survive reparent (W3C spec; CM6 cm6-reparent-contract §8). On park
  // they remain wired; on evict the editor.destroy() in evictCmEditor
  // removes them with the contentDOM.
  //
  // resolvedTheme is intentionally excluded from the deps array below — the
  // second effect (below) reconfigures the theme Compartment on change.
  // Adding it here would trigger a full editor remount on every theme switch,
  // which is exactly what Compartment is designed to avoid.
  const cmEntryRef = useRef<CmCacheEntry | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const docName = provider.configuration.name ?? '';

    let entry: CmCacheEntry | null = null;
    const mark = () => markUserTyping();

    try {
      entry = mountCmEditor({
        docName,
        container,
        factory: (el) => {
          // Source clipboard (FR-4, FR-5, D4, D5): copy writes both text/plain
          // markdown AND text/html canonical rendered HTML via the shared
          // mdast-to-html pipeline; paste routes through a 4-branch dispatcher
          // parallel to the WYSIWYG 5-branch.
          const sourceClipboard = createSourceClipboardExtension({
            ydoc: provider.document,
            ytext,
          });
          const state = EditorState.create({
            doc: ytext.toString(),
            extensions: [
              basicSetup,
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
          const view = new EditorView({ state, parent: el });
          // Wire markUserTyping listeners on first construction. They survive
          // reparent (W3C MutationObserver / addEventListener bind to the DOM
          // node, not its position).
          const dom = view.contentDOM;
          dom.addEventListener('keydown', mark);
          dom.addEventListener('paste', mark);
          dom.addEventListener('drop', mark);
          dom.addEventListener('cut', mark);
          return {
            view,
            ydoc: provider.document,
            ytext,
            provider,
          };
        },
        // sizeStats omitted — defer to EditorActivityPool's measurement.
      });
      cmEntryRef.current = entry;
      viewRef.current = entry.view;
    } catch (err) {
      console.error('[SourceEditor] mountCmEditor failed', err);
      cmEntryRef.current = null;
      viewRef.current = null;
    }

    return () => {
      const cur = cmEntryRef.current;
      if (cur) {
        parkCmEditor(cur);
      }
      // Listener cleanup is implicit when evictCmEditor calls view.destroy().
      // We do NOT remove listeners here because the view is still alive in
      // the cache (just parked). Pre-V2 destroyed the view here; V2 does not.
      cmEntryRef.current = null;
      viewRef.current = null;
    };
  }, [ytext, provider, placeholder]);

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
