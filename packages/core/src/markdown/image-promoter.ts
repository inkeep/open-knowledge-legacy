/**
 * CommonMark `image` → `<CommonMarkImage>` mdxJsxFlowElement promoter.
 *
 * Both `![alt](src)` and `<img src="…" />` land on a `jsxComponent` PM node
 * — the markdown form via the `CommonMarkImage` compat descriptor (read-
 * only round-trip), and the lowercase JSX form via the canonical `img`
 * descriptor. γ preservation keeps the authored form byte-identical on
 * pristine save: the original `![alt](src "title")` bytes stay on disk,
 * Phase B's position-slice walker attaches `data.sourceRaw` to the emitted
 * `mdxJsxFlowElement`, and the pristine-form to-markdown handler emits
 * sourceRaw verbatim.
 *
 * ## Shape
 *
 * Input: mdast `image` node — `{ type: 'image', url: string, alt?: string,
 * title?: string, position?: ... }`.
 *
 * Output: `mdxJsxFlowElement` — `{ type: 'mdxJsxFlowElement', name:
 * 'CommonMarkImage', attributes: [src, alt?, title?], children: [],
 * position: <copied> }`. The compat descriptor renders through the
 * canonical `img` React component and round-trips back to CommonMark
 * `![alt](src)` syntax on save (read-only compat — the user inserts a
 * fresh canonical Image block via the slash menu when they need the
 * full HTML-attr surface).
 *
 * ## Attr mapping
 *
 * CommonMark image syntax carries `url`, `alt`, `title`. These map directly
 * onto the CommonMarkImage descriptor's three props. The richer HTML-attr
 * tail (`width`, `height`, `srcset`, `sizes`, `loading`, …) is reachable
 * only via the canonical `<img>` MDX form; CommonMark syntax can't express
 * those, so authors who need them write `<img …/>` directly or click
 * Convert from a CommonMark image.
 *
 * ## Position semantics
 *
 * When the original `image` node carries `position`, it's copied onto the
 * emitted `mdxJsxFlowElement` so Phase B's position-slice walker attaches
 * `data.sourceRaw = source.slice(start, end)` — the exact `![alt](src
 * "title")` bytes. On pristine save, the custom `mdxJsxFlowElement`
 * to-markdown handler emits that verbatim (precedent #12 γ hybrid
 * serialization).
 *
 * ## Inline vs block context
 *
 * CommonMark `image` is an inline node. Remark-parse commonly wraps it in
 * a `paragraph` when it's the sole inline child. This transformer promotes
 * ONLY the block-context form: a paragraph whose single child is an image.
 * Inline images inside prose (e.g. `A paragraph with an ![inline](src)
 * image in it.`) stay as inline `image` nodes — promoting those to a
 * flow-level component would break the paragraph structure.
 *
 * ## Scope
 *
 * Reference-style images (`![alt][ref]`) are also promoted — remark-parse
 * resolves them to `image` nodes after the definition pass, so they arrive
 * at this transformer with `url` / `title` already populated.
 *
 * Obsidian `![[file.png]]` wiki-embed syntax is out of scope; it goes
 * through the separate `wikiLinkEmbed` parse path.
 *
 * ## When it runs
 *
 * Registered in the parse chain between `calloutTransformerPlugin` and
 * `detailsAccordionPromoterPlugin`. Order within the three transformers
 * is orthogonal — images never appear inside callout or details bodies
 * that would change shape.
 */

import type { Image, Paragraph, Root } from 'mdast';
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx';
import { visit } from 'unist-util-visit';

/**
 * Unified plugin factory — emits a transformer that walks the tree, finds
 * paragraphs containing exactly one image child, and replaces them with an
 * `mdxJsxFlowElement(CommonMarkImage, ...)` carrying the copied position.
 */
export function imagePromoterPlugin() {
  return (tree: Root) => {
    visit(tree, 'paragraph', (node: Paragraph, index, parent) => {
      if (!parent || index === undefined || index === null) return;

      // Only promote paragraphs whose single child is an image. Inline
      // images inside prose stay as inline `image` nodes.
      if (node.children.length !== 1) return;
      const child = node.children[0];
      if (!child || child.type !== 'image') return;

      const image = child as Image;
      const element = buildImageElement(image, node);
      // Replace the wrapping paragraph with the flow element. Position
      // spans the paragraph (which spans the image) so Phase B's
      // position-slice walker grabs the original bytes.
      (parent.children as unknown[])[index] = element;
    });
  };
}

function buildImageElement(image: Image, paragraph: Paragraph): MdxJsxFlowElement {
  const attrs: MdxJsxAttribute[] = [{ type: 'mdxJsxAttribute', name: 'src', value: image.url }];
  // alt is optional in CommonMark — only emit the attr when present and
  // non-empty. Empty alt is common for decorative images; preserving it
  // round-trips byte-identically via γ sourceRaw regardless.
  if (image.alt) {
    attrs.push({ type: 'mdxJsxAttribute', name: 'alt', value: image.alt });
  }
  // title (the `"..."` part of `![alt](src "title")`) maps to the Image
  // descriptor's `title` prop — render as the native `title` tooltip.
  if (image.title) {
    attrs.push({ type: 'mdxJsxAttribute', name: 'title', value: image.title });
  }

  const element: MdxJsxFlowElement = {
    type: 'mdxJsxFlowElement',
    // CommonMarkImage (compat descriptor) preserves source-form identity
    // through the PM tree so the dirty-path serializer round-trips back to
    // CommonMark `![alt](src "title")` syntax instead of always emitting MDX JSX.
    name: 'CommonMarkImage',
    attributes: attrs,
    children: [],
  };
  // Copy position from the paragraph so Phase B's position-slice walker
  // spans the original `![alt](src "title")` bytes. Paragraph position ≈
  // image position in practice (single-image-paragraph) but paragraph is
  // the safer upper bound.
  if (paragraph.position) {
    element.position = paragraph.position;
  }
  return element;
}
