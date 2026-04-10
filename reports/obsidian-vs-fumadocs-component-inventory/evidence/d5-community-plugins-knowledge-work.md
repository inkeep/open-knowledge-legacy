# Evidence: Community Plugins That Matter for Knowledge Work

**Dimension:** D5 — Community plugins adding content types/editing capabilities
**Date:** 2026-04-03
**Sources:** obsidianstats.com, GitHub plugin repos, Obsidian forum, existing obsidian-karpathy-workflow report

---

## Key pages referenced

- https://www.obsidianstats.com/most-downloaded — Download stats
- https://blacksmithgu.github.io/obsidian-dataview/ — Dataview docs
- https://github.com/zsviczian/obsidian-excalidraw-plugin — Excalidraw plugin
- https://github.com/SilentVoid13/Templater — Templater docs
- obsidian-karpathy-workflow-deep-dive report (2026-04-02)

---

## Findings

### Finding: Top 25 most-downloaded Obsidian community plugins ranked by downloads
**Confidence:** CONFIRMED
**Evidence:** obsidianstats.com/most-downloaded (all-time stats)

| Rank | Plugin | Downloads | Adds Content Type? | Category |
|------|--------|-----------|-------------------|----------|
| 1 | Excalidraw | 5,701,122 | YES — drawings, diagrams | Visual/drawing |
| 2 | Templater | 3,929,666 | YES — dynamic templates | Content generation |
| 3 | Dataview | 3,880,059 | YES — dynamic queries, tables, lists | Query/data |
| 4 | Tasks | 3,255,056 | YES — enhanced task management | Task management |
| 5 | Advanced Tables | 2,685,084 | Enhances — better table editing | Table editing |
| 6 | Calendar | 2,479,132 | NO — navigation/UI | Navigation |
| 7 | Git | 2,315,284 | NO — version control | Infrastructure |
| 8 | Style Settings | 2,183,288 | NO — theme customization | Theming |
| 9 | Kanban | 2,182,247 | YES — kanban boards | Visual organization |
| 10 | Iconize | 1,923,460 | YES — icons in file explorer/notes | Visual |
| 11 | Remotely Save | 1,772,727 | NO — sync | Infrastructure |
| 12 | QuickAdd | 1,680,799 | YES — quick capture + templates | Content generation |
| 13 | Minimal Theme Settings | 1,460,981 | NO — theming | Theming |
| 14 | Omnisearch | 1,336,363 | NO — enhanced search | Search |
| 15 | Editing Toolbar | 1,269,488 | NO — formatting toolbar | UI |
| 16 | Copilot | 1,165,132 | YES — AI-generated content | AI |
| 17 | Outliner | 1,147,607 | Enhances — better outline editing | Editing |
| 18 | Importer | 1,127,008 | NO — import from other apps | Infrastructure |
| 19 | Homepage | 1,042,931 | NO — custom start page | Navigation |
| 20 | Recent Files | 971,357 | NO — navigation | Navigation |
| 21 | Tag Wrangler | 916,469 | NO — tag management | Organization |
| 22 | Admonition | 880,100 | YES — custom callout types | Content blocks |
| 23 | Smart Connections | 870,700 | YES — AI-powered note linking | AI/knowledge |
| 24 | Linter | 849,113 | NO — formatting enforcement | Quality |
| 25 | Advanced Slides | 814,528 | YES — reveal.js presentations | Content type |

**Content-adding plugins from top 25:** 12 of 25 add new content types or editing capabilities.

### Finding: Dataview is the most impactful content-type plugin — it adds a query language over markdown
**Confidence:** CONFIRMED
**Evidence:** Dataview documentation, GitHub blacksmithgu/obsidian-dataview

Dataview capabilities:
- **DQL (Dataview Query Language):** SQL-like queries over note metadata
  - `TABLE`, `LIST`, `TASK`, `CALENDAR` output formats
  - `FROM`, `WHERE`, `SORT`, `GROUP BY`, `FLATTEN`, `LIMIT` operators
  - Functions: date math, string manipulation, list operations
- **DataviewJS:** Full JavaScript API for complex queries
- **Inline queries:** `= this.file.name` embedded in text
- **Metadata sources:** Frontmatter YAML, inline fields (`key:: value`), tags, links, file properties
- **Live updating:** Queries re-execute on vault changes

**Replication as React component:**
- The query engine would need a page metadata index
- DQL could be compiled to a query DSL at build time or run at render time
- TABLE output → React table component
- LIST output → React list component
- TASK output → interactive task list
- CALENDAR output → calendar widget
- Estimated effort: 5-10 days for core query engine + rendering

### Finding: Excalidraw is the most-downloaded plugin and adds a full drawing canvas
**Confidence:** CONFIRMED
**Evidence:** GitHub zsviczian/obsidian-excalidraw-plugin, obsidianstats.com

Excalidraw plugin capabilities:
- Full Excalidraw editor embedded in Obsidian
- Drawings stored as .excalidraw.md files (Excalidraw JSON + markdown wrapper)
- Embed drawings in notes via `![[drawing.excalidraw]]`
- LaTeX support within drawings
- Markdown text within drawings
- Script engine for automation
- Link to/from other notes
- Drag files from explorer into drawings

**Replication as React component:**
- Excalidraw is already a React component (MIT licensed)
- `@excalidraw/excalidraw` npm package exists
- Integration effort: 2-3 days for basic embed, 5-7 days for full Obsidian-like integration

### Finding: Templater adds dynamic template execution — JavaScript in templates
**Confidence:** CONFIRMED
**Evidence:** Templater GitHub, Obsidian community docs

Templater capabilities:
- Template variables: `<% tp.date.now() %>`, `<% tp.file.title %>`
- Dynamic content insertion from templates
- JavaScript execution in templates
- System commands (execute shell scripts)
- User functions (custom JS functions)
- Folder templates (auto-apply template on file creation)

**Replication:** In a React/MDX context, this maps to:
- MDX already supports JavaScript expressions
- Component props can compute dynamic values
- Template system = MDX file + pre-populated frontmatter
- Effort: 1-2 days (MDX handles most of this natively)

### Finding: Tasks plugin adds enhanced task management beyond basic checkboxes
**Confidence:** CONFIRMED
**Evidence:** obsidianstats.com, Obsidian community guides

Tasks plugin capabilities:
- Due dates, scheduled dates, start dates on tasks
- Recurring tasks
- Priority levels
- Task queries (filter/sort/group tasks across vault)
- Custom task statuses (beyond done/not-done)
- Task completion tracking

**Replication:** 
- Custom Task component with date/priority props
- Query component for cross-page task aggregation
- Effort: 3-5 days

### Finding: Other content-adding plugins and their replicability
**Confidence:** CONFIRMED

| Plugin | What it adds | React replicability |
|--------|-------------|-------------------|
| Kanban | Kanban board from markdown lists | React-beautiful-dnd or dnd-kit, 3-5 days |
| Advanced Slides | Reveal.js presentations | @reveal.js/react or mdx-deck, 3-5 days |
| Admonition | Custom callout types + rendering | Extend Callout component, 1 day |
| Smart Connections | AI-powered note linking | Embedding similarity + UI, 5-10 days |
| Copilot | AI chat in sidebar | AI SDK + chat UI, 3-5 days (many existing components) |
| QuickAdd | Quick capture + template execution | Command palette + template system, 2-3 days |
| Iconize | Icons in file tree and notes | Lucide/custom icon component, 1 day |

### Finding: Plugins using custom codeblock syntax add specialized renderers
**Confidence:** INFERRED
**Evidence:** Obsidian Hub plugins by category, Obsidian forum

Plugins that use ` ```plugin-name ``` ` codeblock syntax for custom rendering:
- `dataview` / `dataviewjs` — query results
- `mermaid` — diagrams (built into Obsidian core)
- `chart` — Charts plugin (Chart.js)
- `kanban` — board syntax
- `tasks` — task queries
- `excalidraw` — drawing content
- `timeline` — timeline visualization
- `leaflet` — map embeds
- `plantuml` — UML diagrams

This pattern maps cleanly to the MDX component model: each custom codeblock type = a React component registered in getMDXComponents().

---

## Gaps / follow-ups

- Deep dive into Dataview query language specification for replication
- Smart Connections embedding model architecture
- Community plugins that modify the *editing experience* (not just rendering)
