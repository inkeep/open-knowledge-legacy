---
title: "Markdown Source-View Per-Construct Rendering: Evidence Playbook"
description: "For every non-MDX markdown construct Open Knowledge supports (blockquote, code, thematicBreak, list/listItem, html block, yaml frontmatter, definition, heading, inline marks including emphasis/strong/delete/highlight, inlineCode, link/image/linkReference, wikiLink, hardBreak), catalog what CM6 primitives + @lezer/markdown node types apply, what OSS markdown source editors and key competitors (Obsidian Source + Live Preview, SilverBullet, codemirror-rich-markdoc, HedgeDoc, Zettlr, VS Code, Typora, MDXEditor, Marktext, Milkdown, HackMD, Foam, Dendron) actually do, and where the ecosystem's unclaimed lanes are."
createdAt: 2026-04-14
updatedAt: 2026-04-14
subjects:
  - CodeMirror 6
  - "@lezer/markdown"
  - "@codemirror/lang-markdown"
  - Obsidian
  - SilverBullet
  - codemirror-rich-markdoc
  - HedgeDoc
  - Zettlr
  - VS Code
  - Typora
  - MDXEditor
  - Marktext
  - Milkdown
  - HackMD
  - Foam
  - Dendron
  - Markdoc
topics:
  - markdown source view
  - CodeMirror primitives
  - per-construct decoration
  - line decoration
  - widget replace
  - cursor reveal
  - block widgets
  - atomic ranges
  - syntax tree traversal
  - ecosystem comparison
---

# Markdown Source-View Per-Construct Rendering: Evidence Playbook

**Purpose:** For every non-MDX markdown construct Open Knowledge supports, enumerate (a) what's technically possible with the CM6 + `@lezer/markdown` stack, (b) what OSS markdown source editors and key competitors do in practice, (c) where ecosystem gaps are. Structured as an implementation-ready playbook that a downstream spec consumes alongside the prior `codemirror-markdown-source-view-rendering` report (CM6 primitives + table case study).

---

## Executive Summary

Three strategy families from the prior report cover every construct surveyed:
- **S1 — Pure source:** plain text + syntax coloring only
- **S2 — Per-line decoration overlay:** `Decoration.line` + `Decoration.mark` + CSS, source stays visible
- **S3 — Live-preview-hybrid:** `StateField` + `Decoration.replace` with block widgets, cursor-reveal on entry

For ~17 non-MDX constructs (9 block + 8+ inline; some variants like "long URL" and "HTML attribute colorization" are treated as sub-patterns in D13, not separate constructs), the surveyed ecosystem clusters into two camps:

- **Text-canonical camp** (HedgeDoc, VS Code, Zettlr, Obsidian Source Mode, Lapce, Helix) — S1 baseline, minimal decoration
- **Live-preview-hybrid camp** (Obsidian Live Preview, SilverBullet, codemirror-rich-markdoc, Typora, MDXEditor, Milkdown) — S3 with widget replacement + cursor-reveal

**Middle ground (S2 — text-visible + construct polish via per-line decoration) remains ecosystem-wide unclaimed as a default positioning.** Individual components (border-left on blockquotes, line-tint for frontmatter, hanging-indent for list items, per-line no-wrap for code) are widely-used OSS techniques. Composing them under one declarative engine for the whole construct set = unexplored.

**Load-bearing maintainer rule** (from prior report): Block-level decorations (those affecting vertical structure) MUST come from `StateField`, not `ViewPlugin`. `Decoration.line` (zero-height, class only) and `Decoration.mark` (inline) are safe in ViewPlugin. This architectural split is load-bearing for any per-construct engine.

**Key findings:**

- **No surveyed product ships a declarative-registry-based per-construct engine.** Each product hand-codes per-construct logic in separate files (SilverBullet's `table.ts` + `fenced_code.ts` + `frontmatter.ts`; codemirror-rich-markdoc's `richEdit.ts` + `renderBlock.ts`). A shared registry is an ecosystem-wide lane that nobody's claimed.

- **The cursor-reveal guard (`if (cursor.from >= node.from && cursor.to <= node.to) return false`) is the canonical primitive** across every S3 surveyed product. One-line pattern; ~200 LOC total for a full Obsidian-like polish layer (per codemirror-rich-markdoc).

- **`@lezer/markdown` GFM extension provides `Table`, `TableRow`, `TableCell`, `TableMarker`, `Strikethrough`, `TaskMarker` nodes.** Standard markdown grammar provides `Blockquote`, `ATXHeading1`–`6`, `FencedCode`, `CodeMark`, `CodeInfo`, `CodeText`, `InlineCode`, `Emphasis`, `StrongEmphasis`, `Link`, `Image`, `LinkReference`, `ImageReference`, `URL`, `LinkMark`, `HorizontalRule`, `BulletList`, `OrderedList`, `ListItem`, `ListMark`, `HTMLBlock`, `HardBreak`, `HeaderMark`, `EmphasisMark`, `StrongMark`, `CodeMark`. **Frontmatter and WikiLink require custom grammar extensions** (not in base lezer-markdown).

- **Nine unclaimed lanes** across the surveyed ecosystem — patterns that CM6 primitives clearly support but no product ships as default. These are documented per construct.

- **Known nesting bugs in Obsidian Live Preview** (lists-in-blockquotes #30849, nested-blockquotes #95349) suggest even mature S3 products have composition edge cases. CM6's decoration model composes cleanly at the primitive level; the bugs appear to be at the widget-level (Obsidian's specific widget implementation).

---

## Research Rubric

**Primary question:** For each non-MDX supported construct in source view: what CM6 primitive combination handles it, what do surveyed OSS/competitor editors actually do, what's the pattern family, and where are the unexplored gaps?

**Stance:** Factual 3P survey with synthesis pattern matrix. No recommendations for Open Knowledge — downstream spec picks and applies. (A follow-up analysis step, explicitly requested by user, will do the 1P recommendation work.)

### Dimensions

| # | Dimension | Priority | Depth |
|---|---|---|---|
| D1 | Framework integration (single extensible engine) | P0 | Moderate |
| D2 | blockquote | P0 | Deep |
| D3 | code fenced + inlineCode | P0 | Deep |
| D4 | list / listItem (incl. task) | P0 | Deep |
| D5 | html block | P0 | Deep |
| D6 | yaml frontmatter | P1 | Moderate |
| D7 | heading | P1 | Moderate |
| D8 | thematicBreak | P2 | Light |
| D9 | link / image / linkReference / definition | P1 | Moderate |
| D10 | inline marks (emphasis, strong, delete, highlight, wikiLink, hardBreak) | P0 | Moderate |
| D11 | composition / nesting | P1 | Moderate |
| D12 | 3P competitor matrix | P0 | Synthesis |
| D13 | per-construct primitive stack | P0 | Synthesis |

**Non-goals:** MDX constructs (user directive); `table` (prior report); math / footnotes / alerts (unsupported per CLAUDE.md §NG3); WYSIWYG rendering, CRDT mechanics, source-toggle UX (prior reports); 1P Open Knowledge analysis; authoring-syntax extensions.

---

## Detailed Findings

### D1 — Framework integration

**Finding:** A single declarative construct-registry engine is technically clean but absent from surveyed products. Each OSS product hand-codes per-construct logic in separate files.

**Evidence:** [evidence/d1-framework.md](evidence/d1-framework.md)

Sketch:

```ts
type ConstructConfig = {
  nodeName?: string;           // @lezer/markdown node to match
  kind: 'line' | 'mark' | 'replace-block' | 'widget-insert';
  class?: string;
  widget?: WidgetType;
  cursorReveal?: boolean;
  wrapBehavior?: 'inherit' | 'pre' | 'pre-wrap';
  atomic?: boolean;
};
const constructRegistry: ConstructConfig[] = [...];
```

Add-a-construct = one registry entry + one CSS rule. The `kind` field selects ViewPlugin vs. StateField path (load-bearing per Marijn's rule). Compartment wraps the engine for user-toggle off.

**Implications:** Novel territory; no direct precedent. Shared-computation / per-surface-rendering principle (CLAUDE.md §4) naturally extends from source view to TipTap WYSIWYG if the registry's detection logic lives in one module.

---

### D2 — blockquote

**Finding:** Universal pattern is `Decoration.line` with border-left + background tint. Nested-depth visual cues (color ramp, depth-indexed padding) not shipped as default anywhere. codemirror-rich-markdoc uses widget-replace-with-cursor-reveal for the whole blockquote.

**Evidence:** [evidence/d2-blockquote.md](evidence/d2-blockquote.md)

Products:
- **Obsidian Source Mode:** markers visible, minimal decoration
- **Obsidian Live Preview:** widget-replace (with known nested-blockquote bug #95349)
- **SilverBullet:** likely line-level decoration; specifics unresolved
- **codemirror-rich-markdoc:** block widget replace with cursor-reveal (T1 source-verified at `/tmp/cm-rich-markdoc/src/renderBlock.ts`)
- **VS Code:** syntax coloring only; no line-level decoration
- **Typora / Marktext / MDXEditor:** rendered in WYSIWYG view

**Unclaimed lanes:** depth-aware nested-blockquote visual hierarchy; per-line `cm-blockquote-depth-N` classes.

---

### D3 — fenced code + inline code

**Finding:** For fenced code, per-line `white-space: pre` override to prevent wrap is the canonical S2 treatment. For syntax highlighting inside code, `@codemirror/lang-markdown`'s `markdown({ codeLanguages })` uses `parseMixed` — but must be opt-in. SilverBullet's `IFrameWidget` per code block is the most ambitious pattern observed. Inline code gets standard `Decoration.mark` with monospace + background; long-inline-code wrap handling is ecosystem-wide unclaimed.

**Evidence:** [evidence/d3-code-and-inline-code.md](evidence/d3-code-and-inline-code.md)

Products:
- **VS Code:** `editor.wordWrap` applies globally; syntax highlighting via TextMate nested scopes
- **Obsidian:** Live Preview renders code with Prism/Shiki syntax highlighting
- **SilverBullet:** `client/codemirror/fenced_code.ts` uses `IFrameWidget` — sandbox CM6 per code block
- **codemirror-rich-markdoc:** `decorationCode` class on both `FencedCode` AND `InlineCode` (same class)

**Unclaimed lanes:** fenced code language label/badge widget; `word-break: break-all` strategy for long inline code.

---

### D4 — list / listItem

**Finding:** Hanging indent via `text-indent + padding-left` is well-known CSS, rarely shipped as default in source view. `Decoration.line` with per-depth class scales via syntax-tree ancestor walk. Task checkboxes become interactive via `Decoration.replace` + `<input type=checkbox>` widget — present in WYSIWYG products (Obsidian LP, MDXEditor, Milkdown), absent from CM6 source-view products.

**Evidence:** [evidence/d4-list-and-listitem.md](evidence/d4-list-and-listitem.md)

Products:
- **Obsidian Source Mode:** markers visible, no hanging indent
- **Obsidian Live Preview:** renders `<ul>`/`<ol>`, interactive checkboxes (known list-in-blockquote bug #30849, code-block-in-list #31352)
- **VS Code + Markdown All in One:** keyboard-driven depth management (Tab/Backspace); no hanging indent; no interactive checkbox in source
- **codemirror-rich-markdoc:** `decorationBullet` class on `ListMark` with positional cursor-reveal guard (T1)
- **MDXEditor:** full interactive task items in rich-text; source toggle = plain
- **Typora / Marktext:** rendered in WYSIWYG

**Unclaimed lanes:** Hanging indent as default across CM6 products; interactive task checkbox in CM6 source view (vs. Live Preview only).

---

### D5 — html block

**Finding:** HTML blocks are treated as plain text with TextMate syntax coloring across surveyed products. Four primitive options: line-tint only (safe, S2), attribute colorization via MatchDecorator (Rainbow-HTML — unclaimed), nested HTML parser via `parseCode({ htmlParser })` (semantic), or widget-replace with sanitized HTML (unsafe without DOMPurify).

**Evidence:** [evidence/d5-html-block.md](evidence/d5-html-block.md)

**Unclaimed lane:** HTML attribute colorization (direct Rainbow-CSV technique transfer); no surveyed product ships this. Technique is proven (~2M+ Rainbow CSV installs for CSV domain) and transfers cleanly.

---

### D6 — yaml frontmatter

**Finding:** `@lezer/markdown` doesn't include frontmatter parser by default — requires custom grammar extension or higher-level integration. SilverBullet's `frontmatter.ts` is the cleanest observed pattern (line-tint + clickable link widgets for URL-like fields). Obsidian has a "Properties panel" in Live Preview replacing raw YAML with typed fields — distinct UX direction. YAML fold/collapse is Obsidian plugin territory, not shipped default anywhere in CM6 products.

**Evidence:** [evidence/d6-yaml-frontmatter.md](evidence/d6-yaml-frontmatter.md)

**Unclaimed lanes:** YAML fold/collapse as CM6 default; nested YAML syntax highlighting via `parseCode` integration; "Properties panel" UX equivalent in OSS.

---

### D7 — heading

**Finding:** Per-level font-size hierarchy in source view is rare — Obsidian Live Preview has it, most others don't. `HeaderMark` cursor-reveal (hide `#` when cursor outside) is standard across S3 products. Setext headings (underline form) under-documented everywhere.

**Evidence:** [evidence/d7-heading.md](evidence/d7-heading.md)

**Unclaimed lanes:** Per-level font-size hierarchy as default in source-view (not Live Preview) CM6 products; Setext heading distinct styling.

---

### D8 — thematicBreak

**Finding:** Mostly plain-text across ecosystem. SilverBullet applies per-line CSS (border-bottom likely); Obsidian Live Preview widget-replaces. No surveyed product uses a full `<hr>` widget replace + cursor-reveal as default in source view.

**Evidence:** [evidence/d8-thematic-break.md](evidence/d8-thematic-break.md)

**Unclaimed lane:** `<hr>` widget replace in source view (low-value-add — `---` is already unambiguous in source).

---

### D9 — link / image / linkReference / definition

**Finding:** Link text + URL hiding (cursor-reveal) is canonical across S3 products. Long-URL `word-break: break-all` handling is unclaimed. Broken-reference detection (cross-scanning `LinkReference` against `LinkReferenceDefinition`) not shipped anywhere. Image inline thumbnails in pure source mode absent across CM6 products; Obsidian Live Preview has them.

**Evidence:** [evidence/d9-link-image-definition.md](evidence/d9-link-image-definition.md)

**Unclaimed lanes:** broken-link-reference indicator; long-URL word-break strategy; image inline thumbnails in source view (Live Preview territory only).

---

### D10 — inline marks

**Finding:** Cursor-reveal for markers (`*`, `**`, `` ` ``, `[`, `]`, `(`, `)`) is the dominant pattern among S3 products. codemirror-rich-markdoc's `tokenHidden` list defines the canonical set: `HardBreak`, `LinkMark`, `EmphasisMark`, `CodeMark`, `CodeInfo`, `URL`. Notably absent: `Strikethrough` markers (`~~`), `Highlight` (`==`, may not parse), `WikiLink` brackets (requires custom extension). Baseline products (HedgeDoc, VS Code) leave markers always visible — a legitimate choice for developer-source identity.

**Evidence:** [evidence/d10-inline-marks.md](evidence/d10-inline-marks.md)

**Unclaimed lanes:** strikethrough-marker hiding as canonical; highlight-mark parsing + hiding; wikilink widget vs. mark trade-off documentation.

---

### D11 — composition / nesting

**Finding:** CM6's `Decoration.line` composes via CSS class merging — multiple per-line classes stack cleanly. Known Obsidian Live Preview bugs in nested constructs (#30849 lists-in-quote, #95349 nested blockquote) suggest widget-level rendering is the fragile layer, not CM6's primitive composition. codemirror-rich-markdoc replaces the outermost construct; nested content appears as source inside the replaced widget's HTML.

**Evidence:** [evidence/d11-composition-nesting.md](evidence/d11-composition-nesting.md)

**Unclaimed lane:** cursor-reveal at nested-construct granularity (cursor entering inner table within blockquote reveals only the table's source); universally whole-enclosing-construct reveal across surveyed products.

---

### D12 — competitor matrix

**Finding:** Per-construct × per-product matrix populated. Ecosystem polarizes into text-canonical (S1) and rendered-hybrid (S3) camps, with S2 middle ground unclaimed as a default positioning.

**Evidence:** [evidence/d12-competitor-matrix.md](evidence/d12-competitor-matrix.md)

Key cross-cuts:
- **What no product does:** depth-aware blockquote hierarchy; cell-level table reveal; interactive task checkbox in CM6 source view; HTML attribute colorization; fenced code language badge; broken-reference indicator; long-URL word-break; image inline in pure source; YAML fold in CM6 products.
- **What multiple products converge on:** cursor-reveal for inline marks; widget-block-replace for tables + blockquotes; blockquote border-left + tint; list marker hiding in rendered modes.

---

### D13 — per-construct primitive stack

**Finding:** Each construct maps to a specific CM6 primitive recipe — `Decoration.line` (for line-level container styling), `Decoration.mark` (for inline marker hiding + styling), `Decoration.replace` in a `StateField` (for block widgets), `Decoration.widget` (for ancillary inserts like checkboxes).

**Evidence:** [evidence/d13-pattern-matrix.md](evidence/d13-pattern-matrix.md) — full matrix of 18 construct-rows × primitive + cursor-reveal + atomic + evidence-tier columns.

---

## Cross-cutting summary

### Ten unclaimed lanes

Patterns that CM6 primitives support but no surveyed product ships as default:

1. **Depth-aware nested blockquote hierarchy** (per-depth color/padding classes)
2. **Fenced code language label widget** (small badge near opening fence)
3. **HTML attribute colorization** (Rainbow-HTML — direct Rainbow-CSV technique transfer)
4. **YAML fold/collapse** in CM6 products (Obsidian plugin territory only)
5. **Per-level heading font-size hierarchy** as default in source view
6. **Thematic break `<hr>` widget replace** (low value-add, explains absence)
7. **Broken-link-reference indicator** for `[text][missing-label]`
8. **Long-URL `word-break: break-all`** strategy
9. **Image inline thumbnails** in pure source view (Live Preview only)
10. **Cell-by-cell cursor reveal** within tables or within blockquotes (Obsidian's most-requested feature; all surveyed S3 products reveal the whole enclosing construct, not inner regions)

Each is technically feasible; adoption as default is zero. Some (Rainbow-HTML, broken-reference indicator) have strong precedent from adjacent domains (Rainbow CSV, LSP diagnostics). Others (heading size hierarchy, image thumbnails) have weak precedent because they blur S1/S3 boundaries.

### Architectural observations

- **The S2 middle ground** (text-visible + construct polish via per-line decoration) is latent across every construct: technique is clear, CM6 primitives support it, Rainbow CSV proves the aesthetic works. No surveyed product commits to S2 as product positioning. Products either stay S1 (text-canonical minimalism) or escalate to S3 (rendered-hybrid).

- **Nested composition bugs in S3** (Obsidian LP) suggest widget-based rendering scales poorly with nesting. S2 decorations compose via CSS class merging — more predictable at nested scale, but provides less "rendered feel."

- **Shared-computation / per-surface-rendering principle** (CLAUDE.md §4) — not observed in any surveyed product; each product's source-view logic is independent from its WYSIWYG path. An engine that factors detection logic shared between SourceEditor + TiptapEditor would be novel.

---

## Limitations & Open Questions

### Dimensions with incomplete coverage

- **SilverBullet:** several per-construct specifics unresolved at this pass (blockquote details, frontmatter exact CSS, thematicBreak mechanism). Would require deeper source inspection.
- **Zettlr:** CM6 migration is done; per-construct decoration details not confirmed.
- **Obsidian internals:** closed app; community plugin behavior used as proxy (T2).
- **Lapce / Helix:** quick-survey only; not deeply inspected.
- **HackMD:** inferred from HedgeDoc sibling; not deeply inspected.

### Performance

- No published benchmarks for 100+ simultaneous per-construct decorations
- Viewport-culling design suggests linear scaling; not verified empirically

### Unverified node-name claims

- `Highlight` (`==x==`) not confirmed in standard `@lezer/markdown` grammar; requires custom extension
- `WikiLink` confirmed absent from standard grammar
- Exact GFM extension opt-in semantics for `Strikethrough`, `TaskMarker`, autolinks — verified in `@lezer/markdown` README but not tested against every surveyed product

---

## References

### Evidence files

- [evidence/d1-framework.md](evidence/d1-framework.md)
- [evidence/d2-blockquote.md](evidence/d2-blockquote.md)
- [evidence/d3-code-and-inline-code.md](evidence/d3-code-and-inline-code.md)
- [evidence/d4-list-and-listitem.md](evidence/d4-list-and-listitem.md)
- [evidence/d5-html-block.md](evidence/d5-html-block.md)
- [evidence/d6-yaml-frontmatter.md](evidence/d6-yaml-frontmatter.md)
- [evidence/d7-heading.md](evidence/d7-heading.md)
- [evidence/d8-thematic-break.md](evidence/d8-thematic-break.md)
- [evidence/d9-link-image-definition.md](evidence/d9-link-image-definition.md)
- [evidence/d10-inline-marks.md](evidence/d10-inline-marks.md)
- [evidence/d11-composition-nesting.md](evidence/d11-composition-nesting.md)
- [evidence/d12-competitor-matrix.md](evidence/d12-competitor-matrix.md)
- [evidence/d13-pattern-matrix.md](evidence/d13-pattern-matrix.md)

### External sources

- [CodeMirror 6 reference manual](https://codemirror.net/docs/ref/)
- [CodeMirror decoration examples](https://codemirror.net/examples/decoration/)
- [@lezer/markdown grammar + node types](https://github.com/lezer-parser/markdown)
- [@codemirror/lang-markdown](https://github.com/codemirror/lang-markdown) — `parseCode({ codeLanguages })`
- [segphault/codemirror-rich-markdoc](https://github.com/segphault/codemirror-rich-markdoc) — reference S3 implementation
- [Obsidian developer docs — editor](https://docs.obsidian.md/Plugins/Editor)
- [Obsidian forum — nested blockquote bugs #95349](https://forum.obsidian.md/t/nested-quotation-blocks-are-incorrectly-rendered-in-editor-live-preview/95349)
- [Obsidian forum — lists in quote blocks #30849](https://forum.obsidian.md/t/live-preview-support-lists-in-quote-blocks/30849)
- [Obsidian forum — code blocks in lists #31352](https://forum.obsidian.md/t/live-preview-better-support-of-code-blocks-in-lists/31352)
- [Markdown All in One — list handling](https://markdown-all-in-one.github.io/docs/guide/list.html)
- [GitHub GFM task lists spec](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/about-task-lists)
- [markdown-it-task-checkbox](https://github.com/linsir/markdown-it-task-checkbox) — widget pattern
- [SilverBullet](https://github.com/silverbulletmd/silverbullet)
- [HedgeDoc](https://github.com/hedgedoc/hedgedoc)
- [Zettlr](https://github.com/Zettlr/Zettlr)
- [MDXEditor](https://mdxeditor.dev/)
- [Typora markdown reference](https://support.typora.io/Markdown-Reference/)

### Related research

- [reports/codemirror-markdown-source-view-rendering/](../codemirror-markdown-source-view-rendering/) — CM6 primitives inventory, maintainer guidance, table case study, S1/S2/S3 taxonomy
- [reports/markdown-table-rendering-in-prose-columns/](../markdown-table-rendering-in-prose-columns/) — WYSIWYG-side (rendered) table strategies
- [reports/mdx-text-editor-preview-approach/](../mdx-text-editor-preview-approach/) — architectural priors on text+preview vs WYSIWYG; covers CM6 decoration ceiling for MDX
- [reports/source-toggle-architecture/](../source-toggle-architecture/) — WYSIWYG ↔ source toggle mechanism
- [reports/yjs-constrained-observer-sync/](../yjs-constrained-observer-sync/) — y-codemirror.next integration mechanics
