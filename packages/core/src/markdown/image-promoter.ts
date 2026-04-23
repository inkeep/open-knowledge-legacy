/**
 * CommonMark `image` → `<Image>` mdxJsxFlowElement promoter.
 *
 * Delivers the G2 "MDX as a strict superset of the markdown form" invariant
 * for the Image descriptor (SPEC 2026-04-23-cb-v2-md-foundation §1 + §5) —
 * before this transformer, `![alt](src)` rendered via the native `<img>` PM
 * node while `<Image src=...>` rendered via `jsxComponent` with zoom +
 * caption; identical source bytes produced two different UX tiers.
 *
 * After this transformer, both forms land on the same `jsxComponent(Image,
 * ...)` PM node. γ preservation keeps the authored form byte-identical on
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
 * Output: `mdxJsxFlowElement` — `{ type: 'mdxJsxFlowElement', name: 'Image',
 * attributes: [src, alt?, title?], children: [], position: <copied> }`.
 *
 * ## Attr mapping
 *
 * CommonMark image syntax carries `url`, `alt`, `title`. These map directly
 * onto the `<Image>` descriptor's `src` / `alt` / `title` props (descriptor
 * FR-2). Width, height, caption, loading, zoom are NOT inferrable from
 * CommonMark syntax — they stay at descriptor defaults (zoom=true from
 * `built-ins.ts`, loading='lazy' from `Image.tsx`). Authors who want those
 * props author the MDX form directly.
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
 * image in it.`) stay as inline `image` nodes — promoting those to the
 * flow-level `<Image>` component would break the paragraph structure.
 *
 * ## Scope
 *
 * Reference-style images (`![alt][ref]`) are also promoted — remark-parse
 * resolves them to `image` nodes after the definition pass, so they arrive
 * at this transformer with `url` / `title` already populated.
 *
 * Obsidian `![[file.png]]` wiki-embed syntax is **OUT OF SCOPE** (PR #270
 * territory, NG23). Those go through the separate `wikiLinkEmbed` parse
 * path.
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
 * `mdxJsxFlowElement(Image, ...)` carrying the copied position.
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
    name: 'Image',
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
