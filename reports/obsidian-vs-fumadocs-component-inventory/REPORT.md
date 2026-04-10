---
title: "Obsidian vs Fumadocs: Complete UI Element, Block Type, and Component Inventory"
description: "Exhaustive feature-by-feature inventory of every UI element, block type, content component, and editing feature in Obsidian compared to Fumadocs' component model. Classifies each gap by implementation effort. Covers core Obsidian, 25 top community plugins, Fumadocs MDX components, remark/rehype pipeline, and the shadcn registry distribution model."
createdAt: 2026-04-03
updatedAt: 2026-04-03
subjects:
  - Obsidian
  - Fumadocs
  - fumadocs-ui
  - fumadocs-core
  - shadcn/ui
  - Radix UI
  - MDX
topics:
  - component inventory comparison
  - block type analysis
  - editing feature gap analysis
  - knowledge platform architecture
  - component distribution
---

# Obsidian vs Fumadocs: Complete UI Element, Block Type, and Component Inventory

**Purpose:** Provide an exhaustive inventory of every UI element, block type, content component, and editing feature available in Obsidian vs. what Fumadocs ships out of the box. Classify each gap by implementation effort to inform what needs to be built or sourced to match Obsidian's editing experience while using the Fumadocs component model.

---

## Executive Summary

Obsidian and Fumadocs serve fundamentally different roles and their feature sets reflect this. Obsidian is a desktop knowledge management application with ~50 native block/element types (15+ block types, 13 inline formatting types, 13 callout variants, 30 core plugins) plus a 2,500+ plugin ecosystem. Fumadocs is a React documentation framework with ~25 components (10 HTML overrides + 15 named components) and a 15-plugin remark/rehype pipeline.

The content rendering gap between them is smaller than it appears. Of Obsidian's content features, 16 map cleanly to existing Fumadocs components, 5 are partially covered, and 10 could be added in under a day each. The real gap is in **knowledge graph features** -- wiki-links, backlinks, block references, graph view, and query engines -- which are what make Obsidian a *knowledge tool* rather than a *document renderer*. These require editor-level integration and collectively represent 30-50 days of work.

Fumadocs has features Obsidian lacks: type-safe frontmatter validation (Zod schemas), advanced code block transformers (diff highlighting, Twoslash hover, NPM multi-package-manager tabs), structured search indexing (remarkStructure), and a programmatic content pipeline that an editor can hook into. These are documentation-specific strengths.

For the shadcn distribution model: Fumadocs is not distributed as a shadcn registry but uses the same architectural foundation (Radix UI + Tailwind CSS variables). A custom knowledge-component registry is viable and would be the first of its kind -- no "knowledge management component" registry exists in the shadcn ecosystem.

**Key Findings:**

- **Content rendering parity is achievable with ~2 weeks of component work.** The 10 easy-to-add features (callout variants, highlight syntax, media embeds, etc.) total roughly 30-40 hours. The 5 partially-covered features need modest extensions.
- **Knowledge graph features are the real gap and the real product differentiator.** Wiki-links, backlinks, transclusion, block references, tags, graph view, and a Dataview-like query engine are what Obsidian users depend on. These are not component-level work -- they require a page index, a link resolver, and editor integration.
- **Fumadocs has 6 callout types; Obsidian has 13 with 25+ aliases.** The mapping is straightforward but the Fumadocs Callout component needs extension (more types + foldable behavior).
- **Code block capabilities favor Fumadocs.** Shiki provides better highlighting than Prism.js, and Fumadocs adds diff markers, line highlighting, focus annotations, Twoslash, and multi-PM tabs that Obsidian lacks natively.
- **12 of the top 25 Obsidian community plugins add content types.** Dataview (query engine), Excalidraw (drawing), Kanban (boards), and Tasks (enhanced task management) are the most impactful. All are replicable as React components.
- **The shadcn registry model aligns well with source-owned knowledge components.** No docs/knowledge-specific registry exists yet in the 155+ registry ecosystem.

---

## Research Rubric

| # | Dimension | Priority | Depth | Coverage |
|---|-----------|----------|-------|----------|
| D1 | Obsidian's complete block/element inventory | P0 | Deep, exhaustive | Complete |
| D2 | Fumadocs' complete component inventory | P0 | Deep, exhaustive | Complete |
| D3 | Gap analysis — Obsidian has vs Fumadocs doesn't | P0 | Synthesis | Complete |
| D4 | shadcn/component registry angle | P1 | Moderate | Complete |
| D5 | Community plugins that matter for knowledge work | P1 | Moderate | Complete |

**Stance:** Factual with conclusions (gap analysis requires classification judgments).
**Non-goals:** Implementation plans, performance benchmarks, visual design quality, Obsidian plugin development tutorials, Fumadocs vs. other docs frameworks (covered in existing `fumadocs-vs-mintlify-architecture` report).

---

## Detailed Findings

### D1: Obsidian's Complete Block/Element Inventory

**Finding:** Obsidian supports 15+ distinct block types, 13 inline formatting types, 13 callout variants (with 25+ aliases), ~300 code highlighting languages, native Mermaid/MathJax rendering, rich embed support, and 30 core plugins. The feature surface is large but well-categorized.

**Evidence:** [evidence/d1-obsidian-block-element-inventory.md](evidence/d1-obsidian-block-element-inventory.md)

#### Inline Formatting (13 types)

| Feature | Syntax | Standard? |
|---------|--------|-----------|
| Bold | `**text**` | CommonMark |
| Italic | `*text*` | CommonMark |
| Strikethrough | `~~text~~` | GFM |
| Highlight | `==text==` | OFM only |
| Inline code | `` `code` `` | CommonMark |
| Inline math | `$E=mc^2$` | MathJax |
| Wiki-link | `[[page]]` | OFM only |
| Tag | `#tag` | OFM only |
| Internal link | `[[page#heading]]` | OFM only |
| External link | `[text](url)` | CommonMark |
| Footnote ref | `[^1]` | Extended markdown |
| Comment | `%%hidden%%` | OFM only |
| Subscript/superscript | `<sub>` / `<sup>` HTML only | Not native syntax |

Five of these (highlight, wiki-link, tag, internal link, comment) are Obsidian-Flavored Markdown (OFM) extensions not found in standard markdown.

#### Block Types (15+)

| Block Type | Syntax | Notes |
|------------|--------|-------|
| Headings (h1-h6) | `# H1` through `###### H6` | Standard |
| Paragraphs | Plain text | Standard |
| Blockquotes | `> text` | Nestable |
| Callouts | `> [!type]` | 13 types, foldable |
| Code blocks | ` ```lang ``` ` | Prism.js (~300 langs) + CodeMirror (~100) |
| Tables | Pipe tables | GFM |
| Unordered lists | `- item` | Standard |
| Ordered lists | `1. item` | Standard |
| Task lists | `- [ ] task` | GFM |
| Horizontal rules | `---` | Standard |
| Math blocks | `$$ LaTeX $$` | MathJax |
| Mermaid diagrams | ` ```mermaid ``` ` | Built-in renderer |
| Embeds | `![[file]]` | Images, audio, video, PDF, notes |
| Footnote defs | `[^1]: text` | Extended markdown |
| Frontmatter | `---` YAML `---` | 7 property types with visual editor |

#### Callout Types (13 types, 25+ aliases)

| Type | Aliases | Color |
|------|---------|-------|
| note | -- | Blue |
| abstract | summary, tldr | Green |
| info | -- | Blue |
| todo | -- | Blue |
| tip | hint, important | Cyan |
| success | check, done | Green |
| question | help, faq | Yellow |
| warning | caution, attention | Orange |
| failure | fail, missing | Red |
| danger | error | Red |
| bug | -- | Red |
| example | -- | Purple |
| quote | cite | Grey |

All callouts support: foldable/collapsible (`+`/`-` suffix), custom titles, nested content, custom CSS types.

#### Embed Support

| Format | Types | Syntax |
|--------|-------|--------|
| Images | PNG, JPG, JPEG, GIF, BMP, SVG | `![[image.png]]` or `![[image.png|640x480]]` |
| Audio | MP3, WebM, WAV, M4A, OGG, 3GP, FLAC | `![[audio.mp3]]` |
| Video | MP4, WebM, OGV | `![[video.mp4]]` |
| PDF | PDF with page/height params | `![[file.pdf#page=3]]` |
| Notes | Full note or section embed | `![[note]]`, `![[note#heading]]`, `![[note#^block]]` |

#### Core Plugins Adding Editing Features (9 of 30)

| Plugin | What it adds |
|--------|-------------|
| Canvas | Infinite canvas with JSON Canvas format |
| Slides | Reveal.js presentations from markdown |
| Templates | Snippet insertion with date/time variables |
| Daily Notes | Auto-created daily note files |
| Audio Recorder | Record audio into notes |
| Bases | Database-like views of notes |
| Note Composer | Extract/merge note content |
| Format Converter | Import format conversion |
| Word Count | Live word/character counting |

**Decision triggers:**
- If matching Obsidian's *rendering* capabilities: focus on callout variants, Mermaid, media embeds, highlight syntax
- If matching Obsidian's *knowledge* capabilities: focus on wiki-links, backlinks, graph view, query engine

---

### D2: Fumadocs' Complete Component Inventory

**Finding:** Fumadocs ships ~25 components across three categories: 10 HTML element overrides (automatic), 8+ named MDX content components, and 10+ layout/navigation components. The remark/rehype pipeline adds 15+ plugins that transform markdown before rendering.

**Evidence:** [evidence/d2-fumadocs-component-inventory.md](evidence/d2-fumadocs-component-inventory.md)

#### HTML Element Overrides (in defaultMdxComponents, applied automatically)

| Override | Component | What it does |
|----------|-----------|-------------|
| `pre` | CodeBlock + Pre | Shiki syntax highlighting with transformers |
| `a` | Link | External link security attributes, relative link resolution |
| `img` | Image | Next.js image optimization |
| `h1`-`h6` | Heading variants | Auto-generated anchor IDs |
| `table` | Table | Styled table component |

#### Named MDX Content Components

| Component | Import Path | Props Summary | Server/Client |
|-----------|-------------|---------------|---------------|
| Card | fumadocs-ui/mdx | `{ href, icon, title, description }` | Server |
| Cards | fumadocs-ui/mdx | Card grid container | Server |
| Callout | fumadocs-ui/mdx | `{ type: 'info'\|'warn'\|'error'\|'success'\|'warning'\|'idea', title?, children }` | Server |
| Tabs | fumadocs-ui/components/tabs | `{ items, groupId, persist, defaultIndex, updateAnchor }` | Client |
| Tab | fumadocs-ui/components/tabs | `{ value, id }` | Client |
| Steps | fumadocs-ui/components/steps | `{ children }` | Server |
| Step | fumadocs-ui/components/steps | `{ children }` | Server |
| Accordion | fumadocs-ui/components/accordion | Radix Accordion props + `{ title, id }` | Client |
| Accordions | fumadocs-ui/components/accordion | `{ type: 'single'\|'multiple' }` | Client |
| TypeTable | fumadocs-ui/components/type-table | `{ type: Record<string, ObjectType> }` | Server |
| AutoTypeTable | fumadocs-ui/components/type-table | Auto-generated from TS types | Server |
| ImageZoom | fumadocs-ui/components/image-zoom | Zoomable image wrapper | Client |
| Files | fumadocs-ui/components/files | File tree display | Server |
| File | fumadocs-ui/components/files | Individual file in tree | Server |
| InlineTOC | fumadocs-ui/components/inline-toc | Inline table of contents | Server |
| Banner | fumadocs-ui/components/banner | Announcement banner | Server |
| DynamicCodeblock | fumadocs-ui/components/dynamic-codeblock | Runtime-configurable code | Client |
| GitHubInfo | fumadocs-ui/components/github-info | Repository info display | Server |

#### Code Block Features (via rehypeCode + Shiki)

| Feature | Syntax | Notes |
|---------|--------|-------|
| Syntax highlighting | ` ```lang ``` ` | All TextMate grammars (~200+ langs) |
| Line highlighting | `// [!code highlight]` | Highlight specific lines |
| Diff markers | `// [!code ++]` / `// [!code --]` | Green/red diff display |
| Focus annotations | `// [!code focus]` | Blur non-focused lines |
| Word highlighting | Custom transformer | Highlight specific words |
| Line numbers | `showLineNumbers` attribute | With custom start values |
| Titles | `title="file.ts"` attribute | Filename display |
| Twoslash | TypeScript hover info | IDE-like type information |
| Tab groups | Consecutive code blocks with `tab="name"` | Auto-grouped into Tabs |
| NPM tabs | ` ```package-install ``` ` | Auto-generates npm/pnpm/yarn/bun |

#### Remark/Rehype Plugin Pipeline

| Plugin | Function |
|--------|----------|
| remarkGfm | Tables, strikethrough, task lists, autolinks |
| remarkHeading | Heading IDs, custom `[#slug]` syntax, TOC extraction |
| remarkImage | Image dimension extraction, Next.js import optimization |
| remarkCodeTab | Consecutive code blocks to tab groups |
| remarkNpm | NPM code blocks to multi-PM tabs |
| remarkStructure | Heading-level content extraction for search indexing |
| remarkPostprocess | Markdown capture, link extraction |
| remarkSteps | Numbered headings to Steps component |
| remarkMdxMermaid | Mermaid code blocks to `<Mermaid>` component |
| remarkAdmonition | `:::type` syntax to Callout (deprecated) |
| remarkLLMs | MDX to clean markdown for LLM consumption |
| remarkFeedbackBlock | Block to FeedbackBlock wrapper |
| rehypeCode | Shiki highlighting + all transformers |
| rehypeToc | TOC generation |

#### Layout/Navigation Components (not content blocks)

DocsLayout, HomeLayout, DocsPage, Sidebar, Breadcrumb, TOC, SearchDialog, RootProvider, Footer, Nav

#### Theming

- Tailwind CSS v4 with CSS variables
- Dark mode (class strategy)
- Radix UI primitives for interactive components
- @fumadocs/base-ui for unstyled variants
- Design system inspired by shadcn/ui

**Decision triggers:**
- If building a visual editor: the ~25 components are all introspectable via react-docgen-typescript. The `defaultMdxComponents` object is the discovery surface.
- If extending with custom components: one-line addition to `getMDXComponents()` return value. No registration API needed.

---

### D3: Gap Analysis — What Obsidian Has That Fumadocs Doesn't

**Finding:** The gap concentrates in two areas: (1) minor content rendering extensions that are easy to add, and (2) major knowledge graph features that define Obsidian as a knowledge tool. The rendering gap is ~2 weeks of work. The knowledge graph gap is ~6-10 weeks.

**Evidence:** [evidence/d3-gap-analysis.md](evidence/d3-gap-analysis.md)

#### Fully Covered (16 features — clean mapping)

| Obsidian Feature | Fumadocs Equivalent |
|-----------------|---------------------|
| Bold, italic, strikethrough | Standard markdown/GFM |
| Inline code | Standard markdown |
| Headings h1-h6 | Heading components + auto-anchors |
| Paragraphs | Standard markdown |
| Blockquotes | Standard markdown |
| Code blocks + highlighting | CodeBlock + Shiki (superior to Obsidian's Prism.js) |
| Tables | Table component (GFM) |
| Ordered/unordered lists | Standard markdown/GFM |
| Task/checkbox lists | remarkGfm |
| Horizontal rules | Standard markdown |
| Math blocks ($$) | remark-math + rehype-katex |
| External links | Link component |
| Footnotes | remarkGfm |
| Frontmatter/YAML | YAML + Zod schema validation (superior) |
| Images | Image component + Next.js optimization |
| Heading anchors | Auto-generated + custom `[#slug]` syntax |

#### Partially Covered (5 features — similar but not identical)

| Obsidian Feature | Fumadocs State | Gap to Close |
|-----------------|----------------|-------------|
| **Callouts** (13 types, foldable) | 6 types, not foldable | Add 7 types, aliases, collapsible behavior |
| **Mermaid diagrams** | remarkMdxMermaid exists | Needs Mermaid renderer component (not shipped) |
| **Inline math** ($) | remark-math supports it | Needs explicit plugin config (not in default pipeline) |
| **Highlight** (==text==) | No default support | Add remark plugin for `==` syntax |
| **Comments** (%%text%%) | No default support | Add remark plugin to strip/handle comments |

#### Not Covered — Easy to Add (10 features, under 1 day each)

| Feature | Implementation | Estimated Effort |
|---------|---------------|-----------------|
| 7 missing callout types | Extend Callout `type` prop union | 2-4 hours |
| Callout aliases (25+) | Type alias mapping in Callout | 1 hour |
| Callout foldability | Radix Collapsible wrapper | 2-4 hours |
| Highlight syntax (==) | remark-mark plugin or custom | 2-4 hours |
| Comment syntax (%%) | remark plugin to strip | 1-2 hours |
| Audio embed component | `<audio>` React component | 1-2 hours |
| Video embed component | `<video>` React component | 1-2 hours |
| PDF embed component | `<iframe>` or PDF.js component | 2-4 hours |
| Image size control | Props on Image component | 1-2 hours |
| Subscript/superscript | remark plugin + components | 1-2 hours |

**Total easy-to-add effort: ~20-30 hours (3-4 days)**

#### Not Covered — Significant Work (12 features requiring editor/system integration)

| Feature | What's Required | Effort |
|---------|----------------|--------|
| **Wiki-links** (`[[page]]`) | remark plugin + page index + resolver | 1-2 days |
| **Internal embeds** (`![[note]]`) | Transclusion: resolve note, render inline | 2-3 days |
| **Block references** (`^id`) | Block ID system + resolver | 2-3 days |
| **Tags** (`#tag`) | remark plugin + tag index + tag pages | 1-2 days |
| **Backlinks panel** | Reverse link computation from page index | 1-2 days |
| **Graph view** | Force-directed graph + link data | 3-5 days |
| **Dataview-like queries** | Query engine over page metadata | 5-10 days |
| **Canvas** | Infinite canvas editor (tldraw/reactflow) | 10+ days |
| **Slides/presentations** | Reveal.js or similar integration | 3-5 days |
| **Properties visual editor** | Form UI for frontmatter editing | 2-3 days |
| **Search (vault-wide)** | Orama integration (partially exists) | 1-2 days |
| **Daily notes** | Template + date-based file creation | 1 day |

**Total significant-work effort: ~35-50 days (7-10 weeks)**

#### Not Applicable for Web (9 features)

Audio Recorder (desktop hardware), File system access (different storage model), Obsidian Sync (own persistence), Obsidian Publish (we ARE the platform), Workspaces (desktop window mgmt), Quick Switcher (command palette equivalent), File Recovery (git-based), Format Converter (import tool), Note Composer (editor refactoring).

#### Summary Diagram

```
Obsidian Feature Space (~50 features)
├── Fully Covered by Fumadocs: 16 (32%) ████████████████
├── Partially Covered:          5 (10%) █████
├── Easy to Add (<1 day):      10 (20%) ██████████
├── Significant Work (>1 day): 12 (24%) ████████████
└── Not Applicable (web):       9 (18%) █████████
                                         ─────────────────
                                         Rendering: 62% covered or trivial
                                         Knowledge: 24% = the real gap
```

**The insight:** Content rendering parity (what users see) requires ~2 weeks. Knowledge graph parity (how users connect and query) requires ~7-10 weeks. These are different product layers and should be prioritized separately.

---

### D4: The shadcn/Component Registry Angle

**Finding:** Fumadocs uses the same architectural foundation as shadcn/ui (Radix UI + Tailwind CSS variables) but is distributed as a traditional npm package, not a shadcn registry. A knowledge-component shadcn registry is viable and would be the first of its kind.

**Evidence:** [evidence/d4-shadcn-registry-angle.md](evidence/d4-shadcn-registry-angle.md)

#### Fumadocs and shadcn: Architectural Siblings, Not Dependents

| Aspect | Fumadocs | shadcn/ui |
|--------|----------|-----------|
| Primitive layer | Radix UI | Radix UI (migrating to Base UI) |
| Styling | Tailwind CSS + CSS variables | Tailwind CSS + CSS variables |
| Distribution | npm package | Source code via CLI |
| Customization | Fork or override CSS | Edit source directly |
| AI discoverability | None built-in | MCP server + Skills |
| Unstyled variant | @fumadocs/base-ui | Base components |

Fumadocs-ui is NOT a shadcn component library and is NOT in the shadcn registry. However, **@plate/fumadocs** exists as a third-party registry entry -- Plate (rich text editor framework) has published components styled to match Fumadocs.

#### Viability of a Knowledge-Component Registry

The shadcn registry specification supports distributing any React component as source code:

```
@knowledge/callout      — Extended callout with 13 types + foldable
@knowledge/wiki-link    — Wiki-link component with resolver
@knowledge/mermaid      — Mermaid diagram renderer
@knowledge/dataview     — Query engine component
@knowledge/embed        — Multi-format embed (audio, video, PDF, note)
@knowledge/graph-view   — Force-directed knowledge graph
@knowledge/code-block   — Extended code block with diff/focus
@knowledge/canvas       — Infinite canvas component
```

Benefits of registry distribution:
- **Source-owned:** Users can customize styling and behavior
- **AI-discoverable:** shadcn MCP server provides tool access for agents
- **Composable:** Components can depend on each other via `registryDependencies`
- **Framework-agnostic:** Spec works across React, Vue, Svelte (via shadcn-vue, shadcn-svelte)

No dedicated "knowledge management" or "documentation-specific" component registry exists in the 155+ registries in the shadcn directory. This is an open market position.

#### Existing Registries with Partial Overlap

| Registry | What it offers | Overlap |
|----------|---------------|---------|
| @plate | Rich text editor components | Editor-level components, not rendering |
| @kibo | Docs site components (uses Fumadocs) | Layout/nav, not content blocks |
| @assistant-ui | AI chat interface | Chat UI, not knowledge components |
| @prompt-kit | AI prompt/response display | AI-specific, not general knowledge |

---

### D5: Community Plugins That Matter for Knowledge Work

**Finding:** 12 of the top 25 Obsidian community plugins add content types or editing capabilities. Dataview (query engine), Excalidraw (drawing), Tasks (enhanced task management), and Kanban (boards) are the highest-impact, and all are replicable as React components.

**Evidence:** [evidence/d5-community-plugins-knowledge-work.md](evidence/d5-community-plugins-knowledge-work.md)

#### Top Content-Adding Plugins (sorted by downloads)

| Rank | Plugin | Downloads | What it Adds | React Replicability |
|------|--------|-----------|-------------|-------------------|
| 1 | Excalidraw | 5.7M | Full drawing canvas | @excalidraw/excalidraw npm package, 2-3 days |
| 2 | Templater | 3.9M | Dynamic templates with JS | MDX handles this natively, 1-2 days |
| 3 | Dataview | 3.9M | Query language over notes | Custom query engine, 5-10 days |
| 4 | Tasks | 3.3M | Enhanced task management | Task component + query, 3-5 days |
| 9 | Kanban | 2.2M | Kanban boards | dnd-kit + board UI, 3-5 days |
| 10 | Iconize | 1.9M | Icons in notes/explorer | Lucide icon component, 1 day |
| 12 | QuickAdd | 1.7M | Quick capture + templates | Command palette + templates, 2-3 days |
| 16 | Copilot | 1.2M | AI chat in sidebar | AI SDK + chat UI, 3-5 days |
| 22 | Admonition | 880K | Custom callout types | Extend Callout component, 1 day |
| 23 | Smart Connections | 871K | AI-powered note linking | Embedding similarity + UI, 5-10 days |
| 25 | Advanced Slides | 815K | Reveal.js presentations | mdx-deck or reveal.js, 3-5 days |

#### Dataview Deep Dive

Dataview is the most impactful community plugin for knowledge work. It adds a SQL-like query language over markdown metadata:

**Query types:**
- `TABLE` — tabular results with columns from metadata fields
- `LIST` — bullet-point list of matching pages
- `TASK` — interactive task list aggregated across notes
- `CALENDAR` — calendar view with dots on dates

**Query operators:**
- `FROM` — source folder/tag/link filter
- `WHERE` — condition-based filtering
- `SORT` — ordering by any field
- `GROUP BY` — grouping results
- `FLATTEN` — list expansion
- `LIMIT` — result count

**Metadata sources:** Frontmatter YAML, inline fields (`key:: value`), tags, links, file properties (creation date, modification date, word count)

**Inline queries:** `= this.file.name` embedded in running text

**Replication strategy for a React/MDX platform:**
1. Build a page metadata index (from frontmatter + computed properties)
2. Implement a subset of DQL or use a DSL that compiles to filter/sort/group operations
3. Render results as React components (table, list, task list, calendar)
4. Live-update when underlying data changes (via subscription to content index)
5. Estimated total effort: 5-10 days for core engine + 4 output renderers

#### The Custom Codeblock Pattern

Many Obsidian plugins register custom code block languages as a rendering hook:

```markdown
```dataview
TABLE file.mtime AS "Modified", file.size AS "Size"
FROM #project
SORT file.mtime DESC
```​
```

This pattern maps directly to the MDX component model. Each custom codeblock type becomes a React component registered in `getMDXComponents()`. A remark plugin can transform the codeblock into a component invocation at build time or a void node in the editor.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Obsidian HTML rendering:** Which HTML tags are preserved/rendered in Obsidian's markdown? Could not confirm exhaustively -- Obsidian allows some subset of HTML inline.
- **Exact Prism.js language list:** Obsidian uses Prism.js but the exact version/language list depends on the Obsidian version.
- **Community plugins beyond top 25:** The long tail of 2,500+ plugins was not inventoried. Focused on the top 25 by downloads.
- **Obsidian mobile-specific features:** Mobile Obsidian has additional toolbar/editing UX not covered here.

### Out of Scope (per Rubric)

- Implementation plans for specific components
- Performance benchmarks of rendering approaches
- Visual design quality assessment
- Fumadocs vs. other docs frameworks (covered in `fumadocs-vs-mintlify-architecture` report)
- Detailed editor architecture (covered in `cms-custom-components-landscape` report)

---

## References

### Evidence Files
- [evidence/d1-obsidian-block-element-inventory.md](evidence/d1-obsidian-block-element-inventory.md) — Complete Obsidian block/element/formatting inventory with sources
- [evidence/d2-fumadocs-component-inventory.md](evidence/d2-fumadocs-component-inventory.md) — Complete Fumadocs component/plugin inventory with sources
- [evidence/d3-gap-analysis.md](evidence/d3-gap-analysis.md) — Feature-by-feature gap classification
- [evidence/d4-shadcn-registry-angle.md](evidence/d4-shadcn-registry-angle.md) — shadcn registry viability analysis
- [evidence/d5-community-plugins-knowledge-work.md](evidence/d5-community-plugins-knowledge-work.md) — Top 25 community plugins with content-type analysis

### External Sources
- [Obsidian Help — Basic Formatting Syntax](https://help.obsidian.md/syntax)
- [Obsidian Help — Callouts](https://help.obsidian.md/callouts)
- [Obsidian Help — Obsidian Flavored Markdown](https://help.obsidian.md/Editing+and+formatting/Obsidian+Flavored+Markdown)
- [Fumadocs — Components](https://www.fumadocs.dev/docs/ui/components)
- [Fumadocs — Markdown Features](https://www.fumadocs.dev/docs/markdown)
- [Fumadocs — MDX Plugins](https://www.fumadocs.dev/docs/headless/mdx)
- [ObsidianStats — Most Downloaded Plugins](https://www.obsidianstats.com/most-downloaded)
- [Dataview Documentation](https://blacksmithgu.github.io/obsidian-dataview/)
- [shadcn/ui — Registry Specification](https://ui.shadcn.com/docs/registry)
- [shadcn/ui — Registry Directory](https://ui.shadcn.com/docs/directory)
- [JSON Canvas Specification](https://jsoncanvas.org/)

### Related Research
- [fumadocs-full-pipeline/](../fumadocs-full-pipeline/) — Source-code-level architecture of Fumadocs' content pipeline
- [fumadocs-stack-reusability-deep-analysis/](../fumadocs-stack-reusability-deep-analysis/) — Per-component reusability analysis for knowledge platform
- [obsidian-karpathy-workflow-deep-dive/](../obsidian-karpathy-workflow-deep-dive/) — Obsidian capability-by-capability evaluation for LLM knowledge workflows
- [cms-custom-components-landscape/](../cms-custom-components-landscape/) — How 12 CMS platforms handle custom components in rich text editors
- [shadcn-registry-deep-dive/](../shadcn-registry-deep-dive/) — Technical deep dive into shadcn/ui registry specification
