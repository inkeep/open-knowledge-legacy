/**
 * MathInlineView — React NodeView for the `mathInline` PM atom (Phase 3
 * of `specs/2026-04-29-math-canonical-and-syntax/`, lifts NG-M11).
 *
 * Renders the formula attr inline-flow via KaTeX (lazy-imported on first
 * mount). Atom node, so PM treats the rendered output as a single
 * indivisible cursor unit — selection lands on the math, Backspace
 * deletes the whole node. Editing the formula isn't supported in the
 * WYSIWYG today; authors switch to source mode and edit `$x$` directly,
 * or delete-and-reinsert via the slash menu.
 *
 * Block math (`<MathView>` in `editor/components/Math.tsx`) and inline
 * math share the same KaTeX dependency — KaTeX JS is lazy and singleton-
 * cached after first import; KaTeX CSS is eager from `main.tsx` so
 * inline-flow rendering doesn't pay per-instance flash-of-unstyled-math.
 *
 * `displayMode: false` is the inline-flow rendering mode (KaTeX wraps
 * output in `<span class="katex">`). `throwOnError: false` keeps malformed
 * LaTeX from crashing the editor — KaTeX renders the error inline with
 * its own red-underline styling.
 */

import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { lazy, Suspense } from 'react';

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

export function MathInlineView({ node, selected }: NodeViewProps) {
  const formula = typeof node.attrs.formula === 'string' ? node.attrs.formula : '';
  const id = typeof node.attrs.id === 'string' ? node.attrs.id : undefined;

  return (
    <NodeViewWrapper as="span" className={selected ? 'math-inline-selected' : undefined}>
      {formula ? (
        <Suspense fallback={<InlinePlaceholder formula={formula} id={id} />}>
          <KatexInlineRender formula={formula} id={id} />
        </Suspense>
      ) : (
        <InlinePlaceholder formula={formula} id={id} />
      )}
    </NodeViewWrapper>
  );
}
