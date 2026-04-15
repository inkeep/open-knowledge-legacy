---
title: "CodeMirror Markdown Source-View Rendering: Primitives, Patterns, and Ecosystem Practice"
description: "How CodeMirror 6-based markdown source editors handle long logical lines (pipe table rows, fenced code blocks, HTML blocks, frontmatter) — what primitives CM6 exposes, what products do in practice, what maintainers and authoritative sources recommend. Covers Obsidian Source Mode & Live Preview, SilverBullet, codemirror-rich-markdoc, Zettlr, HedgeDoc, VS Code markdown, Foam, Dendron, TipTap ecosystem stance, and the CM6 primitive inventory (Decoration.line, Decoration.replace + WidgetType, StateField vs ViewPlugin, atomic ranges, syntaxTree + @lezer/markdown, Compartment). Tables are the motivating case; the report generalizes to the class."
createdAt: 2026-04-14
updatedAt: 2026-04-14
subjects:
  - CodeMirror 6
  - Obsidian
  - SilverBullet
  - codemirror-rich-markdoc
  - Zettlr
  - HedgeDoc
  - Logseq
  - VS Code
  - Foam
  - Dendron
  - TipTap
  - "@lezer/markdown"
  - "@codemirror/lang-markdown"
  - "y-codemirror.next"
  - Markdoc
topics:
  - CodeMirror 6 primitives
  - line wrapping
  - decorations
  - block widgets
  - atomic ranges
  - syntax tree traversal
  - live preview pattern
  - markdown source view
  - long-line rendering
  - state field vs view plugin
---

# CodeMirror Markdown Source-View Rendering: Primitives, Patterns, and Ecosystem Practice

**Purpose:** Map how CodeMirror 6-based markdown source editors handle the pathology where a single ~3000-char logical line (e.g., a pipe-table row) soft-wraps to many visual lines. Tables are the motivating case; the report generalizes to the class — fenced code, HTML blocks, frontmatter, long paragraphs. The reader is designing a source-view rendering strategy and needs the CM6 primitive landscape, ecosystem patterns, and known trade-offs.

---

## Executive Summary

Three source-view strategies account for every surveyed product:

- **S1 — Pure source.** Raw markdown text; `lineWrapping` on or off; no per-construct decorations. Long table rows either soft-wrap catastrophically or require horizontal scroll. [HedgeDoc, VS Code default, Obsidian Source Mode, Foam, Dendron]
- **S2 — Per-line decoration overlay.** Raw text + `Decoration.line` classes that apply CSS per construct (e.g., `white-space: pre` on table rows to opt them out of editor-wide wrap). CM6 primitives support this directly but **no surveyed product ships it as a default** — it's latent ecosystem capacity, not adopted practice.
- **S3 — Live-preview-hybrid.** A `StateField` emits `Decoration.replace({ widget, block: true })` for structured constructs; a one-line cursor guard (`if (cursor inside node) return false`) reveals the source when editing. [Obsidian Live Preview, SilverBullet, codemirror-rich-markdoc]

**The CM6 primitives for S3 are ~200 lines of code.** The canonical reference — [segphault/codemirror-rich-markdoc](https://github.com/segphault/codemirror-rich-markdoc) — splits into `richEdit.ts` (74 lines, ViewPlugin for inline marks) + `renderBlock.ts` (114 lines, StateField for block replace). Both rely on `syntaxTree()` + `@lezer/markdown` node names (`Table`, `Blockquote`, `FencedCode`) and the cursor-range-overlap guard.

**Maintainer rule (Marijn Haverbeke, discuss.codemirror.net):** *"You have to provide your decorations from a state field, not a view plugin, if they are able to change the vertical structure of the editor content."* Block widgets → StateField. Inline marks → ViewPlugin. Structurally load-bearing; mixing these is a known footgun.

**Key Findings:**

- **Obsidian uses whole-table widget replacement** (not per-row or per-cell) in Live Preview; cursor entry un-renders the entire table and exposes raw markdown. Community has requested cell-by-cell editing for years; Obsidian team acknowledged but not shipped. In Source Mode, table-row line-wrap is **disabled by design** — tables horizontal-scroll.
- **SilverBullet is the cleanest OSS reference implementation** of S3 across multiple constructs: tables, fenced code, frontmatter each get their own widget.
- **CM6 has no per-line line-wrap toggle in core.** Marijn declined to add one; the recommended path is either (a) custom `<br/>` widget insertion, (b) `Decoration.line` with `white-space: pre`, or (c) `Decoration.replace` with a widget.
- **No virtualization of soft-wrapped lines.** A 3000-char line wrapping to 37 visual lines renders all 37 lines' DOM height. Viewport culling is at the logical-line granularity.
- **TipTap publishes no source-view guidance.** Dual-mode (WYSIWYG + CM source) is community territory; there is no official `@tiptap/codemirror` integration or best-practice doc.
- **y-codemirror.next is compatible with S3.** Decorations and widgets are view-layer; Yjs syncs Y.Text only. Two peers with different decoration configs still sync fine.
- **Known edge cases:** decoration spans alter browser line-break points (codemirror/dev#800, Chrome/Safari, no fix shipped); block widget cursor navigation at `side: 1` had bugs historically (fixed v6.39.4); atomic ranges only work with a keymap; cursor-trapped-in-atomic-range fixed in recent CM6.

---

## Research Rubric

**Primary question:** When a markdown source view uses CodeMirror 6 and contains a logical line much longer than the wrap width, what patterns do ecosystem products use, what primitives does CodeMirror 6 expose, and which combinations do maintainers and authoritative sources recommend?

**Stance:** Factual 3P survey with synthesis (pattern matrix). No recommendations for Open Knowledge.

| # | Dimension | Priority | Depth |
|---|---|---|---|
| D1 | CodeMirror 6 primitive inventory | P0 | Deep |
| D2 | Authoritative CM6 guidance | P0 | Moderate |
| D3 | Obsidian Source Mode & Live Preview | P0 | Deep |
| D4 | codemirror-rich-markdoc deep dive | P0 | Deep |
| D5 | SilverBullet | P0 | Moderate |
| D6 | Other CM-based editors (Zettlr, HedgeDoc, Logseq, VS Code, Foam, Dendron) | P1 | Moderate |
| D7 | TipTap ecosystem stance | P1 | Light |
| D8 | Pattern matrix — primitive × construct × trade-off | P0 | Synthesis |
| D9 | Known failure modes & edge cases | P1 | Moderate |

**Non-goals:** MDX-specific editor concerns (→ `mdx-text-editor-preview-approach/`); WYSIWYG table CSS (→ `markdown-table-rendering-in-prose-columns/`); CRDT mechanics beyond compatibility notes (→ `yjs-constrained-observer-sync/`); source-toggle UX (→ `source-toggle-architecture/`); data-table features; markdown-syntax extensions for author-side hints; 1P analysis of Open Knowledge.

---

## Detailed Findings

### D1 + D2 — CM6 primitives and authoritative guidance

**Finding:** CM6 exposes a rich decoration/widget system whose capabilities fall into five families; maintainer guidance on discuss.codemirror.net prescribes specific combinations.

**Evidence:** [evidence/d1-d2-codemirror-primitives-and-guidance.md](evidence/d1-d2-codemirror-primitives-and-guidance.md)

**The five primitive families:**

| Family | Members | Suited for |
|---|---|---|
| Line-scope | `Decoration.line({attributes})` | Per-line CSS classes (e.g., `white-space: pre` to un-wrap specific lines) |
| Inline-mark | `Decoration.mark({attributes})` | Inline syntax highlighting, `<span>` decoration of ranges |
| Content-replace | `Decoration.replace({widget, block})` | Hide source, optionally render widget in its place — the core of "live preview" patterns |
| Content-insert | `Decoration.widget({widget, side, block})` | Insert widget without hiding source (images, annotations, block inserts) |
| Structural | `atomicRanges` facet | Make a range cursor-skip-and-delete-as-one |

**Load-bearing maintainer rule:** block-level decorations (anything that affects vertical structure) MUST come from a `StateField`. `ViewPlugin` runs after viewport computation, so height-changing plugins cause layout misalignment. The `richEdit.ts` + `renderBlock.ts` split in codemirror-rich-markdoc follows this rule exactly.

**Syntax-tree navigation:** `syntaxTree(state).iterate({ enter, leave })` with `@lezer/markdown` node names (`Table`, `TableRow`, `TableCell`, `FencedCode`, `HTMLBlock`, `Blockquote`, `Emphasis`, `Link`, `ATXHeading1`–`6`) is the idiomatic way to detect constructs. GFM extension must be enabled for `Table` nodes.

**No per-line line-wrap toggle in core.** Marijn declined this on [discuss.codemirror.net#5125](https://discuss.codemirror.net/t/editor-driven-line-wrapping/5125) ("Editor driven line wrapping"). Three workarounds: custom `<br/>` block widgets at wrap boundaries; `Decoration.line` + CSS `white-space: pre`; `Decoration.replace` with a rendered widget.

**No virtualization of soft-wrapped lines.** Viewport culling is at the logical-line level. A 3000-char line wrapping to 37 visual lines renders the full 37 lines' height into the DOM.

---

### D3 — Obsidian Source Mode & Live Preview

**Finding:** Obsidian's two modes make opposite source-view choices: Source Mode disables line-wrap on tables by design and relies on horizontal scroll; Live Preview replaces each table wholesale with a block widget, exposing source only when cursor enters the table region.

**Evidence:** [evidence/d3-obsidian.md](evidence/d3-obsidian.md)

**Source Mode behavior:**

- Line-wrap **off for table rows** — moderator quote: *"Once you place your cursor inside the table, it's going to not render any parts of that table"* (applies to Live Preview's reveal behavior, but Source Mode also doesn't wrap tables). Design statement from forum moderation: unwrapped preserves row identity.
- Horizontal scrollbar has a long-standing bug where clicks pass through to the editor, forcing touchpad-scrolling.
- Advanced Tables plugin's cell-padding pattern (pad with literal spaces to force monospace alignment) **broke in CM5→CM6 migration** — CM6's view-layer decoration model cannot modify source text.

**Live Preview behavior:**

- Block widget replaces the entire table region with a rendered `<table>`.
- Cursor entering any cell causes the **entire widget to unmount**, exposing raw `|...|` markdown for the whole table.
- Community complaint "tables hard to read": caused by alignment loss, not by widget failure. Users request per-cell reveal; feature request open for years.

**Implications:**

- Obsidian's design is **whole-construct granularity** for cursor reveal. Finer granularity (row, cell) is possible in principle but hasn't been shipped; likely because `@lezer/markdown` emits a `Table` node containing nested `TableRow`/`TableCell`, and Obsidian's implementation appears to match on the outer `Table` node.
- Community-workaround layer is **CSS-only** — users apply snippets targeting `.cm-table-widget` (Live Preview) vs `.markdown-rendered table` (Reading view). No community plugin has re-implemented cell-padding under CM6 constraints.

---

### D4 — codemirror-rich-markdoc deep dive

**Finding:** The repo is the canonical minimal-code reference for the S3 live-preview-hybrid pattern. Two extensions (total ~200 LOC) compose into an Obsidian-equivalent editing experience for tables, blockquotes, and Markdoc tags, with inline-mark hiding for emphasis/link/code.

**Evidence:** [evidence/d4-codemirror-rich-markdoc.md](evidence/d4-codemirror-rich-markdoc.md)

**The recipe** (verified against cloned source at `/tmp/cm-rich-markdoc/src/`):

- **`renderBlock.ts` (StateField, 114 lines):** iterates `syntaxTree`, matches `['Table', 'Blockquote', 'MarkdocTag']`, emits `Decoration.replace({ widget: new RenderBlockWidget(text, config), block: true })`. The cursor-reveal guard is one line: `if (cursor.from >= node.from && cursor.to <= node.to) return false;` — when cursor is inside a block, skip the replacement so the source shows.
- **`richEdit.ts` (ViewPlugin, 74 lines):** iterates `syntaxTree`, emits `Decoration.mark({class: 'cm-markdoc-hidden'})` on inline marks (`EmphasisMark`, `LinkMark`, `CodeMark`, etc.) when the cursor is NOT inside the enclosing `Emphasis`/`Link`/`InlineCode` node.
- **Widget DOM:** `<div contenteditable="false" class="cm-markdoc-renderBlock">` containing rendered HTML. Non-editable; clicks route to the editor; edit happens via source reveal.

**What this tells us:**

- The S3 pattern does NOT require a large custom framework. CM6 core + `@lezer/markdown` grammar cover it.
- The split between `ViewPlugin` (inline marks) and `StateField` (block replace) is the canonical application of Marijn's rule from D2.
- `atomic ranges` are NOT used in this reference — cursor still moves character-by-character over the widget's boundaries. Adding atomicity would be a one-line addition to the StateField's `provide`.

---

### D5 — SilverBullet

**Finding:** SilverBullet is the cleanest production OSS implementation of S3 across multiple markdown constructs — tables, fenced code, frontmatter, horizontal rules, headings, lists — each with its own widget or per-construct line-decoration.

**Evidence:** [evidence/d5-silverbullet.md](evidence/d5-silverbullet.md)

Source files:

- `client/codemirror/editor_state.ts` — editor config with `EditorView.lineWrapping` on
- `client/codemirror/table.ts` — `TableViewWidget` (cursor-aware replace)
- `client/codemirror/line_wrapper.ts` — utility for per-construct CSS class decorations
- `client/codemirror/fenced_code.ts` — `IFrameWidget` for custom code block renderers
- `client/codemirror/frontmatter.ts` — YAML frontmatter styled lines + clickable link widgets

**Implications:**

- The S3 pattern **generalizes beyond tables**. SilverBullet demonstrates it's possible to factor the recipe once and apply it construct-by-construct.
- `EditorView.lineWrapping` stays on for the surrounding prose; widgets handle the structured constructs that would otherwise wrap catastrophically.
- SilverBullet does not use y-codemirror.next (it has its own sync layer), so compatibility between its widgets and CRDT sync is not directly validated for the Yjs ecosystem.

---

### D6 — Other CM-based markdown source editors

**Finding:** Surveyed products split between pure-source (S1) and host-delegated (Monaco). Zettlr is on CM6 but its specific table handling could not be verified from public sources in this pass.

**Evidence:** [evidence/d6-other-cm-editors.md](evidence/d6-other-cm-editors.md)

| Product | Editor | Line-wrap | Decorations | Pattern |
|---|---|---|---|---|
| HedgeDoc | CM5 | on | none | S1 (pure source) |
| Zettlr | CM6 | UNRESOLVED | UNRESOLVED | UNRESOLVED |
| Logseq | `<textarea>` + React | N/A | (React overlays, not CM) | out of scope |
| VS Code (markdown) | Monaco | **off by default** for `.md` | none | S1 (host-default) |
| Foam | Monaco | inherit | none | S1 (host-delegated) |
| Dendron | Monaco | inherit | none | S1 (host-delegated) |

**Implications:**

- VS Code's default — `editor.wordWrap: 'off'` — means the canonical developer experience for editing markdown tables is **horizontal scroll, no wrap, no decoration**. Users opt in via `"[markdown]": { "editor.wordWrap": "on" }`. This is the wide default assumption for the technical audience.
- HedgeDoc's wrap-on pattern is the other canonical baseline: wrap-and-suffer-wrap-pathology. No surveyed CM6 product (other than SilverBullet and the rich-markdoc reference) solves this at the per-construct level.
- Zettlr is a noted gap; CM6 migration is done, table-specific handling could be meaningful prior art. Upgrading this evidence would require direct source inspection.

---

### D7 — TipTap ecosystem stance

**Finding:** No official guidance. TipTap is WYSIWYG-first; source-view pairing is explicitly community territory.

**Evidence:** [evidence/d7-tiptap-stance.md](evidence/d7-tiptap-stance.md)

- No `@tiptap/codemirror` or `@tiptap/source-mode` package.
- [TipTap discussion #5973](https://github.com/ueberdosis/tiptap/discussions/5973) (source code view): community-authored answer, no maintainer prescribed pattern.
- [TipTap discussion #4564](https://github.com/ueberdosis/tiptap/discussions/4564) (CodeMirror pairing): unanswered by maintainers.
- `@tiptap/markdown` exists for storage format (markdown ↔ ProseMirror JSON), not for source editing.
- Ecosystem wrappers (Mantine's `RichTextEditor.SourceCode`) are community projects, not endorsed.

**Implications:** A product pairing TipTap with CM6 source view is architecturally on its own. The TipTap team ships the WYSIWYG layer; everything else — including the table-row-wrap pathology observed in source mode — is the product's engineering problem to solve.

---

### D8 — Pattern matrix (primitive × construct × trade-off)

**Finding:** Three strategy families (S1, S2, S3) cover the space. A per-construct matrix suggests which CM6 primitive to reach for based on which markdown construct is being handled and what editing feel is desired.

**Evidence:** [evidence/d8-pattern-matrix.md](evidence/d8-pattern-matrix.md)

**Primitive × Construct matrix (abbreviated — see evidence for full matrix):**

| Construct | Best-fit primitives | Trade-off |
|---|---|---|
| Pipe table (long row) | `StateField` + `Decoration.replace({widget, block: true})` (S3) OR `Decoration.line` + `white-space: pre` (S2) | Widget = preview + cursor-reveal; line-decoration = text-canonical + horizontal scroll. Widget loses "edit where you read"; line-decoration keeps full editability |
| Fenced code | Same choice: widget (S3) for rendered preview OR mark-only hiding fence markers | Widget = syntax highlight / diagrams; mark-only = source + cursor-reveal of markers |
| HTML block | Widget with sanitized HTML iframe | Security: must sanitize |
| Frontmatter | Widget for styled form view OR line-decoration for colored text | Widget = form UX; line = plaintext styled |
| Long prose paragraph | `EditorView.lineWrapping` (no special handling) | Soft-wrap is appropriate; pathology is specific to structured-line constructs |
| Task list | `Decoration.replace` with `<input type="checkbox">` widget | Small inline widget; preserves line-wrap |
| Inline mark (`**bold**`, `[text](url)`) | `Decoration.mark` hidden with cursor-reveal | Matches Obsidian-style markers-vanish-when-cursor-elsewhere |

**Decision triggers:**

- **S1 (pure source)** when: text-canonical is the product identity; users are technical writers who want exact markdown; complexity budget is zero. Accept: long rows wrap catastrophically OR horizontal scroll.
- **S2 (per-line decoration overlay)** when: the problem is narrowly "tables wrap badly" and you want the smallest intervention. ~20 LOC: a ViewPlugin scans the syntax tree for `TableRow` nodes and emits `Decoration.line` with `cm-nowrap-row` class; one CSS rule. Accept: wrapped text is ugly-but-editable; no rendered-preview feel.
- **S3 (live-preview-hybrid)** when: product competes on Notion/Obsidian editing feel. ~200 LOC: StateField with block widgets + ViewPlugin with inline marks + cursor-reveal guard. Accept: cursor entry disrupts reading by reverting to source (Obsidian's documented pain point); still no per-cell editing.

**What no surveyed product does:**

- **Per-line line-wrap toggle by syntax node type as default.** S2 is trivially implementable with CM6 primitives but no surveyed editor ships it. Either they commit to full S3 (widget-replace) or leave S1 (full wrap / full no-wrap). Whether this is deliberate ecosystem rejection or unexplored territory is an open question.
- **Wrap-table-row-inside-constrained-box** (row still text, but line-height capped, internal scrollbar).
- **Cell-level cursor reveal** — the most-requested Obsidian improvement, not shipped.

---

### D9 — Known failure modes and edge cases

**Finding:** Several historical CM6 issues are relevant to any S3 implementation; most have been fixed, some remain open.

**Evidence:** [evidence/d9-edge-cases.md](evidence/d9-edge-cases.md)

**Open issues:**
- [codemirror/dev#800](https://github.com/codemirror/dev/issues/800) — `Decoration.mark` spans alter browser line-break points on Chrome/Safari. Heavy mark-decoration + `lineWrapping` is known-fragile. No fix shipped.
- No per-line wrap-disable in core (Marijn, not pursued).
- No maintainer-quantified benchmarks for N-hundred block widgets on one document.

**Fixed (by recent CM versions):**
- Block widget `side: 1` navigation bug (fixed v6.39.4)
- Cursor-trapped-in-atomic-range (fixed in recent CM)
- MatchDecorator full-doc recomputation on keystroke (fixed — scoped to viewport)

**Design-level constraints (not bugs):**
- Atomic ranges require a keymap to take effect; cursor motion ignores them otherwise.
- Atomic ranges cannot mix "skip on motion" with "delete character-by-character" (Marijn: "outside of what atomicRanges provides").
- Block widgets must come from StateField, not ViewPlugin.
- Use padding/border inside widgets, NOT CSS margin, to avoid height-calc breakage.

**Collaboration compatibility:**
- `y-codemirror.next` is compatible with CM6 widgets and atomic ranges. Decorations are view-layer; Yjs syncs Y.Text only. Two peers with different decoration configs still sync correctly.
- No documented issues combining widgets + Yjs collaboration.

---

## Limitations & Open Questions

### Dimensions with incomplete coverage

- **Zettlr (D6):** UNRESOLVED — CM6 migration done, but specific table handling not inspected from public source in this pass. Direct clone + grep would resolve.
- **Logseq:** Out of scope — `<textarea>`-based, not a CM primary editor.
- **Obsidian internals:** closed app. All findings about Obsidian's CM6 extensions are T2 (forum/community) or T3 (inferred), not T1 source-level.

### Performance gaps

- No published benchmarks for 100–1000 block widgets on one document. CM6 viewport culling should handle it, but empirical verification is a follow-up probe.
- No quantified cost of `EditorView.lineWrapping` on large documents.

### Ecosystem gaps

- **S2 (per-line decoration overlay) is not shipped by any surveyed product.** Trivially implementable with CM6 primitives. Unexplored territory or deliberate rejection? Follow-up research would resolve.
- **Cell-level cursor reveal** — not shipped by any product. Obsidian's most-requested improvement.

---

## References

### Evidence files

- [evidence/d1-d2-codemirror-primitives-and-guidance.md](evidence/d1-d2-codemirror-primitives-and-guidance.md) — CM6 primitives + maintainer guidance
- [evidence/d3-obsidian.md](evidence/d3-obsidian.md) — Obsidian Source Mode & Live Preview
- [evidence/d4-codemirror-rich-markdoc.md](evidence/d4-codemirror-rich-markdoc.md) — Reference implementation deep dive
- [evidence/d5-silverbullet.md](evidence/d5-silverbullet.md) — SilverBullet multi-construct S3
- [evidence/d6-other-cm-editors.md](evidence/d6-other-cm-editors.md) — HedgeDoc, Zettlr, Logseq, VS Code, Foam, Dendron
- [evidence/d7-tiptap-stance.md](evidence/d7-tiptap-stance.md) — TipTap ecosystem position
- [evidence/d8-pattern-matrix.md](evidence/d8-pattern-matrix.md) — Synthesis matrix
- [evidence/d9-edge-cases.md](evidence/d9-edge-cases.md) — Edge cases, collaboration, performance

### External sources

- [CodeMirror 6 reference manual](https://codemirror.net/docs/ref/)
- [CodeMirror decoration examples](https://codemirror.net/examples/decoration/)
- [CodeMirror zebra-stripes example](https://codemirror.net/examples/zebra/) — per-line decoration
- [CodeMirror huge-doc demo](https://codemirror.net/examples/million/) — viewport culling
- [@lezer/markdown grammar + node names](https://github.com/lezer-parser/markdown)
- [discuss.codemirror.net — How to use line wrapping #4924](https://discuss.codemirror.net/t/how-to-use-line-wrapping-in-codemirror-6/4924)
- [discuss.codemirror.net — Editor driven line wrapping #5125](https://discuss.codemirror.net/t/editor-driven-line-wrapping/5125) — Marijn declines per-line wrap control
- [discuss.codemirror.net — How to replace content with widget #4288](https://discuss.codemirror.net/t/how-to-replace-content-with-widget/4288) — StateField vs ViewPlugin rule
- [discuss.codemirror.net — Positioning block-level widgets #3060](https://discuss.codemirror.net/t/positioning-block-level-widgets/3060) — margin pitfall
- [discuss.codemirror.net — Atomic ranges #8007](https://discuss.codemirror.net/t/im-missing-something-about-how-atomicrange-works/8007)
- [codemirror/dev#800 — Decoration span affects line wrapping](https://github.com/codemirror/dev/issues/800)
- [segphault/codemirror-rich-markdoc](https://github.com/segphault/codemirror-rich-markdoc) — reference implementation
- [Obsidian Live Preview CM6 migration guide](https://obsidian.md/blog/codemirror-6-migration-guide/)
- [Obsidian forum — Better table handling in Live Preview #29079](https://forum.obsidian.md/t/better-table-handling-in-new-live-preview-mode/29079)
- [Obsidian forum — Editing table cell by cell #34110](https://forum.obsidian.md/t/live-preview-support-editing-a-table-cell-by-cell/34110)
- [Obsidian forum — Cursor reveal behavior #57775](https://forum.obsidian.md/t/how-to-make-markdown-syntax-show-when-editing-tables-in-live-preview/57775)
- [SilverBullet source](https://github.com/silverbulletmd/silverbullet)
- [HedgeDoc source](https://github.com/hedgedoc/hedgedoc)
- [VS Code editor defaults](https://github.com/microsoft/vscode/blob/main/src/vs/editor/common/config/editorOptions.ts)
- [TipTap discussion #5973 — Edit source code with tiptap](https://github.com/ueberdosis/tiptap/discussions/5973)
- [y-codemirror.next](https://github.com/yjs/y-codemirror.next)

### Related research

- [reports/mdx-text-editor-preview-approach/](../mdx-text-editor-preview-approach/) — architectural priors on text+preview vs WYSIWYG; covers CM6 decoration ceiling for Notion-grade WYSIWYG; depth on `evaluate()` for MDX in particular
- [reports/markdown-table-rendering-in-prose-columns/](../markdown-table-rendering-in-prose-columns/) — WYSIWYG/rendered table CSS strategies (different problem surface: prose-column width, not source-view wrapping)
- [reports/source-toggle-architecture/](../source-toggle-architecture/) — how to toggle between WYSIWYG and source (orthogonal question to source-view rendering)
- [reports/yjs-constrained-observer-sync/](../yjs-constrained-observer-sync/) — y-codemirror.next integration mechanics
