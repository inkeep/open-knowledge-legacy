import { indentWithTab } from '@codemirror/commands';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { placeholder as cmPlaceholder, EditorView, keymap } from '@codemirror/view';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { createCodeFenceTracker } from '@inkeep/open-knowledge-core';
import { basicSetup } from 'codemirror';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { yCollab } from 'y-codemirror.next';
import type * as Y from 'yjs';
import { OUTLINE_NAV_EVENT, type OutlineNavDetail } from '@/components/OutlinePanel';
import {
  createNestedCMExtensions,
  darkTheme,
  lightTheme,
} from '@/editor/extensions/nested-cm-extensions';
import type { RawMdxNavDetail } from '@/editor/extensions/raw-mdx-nav-event';
import { createSourceClipboardExtension } from './clipboard/index.ts';
import { type CmCacheEntry, mountCmEditor, parkCmEditor } from './editor-cache';
import { markUserTyping } from './observers';
import {
  clearPendingSourceNavigation,
  consumePendingSourceNavigation,
} from './source-editor-navigation';
import { createSourcePolishExtension } from './source-polish';

interface SourceEditorProps {
  docName: string;
  ytext: Y.Text;
  provider: HocuspocusProvider;
  placeholder?: string;
  isSourceModeActive: boolean;
}

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
  const themeCompartmentRef = useRef(new Compartment());
  const placeholderCompartmentRef = useRef(new Compartment());
  const [mountError, setMountError] = useState<Error | null>(null);
  if (mountError) throw mountError;
  const { resolvedTheme } = useTheme();


  const cmEntryRef = useRef<CmCacheEntry | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resolvedDocName = provider.configuration.name ?? '';

    let entry: CmCacheEntry | null = null;
    const mark = () => markUserTyping();

    try {
      const bytes = ytext.length;
      const sizeStats = { viewCount: 0, bytes };
      entry = mountCmEditor({
        docName: resolvedDocName,
        container,
        sizeStats,
        factory: (el) => {
          const sourceClipboard = createSourceClipboardExtension({
            ydoc: provider.document,
            ytext,
          });
          const state = EditorState.create({
            doc: ytext.toString(),
            extensions: [
              basicSetup,
              keymap.of([indentWithTab]),
              yCollab(ytext, provider.awareness),
              ...createNestedCMExtensions({
                themeCompartment: themeCompartmentRef.current,
                resolvedTheme,
                ydoc: provider.document,
              }),
              createSourcePolishExtension(),
              sourceClipboard,
              placeholderCompartmentRef.current.of(cmPlaceholder(placeholder ?? '')),
              EditorView.theme({
                '&': {
                  height: '100%',
                },
              }),
            ],
          });
          const view = new EditorView({ state, parent: el });
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
      });
      cmEntryRef.current = entry;
      viewRef.current = entry.view;
    } catch (err) {
      console.error('[SourceEditor] mountCmEditor failed', err);
      cmEntryRef.current = null;
      viewRef.current = null;
      setMountError(err instanceof Error ? err : new Error(String(err)));
    }

    return () => {
      const cur = cmEntryRef.current;
      if (cur) {
        parkCmEditor(cur);
      }
      cmEntryRef.current = null;
      viewRef.current = null;
    };
  }, [ytext, provider]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: themeCompartmentRef.current.reconfigure(
        resolvedTheme === 'dark' ? darkTheme : lightTheme,
      ),
    });
  }, [resolvedTheme]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: placeholderCompartmentRef.current.reconfigure(cmPlaceholder(placeholder ?? '')),
    });
  }, [placeholder]);

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
