---
title: "Obsidian for the Karpathy 'LLM Knowledge Base' Workflow: Capability-by-Capability Deep Dive"
description: "Evaluates Obsidian against each stage of Karpathy's LLM Knowledge Base workflow — raw ingest, LLM-compiled wiki, Q&A, rendered output, wiki linting, search, and compounding knowledge. Covers ingestion fidelity, wiki compilation tooling, MCP/agent integration, search (BM25 to semantic), editing of LLM output, output rendering (Marp/Mermaid/Excalidraw/matplotlib), version history, collaboration, practitioner accounts, and Obsidian's irreducible strengths."
createdAt: 2026-04-02
updatedAt: 2026-04-03
subjects:
  - Obsidian
  - Andrej Karpathy
  - Claude Code
  - Model Context Protocol
  - Knowledge Management
topics:
  - LLM knowledge bases
  - agent-compiled wikis
  - ingestion pipelines
  - semantic search
  - version control
  - wiki compilation
  - output rendering
---

# Obsidian for the Karpathy "LLM Knowledge Base" Workflow

**Purpose:** Evaluate Obsidian capability-by-capability against the specific workflow Andrej Karpathy described — raw ingest, LLM-compiled wiki, Q&A, rendered output, wiki linting, search engine, and compounding knowledge — to inform the design of a replacement product. This report extends two prior reports (competitive landscape analysis and agent wiki integration) by going deeper on dimensions they did not cover.

---

## Executive Summary

Andrej Karpathy's "LLM Knowledge Base" workflow uses Obsidian as a filesystem and renderer while external scripts do the actual work. Every practitioner replicating this workflow follows the same pattern: Obsidian stores and displays; Claude Code, Cursor, or custom scripts process. Nobody is running the full compile-lint-compound loop inside Obsidian, because **the orchestration layer that connects these stages does not exist** — not as a plugin, not as an MCP server, not as a community project.

Obsidian genuinely excels at four stages: **raw ingest** (Web Clipper with Defuddle extraction is best-in-class for manual web capture), **rendered output** (native Mermaid, MathJax, Canvas, and deep Excalidraw integration), **Q&A** (Sonar and QMD now provide validated hybrid BM25+semantic+reranking locally), and **storage** (plain markdown files with wikilinks and git compatibility). It partially supports two stages: **wiki compilation** (Dataview generates dynamic indexes, Templater scaffolds articles, but no tool synthesizes raw sources into structured wiki pages) and **version history** (Obsidian Git at 10K+ stars is mature, but no mechanism distinguishes agent changes from human edits). It fails at two stages: **wiki linting** (no background health checks, no consistency verification, no agent trigger system) and **compounding** (no automatic feedback loop where outputs enrich the knowledge base).

The single highest-value gap is the **compilation orchestration layer** — the system that watches for new raw content, reads existing wiki structure, calls an LLM to synthesize structured articles, adds cross-references, updates indexes, and repeats continuously. This is exactly what Karpathy describes and exactly what no Obsidian tool provides.

**Key Findings:**

- **Obsidian Web Clipper uses Defuddle** (built by kepano) for content extraction, producing 90-95% fidelity on text-heavy articles but failing on SPAs and JS-rendered content. No batch/programmatic clipping API exists.
- **No tool performs the "compilation step"** — the transformation of raw sources into structured wiki articles. InsightA (article decomposition) and Notemd (auto-linking) approximate pieces, but the orchestration connecting them does not exist.
- **10+ MCP servers now exist** with three architectural approaches (filesystem, REST API bridge, native plugin). No single server covers all workflow stages. The critical discovery: `vault.process` and `vault.modify` silently fail during active user editing due to a 2-second debounce bug.
- **Search has quietly become strong** — Sonar (fully local, hybrid BM25+semantic+reranking) matched cloud GPT-4.1-mini accuracy (43% vs 42%) on Meta CRAG benchmark. QMD (by Shopify CEO Tobi Lutke) adds sophisticated chunking with reranking. For ~100 articles, Obsidian + plugins provides ~80% of purpose-built search quality.
- **The biggest search gap is combined metadata+semantic queries** — no tool can issue "find articles tagged #transformers from 2024 about efficiency" as a single operation.
- **Canvas is an underappreciated differentiator** — the JSON Canvas format is trivially writable by LLMs, displays live note content, and diffs cleanly in git. An agent can generate relationship maps as easily as it generates markdown.
- **External file writing is risky** — when an agent modifies a file the user has open, Obsidian silently overwrites agent changes on next user save. obsidian-drift plugin provides the only safety net (side-by-side diff with selective accept/reject).
- **Git via Obsidian Git is the best version control option** (10K+ stars, 2.3M downloads) but requires discipline: agents must commit with distinct identity for attribution, and no visual merge conflict resolution exists in Obsidian.
- **Every practitioner uses Obsidian as filesystem + renderer, never as processor.** The AI processing always happens in external tools (Claude Code, Cursor, custom scripts).
- **kepano's strategy is deliberate:** teach agents file formats via obsidian-skills rather than embed AI. This creates space for external tools but leaves workflow orchestration permanently unsolved within Obsidian.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Ingestion capabilities | Deep | P0 |
| D2 | Wiki compilation / auto-linking | Deep | P0 |
| D3 | MCP / Agent integration | Deep | P0 |
| D4 | Search capabilities | Deep | P0 |
| D5 | Editing experience for LLM output | Deep | P0 |
| D6 | Output rendering (Marp, charts, diagrams) | Deep | P0 |
| D7 | Version history and persistence | Deep | P0 |
| D8 | Collaboration and sharing | Moderate | P1 |
| D9 | The Karpathy workflow in practice | Deep | P0 |
| D10 | What Obsidian does exceptionally well | Deep | P0 |

**Stance:** Factual/academic. No recommendations — present the capability landscape for a downstream product design agent to draw conclusions.

**Non-goals:** General Obsidian overview (covered in prior reports), plugin development tutorials, tool-by-tool comparison (covered in competitive landscape report), content authoring workflows (covered in prior report).

---

## Detailed Findings

### D1: Ingestion Capabilities

**Finding:** Obsidian has a rich but fragmented ingestion ecosystem. The Web Clipper is excellent for manual single-article capture but has no batch API. Programmatic ingest works via direct filesystem writes, the new CLI (Feb 2026), or MCP servers. PDF, academic paper, and JS-rendered content are the weak points.

**Evidence:** [evidence/ingestion-capabilities.md](evidence/ingestion-capabilities.md)

#### Web Clipper

The [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) is a browser extension using a 3-stage pipeline: [Defuddle](https://github.com/kepano/defuddle) content extraction (built by kepano as a Mozilla Readability replacement), optional LLM processing, and template-based markdown rendering. Defuddle is more forgiving than Readability, handles MathJax/KaTeX/MathML, preserves code block language identifiers, and standardizes footnotes.

The template system is the Clipper's strongest feature: JSON-based templates with 50+ chainable filters, URL-based auto-trigger matching, and community template repositories. Browser support spans Chrome, Firefox, Safari (macOS/iOS), Edge, and Chromium derivatives.

**Critical limitation: images remain as external URLs.** No local download ([Issue #37](https://github.com/obsidianmd/obsidian-clipper/issues/37)). Workaround: Local Images Plus plugin as post-processing. Twitter/X clipping is broken ([#676](https://github.com/obsidianmd/obsidian-clipper/issues/676)). No batch/programmatic API — each page requires manual action.

#### Conversion Fidelity by Content Type

| Content Type | Fidelity | Notes |
|---|---|---|
| Text-heavy articles | 90-95% | Optimized for this |
| Documentation sites | 85-90% | Tabs, interactive examples degrade |
| Academic papers (HTML) | 70-80% | Math challenging; citation structure lost |
| Academic papers (PDF) | 60-80% | MinerU best for formulas (GPU required); Marker achieves 95.67% accuracy |
| Twitter/X, Reddit | 40-60% | Auth barriers, threading structure lost |
| SPAs / JS-heavy sites | 0-40% | Content invisible without headless pre-rendering |

#### Ingest Plugin Landscape

- **ReadItLater** ([GitHub](https://github.com/DominikPieper/obsidian-ReadItLater), ~620 stars): Paste URL, fetch, convert. Supports web articles, YouTube, Twitter/X, Stack Exchange, Wikipedia, Substack, GitHub. Downloads images locally. Actively maintained.
- **Readwise Official** ([GitHub](https://github.com/readwiseio/obsidian-readwise)): Syncs highlights from Kindle, Apple Books, Instapaper, Pocket, Medium, podcasts. Jinja2 templating. Append-only. Requires paid subscription ($7.99/mo).
- **ZotLit** ([GitHub](https://github.com/PKM-er/obsidian-zotlit), ~900 stars): Academic papers via Zotero. Bulk export, annotation extraction.
- **Email ingest:** Weakest area. No mature solution.
- **PDF:** Native inline viewing. [PDF++](https://github.com/RyotaUshio/obsidian-pdf-plus) for Obsidian-native annotations stored as markdown backlinks.

#### Programmatic Ingest

Three paths: (1) Direct filesystem writes — simplest, Obsidian detects new files on refresh. (2) [Obsidian CLI](https://help.obsidian.md/cli) (Feb 2026, Catalyst License) — 100+ commands including `create`, `append`, `search`. (3) MCP servers — mcpvault's `write_note` for structured writes with frontmatter.

**Karpathy workflow fit:** For the "raw/ directory" stage, direct filesystem writes are optimal. A script fetches articles, converts to markdown, adds YAML frontmatter, writes to `raw/`. Obsidian picks them up. The Web Clipper works for manual article capture but cannot be automated.

---

### D2: Wiki Compilation / Auto-Linking

**Finding:** Obsidian has powerful linking primitives and dynamic indexing via Dataview, but **no tool performs the core "compilation step"** where raw sources are synthesized into structured wiki articles. This is the single largest gap.

**Evidence:** [evidence/wiki-compilation.md](evidence/wiki-compilation.md)

#### Native Linking Model

Wiki-links (`[[Note Name]]`) are case-insensitive with space/hyphen/underscore normalization. Rich link types include aliases (`[[Note|display]]`), heading links (`[[Note#Heading]]`), block references (`[[Note#^block-id]]`), embeds (`![[Note]]`), sized images (`![[img.png|640]]`), and PDF page embeds (`![[doc.pdf#page=3]]`). Links auto-update on rename/move.

The backlinks panel shows two sections: linked mentions (explicit links) and unlinked mentions (title/alias text matches). **No native bulk "link all" button** — most-requested feature since 2020 ([forum](https://forum.obsidian.md/t/link-all-unlinked-mentions-with-one-click/1045)). One-at-a-time conversion only. This is a critical gap for agent workflows that need to auto-link content at scale.

Graph view: local graph is useful for exploring idea neighborhoods. Global graph is decorative at scale — freezes at ~2,000 densely-linked notes, crashes at ~10,000+, 130K notes takes ~10 minutes to index.

#### Dataview (Dynamic Indexes)

[Dataview](https://github.com/blacksmithgu/obsidian-dataview) (~8,700 stars) provides SQL-inspired DQL with TABLE/LIST/TASK/CALENDAR queries, FROM/WHERE/SORT/GROUP BY/FLATTEN/LIMIT. DataviewJS enables full JavaScript execution. This is the primary tool for dynamic Maps of Content — tag-based, folder-based, or backlink-based MOCs that self-update.

**Limitations:** Output is read-only. Cannot query note body text (only metadata). Not real-time. **Effectively in maintenance mode** (last commit 10+ months old). Official claim of scaling to "hundreds of thousands of notes" contradicted by 9,000 notes causing 199.6% CPU ([Issue #1280](https://github.com/blacksmithgu/obsidian-dataview/issues/1280)). Successor [Datacore](https://github.com/blacksmithgu/datacore) is in development (2-10x faster, editable tables). Obsidian's built-in Bases is emerging as native replacement.

#### Templater (Note Scaffolding)

[Templater](https://github.com/SilentVoid13/Templater) (~4,700 stars, actively maintained) provides JavaScript execution in templates, file creation/move/rename, external API calls (bypasses CORS), system command execution. Could call LLM API endpoints directly and inject responses. **Critical distinction:** Templater executes once and replaces — it is a generator, not a continuous indexer.

#### Maps of Content (MOC) Automation

- **InsightA** ([GitHub](https://github.com/HongjianTang/obsidian-insighta)): LLM-powered. Transforms long articles into atomic notes + MOCs. **Closest existing plugin to Karpathy's compilation step.** But one-shot, not continuous.
- **AutoMOC** ([GitHub](https://github.com/dalcantara7/obsidian-auto-moc)): Rule-based import of backlinks, tagged mentions.
- **Waypoint** ([GitHub](https://github.com/IdreesInc/Waypoint)): Dynamic MOCs within folder notes.
- **Notemd** ([GitHub](https://github.com/Jacobinwwey/obsidian-NotEMD)): Context-aware wiki-link insertion, concept note generation.
- **Automatic Linker**: Converts text matching filenames to wikilinks (rule-based).

#### The Compilation Gap

The workflow `raw/ → LLM compilation → wiki/` requires: (1) detect new raw content, (2) read raw sources, (3) synthesize structured articles, (4) add cross-references, (5) update MOCs, (6) generate visualizations, (7) file back into wiki, (8) repeat continuously. Obsidian provides adequate tools for steps 2, 4 (partial), 5 (partial), and 7. Steps 1, 3, 6, and 8 have no solution — they require an external orchestration layer.

**No practitioner has publicly documented a fully automated compile loop in Obsidian.** The closest approaches combine InsightA (atomization) + Notemd (linking) + Claude Code (ad-hoc maintenance), but the orchestration connecting them does not exist as a packaged solution.

---

### D3: MCP / Agent Integration

**Finding:** 10+ MCP servers exist across three architectural categories. The ecosystem is broader than commonly understood but fragmented — no single server covers all workflow stages. The critical discovery is a concurrency bug: `vault.process` and `vault.modify` silently fail during active user editing.

**Evidence:** [evidence/agent-integration.md](evidence/agent-integration.md)

#### MCP Server Landscape

| Server | Stars | Architecture | Key Differentiator |
|---|---|---|---|
| [mcpvault](https://github.com/bitbonsai/mcpvault) | 994 | Direct filesystem | BM25 search, zero deps, read-only default |
| [obsidian-mcp-pro](https://glama.ai/mcp/servers/rps321321/obsidian-mcp-pro) | — | Direct filesystem | 23 tools, graph traversal, broken link finder, canvas CRUD |
| [aaronsb/mcp-plugin](https://github.com/aaronsb/obsidian-mcp-plugin) | 271 | Native Obsidian plugin | Dataview DQL, Bases queries, <10ms ops |
| [obsidian-mcp-tools](https://github.com/jacksteamdev/obsidian-mcp-tools) | 703 | Native Obsidian plugin | Semantic search (Smart Connections), Templater execution |
| [dp-veritas](https://github.com/dp-veritas/mcp-obsidian-tools) | 4 | Direct filesystem | **Only read-only server** |
| [Hybrid Search MCP](https://forum.obsidian.md/t/hybrid-search-hybrid-search-mcp-server-cli-for-ai-assistants-bm25-semantic-obsidian-native/112491) | — | Direct filesystem | Triple-path retrieval (BM25+fuzzy+semantic) with RRF |

Direct filesystem servers are most popular because they require zero plugins and work when Obsidian is closed. But they bypass Obsidian's internal state — a fundamental trade-off.

#### kepano/obsidian-skills Analysis

[obsidian-skills](https://github.com/kepano/obsidian-skills) (19,200+ stars) provides 5 SKILL.md files: obsidian-markdown (wikilinks, embeds, callouts, frontmatter, math, Mermaid), obsidian-bases (.base format, filters, formulas), json-canvas (.canvas format), obsidian-cli (15+ CLI commands), and defuddle (web content extraction). The markdown skill is surprisingly thorough — covers every Obsidian-specific syntax element an agent needs.

**Gaps in the skills:** No guidance on Dataview queries, search operators, batch operations, file organization for large vaults, or conflict resolution for external writes.

#### Filesystem Concurrency — The Critical Bug

Obsidian uses `fs.watch` with platform-native APIs (FSEvents on macOS, inotify on Linux) with a ~2-second debounce window. On cloud-synced vaults (iCloud, Dropbox, OneDrive), Obsidian switches to **polling with 30-second interval**.

**The critical bug:** `vault.process` and `vault.modify` — Obsidian's own atomic write methods — **fail silently if called within 2 seconds of user editing** due to the `requestSave` debounce event ([forum](https://forum.obsidian.md/t/vault-process-and-vault-modify-dont-work-when-there-is-a-requestsave-debounce-event/107862)). This means even REST API-based writes can silently fail when the user is actively typing.

| Scenario | Direct Filesystem | REST API | Native Plugin |
|---|---|---|---|
| Create new file | Safe | Safe | Safe |
| Modify closed file | Safe | Safe | Safe |
| Modify open file (user editing) | **RISKY — overwrites** | **RISKY — debounce bug** | **RISKY — debounce bug** |
| Rename file | **BREAKS LINKS** | Safe (updates links) | Safe |
| Crash mid-write | **CORRUPTS FILE** | Protected | Protected |

**Mitigation:** [obsidian-drift](https://github.com/ryanbbrown/obsidian-drift) — purpose-built plugin for detecting external modifications from agents, provides side-by-side diff with selective accept/reject.

**For the Karpathy workflow:** The "compile wiki" stage creates many NEW files — the safest operation. The riskier stages are "wiki linting" (modifying existing files) and reading during active editing.

---

### D4: Search Capabilities

**Finding:** Search has quietly become Obsidian's strongest dimension for the Karpathy workflow. Sonar (local hybrid BM25+semantic+reranking) matched cloud GPT-4.1-mini accuracy. For ~100 articles / ~400K words, Obsidian + plugins provides ~80% of purpose-built search quality. The biggest gap is combined metadata+semantic queries.

**Evidence:** [evidence/search-capabilities.md](evidence/search-capabilities.md)

#### Built-in Search (Deeper Than Expected)

Operators: `file:`, `path:`, `tag:`, `line:`, `block:`, `section:`, `task:`, `match-case:`, `ignore-case:`. Full JavaScript regex. Boolean logic with AND/OR/negation/grouping.

**Under-documented power feature:** `[property:value]` syntax enables native frontmatter search — `[author:Karpathy]`, `[status:Draft OR Published]`, `[source:null]`. Composes with all other operators.

**Embedded search results:** Notes can embed live, auto-updating search results via `query` code blocks — useful for dynamic "index" notes.

**Missing:** No relevance ranking (modification time only), no fuzzy content matching, no semantic understanding, no date range operators.

#### Semantic Search — The 2025-2026 Explosion

| Plugin | Stars/Downloads | Approach | Reranking | Hardware |
|---|---|---|---|---|
| [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) | 4.4K / 786K | Local embeddings + Smart Chat RAG | No | Any |
| [Obsidian Copilot](https://github.com/logancyang/obsidian-copilot) | 6.6K / 100K+ | Hybrid BM25+semantic, Orama vector DB | No | Any |
| [Smart Composer](https://github.com/glowingjade/obsidian-smart-composer) | 2.2K | Explicit RAG, configurable chunking | No | Any |
| [Sonar](https://forum.obsidian.md/t/ann-sonar-offline-semantic-search-and-agentic-ai-chat-for-obsidian-powered-by-llama-cpp/110765) | New (Feb 2026) | Fully offline via llama.cpp, BGE-M3 + BM25 + reranking | **Yes** (BGE Reranker v2-m3) | 32GB+ RAM |
| [QMD](https://github.com/thirteen37/obsidian-qmd) | New | BM25 + semantic + query expansion + reranking | **Yes** (Qwen3-Reranker) | Any (Transformers.js) |

**Sonar benchmark:** 43% accuracy, 32% hallucination on Meta CRAG — matched cloud GPT-4.1-mini (42%/35%) running fully local.

**QMD** is a port of [Tobi Lutke's QMD](https://github.com/tobi/qmd) (Shopify CEO). Uses AST-aware chunking for code files, heading-boundary-preferring chunks for markdown, and position-aware RRF fusion.

#### The Biggest Search Gap

**No tool can combine structured metadata queries with semantic search.** You cannot issue `WHERE date >= '2024' AND tag:#transformers AND semantic('efficiency approaches')` as a single operation. Dataview handles metadata; semantic plugins handle meaning; they do not compose.

#### For the Karpathy Q&A Stage (~100 articles)

This vault size is well within Obsidian's comfortable range. BM25 alone is sufficient for keyword retrieval. Adding Sonar or QMD for semantic queries makes the experience comparable to a dedicated knowledge retrieval system. Cross-note reasoning ("compare Author A's position with Author B's") remains poor — no plugin synthesizes across multiple notes.

---

### D5: Editing Experience for LLM-Generated Content

**Finding:** Obsidian handles LLM output well in Reading View but has meaningful gaps in Live Preview (footnotes, LaTeX in tables, LaTeX in callouts). The most critical issue is external file writing: Obsidian silently overwrites external changes when a user edits a note an agent just modified.

**Evidence:** [evidence/editing-experience.md](evidence/editing-experience.md)

#### Mode Behavior with LLM Output

| Feature | Source Mode | Live Preview | Reading View |
|---|---|---|---|
| Complex tables | Raw text | Renders | Full render |
| LaTeX in tables | Raw text | **BROKEN** (pipe conflicts) | Works |
| Footnotes | Raw text | **Does not render** | Full render with clickable links |
| Callouts with LaTeX | Raw text | Callout renders, **LaTeX inside does not** | Full render |
| Mermaid diagrams | Raw code | Renders when cursor outside | Full render |
| Code blocks | Prism.js HL | Renders when cursor outside | Full render |

**Recommendation:** Review LLM-compiled articles in Reading View. Edit in Source Mode.

#### LLM Output That Breaks in Obsidian

**HTML is the biggest problem.** Obsidian intentionally does not render markdown inside HTML elements. LLMs routinely generate `<details><summary>`, `<sub>/<sup>`, `<mark>` — all render inner markdown as literal text. The agent's system prompt must instruct LLMs to use Obsidian-native equivalents.

Other breakage: LaTeX pipes in tables (pipe interpreted as column delimiter), literal `\n` strings from streaming LLMs, standard links `[text](file.md)` losing rename-tracking vs wikilinks.

#### Canvas as LLM Output

Canvas is an underappreciated differentiator. The [JSON Canvas format](https://jsoncanvas.org/spec/1.0/) is an open MIT-licensed standard with flat JSON (nodes + edges arrays). File-type nodes display **live content** from vault notes. An LLM can trivially generate `.canvas` files to visualize wiki article relationships. Performance degrades at ~100+ nodes. [Advanced Canvas plugin](https://github.com/Developer-Mike/obsidian-advanced-canvas) adds collapsible groups and frontmatter-based auto-edge generation.

#### Large File Handling

10K-word articles (~60KB) are a non-issue. Degradation begins at ~40,000 lines. A 7.5MB+ file causes freezes for seconds. Source Mode is fastest; Live Preview is slowest (large tables cause 5+ second renders).

---

### D6: Output Rendering

**Finding:** Output rendering is rich — native Mermaid, MathJax, callouts, and deep Excalidraw integration. The Marp ecosystem is fragmented with no clear winner. Matplotlib images work but do not auto-refresh due to Electron caching.

**Evidence:** [evidence/output-rendering.md](evidence/output-rendering.md)

#### Marp (Slide Presentations)

Four plugins compete, none dominant: Marp Slides (32K downloads, stale since May 2024), Marp (14K downloads, very stale), Marp Extended (feature-rich, 3 stars), Marp Presentations (experimental). [Slides Extended](https://www.obsidianstats.com/plugins/slides-extended) (reveal.js, 29K downloads, active March 2026) is the better alternative for interactive presentations. LLM compatibility is high — standard markdown with `---` separators. Wikilinks do not work in Marp.

#### Mermaid Diagrams

Obsidian bundles Mermaid.js 11.4.1 natively. Supports flowcharts, sequence, Gantt, class, state, ER, pie, git graphs, mindmaps, timeline, Sankey, quadrant. Does NOT support packet-beta or block diagrams (newer Mermaid). Dark mode is a persistent pain point — text often unreadable without per-diagram `%%{init: {'theme':'dark'}}%%`. LLM-generated Mermaid renders correctly most of the time; main risk is newer syntax and special characters.

#### Excalidraw

The [Excalidraw plugin](https://github.com/zsviczian/obsidian-excalidraw-plugin) is the **most downloaded community plugin** (3.24M downloads, 6.4K stars). Integration is bidirectional: embed drawings in notes, link from drawing elements to vault notes, embed vault notes in drawings. File format is `.excalidraw.md` (searchable, git-diffable). [ExcaliBrain](https://www.obsidianstats.com/plugins/excalibrain) auto-generates knowledge graphs from vault links. ExcalidrawAutomate API ships with [dedicated LLM training data](https://excalidraw-obsidian.online/WIKI/07+Developer+Docs/Excalidraw+Automate+library+file+(not+only)+for+LLM+training). An [MCP server for Excalidraw](https://github.com/yctimlin/mcp_excalidraw) exists.

#### Matplotlib / Generated Images

Image embedding works via `![[image.png]]` with sizing. **Auto-refresh problem:** when a script overwrites an image, Obsidian does NOT refresh due to Electron/Chromium caching ([longstanding request](https://forum.obsidian.md/t/automatically-refresh-images-when-the-image-file-changes/45331)). Workaround: generate unique filenames per render (e.g., `plot_20260403_143022.png`) and update embed links.

#### Additional Rendering

Native: LaTeX math (MathJax, `$...$` inline, `$$...$$` display), callouts (12 types, foldable), syntax-highlighted code blocks. Plugin-based: [Obsidian Charts](https://github.com/phibr0/obsidian-charts) (Chart.js, 282K downloads), [PlantUML](https://github.com/joethei/obsidian-plantuml), [Execute Code](https://github.com/twibiral/obsidian-execute-code) (runs Python/JS inline). Obsidian Publish renders native features only — plugin content does not render in Publish.

---

### D7: Version History and Persistence

**Finding:** Four independent mechanisms (auto-save, File Recovery, Sync, Git) each cover part of the problem. Git via Obsidian Git plugin (10K+ stars, 2.3M+ downloads) is the strongest option but lacks agent attribution. No mechanism natively distinguishes LLM-authored changes from human edits.

**Evidence:** [evidence/version-history.md](evidence/version-history.md)

#### Auto-Save and File Recovery

Obsidian auto-saves with a 2-second debounce. File Recovery core plugin takes full-file snapshots every 5 minutes (configurable), retained 7 days (configurable), stored outside the vault. No attribution — cannot distinguish agent vs. human changes.

**Crash recovery is weak:** documented case of ~4 days of lost notes after forced shutdown ([forum](https://forum.obsidian.md/t/lost-about-a-day-of-notes-no-autosave/87223)).

#### Obsidian Sync Version History

Standard plan ($4/mo): 1-month retention, 1GB. Plus ($8/mo): 12-month retention, 10GB. Chronological version list with content preview, restore to any version. **No native diff view** — requires [Version History Diff](https://github.com/kometenstaub/obsidian-version-history-diff) plugin. Conflict resolution uses diff-match-patch three-way merge with documented failure modes including content deletion ([forum](https://forum.obsidian.md/t/bug-modified-externally-message-constantly-appears-erasing-my-text/26090)). No agent attribution.

#### Git Integration

[Obsidian Git](https://github.com/Vinzent03/obsidian-git) (10,200+ stars, 2.3M+ downloads): auto-commit intervals, Source Control View (stage/unstage/commit), unified and split diff views, gutter signs showing line changes, history view with commit browser.

**Agent attribution via Git:** The only mechanism that CAN encode attribution — agent commits with distinct author (`LLM Agent <agent@vault>`) and message convention (`[agent]` prefix). Requires disciplined tooling.

**No visual merge conflict resolution.** Conflicts produce standard Git markers resolved in Source Mode or external tools.

#### Recommended Layered Architecture

Layer 1: File Recovery (safety net, 2-min interval, 30-day retention). Layer 2: Git via Obsidian Git (primary VC, 5-10 min auto-commit, distinct agent author). Layer 3: [Time Machine](https://github.com/dsebastien/obsidian-time-machine) plugin (visual timeline combining File Recovery + Git). Layer 4: Obsidian Sync (optional, for multi-device; risky with agent writes).

---

### D8: Collaboration and Sharing

**Finding:** Obsidian Publish lacks full-text search — unsuitable for a knowledge base. Quartz (free, open-source) is superior for publishing a compiled wiki. Simultaneous agent+human editing of the same file is dangerous regardless of mechanism.

**Evidence:** [evidence/collaboration-sharing.md](evidence/collaboration-sharing.md)

#### Obsidian Publish vs Quartz

| Feature | Obsidian Publish ($8-10/mo) | Quartz (free) |
|---|---|---|
| Full-text search | **No** (titles/headings only) | **Yes** |
| Graph view | Yes | Yes |
| Backlinks | Yes | Yes |
| Auto-deploy on git push | No (manual publish) | **Yes** (GitHub Actions) |
| Cost | $96-120/year | Free |
| Custom domain | Yes | Yes (self-hosted) |

Publish's search limitation is a dealbreaker for a knowledge base use case ([feature request since 2023, unresolved](https://forum.obsidian.md/t/have-obsidian-publish-search-feature-search-the-full-text-of-notes/62188)).

**For the Karpathy workflow:** Quartz + GitHub Actions creates a fully automated pipeline: agent compiles article -> Obsidian Git commits -> push triggers Quartz build -> site deploys.

#### Agent+Human Simultaneous Editing

When an external program modifies a file that is open in Obsidian: (1) changes do not display until file is closed and reopened, (2) if user edits before seeing external changes, external changes are silently overwritten, (3) the "modified externally" merge notification uses diff-match-patch with documented corruption failure modes. The Obsidian CLI (2026) routes writes through internal APIs, partially bypassing filesystem watcher issues. It is explicitly designed for agentic use.

---

### D9: The Karpathy Workflow in Practice

**Finding:** Karpathy uses Obsidian as a viewer only. Every practitioner replicating the workflow uses external tools for processing. The linting and compounding stages are rarely implemented. The community consensus is that the orchestration layer is the missing piece.

**Evidence:** [evidence/karpathy-workflow-practice.md](evidence/karpathy-workflow-practice.md)

#### Karpathy's Setup

Karpathy's [6-stage workflow](https://x.com/karpathy/status/2039805659525644595): (1) raw ingest via Web Clipper into `raw/`, (2) LLM compiles raw into wiki with summaries, backlinks, categories, (3) Q&A against ~100 articles / ~400K words with auto-maintained index files, (4) rendered output as markdown, Marp slides, matplotlib images, (5) LLM lints wiki for inconsistencies and missing data, (6) outputs filed back for compounding.

**The anti-RAG insight:** "I thought I had to reach for fancy RAG, but the LLM has been pretty good about auto-maintaining index files." The entire AI infrastructure industry builds retrieval pipelines; Karpathy showed that a well-maintained `index.md` file may suffice.

**What Obsidian provides:** Viewing, storing, rendering, Web Clipper for ingest. **What does the actual work:** A "hacky collection of scripts" — external CLI tools orchestrating LLM calls.

#### Practitioner Accounts

- **Eric J. Ma** (March 2026): Python scripts convert documents to markdown, AI agents run "sweeps" to update notes. Knowledge management overhead dropped from 30-40% to <10%.
- **Daniel Pickem** (NVIDIA, Jan 2026): PARA-organized vault with Cursor. "Rarely writes notes from scratch — feeds raw inputs to Claude."
- **Stefan Imhoff**: Restructured 6,000+ note vault for agent compatibility.
- **Eleanor Konik**: Reorganized 12M-word vault with MCP.

**Common pattern:** Obsidian is the filesystem and renderer. External LLM tools do the work. Markdown + YAML frontmatter is the interchange format. Linting and compounding stages are rarely implemented.

#### Pain Points

| Pain Point | Severity |
|---|---|
| No agent event system in core | Critical |
| Plugin fragmentation (86 AI plugins, no standard) | High |
| Large vault performance (10K+: 20+ min indexing, 4s link completion delays) | High |
| LLM generates unstructured prose instead of vault-compatible files | Medium |
| Smart Connections paywall | Medium |
| Plugin quality variance (many deprecated/unmaintained) | Medium |

---

### D10: What Obsidian Does Exceptionally Well

**Finding:** Obsidian's combination of file ownership + beautiful rendering + infinite customizability + free pricing creates "the Obsidian magic" that no single alternative replicates. The 2,749-plugin ecosystem and community health represent the floor a replacement must meet.

**Evidence:** [evidence/obsidian-strengths.md](evidence/obsidian-strengths.md)

#### Why Developers Love It (Specific Features)

1. **File-over-app / data ownership** — vault is a folder of `.md` files, works with git, readable by any editor forever
2. **Command palette** — exact VS Code `Cmd+P` analogue, fuzzy-match any command
3. **Live Preview** — inline rendering as cursor moves away, no split pane
4. **Wikilinks + backlinks** — natural linking, backlink panel, unlinked mention detection
5. **Plugin ecosystem** — 2,749 plugins, "You cannot get this level of customization in Notion"
6. **Free for personal use** — no subscription for core features
7. **Keyboard-driven** — hotkey for every command, custom keybindings, vim mode

#### What Users Would Miss Most

| Feature | Replaceability |
|---|---|
| Plugin ecosystem (2,749) | Very hard |
| Dataview queries | Very hard |
| CSS customizability (414+ themes, snippets, Style Settings) | Hard |
| Community (60K+ active members) | Hard |
| Wikilink navigation | Medium |

#### Ecosystem Scale

97.7M+ all-time plugin downloads. 31.4M downloads in 2025. 792 new plugins in 2025 from 782 unique developers. 5-17 new plugins per week. 53-96 plugin updates per week. Power law distribution: a few plugins dominate (Dataview, Templater, Excalidraw, Tasks at 100K+), long tail of experimental/abandoned plugins.

#### Performance Boundaries

| Vault Size | Experience |
|---|---|
| Hundreds to low thousands | Excellent |
| 5,000-10,000 | Noticeable slowdowns in search, link completion, initial load |
| 10,000+ with attachments | 20+ minute indexing, 4-second delays per keystroke in link selector |
| Mobile (any large vault) | Unpractical load times due to IndexedDB limitations |

The Karpathy workflow (hundreds of wiki articles + raw source documents) stays within Obsidian's comfortable range. An ambitious multi-domain knowledge base could push into degradation territory.

#### Customization Depth

Four layers: themes (414+), CSS snippets (any element targetable), Style Settings plugin (GUI for CSS variables), and CSS variable architecture (hierarchical: foundation -> semantic -> component -> context). The combination creates a customization system where users can make Obsidian look like anything while maintaining a GUI for non-CSS users. No other markdown editor offers this depth.

---

## Karpathy Workflow Stage Assessment

| Stage | Obsidian Support | Rating | Key Gap |
|---|---|---|---|
| **1. Raw Ingest** | Web Clipper (excellent manual capture), filesystem writes, CLI, MCP servers | **Strong** | No batch/programmatic clipping API; no PDF/video/audio pipeline |
| **2. LLM-Compiled Wiki** | Renders output; obsidian-skills teaches format | **Partial** (viewer only) | **THE GAP** — no tool synthesizes raw sources into structured wiki articles |
| **3. Q&A** | Sonar/QMD for semantic search; Copilot/Smart Connections for RAG | **Strong** (with plugins) | No combined metadata+semantic queries |
| **4. Rendered Output** | Native Mermaid, MathJax, callouts; Canvas, Excalidraw; Marp (fragmented) | **Strong** | Image cache refresh; Marp plugin staleness |
| **5. Wiki Linting** | mcp-pro can find broken links and orphans | **Weak** | No background health checks, no consistency verification, no agent triggers |
| **6. Search Engine** | BM25 native; Sonar/QMD hybrid+reranking; multiple MCP search tools | **Strong** (with plugins) | Pipeline fragmentation across tools |
| **7. Compounding** | Backlinks create natural compounding structure | **Partial** | No automatic feedback loop; no "what changed since last compilation" |
| **8. Custom Search Engine** | Hybrid Search MCP + dp-veritas read-only server | **Partial** | No unified CLI + web UI search interface |

---

## What a Replacement Product Must Respect

Based on Obsidian's irreducible strengths that create switching costs:

1. **File ownership** — users access data as plain files without the app. Non-negotiable.
2. **Beautiful markdown rendering** — Live Preview quality with LaTeX, Mermaid, code blocks, images.
3. **Wikilinks + backlinks** — the interconnection model that makes wiki-style knowledge bases work.
4. **Keyboard-driven workflow** — command palette, hotkeys, vim mode options.
5. **Extensibility** — not necessarily 2,749 plugins, but the ability to customize and extend.
6. **Free tier** — Obsidian is free for personal use. Paid-only will struggle.
7. **Privacy / offline-first** — local data by default, cloud optional.
8. **Git compatibility** — version control must work naturally.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Obsidian CLI (Feb 2026):** Still behind Catalyst License paywall. Full capability surface not yet documented by third parties.
- **Datacore (Dataview successor):** In development, not yet stable. Could change the dynamic indexing landscape.
- **Sonar and QMD:** Both very new (Feb-March 2026). Long-term reliability and maintenance unknown.
- **Multi-vault agent workflows:** No documented pattern for agents navigating across multiple vaults.

### Out of Scope (per Rubric)
- General Obsidian overview (covered in prior competitive landscape report)
- Plugin development tutorials
- Tool-by-tool comparison with competitors
- Content authoring workflows (covered in prior agent wiki report)

---

## References

### Evidence Files
- [evidence/ingestion-capabilities.md](evidence/ingestion-capabilities.md) — Web Clipper, ingest plugins, conversion fidelity, programmatic ingest
- [evidence/wiki-compilation.md](evidence/wiki-compilation.md) — Linking model, Dataview, Templater, MOC automation, compilation gap
- [evidence/agent-integration.md](evidence/agent-integration.md) — MCP servers, obsidian-skills analysis, filesystem concurrency, debounce bug
- [evidence/search-capabilities.md](evidence/search-capabilities.md) — Built-in search, Omnisearch, Sonar, QMD, MCP search, gap analysis
- [evidence/editing-experience.md](evidence/editing-experience.md) — Editor modes, LLM output compatibility, external writes, Canvas, YAML, large files
- [evidence/output-rendering.md](evidence/output-rendering.md) — Marp, Mermaid, Excalidraw, matplotlib, Chart.js, rendering capabilities
- [evidence/version-history.md](evidence/version-history.md) — Auto-save, File Recovery, Sync, Git integration, agent attribution gap
- [evidence/collaboration-sharing.md](evidence/collaboration-sharing.md) — Publish vs Quartz, agent+human editing, sharing architecture
- [evidence/karpathy-workflow-practice.md](evidence/karpathy-workflow-practice.md) — Karpathy's setup, practitioner accounts, pain points, community discussions
- [evidence/obsidian-strengths.md](evidence/obsidian-strengths.md) — Feature specifics, switching costs, ecosystem scale, performance, customization

### Key External Sources
- [Karpathy X post on LLM Knowledge Bases](https://x.com/karpathy/status/2039805659525644595)
- [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) (19.2K stars)
- [kepano/defuddle](https://github.com/kepano/defuddle) — Obsidian Web Clipper's extraction engine
- [obsidianmd/obsidian-clipper](https://github.com/obsidianmd/obsidian-clipper)
- [Obsidian CLI](https://help.obsidian.md/cli) (Feb 2026)
- [Obsidian Flavored Markdown](https://help.obsidian.md/obsidian-flavored-markdown)
- [JSON Canvas Spec](https://jsoncanvas.org/spec/1.0/)
- [bitbonsai/mcpvault](https://github.com/bitbonsai/mcpvault)
- [ryanbbrown/obsidian-drift](https://github.com/ryanbbrown/obsidian-drift)
- [Sonar plugin announcement](https://forum.obsidian.md/t/ann-sonar-offline-semantic-search-and-agentic-ai-chat-for-obsidian-powered-by-llama-cpp/110765)
- [thirteen37/obsidian-qmd](https://github.com/thirteen37/obsidian-qmd) (Tobi Lutke's QMD ported to Obsidian)
- [zsviczian/obsidian-excalidraw-plugin](https://github.com/zsviczian/obsidian-excalidraw-plugin) (3.24M downloads)
- [Vinzent03/obsidian-git](https://github.com/Vinzent03/obsidian-git) (10.2K stars, 2.3M downloads)
- [jackyzha0/quartz](https://quartz.jzhao.xyz/) — Static site generator for vaults
- [ObsidianStats Plugins Wrapped 2025](https://www.obsidianstats.com/posts/2025-12-04-wrapped-2025)
- [Forum: vault.process debounce bug](https://forum.obsidian.md/t/vault-process-and-vault-modify-dont-work-when-there-is-a-requestsave-debounce-event/107862)
- [Forum: Bulk link-all request (2020)](https://forum.obsidian.md/t/link-all-unlinked-mentions-with-one-click/1045)
- [Forum: Large vault performance](https://forum.obsidian.md/t/slow-performance-with-large-vaults/16633)
- [Forum: Standard AI interface request](https://forum.obsidian.md/t/why-isn-t-there-a-standard-interface-plugin-for-ai-llms-in-obsidian/95431)

### Related Research
- [/Users/edwingomezcuellar/reports/openknowledge-competitive-landscape/fanout/2026-04-02-initial/obsidian/](/Users/edwingomezcuellar/reports/openknowledge-competitive-landscape/fanout/2026-04-02-initial/obsidian/) — Competitive landscape analysis (editing, AI, storage, collab, licensing, positioning, extensibility)
- [/Users/edwingomezcuellar/reports/obsidian-wiki-ai-agents/](/Users/edwingomezcuellar/reports/obsidian-wiki-ai-agents/) — Agent wiki integration (MCP servers, vault structure, search, Claude Code, content authoring)
