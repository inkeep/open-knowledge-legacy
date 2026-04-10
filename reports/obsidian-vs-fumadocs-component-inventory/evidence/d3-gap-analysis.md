# Evidence: Gap Analysis — Obsidian vs Fumadocs

**Dimension:** D3 — Gap analysis
**Date:** 2026-04-03
**Sources:** Synthesis of D1 and D2 evidence files

---

## Findings

### Finding: Feature-by-feature classification across 5 categories
**Confidence:** CONFIRMED (based on D1 + D2 primary evidence)

#### Category 1: COVERED BY FUMADOCS (clean mapping exists)

| Obsidian Feature | Fumadocs Equivalent | Notes |
|-----------------|---------------------|-------|
| Bold/italic/strikethrough | Standard markdown → MDX | Identical syntax |
| Inline code | Standard markdown → `<code>` | Identical |
| Headings h1-h6 | Heading components with auto-anchors | Fumadocs adds anchor links automatically |
| Paragraphs | Standard markdown → `<p>` | Identical |
| Blockquotes | Standard markdown → `<blockquote>` | Identical |
| Code blocks + highlighting | CodeBlock + Shiki (100+ languages) | Fumadocs arguably better (Shiki vs Prism.js) |
| Tables | Table component (GFM) | Fumadocs adds styling |
| Ordered lists | Standard markdown → `<ol>` | Identical |
| Unordered lists | Standard markdown → `<ul>` | Identical |
| Task/checkbox lists | GFM via remarkGfm | Renders as checkboxes |
| Horizontal rules | Standard markdown → `<hr>` | Identical |
| Math blocks ($$) | remark-math + rehype-katex | Different engine (KaTeX vs MathJax), equivalent output |
| External links | Link component | Fumadocs adds `rel="noopener"` security |
| Footnotes | Standard markdown footnotes | Via remarkGfm |
| Frontmatter/YAML | YAML + Zod validation | Fumadocs adds type-safe schema validation |
| Images | Image component | Fumadocs adds Next.js optimization |

#### Category 2: PARTIALLY COVERED (similar but not identical)

| Obsidian Feature | Fumadocs Partial | Gap |
|-----------------|-----------------|-----|
| Callouts (13 types, 25 aliases) | Callout (6 types) | Missing 7 type categories + all aliases. No foldable/collapsible support. |
| Mermaid diagrams | remarkMdxMermaid plugin exists | Converts to `<Mermaid>` component but needs a Mermaid renderer component (not shipped by default) |
| Inline math ($) | remark-math supports it | Needs explicit plugin configuration, not default |
| Highlight (==text==) | No built-in support | Could add via remark plugin (remark-directive or custom) |
| Comments (%%text%%) | No built-in support | Different use case in web context, but could add as remark plugin |

#### Category 3: NOT COVERED — EASY TO ADD (standard React component, < 1 day)

| Obsidian Feature | What to Build | Effort |
|-----------------|--------------|--------|
| Missing callout types (abstract, todo, question, failure, bug, example) | Extend Callout component's type prop | 2-4 hours |
| Callout foldability | Add collapsible behavior to Callout (use Radix Collapsible) | 2-4 hours |
| Callout aliases | Type mapping in Callout component | 1 hour |
| Highlight syntax (==text==) | remark plugin + `<mark>` component | 2-4 hours |
| Comment syntax (%%) | remark plugin to strip comments | 1-2 hours |
| Audio embed | `<audio>` component | 1-2 hours |
| Video embed | `<video>` component | 1-2 hours |
| PDF embed | `<iframe>` or PDF.js component | 2-4 hours |
| Horizontal embed variants | Image size/dimension props | 1-2 hours |
| Subscript/superscript | remark plugin or MDX components | 1-2 hours |

#### Category 4: NOT COVERED — SIGNIFICANT WORK (requires editor-level integration)

| Obsidian Feature | What's Needed | Effort |
|-----------------|--------------|--------|
| Wiki-links ([[page]]) | remark plugin + resolver + page index | 1-2 days (plugin exists in fumadocs-core/obsidian package) |
| Internal embeds (![[note]]) | Transclusion system: resolve note → render inline | 2-3 days |
| Block references (^id) | Block ID system + resolver | 2-3 days |
| Tags (#tag) | remark plugin + tag index + tag page generation | 1-2 days |
| Backlinks panel | Page index + reverse link computation | 1-2 days |
| Graph view | Force-directed graph visualization + link data | 3-5 days |
| Dataview-like queries | Query engine over page metadata | 5-10 days (see D5) |
| Canvas | Full canvas editor (JSON Canvas format) | 10+ days |
| Slides/presentations | Reveal.js integration | 3-5 days |
| Live preview editing | TipTap/ProseMirror editor integration | Already planned in product |
| Search (vault-wide) | Orama integration (exists in fumadocs-core) | 1-2 days |
| Properties visual editor | Form UI for frontmatter | 2-3 days |

#### Category 5: NOT APPLICABLE (desktop-only, doesn't apply to web)

| Obsidian Feature | Why N/A |
|-----------------|---------|
| Audio Recorder core plugin | Requires system microphone access — possible in web but different UX |
| File system access | Web app has different storage model |
| Obsidian Sync | Web app uses own persistence |
| Obsidian Publish | We ARE the publishing platform |
| Workspaces | Desktop window management |
| Quick Switcher | Web equivalent would be command palette |
| File Recovery | Git/version control in web context |
| Format Converter | Import tool, not an editing feature |
| Note Composer (extract/merge) | Editor-level refactoring tool |

---

### Finding: The gap is concentrated in knowledge graph features, not content rendering
**Confidence:** CONFIRMED

Content rendering gap is small:
- 16 features fully covered
- 5 partially covered (mostly callout variants + diagram rendering)
- 10 easy to add (< 1 day each)

Knowledge graph gap is large:
- Wiki-links, backlinks, embeds, block references, tags, graph view, query engine
- These are the features that make Obsidian a *knowledge tool* vs a *document renderer*
- Fumadocs is designed for documentation sites, not knowledge management

---

## Gaps / follow-ups

- Detailed implementation plan for wiki-link resolution in MDX context
- Dataview equivalent architecture design
- Canvas web implementation options (tldraw, reactflow, etc.)
