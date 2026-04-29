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

import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover.tsx';
import { PropPanel } from '../components/PropPanel.tsx';
import type { JsxComponentDescriptor } from '../registry/types.ts';
import { consumeAutoOpen } from '../slash-command/component-items.ts';

/**
 * Synthetic descriptor used to drive the inline-math PropPanel. `mathInline`
 * is a PM atom (not a registered jsxComponent), but PropPanel is
 * descriptor-shaped — feeding it a 1-prop synthetic gets full UX parity
 * (auto-focus on `formula`, advanced section collapsed, persisted state
 * keyed by descriptor `name`) without lifting the registry's "all-block"
 * invariant or NG14 (jsxInline render-less).
 *
 * Cast as `JsxComponentDescriptor` because PropPanel only reads
 * `descriptor.props` and `descriptor.name` — the React `Component` and
 * `reactNodePropNames` decoration fields are never accessed in this
 * editing context.
 */
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

  function KatexInlineInner(props: { formula: string; id?: string }) {
    const html = katex.renderToString(props.formula, {
      displayMode: false,
      throwOnError: false,
      strict: 'ignore',
    });
    return (
      <span
        className="math math-inline"
        data-component-type="math-inline"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX renderToString returns a strict HTML-allowlist string with no script execution; this is the documented integration path.
        dangerouslySetInnerHTML={{ __html: html }}
        {...(props.id ? { id: props.id } : {})}
      />
    );
  }

  return { default: KatexInlineInner };
});

function InlinePlaceholder(props: { formula: string; id?: string }) {
  // `​` (zero-width space) keeps the atom's inline box alive so PM's
  // cursor-position machinery has somewhere to land while KaTeX is
  // resolving. Visible text falls back to the formula source so a
  // network-stalled lazy import still shows the user's input rather than
  // a blank gap.
  return (
    <span
      className="math math-inline math-placeholder"
      data-component-type="math-inline"
      {...(props.id ? { id: props.id } : {})}
    >
      {props.formula || '​'}
    </span>
  );
}

export function MathInlineView({ node, selected, getPos, editor }: NodeViewProps) {
  const formula = typeof node.attrs.formula === 'string' ? node.attrs.formula : '';
  const id = typeof node.attrs.id === 'string' ? node.attrs.id : undefined;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const wasSelected = useRef(false);

  // Open the popover when this atom becomes the selected node. Two paths:
  //   1. Slash-insert auto-open: `consumeAutoOpen(pos)` drains the pending
  //      flag set by the slash-menu command, opens the popover on the
  //      first selected→true transition.
  //   2. Click-to-edit: PM produces a NodeSelection on click; `selected`
  //      flips true; we open the popover. (No auto-open flag needed —
  //      every selection of this atom opens the editor.)
  // Closing on selected→false keeps the popover dismissed when the user
  // clicks elsewhere; outside-click dismissal is handled by the Popover
  // primitive itself.
  useEffect(() => {
    const pos = typeof getPos === 'function' ? (getPos() ?? 0) : 0;
    if (selected && !wasSelected.current) {
      // Drain any pending auto-open flag (slash-insert path) — non-load-
      // bearing here because we open on every fresh selection anyway, but
      // calling it keeps the queue tidy for the next inline-math insert.
      consumeAutoOpen(pos);
      setPopoverOpen(true);
    } else if (!selected && wasSelected.current) {
      setPopoverOpen(false);
    }
    wasSelected.current = selected;
  }, [selected, getPos]);

  return (
    <NodeViewWrapper as="span" className={selected ? 'math-inline-selected' : undefined}>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          {formula ? (
            <Suspense fallback={<InlinePlaceholder formula={formula} id={id} />}>
              <KatexInlineRender formula={formula} id={id} />
            </Suspense>
          ) : (
            <InlinePlaceholder formula={formula} id={id} />
          )}
        </PopoverTrigger>
        <PopoverContent
          className="z-[60] w-72 p-0"
          side="bottom"
          align="start"
          // Keep the content inside the editor's React tree so PM
          // selection events from inside the input don't bubble back into
          // the editor as a deselect.
          onOpenAutoFocus={(e) => {
            // Let PropPanel's `autoFocus` propagate to the formula input
            // — don't steal focus to the popover container.
            e.preventDefault();
          }}
        >
          <div className="text-xs font-medium text-muted-foreground px-3 pt-2">
            Inline Math Properties
          </div>
          <PropPanel
            descriptor={inlineMathDescriptor}
            values={{ formula }}
            onChange={(propName, value) => {
              // Mirror JsxComponentView's "target by position, not
              // selection" pattern. The popover input has DOM focus, so
              // PM's selection has moved off the atom; selection-based
              // `updateAttributes` would no-op. `setNodeMarkup(pos, …)`
              // targets the atom regardless of where selection is now.
              const p = typeof getPos === 'function' ? getPos() : undefined;
              if (typeof p !== 'number') return;
              const curNode = editor.state.doc.nodeAt(p);
              if (!curNode || curNode.type.name !== 'mathInline') return;
              editor.view.dispatch(
                editor.state.tr.setNodeMarkup(p, null, {
                  ...curNode.attrs,
                  [propName]: value ?? '',
                }),
              );
            }}
          />
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}
