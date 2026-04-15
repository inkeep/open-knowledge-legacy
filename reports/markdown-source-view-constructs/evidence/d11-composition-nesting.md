# Evidence: D11 — composition / nesting

**Dimension:** D11 — Cross-construct interactions when markdown elements nest
**Date:** 2026-04-14

---

## Common nesting patterns

| Outer | Inner | Common? |
|---|---|---|
| Blockquote | paragraph with emphasis/strong | Common |
| Blockquote | list / listItem | Common |
| Blockquote | fenced code | Less common |
| Blockquote | nested blockquote (`> >`) | Common in forums/email-style quoting |
| Blockquote | table | Rare |
| List item | fenced code | Common |
| List item | nested list | Very common |
| List item | blockquote | Rare |
| HTML block | markdown content | GFM doesn't parse markdown inside HTML blocks by default; MDX/hugo markdown="1" do |
| MDX JSX flow | markdown children | MDX-specific (excluded from this report scope) |

---

## CM6 composition mechanics

**Finding D11-1:** CM6 `Decoration.line` decorations stack by CSS precedence. Multiple classes on a line merge via CSS's normal selector specificity + source order. A line that is BOTH a `Blockquote` descendant AND a `ListItem` gets both classes applied, and the CSS rules compose (background + border-left from blockquote, plus padding + marker from list).
**Confidence:** CONFIRMED (T1)
**Evidence:** CM6 decoration reference — `Decoration.line` with `class: "a b c"` works as standard HTML class merging

Conflicts arise only when CSS properties overlap (e.g., both classes set `padding-left` — the later/more-specific wins). Good design: one construct handles padding-left, the other handles border-left or tint.

---

## Per-product findings

### Obsidian

**Source Mode:**
- `> - item` (list in blockquote): both the blockquote `>` marker AND list `-` marker are visible text. No visual hierarchy cue.
- `> **text**` (emphasis in blockquote): markers visible in Source Mode
- `- > quote` (blockquote in list item): works; content-indent propagates

**Live Preview:**
- List in blockquote: **known bug** per forum #30849 — fails to render correctly
- Nested blockquote (`> >`): **known rendering bug** per forum #95349
**Confidence:** CONFIRMED (T2)

### codemirror-rich-markdoc

Only `Table`, `Blockquote`, and `MarkdocTag` are block-replace candidates. When a blockquote contains a table, the outer `Blockquote` widget replaces the whole region — the inner table's source is inside the widget's `innerHTML` (rendered once at widget construction).

A cursor entering the blockquote (via the cursor-range-overlap guard) causes the outer replace to skip, exposing the raw source of BOTH the `>` markers AND the inner `|...|` table text. User edits raw source; on cursor leave, the widget re-renders with updated text.
**Confidence:** CONFIRMED (T1 — source-verified)

**Implication:** This is the "whole-enclosing-construct" reveal pattern. Finer-grained reveal (only the inner table) would require nested StateFields or more sophisticated cursor-range logic.

### SilverBullet

Per prior report: each construct has its own plugin file (`table.ts`, `fenced_code.ts`, `frontmatter.ts`). How they compose on nested cases is unclear from public docs at this pass.
**Confidence:** UNRESOLVED

### VS Code + Markdown extensions

Nested structures handled by TextMate grammar (injection scopes propagate for nested constructs). Source view has no per-construct decoration stack; just syntax coloring which composes naturally.
**Confidence:** CONFIRMED (T1)

### HedgeDoc / Typora / Marktext / MDXEditor

Preview pane handles nesting via rendered HTML (browser handles layout composition). Source pane: plain text.
**Confidence:** INFERRED (T2)

---

## Performance concern

For a document with deeply nested structures, each line may match multiple syntax-tree nodes. A per-line scan for N constructs × M nesting levels = O(N×M) work per viewport. Viewport-scoped iteration keeps this manageable even for large documents.

No maintainer-published benchmarks for "deeply nested markdown at scale." Extrapolating from CM6's viewport-culling design, this should not be a scaling concern for realistic content sizes.

---

## Gaps / follow-ups

- **Multi-decoration composition:** Obsidian LP bugs (#30849, #95349) suggest even mature products have nesting edge cases. No systematic testing observed in any product
- **Cursor-reveal granularity under nesting:** when cursor enters a nested construct, which level reveals source? Every surveyed product using cursor-reveal works at the whole-enclosing-construct level; nested granularity is unexplored
- **CSS precedence debugging:** when multiple line-decoration classes conflict, how do authors debug? No published guidance
