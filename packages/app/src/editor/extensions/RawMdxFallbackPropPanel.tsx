/**
 * RawMdxFallbackPropPanel — singleton PropPanel rendered at editor root when
 * a rawMdxFallback chip is the active InteractionLayer node (US-006).
 *
 * Mounts an embedded CodeMirror 6 editor initialized with the broken block's
 * raw MDX text. Keystrokes dispatch PM transactions that replace the chip
 * node's inline text — the edit flows through the standard XmlFragment →
 * Observer A → Y.Text → multi-client CRDT path (precedents #11 + #14). The
 * existing `rawmdxfallback-multi-client.test.ts` integration test covers
 * direct Y.Text mutation semantics; this panel is an additional affordance
 * that writes through PM at the same node.
 *
 * An "Open in source mode" button dispatches RAW_MDX_NAV_EVENT as a
 * secondary affordance — preserves the pre-US-006 behaviour so users who
 * prefer the full source editor still have the path.
 *
 * The pure helpers (`buildCmExtensions`, `computePmReplaceTransaction`,
 * `hasMeaningfulSpan`) are exported for unit testing without DOM.
 */

import { indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState, type Extension, Prec, type Transaction } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import type { Editor } from '@tiptap/core';
import { ExternalLink, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { codeLanguages } from '../markdown-code-languages';
import { RAW_MDX_NAV_EVENT, type RawMdxNavDetail } from './raw-mdx-nav-event';

/**
 * Public shape of the span attached to the rawMdxFallback node. Matches the
 * `originalSpan` attribute schema in `packages/core/src/extensions/raw-mdx-fallback.ts`.
 */
export interface RawMdxOriginalSpan {
  start: number;
  end: number;
}

/**
 * Whether a `{start,end}` span was populated by the parser (as opposed to the
 * R13-created default of `{0,0}`). A {0,0} span is treated as "no source
 * region to navigate to" — the secondary affordance hides.
 */
export function hasMeaningfulSpan(span: RawMdxOriginalSpan | null | undefined): boolean {
  if (!span) return false;
  return span.start !== 0 || span.end !== 0;
}

/**
 * Build the CM6 extension bundle used for the embedded editor. Pulled out so
 * unit tests can assert it resolves to a non-empty extension array without
 * mounting the view.
 */
export function buildCmExtensions(params: {
  onDocChange: (doc: string, tr: Transaction) => void;
  onEscape: () => void;
}): Extension[] {
  const updateListener = EditorView.updateListener.of((u) => {
    if (!u.docChanged) return;
    const doc = u.state.doc.toString();
    // Report the last user-initiated transaction; consumers that want to
    // batch can peek at the transaction userEvents in the future.
    const tr = u.transactions[u.transactions.length - 1] ?? u.transactions[0];
    params.onDocChange(doc, tr);
  });

  // Prec.highest so Escape short-circuits editor-level keymaps that might
  // otherwise consume it. CM6's default keymap lets Escape fall through to
  // the browser, which is fine for embedded panels — but we want to own it
  // here so the PropPanel can dismiss itself.
  const escapeKey = Prec.highest(
    keymap.of([
      {
        key: 'Escape',
        run: () => {
          params.onEscape();
          return true;
        },
      },
    ]),
  );

  return [
    keymap.of([indentWithTab]),
    markdown({ base: markdownLanguage, extensions: [GFM], codeLanguages }),
    EditorView.lineWrapping,
    escapeKey,
    updateListener,
    EditorView.theme({
      '&': { height: '100%', minHeight: '120px' },
      '.cm-content': { fontFamily: 'var(--font-mono, monospace)', fontSize: '13px' },
      '.cm-scroller': { fontFamily: 'inherit' },
    }),
  ];
}

/**
 * Pure helper: compute the `{from, to, text}` triple for replacing the inner
 * text of a rawMdxFallback node at `pos`. Returns null when the node isn't
 * a rawMdxFallback or the content hasn't changed.
 */
export function computePmReplaceTransaction(params: {
  editor: Editor;
  pos: number;
  nextText: string;
}): { from: number; to: number; nextText: string } | null {
  const { editor, pos, nextText } = params;
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'rawMdxFallback') return null;
  if (node.textContent === nextText) return null;
  // node content = `text*`; replace the inner range from pos+1 to pos+nodeSize-1
  return {
    from: pos + 1,
    to: pos + node.nodeSize - 1,
    nextText,
  };
}

export interface RawMdxFallbackPropPanelProps {
  editor: Editor;
  getPos: () => number | undefined;
  onDismiss: () => void;
}

export function RawMdxFallbackPropPanel({
  editor,
  getPos,
  onDismiss,
}: RawMdxFallbackPropPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Snapshot position + attrs once for the lifetime of this panel instance.
  // `getPos()` is stable enough for a single activation (PM transactions that
  // move the node would deregister the chip and re-register under a new id).
  const initialPos = getPos();
  const initialNode = typeof initialPos === 'number' ? editor.state.doc.nodeAt(initialPos) : null;
  const initialText = initialNode?.textContent ?? '';
  const reason = (initialNode?.attrs.reason as string | undefined) ?? 'Parse failed';
  const span = (initialNode?.attrs.originalSpan as RawMdxOriginalSpan | undefined) ?? {
    start: 0,
    end: 0,
  };
  const showSourceAffordance = hasMeaningfulSpan(span);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Track the latest text written back to PM so we can skip round-trip
    // reflows triggered by our own write (XmlFragment → Observer A → Y.Text
    // cycle would otherwise bounce the CM view).
    let lastWrittenText = initialText;

    const state = EditorState.create({
      doc: initialText,
      extensions: buildCmExtensions({
        onDocChange: (doc) => {
          if (doc === lastWrittenText) return;
          const currentPos = getPos();
          if (typeof currentPos !== 'number') return;
          const plan = computePmReplaceTransaction({
            editor,
            pos: currentPos,
            nextText: doc,
          });
          if (!plan) return;
          lastWrittenText = doc;
          // Keep the user's CM6 focus — do NOT call editor.commands.focus().
          // Using a direct transaction avoids chain().focus() side-effects.
          editor.view.dispatch(
            editor.state.tr.replaceWith(
              plan.from,
              plan.to,
              plan.nextText.length > 0 ? editor.schema.text(plan.nextText) : [],
            ),
          );
        },
        onEscape: () => onDismiss(),
      }),
    });

    const view = new EditorView({ state, parent: container });
    viewRef.current = view;
    // Focus the CM view so typing lands in the panel immediately.
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // We intentionally only wire once per activation; prop changes to
    // `getPos`/`editor` represent stable refs (useEffect deps below capture
    // them for exhaustive-deps correctness).
  }, [editor, getPos, initialText, onDismiss]);

  function handleOpenSource() {
    window.dispatchEvent(
      new CustomEvent<RawMdxNavDetail>(RAW_MDX_NAV_EVENT, {
        detail: { offset: span.start },
      }),
    );
    onDismiss();
  }

  return (
    <div
      className={cn(
        'fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-border bg-background p-3 shadow-lg',
        'flex flex-col gap-2 min-w-[480px] max-w-[720px]',
      )}
      data-ok-raw-mdx-fallback-prop-panel=""
      role="dialog"
      aria-label="Edit broken MDX block"
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
          raw
        </span>
        <span className="text-xs text-muted-foreground">{reason}</span>
        <div className="flex-1" />
        {showSourceAffordance ? (
          <Button variant="outline" size="sm" onClick={handleOpenSource}>
            <ExternalLink className="mr-1 size-3.5" />
            Open in source
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" onClick={onDismiss} aria-label="Close">
          <X className="size-4" />
        </Button>
      </div>
      <div
        ref={containerRef}
        className="rounded border border-input bg-muted/50 overflow-auto max-h-[320px]"
        data-ok-raw-mdx-fallback-cm=""
      />
    </div>
  );
}
