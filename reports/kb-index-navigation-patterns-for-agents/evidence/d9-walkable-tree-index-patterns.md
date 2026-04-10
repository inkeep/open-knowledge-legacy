# Evidence: Walkable Tree Index Patterns for Agent KB Navigation

**Dimension:** D9 — Hierarchical walkable indexes as navigation mechanism (vs flat catalog + search)
**Date:** 2026-04-07
**Sources:** RAPTOR (ICLR 2024), Microsoft GraphRAG, HiRAG (EMNLP 2025), Dust.tt engineering blog (3 posts + docs), LlamaIndex docs, Information Foraging Theory paper, SWE-Search, Fumadocs PageTree (OSS), SWE-bench agent analysis, ZenML LLMOps Database (Dust.tt analysis)

---

## Key sources referenced

- [RAPTOR: Recursive Abstractive Processing for Tree-Organized Retrieval (ICLR 2024)](https://arxiv.org/abs/2401.18059)
- [Microsoft GraphRAG: From Local to Global](https://arxiv.org/html/2404.16130v2)
- [HiRAG: Retrieval-Augmented Generation with Hierarchical Knowledge (EMNLP 2025)](https://arxiv.org/abs/2503.10150)
- [Dust.tt: How We Taught AI Agents to Navigate Company Data Like a Filesystem (April 2025)](https://dust.tt/blog/how-we-taught-ai-agents-to-navigate-company-data-like-a-filesystem)
- [LlamaIndex: Structured Hierarchical Retrieval](https://docs.llamaindex.ai/en/stable/examples/query_engine/multi_doc_auto_retrieval/multi_doc_auto_retrieval/)
- [Revisiting Human Information Foraging: Adaptations for LLM-based Chatbots (June 2024)](https://arxiv.org/html/2406.04452v1)
- [SWE-Search: Enhancing Software Agents with MCTS (Oct 2024)](https://arxiv.org/html/2410.20285v1)
- [Why Grep Beat Embeddings in Our SWE-Bench Agent (Augment/Jason Liu, Sep 2025)](https://jxnl.co/writing/2025/09/11/why-grep-beat-embeddings-in-our-swe-bench-agent-lessons-from-augment/)
- [Fumadocs PageTree Builder](https://github.com/fuma-nama/fumadocs) — packages/core/src/source/page-tree/builder.ts

---

## Findings

### Finding: Agents spontaneously prefer hierarchical navigation when available
**Confidence:** CONFIRMED
**Evidence:** [Dust.tt (April 2025)](https://dust.tt/blog/how-we-taught-ai-agents-to-navigate-company-data-like-a-filesystem)

Dust observed AI agents spontaneously inventing file-path syntax (`file:front/src/some-file-name.tsx`) to navigate company data instead of using semantic search. This led them to build a synthetic filesystem over organizational data (Slack, Notion, GitHub, spreadsheets) with five Unix-inspired commands: `list` (ls), `find`, `cat` (with pagination), `search` (semantic, scoped to subtrees), and `locate_in_tree`.

Key quote: The combination of browse + scoped search "transformed agents from 'sophisticated search engines' into 'true knowledge workers.'"

**Implications:** Agents have an emergent preference for structural navigation. Flat search forces agents to formulate queries blind. Hierarchical indexes provide navigational affordances that agents spontaneously exploit.

### Finding: Collapsed tree retrieval beats strict top-down traversal
**Confidence:** CONFIRMED
**Evidence:** [RAPTOR (ICLR 2024)](https://arxiv.org/abs/2401.18059)

RAPTOR builds a tree bottom-up: text chunks → embedded → clustered (GMM) → LLM summarizes each cluster → repeat recursively. Two retrieval strategies tested:
1. **Tree Traversal** — start at root, select top-k by cosine similarity, descend layer by layer
2. **Collapsed Tree** — flatten all layers, retrieve nodes until token budget (~2000 tokens, ~20 nodes)

**Collapsed tree consistently outperformed tree traversal** due to "greater flexibility in matching question granularity."

Benchmarks: 82.6% on QuALITY (vs 62.3% prior SOTA). Outperformed flat retrieval (BM25, DPR) by 1.8-4.5 percentage points.

**Implications:** A walkable tree index should support skip-level access (agent can read ANY folder's index directly) rather than forcing sequential top-down navigation. The hierarchy provides structure for the summaries, but retrieval should be flexible about which level to enter at.

### Finding: Hierarchical summaries reduce token cost by 97% vs flat source
**Confidence:** CONFIRMED
**Evidence:** [Microsoft GraphRAG](https://arxiv.org/html/2404.16130v2)

GraphRAG extracts knowledge graphs, applies Leiden community detection for recursive hierarchical clustering, and generates LLM summaries per community. Root-level summaries (C0) required 97% fewer tokens than source text with modest quality trade-offs. 72-83% comprehensiveness win rate, 62-82% diversity win rate (p<.001) vs flat RAG.

**Implications:** Per-folder index.md files that summarize contents serve the same function as GraphRAG community summaries. The token savings are dramatic — an agent reading a 500B folder index instead of scanning 50KB of articles gets the same orientation at 1% of the token cost.

### Finding: Multi-layer hierarchical retrieval outperforms flat and single-layer approaches
**Confidence:** CONFIRMED
**Evidence:** [HiRAG (EMNLP 2025)](https://arxiv.org/abs/2503.10150)

HiRAG builds a multi-layer knowledge graph where "each entity in a higher layer summarizes a cluster of entities in the lower layer." Retrieval operates at three levels: local (entity similarity), global (community summaries), and bridge (shortest paths connecting local to global). Achieved 87.6% win rate vs LightRAG (65.9%) and GraphRAG (64.1%) on question-focused summarization.

Key quote: The hierarchical structure addresses the "knowledge gap between local and global knowledge."

**Implications:** The three-level structure (global summary → folder/topic summary → article) directly maps to walkable per-folder indexes. The "bridge" concept (connecting local detail to global context) suggests folder indexes should include upward references (parent context) not just downward listings.

### Finding: LlamaIndex Tree Index implements depth-controlled agent traversal
**Confidence:** CONFIRMED
**Evidence:** [LlamaIndex docs](https://docs.llamaindex.ai/en/stable/examples/query_engine/multi_doc_auto_retrieval/multi_doc_auto_retrieval/)

LlamaIndex's Tree Index builds a hierarchical summary tree from nodes. Retrieval traverses root-to-leaf with `child_branch_factor` controlling how many children to explore at each level (default=1). This IS an agent walking a tree of summaries — the closest production implementation to the walkable folder index pattern.

Structured Hierarchical Retrieval variant: stores summarized metadata + original documents. System first retrieves relevant summaries, then drills into related chunks.

**Implications:** The `child_branch_factor` concept is analogous to the agent choosing which subfolder index to read next. The LlamaIndex implementation validates that tree-walking retrieval is a viable architecture, not just theoretical.

### Finding: Per-folder summaries act as "information scent" (foraging theory)
**Confidence:** CONFIRMED
**Evidence:** [Revisiting Human Information Foraging: Adaptations for LLM-based Chatbots (June 2024)](https://arxiv.org/html/2406.04452v1)

Pirolli & Card's Information Foraging Theory, adapted for LLM interactions. Five key adaptations documented, with the most relevant being: trust replaces traditional "information scent" as the heuristic for estimating value before interaction. In web navigation, scent comes from link text and snippet previews.

Key quote: "The LLM functions as an exceptionally rich 'information patch,' offering a high yield of relevant data with minimal effort. Learners, acting as rational foragers, tend to over-exploit this perceived high-value patch, thereby neglecting broader environmental exploration."

**Implications:** Per-folder index.md files provide explicit information scent — article titles, descriptions, topic tags that help the agent decide where to drill in. Flat search lacks this scent; the agent must formulate queries without navigational cues. The foraging theory framing explains WHY hierarchical indexes help: they provide decision-making affordances at each navigation point.

### Finding: SWE-bench agents succeed with grep because code is keyword-distinctive
**Confidence:** CONFIRMED
**Evidence:** [Why Grep Beat Embeddings (Augment/Jason Liu, Sep 2025)](https://jxnl.co/writing/2025/09/11/why-grep-beat-embeddings-in-our-swe-bench-agent-lessons-from-augment/)

Augment's top SWE-bench agent used grep+find exclusively. Key insight: repositories were small enough and code was sufficiently keyword-distinctive (function names, class names are unique identifiers) that search was not a bottleneck. Agent persistence (trying multiple keyword queries iteratively) compensated for simpler tools.

**Implications:** This may NOT generalize to prose KBs where articles about similar topics share vocabulary. Code has unique identifiers; knowledge articles about "deployment" all contain the word "deployment." Hierarchical navigation provides structural disambiguation that keyword search cannot — the agent can see that deployment/ci-cd/ and deployment/rollback/ are different subtrees without needing to grep into both.

### Finding: Fumadocs PageTree is the closest production implementation
**Confidence:** CONFIRMED
**Evidence:** Fumadocs OSS source (packages/core/src/source/page-tree/builder.ts)

Fumadocs implements a recursive PageTree with:
- Per-folder `meta.meta` files (YAML/JSON) with title, icon, description, ordering
- `index.{page}` files serve as folder entry points (folder README becomes folder name/description)
- Tree types: Root → Folder (with optional index Item, children, description) → Item (page)
- Utilities: `flattenTree()`, `findParent()`, `findSiblings()`, `visit()` with depth control

**Implications:** This is the closest OSS implementation to the per-folder index pattern. The key difference: Fumadocs builds the tree for sidebar rendering (human UI), not for agent MCP navigation. Exposing the PageTree structure via MCP tools with depth control would be the walkable index pattern.

### Finding: Scoped search within a subtree is the power move
**Confidence:** CONFIRMED
**Evidence:** Dust.tt (April 2025), RAPTOR (ICLR 2024)

Dust found browse + scoped search outperformed either alone. RAPTOR found collapsed tree (access any level) beat strict top-down. The convergent design: navigate to narrow scope, then search/retrieve within that scope.

**Implications:** The optimal design is not "walkable tree instead of search" but "walkable tree + search scoped to the current subtree." The agent navigates to `deployment/` via the tree, then searches within `deployment/` for "rollback strategy." Tree narrows scope; search finds within scope.

---

## Deep Dive: Dust.tt Synthetic Filesystem Implementation

**Date:** 2026-04-05
**Sources:**
- [Dust.tt: How We Taught AI Agents to Navigate Company Data Like a Filesystem](https://dust.tt/blog/how-we-taught-ai-agents-to-navigate-company-data-like-a-filesystem) (Published July 1, 2025; modified December 4, 2025)
- [Dust.tt: Building Deep Dive — Infrastructure for AI Agents That Actually Go Deep](https://dust.tt/blog/building-deep-dive-infrastructure-for-ai-agents-that-actually-go-deep) (December 3, 2025)
- [Dust.tt: Zero-Downtime Architecture Migration for AI Agents](https://dust.tt/blog/behind-the-curtains-how-we-conducted-our-first-major-architecture-transition-with-no-downtime) (April 4, 2025 — content nodes migration)
- [Dust.tt: 2025 Product Update Recap](https://dust.tt/blog/2025-dust-product-update-recap) (January 2, 2026)
- [ZenML LLMOps Database: Dust.tt Synthetic Filesystems](https://www.zenml.io/llmops-database/building-synthetic-filesystems-for-ai-agent-navigation-across-enterprise-data-sources)
- [Dust.tt Docs: Skills](https://docs.dust.tt/docs/skills)
- [Dust.tt Docs: Knowledge](https://docs.dust.tt/docs/knowledge)

### Finding: Dust.tt built a production synthetic filesystem over heterogeneous enterprise data with 5 Unix commands
**Confidence:** CONFIRMED
**Evidence:** [Dust.tt blog](https://dust.tt/blog/how-we-taught-ai-agents-to-navigate-company-data-like-a-filesystem)

Dust.tt ships a synthetic filesystem that maps heterogeneous enterprise data sources (Slack, Notion, GitHub, Google/Microsoft spreadsheets) into a unified Unix-like tree structure. The implementation uses five commands:

| Command | Unix analog | Function | Parameters (where known) |
|---------|-------------|----------|--------------------------|
| `list` | `ls` | Shows folder contents at a given path | Not detailed publicly |
| `find` | `find` | Searches for files by name across hierarchies | Not detailed publicly |
| `cat` | `cat` | Reads file contents with pagination | `nodeId: string, offset?: number, limit?: number, grep?: string` |
| `search` | `grep` (semantic) | Semantic search scoped to a specific subtree | Subtree path + query (details not public) |
| `locate_in_tree` | `which`/`realpath` | Shows full hierarchical path to a resource | Not detailed publicly |

The `cat` command is the most technically documented. Its parameters treat LLMs as "programs with limited working memory that must intelligently sample file portions":
- `offset` — start position in the document
- `limit` — maximum characters to return
- `grep` — filter lines matching a pattern (combines structural access with content filtering)

The tools are shipped as "Advanced Search" in the Agent Builder and are part of what Dust calls "Company Data" tools.

**Implications:** This is the strongest production validation of the walkable-tree-plus-scoped-search pattern. The 5-command design is deliberately minimal — Unix-inspired rather than novel. The `cat` pagination parameters are a practical solution to the context window problem that any KB navigation system must solve.

### Finding: Agents spontaneously invented filesystem-like syntax before the tools existed
**Confidence:** CONFIRMED
**Evidence:** [Dust.tt blog](https://dust.tt/blog/how-we-taught-ai-agents-to-navigate-company-data-like-a-filesystem)

Direct quote from the blog: "In April 2025, something kept showing up in our logs. Our AI agents were inventing their own syntax for searching content — `file:front/src/some-file-name.tsx`, `path:/notion/engineering/weekly-updates`."

The agents were "trying to reference resources by guessing names or file paths instead of formulating queries for the semantic search." Dust interpreted this as "a subtle hint at how agents behave instinctively."

This was not a designed feature — it was emergent agent behavior observed in production logs. The agents were attempting hierarchical path-based navigation even though only semantic search was available. This observation directly motivated the filesystem tool design.

**Implications:** This is the strongest empirical evidence that LLM agents have an innate preference for hierarchical/path-based navigation over flat search. The agents were not instructed to use paths — they invented the syntax spontaneously. This validates the core thesis that walkable tree indexes align with how agents naturally want to navigate.

### Finding: Data sources map to the filesystem via the "content nodes" architecture
**Confidence:** CONFIRMED
**Evidence:** [Dust.tt blog](https://dust.tt/blog/how-we-taught-ai-agents-to-navigate-company-data-like-a-filesystem), [Architecture migration post](https://dust.tt/blog/behind-the-curtains-how-we-conducted-our-first-major-architecture-transition-with-no-downtime)

The data source-to-filesystem mapping:

| Data Source | Filesystem Mapping |
|-------------|-------------------|
| **Notion** | Workspaces become root folders. Databases become special directories (both directory AND table — dual-nature). Pages can be both files (readable via `cat`) and directories (listable via `list`) when they contain nested sub-pages. |
| **Slack** | Channels become directories. Individual threads become files within those directories. |
| **GitHub** | Repositories maintain their natural hierarchical structure (already filesystem-like). |
| **Google/Microsoft Spreadsheets** | Become folders containing table representations. |

The underlying infrastructure is Dust's "content nodes" architecture. Content nodes are a unified representation of any piece of synchronized data — Notion pages, Slack threads, Zendesk tickets, etc. In April 2025, Dust migrated the content node hierarchy from individual connector services (where each connector had custom hierarchy logic) to a centralized Rust "core" service.

Key architectural quote from the migration post: "Passing along to core the hierarchy for a node alongside the data to index enforces consistency by design."

Before the migration, each of the 9+ connectors had separate hierarchy implementations. After: one unified hierarchy in core. The migration enabled handling "massive folder structures with thousands of files" and made page loading "noticeably faster."

The blog post acknowledges: "We realized we weren't just building navigation tools. We were creating synthetic filesystems — imposing coherent, navigable structures on data sources that have no filesystem at all."

**Implications:** The key design insight is that Notion pages with sub-pages and Slack channels with threads ALREADY have implicit hierarchy — Dust made it explicit and navigable. The dual-nature handling (Notion page as both file AND folder) is a non-trivial design decision that our index.md pattern doesn't need to solve (markdown files are always leaves, folders always have indexes).

### Finding: Scoped search works by specifying a subtree path
**Confidence:** CONFIRMED
**Evidence:** [Dust.tt blog](https://dust.tt/blog/how-we-taught-ai-agents-to-navigate-company-data-like-a-filesystem)

The `search` command performs semantic search scoped to a specific subtree. Example from the blog: "search in `/engineering/runbooks` for deployment procedures." The agent navigates to a folder path, then applies semantic search within that scope only.

The blog describes a concrete multi-step workflow:
1. Agent uses `find` to locate the "team weeklies" database
2. Calls `list` to examine recent entries
3. Identifies the most recent document
4. Uses `cat` with `grep` filtering to extract specific sections

This workflow solves a structural query ("What was in the TeamOS section of last week's team meeting notes?") that semantic search alone cannot handle — the query requires understanding temporal recency (last week), structural location (TeamOS section), and document identity (team weekly notes).

**Implications:** Scoped search is the critical bridge between tree navigation and content retrieval. The agent uses tree navigation to narrow scope (from all company data → engineering runbooks), then search to find within scope. This is the same browse-then-search pattern our index.md system should support via MCP tools.

### Finding: Folder summary generation method is undocumented
**Confidence:** UNCERTAIN
**Evidence:** Searched across Dust.tt blog, docs, and third-party analysis

The primary blog post does not detail how folder summaries or descriptions are generated. The content nodes architecture stores hierarchy metadata, and each node has standardized fields and MIME types. The Dust docs reference agents being able to "search and browse" knowledge attached to skills via a "filesystem abstraction."

However, no source documents whether folder-level descriptions/summaries are:
- LLM-generated from child content
- Manually authored by workspace admins
- Extracted from the data source (e.g., Notion database descriptions)
- Rule-based (computed from child node metadata)

The architecture migration post mentions "adding missing metadata fields to the node model" and "standardizing MIME types across all connectors" — suggesting metadata is stored per-node but not specifying summary generation.

**Implications:** This is a gap in the public documentation. For our index.md pattern, we would need to decide: auto-generate summaries via LLM, extract from frontmatter, or compute rule-based descriptions. Dust may be using source-native descriptions (Notion page titles, Slack channel descriptions) rather than generated summaries.

### Finding: No quantitative before/after performance metrics published
**Confidence:** NOT FOUND
**Evidence:** Searched Dust.tt blog, 2025 product recap, ZenML analysis, Temporal blog

Dust has published no quantitative metrics comparing agent task completion before vs after the filesystem tools. The blog uses qualitative language: agents were "transformed from 'sophisticated search engines' into 'true knowledge workers.'" The 2025 product recap mentions "advanced filesystem-like search" as a capability upgrade but provides no metrics.

The ZenML analysis notes: "multi-step navigation workflows may introduce latency compared to direct semantic search approaches."

The Deep Dive blog (December 2025) mentions agents can now conduct "10-30+ minute investigations" but this is about the overall deep research capability, not filesystem navigation specifically.

**Implications:** The absence of published metrics is a gap in the evidence base. The qualitative claims are strong but unquantified. For our system, we should plan instrumented A/B testing when deploying walkable indexes.

### Finding: Deep Dive extends the filesystem pattern into multi-agent research
**Confidence:** CONFIRMED
**Evidence:** [Dust.tt: Building Deep Dive](https://dust.tt/blog/building-deep-dive-infrastructure-for-ai-agents-that-actually-go-deep)

In December 2025, Dust shipped "Deep Dive" — a multi-agent research system built on top of the filesystem tools. Architecture:
- **@deep-dive** coordinator: decomposes tasks, uses parallel tool calling
- **@dust-planning** reviewer: strategic oversight with no data access, maximum reasoning effort
- **@dust-task** workers: up to 6 concurrent specialized agents, each with dedicated context windows

Key context engineering innovations:
- **Tool output pruning**: selectively replaces tool outputs with `<dust_system>This tool output is no longer available</dust_system>` markers, reclaiming context space while maintaining action history
- **Offloaded tool use**: large outputs (web pages, query results) treated as files with compact summaries; agents can explore details via pagination
- Built on Temporal workflows for durability (survives deployments)

The filesystem tools are the foundation — Deep Dive agents use `list`, `find`, `cat`, `search` to navigate company data during multi-step investigations. The observation that sparked Deep Dive was the same one that sparked the filesystem tools: "agents were spontaneously inventing filesystem-like syntax to navigate data they couldn't actually access properly."

**Implications:** The filesystem navigation pattern scales from single-step lookups to multi-agent research workflows. The tool output pruning and offloaded tool use patterns are relevant context engineering techniques for any agent navigating large document collections.

### Finding: Dust.tt's approach compared to our index.md pattern — convergent design, different substrate
**Confidence:** INFERRED
**Evidence:** Cross-reference of Dust.tt implementation with index.md pattern design

| Dimension | Dust.tt Synthetic FS | Our index.md Pattern |
|-----------|---------------------|----------------------|
| **Data substrate** | Heterogeneous SaaS APIs (Slack, Notion, GitHub) unified into virtual tree | Homogeneous markdown files already on disk |
| **Tree source** | Constructed from content node hierarchy in Rust core service | Native filesystem structure + frontmatter metadata |
| **Navigation tools** | Custom 5-command set (list, find, cat, search, locate_in_tree) | Standard `read_file` MCP tool on index.md files |
| **Folder summaries** | Unclear — possibly source-native descriptions | Auto-generated from frontmatter + file structure |
| **Search mechanism** | Semantic search scoped to subtrees | Keyword/tag search scoped to subtrees |
| **Pagination** | Built into `cat` (offset, limit, grep) | Not needed for index.md (small files); needed for article content |
| **Scale** | Enterprise-scale (thousands of files across 9+ connectors) | 100-1000 markdown articles |
| **Dual-nature nodes** | Yes (Notion pages = file + folder) | No (markdown files are leaves, folders have indexes) |
| **Agent tooling** | Proprietary tool framework | MCP-standard tools |

Key convergence: both systems arrive at the same fundamental pattern (navigate tree to narrow scope, then search/read within scope) from opposite directions. Dust built a filesystem over non-filesystem data. Our pattern leverages an existing filesystem and adds lightweight index files. The meeting point is identical: hierarchical navigation + scoped search.

Key divergence: Dust needs 5 custom tools because the underlying data isn't actually a filesystem. Our pattern may need only `read_file` and `search` because the data already IS a filesystem — the index.md files make the structure legible without custom navigation tools.

**Implications:** Our pattern is architecturally simpler because the data is already file-structured. Dust's 5-command design is an adaptation for non-filesystem data. The validation is that even when data ISN'T a filesystem, the industry builds filesystem-like navigation on top — confirming that filesystem structure is the preferred agent navigation paradigm.

---

## Negative searches

* Searched for: direct empirical comparison of walkable-tree-of-indexes vs flat-search for agent KB retrieval at 100-1000 articles — NOT FOUND. RAPTOR and HiRAG compare hierarchical vs flat retrieval but at different scales and with different architectures (embedding-based, not file-based).
* Searched for: production knowledge base (not codebase) using per-folder index.md files for agent navigation — NOT FOUND as a documented pattern. Dust is closest but uses a synthetic filesystem, not actual markdown files.
* Searched for: any system implementing exactly "auto-maintained index.md at every folder, agent reads via standard file tools" — NOT FOUND. This appears to be a novel design.
* Searched for: Dust.tt quantitative before/after metrics on agent task completion with filesystem tools — NOT FOUND. No published benchmarks, A/B tests, or task completion rate comparisons. Only qualitative language ("sophisticated search engines" to "knowledge workers").
* Searched for: Dust.tt folder summary generation methodology — NOT FOUND. Blog posts, docs, and third-party analyses do not document whether summaries are LLM-generated, rule-based, or extracted from source platforms.
* Searched for: Dust.tt talks, presentations, or conference content specifically about the filesystem navigation feature — NOT FOUND as standalone presentation. Stanislas Polu (co-founder) gave a talk titled "The Outer-Loop Era" at DotAI November 2025 and appeared on a Sequoia podcast, but neither focused specifically on the filesystem tools. A "Session for Builders" demo exists but predates the filesystem feature.
* Searched for: Dust.tt follow-up blog posts after the initial filesystem post — FOUND. The December 2025 "Building Deep Dive" post extends the filesystem pattern into multi-agent research. The January 2026 "2025 Product Update Recap" confirms "advanced filesystem-like search" as a shipped capability. No further technical deep-dives on the filesystem tools specifically.

---

## Gaps / follow-ups

* No empirical comparison exists at the 100-1K article scale specifically. RAPTOR/HiRAG benchmarks are on larger corpora with embedding-based retrieval.
* The RAPTOR finding (collapsed tree > tree traversal) should be validated in the file-based index context — the dynamics may differ when "retrieval" means reading a file vs computing cosine similarity.
* ~~Dust.tt's implementation details (how they generate folder summaries, what metadata they include) are not fully documented in the blog post.~~ **Partially resolved (2026-04-05):** Deep dive into Dust.tt sources confirmed the 5-command design, data source mapping, content nodes architecture, and scoped search mechanism. Folder summary generation remains undocumented.
* The interaction between walkable indexes and the "everything branchable" architecture needs exploration — do index.md files switch correctly on branch change?
* Dust.tt's `cat` pagination parameters (offset, limit, grep) suggest our system should consider similar pagination for longer articles, even if index.md files themselves are small.
* The Dust.tt OSS repo (github.com/dust-tt/dust) contains the actual tool implementations but the specific filesystem tool code was not located via GitHub search — the tool names may differ from the public-facing command names in the blog post.
