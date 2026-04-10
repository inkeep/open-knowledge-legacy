---
title: "KB Index and Navigation Patterns for AI Agents: How Agents Orient in Document Collections (2025-2026)"
description: "Comprehensive analysis of how AI agents navigate and index knowledge bases, codebases, and document collections — covering index-first navigation, AI-generated metadata/catalogs, enriched file trees, and graph traversal approaches. Maps the full spectrum from Claude Code's real-time exploration to Aider's repo-map to Karpathy's auto-maintained indexes, with convergence evidence and scale breakpoints."
createdAt: 2026-04-02
updatedAt: 2026-04-07
subjects:
  - Claude Code
  - OpenAI Codex
  - Cursor
  - Aider
  - Augment Code
  - Windsurf
  - Devin
  - Context7
  - Obsidian
  - Andrej Karpathy
  - Dust.tt
  - LightRAG
  - GraphRAG
  - Anthropic
topics:
  - agent navigation
  - knowledge base indexing
  - progressive disclosure
  - context engineering
  - repo-map
  - CLAUDE.md
  - AGENTS.md
  - graph traversal
  - frontmatter metadata
---

# KB Index and Navigation Patterns for AI Agents

**Purpose:** Determine how an AI agent should orient itself in a knowledge base of ~100-1000 markdown articles. Map the full spectrum of navigation approaches in production today — from real-time exploration to pre-built indexes to graph traversal — and identify which patterns the industry is converging on. Directly informs the design of an agent-native knowledge platform.

---

## Executive Summary

Eight independent investigations across coding agents, knowledge tools, academic research, and practitioner evidence converge on a single architectural answer: **progressive disclosure in three layers**. Every major tool builder — Anthropic (Agent Skills), OpenAI (Harness/Codex), Aider (repo-map), Context7 (two-tool MCP), Azure (Agentic Retrieval) — has independently arrived at the same pattern, and academic evidence from NeurIPS and arXiv validates it quantitatively.

The three layers are:

1. **Orientation layer** (always loaded, ~1K tokens): A lightweight catalog — article titles, one-line descriptions, topic tags. The agent reads this first to build a mental model of the KB. This is the CLAUDE.md / AGENTS.md / llms.txt equivalent for knowledge bases. Karpathy calls these "auto-maintained index files."

2. **Discovery layer** (on demand): Search and filter tools that let the agent find specific articles by keyword, tag, topic, or metadata query. At the 100-1000 article scale, keyword search achieves over 90% of vector RAG performance ([Amazon Science, Dec 2025](https://www.amazon.science/publications/keyword-search-is-all-you-need-achieving-rag-level-performance-without-vector-databases-using-agentic-tool-use)).

3. **Content layer** (targeted): Read the full article when the agent needs it. Only load full content when the task demands it.

The three candidate patterns from the research question map to this architecture: **directory drill-down** is a partial implementation of Layer 2 (browsing by folder/tag). **Graph traversal** is a complementary navigation mechanism within Layer 2 (follow wikilinks and backlinks between articles). **Enriched catalog/index** IS Layer 1 — and it is the most critical layer to get right.

**Key Findings:**

- **The "enriched catalog" pattern is the foundation.** Every successful agent navigation system starts with an index — whether human-authored (AGENTS.md), auto-generated (Aider's repo-map), or AI-compiled (Karpathy's approach). The catalog IS the primary navigation aid.
- **Progressive disclosure reduces token consumption by 61-95%.** RepoMaster (NeurIPS 2025) achieves 95% token reduction through hierarchical exploration. SocratiCode shows 61% reduction with hybrid search over grep-only. The mechanism: agents load the catalog first, then request only what they need.
- **At 100-1000 articles, the catalog itself may fit in context.** Karpathy's KB has ~100 articles totaling ~400K words. The index files and brief summaries for 100-1000 articles would consume ~2K-10K tokens — well within a single context window.
- **Keyword search is sufficient at this scale.** Amazon Science demonstrates that keyword search + agentic tool use achieves 90%+ of full RAG performance. Vector search is a premature optimization for sub-1000-article KBs.
- **Graph traversal is a complement, not an alternative.** Wikilinks between articles create an implicit navigable graph. Agents can follow links to discover related content. But this works best as a secondary navigation path after the catalog provides initial orientation.
- **Coding agents that navigate file systems outperform dedicated RAG.** Off-the-shelf coding agents outperform RAG state-of-the-art by 17.3% on long-context tasks when content is organized as files ([arXiv 2603.20432](https://arxiv.org/abs/2603.20432)). The file system is a natural navigation interface for LLMs.
- **No one has productized the Karpathy "auto-maintained catalog" pattern yet.** Despite being the most described and admired approach, no mature tool auto-generates and maintains a comprehensive KB catalog. This is the highest-value gap.

---

## Research Rubric

**Report Type:** Technology Deep-Dive / Ecosystem Landscape
**Primary Question:** How should an agent orient itself in a KB of ~100-1000 markdown articles? Which navigation patterns (directory drill-down, graph traversal, enriched catalog) does the industry converge on?
**Audience:** Product/engineering team building an agent-native knowledge platform
**Stance:** Factual/Academic — presenting the landscape for the team to draw conclusions

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | How coding agents navigate codebases | Deep (primary sources) | P0 |
| D2 | CLAUDE.md / AGENTS.md as the "index-first" pattern | Deep (mechanical + practical) | P0 |
| D3 | Aider's repo-map — explicit "index-first" implementation | Deep (mechanical) | P0 |
| D4 | AI-generated metadata and catalogs | Deep (practical) | P0 |
| D5 | Graph-based knowledge navigation | Deep (comparative) | P0 |
| D6 | File tree + metadata enrichment patterns | Deep (practical) | P0 |
| D7 | What actually works — practitioner evidence | Deep (quantitative) | P0 |
| D8 | Emerging patterns and convergence | Deep (comparative) | P0 |
| D9 | Walkable tree index patterns — hierarchical per-folder indexes as navigation mechanism | Deep (comparative) | P0 |
| D10 | Folder hierarchy conventions — flat vs structured at different scales | Deep (comparative + synthesis) | P0 |

**Non-goals:** Implementation guide for a specific platform; vector database comparison; detailed CMS evaluation; pricing analysis.

**Research purpose:** The reader cares most about: (1) which navigation pattern to implement first, (2) what evidence supports that choice, (3) what scale breakpoints to plan for, and (4) what the catalog should contain.

---

## Detailed Findings

### D1: How Coding Agents Navigate Codebases

**Finding:** Seven major coding agents use five distinct navigation strategies, but all converge on providing the agent with some form of upfront orientation before deeper exploration.

**Evidence:** [evidence/coding-agent-navigation.md](evidence/coding-agent-navigation.md)

The full spectrum of production navigation approaches:

| Agent | Strategy | Index? | Real-time tools? | Pre-built index? |
|-------|----------|--------|-------------------|------------------|
| **Claude Code** | CLAUDE.md + grep/glob/read | Orientation doc (CLAUDE.md) | Yes (primary) | No |
| **OpenAI Codex** | AGENTS.md → docs/ → code | Table of contents (AGENTS.md) | Yes (secondary) | Human-authored |
| **Cursor** | Vector search + AST chunking | N/A (search replaces index) | Minimal | Yes (embeddings) |
| **Aider** | tree-sitter repo-map + PageRank | Auto-generated map | Yes (after map orients) | Yes (repo-map) |
| **Augment Code** | Knowledge graph + semantic search | N/A (graph replaces index) | Minimal | Yes (graph) |
| **Windsurf** | RAG + Codemaps | AI-generated maps | Yes (Cascade agent) | Yes (Codemaps) |
| **Devin** | DeepWiki + project KB | AI-generated docs | Yes (interactive explorer) | Yes (DeepWiki) |

The key distinction is not "index vs no index" but rather **when the index is built and who builds it**:

- **Human-authored indexes** (CLAUDE.md, AGENTS.md): Cheapest to implement. Require maintenance. Most flexible. Proven at 1M LOC scale.
- **Auto-generated indexes** (Aider repo-map, Windsurf Codemaps): Built from code structure. Always current. Limited to what can be parsed.
- **AI-compiled indexes** (Devin DeepWiki, Karpathy's KB): Most expressive. Expensive to generate. Best for knowledge (not just code structure).
- **Embedding-based search** (Cursor, Augment): Replaces the index with retrieval. Requires infrastructure. Best for very large corpora.

**Implications for KB design:** For a 100-1000 article markdown KB, the **AI-compiled index** (Karpathy pattern) is the most appropriate analog. Unlike code, markdown articles need human-level understanding for useful summaries — tree-sitter parsing is insufficient.

**Decision triggers:**
- If the KB changes infrequently: human-authored catalog is sufficient
- If the KB changes frequently: auto-generated catalog is necessary
- If the KB exceeds ~5K articles: embedding-based search becomes justified

---

### D2: CLAUDE.md / AGENTS.md as the "Index-First" Pattern

**Finding:** CLAUDE.md and AGENTS.md serve different roles — CLAUDE.md is an orientation document (how to work in this project), while AGENTS.md in the OpenAI Harness pattern is a true index (table of contents pointing to deeper documents). The "index-first" pattern is most explicitly validated by the Harness Engineering case.

**Evidence:** [evidence/index-first-pattern.md](evidence/index-first-pattern.md)

**CLAUDE.md** is loaded at session start and contains: tech stack, build/test commands, coding conventions, critical warnings. Recommended size: 150-300 lines. It does NOT contain a file map or comprehensive index. Its role: "tell the agent what kind of project this is and how to work in it."

**AGENTS.md (Harness pattern)** is explicitly described as "a table of contents pointing to a structured docs/ directory." It's ~100 lines. The docs/ directory contains system maps, execution plans, and design specifications. The agent reads AGENTS.md first, then navigates to specific docs as needed. This is the "map, not manual" philosophy.

The critical insight: these serve **different functions** in the 3-layer architecture:

| File | Layer | Function | Analog for KB |
|------|-------|----------|---------------|
| CLAUDE.md | Layer 0 (meta) | How to work in this project | "How to use this KB" (conventions, organization system) |
| AGENTS.md (Harness) | Layer 1 (catalog) | What exists and where to find it | Article index with titles, descriptions, topic groups |
| docs/ files | Layer 3 (content) | Full content | Individual articles |

The **Codified Context** paper (arxiv 2602.20478) provides academic validation: a "hot-memory constitution" (always loaded) includes "retrieval hooks" that tell the agent how to find information in a "cold-memory knowledge base" of 34 specification documents. Developed across 283 sessions on a 108K-line codebase.

**Anthropic's Agent Skills** implement this as progressive disclosure: skill name+description (the index entry) → SKILL.md body (the summary) → references/scripts/assets (the full content). Anthropic's blog states: "the amount of context that can be bundled into a skill is effectively unbounded" because the agent only loads what it needs.

**Implications:** A KB needs BOTH a meta-document ("how this KB is organized, what conventions are used") AND a catalog ("what articles exist, organized by topic, with one-line descriptions"). These are two separate documents serving two separate purposes.

---

### D3: Aider's Repo-Map — The Most Explicit "Index-First" Implementation

**Finding:** Aider's repo-map is the most explicit and best-documented auto-generated index. It fits a useful codebase overview into ~1K tokens using tree-sitter parsing + PageRank ranking, and the LLM uses it to decide which files to request for deeper reading.

**Evidence:** [evidence/index-first-pattern.md](evidence/index-first-pattern.md)

**How it works technically:**

1. **Parse:** tree-sitter extracts symbol definitions (classes, functions, types) and references from all files in the repository. Supports 130+ languages via py-tree-sitter-languages.
2. **Build graph:** Each source file is a node. Edges connect files that have dependencies (file A references a symbol defined in file B).
3. **Rank:** PageRank identifies the most frequently referenced symbols — the "most important identifiers, the ones which are most often referenced by other portions of the code."
4. **Budget:** The --map-tokens parameter (default 1K tokens) controls how much of the ranked map to include. Dynamically adjusted based on chat state.
5. **Output:** A condensed representation showing file names, key symbol definitions, and critical source lines (function signatures, class declarations).

**What the map contains** (example):
```
src/models/user.py
│   class User
│       def __init__(self, name, email)
│       def validate()
│       def to_dict()
src/routes/auth.py
│   def login(request)
│   def register(request)
```

**How the LLM uses it:** The map serves two purposes: (1) The LLM can often solve tasks directly from the map (seeing function signatures is enough). (2) When more context is needed, the LLM knows which specific files to request.

**Token efficiency:** 1K tokens for a useful overview of an entire repository. This means a 1000-article KB catalog could potentially fit in ~2-5K tokens (title + one-line description per article).

**Could this pattern apply to a markdown KB?** Yes — but the "symbols" would be different. Instead of function signatures, the "symbols" would be: article title, frontmatter description/tags, first paragraph or summary. Instead of dependency edges, the edges would be: wikilinks between articles, shared tags, shared topics.

A "repo-map for a KB" would be:
```
articles/machine-learning/transformers.md
│   tags: [transformers, attention, architecture]
│   "Comprehensive overview of transformer architecture including self-attention mechanisms"
│   links to: [[attention-mechanisms]], [[bert]], [[gpt-architecture]]
articles/machine-learning/attention-mechanisms.md
│   tags: [attention, transformers, neural-networks]
│   "Deep dive into attention mechanisms — scaled dot-product, multi-head, cross-attention"
│   links to: [[transformers]], [[sequence-to-sequence]]
```

**Implications:** Aider's repo-map validates that a compressed, ranked index can fit useful KB navigation into minimal tokens. The key is what metadata to include (title, description, tags, links) and how to rank articles by importance (PageRank on the link graph, or editorial priority).

---

### D4: AI-Generated Metadata and Catalogs

**Finding:** The Karpathy "auto-maintained index" pattern is the most described but least productized approach. Individual metadata generation (tags, summaries) has multiple tools, but comprehensive KB-level catalog generation has no mature solution.

**Evidence:** [evidence/ai-generated-metadata.md](evidence/ai-generated-metadata.md)

**The Karpathy approach** operates at ~100 articles, ~400K words. Three stages: raw ingest → LLM compilation (creates structured wiki with summaries, encyclopedia articles, and backlinks) → active linting (scans for inconsistencies). The LLM "auto-maintains index files and brief summaries" and "can read all relevant material fairly easily at this small scale."

**What exists today for AI metadata generation:**

| Tool | What it generates | Scope | Production-ready? |
|------|-------------------|-------|--------------------|
| [Notion AI Autofill](https://www.notion.com/help/autofill) | Summaries, tags, key info, translations | Per-document | Yes |
| [Front Matter CMS](https://frontmatter.codes/docs/ai-features) | Title, description, tag suggestions | Per-document | Yes |
| [llm-knowledge-bases](https://github.com/rvk7895/llm-knowledge-bases) | Wiki articles, indexes, cross-references | KB-level (Karpathy) | Early-stage |
| Local LLM tagging | Category tags, metadata | Per-document | Experimental (92% accuracy reported) |
| [llms.txt](https://llmstxt.org/) | Site index with URLs and descriptions | Site-level | Yes (844K+ sites) |
| [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) | Teaches agents file formats (NOT indexing) | File-level | Yes |

**The gap:** No tool auto-generates and maintains a KB-level catalog — a single document that maps all articles with titles, descriptions, tags, and relationships. Notion gets closest with AI Autofill, but it operates per-document, not KB-wide. The Karpathy pattern describes this but no one has built a production-grade version.

**Implication for KB platform design:** The highest-value feature to build is the **auto-maintained catalog generator** — a process that reads all articles, generates/updates a structured index document, and keeps it in sync as articles change. This is the missing piece between "individual article metadata" and "agent-navigable KB."

---

### D5: Graph-Based Knowledge Navigation

**Finding:** Graph traversal via wikilinks is a useful secondary navigation mechanism, but the overhead of full graph databases (GraphRAG, LightRAG) is unjustified at the 100-1000 article scale. The wikilink structure already embedded in markdown provides sufficient graph navigation.

**Evidence:** [evidence/graph-navigation.md](evidence/graph-navigation.md)

**GraphRAG** (Microsoft): Builds community structures from document graphs. Costs ~$33K to index at production scale. Provides "strong global understanding but at extremely high token costs and slow update speeds." Designed for millions of documents, not hundreds.

**LightRAG** (EMNLP 2025, 51K+ GitHub stars): Lighter alternative that builds a knowledge graph during ingestion. Uses BFS traversal and dual-level keyword extraction. More practical than GraphRAG but still infrastructure-heavy for the target scale.

**Obsidian graph view:** Practitioners consistently report the global graph is "more fun to look at than to actually navigate." The local graph (connections around a single note) is practical. Backlinks are the most useful navigation feature.

**MCP graph tools:** 45+ Obsidian MCP servers exist. Three architectures: REST API bridge, filesystem direct, native plugin. The most useful graph operations for agents: list outgoing links, list backlinks, find paths between articles. Full graph algorithms (community detection, centrality) are niche.

**The practical finding:** For a markdown KB with [[wikilinks]], the graph already exists in the content. An agent needs:
1. A tool to list outgoing links from an article
2. A tool to list backlinks to an article
3. Optionally, a tool to find the shortest path between two articles

This requires zero graph infrastructure — just parsing [[wikilinks]] from markdown files.

**When full graph infrastructure IS justified:**
- The KB exceeds ~5000 articles
- Multi-hop reasoning across articles is a primary use case
- The link structure is dense (many cross-references)
- Community detection or topic clustering is needed

**Implications:** Wikilinks + backlink tools provide sufficient graph navigation for 100-1000 articles. Full graph databases are premature at this scale.

---

### D6: File Tree + Metadata Enrichment Patterns

**Finding:** The "frontmatter as database" pattern is well-established across static site generators, CMS platforms, and Obsidian. It provides structured, queryable metadata without requiring external databases.

**Evidence:** [evidence/file-tree-metadata-enrichment.md](evidence/file-tree-metadata-enrichment.md)

**The universal pattern across tools:**

```
1. Define schema → 2. Store entries with typed fields → 3. Query via API/tool
```

**Implementations:**

| Tool | Schema | Storage | Query |
|------|--------|---------|-------|
| Astro Content Collections | Zod schema | Markdown + YAML frontmatter | getCollection() with filter |
| Fumadocs | structuredData field | MDX + frontmatter | Orama search engine |
| Obsidian Dataview | Implicit (any YAML) | Markdown + frontmatter + inline fields | DQL / JavaScript |
| Notion | Database properties | Notion pages | Database filters/views |
| Keystatic | Git-based YAML schemas | Markdown/YAML/JSON | Git + typed queries |

**Obsidian Dataview** is the strongest proof point: it turns any markdown vault into a queryable database using frontmatter fields. Supports DQL queries like: `TABLE file.tags, description FROM "articles" WHERE contains(tags, "transformers") SORT file.mtime DESC`. This works without any external database — just markdown files with YAML frontmatter.

**The "catalog as compiled artifact" pattern:** Static site generators compile frontmatter into search indexes at build time. Fumadocs generates structuredData for Orama. Docusaurus generates Lunr indexes. Astro creates typed collections. The pattern: scan all files → extract metadata → compile into a single queryable index.

**llms.txt** applies this same pattern to agent consumption: scan all pages → extract titles and URLs → compile into a single markdown file agents can read. 844K+ websites have implemented it.

For a KB platform, this translates to: scan all articles → extract titles, descriptions, tags, links → compile into a catalog document (the "repo-map for knowledge").

**Implications:** Frontmatter metadata is already a proven database schema. The missing piece is the catalog compilation step — taking per-article metadata and compiling it into a single, agent-readable index.

---

### D7: What Actually Works — Practitioner Evidence and Benchmarks

**Finding:** The strongest quantitative evidence supports the "catalog + keyword search" pattern for the 100-1000 article scale, with clear scale breakpoints above and below.

**Evidence:** [evidence/practitioner-evidence.md](evidence/practitioner-evidence.md)

**Production-validated patterns:**

**OpenAI Harness Engineering** — The strongest case study. 3 engineers, 1M lines of code, 1500 merged PRs. AGENTS.md as table of contents → structured docs/ → source code. "Give Codex a map, not a 1,000-page instruction manual." Humans never wrote code directly. This is the index-first pattern at industrial scale.

**Amazon Science** (Dec 2025) — "Keyword search is all you need." Tool-augmented agents with keyword search achieve over 90% of full RAG performance without vector databases. Particularly effective on technical documentation. Simple to implement, cost-effective, ideal for frequently updated KBs. [Source](https://www.amazon.science/publications/keyword-search-is-all-you-need-achieving-rag-level-performance-without-vector-databases-using-agentic-tool-use)

**Coding Agents as Long-Context Processors** (arXiv 2603.20432, March 2026) — Off-the-shelf coding agents outperform RAG state-of-the-art by 17.3% on long-context tasks (including QA over document corpora up to 3 trillion tokens) when content is organized as files. Key insight: "By reformulating long-context tasks as file system navigation problems, coding agents can leverage their native capabilities."

**RepoMaster** (NeurIPS 2025) — Hierarchical exploration (overview → key files → specific details) achieves 95% token reduction and 110% improvement in task completion. "Map structure, start viewing key files, then jump to relevant files based on signals."

**RepoNavigator** (arXiv 2512.20957) — Single precise navigation tool outperforms multi-tool approaches. Adding tools beyond "jump" decreased performance from 24.28% to 13.71% IoU. Fewer, more precise tools beat many specialized tools.

**Context7** (51K+ GitHub stars) — Most popular MCP server in 2026. Exactly two tools: search libraries → get docs. Pure "catalog → content" pattern at massive documentation scale.

**Scale breakpoints** (synthesized from all evidence):

| Scale | Pattern | Token Budget | Evidence |
|-------|---------|-------------|----------|
| **<50 articles** | Full catalog + targeted reads | ~1-3K for catalog | Karpathy: ~100 articles readable at small scale |
| **50-500 articles** | Catalog + keyword search | ~3-10K for catalog | Amazon Science: 90%+ of RAG with keyword search |
| **500-5K articles** | Progressive disclosure + hybrid search | N/A (too large for single catalog) | SocratiCode: 61% fewer tokens with hybrid |
| **>5K articles** | Pre-built semantic index | N/A (must query) | Cursor, Augment at 100K-100M file scale |

**Token efficiency comparison** (estimated for a 500-article KB):

| Approach | Tokens for orientation | Tokens per query | Total for typical task |
|----------|----------------------|------------------|----------------------|
| No index (grep only) | 0 | ~5K-50K (multiple searches) | ~20K-100K |
| Catalog only (read full catalog) | ~5K | ~2K (targeted read) | ~7K-15K |
| Catalog + keyword search | ~5K | ~1K (search) + ~2K (read) | ~8K-12K |
| Hybrid search (no catalog) | 0 | ~2K (search + read) | ~4K-10K |

**Implications:** For 100-1000 articles, the catalog-first approach provides the best balance of accuracy (agent understands KB structure) and efficiency (most tasks resolved with catalog + 1-2 targeted reads).

---

### D8: Emerging Patterns and Convergence

**Finding:** The industry is converging on a 3-layer progressive disclosure architecture. Every major tool builder has independently arrived at this pattern.

**Evidence:** [evidence/convergence-patterns.md](evidence/convergence-patterns.md)

**The convergence is striking** — eight independent implementations arrived at the same structure:

| Implementation | Layer 1 (Orientation) | Layer 2 (Discovery) | Layer 3 (Content) |
|---|---|---|---|
| Anthropic Agent Skills | Skill name + description | Trigger → load SKILL.md | references/, scripts/, assets/ |
| OpenAI Harness/Codex | AGENTS.md (~100 lines) | Navigate to docs/ | Read specific doc/code |
| Context7 MCP | Library search results | Search docs by query | Full documentation page |
| Aider | Repo-map (~1K tokens) | LLM requests specific files | Full file content |
| Azure Agentic Retrieval | Query planning (LLM) | Subquery execution | Merged results + citations |
| Karpathy KB | Index files + summaries | Browse/search wiki | Full wiki article |
| Codified Context paper | Hot-memory constitution | Domain-expert agents | Cold-memory spec docs |
| Windsurf Codemaps | AI-annotated code maps | Cascade agent search | Full file content |

**"Context engineering" is the umbrella term.** Anthropic defines it as "the set of strategies for curating and maintaining the optimal set of tokens during LLM inference." [Anthropic's guide](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) explicitly describes the progressive disclosure pattern: "Each interaction yields context that informs the next decision: file sizes suggest complexity; naming conventions hint at purpose; timestamps can be a proxy for relevance."

**MCP resource vs tool design maps to navigation layers:**
- MCP resources (static, declared upfront) → Layer 1 (orientation catalog)
- MCP tools (dynamic, invoked on demand) → Layer 2 (search/browse) and Layer 3 (read article)

**"Agent legibility" is replacing "human readability" as a design principle.** OpenAI: repository structure prioritized "agent legibility." The Codified Context paper: "AI must be told — repeatedly, reliably, and in a format it can act on." [Cloudflare Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/) converts HTML to markdown specifically for agent consumption, achieving 80% token reduction.

**No one has standardized this pattern.** The convergence is organic — independent implementations reaching the same conclusion. No industry body, specification, or framework encodes "3-layer progressive disclosure for agent KB navigation" as a standard.

**The relationship to the three candidate patterns:**

| Candidate Pattern | Role in Converged Architecture | Status |
|---|---|---|
| Directory drill-down | Partial Layer 2 (browse by folder/tag) | Useful but insufficient alone |
| Graph traversal | Complementary Layer 2 (follow wikilinks) | Secondary navigation mechanism |
| Enriched catalog/index | IS Layer 1 (the critical foundation) | The pattern the industry converges on |

**Implications:** The enriched catalog is not one option among three — it is the foundation on which the other two patterns operate. Build the catalog first. Add search tools. Add link-following tools. This is the correct implementation order.

---

## Architecture Recommendation (Synthesized)

Based on all eight dimensions of evidence, a 4-component architecture for an agent-native KB of 100-1000 markdown articles:

```
┌─────────────────────────────────────────────────────────┐
│                    AGENT CONTEXT WINDOW                  │
│                                                         │
│  ┌───────────────────────┐                              │
│  │  Layer 0: Meta        │  "How this KB is organized"  │
│  │  (always loaded)      │  Conventions, taxonomy,      │
│  │  ~200 tokens          │  how to navigate             │
│  └───────────┬───────────┘                              │
│              │                                          │
│  ┌───────────▼───────────┐                              │
│  │  Layer 1: Catalog     │  All article titles +        │
│  │  (loaded on first     │  one-line descriptions +     │
│  │   KB interaction)     │  topic groups                │
│  │  ~2-10K tokens        │  The "repo-map for KB"       │
│  └───────────┬───────────┘                              │
│              │                                          │
│  ┌───────────▼───────────┐                              │
│  │  Layer 2: Discovery   │  keyword_search(query)       │
│  │  (tools, on demand)   │  list_by_tag(tag)            │
│  │  Variable tokens      │  get_backlinks(article)      │
│  │                       │  get_outlinks(article)       │
│  └───────────┬───────────┘                              │
│              │                                          │
│  ┌───────────▼───────────┐                              │
│  │  Layer 3: Content     │  read_article(slug)          │
│  │  (on demand)          │  Returns full markdown       │
│  │  ~1-5K tokens/article │                              │
│  └───────────────────────┘                              │
└─────────────────────────────────────────────────────────┘
```

**The catalog is the key artifact.** For 500 articles, the catalog would look like:

```markdown
# KB Catalog (auto-generated)

## Machine Learning (47 articles)
- **transformers** — Transformer architecture: self-attention, multi-head attention, positional encoding [tags: architecture, attention]
- **bert** — BERT: pre-training with masked language modeling and next sentence prediction [tags: nlp, pre-training]
- ...

## Systems (32 articles)
- **distributed-consensus** — Consensus algorithms: Paxos, Raft, Byzantine fault tolerance [tags: distributed-systems, consensus]
- ...
```

At ~20 tokens per entry, 500 articles = ~10K tokens. This fits comfortably in a single context window pass and gives the agent a complete mental model of the KB.

---

### D9: Walkable Tree Index Patterns — Hierarchical Per-Folder Indexes as Navigation Mechanism

**Finding:** Multiple systems (RAPTOR, GraphRAG, HiRAG, LlamaIndex, Dust.tt) validate hierarchical summary structures for agent retrieval, with consistent evidence that hierarchy + skip-level access outperforms both flat search and strict top-down traversal. The specific pattern of per-folder index.md files in a markdown KB appears to be a novel design, but its building blocks are independently validated. The optimal architecture is walkable tree + scoped search, not one replacing the other.

**Evidence:** [evidence/d9-walkable-tree-index-patterns.md](evidence/d9-walkable-tree-index-patterns.md)

#### The convergent finding: hierarchy helps, rigid traversal hurts

Five independent systems validate hierarchical retrieval structures:

| System | Architecture | Key Result |
|--------|-------------|------------|
| [RAPTOR](https://arxiv.org/abs/2401.18059) (ICLR 2024) | Bottom-up tree of LLM-generated cluster summaries | Collapsed tree (access any level) **beat strict top-down traversal**. 82.6% on QuALITY vs 62.3% SOTA. |
| [GraphRAG](https://arxiv.org/html/2404.16130v2) (Microsoft) | Hierarchical community summaries via Leiden clustering | Root summaries required **97% fewer tokens** than source text. 72-83% comprehensiveness win rate vs flat RAG. |
| [HiRAG](https://arxiv.org/abs/2503.10150) (EMNLP 2025) | Multi-layer knowledge graph with cluster summaries | **87.6% win rate** vs LightRAG (65.9%) and GraphRAG (64.1%). |
| [LlamaIndex Tree Index](https://docs.llamaindex.ai/en/stable/examples/query_engine/multi_doc_auto_retrieval/multi_doc_auto_retrieval/) | Hierarchical summary tree, depth-controlled traversal | Agent walks root-to-leaf selecting top-k children by similarity. `child_branch_factor` controls breadth. |
| [Dust.tt](https://dust.tt/blog/how-we-taught-ai-agents-to-navigate-company-data-like-a-filesystem) (July 2025) | Synthetic filesystem over org data (Slack, Notion, GitHub) with 5 Unix commands (list, find, cat, search, locate_in_tree) | Browse + scoped search outperformed either alone. Agents spontaneously invented file-path syntax before tools were built. |

The critical RAPTOR finding: **collapsed tree consistently outperformed strict tree traversal** because it offers "greater flexibility in matching question granularity." This means agents should be able to read ANY folder's index directly — not be forced to walk root → subfolder → sub-subfolder sequentially.

#### Agents spontaneously prefer hierarchical navigation

Dust.tt observed agents inventing file-path syntax to navigate company data before the feature was built. Direct quote from their engineering blog: "In April 2025, something kept showing up in our logs. Our AI agents were inventing their own syntax for searching content — `file:front/src/some-file-name.tsx`, `path:/notion/engineering/weekly-updates`." The agents were "trying to reference resources by guessing names or file paths instead of formulating queries for the semantic search." This was emergent behavior, not prompted — Dust interpreted it as "a subtle hint at how agents behave instinctively."

When given both browse (hierarchical) and search (semantic) tools, agents used browse to narrow scope, then search within that scope. Key quote: the combination "transformed agents from 'sophisticated search engines' into 'true knowledge workers.'"

This aligns with Information Foraging Theory adapted for LLMs ([June 2024 paper](https://arxiv.org/html/2406.04452v1)): per-folder summaries provide "information scent" — cues that help agents decide where to drill in. Flat search has no scent; the agent formulates queries without navigational affordances.

#### Dust.tt's synthetic filesystem: strongest prior art for walkable indexes

[Dust.tt](https://dust.tt/blog/how-we-taught-ai-agents-to-navigate-company-data-like-a-filesystem) (published July 2025, updated December 2025) built the most complete production implementation of the walkable tree pattern. They synthesize a unified filesystem over heterogeneous enterprise data (Slack channels, Notion workspaces, GitHub repos, spreadsheets) using five Unix-inspired commands:

| Command | Function | Key Detail |
|---------|----------|------------|
| `list` | Show folder contents (ls) | Returns children of a directory node |
| `find` | Search by filename across hierarchy | Locates resources by name/path |
| `cat` | Read file with pagination | `nodeId, offset?, limit?, grep?` — treats LLMs as "programs with limited working memory" |
| `search` | Semantic search scoped to subtree | Agent specifies a path like `/engineering/runbooks` and searches within |
| `locate_in_tree` | Show full path to a resource | Returns hierarchical breadcrumb |

**Data source mapping:** Notion workspaces become root folders, with databases serving as dual-nature nodes (both directory and file). Slack channels become directories with threads as files. GitHub repos maintain their natural hierarchy. Spreadsheets become folders of tables. The underlying "content nodes" architecture (migrated to a unified Rust core service in April 2025) enforces consistent hierarchy across 9+ connectors.

**Scoped search in practice:** A concrete workflow from the blog — to answer "What was in the TeamOS section of last week's team weekly's Notion doc?": (1) `find` the team weeklies database, (2) `list` recent entries, (3) identify the most recent document, (4) `cat` with `grep` filtering to extract the specific section. This is a structural query that semantic search alone cannot handle — it requires temporal recency, structural location, and document identity.

**What's NOT documented:** How folder summaries are generated (LLM vs rule-based vs source-native), quantitative before/after metrics on agent task completion, and the exact tool API signatures beyond `cat`.

**Deep Dive extension (December 2025):** Dust extended the filesystem pattern into a multi-agent research system ("Deep Dive") where a coordinator agent decomposes complex tasks for up to 6 concurrent worker agents, each using the filesystem tools to navigate company data during 10-30+ minute investigations. Context engineering innovations include tool output pruning (replacing consumed outputs with system markers to reclaim context) and offloaded tool use (treating large outputs as files with compact summaries).

**Comparison with our index.md pattern:** Both designs converge on the same fundamental architecture (navigate tree to narrow scope, search within scope) but from opposite directions. Dust builds a filesystem over non-filesystem data, requiring 5 custom tools. Our pattern leverages an existing filesystem and adds lightweight index.md files — potentially needing only `read_file` and `search` because the data already IS a filesystem. Dust's implementation validates that even when data ISN'T files, the industry builds filesystem-like navigation on top, confirming the filesystem as the preferred agent navigation paradigm.

#### What the walkable tree pattern looks like for a markdown KB

```
project/
  index.md                    ← root: 50 folders, ~2KB
  deployment/
    index.md                  ← 12 articles about deployment, ~500B
    ci-cd-pipeline.md
    rollback-strategy.md
    staging-environment.md
  authentication/
    index.md                  ← 8 articles about auth, ~400B
    oauth-setup.md
    session-management.md
    sso-configuration.md
```

Agent navigation:
1. Read `index.md` (root catalog, ~2KB) → builds mental model of entire KB
2. Sees "deployment/" folder with 12 articles → reads `deployment/index.md` (~500B)
3. Sees `rollback-strategy.md` is relevant → reads full article

Three reads. ~3KB of tokens for orientation. No search engine required.

Versus flat search: agent queries "rollback" → gets 5 ranked results → reads top result. Two operations, but the agent had no structural context about what ELSE exists in the deployment area, what it missed, or how the KB is organized.

#### The optimal design: tree + scoped search, not either/or

No primary source advocates pure tree walking OR pure search in isolation:

- **RAPTOR:** hierarchy provides structure, but retrieval should access any level (collapsed tree)
- **Dust.tt:** browse to narrow scope, search within scope
- **HiRAG:** three retrieval levels (local, global, bridge) operate simultaneously

The pattern for a markdown KB:
- **Tree navigation** for orientation ("what's in this KB?" → "what's in the deployment section?")
- **Scoped search** for discovery within a subtree ("within deployment/, find articles about blue-green")
- **Full read** for targeted consumption

The tree provides structure and scent. Search provides precision within that structure. Neither alone matches the combination.

#### Closest production implementations

- **Dust.tt synthetic filesystem** (production, July 2025): 5 Unix-inspired commands over unified content node hierarchy. Enterprise-scale (9+ connectors, thousands of files). The strongest prior art — validates the complete navigate-then-search pattern at production scale, though on heterogeneous SaaS data rather than markdown files.
- **Fumadocs PageTree** (OSS): Per-folder `meta.meta` files, recursive tree builder, `flattenTree()`/`visit()` utilities with depth control. Built for sidebar rendering, not agent navigation — but the data structure is directly reusable.
- **OpenAI AGENTS.md hierarchy:** Per-directory AGENTS.md files, root-to-CWD traversal, nearmost takes precedence. Validated for codebases, not knowledge bases.
- **Karpathy's index files:** Auto-maintained catalogs. Per-folder vs global structure not fully documented.

#### What's novel (not found in primary sources)

No primary source documents the specific pattern of: **auto-maintained `index.md` at every folder in a markdown KB, computed from frontmatter + file structure (no LLM), exposed to agents via standard `read_file` MCP tools.** The building blocks (hierarchical summaries, per-folder metadata, agent tree navigation) are all independently validated, but this specific assembly appears to be a novel design.

**Decision triggers:**
- At 100-500 articles with good folder structure: walkable tree indexes may be sufficient WITHOUT a search engine — three reads for ~3KB of orientation tokens
- At 500-5000 articles: tree indexes provide structure, scoped search provides precision within subtrees — both needed
- At any scale: skip-level access is essential — don't force sequential top-down traversal (RAPTOR finding)
- For P0: the tree index IS the search engine at small scale — auto-maintained `index.md` files serve the orientation and discovery layers without BM25 or vector search

---

### D10: Folder Hierarchy Conventions — Flat vs Structured at Different Scales

**Finding:** Six prior art systems use six distinct hierarchy strategies (canonical 4-level, type-prefixed, purpose-based, emergent, code-derived, clustered), but all converge on a maximum of 2-3 effective levels for the 100-1000 article scale. Cognitive science and practitioner evidence agree: deep hierarchies hurt retrieval; flat structures with per-folder indexes and dense cross-linking are optimal. The concrete recommendation for PQ17: **start flat at P0, let folders emerge from usage, enforce a maximum of 3 levels via convention.**

**Evidence:** [evidence/d10-folder-hierarchy-conventions.md](evidence/d10-folder-hierarchy-conventions.md)

#### The six hierarchy approaches from prior art

| System | Pattern | Depth | Who Creates | Key Mechanism |
|--------|---------|-------|-------------|---------------|
| **ByteRover** | `domain/topic/[subtopic]/entry.md` + `context.md` per folder | 2-4 | Agent (curation pipeline) | Canonical hierarchy, dynamically created during curation. NOT pre-scaffolded |
| **GBrain** | `type/entity-slug.md` (people/, companies/, concepts/) | 2 | Schema (pre-defined types) | Entity types as folders. Flat within type. 1,222 entries in a single type folder |
| **obsidian-mind** | Purpose folders (brain/, work/, org/, perf/) | 2-3 | Human (template scaffolding) | Function-driven, not content-driven. Backlinks > folders for navigation |
| **Karpathy** | No prescribed hierarchy. index.md + log.md | 0-? | Co-evolved human+LLM | "Intentionally abstract." Conventions emerge from use. index.md IS the navigation |
| **DeepWiki** | Subsystem hierarchy mirroring code structure | 2-4 | Auto-generated from source | Hierarchy derived from source material's own organization |
| **Graphify** | No folders. Leiden clustering on knowledge graph | 0 | Algorithm (topology) | Communities from link density replace folder groupings |

**The convergent finding:** No system exceeds 4 levels. The range is 0-4, with 2-3 being most common. The systems that scale largest (GBrain at 7K files, Wikipedia at 60M articles) use flat-within-type with cross-cutting metadata — not deep nesting.

#### How prior art compares to established KM patterns

| KM Pattern | Hierarchy Style | Depth | Agent Compatibility | Prior Art Analog |
|------------|----------------|-------|---------------------|-----------------|
| **PARA** (Tiago Forte) | 4 actionability folders | 2 | Low — categories are human-workflow-centric ("Projects" doesn't map to agent queries) | obsidian-mind's purpose folders |
| **Zettelkasten** (Luhmann) | Flat + dense links | 1-2 | High — structure through links, not containers. Directly matches graph navigation (D5) | Karpathy's emergent approach |
| **MOCs** (Nick Milo) | Index notes curating links | 1 (per MOC) | High — MOCs ARE index.md files. Bottom-up creation when clusters need organization | open-knowledge's CC6 auto-maintained index.md |
| **Wiki namespaces** (MediaWiki) | Type partitioning + categories | 2+ | Medium — namespace = type prefix (GBrain pattern). Categories = tags | GBrain's type-prefixed slugs |
| **Confluence spaces** | Team/project spaces + page trees | 3-4 | Medium — space = KB, page tree = navigation. Validated by Dust.tt synthetic filesystem | Multi-KB with per-KB hierarchy |
| **Notion hierarchy** | Workspace → teamspace → pages → sub-pages | 4 max | Medium — recommended max 4 levels based on cognitive science | ByteRover's 4-level maximum |

**The strongest convergence:** The MOC pattern and Karpathy's index.md pattern are the same thing — an index note that curates links to content, created bottom-up when a cluster of related content needs organization. This IS what open-knowledge's CC6 (auto-maintained index.md per folder) implements. The MOC/index.md pattern has been independently validated by: Obsidian community practice, Karpathy's LLM wiki, Aider's repo-map (D3), RAPTOR's collapsed tree (D9), and Dust.tt's filesystem (D9).

#### Cognitive science: why 2-3 levels is the sweet spot

Three converging lines of evidence:

1. **The depth-breadth tradeoff** ([Miller 1981](https://journals.sagepub.com/doi/10.1177/107118138102500179)): Retrieval time follows a U-shaped curve. Optimal: 2 levels with 8 items per level. For file systems, 3 levels is practical maximum for daily work.

2. **Spatial cognition in digital folders** ([Nature Scientific Reports 2015](https://www.nature.com/articles/srep14719)): Navigating folders activates the same brain structures as physical navigation. Deep hierarchies tax spatial working memory. For agents: each hierarchy level costs a tool call. More levels = more tokens consumed for navigation overhead.

3. **Flat + metadata outperforms deep hierarchy at scale** ([Karl Voit 2020](https://karl-voit.at/2020/01/25/avoid-complex-folder-hierarchies/), [dsebastien PKM at 8,000 notes](https://www.dsebastien.net/personal-knowledge-management-at-scale-analyzing-8-000-notes-and-64-000-links/)): Systems that started with deep hierarchies iteratively refactored toward "flat structures with strategic subfolders" + tags + links. IDC survey: knowledge workers spend 4.5 hours/week searching hierarchical systems; half the time they fail.

**The agent-specific finding:** Agent navigation cost scales linearly with hierarchy depth. At 2 levels, orienting to a topic requires 2 reads (root index.md → topic index.md). At 4 levels, it requires 4 reads. Given that orientation reads consume tokens without producing task value, minimizing hierarchy depth directly reduces the token cost of agent KB interaction. This aligns with D9's RAPTOR finding: collapsed tree (access any level) beat strict top-down traversal.

#### What works at each scale (synthesized)

| Scale | Hierarchy Recommendation | Navigation Mechanism | Evidence |
|-------|--------------------------|---------------------|----------|
| **<50 articles** | Flat. No folders | Root index.md only | Karpathy operates at ~100 with no folders. Index alone provides full orientation |
| **50-200 articles** | Optional 1-level grouping (~5-10 topic folders) | Root index.md + per-folder index.md | Obsidian community consensus: MOCs/links over folders. obsidian-mind: 7 purpose folders |
| **200-1000 articles** | 2 levels (topic/subtopic). Max ~15 top-level folders | Walkable tree indexes (D9) + keyword search | ByteRover 4-level (but only 2-3 used in practice). Notion recommends max 4. Cognitive science: 2-3 optimal |
| **1000-5000 articles** | 3 levels. Type or domain at top | Tree + scoped search (mandatory) | GBrain 7K files type-prefixed. Wikipedia namespaces + categories. Search essential alongside hierarchy |
| **5000+ articles** | Beyond P0. Needs database backing or sharding | Database query primary, hierarchy secondary | GBrain: SQLite canonical. Git chokes at ~5K files |

#### Concrete recommendation for PQ17: root index scope at P0

**Answer:** At P0 (100-1000 articles), the root index.md should **list all articles with one-line descriptions** (the flat listing option), not just top-level folders.

**Rationale:**

1. **Token budget is fine.** At 100 articles × ~20 tokens/entry = ~2K tokens. At 500 articles × ~20 tokens/entry = ~10K tokens. At 1000 articles, the flat listing exceeds comfortable single-read size (~20K tokens) — this is the breakpoint where folder-grouped root index becomes necessary. **For P0's target of 100-1000, flat listing works until ~500, then transition to grouped listing.**

2. **Agent orientation quality.** A flat listing gives the agent a complete mental model in one read. A folder-only root requires two reads (root → folder index) to see article-level content. The D9 RAPTOR finding is decisive: skip-level access outperforms sequential traversal. The flat listing IS skip-level access — the agent goes from "what exists?" to "I'll read article X" in one step.

3. **The breakpoint is natural.** When the root index.md exceeds ~500 entries, the auto-generation (CC6) should naturally group entries by folder, producing:
   ```markdown
   ## deployment/ (12 articles)
   - **ci-cd-pipeline** — How our CI/CD pipeline works [deployment, devops]
   - **rollback-strategy** — Rollback procedures and decision tree [deployment, incidents]
   ...
   
   ## authentication/ (8 articles)
   - **oauth-setup** — OAuth 2.0 configuration guide [auth, setup]
   ...
   ```
   This is still a single file — just with folder headings for scannability. The agent still reads one file for full orientation.

4. **Don't impose hierarchy at P0 — let it emerge.** This is rabbit hole #4: "the conventions should emerge from real skill usage, not be designed top-down." The correct P0 behavior:
   - `npx openknowledge init` creates an empty KB with no folders
   - Users/agents create articles at root level
   - When a user creates a folder (manually or via agent skill), CC6 auto-generates an index.md for that folder
   - The root index.md reflects whatever structure exists — flat listing if flat, grouped listing if folders exist
   - No convention enforcement on folder names or depth

5. **Open-knowledge's CC6 already supports this.** The spec says "recursive index.md per folder." This means: if folders exist, each gets an index.md. If no folders exist, only root index.md exists. The hierarchy support is already built — the question was just whether to impose it or let it emerge. Answer: let it emerge.

**Default convention (recommended, not enforced):** For KBs that grow beyond ~50 articles, the reference skills should SUGGEST (not require) organizing by topic:
```
articles/
  machine-learning/
    transformers.md
    attention-mechanisms.md
  systems/
    distributed-consensus.md
    load-balancing.md
```

But a flat layout works fine too:
```
transformers.md
attention-mechanisms.md
distributed-consensus.md
load-balancing.md
```

The CC6 index.md generator handles both correctly. The reference skills should work with whatever structure exists.

**What this resolves:**
- **PQ17 is answered:** Flat listing at P0. Grouped listing auto-activates when folders exist. No need to decide at project level — CC6 handles it dynamically.
- **Rabbit hole #4 is respected:** No pre-defined taxonomy. Conventions emerge from reference skill usage.
- **D9 is complemented:** D9 validated the walkable tree mechanism. D10 answers "but what tree structure?" — the answer is: whatever structure the user creates, kept shallow (2-3 levels max by convention).

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Quantitative A/B test of navigation patterns on identical KB:** No study directly compares catalog-first vs search-first vs graph-first on the same markdown KB with the same agent. All evidence is from analogous domains (codebases, documentation platforms).
- **Continue.dev and Cody:** Their search/navigation approaches were not deeply investigated.
- **Roam Research / Logseq agent interaction:** Not deeply investigated beyond the general bidirectional linking model.

### Remaining Uncertainty
- **Auto-generated catalog quality:** Evidence for AI-generated article summaries is strong for individual documents (92% accuracy) but untested for KB-level catalog coherence and maintenance.
- **Scale boundary precision:** The 500-5000 article boundary where catalog-only breaks down is inferred from proxy evidence (Dataview performance, context window sizes), not directly measured.
- **Graph traversal utility:** No quantitative evidence compares "agent follows wikilinks" vs "agent uses search" for finding related content in a markdown KB.
- **Dust.tt quantitative impact:** Dust.tt has published no before/after metrics on agent task completion rates with the filesystem tools. The qualitative evidence ("sophisticated search engines" to "knowledge workers") is strong but unquantified. Folder summary generation methodology also remains undocumented.

### Out of Scope (per Rubric)
- Specific vector database comparisons
- CMS platform detailed evaluation
- Implementation guide for any specific platform
- Pricing analysis of infrastructure options

---

## References

### Evidence Files
- [evidence/coding-agent-navigation.md](evidence/coding-agent-navigation.md) — How 7 major coding agents navigate codebases
- [evidence/index-first-pattern.md](evidence/index-first-pattern.md) — CLAUDE.md, AGENTS.md, repo-map, Codified Context, Agent Skills
- [evidence/ai-generated-metadata.md](evidence/ai-generated-metadata.md) — Karpathy approach, Notion AI, Front Matter CMS, llms.txt, automated tagging
- [evidence/graph-navigation.md](evidence/graph-navigation.md) — GraphRAG, LightRAG, Obsidian graph, MCP graph tools, wikilinks
- [evidence/file-tree-metadata-enrichment.md](evidence/file-tree-metadata-enrichment.md) — SSG content indexing, Dataview, CMS patterns, llms.txt
- [evidence/practitioner-evidence.md](evidence/practitioner-evidence.md) — Harness Engineering, Amazon Science, RepoMaster, RepoNavigator, Context7, scale breakpoints
- [evidence/convergence-patterns.md](evidence/convergence-patterns.md) — 3-layer progressive disclosure, context engineering, MCP design, agent legibility
- [evidence/d9-walkable-tree-index-patterns.md](evidence/d9-walkable-tree-index-patterns.md) — Hierarchical per-folder indexes: RAPTOR, GraphRAG, HiRAG, Dust.tt, LlamaIndex, foraging theory, Fumadocs PageTree
- [evidence/d10-folder-hierarchy-conventions.md](evidence/d10-folder-hierarchy-conventions.md) — Folder hierarchy conventions: 6 prior art approaches, established KM patterns (PARA, Zettelkasten, MOC, wiki namespaces), cognitive science on depth, scale analysis, PQ17 recommendation

### External Sources
- [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic: Equipping Agents with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [OpenAI: Harness Engineering](https://openai.com/index/harness-engineering/)
- [OpenAI: Codex AGENTS.md Documentation](https://developers.openai.com/codex/guides/agents-md)
- [Aider: Repository Map](https://aider.chat/docs/repomap.html)
- [Aider: Building a Better Repo Map with Tree-Sitter](https://aider.chat/2023/10/22/repomap.html)
- [Cursor: Codebase Indexing](https://docs.cursor.com/context/codebase-indexing)
- [Augment Code: Context Engine](https://www.augmentcode.com/context-engine)
- [Amazon Science: Keyword Search Is All You Need](https://www.amazon.science/publications/keyword-search-is-all-you-need-achieving-rag-level-performance-without-vector-databases-using-agentic-tool-use)
- [arXiv 2603.20432: Coding Agents are Effective Long-Context Processors](https://arxiv.org/abs/2603.20432)
- [arXiv 2505.21577: RepoMaster (NeurIPS 2025)](https://arxiv.org/abs/2505.21577)
- [arXiv 2512.20957: One Tool Is Enough (RepoNavigator)](https://arxiv.org/abs/2512.20957)
- [arXiv 2602.20478: Codified Context Infrastructure](https://arxiv.org/abs/2602.20478)
- [Context7 GitHub Repository](https://github.com/upstash/context7)
- [SocratiCode Benchmarks](https://github.com/giancarloerra/socraticode)
- [Karpathy LLM KB Architecture (VentureBeat)](https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an/)
- [Obsidian Dataview](https://blacksmithgu.github.io/obsidian-dataview/)
- [llms.txt Specification](https://llmstxt.org/)
- [Cloudflare: Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/)
- [Azure AI Search: Agentic Retrieval](https://learn.microsoft.com/en-us/azure/search/agentic-retrieval-overview)
- [Agents Meta-Repository Pattern](https://seylox.github.io/2026/03/05/blog-agents-meta-repo-pattern.html)
- [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills)
- [State of Context Engineering in 2026](https://www.newsletter.swirlai.com/p/state-of-context-engineering-in-2026)
- [LightRAG (EMNLP 2025)](https://github.com/HKUDS/LightRAG)
- [Dust.tt: How We Taught AI Agents to Navigate Company Data Like a Filesystem (July 2025)](https://dust.tt/blog/how-we-taught-ai-agents-to-navigate-company-data-like-a-filesystem)
- [Dust.tt: Building Deep Dive — Infrastructure for AI Agents That Actually Go Deep (December 2025)](https://dust.tt/blog/building-deep-dive-infrastructure-for-ai-agents-that-actually-go-deep)
- [Dust.tt: Zero-Downtime Architecture Migration (April 2025)](https://dust.tt/blog/behind-the-curtains-how-we-conducted-our-first-major-architecture-transition-with-no-downtime)
- [Dust.tt: 2025 Product Update Recap (January 2026)](https://dust.tt/blog/2025-dust-product-update-recap)
- [Miller 1981: Depth/Breadth Tradeoff in Hierarchical Menus](https://journals.sagepub.com/doi/10.1177/107118138102500179)
- [Nature Scientific Reports 2015: Digital Folder Navigation Uses Same Brain Structures as Real World Navigation](https://www.nature.com/articles/srep14719)
- [Karl Voit 2020: Don't Do Complex Folder Hierarchies](https://karl-voit.at/2020/01/25/avoid-complex-folder-hierarchies/)
- [dsebastien: Personal Knowledge Management at Scale — 8,000 Notes](https://www.dsebastien.net/personal-knowledge-management-at-scale-analyzing-8-000-notes-and-64-000-links/)
- [MediaWiki Help: Namespaces](https://www.mediawiki.org/wiki/Help:Namespaces)
- [Bergman et al.: Effect of Folder Structure on Personal File Navigation](https://www.researchgate.net/publication/220432870_The_Effect_of_Folder_Structure_on_Personal_File_Navigation)

### Related Research
- [/Users/edwingomezcuellar/reports/agent-knowledge-retrieval-paradigms-2025-2026/](../agent-knowledge-retrieval-paradigms-2025-2026/) — Covers the broader RAG-to-agentic-retrieval evolution and MCP interface design
- [/Users/edwingomezcuellar/reports/ai-agent-codebase-navigation/](../ai-agent-codebase-navigation/) — Deeper dive into specific code search implementations (tree-sitter, embeddings, PageRank)
- [/Users/edwingomezcuellar/reports/agent-repo-config-files/](../agent-repo-config-files/) — Comprehensive CLAUDE.md / AGENTS.md mechanics, loading, and best practices
- [/Users/edwingomezcuellar/reports/obsidian-karpathy-workflow-deep-dive/](../obsidian-karpathy-workflow-deep-dive/) — Capability-by-capability Obsidian evaluation for the Karpathy workflow
