# Obsidian for the Karpathy LLM Knowledge Base: Editing Experience & Output Rendering

**Date**: 2026-04-03
**Scope**: Deep dive into D5 (Editing Experience for LLM-Generated Content) and D6 (Output Rendering — Marp, Charts, Diagrams, Images) as they apply to the Karpathy LLM Knowledge Base workflow.

---

## Executive Summary

Obsidian is a strong but imperfect host for the Karpathy workflow. The editor handles LLM-generated markdown well in **Reading View** but has meaningful gaps in **Live Preview** (footnotes don't render, LaTeX in tables breaks, callouts with math fail). The most critical issue is **external file writing**: Obsidian silently overwrites external changes when a user edits a note an agent just modified, and cached images from matplotlib/scripts don't auto-refresh. Output rendering is rich — native Mermaid, MathJax, callouts, and strong plugin coverage for Marp, Excalidraw, and Chart.js — but plugin maturity varies and the Marp ecosystem is fragmented with no clear winner. Canvas is a genuine differentiator for agent-generated knowledge maps thanks to its trivially writable JSON format.

**Bottom line**: Obsidian works for this workflow, but requires architectural awareness — the agent must write via the REST API (not raw filesystem), avoid modifying open notes, and use unique filenames for regenerated images.

---

## D5: Editing Experience for LLM-Generated Content

### D5.1: Editor Modes — Detailed Behavior with LLM Output

Obsidian's three editor modes have meaningfully different capabilities for rendering LLM-generated markdown:

| Feature | Source Mode | Live Preview | Reading View |
|---|---|---|---|
| Complex tables | Raw text | Renders when cursor outside | Full render |
| LaTeX in table cells | Raw text | **BROKEN** (pipe conflicts) | Works |
| Nested lists (4+ deep) | Raw text | Renders with occasional indent issues | Works |
| Code blocks (syntax HL) | Prism.js highlighting | Renders when cursor outside | Full render |
| LaTeX math | Raw text | Renders via MathJax; jumpiness near cursor | Full render |
| Footnotes | Raw text | **DOES NOT RENDER** — shows raw `[^1]` | Full render with clickable links |
| Callouts with LaTeX | Raw text | Callout renders but **LaTeX inside does not** | Full render |
| Mermaid diagrams | Raw code | Renders when cursor outside | Full render |

**Key finding**: Live Preview is the flagship editing mode but has three significant gaps for LLM output — footnotes, LaTeX-in-tables, and LaTeX-in-callouts. These are well-documented bugs on the Obsidian forum ([footnotes](https://forum.obsidian.md/t/footnotes-are-not-rendered-in-live-preview-mode/75904), [LaTeX in tables](https://forum.obsidian.md/t/markdown-table-with-latex-formulas-breaks-in-live-preview-looks-good-in-read-mode/37101), [LaTeX in callouts](https://forum.obsidian.md/t/callouts-admonitions-do-not-render-latex-in-live-preview/44594)).

**Recommendation for the Karpathy workflow**: Review LLM-compiled articles in **Reading View** (everything renders correctly). Edit corrections in **Source Mode** (see raw markdown to fix syntax issues). Avoid Live Preview for content that combines math + tables or uses footnotes.

### D5.2: LLM-Generated Markdown Compatibility

Obsidian uses **CommonMark + GFM + Obsidian extensions** (wikilinks, embeds, callouts, highlights, comments, block IDs). The flavor is documented at [help.obsidian.md/obsidian-flavored-markdown](https://help.obsidian.md/obsidian-flavored-markdown) and a machine-readable skill definition exists at [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills/blob/main/skills/obsidian-markdown/SKILL.md).

**LLM output patterns that break in Obsidian**:

| Pattern | Problem | Severity |
|---|---|---|
| HTML tags (`<div>`, `<details>`) | Markdown inside HTML is **not rendered** — intentional design decision | High — LLMs frequently use `<details><summary>` |
| LaTeX pipes in tables (`$\|x\|$`) | Breaks table parser — pipe interpreted as column delimiter | Medium |
| Escaped newlines (`\n` literals) | Streaming LLMs produce literal `\n` strings instead of real newlines | Medium — depends on integration |
| Code fence wrappers (` ```markdown `) | LLMs wrap entire responses in markdown code blocks | Low — easy to strip |
| Standard links `[text](file.md)` | Works but loses Obsidian's rename-tracking vs `[[file]]` wikilinks | Low — functional but suboptimal |
| Non-CommonMark edge cases | Tight lists, lazy continuation differ from strict CommonMark | Low |

The HTML restriction is the most impactful: LLMs routinely generate `<details><summary>` collapsible sections, `<sub>`/`<sup>` tags, and `<mark>` highlighting. All of these render the inner markdown as literal text in Obsidian ([forum](https://forum.obsidian.md/t/no-markdown-inside-html-tags/26517)). The agent's system prompt must instruct LLMs to avoid HTML and use Obsidian-native equivalents (callouts for collapsibles, `==text==` for highlights).

### D5.3: External Process Writing to Files

This is the **highest-risk area** for the Karpathy workflow. The LLM agent writes compiled wiki articles, and the user simultaneously reviews and edits them in Obsidian.

**File detection**: On macOS/Windows, Obsidian uses Electron's `fs.watch` and detects external file creation and modification near-instantly. New `.md` files appear in the explorer and get indexed for search/links. On Linux, detection only works for the vault root directory — a [documented Electron limitation](https://forum.obsidian.md/t/expand-the-file-watcher-capability-to-the-whole-vault-instead-of-just-the-root/174).

**The critical danger — editing an open note during agent write**:
1. Obsidian does **NOT** auto-reload the visible content in the editor when the file changes on disk
2. The stale version remains displayed
3. If the user edits and saves, **Obsidian silently overwrites the agent's changes** — no conflict dialog, no merge
4. Workaround: navigate away from the note and back, or use "Force reload" command

Sources: [monitoring external changes](https://forum.obsidian.md/t/monitoring-for-external-changes/51660), [auto-reload request](https://forum.obsidian.md/t/is-there-a-way-to-auto-reload-changed-files/83006)

**Recommended architecture**: Use the [Obsidian Local REST API plugin](https://github.com/cyanheads/obsidian-mcp-server) as the write interface (Obsidian mediates all changes). Alternatively, write directly to the filesystem but ensure the agent never modifies a file the user currently has open. The [mcpvault](https://github.com/bitbonsai/mcpvault) MCP server provides a simpler direct-filesystem approach.

### D5.4: Canvas for Wiki Compilation Workflow

Canvas is a genuine differentiator for the Karpathy workflow. The [JSON Canvas format](https://jsoncanvas.org/spec/1.0/) is an open standard (MIT, [GitHub](https://github.com/obsidianmd/jsoncanvas)) consisting of flat JSON with `nodes` and `edges` arrays:

```json
{
  "nodes": [
    {"id":"n1","type":"file","file":"wiki/Transformers.md","x":0,"y":0,"width":400,"height":300},
    {"id":"n2","type":"file","file":"wiki/Attention.md","x":500,"y":0,"width":400,"height":300}
  ],
  "edges": [
    {"id":"e1","fromNode":"n1","toNode":"n2","label":"builds on","color":"#4CAF50"}
  ]
}
```

**Why this matters for the workflow**:
- An LLM agent can trivially generate `.canvas` files to visualize relationships between compiled wiki articles
- File-type nodes display **live content** from vault notes — the canvas always reflects latest article state
- Labeled, colored, directional edges represent semantic relationships
- Groups can cluster topic areas
- No binary components, diffs cleanly in git

**Limitations at scale**: Performance degrades with ~100+ nodes (stutter when nodes enter/exit viewport during panning). For larger knowledge bases, split into domain-specific canvases. [Advanced Canvas plugin](https://github.com/Developer-Mike/obsidian-advanced-canvas) adds collapsible groups, portals, and frontmatter-based auto-edge generation.

**LLM-native Canvas plugins**: [Canvas LLM Extender](https://github.com/Phasip/obsidian-canvas-llm-extender) generates connected nodes via OpenAI. [Cannoli](https://github.com/DeabLabs/cannoli) builds no-code LLM pipelines directly on Canvas. A [JSON Canvas MCP Server](https://mcpservers.org/servers/Cam10001110101/mcp-server-obsidian-jsoncanvas) enables direct agent read/write.

### D5.5: YAML Frontmatter and Properties

Obsidian's Properties view (introduced v1.4) provides a structured UI for editing frontmatter without touching raw YAML. Six property types: Text, List, Number, Checkbox, Date (ISO 8601), Date & Time. Properties auto-suggest from vault-wide tracking and a dedicated sidebar pane manages all properties. ([docs](https://help.obsidian.md/properties))

**Mode behavior**: Live Preview and Reading View replace raw YAML with the Properties widget. Source Mode shows the full `---` block.

**LLM-generated frontmatter pitfalls**:
- **Nested YAML is not supported** by the Properties system — keep frontmatter flat
- Obsidian's `processFrontMatter` API is destructive — silently removes comments, alters quoting, reformats types ([forum](https://forum.obsidian.md/t/yaml-properties-api-processfrontmatter-removes-alters-string-quotes-comments-types-formatting/65851?page=2))
- YAML-ambiguous values (`yes`, `no`, `null`) get misinterpreted — quote defensively
- Malformed YAML breaks entire note's metadata

**Integration with query layers**: All frontmatter properties are queryable by both [Dataview](https://blacksmithgu.github.io/obsidian-dataview/annotation/add-metadata/) (`WHERE status = "draft"`) and [Bases](https://help.obsidian.md/bases/syntax) (first-party database views). This means an LLM agent can tag compiled articles with structured metadata (status, topic, source count, confidence score, last compiled date) and the user can build dashboards over the wiki.

### D5.6: Large File Handling

**10K-word articles are a non-issue.** A 10K-word compiled article is ~60 KB — roughly 100x smaller than Obsidian's problem threshold.

| File Size | Desktop Behavior |
|---|---|
| Up to ~10,000 lines / few hundred KB | Smooth editing |
| ~40,000+ lines | Lag begins |
| 7.5 MB+ | Up to a minute per edit or full freeze |
| 14.1 MB (2.6M words) | Loads, freezes for seconds mid-document |

Sources: [large file performance](https://forum.obsidian.md/t/ui-performance-issues-with-large-files/13782), [stress test](https://www.zsolt.blog/2021/05/obsidian-performance-test-take-1.html)

**Mode performance**: Source Mode is fastest (no rendering overhead). Live Preview is slowest — large tables cause 5+ second renders ([forum](https://forum.obsidian.md/t/large-tables-slow-to-render-in-live-preview/85013)). Reading View renders once (no cursor tracking) and is fine for reading.

**CodeMirror 6** uses viewport-based rendering (only visible lines in DOM) and progressive highlighting that intentionally stops after a budget ([million-line demo](https://codemirror.net/examples/million/)). Single very-long lines (30K+ chars) can cause breakage ([issue](https://github.com/codemirror/dev/issues/1089)).

---

## D6: Output Rendering — Marp, Charts, Diagrams, Images

### D6.1: Marp Plugin Maturity

The Marp ecosystem in Obsidian is **fragmented with no dominant winner**:

| Plugin | Downloads | Last Update | Verdict |
|---|---|---|---|
| [Marp Slides](https://github.com/samuele-cozzi/obsidian-marp-slides) | 32,149 | May 2024 | Most popular but stale (11+ months) |
| [Marp](https://github.com/JichouP/obsidian-marp-plugin) | 14,642 | Aug 2023 | Very stale (2.5+ years) |
| [Marp Extended](https://github.com/mhenze-exaring/marp-extended-plugin) | Low | Dec 2025 | Most feature-rich but only 3 GitHub stars |
| [Marp Presentations](https://github.com/bjesuiter/obsidian-marp-presentations) | Minimal | Early stage | Experimental |

**Capabilities across plugins**: Preview in sidebar/tab, export to PDF/PPTX/HTML (requires Node.js + Chrome/Chromium for export), custom CSS themes, images/code/math in slides. No true fullscreen presenter mode built into Obsidian.

**The competitor**: [Slides Extended](https://www.obsidianstats.com/plugins/slides-extended) (reveal.js, 29K downloads, actively maintained March 2026) offers animations, fragments, and speaker notes — better for interactive presentations. Marp is better for static deck generation and PDF export.

**LLM compatibility**: Marp format is trivially LLM-friendly — standard markdown with `---` slide separators and a `marp: true` YAML header. Only caveat: Obsidian wikilinks don't work in Marp, so LLMs should use standard markdown links.

**Karpathy context**: He likely uses Marp CLI or VS Code's Marp extension alongside Obsidian rather than relying solely on Obsidian plugins, given the maturity gap.

### D6.2: Mermaid Diagrams

Obsidian bundles **Mermaid.js 11.4.1** natively (no plugin required). This supports: flowcharts, sequence diagrams, Gantt charts, class diagrams, state diagrams, ER diagrams, pie charts, git graphs, mindmaps, timeline, Sankey, and quadrant charts.

**Does NOT support** (requires newer Mermaid): packet diagrams (packet-beta), block diagrams, ZenUML ([request](https://forum.obsidian.md/t/please-update-obsidians-mermaid-integration-to-a-version-supporting-the-packet-diagram-syntax/87755)).

**Dark mode is a persistent pain point**: Mermaid's default theme clashes with Obsidian dark backgrounds, making text in mindmaps, sequence diagrams, and pie charts nearly unreadable. Workaround: `%%{init: {'theme':'dark'}}%%` per diagram. Obsidian does NOT auto-match themes ([request](https://forum.obsidian.md/t/mermaid-theme-needs-to-mirror-obsidian-theme/61117)).

**LLM-generated Mermaid**: Works well. Claude and GPT-4 produce Mermaid that renders correctly in Obsidian most of the time. Main risk: LLMs occasionally use syntax from newer Mermaid versions (block diagrams, packet-beta) that Obsidian's 11.4.1 doesn't support. Special characters in node labels can also cause parse failures. ([evaluation](https://microsoft.github.io/genaiscript/blog/mermaids/), [Claude + Mermaid](https://spin.atomicobject.com/diagrams-mermaid-excalidraw/))

**Key limitations**: No custom configuration (ignores `elk` layout directives — [forum](https://forum.obsidian.md/t/support-for-mermaid-diagram-configurations/112732)), no interactivity/click handlers, no scroll/zoom for large diagrams, must embed in code blocks (unless using [Mermaid View plugin](https://simonecarletti.com/blog/2026/02/obsidian-mermaid-view/) for standalone `.mermaid` files).

**Enhancing plugins**: [Mermaid Tools](https://github.com/dartungar/obsidian-mermaid) (insertion toolbar), [Mehrmaid](https://github.com/search?q=mehrmaid+obsidian) (renders Obsidian links/tags inside node labels), [Mermaid View](https://simonecarletti.com/blog/2026/02/obsidian-mermaid-view/) (standalone files, pan/zoom, SVG/PNG export, proper theming).

### D6.3: Excalidraw Integration

The [Excalidraw plugin](https://github.com/zsviczian/obsidian-excalidraw-plugin) by Zsolt Viczian is the **most downloaded Obsidian community plugin** (3.24M downloads, 6.4K GitHub stars, v2.11.x, monthly releases).

**Integration depth** — deep and bidirectional:
- Embed drawings in notes: `![[drawing.excalidraw]]` with size params and group targeting
- Full Excalidraw editor pane within Obsidian
- Link TO vault notes from drawing elements (CTRL+click follows)
- Embed vault notes IN drawings (renders markdown on canvas)
- Block references bidirectionally
- File format: `.excalidraw.md` (markdown with YAML + compressed JSON — vault-searchable, git-diffable)

**For the Karpathy knowledge mapping workflow**: Excalidraw + [ExcaliBrain](https://www.obsidianstats.com/plugins/excalibrain) auto-generates interactive knowledge graphs from vault links, dataview fields, tags, and frontmatter. Mind mapping is a [documented use case](https://www.zsolt.blog/2021/09/mind-mapping-with-excalidraw-in-obsidian.html).

**Programmatic/LLM creation**: The Excalidraw format is plaintext JSON ([schema](https://docs.excalidraw.com/docs/codebase/json-schema)). The plugin ships **ExcalidrawAutomate** — a full JS API with [dedicated LLM training data](https://excalidraw-obsidian.online/WIKI/07+Developer+Docs/Excalidraw+Automate+library+file+(not+only)+for+LLM+training). An [MCP server for Excalidraw](https://github.com/yctimlin/mcp_excalidraw) exists. Claude can [generate Excalidraw JSON](https://workos.com/blog/excalidraw-skills-agents-describe-themselves).

**vs Canvas**: Excalidraw excels at freehand drawing and creative diagramming. Canvas excels at spatial arrangement of existing notes. They are complementary.

### D6.4: Matplotlib/Generated Images

**Image embedding** works via `![[image.png]]` or `![](image.png)`, supporting PNG, JPG, GIF, SVG, WebP, BMP. Sizing via `![[image.png|600]]` (width) or `![[image.png|600x400]]` (width x height). ([docs](https://forum.obsidian.md/t/resize-image/6517))

**The auto-refresh problem**: When a Python script overwrites `plot.png`, Obsidian does **NOT** refresh the displayed image due to Electron/Chromium in-memory caching. This is a [longstanding feature request](https://forum.obsidian.md/t/automatically-refresh-images-when-the-image-file-changes/45331) with no native solution. The [cache bug](https://forum.obsidian.md/t/cache-not-updated-after-image-modification/83112) is confirmed.

**Workaround for LLM agents**: Generate unique filenames per render (e.g., `plot_20260403_143022.png`) and update the embed link in the markdown file. This sidesteps the cache entirely and provides a natural history of generated plots.

**SVG support**: File references (`![[diagram.svg]]`) work. Inline SVG (`<svg>` tags) works in Reading Mode but breaks when the note is embedded in another note ([forum](https://forum.obsidian.md/t/embedding-a-note-which-contains-an-inline-svg/55077)). Recommendation: save as `.svg` files and use file embeds.

### D6.5: Other Rendering Capabilities

| Capability | Support Level | Source |
|---|---|---|
| **LaTeX math** (MathJax) | Native — `$...$` inline, `$$...$$` display. Custom macros via [Extended MathJax plugin](https://www.obsidianstats.com/plugins/obsidian-latex) | Built-in |
| **Callouts/admonitions** | Native — 12 types, foldable, customizable via CSS | [docs](https://help.obsidian.md/callouts) |
| **Chart.js charts** | Plugin — [Obsidian Charts](https://github.com/phibr0/obsidian-charts) (282K downloads, YAML code blocks) | Community |
| **Plotly** | Plugin — [Obsidian Plotly](https://github.com/Dmytro-Shulha/obsidian-plotly) (low adoption, 2021 vintage) | Community |
| **PlantUML** | Plugin — [obsidian-plantuml](https://github.com/joethei/obsidian-plantuml) (online server or local JAR) | Community |
| **D3.js** | Plugin — [obsidian-d3js](https://github.com/r-tae/obsidian-d3js) (experimental) | Community |
| **Execute Code inline** | Plugin — [Execute Code](https://github.com/twibiral/obsidian-execute-code) (runs Python/JS/etc.) | Community |
| **HTML** | Partial — basic HTML in Reading Mode; markdown inside HTML NOT rendered | Built-in |
| **iframes / embedded web** | Plugin — [iframe-renderer](https://github.com/natarslan/obsidian-iframe-renderer), [local-html-embed](https://github.com/Poesy-Lab/obsidian-local-html-embed) | Community |

**Obsidian Publish compatibility**: Native features (images, math, Mermaid, callouts) work in Publish. Community plugin rendering (Charts, Plotly, PlantUML, D3, Execute Code) does **NOT** work in Publish ([limitations](https://help.obsidian.md/publish/limitations)). For publishing with plugin content, use [Quartz](https://quartz.jzhao.xyz/) or Hugo export.

### D6.6: End-to-End Assessment for the Karpathy Workflow

Karpathy's workflow renders markdown, Marp slides, and matplotlib images all in Obsidian. Here's how each piece actually works:

| Output Type | How It Works | Friction Level |
|---|---|---|
| **Compiled markdown articles** | Seamless — Obsidian's core strength. Review in Reading View. | None |
| **Marp presentations** | Works but plugin ecosystem is fragmented/stale. Export requires Node.js + Chrome. May need Marp CLI alongside Obsidian. | Medium |
| **Mermaid diagrams** | Native, good. Dark mode requires per-diagram config. Version lag blocks newest diagram types. | Low |
| **Matplotlib PNG plots** | Works but no auto-refresh when regenerated. Use unique filenames per render. | Medium |
| **LaTeX math** | Native MathJax. Works well except in tables/callouts in Live Preview. | Low |
| **Excalidraw knowledge maps** | Excellent. Deep integration, LLM-writable format, ExcaliBrain for auto-graphs. | Low |
| **Canvas relationship maps** | Excellent. Trivially writable JSON, live note embedding, labeled connections. | Low |
| **YAML frontmatter metadata** | Works with flat structures. Queryable via Dataview/Bases for dashboards. | Low |
| **Chart.js inline charts** | YAML code blocks in Obsidian Charts. LLM-friendly. Plugin unmaintained (~2 yrs). | Medium |

**What's seamless**: Markdown rendering, Mermaid diagrams, callouts, math, Canvas generation, Excalidraw knowledge maps, frontmatter-based dashboards.

**What's hacky**: Image cache refresh (requires unique filenames), Marp (fragmented plugins), dark mode Mermaid (per-diagram config), external file conflict avoidance (architectural constraint), HTML content (no markdown rendering inside HTML tags).

---

## Key Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Agent overwrites user edits (or vice versa) on open notes | High — silent data loss | Use REST API; don't modify open notes; implement file locking protocol |
| Image cache doesn't refresh | Medium — user sees stale plots | Unique filenames per render; update embed links |
| LLM generates HTML that doesn't render markdown | Medium — content appears broken | System prompt instructs LLMs to use Obsidian-native syntax only |
| Marp plugins unmaintained | Medium — export may break | Use Marp CLI as backup; monitor plugin updates |
| Dark mode Mermaid unreadable | Low — cosmetic | Add `%%{init: {'theme':'dark'}}%%` via agent template |
| Footnotes invisible in Live Preview | Low — use Reading View | Document workflow: review in Reading View |

---

## Evidence Files

- [editing-modes-llm-content.md](evidence/editing-modes-llm-content.md) — Detailed mode behavior, markdown compatibility, LLM pitfalls
- [external-file-writing.md](evidence/external-file-writing.md) — File watching, conflict behavior, architecture recommendations
- [canvas-json-format.md](evidence/canvas-json-format.md) — JSON Canvas spec, programmatic creation, scale performance
- [yaml-frontmatter-properties.md](evidence/yaml-frontmatter-properties.md) — Properties view, Dataview/Bases integration, LLM frontmatter issues
- [large-file-performance.md](evidence/large-file-performance.md) — Size limits, mode performance, CodeMirror 6 characteristics
- [marp-plugins.md](evidence/marp-plugins.md) — All Marp plugins compared, Slides Extended alternative, LLM compatibility
- [mermaid-support.md](evidence/mermaid-support.md) — Mermaid version, supported diagram types, dark mode, LLM generation
- [excalidraw-integration.md](evidence/excalidraw-integration.md) — Plugin depth, ExcalidrawAutomate, MCP server, LLM training data
- [image-chart-rendering.md](evidence/image-chart-rendering.md) — Image caching, SVG, Chart.js, LaTeX, callouts, Publish compatibility
