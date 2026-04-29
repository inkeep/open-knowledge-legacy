/**
 * HTML5 `<details>` → Accordion mdast promoter (US-011 / FR-8).
 *
 * Runs AFTER Phase A `restoreFromMdx` has put the literal `<`/`>` back into
 * text nodes. In our agnostic-MDX pipeline, lowercase HTML tags like
 * `<details>` / `<summary>` / `</details>` are R23-protected on the input,
 * flow through remark-parse as text, and emerge as paragraph-wrapped text
 * nodes after Phase A restoration. (They do NOT land as
 * `mdxJsxFlowElement`-with-`name:'details'` nor as raw HTML nodes; those
 * shape observations in the FR-8 description were imagined, not observed —
 * this transformer keys off the actual post-restore shape.)
 *
 * Two input shapes are recognized in the same pass:
 *
 * 1. **Single-line details** — one paragraph whose text value matches the
 *    opener-to-closer regex on a single line, e.g.
 *    `<details open><summary>X</summary>Body</details>`. The whole
 *    paragraph is replaced with an `mdxJsxFlowElement(Accordion, ...)`.
 *
 * 2. **Multi-paragraph details** — opener/closer on separate lines, with
 *    the body spanning one or more sibling paragraphs:
 *
 *    ```
 *    <details open><summary>Show details</summary>
 *
 *    Body
 *
 *    </details>
 *    ```
 *
 *    The opener paragraph, body paragraphs, and closer paragraph are
 *    collapsed into a single `mdxJsxFlowElement(Accordion, ...)`.
 *
 * ## γ preservation
 *
 * The emitted `mdxJsxFlowElement` carries a `position` field spanning the
 * original `<details>` bytes (from the opener paragraph's start offset to
 * the closer paragraph's end offset). Phase B's position-slice walker runs
 * AFTER this transformer and attaches `data.sourceRaw = source.slice(start,
 * end)` — the full original `<details>...</details>` text. On pristine
 * save, the to-markdown handler emits that verbatim per its sourceRaw-first
 * dispatch, so the `<details>` authoring form round-trips byte-identically.
 *
 * ## Attr extraction
 *
 * The opener tag is parsed via a small ad-hoc attribute tokenizer. Only
 * four HTML attrs are honored for Accordion:
 *
 *   - `open` → `defaultOpen` (boolean shorthand)
 *   - `name` → `name` (HTML5 exclusive-accordion group id)
 *   - `id` → `id` (deep-link anchor)
 *   - summary text (between `<summary>` and `</summary>`) → `title`
 *
 * All other source attrs are dropped — γ sourceRaw preservation keeps them
 * on disk losslessly, but they carry no runtime semantic under the
 * descriptor's 6-prop surface.
 *
 * ## Why not path-a-style (plugin + downstream transformer)
 *
 * There is no maintained upstream plugin that emits the mdast shape we
 * need for HTML5 `<details>`. A bespoke transformer is the minimal-surface
 * path. Keeping it under ~120 LoC is a conscious goal — the complexity
 * cost of cross-paragraph sibling aggregation is the reason Q-MF2 was
 * DELEGATED, not the reason for a generic abstraction.
 */

import type { Nodes, Paragraph, Parent, Root, Text } from 'mdast';
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx';
import { visit } from 'unist-util-visit';

type FlowChildren = MdxJsxFlowElement['children'];

/**
 * Matches a single-line `<details>...</details>` span inside ONE text value.
 * Captures:
 *   m[1] = the opener tag's attrs string (e.g. ` open name="grp" id="x"`)
 *   m[2] = summary inner text
 *   m[3] = body (between `</summary>` and `</details>`)
 */
const SINGLE_LINE_DETAILS_RE =
  /^<details(\s[^>]*)?>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>\s*$/;

/**
 * Matches an opener line that starts with `<details...>` optionally followed
 * by `<summary>...</summary>` and optional trailing body content on the
 * same line. Used for the multi-paragraph recognizer.
 *
 *   m[1] = the opener tag's attrs string
 *   m[2] = summary inner text (optional — missing when summary is on its
 *          own subsequent paragraph)
 */
const OPENER_RE = /^<details(\s[^>]*)?>(?:\s*<summary>([\s\S]*?)<\/summary>)?[\s\S]*$/;

/** Matches a text whose ONLY content (after trim) is the closing `</details>` tag. */
const CLOSER_RE = /^\s*<\/details>\s*$/;

/** Attr tokenizer for the opener tag's attr string. Very small: handles
 * boolean shorthand, double-quoted, and single-quoted forms. Sufficient
 * for the attrs Accordion honors (`open`, `name`, `id`). */
function parseDetailsAttrs(rawAttrs: string | undefined): {
  defaultOpen: boolean;
  name: string | null;
  id: string | null;
} {
  let defaultOpen = false;
  let name: string | null = null;
  let id: string | null = null;
  if (!rawAttrs) return { defaultOpen, name, id };

  // Match name (=["value"|'value'|value)? forms
  const attrRe = /(\w+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+)))?/g;
  let m = attrRe.exec(rawAttrs);
  while (m !== null) {
    const attrName = m[1].toLowerCase();
    const attrValue = m[2] ?? m[3] ?? m[4] ?? null;
    if (attrName === 'open') defaultOpen = true;
    else if (attrName === 'name') name = attrValue;
    else if (attrName === 'id') id = attrValue;
    m = attrRe.exec(rawAttrs);
  }
  return { defaultOpen, name, id };
}

function buildAccordionAttrs(opts: {
  title: string | null;
  defaultOpen: boolean;
  name: string | null;
  id: string | null;
}): MdxJsxAttribute[] {
  const attrs: MdxJsxAttribute[] = [];
  if (opts.title !== null) {
    attrs.push({ type: 'mdxJsxAttribute', name: 'title', value: opts.title });
  }
  if (opts.defaultOpen) {
    attrs.push({ type: 'mdxJsxAttribute', name: 'defaultOpen', value: null });
  }
  if (opts.name !== null) {
    attrs.push({ type: 'mdxJsxAttribute', name: 'name', value: opts.name });
  }
  if (opts.id !== null) {
    attrs.push({ type: 'mdxJsxAttribute', name: 'id', value: opts.id });
  }
  return attrs;
}

function isTextOnlyParagraph(node: Nodes): node is Paragraph {
  if (node.type !== 'paragraph') return false;
  const children = (node as Paragraph).children;
  return children.length === 1 && children[0].type === 'text';
}

function textValue(paragraph: Paragraph): string {
  return (paragraph.children[0] as Text).value ?? '';
}

/**
 * Promote a single-line `<details>...</details>` paragraph in place.
 * Returns the replacement node if match, else null.
 */
function promoteSingleLineParagraph(paragraph: Paragraph): MdxJsxFlowElement | null {
  if (!isTextOnlyParagraph(paragraph)) return null;
  const value = textValue(paragraph);
  const m = value.match(SINGLE_LINE_DETAILS_RE);
  if (!m) return null;

  const { defaultOpen, name, id } = parseDetailsAttrs(m[1]);
  const title = m[2].trim() || null;
  const bodyText = m[3].trim();

  const children: FlowChildren = bodyText
    ? ([
        { type: 'paragraph', children: [{ type: 'text', value: bodyText }] } satisfies Paragraph,
      ] as FlowChildren)
    : [];

  return {
    type: 'mdxJsxFlowElement',
    // HtmlDetailsAccordion (compat descriptor) preserves source-form identity
    // through the PM tree so the dirty-path serializer round-trips back to
    // HTML5 `<details>...</details>` syntax instead of always emitting MDX JSX.
    name: 'HtmlDetailsAccordion',
    attributes: buildAccordionAttrs({ title, defaultOpen, name, id }),
    children,
    position: paragraph.position,
  };
}

/**
 * Look for an opener paragraph at `children[startIdx]` and a matching
 * closer paragraph at some later index in the same `children` array.
 * Returns the closer index + the extracted opener info, or null if no
 * complete `<details>` span is found starting at this opener.
 */
interface OpenerMatch {
  closerIdx: number;
  title: string | null;
  defaultOpen: boolean;
  name: string | null;
  id: string | null;
}

function findOpenerMatch(children: Nodes[], startIdx: number): OpenerMatch | null {
  const opener = children[startIdx];
  if (!isTextOnlyParagraph(opener)) return null;
  const openerText = textValue(opener);
  // Quick reject: opener paragraph must START with `<details` (no leading prose).
  if (!openerText.startsWith('<details')) return null;
  // Reject if it's ALSO the closer on the same paragraph (single-line case
  // is handled by promoteSingleLineParagraph, not here).
  if (openerText.includes('</details>')) return null;

  const openerMatch = openerText.match(OPENER_RE);
  if (!openerMatch) return null;

  const { defaultOpen, name, id } = parseDetailsAttrs(openerMatch[1]);
  const title = openerMatch[2]?.trim() || null;

  // Scan forward for the closer paragraph.
  for (let j = startIdx + 1; j < children.length; j++) {
    const candidate = children[j];
    if (!isTextOnlyParagraph(candidate)) continue;
    const candidateText = textValue(candidate);
    if (CLOSER_RE.test(candidateText)) {
      return { closerIdx: j, title, defaultOpen, name, id };
    }
    // Also handle the uncommon case where the body paragraph ALSO contains
    // the closer at its end — e.g. "Body\n</details>" collapses to a single
    // text when the trailing blank line was absent. Conservatively refuse
    // to match; the single-line regex already handles same-paragraph
    // closers when the opener is also same-paragraph.
    if (candidateText.includes('</details>')) return null;
  }
  return null;
}

/**
 * Promote `<details>...</details>` spans within a single parent's children
 * array. Mutates `parent.children` in place.
 *
 * Handles both single-paragraph spans and multi-paragraph spans. Indices
 * are adjusted post-splice so one pass covers a parent with multiple
 * nested/sequential details blocks.
 */
function promoteInParent(parent: Parent): void {
  const children = parent.children as Nodes[];
  let i = 0;
  while (i < children.length) {
    const child = children[i];

    if (isTextOnlyParagraph(child)) {
      // Try single-line form first.
      const single = promoteSingleLineParagraph(child);
      if (single) {
        (children as unknown[])[i] = single;
        i++;
        continue;
      }

      // Try multi-paragraph form.
      const match = findOpenerMatch(children, i);
      if (match) {
        const opener = child;
        const closer = children[match.closerIdx];
        const bodyStart = i + 1;
        const bodyEnd = match.closerIdx; // exclusive
        const body = children.slice(bodyStart, bodyEnd) as FlowChildren;

        const openerPos = opener.position;
        const closerPos = closer.position;
        const replacement: MdxJsxFlowElement = {
          type: 'mdxJsxFlowElement',
          // HtmlDetailsAccordion (compat descriptor) — see single-line variant
          // above for the source-form-identity rationale.
          name: 'HtmlDetailsAccordion',
          attributes: buildAccordionAttrs(match),
          children: body,
          position:
            openerPos && closerPos
              ? {
                  start: openerPos.start,
                  end: closerPos.end,
                }
              : undefined,
        };

        // Splice: remove opener..closer, insert replacement.
        const removeCount = match.closerIdx - i + 1;
        (children as unknown[]).splice(i, removeCount, replacement);
        i++;
        continue;
      }
    }

    i++;
  }
}

/**
 * Unified plugin: walks the mdast tree and promotes every recognized
 * HTML5 `<details>...</details>` authoring form to
 * `mdxJsxFlowElement(Accordion, ...)`.
 *
 * Wire into the parse pipeline between Phase A (`restoreFromMdx`) and
 * Phase B (`mergedPostParseWalkerPlugin`). Phase A restores the literal
 * `<`/`>` into text nodes (so SINGLE_LINE_DETAILS_RE / OPENER_RE /
 * CLOSER_RE can match on real angle brackets); Phase B's position-slice
 * walker THEN attaches `data.sourceRaw` to the emitted mdxJsxFlowElement
 * from the original source bytes at the copied position range.
 */
export function detailsAccordionPromoterPlugin() {
  return (tree: Root) => {
    // Visit every parent-like node and run promoteInParent on its children.
    // `unist-util-visit` will also visit our newly-emitted mdxJsxFlowElement
    // nodes and their children — that's fine, they're unlikely to match
    // the recognizers (no text-only-paragraph with `<details` prefix
    // inside an Accordion body under normal authoring).
    visit(tree, (node) => {
      if ('children' in node && Array.isArray((node as Parent).children)) {
        promoteInParent(node as Parent);
      }
    });
  };
}
