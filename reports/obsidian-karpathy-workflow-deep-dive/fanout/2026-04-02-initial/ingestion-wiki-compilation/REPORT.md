# Obsidian Ingestion & Wiki Compilation for the Karpathy Workflow

**Date**: 2026-04-03
**Scope**: Deep dive into Obsidian's ingestion capabilities and wiki compilation / auto-linking features as they relate to the Karpathy "LLM Knowledge Base" workflow.
**Evidence files**: See `evidence/` directory for detailed primary-source findings.

---

## Executive Summary

Obsidian has a rich but fragmented ingestion ecosystem and a powerful native linking model, but **no integrated pipeline exists for the Karpathy workflow** of raw ingest → LLM compilation → structured wiki. The pieces are individually strong — the Web Clipper is excellent for manual capture, Dataview generates dynamic indexes, Templater can scaffold articles, and MCP servers enable programmatic access. But the critical "compilation step" (where an LLM synthesizes raw sources into structured wiki pages) requires custom orchestration that no existing plugin or tool provides. This is the single largest gap and the highest-value opportunity for a replacement product.

---

## D1: Ingestion Capabilities

### D1.1: Obsidian Web Clipper

**Architecture**: Open-source browser extension ([obsidianmd/obsidian-clipper](https://github.com/obsidianmd/obsidian-clipper)) with a 3-stage pipeline: Defuddle content extraction → optional LLM processing (Interpreter) → template-based markdown rendering. Content transferred via dual-channel: `obsidian://new` URI for metadata + system clipboard for body.

**Content extraction quality**: Uses [Defuddle](https://github.com/kepano/defuddle) (purpose-built by kepano as a Mozilla Readability replacement). Key advantages over Readability:
- Math/LaTeX: Detects MathJax, KaTeX, MathML → standardized with preserved LaTeX source
- Code blocks: Strips syntax highlighting spans, retains language identifiers
- Footnotes: Rewrites to standardized format
- "More forgiving, removes fewer uncertain elements"

**Template system**: The clipper's strongest feature. JSON-based templates with 5 variable categories (preset, meta, schema.org, CSS selector, LLM prompt), 50+ chainable filters, URL-based auto-trigger matching. Community template repositories at [obsidian-community/web-clipper-templates](https://github.com/obsidian-community/web-clipper-templates).

**Browser support**: Chrome, Firefox (desktop + Android), Safari (macOS/iOS/iPadOS), Edge, Brave/Arc. Some iOS Safari instability ([Issue #597](https://github.com/obsidianmd/obsidian-clipper/issues/597)).

**Critical limitation: No image download**. Images remain as external URLs, requiring internet and breaking on source removal ([Issue #37](https://github.com/obsidianmd/obsidian-clipper/issues/37)). Workaround: Local Images Plus plugin as post-processing step.

**Other limitations**: Twitter/X clipping broken ([#676](https://github.com/obsidianmd/obsidian-clipper/issues/676)), Reddit truncation, complex HTML tables degrade, multi-column layouts linearized, clipboard temporarily overwritten during clip.

**Karpathy fit**: Good for manual capture of text-heavy articles with rich metadata. Template system enables consistent `raw/` directory structure. But: no batch/programmatic clipping, no API, each page requires manual action. Insufficient for automated ingest pipelines.

### D1.2: Ingest Plugins Ecosystem

**ReadItLater** ([DominikPieper/obsidian-ReadItLater](https://github.com/DominikPieper/obsidian-ReadItLater), ~620 stars, v0.11.4 Jan 2026): Paste URL → fetch → markdown. Supports web articles, YouTube, Twitter/X, Stack Exchange, Wikipedia, Substack, GitHub repos. Batch processing via clipboard. Downloads images locally. Actively maintained.

**Readwise Official** ([readwiseio/obsidian-readwise](https://github.com/readwiseio/obsidian-readwise)): Syncs highlights from Kindle, Apple Books, Instapaper, Pocket, Medium, Twitter, PDFs, podcasts, Readwise Reader. Jinja2 templating. Append-only (never overwrites). Actively maintained by Readwise team. **Requires paid subscription ($7.99/mo).**

**Zotero** (academic papers): ZotLit ([PKM-er/obsidian-zotlit](https://github.com/PKM-er/obsidian-zotlit), ~900 stars, v1.1.11 Aug 2025) is the actively maintained choice. Bulk export, annotation extraction, drag-and-drop. The mgmeyers plugin has larger user base (~1,400 stars) but stale development.

**RSS**: RSS Reader ([joethei/obsidian-rss](https://github.com/joethei/obsidian-rss)), Obsidian Feed, RSS Dashboard provide feed monitoring and note creation. Functional but not deeply integrated.

**Email**: **Weakest area**. Email-to-PARA handles Gmail/Outlook starring. No mature, widely-adopted solution exists.

**PDF handling**: Native inline viewing via `![[file.pdf]]`. PDF++ ([RyotaUshio/obsidian-pdf-plus](https://github.com/RyotaUshio/obsidian-pdf-plus)) for Obsidian-native annotations stored as markdown backlinks. Extract PDF Annotations for batch extraction.

**Import from other tools**: Official Importer plugin ([obsidianmd/obsidian-importer](https://github.com/obsidianmd/obsidian-importer)) handles 14 format families (Apple Notes, Evernote, Notion, Roam, Bear, OneNote, etc.). Generally solid for bulk migration with expected post-import cleanup.

### D1.3: Programmatic Ingestion

**Direct filesystem** (simplest): A vault is just a folder of `.md` files. Any script/agent can write files directly. Obsidian detects new files on refresh. This is the most common batch approach.

**Obsidian CLI** (NEW — February 2026): [help.obsidian.md/cli](https://help.obsidian.md/cli). 100+ commands: `obsidian read`, `obsidian search`, `obsidian create`, `obsidian append`. **Game-changer for LLM integration** when combined with [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) (19.2K stars) which teaches agents the CLI. Currently requires Catalyst License ($25, Early Access).

**Local REST API** ([coddingtonbear/obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api)): HTTPS API for CRUD, PATCH (surgical edits), search (fuzzy + Dataview DQL), command execution. Requires Obsidian running.

**MCP servers**: MCPVault ([bitbonsai/mcpvault](https://github.com/bitbonsai/mcpvault), v0.11.0 March 2026) is the recommended filesystem-based option with 14 tools, BM25 search, path safety, and read-only default. cyanheads/obsidian-mcp-server wraps the REST API. jacksteamdev/obsidian-mcp-tools runs inside Obsidian with semantic search and Templater integration.

**For Karpathy's `/raw/` directory**: The direct filesystem approach is optimal. A script (Python/Node.js) fetches articles, converts to markdown, adds YAML frontmatter, writes to `raw/` folder. Obsidian picks them up. The new CLI + MCP servers provide structured alternatives with search capabilities.

### D1.4: Conversion Fidelity

**Text-heavy content** (blog posts, docs, essays): **90-95% fidelity**. The pipeline is optimized for this.

**Documentation sites**: 85-90%. Tabs, interactive examples degrade.

**Academic papers (HTML)**: 70-80%. Math/LaTeX challenging (Defuddle handles well, most other tools don't). Citation structure lost.

**Academic papers (PDF)**: 60-80%. MinerU best for formula recognition (GPU required). Marker achieves 95.67% accuracy in benchmarks. Multiple Obsidian plugins available (Marker PDF to MD, pdf2md with Mistral OCR, PDFMD).

**Twitter/X, Reddit**: 40-60%. Auth barriers, JS rendering required, threading structure lost.

**SPAs/JS-heavy sites**: 0-40%. Content invisible without headless browser pre-rendering.

**The biggest gaps are not markdown conversion itself** — it's content extraction (Readability heuristics are brittle) and JavaScript pre-rendering. Karpathy's workflow tolerates imperfect capture because the LLM reader doesn't need pixel-perfect fidelity — headings, emphasis, and code fences provide sufficient parsing anchors.

**Obsidian rendering quirks**: Does NOT render markdown inside HTML elements. MathJax has random rendering failures. Mermaid bundles v11.4 (arrow bugs). Footnotes only work in reading view. The Web Clipper produces standard GFM, not Obsidian-flavored markdown — wikilinks, callouts, block references must be added post-clip.

---

## D2: Wiki Compilation / Auto-Linking

### D2.1: Native Linking Model

**Wiki-link syntax**: `[[Note Name]]` with case-insensitive, space/hyphen/underscore-normalized resolution. Three link format modes (shortest path, relative, absolute). Non-existent notes created on click ("link first, create later"). Links auto-updated on rename/move.

**Rich link types**: Aliases (`[[Note|display text]]`), heading links (`[[Note#Heading]]`), block references (`[[Note#^block-id]]`), embeds (`![[Note]]`), sized images (`![[img.png|640]]`), PDF page embeds (`![[doc.pdf#page=3]]`), audio/video players.

**Backlinks panel**: Two sections — linked mentions (explicit links) and unlinked mentions (title/alias text matches). Unlinked can be converted to linked one at a time. **No native bulk "link all" button** — most-requested feature since 2020 ([forum](https://forum.obsidian.md/t/link-all-unlinked-mentions-with-one-click/1045)). This is a critical gap for agent workflows that need to auto-link content at scale.

**Graph view**: Local graph is useful for exploring idea neighborhoods. Global graph is decorative at any significant scale. **Performance degrades sharply**: freezes at ~2,000 densely-linked notes, crashes at ~10,000+, 130K notes takes ~10 minutes just to index. Community consensus: local graph useful, global graph pretty but impractical.

**Aliases** (YAML frontmatter): Integrate with autocomplete and unlinked mention detection, providing multiple entry points to concepts.

**Compared to MediaWiki**: Obsidian excels at personal graph exploration (backlinks, unlinked mentions, block references). Lacks disambiguation, hierarchical categories, parameterized templates, edit history, multi-user collaboration, structured data, redirects, namespaces, and API access. Philosophical difference: personal knowledge graph vs. collaborative knowledge base.

### D2.2: Dataview Plugin (Dynamic Indexes)

**GitHub**: [blacksmithgu/obsidian-dataview](https://github.com/blacksmithgu/obsidian-dataview) (~8,700 stars).

**Capabilities**: SQL-inspired DQL with TABLE/LIST/TASK/CALENDAR queries. FROM (tags, folders, links with Boolean logic), WHERE, SORT, GROUP BY, FLATTEN, LIMIT. DataviewJS provides full JavaScript execution with `dv` API for complex output generation. Inline queries embed single computed values in text.

**MOC generation**: Dataview is the primary tool for dynamic Maps of Content. Tag-based, folder-based, or backlink-based MOCs. Same note appears in multiple MOCs without duplication. MOCs become self-updating indexes that grow automatically.

**Limitations**: Output is read-only (cannot edit notes through queries). Cannot query note body text (only metadata — frontmatter, inline fields, tags, links). Rendering inconsistencies between Live Preview and Reading mode. Not real-time.

**Performance concerns**: Official claim of "hundreds of thousands of notes" contradicted by real reports — 9,000 notes causing 199.6% CPU ([Issue #1280](https://github.com/blacksmithgu/obsidian-dataview/issues/1280)). Exclusionary queries perform significantly worse.

**Maintenance status**: **Effectively in maintenance mode** as of April 2026. Last commit >10 months old. Maintainer focused on [Datacore](https://github.com/blacksmithgu/datacore) successor (2-10x faster, WYSIWYG editable tables, React-based). Meanwhile, Obsidian's built-in **Bases** core plugin is emerging as the native replacement.

### D2.3: Templater Plugin (Note Generation)

**GitHub**: [SilentVoid13/Templater](https://github.com/SilentVoid13/Templater) (~4,700 stars, v2.18.1 Jan 2026, actively maintained).

**Capabilities**: JavaScript execution in templates (`<%* %>` tags), file creation/move/rename (`tp.file.*`), external API calls (`tp.obsidian.requestUrl()` — bypasses CORS), system command execution, user scripts (CommonJS modules in designated folder). Folder Templates auto-apply on note creation. Startup Templates execute on Obsidian load.

**For LLM workflows**: Could call LLM API endpoints directly, pass context, inject responses. System commands enable invoking Python/Node.js scripts. Batch file creation via `tp.file.create_new()`.

**Critical distinction**: Templater executes **once** and replaces. Not dynamic like Dataview. For wiki compilation: Templater = generator (creates/scaffolds), Dataview = indexer (maintains dynamic cross-references).

### D2.4: Maps of Content (MOCs)

**Definition**: Notes primarily containing links to other notes, serving as navigational hubs. Popularized by Nick Milo's [Linking Your Thinking](https://www.linkingyourthinking.com/) framework.

**Automated MOC plugins**:
- **Waypoint** ([IdreesInc/Waypoint](https://github.com/IdreesInc/Waypoint)): Dynamic MOCs within folder notes, auto-detects changes. Developer now recommends Obsidian Folder Overview.
- **AutoMOC** ([dalcantara7/obsidian-auto-moc](https://github.com/dalcantara7/obsidian-auto-moc)): Rule-based import of backlinks, tagged mentions, alias references.
- **InsightA** ([HongjianTang/obsidian-insighta](https://github.com/HongjianTang/obsidian-insighta)): LLM-powered. Transforms long articles → atomic notes + MOCs. **Closest existing plugin to Karpathy's compilation step.**

**Common pattern**: Templater creates MOC scaffold → Dataview queries populate dynamic content. Preserves custom content between updates via delimiter markers.

### D2.5: LLM-Maintained Wikis (Current State)

**What exists today**:

| Tool | Capability | Automated? |
|------|-----------|------------|
| InsightA | Article → atomic notes + MOCs | Semi (one-shot) |
| Notemd | Context-aware wiki-link insertion, concept note generation | Semi |
| Automatic Linker | Converts text matching filenames to `[[wikilinks]]` | Yes (rule-based) |
| Atomizer | Lengthy text → atomic notes | Semi |
| AI Knowledge Filler | Structured `.md` files with YAML + WikiLinks | Yes |

**What does NOT exist**: A fully automated pipeline that watches `/raw/`, detects new content, and regenerates wiki pages. Nobody has publicly documented the full Karpathy compile loop. The closest approaches combine InsightA (atomization) + Notemd (linking) + Claude Code (ad-hoc maintenance), but the orchestration layer connecting them does not exist as a packaged solution.

**Real user workflows** (Claude Code + Obsidian):
- Mauricio Gomes: `CLAUDE.md` in vault root, `mdfind` for PDF search ([blog](https://mauriciogomes.com/teaching-claude-code-my-obsidian-vault))
- Eric Khun: "PartnerOS" pattern, daily notes + Claude scans last 3-5 days ([blog](https://erickhun.com/posts/partner-os-claude-mcp-obsidian/))
- Eleanor Konik: Reorganized 12M-word vault with MCP ([blog](https://www.eleanorkonik.com/p/how-claude-obsidian-mcp-solved-my))
- Stefan Imhoff: 6,000+ note restructure for agent compatibility ([blog](https://www.stefanimhoff.de/agentic-note-taking-obsidian-claude-code/))

**Concurrent access**: Creating new files while Obsidian is open generally works. Modifying open files risks overwrites. No file locking. Best practice: don't edit same file simultaneously in Obsidian and via agent.

### D2.6: The "Compilation" Step Gap

Karpathy's workflow has a specific step where raw sources become structured wiki articles:

```
/raw/ (unstructured articles, papers, clips)
    ↓ LLM compilation
/wiki/ (structured articles with cross-references, visualizations, MOCs)
    ↓ Q&A + generated outputs
/wiki/ (enhanced with new artifacts)
```

**What Obsidian provides for each sub-step:**

| Sub-step | Obsidian Support | Gap |
|----------|-----------------|-----|
| Detect new raw content | File watching (unreliable externally) | No event system for agent triggers |
| Read raw sources | MCP servers, CLI, direct filesystem | Adequate |
| Synthesize into structured article | Nothing built-in | **THE GAP** — requires external LLM orchestration |
| Add cross-references | Notemd (semi), Automatic Linker (rule-based) | No LLM-powered context-aware cross-referencing |
| Generate visualizations | Mermaid built-in, matplotlib via scripts | No integrated visualization generation |
| Create/update MOCs | InsightA, AutoMOC, Dataview | Piecemeal, not unified |
| File back into wiki | MCP servers, CLI, direct writes | Adequate |
| Continuous re-compilation | Nothing | **THE GAP** — no watch + re-synthesize loop |

---

## Synthesis: Karpathy Workflow Fit Assessment

### Where Obsidian Supports the Workflow

1. **Storage layer**: Markdown vault is ideal — plain files, portable, git-friendly, agent-accessible
2. **Manual ingestion**: Web Clipper + ReadItLater + Zotero cover most manual capture needs
3. **Linking primitives**: Wiki-links, backlinks, embeds, block references are powerful building blocks
4. **Dynamic indexing**: Dataview generates MOCs and cross-reference pages automatically
5. **Template-based scaffolding**: Templater can create structured articles from templates + API calls
6. **Agent access**: MCP servers (MCPVault), CLI (new Feb 2026), REST API, direct filesystem all work

### Where Obsidian Partially Supports

1. **Programmatic batch ingest**: Possible via filesystem writes but no native pipeline — requires scripts
2. **Auto-linking**: Automatic Linker (rule-based) and Notemd (LLM) exist but are not deeply integrated
3. **MOC generation**: InsightA approximates article → atomic notes → MOC but is one-shot, not continuous
4. **Visualization**: Mermaid built-in but no integrated pipeline for generating charts/diagrams from data

### Where Obsidian Fails

1. **The compilation step**: No built-in or plugin-based way to have an LLM read raw sources and synthesize structured wiki articles. This requires external orchestration.
2. **Continuous re-compilation**: No watch → detect → re-synthesize loop. No event system for agent triggers.
3. **Bulk auto-linking**: No native "link all unlinked mentions" (most-requested feature since 2020). One-at-a-time conversion only.
4. **Concurrent access safety**: No file locking, no conflict resolution, no multi-agent coordination.
5. **Scale limits**: Dataview degrades at ~5K+ notes. Graph view unusable at ~10K+. These would limit a growing knowledge base.
6. **Dataview maintenance risk**: In maintenance mode. Successor (Datacore) not stable. Obsidian Bases not yet feature-complete.

### The Opportunity

The highest-value gap is **the orchestration layer** — the system that:
1. Watches for new raw content
2. Reads and understands existing wiki structure
3. Calls an LLM to synthesize raw → structured articles
4. Adds cross-references, updates MOCs, generates visualizations
5. Files everything back into the wiki
6. Repeats continuously as new content arrives

This is exactly what Karpathy describes and exactly what no Obsidian tool provides. Building this as a standalone product (rather than an Obsidian plugin) would also avoid Obsidian's scale limitations, Dataview's maintenance risk, and the concurrent access issues.

---

## Evidence Files

| File | Contents |
|------|----------|
| [evidence/web-clipper.md](evidence/web-clipper.md) | Obsidian Web Clipper architecture, features, limitations, Defuddle analysis |
| [evidence/ingest-plugins.md](evidence/ingest-plugins.md) | ReadItLater, Readwise, Zotero, RSS, email, PDF, import, programmatic ingest |
| [evidence/linking-model.md](evidence/linking-model.md) | Wiki-links, backlinks, graph view, embeds, tags, aliases, MediaWiki comparison |
| [evidence/dataview-templater-mocs.md](evidence/dataview-templater-mocs.md) | Dataview DQL/JS, Templater automation, MOC patterns and plugins |
| [evidence/llm-obsidian-workflows.md](evidence/llm-obsidian-workflows.md) | MCP servers, Claude Code workflows, AI plugins, agent-maintained wikis, kepano/obsidian-skills |
| [evidence/markdown-fidelity.md](evidence/markdown-fidelity.md) | Turndown/Readability limitations, content type fidelity, PDF conversion, Obsidian quirks |
