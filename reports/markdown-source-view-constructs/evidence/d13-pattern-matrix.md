# Evidence: D13 — per-construct pattern matrix

**Dimension:** D13 — Synthesis matrix: for each construct, recommended CM6 primitive stack with trade-offs
**Date:** 2026-04-14
**Type:** Orchestrator synthesis from D1–D12.

Note: "Recommended" here means "the best-fit primitive stack given observed ecosystem precedent and maintainer guidance" — NOT a 1P recommendation for Open Knowledge. Downstream spec picks and applies.

---

## Matrix

| Construct | Lezer node(s) | Primitive family | CM6 Kind | Cursor-reveal? | Atomic? | Evidence tier |
|---|---|---|---|---|---|---|
| **Blockquote** | `Blockquote`, `QuoteMark` | Line-level (S2) with border-left + tint | `Decoration.line` (ViewPlugin) | Optional | No | CONFIRMED |
| **Fenced code** | `FencedCode`, `CodeMark`, `CodeInfo`, `CodeText` | Line-level no-wrap (S2) + optional widget | `Decoration.line` + optional `parseCode` for syntax | No | No | CONFIRMED |
| **Inline code** | `InlineCode` | Inline mark (S2) | `Decoration.mark` (ViewPlugin) | Typically no | No | CONFIRMED |
| **List / listItem** | `BulletList`, `OrderedList`, `ListItem`, `ListMark`, `TaskMarker` | Line-level hanging indent + mark styling | `Decoration.line` + `Decoration.mark` | Optional for markers | No | CONFIRMED |
| **Task item checkbox** | `TaskMarker` | Widget replace (S3) with `<input type=checkbox>` | `Decoration.replace` (StateField) | Yes (reveal source on cursor) | Optional | CONFIRMED |
| **HTML block** | `HTMLBlock` | Line-level tint (S2) OR nested HTML parse via `parseCode` | `Decoration.line` + optional nested parser | No | No | CONFIRMED |
| **HTML block attr colorization** | `HTMLBlock` + MatchDecorator | Inline mark (S2 extended — Rainbow-HTML) | `MatchDecorator` + `Decoration.mark` | No | No | INFERRED (unclaimed) |
| **YAML frontmatter** | custom `FrontMatter` or detect via regex | Line-level tint (S2) + optional nested YAML parse | `Decoration.line` + optional `parseCode` + `foldNodeProp` | No | No | CONFIRMED |
| **Heading (per-level size)** | `ATXHeading1`..`6`, `HeaderMark` | Line-level + optional mark hiding | `Decoration.line` + optional `Decoration.mark` on HeaderMark | Optional for `#` markers | No | INFERRED |
| **Thematic break styled** | `HorizontalRule` | Line-level CSS border | `Decoration.line` | No | No | CONFIRMED |
| **Emphasis / strong markers** | `Emphasis`, `StrongEmphasis`, `EmphasisMark`, `StrongMark` | Inline mark hiding (S2/S3 mix) | `Decoration.mark` (ViewPlugin) with cursor-reveal guard | YES — canonical pattern | No | CONFIRMED |
| **Strikethrough** | `Strikethrough`, `StrikethroughMark` (GFM) | Inline mark + optional marker hiding | `Decoration.mark` | Optional | No | INFERRED |
| **Highlight (`==`)** | custom parser extension | Inline mark + optional marker hiding | `Decoration.mark` | Optional | No | INFERRED |
| **Link / image (short)** | `Link`, `Image`, `LinkMark`, `URL` | Inline mark hiding (URL + brackets) + cursor-reveal | `Decoration.mark` (ViewPlugin) | YES | No | CONFIRMED |
| **Long URL** | `URL` | Mark with `word-break: break-all` | `Decoration.mark` | No | No | INFERRED (unclaimed) |
| **Link-reference inline** | `LinkReference` | Inline mark (like Link) + broken-ref check | `Decoration.mark` + `StateField` for orphan detection | YES for markers | No | INFERRED |
| **Link-reference definition** | `LinkReference` (definition block) | Line-level tint OR fold | `Decoration.line` + optional `foldNodeProp` | No | No | INFERRED |
| **WikiLink** | custom extension | Inline mark with chip styling OR widget replace | `Decoration.mark` OR `Decoration.replace` | YES for brackets | Optional | INFERRED |
| **HardBreak** | `HardBreak` | Inline mark hiding + optional `↵` widget | `Decoration.mark` or `Decoration.widget` | Optional | No | CONFIRMED |

---

## Decision triggers per construct

### When to choose S2 (line-level decoration) over S3 (widget replace)

**Choose S2 when:**
- Content must stay text-visible for source editing (developer-oriented)
- Cell/row/item identity can be preserved via visual grouping (color bands, borders, tint)
- Cursor-mode switching friction is unacceptable
- Collaboration (y-codemirror) with remote cursors should work identically across users

**Choose S3 when:**
- Rendered feel is a product positioning win (Notion/Obsidian-like editing)
- Widget content doesn't require fine-grained editing (e.g., thematic break, task checkbox toggle)
- Cursor-reveal mode is acceptable for editing the construct

### Where cursor-reveal is canonical

- Inline markers on Emphasis/Strong/Link/Code: cursor-reveal is dominant across S3 products
- Block replacements (Table/Blockquote via widget): cursor-reveal is universal
- Heading `#` markers: cursor-reveal in Live Preview products

### Where cursor-reveal is rejected

- Full prose text (never hidden)
- HardBreak trailing spaces (sometimes hidden, sometimes shown as `↵` — product-dependent)
- HTML block content (widget replace with rendered HTML requires sanitization; most products keep as text)

---

## Composition strategy

For a single extensible engine:

1. **ViewPlugin** registers ALL inline-mark + line-level decorations (no height change)
2. **StateField** registers ALL block-replace decorations (height-affecting)
3. Both read a shared `constructRegistry` of configs
4. Each config has: lezer node name(s), decoration kind, class, cursor-reveal flag, wrap-behavior override

This split aligns with Marijn's guidance (ViewPlugin for mark-only, StateField for structure) without requiring per-construct decision making.

---

## Known ecosystem gaps

Patterns that CM6 primitives clearly support but no surveyed product ships as default:

- Depth-aware nested blockquote coloring
- Fenced code language badge
- HTML attribute colorization (Rainbow-HTML technique)
- Broken-link reference indicator for `[text][missing-label]`
- Long-URL `word-break` handling
- Cell-by-cell cursor reveal (within tables or within blockquotes)
- Per-level font-size hierarchy for headings in pure source view
- Thematic break rendered widget (with cursor-reveal)
- YAML fold/collapse in CM6 products (Obsidian has it via plugin; not default)

Each of these is an "unclaimed lane" — technically feasible, not adopted by any surveyed product as default.

---

## Honest calibration

**High confidence:** The CM6 primitive × construct mapping in the matrix above holds. Syntax tree names verified against @lezer/markdown grammar. Primitive suitability matches documented patterns.

**Medium confidence:** "Recommended" primitive choice per construct assumes the Open-Knowledge-like context (developer-editing-source, no horizontal scroll wanted, WYSIWYG handled separately). Products with different product positioning may choose differently.

**Unresolved:** SilverBullet, Zettlr, several Obsidian community plugins not deeply inspected; specific behaviors could shift the "X% of surveyed products do Y" claims slightly. The directional pattern holds.
