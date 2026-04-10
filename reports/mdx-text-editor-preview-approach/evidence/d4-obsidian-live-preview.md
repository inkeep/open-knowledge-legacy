# Evidence: D4 — The Obsidian Live Preview Pattern

**Dimension:** How Obsidian's Live Preview works technically, and whether it applies to MDX
**Date:** 2026-04-03
**Sources:** Obsidian forum, CodeMirror forum, codemirror-rich-markdoc, Obsidian plugin development docs

---

## Key files / pages referenced

- https://forum.obsidian.md/t/how-to-configure-codemirror-to-work-like-live-preview/43047 — How to configure CM6 like Live Preview
- https://obsidian.md/blog/codemirror-6-migration-guide/ — Obsidian CM6 migration guide
- https://github.com/segphault/codemirror-rich-markdoc — Rich Markdoc for CodeMirror 6
- https://sinja.io/blog/how-i-built-notebook-in-obisidian-emera — Building notebooks in Obsidian
- https://deepwiki.com/steven-kraft/obsidian-markdown-furigana/4.3-editor-view-extension — CM6 ViewPlugin example
- https://forum.obsidian.md/t/codemirror-view-plugin-vs-state-field-for-inline-replacements/78108 — View Plugin vs State Field
- https://github.com/nothingislost/obsidian-codemirror-options — CM6 options plugin

---

## Findings

### Finding: Obsidian Live Preview uses CodeMirror 6 decorations to render markdown inline while editing source
**Confidence:** CONFIRMED
**Evidence:** Obsidian CM6 migration guide, forum posts

Obsidian's Live Preview mode (introduced with CM6 upgrade) is built on CodeMirror 6's decoration system. The approach:

1. **The source text is always the document model.** Users edit raw markdown text in a CodeMirror 6 editor.
2. **Decorations overlay visual rendering on top of the source.** CodeMirror's `Decoration.widget()` and `Decoration.replace()` APIs replace or augment source text regions with rendered HTML.
3. **Syntax tokens are hidden when the cursor is NOT on them.** When the cursor moves away from a heading's `##` prefix, the `##` is visually hidden (via CSS or decoration replacement) and the text is styled as a heading.
4. **When the cursor enters a region, decorations are removed, revealing source.** This is the "Typora-like" behavior: you see rendered output until you click to edit, then you see source.

### Finding: CodeMirror 6's decoration API provides three key mechanisms for live preview
**Confidence:** CONFIRMED
**Evidence:** CodeMirror docs, Obsidian plugin examples

1. **Mark decorations:** Apply CSS classes to text ranges without changing content. Used for styling (bold, italic, heading sizes). Applied via `Decoration.mark({ class: "cm-heading" })`.

2. **Widget decorations:** Insert arbitrary DOM elements at positions in the editor. Used for rendered component previews, image embeds, etc. Applied via `Decoration.widget({ widget: new MyWidget() })`.

3. **Replace decorations:** Replace text ranges with widgets. Used for completely replacing source syntax with rendered output. Applied via `Decoration.replace({ widget: new MyWidget() })`.

These decorations are managed by ViewPlugins or StateFields:
- **ViewPlugin:** For decorations that change based on viewport (what's visible). More performant for large documents.
- **StateField:** For decorations that affect vertical space (heights) or need to persist across updates.

### Finding: Cursor-aware decoration hiding requires tracking selection intersection
**Confidence:** CONFIRMED
**Evidence:** Obsidian forum, codemirror-rich-markdoc

The cursor-aware behavior works by:
1. Parse the document to identify syntax ranges (e.g., `##` for headings, `**` for bold)
2. On every editor state update, check if the cursor/selection intersects with any syntax range
3. If cursor is OUTSIDE the range: apply decoration (hide syntax, show rendered)
4. If cursor is INSIDE the range: remove decoration (show raw source)

The codemirror-rich-markdoc plugin implements this pattern: "When the user moves the text cursor into one of the rendered blocks, the widget disappears and the original source text is revealed for editing." It uses the lezer-markdown tokenizer from CodeMirror's Markdown support to identify regions.

CSS technique for hiding syntax characters: `font-size: 1px !important; letter-spacing: -1ch; color: transparent;` (NOT `display: none`, which breaks cursor placement).

### Finding: Applying this pattern to MDX components is theoretically possible but significantly harder
**Confidence:** INFERRED
**Evidence:** codemirror-rich-markdoc limitations, MDX component complexity

For standard markdown (headings, bold, links, images), the Obsidian pattern works well because:
- The rendered output has a predictable visual size
- Syntax tokens are small and can be hidden with CSS
- The rendered output is static HTML

For MDX components, the challenges multiply:
- **Component rendering is dynamic:** A `<Chart data={...} />` component renders complex interactive DOM. Replacing the source with a rendered widget means mounting a React component inside a CodeMirror widget decoration.
- **Component size is unpredictable:** A component might render as a 300px chart or a full-width table. The editor needs to handle arbitrary height/width changes.
- **Props are complex:** MDX components can have expression props (`data={chartData}`), children (nested markdown), and state. These don't map to simple "hide syntax, show rendered."
- **Editing experience:** When the cursor enters a component region, showing the raw JSX source (`<Chart data={[1,2,3]} type="bar" />`) is useful for developers but confusing for non-technical users.

### Finding: codemirror-rich-markdoc demonstrates the pattern but with significant limitations
**Confidence:** CONFIRMED
**Evidence:** https://github.com/segphault/codemirror-rich-markdoc

The plugin proves the Obsidian-like pattern in CM6 for a markup language with custom tags (Markdoc). It renders Markdoc tags as block widgets. When cursor enters, source is revealed.

Known limitations that would also apply to MDX:
1. Cursor positioning bugs in rendered blocks
2. Performance: recomputes all decorations on every operation (no incremental update)
3. Only 3 commits, minimal maintenance
4. No support for inline custom elements (only block-level)
5. Spacing miscalculations in headers

### Finding: A hybrid approach may be more practical than full inline rendering for MDX
**Confidence:** INFERRED
**Evidence:** Synthesis of Obsidian pattern + MDX complexity

Rather than rendering EVERY MDX component inline (like Obsidian does for markdown syntax), a practical approach for MDX:
- **Standard markdown:** Apply Obsidian-like inline rendering (headings, bold, links, images)
- **Simple components (self-closing, known types):** Show a compact visual preview widget (e.g., an icon + component name + key props)
- **Complex components (children, expressions):** Show source with syntax highlighting, render only in the side-by-side preview panel

This "hybrid" approach gives the best of both worlds: rich editing for markdown content, source editing with preview for components.

---

## Gaps / follow-ups

* No prior art exists for rendering React components as CodeMirror widget decorations within an MDX document. This would be genuinely novel engineering.
* Performance implications of mounting/unmounting React components as CM6 widgets on cursor movement are unknown.
* The Obsidian Live Preview source code is proprietary — the exact implementation details are not publicly available, only community-observed behavior and plugin development patterns.
