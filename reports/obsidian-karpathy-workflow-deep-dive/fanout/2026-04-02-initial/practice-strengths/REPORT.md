# The Karpathy Workflow in Practice & What Obsidian Does Exceptionally Well

**Research dimensions:** D9 (Karpathy Workflow in Practice) and D10 (Obsidian's Exceptional Strengths)  
**Date:** 2026-04-03  
**Evidence files:** [evidence/](./evidence/)

---

## Executive Summary

Andrej Karpathy's "LLM Knowledge Base" workflow — raw ingest → LLM-compiled wiki → Q&A → rendered output → wiki linting → compounding knowledge — is being actively replicated by practitioners using Obsidian, but **nobody is doing it inside Obsidian**. Every practitioner uses external tools (Claude Code, Cursor, custom scripts) with Obsidian as the filesystem and renderer. Obsidian's CEO has explicitly endorsed this pattern: teach agents file formats rather than embed AI. This creates a clear architectural gap: the workflow needs an orchestration layer that doesn't exist in Obsidian and that practitioners are building ad hoc with varying levels of success.

Obsidian's strengths — file ownership, rendering quality, plugin ecosystem, keyboard-driven workflow, and community — represent the floor that any replacement product must meet. The 2,749-plugin ecosystem and 1.5M active users create formidable switching costs, but the specific pain points around agent integration, large vault performance, and plugin fragmentation reveal where a purpose-built system could provide step-function improvements.

---

## D9: The Karpathy Workflow in Practice

### 9.1 Karpathy's Actual Setup

**Source:** [Karpathy X post](https://x.com/karpathy/status/2039805659525644595) | [DeepakNess analysis](https://deepakness.com/raw/llm-knowledge-bases/) | [Evidence](./evidence/karpathy-workflow-original.md)

Karpathy described a 6-stage workflow:

| Stage | What Happens | Tool Used |
|---|---|---|
| **1. Raw Ingest** | Web articles → markdown via Obsidian Web Clipper; papers, repos, datasets into `raw/` folder | Obsidian Web Clipper |
| **2. LLM-Compiled Wiki** | LLM incrementally "compiles" raw/ into wiki — summarizes, categorizes into concepts, writes articles, creates backlinks | LLM + CLI scripts |
| **3. Q&A** | Complex questions against ~100 articles / ~400K words; LLM auto-maintains index files | LLM + CLI scripts |
| **4. Rendered Output** | New markdown files, Marp slideshows, matplotlib images — all viewed in Obsidian | Obsidian (viewer) |
| **5. Wiki Linting** | LLM "health checks" — inconsistent data, missing data (imputed via web search), connection discovery | LLM + CLI scripts |
| **6. Compounding** | Outputs filed back into wiki; explorations always add up | Automatic |

**The anti-RAG insight** was the most discussed finding. Karpathy stated: "I thought I had to reach for fancy RAG, but the LLM has been pretty good about auto-maintaining index files." Community member [@alex_prompter noted](https://x.com/alex_prompter/status/2039853870810108384): "The entire AI infrastructure industry is building retrieval pipelines. Karpathy just showed that a well-maintained index.md file might be all you need."

**What Karpathy uses Obsidian for:** Viewing, storing, and rendering markdown. The Web Clipper for ingest. Nothing else — no plugins, no AI features, no search.

**What does the actual work:** A "hacky collection of scripts" — external CLI tools orchestrating LLM calls against the filesystem. The LLM writes and maintains 100% of the wiki content. Karpathy doesn't manually edit anything.

### 9.2 People Replicating the Workflow

**Evidence:** [evidence/practitioners-replicating-workflow.md](./evidence/practitioners-replicating-workflow.md)

Three detailed practitioner accounts document Karpathy-adjacent workflows:

#### Eric J. Ma (March 2026) — [Blog](https://ericmjl.github.io/blog/2026/3/6/mastering-personal-knowledge-management-with-obsidian-and-ai/)
- Engineer managing 12 people across 2 teams
- Plain text Obsidian vault with structured note types + `AGENTS.md` for AI agents
- Python scripts convert all document formats to markdown
- AI agents run "sweeps" to update notes when context gaps appear
- **Result:** Knowledge management overhead dropped from 30-40% to <10%
- **Gap:** Still requires manual download of cloud documents

#### Daniel Pickem (January 2026) — [Blog](https://danielpickem.com/posts/2026_01_13_obsidian_note_taking_system/)
- Staff Software Engineer at NVIDIA
- PARA-organized vault with Cursor as workspace (Claude reads entire vault)
- "Rarely writes notes from scratch — feeds raw inputs to Claude and gets structured, linked outputs"
- Dataview for automated aggregation; YAML frontmatter as machine-readable layer

#### Content Management (SEOtistics) — [Blog](https://seotistics.com/content-management-obsidian-llm/)
- Obsidian Bases for database views, MCP + Claude for analysis
- Python scraping pipeline for competitive intelligence
- Graph view for content cluster visualization

**Common pattern across all practitioners:**

1. **Obsidian is the filesystem and renderer, not the processor.** Nobody uses Obsidian AI plugins for the core workflow.
2. **External LLM tools do the work.** Cursor, Claude Code, or custom scripts — always outside Obsidian.
3. **Markdown + YAML frontmatter is the interchange format.** This is what makes it work.
4. **MCP is the emerging bridge standard.** Model Context Protocol connects external agents to vaults.
5. **The linting/compounding stages are rarely implemented.** Most stop at ingest → process → render.

### 9.3 Specific Pain Points Reported

**Evidence:** [evidence/pain-points-categorized.md](./evidence/pain-points-categorized.md)

| Pain Point | Severity | Source |
|---|---|---|
| **No agent event system in core** | Critical | Architectural gap — no way for agents to watch vault, trigger on changes, or run background processes |
| **Plugin fragmentation** | High | [Forum thread](https://forum.obsidian.md/t/why-isn-t-there-a-standard-interface-plugin-for-ai-llms-in-obsidian/95431) — each AI plugin requires separate API key config, model selection; very few support local models |
| **Large vault performance** | High | [Forum](https://forum.obsidian.md/t/slow-performance-with-large-vaults/16633) — 10K+ files: 20+ min indexing, 4-second `[[` completion delays |
| **LLM output structure** | Medium | LLMs generate "wall of prose" instead of properly structured vault files |
| **Smart Connections paywall** | Medium | [Forum](https://forum.obsidian.md/t/alternatives-to-smart-connections/108886) — meaningful features paywalled, spawning alternatives |
| **Plugin quality variance** | Medium | [AI tools catalog](https://github.com/danielrosehill/Awesome-Obsidian-AI-Tools) — 86 AI plugins, many deprecated/unmaintained |
| **Mobile sync** | Low (for this workflow) | Paid service; unreliable; not relevant for desktop-focused LLM workflow |

**The critical architectural gap:** Obsidian has no mechanism for agents to subscribe to vault changes. Every implementation requires external orchestration. This means the most powerful stage of Karpathy's workflow — continuous linting and compounding — cannot be implemented natively.

### 9.4 Plugin Recommendations for the LLM KB Workflow

For practitioners building a Karpathy-style workflow, the community recommends a layered approach:

**Ingest layer:**
- **Obsidian Web Clipper** — Browser extension for web → markdown conversion (Karpathy's own choice)
- **Defuddle CLI** — Clean markdown extraction from web content (kepano's recommendation via obsidian-skills)

**Processing/AI layer (external):**
- **Claude Code + obsidian-skills** — Agent with Obsidian format knowledge
- **Cursor** — Full vault as workspace context for Claude
- **Obsidian MCP Server** — [iansinnott/obsidian-claude-code-mcp](https://github.com/iansinnott/obsidian-claude-code-mcp) — Dual-transport bridge

**In-vault AI (supplementary):**
- **Copilot for Obsidian** — [github.com/logancyang/obsidian-copilot](https://github.com/logancyang/obsidian-copilot) — Vault QA, web search, optional RAG
- **Notemd** — [github.com/Jacobinwwey/obsidian-NotEMD](https://github.com/Jacobinwwey/obsidian-NotEMD) — Auto wiki-links, concept note generation, duplicate detection

**Organization/automation layer:**
- **Dataview** — Query engine over vault metadata; scales to hundreds of thousands of notes
- **Templater** — Template engine for consistent note structure
- **QuickAdd** — Macro system for automating multi-step vault operations
- **Bases** (core plugin) — Database views over notes with filter/sort/formula

**Agent infrastructure:**
- **Agentfiles** — [github.com/Railly/agentfiles](https://github.com/Railly/agentfiles) — Manage skills across 13+ AI agents from Obsidian
- **Agent Client** — Embed Claude Code/Codex/Gemini CLI inside Obsidian

### 9.5 kepano's Public Statements on AI and Agents

**Evidence:** [evidence/kepano-ai-strategy.md](./evidence/kepano-ai-strategy.md)

kepano's strategy is distinctive and deliberately anti-embedding:

**What he did:**
- Released [obsidian-skills](https://github.com/kepano/obsidian-skills) (Jan 2026) — 5 agent skills teaching AI how to work with Obsidian file formats
- [Tweeted](https://x.com/kepano/status/2008578873903206895): "I'm starting a set of Claude Skills for Obsidian... so far they're centered around helping Claude Code edit .md, .base, and .canvas files"

**What he explicitly did NOT do:**
- Add an "Ask AI" button to Obsidian
- Build proprietary AI features into the app
- Create an AI subscription tier
- Build RAG or vector search into core

**The philosophy:** "File over app." Apps are ephemeral; data in files endures. Instead of embedding AI in the app, teach agents the file formats. This aligns with Karpathy's approach: Obsidian is the viewer, not the processor.

**Implication:** kepano sees Obsidian's future as **the filesystem that agents work with**, not as the AI-powered app. This is a deliberate strategic choice that creates space for external tools but leaves workflow orchestration unsolved.

### 9.6 Community Discussions: Obsidian + AI Agents

**Evidence:** [evidence/community-ai-agent-ecosystem.md](./evidence/community-ai-agent-ecosystem.md)

Three paradigms are competing in the community:

| Paradigm | Examples | Pro | Con |
|---|---|---|---|
| **Plugin-Internal AI** | Copilot, Smart Connections, Notemd | Integrated UI, vault-aware | Limited by Obsidian plugin sandbox, no background processes |
| **MCP Bridge** | Obsidian Claude Code MCP, cyanheads MCP server | Full agent capabilities | Requires external tool setup |
| **Agent Skills (Format Teaching)** | obsidian-skills, Agentfiles | Zero runtime dependency | No live vault awareness, no hot-reload |

**Community sentiment:** Strongly positive about Obsidian + AI convergence. "Obsidian + AI is the new hot combo" ([source](https://x.com/Hesamation/status/2026801420872093708)). But fragmented across approaches. The MCP paradigm appears to be winning: it provides the richest integration without Obsidian plugin limitations.

**Key gap identified by community:** No standard way to orchestrate multi-step agent workflows. Each practitioner builds their own glue code. [Forum discussion](https://forum.obsidian.md/t/why-isn-t-there-a-standard-interface-plugin-for-ai-llms-in-obsidian/95431) explicitly asks: "Why isn't there a standard interface?"

---

## D10: What Obsidian Does Exceptionally Well

**Evidence:** [evidence/obsidian-strengths-detailed.md](./evidence/obsidian-strengths-detailed.md)

### 10.1 Why Developers Love Obsidian (Specific Features)

Based on developer blogs, reviews, and community discussion, these are the concrete features developers cite — not vibes:

1. **File-over-app / data ownership** — Vault is a folder of `.md` files. No proprietary database. Works with git. Files readable by any text editor forever. ([Source](https://photes.io/blog/posts/is-obsidian-a-local-first-app))

2. **Command palette** — Exact analogue to VS Code's `Cmd+P`. Fuzzy-match any command. Power users never touch the mouse. ([Source](https://www.faesel.com/blog/why-every-developer-needs-to-use-obsidian))

3. **Live Preview rendering** — Markdown renders inline as cursor moves away. No separate preview pane needed. LaTeX, Mermaid, code blocks all inline. ([Source](https://www.lindy.ai/blog/obsidian-review))

4. **Wikilinks + backlinks** — `[[natural linking]]` between notes. Backlink panel shows incoming references. Unlinked mentions detection. ([Source](https://practicalpkm.com/2025-obsidian-report-card/))

5. **Plugin ecosystem** — 2,749 plugins. Quote: "You cannot get this level of customization in Notion — you get what they give you." ([Source](https://tech-insider.org/notion-vs-obsidian-2026/))

6. **Free for personal use** — No subscription for core features. Optional paid sync ($4/mo) and publish ($8/mo). ([Source](https://obsidian.md/pricing))

7. **Git-compatible** — Vault is just files. `git init` works. Version control, branching, PR workflows all work naturally.

8. **Keyboard-driven** — Hotkey for every command. Custom keybindings. Vim mode available. Developer-native interaction model.

### 10.2 What Users Would Miss Most (Switching Costs)

Based on "I switched from Obsidian" posts ([dev.to](https://dev.to/dev_tips/why-i-switched-from-obsidian-a-real-developers-story-and-what-im-using-now-ndn), [xda-developers](https://www.xda-developers.com/switched-from-obsidian-to-joplin/)):

| Feature | Replaceability | Notes |
|---|---|---|
| **Plugin ecosystem** | Very hard | 2,749 plugins. Users build entire workflows around specific plugin combinations |
| **Wikilink navigation** | Medium | Other markdown apps support it, but Obsidian's implementation is deepest |
| **CSS customizability** | Hard | 414+ themes, infinite CSS snippets, Style Settings plugin creates GUI for CSS variables |
| **Dataview queries** | Very hard | Nothing comparable outside Obsidian. Query language over markdown metadata |
| **Community** | Hard | 60,000+ active Discord/forum members. Answers to almost any question |
| **Bases (database views)** | Medium | Table/List/Cards/Map views over notes. Newer feature but already well-adopted |
| **Graph view** | Low | Consensus: "more fun to look at than to actually navigate." Backlinks provide the real value |

**The "Obsidian magic" that's hardest to replicate:** The combination of (1) files you own + (2) rendered beautifully + (3) infinitely customizable + (4) free. No single alternative offers all four.

### 10.3 Plugin Ecosystem Scale and Quality

**Evidence:** [evidence/plugin-ecosystem-data.md](./evidence/plugin-ecosystem-data.md)

| Metric | Value |
|---|---|
| Total plugins | 2,749 |
| Total themes | 414+ |
| All-time downloads | 97.7M+ |
| 2025 downloads | 31.4M |
| New plugins (2025) | 792 |
| Unique developers (2025) | 782 |
| Weekly new plugins | 5-17 |
| Weekly plugin updates | 53-96 |

**Quality distribution:** The ecosystem follows a power law. A handful of plugins (Dataview, Templater, Excalidraw, Tasks) dominate with 100K+ downloads. The long tail includes many experimental or abandoned plugins. AI plugins are particularly variable: 86 catalogued, but "some may be deprecated, unmaintained, or miscategorized" ([source](https://github.com/danielrosehill/Awesome-Obsidian-AI-Tools)).

**Top new plugins of 2025** show the ecosystem's direction: Datacore (184K downloads) and Notebook Navigator (168K) lead, indicating demand for more powerful data views and navigation — exactly the infrastructure an LLM KB needs.

### 10.4 Performance with Large Vaults

- **Sweet spot:** Hundreds to low thousands of files — excellent performance
- **Degradation zone:** 5,000-10,000+ files — noticeable slowdowns in search, `[[` completion, initial load
- **Pain zone:** 10,000+ files with attachments — [20+ minute indexing](https://forum.obsidian.md/t/slow-performance-with-large-vaults/16633), [4-second delays per keystroke in link selector](https://forum.obsidian.md/t/slow-performance-with-large-vaults/16633)
- **Mobile:** Even worse — [unpractical load times](https://forum.obsidian.md/t/unpractical-vault-load-time-for-large-vaults-on-mobile-indexeddb-transactions-are-not-flushed-to-disk/88470) due to IndexedDB limitations
- **Mitigating factor:** Dataview itself [scales to "hundreds of thousands of annotated notes without issue"](https://blacksmithgu.github.io/obsidian-dataview/) — the bottleneck is Obsidian's core indexer, not the query engine
- **Plugin impact:** Each plugin adds to startup time. Power users with 20+ plugins report significantly longer load times

**Implication for LLM KB:** A Karpathy-style knowledge base that grows to hundreds of wiki articles + raw source documents will likely stay within Obsidian's comfortable range. But a truly ambitious knowledge base spanning multiple research domains could push into degradation territory.

### 10.5 The Graph View / Backlink Experience

**Consensus from community:**

- **Backlinks: genuinely useful.** "Core navigation and search is really based on the graph structure" ([source](https://practicalpkm.com/2025-obsidian-report-card/)). The backlink panel is how power users discover connections.
- **Local graph: underrated.** Shows the immediate neighborhood of a note. Useful for understanding context.
- **Global graph: diminishing returns.** "As your collection of notes gets bigger, the practical use of graph view can fade, turning into a tangled web that's more fun to look at than to actually navigate" ([source](https://www.lindy.ai/blog/obsidian-review)).
- **Power user view:** "Canvas and Graph view are fun to play with, but GUI-based things are just too slow compared to plain text and keyboard shortcuts" ([source](https://practicalpkm.com/obsidian-core-plugins-tier-list/)).

**For LLM KB workflow:** The graph structure is essential — LLM-compiled wikis naturally produce wikilinks, and backlinks enable serendipitous discovery across agent-generated content. The visual graph view is nice-to-have but not mission-critical.

### 10.6 Customizability Depth

Obsidian's customization operates at four layers:

1. **Themes** (414+ available) — Complete visual overhauls. Minimal, AnuPpuccin, etc.
2. **CSS snippets** — Surgical modifications. Any element is targetable. ([source](https://help.obsidian.md/snippets))
3. **Style Settings plugin** — [GUI for CSS variables](https://github.com/mgmeyers/obsidian-style-settings). Configurable via YAML comments in CSS files. Creates settings panes for colors, fonts, toggles.
4. **CSS variable architecture** — Hierarchical: foundation → semantic → component → context. Three override layers: Obsidian defaults → themes → user snippets → plugin styles. ([source](https://deepwiki.com/obsidianmd/obsidian-developer-docs/3.3-css-variables-reference))

**What's unique:** The combination of CSS snippets + Style Settings + themes creates a customization system where users can make Obsidian look like anything while maintaining a GUI for non-CSS-savvy users. No other markdown editor offers this depth.

### 10.7 Community and Ecosystem Health

| Metric | Value | Trend |
|---|---|---|
| Active users | 1.5M+ | 22% YoY growth ([source](https://fueler.io/blog/obsidian-usage-revenue-valuation-growth-statistics)) |
| ARR | $25M | 28% YoY growth |
| Team size | 18 people | Bootstrapped |
| Discord/forum members | 60,000+ active | Growing |
| Weekly plugin submissions | 5-17 new | Steady |
| Annual churn | <10% | Low |
| Sync revenue share | 80% of ARR | Core business model |

The ecosystem is healthy and growing. The 28% ARR growth with an 18-person team and <10% churn indicates a sustainable, community-driven business. The plugin submission rate of 5-17 new plugins per week shows continued developer investment.

**Caveat:** The Fueler stats should be taken as estimates — Obsidian doesn't publicly report exact figures. The 1.5M active user figure and $25M ARR are analyst estimates based on available data.

---

## Synthesis: Where Obsidian Supports, Partially Supports, or Fails the Karpathy Workflow

| Karpathy Stage | Obsidian's Role | Support Level | Gap |
|---|---|---|---|
| **Raw Ingest** | Web Clipper is excellent for web articles. Filesystem accepts any file. | **Strong** | No native ingestion for PDFs, videos, or structured data formats |
| **LLM-Compiled Wiki** | Obsidian renders the output beautifully. obsidian-skills teaches agents the format. | **Partial** — viewer only | Obsidian does not compile anything. All compilation is external. No orchestration layer. |
| **Q&A** | Can view results. Copilot/Smart Connections offer in-vault Q&A. | **Partial** | In-vault RAG plugins are mediocre compared to external LLM agents. No index file auto-maintenance. |
| **Rendered Output** | Excellent markdown rendering. Marp via Advanced Slides plugin. Embeds images. | **Strong** | No matplotlib rendering. No dynamic/interactive output. |
| **Wiki Linting** | Nothing native. | **None** | No mechanism for background health checks, consistency verification, or gap detection |
| **Compounding Knowledge** | Backlinks naturally create compounding structure when new content links to existing. | **Partial** | No automatic feedback loop. No agent trigger on new content. Manual only. |

### What a Replacement Must Respect

Any product targeting the LLM Knowledge Base workflow that wants to attract Obsidian users must provide:

1. **File ownership** — Users must be able to access their data as plain files without the app. Non-negotiable.
2. **Beautiful markdown rendering** — Live preview quality. LaTeX, Mermaid, code blocks, images.
3. **Wikilinks + backlinks** — The interconnection model that makes wiki-style knowledge bases work.
4. **Keyboard-driven workflow** — Command palette, hotkeys, vim mode options.
5. **Extensibility** — Not necessarily 2,749 plugins, but the ability to customize and extend.
6. **Free tier** — Obsidian is free for personal use. Paid-only will struggle to compete.
7. **Privacy/offline-first** — Local data by default. Cloud optional.
8. **Git compatibility** — Version control must work naturally.

### Where a Replacement Can Leapfrog

1. **Agent orchestration as a first-class primitive** — Background agents that watch, lint, compile, and compound
2. **Performance at scale** — Handle 10K+ files without degradation
3. **Unified AI interface** — No plugin fragmentation; one coherent AI integration
4. **Structured output from agents** — Proper vault-aware file generation, not "wall of prose"
5. **Compounding loop** — Outputs automatically enrich the knowledge base
6. **Multi-format ingest** — PDF, video, audio, structured data → markdown pipeline built in
7. **Collaborative** — Obsidian is explicitly single-user. Teams need to share knowledge bases.

---

## Key Sources

- [Karpathy X post on LLM Knowledge Bases](https://x.com/karpathy/status/2039805659525644595)
- [kepano/obsidian-skills on GitHub](https://github.com/kepano/obsidian-skills)
- [Eric J. Ma — Mastering PKM with Obsidian and AI](https://ericmjl.github.io/blog/2026/3/6/mastering-personal-knowledge-management-with-obsidian-and-ai/)
- [Daniel Pickem — LLM-Powered Work Notes](https://danielpickem.com/posts/2026_01_13_obsidian_note_taking_system/)
- [ObsidianStats — Plugins Wrapped 2025](https://www.obsidianstats.com/posts/2025-12-04-wrapped-2025)
- [Obsidian Forum — Standard AI Interface Discussion](https://forum.obsidian.md/t/why-isn-t-there-a-standard-interface-plugin-for-ai-llms-in-obsidian/95431)
- [Obsidian Forum — Large Vault Performance](https://forum.obsidian.md/t/slow-performance-with-large-vaults/16633)
- [Fueler — Obsidian 2026 Statistics](https://fueler.io/blog/obsidian-usage-revenue-valuation-growth-statistics)
- [Agentfiles Plugin](https://github.com/Railly/agentfiles)
- [Obsidian Claude Code MCP](https://github.com/iansinnott/obsidian-claude-code-mcp)
- [Awesome Obsidian AI Tools](https://github.com/danielrosehill/Awesome-Obsidian-AI-Tools)
- [Copilot for Obsidian](https://github.com/logancyang/obsidian-copilot)
- [Notemd Plugin](https://github.com/Jacobinwwey/obsidian-NotEMD)
- [DeepakNess — Karpathy LLM KB Analysis](https://deepakness.com/raw/llm-knowledge-bases/)
- [SEOtistics — Content Management with Obsidian & LLMs](https://seotistics.com/content-management-obsidian-llm/)
- [Obsidian Bases Documentation](https://help.obsidian.md/bases)
- [PracticalPKM — 2025 Obsidian Report Card](https://practicalpkm.com/2025-obsidian-report-card/)
