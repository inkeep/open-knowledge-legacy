/**
 * Math parse-path promoter (SPEC 2026-04-29-math-canonical-and-syntax,
 * FR-M4 + FR-M5).
 *
 * Replaces block-math mdast shapes with their compat descriptor:
 *
 *   1. `math` mdast (from `remark-math`, multi-line `$$\n…\n$$`) →
 *      `mdxJsxFlowElement(DollarMath, { formula })` — compat descriptor that
 *      preserves the `$$…$$` source form on round-trip via γ sourceRaw, and
 *      on dirty-path emit serializes back to a `math` mdast node which
 *      `mdast-util-math` re-stringifies as `$$…$$`.
 *
 *   2. `code` mdast with `lang === 'math'` (` ```math `… ``` ` fence syntax,
 *      not claimed by remark-math) → `mdxJsxFlowElement(MathFence, { formula })` —
 *      compat descriptor that preserves the fence form. On dirty-path emit
 *      serializes back to a `code` mdast with `lang: 'math'`.
 *
 * Both compats share the canonical `<Math>` React renderer
 * (`rendersAs: 'Math'`). Slash menu remains canonical-only — these compats
 * are read-only-in-slash-menu, parse-only entry points.
 *
 * Inline math (single-line `$$x$$`, mid-paragraph or standalone) is NOT
 * touched here — the `mathInline` PM atom + KaTeX NodeView pick it up
 * directly via the mdast→PM handler in `markdown/index.ts`. Single
 * `$x$` is intentionally not a math syntax (`singleDollarTextMath:
 * false` in `pipeline.ts`).
 *
 * ## Position semantics
 *
 * The original mdast node's `.position` is copied verbatim onto the emitted
 * `mdxJsxFlowElement` so Phase B's position-slice walker attaches
 * `data.sourceRaw = source.slice(start, end)` — the exact source bytes
 * (`$$…$$` or ` ```math …``` `). Pristine save emits sourceRaw verbatim per
 * the custom `mdxJsxFlowElement` to-markdown handler (precedent #12 γ
 * hybrid serialization).
 *
 * ## When it runs
 *
 * Wired in `pipeline.ts` between `imagePromoterPlugin` and
 * `mergedPostParseWalkerPlugin` (Phase B). Order vs. callout / details /
 * image promoters is orthogonal — math nodes never live inside their
 * bodies that would change shape (and any nesting works because the visit
 * walker descends into all `mdxJsxFlowElement` children).
 *
 * ## Why a single promoter for two shapes
 *
 * Two source shapes (`math` block + `code{lang:'math'}` fence) live in
 * one promoter file because their attribute construction is identical
 * (`formula` from `node.value`). Implementation runs two
 * `unist-util-visit` calls — one per node type — for clarity over a
 * fused single-walk dispatch; the cost difference is negligible at
 * realistic doc sizes.
 */

import type { Code, Root } from 'mdast';
// `Math` mdast interface lives in mdast-util-math; the `mdast`
// RootContentMap augmentation registers the `'math'` type tag but the
// concrete shape is exported here.
import type { Math as MdastMath } from 'mdast-util-math';
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx';
import { visit } from 'unist-util-visit';

/**
 * Build an `mdxJsxFlowElement` for a math source-form, copying the
 * original node's position so Phase B's position-slice walker spans the
 * authored bytes.
 */
function buildMathElement(
  componentName: 'DollarMath' | 'MathFence',
  formula: string,
  position: MdastMath['position'] | Code['position'],
): MdxJsxFlowElement {
  const attrs: MdxJsxAttribute[] = [{ type: 'mdxJsxAttribute', name: 'formula', value: formula }];

  const element: MdxJsxFlowElement = {
    type: 'mdxJsxFlowElement',
    name: componentName,
    attributes: attrs,
    children: [],
  };
  if (position) {
    element.position = position;
  }
  return element;
}

/**
 * Unified plugin factory — emits a transformer that walks the tree and
 * promotes block math source forms to their compat descriptors.
 *
 * Two input shapes are handled here (both block):
 *   - `math` block mdast (multi-line `$$\n…\n$$` from remark-math).
 *   - `code` block with `lang: 'math'` (` ```math `…``` ` fence — not
 *     claimed by remark-math; the standard markdown code-block parser
 *     emits this).
 *
 * `inlineMath` mdast (single-line `$$x$$`, mid-paragraph or standalone)
 * flows straight through to the markdown→PM handler that maps it to the
 * `mathInline` PM atom — see `markdown/index.ts`.
 */
export function mathPromoterPlugin() {
  return (tree: Root) => {
    // `math` block (multi-line `$$…$$`).
    visit(tree, 'math', (node: MdastMath, index, parent) => {
      if (!parent || index === undefined || index === null) return;
      const formula = typeof node.value === 'string' ? node.value : '';
      const element = buildMathElement('DollarMath', formula, node.position);
      (parent.children as unknown[])[index] = element;
    });

    // `code` block with lang:'math'. ` ```math `…``` ` fence syntax.
    visit(tree, 'code', (node: Code, index, parent) => {
      if (!parent || index === undefined || index === null) return;
      if (node.lang !== 'math') return;
      const formula = typeof node.value === 'string' ? node.value : '';
      const element = buildMathElement('MathFence', formula, node.position);
      (parent.children as unknown[])[index] = element;
    });
  };
}
