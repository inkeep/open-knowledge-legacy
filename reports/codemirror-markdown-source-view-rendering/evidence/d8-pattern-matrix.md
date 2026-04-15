# Evidence: D8 — Pattern matrix (synthesis)

**Dimension:** D8 — Synthesized mapping of CM6 primitives × markdown constructs × trade-offs
**Date:** 2026-04-14
**Type:** Orchestrator synthesis. Derived from D1-D7 + D9 evidence files. No new external sources.

---

## Strategy families — names the synthesis uses

From the ecosystem survey (D3, D5, D6), three source-view strategies cover all observed products:

- **S1 — Pure source (text-canonical):** Raw markdown text rendered as-is by CM6. `lineWrapping` on (wrap) or off (horizontal scroll). No decorations for structured constructs. [HedgeDoc, VS Code default, Logseq textarea]
- **S2 — Per-line decoration overlay:** Raw markdown text + `Decoration.line` classes per construct; CSS controls presentation (e.g., `white-space: pre` for table rows to opt them out of editor-wide wrap). No content replacement. [Observed in the pattern literature but no surveyed product does this construct-by-construct — most use S1 or S3]
- **S3 — Live-preview-hybrid (widget-block-replace + cursor-reveal):** `StateField` emitting `Decoration.replace({ widget, block: true })` for structured constructs; guard skips replacement when cursor is inside the range (source reappears for editing). [Obsidian Live Preview, SilverBullet, codemirror-rich-markdoc]

---

## Primitive × Construct × Outcome matrix

For each markdown construct, which CM6 primitive reasonably handles it — and what are the trade-offs?

| Construct | Primitive (best-fit) | Key trade-off | Evidence ref |
|---|---|---|---|
| **Pipe table** (`\| … \| … \|`) — long row | `StateField` + `Decoration.replace({widget, block: true})` OR `Decoration.line` with `white-space: pre` | Widget = rendered preview + reveal-on-cursor (Obsidian/SilverBullet). Line-decoration = text-canonical + no-wrap + horizontal scroll (Obsidian Source Mode). Widget loses "edit where you read"; line-decoration keeps full editability | D4, D3, D5 |
| **Fenced code block** (```lang … ```) | `StateField` + `Decoration.replace({widget, block: true})` for syntax-highlighted/rendered preview; OR `Decoration.mark` only for `CodeMark`/`CodeInfo` hiding | Widget = code preview (diagrams, syntax highlight); mark-only = text-canonical with hidden fences when cursor outside | D4 (`richEdit.ts` mark-only for `CodeMark`), D5 (SilverBullet's `IFrameWidget`) |
| **HTML block** (`<div>…</div>`) | `StateField` + `Decoration.replace({widget, block: true})` with iframe or sanitized HTML | Security: must sanitize. Obsidian renders HTML in reading view but not live preview | — |
| **Frontmatter** (`---\n…\n---`) | `StateField` + `Decoration.replace({widget, block: true})` for styled form-like rendering; OR `Decoration.line` with custom class for styled text view | Common convention: separate styled line-decoration family (SilverBullet pattern) | D5 |
| **Long prose paragraph** (~several hundred chars) | `EditorView.lineWrapping` | Soft-wrap is appropriate; no widget needed. The pathology is specific to structured-line formats (tables), not prose | D2 |
| **Task list** (`- [ ] item`) | `Decoration.replace` with `ignoreEvent: false` on the `[ ]` → `<input type="checkbox">` | Small inline widget; preserves line-wrap; widely used in markdown editors | — |
| **Inline emphasis/strong/link** (`**bold**`, `[text](url)`) | `Decoration.mark` with cursor-reveal guard | Hide `**`/`*`/`[]()` markers via CSS when cursor outside the enclosing node (`richEdit.ts` pattern) | D4 |
| **Wiki link** (`[[page]]`) | `Decoration.mark` (class for styling + click handler) OR `Decoration.replace` (render as chip) | Mark = editable inline; replace = non-editable chip | — |

---

## When each strategy family makes sense

| Strategy | Best when | Trade-off |
|---|---|---|
| **S1 — Pure source** | Technical writers/developers who want to see exact markdown source; minimal surprise; maximum editability | Long table rows soft-wrap catastrophically (the original pathology) OR horizontal scroll required |
| **S2 — Per-line decoration overlay** | Want to preserve source editing but visually tame specific line types (e.g., tables unwrap per-line while prose still wraps) | Does not "render" anything; just alters presentation of raw text; limited user-visible improvement |
| **S3 — Live-preview-hybrid** | Want WYSIWYG-like editing feel while keeping markdown-text canonical storage; willing to accept cursor-entry edit mode | Complexity: StateField + cursor guard + widget; cursor entry reveals source (known Obsidian pain point); ~200 lines of plugin code to cover tables + inline marks |

---

## Decision triggers observed in the ecosystem

**Choose S1 when:** text-canonical editing is the product identity (HedgeDoc, code editors, technical writers). Long lines? Horizontal scroll. Wrapping? Editor-wide.

**Choose S2 when:** the problem is narrowly "tables wrap badly" and you want the smallest intervention. `Decoration.line({attrs})` + CSS `white-space: pre` for table-row lines. Zero widget complexity; keeps all source editing in place.

**Choose S3 when:** the product competes on a Notion/Obsidian-like editing feel. Willing to adopt cursor-entry mode-switching and the ~200 LOC recipe (StateField + ViewPlugin for block + inline). Accept the cell-by-cell editing limitation (Obsidian has not shipped this after years of community requests).

---

## Ecosystem adoption at a glance

| Product | Family | Notes |
|---|---|---|
| Obsidian Source Mode | S1 | Wrap intentionally OFF for tables; horizontal scroll |
| Obsidian Live Preview | S3 | Whole-table widget; cursor-entry un-renders entire table |
| SilverBullet | S3 | Widget per construct (table, fenced, frontmatter); line-wrap ON underlying |
| codemirror-rich-markdoc | S3 | Reference implementation; ~200 LOC |
| HedgeDoc | S1 | `lineWrapping: true`, no decorations |
| Zettlr | UNRESOLVED | CM6 migrated; specific handling not inspected |
| VS Code (markdown) | S1 | Monaco, `wordWrap: off` default |
| Foam, Dendron | S1 (host) | Inherit VS Code |
| Logseq | non-CM (textarea) | Out of scope for pattern comparison |

---

## What no surveyed product does

- **No "per-line line-wrap toggle" controlled by syntax node type** — the purest S2 instance (table rows get `white-space: pre`, other lines get `pre-wrap`). CM6 primitives support this trivially (D1 evidence `Decoration.line` + CSS), but no surveyed product exposes it as default. Either they commit to S3 (widget-replace) or leave S1 (full wrap / full no-wrap).
- **No "wrap table rows inside their own constrained box"** — i.e., a table row still visible as text but with its line-height capped and internal scrollbar. Not observed in the surveyed ecosystem.
- **No cell-level cursor-reveal** — Obsidian acknowledged this is the community's most-wanted Live Preview improvement; not shipped.

---

## Gaps

- S2 (per-line decoration overlay) is the least-observed family. Worth confirming whether this is a deliberate ecosystem rejection or just unexplored territory. Follow-up: survey Obsidian community plugins for a "table lines: pre" CSS-snippet approach.
- S3's "~200 LOC" claim comes from counting `codemirror-rich-markdoc` files (`richEdit.ts` 74 lines + `renderBlock.ts` 114 lines = 188 lines) — a specific reference, not a universal estimate. More elaborate widgets (interactive cells, drag handles) would cost more.
