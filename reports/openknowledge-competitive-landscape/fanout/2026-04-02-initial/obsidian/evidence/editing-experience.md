---
title: "Obsidian Editing Experience - Evidence"
type: evidence
dimension: "D1 - Product Capabilities & Editing Experience"
collected: 2026-04-02
sources:
  - https://help.obsidian.md/Live+preview+update
  - https://deepwiki.com/obsidianmd/obsidian-help/4.4-live-preview-and-editing-modes
  - https://docs.obsidian.md/Plugins/Editor/Editor
  - https://obsidian.md/canvas
  - https://github.com/Developer-Mike/obsidian-advanced-canvas
  - https://www.geeky-gadgets.com/obsidian-tips-tricks-2026/
  - https://www.obsidianstats.com/plugins/marp-slides
  - https://obsidian.rocks/obsidian-search-five-hidden-features/
  - https://www.obsidianstats.com
  - https://www.dsebastien.net/the-must-have-obsidian-plugins-for-2026/
---

# D1: Product Capabilities & Editing Experience - Evidence

## Editor Modes

Obsidian provides three distinct editing modes:

1. **Source Mode** - Raw markdown editing. Shows all syntax tokens (e.g., `**bold**` not **bold**). Preferred by developers and markdown purists who want full control over the document structure.

2. **Live Preview** - Hybrid mode built on CodeMirror 6. Renders markdown syntax away from the cursor position while keeping it visible at the cursor. This is the default mode since Obsidian's CM6 migration. Uses HyperMD components to parse the document into an AST, then hides markdown tokens or replaces nodes with rendered widgets.

3. **Reading Mode** - Fully rendered view. No editing possible. Shows the final rendered document including embeds, transclusions, and dynamic elements like Dataview queries.

**Why developers prefer Obsidian's editor:**
- Built on CodeMirror 6 — the same editor framework used by VS Code's Monaco. Highly extensible, modular architecture.
- Live Preview solves the "two-pane problem" — no split view needed between editor and preview.
- Source Mode satisfies purists; you never lose access to raw markdown.
- Keyboard-first navigation. Vim mode available via core plugin.
- The editor respects markdown as a first-class format, not as an implementation detail hidden behind a WYSIWYG layer.

## Canvas

Canvas is a core plugin (free, bundled) providing an infinite spatial canvas for visual thinking:
- Embed notes, images, PDFs, videos, audio, and fully interactive web pages
- Edit embedded notes inline within the canvas
- JSON Canvas format (.canvas) — open specification, not proprietary
- Cards can contain markdown or reference existing vault notes
- Edges connect nodes with optional labels
- Advanced Canvas community plugin adds: graph view integration, flowchart styling, dynamic presentations

## Graph View

Core plugin visualizing note relationships:
- Interactive force-directed graph of all notes and their connections (wikilinks, tags)
- Local graph view scoped to current note's neighborhood
- Filtering by path, tags, and connection depth
- Community plugins extend it: 3D Graph (three.js based), Extended Graph (customizable rendering)

## Bases (Database Views)

Core plugin released August 2025, actively developed:
- Database-like views of vault notes using frontmatter properties
- Table, card, list, and map view layouts
- Sorting, filtering, grouping by any property
- Calculated fields (totals, averages, counts)
- CSV import to markdown files
- Aims to replace Dataview for structured data use cases
- JSON Canvas and Bases together make Obsidian competitive with Notion's databases

## Presentation / Slides

Multiple options:
- **Marp Slides plugin** — create Marp-based slide decks from markdown, export to HTML/PDF/PPTX
- **Marp Extended plugin** — adds live preview, bidirectional editor sync, Mermaid support
- **Advanced Slides** (community) — reveal.js based presentations
- **Figma Slides** and advanced Canvas can also serve presentation use cases

## Search Quality

Core Search plugin (bundled):
- Full-text search across all vault files
- Search operators: `path:`, `file:`, `tag:`, `line:`, `block:`, `section:`
- Regex search supported in global search (but NOT in-file search — a known limitation)
- Boolean operators (AND, OR, NOT)
- Property/frontmatter search
- No built-in semantic/vector search — requires plugins (Smart Connections, Omnisearch)

## Plugin Ecosystem Scale (as of March 2026)

- **2,736 community plugins** in the official directory
- **Over 1,000 actively maintained** (rest are archived or inactive)
- New plugins added weekly — the ecosystem is still growing
- Obsidian Stats (obsidianstats.com) tracks downloads, trends, and updates
- Quality varies widely — top plugins (Dataview, Templater, Calendar) are production-grade; long tail is experimental
