/**
 * MathInlineView — React NodeView for the `mathInline` PM atom (Phase 3
 * of `specs/2026-04-29-math-canonical-and-syntax/`, lifts NG-M11).
 *
 * Renders the formula attr inline-flow via KaTeX (lazy-imported on first
 * mount). Atom node, so PM treats the rendered output as a single
 * indivisible cursor unit — selection lands on the math, Backspace
 * deletes the whole node.
 *
 * ## Editing UX (feature parity with block descriptors)
 *
 * Clicking the rendered atom selects it and opens an inline editor
 * popover anchored to the math span. The popover reuses the same
 * `<PropPanel>` component the block components use (Callout, Math,
 * Mermaid, etc.) — driven by a synthetic `JsxComponentDescriptor` that
 * exposes the `formula` prop. PropPanel's `onChange` writes back to the
 * atom's flat attrs via `tr.setNodeMarkup` (mirroring the block path's
 * "target by position, not selection" pattern that survives focus moves
 * to the portal input).
 *
 * Slash-menu insertion auto-opens the popover via the shared
 * `setPendingAutoOpen` / `consumeAutoOpen` queue used by the
 * descriptor-driven slash entries — same auto-focus sequence as
 * `<Math>` slash-insert.
 *
 * Block math (`<MathView>` in `editor/components/Math.tsx`) and inline
 * math share the same KaTeX dependency — KaTeX JS is lazy and singleton-
 * cached after first import; KaTeX CSS is eager from `main.tsx` so
 * inline-flow rendering doesn't pay per-instance flash-of-unstyled-math.
 *
 * `displayMode: false` is the inline-flow rendering mode (KaTeX wraps
 * output in `<span class="katex">`). `throwOnError: false` keeps
 * malformed LaTeX from crashing the editor — KaTeX renders the error
 * inline with its own red-underline styling.
 */

import { incrementJsxRenderFailure } from '@inkeep/open-knowledge-core';
import type { NodeViewProps } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { NodeViewWrapper } from '@tiptap/react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover.tsx';
import { PropPanel } from '../components/PropPanel.tsx';
import type { JsxComponentDescriptor } from '../registry/types.ts';
import { consumeAutoOpen } from '../slash-command/component-items.tsx';

const inlineMathDescriptor = {
  name: 'InlineMath',
  surface: 'canonical',
  hasChildren: false,
  isSelfClosing: true,
  category: 'content',
  description: 'Inline math',
  props: [
    {
      name: 'formula',
      type: 'string',
      required: true,
      autoFocus: true,
      description: 'LaTeX inline math source',
    },
  ],
} as unknown as JsxComponentDescriptor;

const KatexInlineRender = lazy(async () => {
  const { default: katex } = await import('katex');

  function KatexInlineInner(props: { formula: string }) {
    const html = katex.renderToString(props.formula, {
      displayMode: false,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    });
    return (
      <span
        className="math math-inline"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX renderToString returns a strict HTML-allowlist string with no script execution; this is the documented integration path.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return { default: KatexInlineInner };
});

function EmptyInlineMathPlaceholder() {
  return (
    <span
      className="math math-inline math-placeholder math-placeholder-empty inline-flex items-center gap-1 rounded-sm border border-dashed border-muted-foreground/40 bg-muted/30 px-1.5 py-0.5 text-xs italic text-muted-foreground hover:bg-muted/60 cursor-pointer"
      data-component-type="math-inline"
    >
      f(x)
    </span>
  );
}

function InlineLoadingPlaceholder(props: { formula: string }) {
  return (
    <span className="math math-inline math-placeholder" data-component-type="math-inline">
      {props.formula}
    </span>
  );
}

export function MathInlineView({ node, selected, getPos, editor }: NodeViewProps) {
  const formula = typeof node.attrs.formula === 'string' ? node.attrs.formula : '';
  const id = typeof node.attrs.id === 'string' ? node.attrs.id : undefined;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const wasSelected = useRef(false);

  useEffect(() => {
    const isSoleSelection = selected && editor.state.selection instanceof NodeSelection;

    if (isSoleSelection && !wasSelected.current) {
      const pos = typeof getPos === 'function' ? (getPos() ?? 0) : 0;
      consumeAutoOpen(pos);
      setPopoverOpen(true);
    } else if (!isSoleSelection && wasSelected.current) {
      setPopoverOpen(false);
    }
    wasSelected.current = isSoleSelection;
  }, [selected, getPos, editor]);

  return (
    <NodeViewWrapper as="span" className={selected ? 'math-inline-selected' : undefined}>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        {/* PopoverTrigger asChild needs a single ref-able element. Wrap the
            conditional render in a stable <span> so Radix can attach its
            trigger ref (Suspense doesn't forward refs reliably across the
            fallback/rendered boundary). The wrapper also gives us a single
            place to hang `id` for deep-link anchors and the
            data-component-type attribute consistently across all states. */}
        <PopoverTrigger asChild>
          <span
            className="math-inline-trigger"
            data-component-type="math-inline"
            data-formula={formula}
            {...(id ? { id } : {})}
          >
            {formula ? (
              <ErrorBoundary
                resetKeys={[formula]}
                onError={(error, info) => {
                  const err = error instanceof Error ? error : new Error(String(error));
                  console.warn(
                    JSON.stringify({
                      event: 'jsx-render-failure',
                      component: 'mathInline',
                      rawComponentName: 'mathInline',
                      error: String(err),
                      stack: info.componentStack,
                    }),
                  );
                  incrementJsxRenderFailure('mathInline');
                }}
                fallbackRender={() => (
                  <span className="math math-inline math-error">{formula}</span>
                )}
              >
                <Suspense fallback={<InlineLoadingPlaceholder formula={formula} />}>
                  <KatexInlineRender formula={formula} />
                </Suspense>
              </ErrorBoundary>
            ) : (
              <EmptyInlineMathPlaceholder />
            )}
          </span>
        </PopoverTrigger>
        <PopoverContent
          className="z-[60] w-72 p-0"
          side="bottom"
          align="start"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            editor.view.focus();
          }}
        >
          <div className="text-xs font-medium text-muted-foreground px-3 pt-2">
            Inline Math Properties
          </div>
          <PropPanel
            descriptor={inlineMathDescriptor}
            values={{ formula }}
            onChange={(propName, value) => {
              const p = typeof getPos === 'function' ? getPos() : undefined;
              if (typeof p !== 'number') return;
              const curNode = editor.state.doc.nodeAt(p);
              if (!curNode || curNode.type.name !== 'mathInline') return;
              const tr = editor.state.tr.setNodeMarkup(p, null, {
                ...curNode.attrs,
                [propName]: value ?? '',
              });
              tr.setSelection(NodeSelection.create(tr.doc, p));
              editor.view.dispatch(tr);
            }}
          />
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}
