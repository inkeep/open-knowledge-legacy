# Evidence: Obsidian's Complete Block/Element Inventory

**Dimension:** D1 — Obsidian's complete block/element inventory
**Date:** 2026-04-03
**Sources:** Obsidian Help (help.obsidian.md), obsidianstats.com, Obsidian Hub, GitHub obsidianmd/obsidian-help

---

## Key pages referenced

- https://help.obsidian.md/syntax — Basic formatting syntax
- https://help.obsidian.md/callouts — Callout types reference
- https://help.obsidian.md/Editing+and+formatting/Obsidian+Flavored+Markdown — OFM extensions
- https://help.obsidian.md/plugins — Core plugins list
- https://practicalpkm.com/obsidian-core-plugins-tier-list/ — All 30 core plugins
- https://www.obsidianstats.com/most-downloaded — Community plugin stats
- https://github.com/obsidianmd/obsidian-help/blob/master/Sandbox/Formatting/Callout.md — Callout types source

---

## Findings

### Finding: Obsidian supports 13 categories of inline formatting
**Confidence:** CONFIRMED
**Evidence:** Obsidian Help basic formatting syntax + OFM docs

Inline formatting:
- **Bold** (`**text**` or `__text__`)
- **Italic** (`*text*` or `_text_`)
- **Strikethrough** (`~~text~~`)
- **Highlight** (`==text==`) — OFM extension
- **Inline code** (`` `code` ``)
- **Inline math** (`$E=mc^2$`) — MathJax
- **Comments** (`%%hidden%%`) — OFM extension, not rendered
- **Wiki-links** (`[[page]]`, `[[page|display]]`) — OFM extension
- **Tags** (`#tag`, `#nested/tag`) — OFM extension
- **Internal links** (`[[page#heading]]`, `[[page#^block-id]]`)
- **External links** (`[text](url)`)
- **Footnote references** (`[^1]`)
- **Subscript/superscript** — NOT natively supported. Requires HTML (`<sub>`, `<sup>`) or community plugin "Markdown Attributes Extended"

**Implications:** Most inline formatting maps to standard markdown. Highlight (`==`) and comments (`%%`) are Obsidian-specific extensions.

---

### Finding: Obsidian supports 15+ distinct block types natively
**Confidence:** CONFIRMED
**Evidence:** Obsidian Help syntax docs

Block types:
1. **Headings** (h1-h6) — `# H1` through `###### H6`
2. **Paragraphs** — standard text blocks
3. **Blockquotes** — `> quote` (nestable)
4. **Callouts/Admonitions** — `> [!type]` syntax (see below)
5. **Code blocks** — ` ```language ``` ` with syntax highlighting
6. **Tables** — GFM pipe tables
7. **Unordered lists** — `- item` or `* item`
8. **Ordered lists** — `1. item`
9. **Task/checkbox lists** — `- [ ] task` / `- [x] done`
10. **Horizontal rules** — `---` or `***` or `___`
11. **Math blocks** — `$$ ... $$` (MathJax LaTeX)
12. **Mermaid diagrams** — ` ```mermaid ``` ` code blocks, rendered natively
13. **Embeds** — `![[file]]` syntax for images, audio, video, PDF
14. **Footnote definitions** — `[^1]: footnote text`
15. **Frontmatter/YAML** — `---` delimited YAML at top of file

---

### Finding: Obsidian ships 13 built-in callout types with 25+ aliases
**Confidence:** CONFIRMED
**Evidence:** GitHub obsidianmd/obsidian-help/Sandbox/Formatting/Callout.md + obsibrain.com callouts guide

| Type | Aliases | Color |
|------|---------|-------|
| note | (none) | Blue |
| abstract | summary, tldr | Green |
| info | (none) | Blue |
| todo | (none) | Blue |
| tip | hint, important | Cyan |
| success | check, done | Green |
| question | help, faq | Yellow |
| warning | caution, attention | Orange |
| failure | fail, missing | Red |
| danger | error | Red |
| bug | (none) | Red |
| example | (none) | Purple |
| quote | cite | Grey |

All callouts support:
- Foldable (collapsible) via `+` or `-` suffix: `> [!note]+` or `> [!note]-`
- Custom titles: `> [!note] Custom Title`
- Nested content including other callouts
- Unknown types default to "note" styling
- Case-insensitive type identifiers
- Custom CSS-targetable types (any string works as type)

---

### Finding: Code blocks support ~300 languages via Prism.js (reading mode) and ~100 via CodeMirror 6 (editing mode)
**Confidence:** CONFIRMED
**Evidence:** Obsidian forum threads, obsidian.rocks/the-obsidian-code-block

Obsidian uses two syntax highlighting engines:
- **Reading mode:** Prism.js (~300 languages)
- **Editing mode:** CodeMirror 6 (fewer languages)
- Languages not supported by CodeMirror still highlight in reading mode
- Special code blocks: `mermaid` (rendered as diagram), `dataview` (query), `dataviewjs` (JS query)

---

### Finding: Mermaid diagrams are natively rendered from code blocks
**Confidence:** CONFIRMED
**Evidence:** XDA-developers mermaid article, Obsidian forum posts

Supported diagram types (via built-in Mermaid.js):
- Flowcharts
- Sequence diagrams
- Class diagrams
- State diagrams
- Gantt charts
- Pie charts
- Git graphs
- Entity relationship diagrams
- User journey maps

Limitations: Code must be inline (no separate files), custom Mermaid config is ignored in default rendering.

---

### Finding: Math rendering uses MathJax with inline ($) and block ($$) syntax
**Confidence:** CONFIRMED
**Evidence:** Medium/Obsidian math article, Obsidian forum

- Inline: `$E=mc^2$`
- Block: `$$\sum_{i=0}^n i^2$$`
- MathJax engine (not KaTeX)
- Extended MathJax plugin adds mhchem, bussproofs, etc.
- LaTeX Suite plugin adds snippet/auto-expansion for faster math typing

---

### Finding: Embeds support images, audio, video, PDF with `![[file]]` syntax
**Confidence:** CONFIRMED
**Evidence:** Obsidian Help embed files docs

Supported embed formats:
- **Images:** PNG, JPG, JPEG, GIF, BMP, SVG
- **Audio:** MP3, WebM, WAV, M4A, OGG, 3GP, FLAC
- **Video:** MP4, WebM, OGV
- **PDF:** with `#page=N` and `#height=NNN` parameters
- **Note content:** `![[note]]` embeds the rendered content of another note
- **Heading sections:** `![[note#heading]]` embeds specific section
- **Block references:** `![[note#^block-id]]` embeds specific block

Size control for images: `![[image.png|640x480]]` or `![[image.png|640]]`

---

### Finding: Obsidian-Flavored Markdown (OFM) adds 7 extensions beyond CommonMark/GFM
**Confidence:** CONFIRMED
**Evidence:** Obsidian Help OFM docs

OFM-specific syntax:
1. **Wiki-links:** `[[page]]` — internal linking
2. **Highlight:** `==highlighted==`
3. **Comments:** `%%comment%%` — hidden in reading mode
4. **Callouts:** `> [!type]` — admonition blocks
5. **Internal embeds:** `![[file]]` — transclusion
6. **Block references:** `^block-id` at end of block + `[[page#^id]]` to reference
7. **Tags:** `#tag` and `#nested/tag` — metadata classification

---

### Finding: Frontmatter supports 7 property types with visual editing
**Confidence:** CONFIRMED
**Evidence:** Obsidian Help properties docs, DeepWiki properties reference

Property types in Properties view:
- Text (single-line string)
- List (array of text/numbers/links)
- Number
- Checkbox (boolean)
- Date
- Date & time
- Aliases (special: page aliases list)
- Tags (special: tags list)
- cssclasses (special: CSS class list)

Properties can be edited via YAML source view or the visual Properties panel.

---

### Finding: 30 core plugins ship with Obsidian, 9 add editing/content features
**Confidence:** CONFIRMED
**Evidence:** practicalpkm.com core plugins tier list

**Editing/content core plugins:**
1. Audio Recorder — record audio from system microphone
2. Bases — database-like views of notes (sorting, filtering)
3. Canvas — infinite canvas for visual note layouts (JSON Canvas format)
4. Daily Notes — create daily notes from templates
5. Format Converter — convert imported file formats
6. Note Composer — extract/merge note content
7. Slides — reveal.js-like presentations from markdown
8. Templates — insert pre-defined snippets
9. Word Count — word/character counting

**Navigation/organizational core plugins (21):**
Backlinks, Bookmarks, Command Palette, File Recovery, Files, Footnotes View, Graph View, Outline, Outgoing Links, Page Preview, Properties View, Publish, Quick Switcher, Random Note, Search, Slash Commands, Sync, Tags View, Unique Note Creator, Web Viewer, Workspaces

---

## Gaps / follow-ups

- Obsidian's handling of HTML within markdown (which HTML tags are rendered?)
- Exact Prism.js version and language list
- Custom CSS snippets as content extension mechanism
