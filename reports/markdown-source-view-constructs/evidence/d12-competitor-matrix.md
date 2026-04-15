# Evidence: D12 — competitor cross-cut matrix

**Dimension:** D12 — Per-product × per-construct summary matrix
**Date:** 2026-04-14
**Type:** Orchestrator synthesis from D2–D11 findings + prior-report cross-references

---

## Product set

- **Obsidian** (closed; Source Mode + Live Preview surfaces)
- **SilverBullet** (OSS, CM6)
- **HedgeDoc** (OSS, CM5)
- **Zettlr** (OSS, CM6)
- **VS Code + extensions** (Monaco-based)
- **codemirror-rich-markdoc** (OSS, CM6 reference implementation)
- **MDXEditor** (OSS, Lexical)
- **Typora** (closed, WYSIWYG-first)
- **Marktext** (OSS)
- **Milkdown** (OSS, ProseMirror)
- **HackMD** (closed, CM-based)
- **Lapce / Helix** (code-editor-first; baseline comparison)

---

## Construct × Product matrix

Legend:
- ✅ = ships as default
- ◐ = available via plugin/extension but not default
- ○ = plain text / baseline syntax coloring
- ✗ = not supported / known broken
- ? = UNRESOLVED

| Construct → | Obsidian SM | Obsidian LP | SilverBullet | HedgeDoc | Zettlr | VS Code | rich-markdoc | Typora | Marktext | MDXEditor |
|---|---|---|---|---|---|---|---|---|---|---|
| **Blockquote** (border-left) | ○ | ✅ | ? | ○ | ? | ○ | ✅ (widget) | ✅ (rendered) | ✅ (rendered) | ✅ (rendered) |
| **Blockquote depth cue** | ○ | ✗ (bug) | ? | ○ | ? | ○ | ○ | ◐ | ○ | ○ |
| **List hanging indent** | ○ | ✅ (HTML) | ? | ○ | ? | ○ | ○ | ✅ (rendered) | ✅ (rendered) | ✅ (rendered) |
| **List marker hiding** | ○ | ✅ | ? | ○ | ? | ○ | ✅ | ✅ (rendered) | ✅ (rendered) | ✅ (rendered) |
| **Task checkbox interactive** | ○ | ✅ | ? | ○ | ? | ○ | ○ | ✅ | ✅ | ✅ |
| **Fenced code no-wrap** | ○ | ◐ (widget) | ◐ (iframe) | ○ | ? | ○ (user config) | ◐ (decoration class) | ✅ | ○ | ✅ |
| **Fenced code syntax hl** | ✅ (coloring) | ✅ | ✅ | ✅ | ✅ | ✅ | ○ | ✅ | ✅ | ✅ |
| **Fenced code language label** | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| **Inline code style** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **HTML block attr colorization** | ○ | ○ | ? | ○ | ? | ○ | ○ | ○ | ○ | ○ |
| **HTML block rendering** | ○ | ✅ (sanitized) | ? | ○ | ? | ○ | ○ | ✅ | ✅ | ✅ |
| **YAML frontmatter tint** | ◐ | ✅ (properties panel) | ✅ | ○ | ? | ○ | ○ | ○ | ○ | ○ |
| **YAML syntax highlighting** | ◐ | ○ | ◐ | ○ | ? | ✅ (via LSP) | ○ | ○ | ○ | ○ |
| **YAML fold / collapse** | ◐ | ○ | ? | ○ | ? | ✅ (generic fold) | ○ | ○ | ○ | ○ |
| **Heading size hierarchy (source)** | ○ | ✅ | ? | ○ | ? | ○ | ○ | ✅ (WYSIWYG) | ✅ (rendered) | ✅ (rendered) |
| **Heading `#` marker hiding** | ○ | ✅ | ? | ○ | ? | ○ | ✅ | ✅ (rendered) | ✅ (rendered) | ✅ (rendered) |
| **Thematic break styled** | ○ | ✅ (widget) | ✅ (CSS) | ○ | ? | ○ | ○ | ✅ (rendered) | ✅ (rendered) | ✅ (rendered) |
| **Emphasis marker hiding** | ○ | ✅ | ? | ○ | ? | ○ | ✅ | ✅ (rendered) | ✅ (rendered) | ✅ (rendered) |
| **Strong marker hiding** | ○ | ✅ | ? | ○ | ? | ○ | ✅ | ✅ (rendered) | ✅ (rendered) | ✅ (rendered) |
| **Delete/strikethrough hiding** | ○ | ◐ | ? | ○ | ? | ○ | ○ (absent from list) | ✅ (rendered) | ✅ (rendered) | ✅ (rendered) |
| **Highlight (`==`) marker** | ○ | ◐ (plugin) | ? | ○ | ? | ○ | ○ (may not parse) | ✗ (not std) | ○ | ○ |
| **Link marker hiding** | ○ | ✅ | ? | ○ | ? | ○ | ✅ | ✅ (rendered) | ✅ (rendered) | ✅ (rendered) |
| **Long URL word-break** | ○ | ○ | ? | ○ | ? | ○ | ○ | ○ | ○ | ○ |
| **Broken-link indicator** | ○ | ✗ (md links) / ✅ (wikilinks) | ? | ○ | ? | ○ | ○ | ○ | ○ | ○ |
| **Image inline preview** | ○ | ✅ | ? | ○ | ? | ○ | ○ | ✅ | ✅ | ✅ |
| **WikiLink widget** | ○ | ✅ | ◐ | ○ | ? | ○ | ○ (custom ext) | ○ | ○ | ○ |
| **HardBreak hint** | ○ | ✅ (hidden) | ? | ○ | ? | ○ | ✅ | ○ | ○ | ○ |

---

## Per-product summary

### Obsidian Source Mode

Baseline plain-text editor with minimal line decoration. Markers visible, no size hierarchy, no marker hiding. Deliberate: user has "Live Preview" for the polished feel.

### Obsidian Live Preview

The most feature-complete live-preview-hybrid among surveyed products. Widget-replace for tables + blockquotes + headings (partial), cursor-reveal for inline marks, interactive task checkboxes + image thumbnails. Known nesting bugs (#30849, #95349).

### SilverBullet

OSS CM6 reference for live-preview-hybrid pattern applied across many constructs. Per-construct file organization. Many details unresolved at this research pass (would need deeper source inspection).

### HedgeDoc

CM5-based source pane; mostly plain text with basic syntax coloring. Preview pane handles rendering. Minimal per-construct source-view polish.

### Zettlr

CM6-migrated; specific construct-level decoration details unresolved at this pass. Product positioning is academic-markdown with citation focus; construct polish may not be a priority.

### VS Code + markdown extensions

Monaco-based (not CM6). Plain text with TextMate/syntax coloring. Extensions (Markdown All in One, Markdown Preview Enhanced) add keyboard UX and preview, not source-view decoration polish.

### codemirror-rich-markdoc

The OSS reference implementation for live-preview-hybrid in CM6. ~200 LOC total across `richEdit.ts` (inline marks) + `renderBlock.ts` (block replace). Covers tables, blockquotes, inline marks, links, code. Does NOT cover strikethrough, highlight, wikilinks, headings-with-size-hierarchy, thematic-break widgets.

### MDXEditor

Lexical-based (not CM6). Rich-text primary; source toggle via `diffSourcePlugin`. Full constructs supported in rich-text; source toggle = plain markdown with basic syntax coloring.

### Typora / Marktext / Milkdown

WYSIWYG-first. Source view (if present) is secondary with minimal decoration. Not primary comparison points for pure source-view rendering.

---

## Cross-cutting observations

### The "polish ceiling" — what NO product does

Despite 5+ products shipping live-preview-hybrid patterns:

1. **Depth-aware nested-blockquote visual hierarchy** — not shipped anywhere
2. **Cell-by-cell table cursor-reveal** — Obsidian's most-requested feature, unshipped
3. **Interactive task checkboxes in CM6 source view** — only in WYSIWYG surfaces; CM6 products reserve this for Live Preview
4. **HTML attribute colorization (Rainbow-HTML)** — direct Rainbow-CSV transfer; unclaimed
5. **Fenced code language label widget** — universally absent
6. **Broken-reference indicator for `[text][missing-label]`** — not shipped
7. **Long-URL `word-break` handling** — not shipped
8. **Image inline thumbnails in pure source mode** — Obsidian LP only (Live Preview ≠ pure source)
9. **YAML fold/collapse in CM6-based products** — Obsidian community plugin only

### The "convergent practices" — what multiple products do

1. **Cursor-reveal for inline marks** — Obsidian LP, SilverBullet, rich-markdoc all converge
2. **Widget-block-replace for tables** — Obsidian LP, SilverBullet, rich-markdoc converge
3. **Blockquote border-left + tint** — Obsidian LP, likely SilverBullet, rendered-preview products all converge
4. **List marker hiding + hanging indent in rendered modes** — universal (but in source modes: only S3 products)

### The "ecosystem polarity"

Products cluster into two camps:

- **Text-canonical** (HedgeDoc, VS Code, Zettlr, Obsidian Source Mode, Lapce, Helix) — plain text + syntax coloring only
- **Rendered-hybrid** (Obsidian LP, SilverBullet, rich-markdoc, Typora, Marktext, MDXEditor, Milkdown) — widgets + marker hiding

Middle-ground "text-canonical with construct polish via per-line decoration" (the S2 family from the prior report) is latent but unclaimed as a default positioning.

---

## Gaps / follow-ups

- SilverBullet's per-construct behaviors for several elements — unresolved at this pass
- Zettlr specifics on CM6 construct handling — unresolved
- HackMD / Lapce / Helix quick surveys — not deeply sampled
- Community Obsidian plugins adding per-construct polish — partial coverage; extensive ecosystem exists beyond what was sampled
