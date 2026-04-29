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
  // Per-instance Compartments. `createNestedCMExtensions`'s header requires
  // this shape ("Module-scoped theme singletons cause cross-instance
  // reconfigure conflicts"). Two concurrent SourceEditor instances can
  // coexist under React 19 StrictMode double-mount and under the Activity-
  // pool dual-editor mount pattern — module-scope singletons race.
  const themeCompartmentRef = useRef(new Compartment());
  const placeholderCompartmentRef = useRef(new Compartment());
  // Mount failures rethrow into DocumentErrorBoundary (review Minor #26).
  const [mountError, setMountError] = useState<Error | null>(null);
  if (mountError) throw mountError;
  const { resolvedTheme } = useTheme();

  // Awareness `mode` is published by TiptapEditor (single writer), driven by
  // the same `isSourceMode` prop. Two writers raced previously: peers' observed
  // mode depended on React's effect-firing order across siblings, and after a
  // navigate-away clear (setLocalState(null)) SourceEditor's setLocalStateField
  // would no-op while TiptapEditor's setLocalState rebuilt the entry. SourceEditor
  // now reads only — it doesn't write awareness.

  // V2 EDITOR CACHE WIRING (US-008)
  //
  // Replaces the inline `new EditorView({ parent })` + `view.destroy()` on
  // unmount with mountCmEditor + parkCmEditor (precedent #27(a) — H1 12/12
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

    const resolvedDocName = provider.configuration.name ?? '';

    let entry: CmCacheEntry | null = null;
    const mark = () => markUserTyping();

    try {
      // FR3 size-aware cache gate driven at the consumer call site (review
      // Pass-2 Major #4). CM6 has no per-view expensive NodeView concept
      // so viewCount=0 is accurate (not an approximation); the bytes gate
      // is the sole protection for multi-MB docs.
      const bytes = ytext.length;
      const sizeStats = { viewCount: 0, bytes };
      entry = mountCmEditor({
        docName: resolvedDocName,
        container,
        sizeStats,
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
      });
      cmEntryRef.current = entry;
      viewRef.current = entry.view;
    } catch (err) {
      // Surface mount failures through DocumentErrorBoundary (review Minor #26).
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
      // Listener cleanup is implicit when evictCmEditor calls view.destroy().
      // We do NOT remove listeners here because the view is still alive in
      // the cache (just parked). Pre-V2 destroyed the view here; V2 does not.
      cmEntryRef.current = null;
      viewRef.current = null;
    };
    // `placeholder` is intentionally NOT in the deps array (review Pass-2
    // Major #7). The separate effect below uses `placeholderCompartment.
    // reconfigure` to hot-swap the placeholder text without tearing down
    // the view — including `placeholder` here would defeat that by
    // triggering a full park+remount on every placeholder change.
  }, [ytext, provider]);

  useEffect(() => {
    if (!viewRef.current) return;
    // Reconfigure the theme via the per-instance compartment. The factory
    // internally held a snapshot of the current theme at mount time; this
    // effect hot-swaps on theme change without re-running the mount effect.
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
