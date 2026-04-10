# Obsidian MCP/Agent Integration & Search Capabilities — Deep Dive

**Report date:** 2026-04-03
**Scope:** MCP server ecosystem, agent integration patterns, search capabilities, filesystem concurrency — evaluated against the Karpathy "LLM Knowledge Base" workflow
**Evidence:** [evidence/](evidence/)

---

## Executive Summary

Obsidian's agent integration ecosystem is broader than commonly understood: **16+ MCP servers**, 3 agent-in-Obsidian plugins, and a CEO-backed skills library exist as of April 2026. However, the ecosystem is fragmented — no single solution covers all Karpathy workflow stages. Search has quietly become the strongest dimension: at least 4 plugins and 2 MCP servers now offer hybrid BM25+semantic retrieval with reranking, approaching purpose-built quality for vaults under ~5,000 notes. The critical weakness remains concurrency safety: every MCP server grants unrestricted read/write access with no locking, no atomic writes, and no agent attribution — making the "LLM compiles wiki" stage risky for production use.

---

## D3: MCP / Agent Integration

### 3.1 MCP Server Landscape — Complete Enumeration

Sixteen distinct MCP servers for Obsidian were identified, ranging from 4 to 45 tools. They fall into three architectural categories by how they access the vault:

| Category | Servers | Mechanism | Obsidian Required? | Conflict Safety |
|----------|---------|-----------|-------------------|-----------------|
| **Direct filesystem** | mcpvault, obsidian-mcp-pro, StevenStavrakis, dp-veritas, Hybrid Search, aleksakarac (33 tools), obsidian-web-mcp, markdown-vault-mcp | Read/write files on disk | No | Low |
| **REST API bridge** | cyanheads, MarkusPfundstein, aaronsb/semantic, aleksakarac (12 tools), mcp-obsidian-advanced | Via [obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin | Yes | Medium |
| **Native Obsidian plugin** | aaronsb/mcp-plugin, obsidian-mcp-tools, iansinnott/claude-code-mcp | Runs inside Obsidian process | Yes | High |
| **Cloud/Serverless** | obsidian-vectorize-mcp | Cloudflare Workers + Vectorize | No (cloud) | N/A |

**Key finding:** Direct filesystem servers are the most popular (mcpvault at ~994 stars leads) because they require zero plugins and work when Obsidian is closed. But they bypass Obsidian's internal state — a fundamental trade-off for the Karpathy workflow where an agent writes wiki articles while a user reads them.

#### Detailed Server Comparison

**[mcpvault](https://github.com/bitbonsai/mcpvault)** (994 stars, 14 tools) — The pragmatic choice. BM25 search, zero dependencies, 40-60% smaller responses. Missing: semantic search, graph traversal, canvas support.

**[obsidian-mcp-pro](https://glama.ai/mcp/servers/rps321321/obsidian-mcp-pro)** (23 tools) — Most feature-complete. Includes `search_by_frontmatter`, `get_graph_neighbors` (N-hop traversal), `find_broken_links`, `find_orphans`, full canvas CRUD, daily note templates. Security-audited (path traversal, null byte, YAML injection). Missing: semantic search.

**[aaronsb/obsidian-mcp-plugin](https://github.com/aaronsb/obsidian-mcp-plugin)** (271 stars, 8 tool groups) — Only server with native Obsidian access, Dataview DQL execution, and Bases queries. Graph traversal with multi-hop depth control, backlinks, path-finding. <10ms file operations. Missing: semantic search, but closest to "Obsidian-native" agent experience.

**[obsidian-mcp-tools](https://github.com/jacksteamdev/obsidian-mcp-tools)** (703 stars) — Only server with semantic search (delegates to Smart Connections plugin). Only server with template execution (Templater). Security-conscious (SLSA provenance, no direct file access). Missing: frontmatter management, graph traversal, canvas.

**[dp-veritas/mcp-obsidian-tools](https://github.com/dp-veritas/mcp-obsidian-tools)** (4 stars) — **Enforced read-only** — all 9 tools are read-only by design. Natural-language queries with date filtering. Designed explicitly for safe Q&A.

Three servers now offer **configurable read-write modes**: dp-veritas (enforced read-only), aaronsb/mcp-plugin (togglable), and pvliesdonk/markdown-vault-mcp (configurable). Two servers offer production-grade auth: obsidian-web-mcp (OAuth 2.0 + PKCE) and markdown-vault-mcp (OIDC + bearer token).

**[Hybrid Search MCP](https://forum.obsidian.md/t/hybrid-search-hybrid-search-mcp-server-cli-for-ai-assistants-bm25-semantic-obsidian-native/112491)** — Most advanced search: triple-path retrieval (BM25 via FTS5 + fuzzy trigram + semantic vectors) with Reciprocal Rank Fusion. Title boosted 10×, aliases 5×. Single SQLite file, offline, incremental indexing.

**[aleksakarac/obsidian-mcp](https://github.com/aleksakarac/obsidian-mcp)** (45 tools — largest count) — Hybrid: 33 filesystem-native + 12 API-based. Only server with Tasks plugin, Kanban, Dataview inline fields, and template expansion. Uniquely comprehensive for vaults using the full Obsidian plugin ecosystem.

**[pvliesdonk/markdown-vault-mcp](https://github.com/pvliesdonk/markdown-vault-mcp)** (23 tools) — FTS5+semantic hybrid search with RRF fusion, `rename` with automatic backlink updates, `get_context` (consolidated dossier for a note), git auto-commit/push, OIDC auth, configurable read-write mode. Most complete single-server feature set.

**[jimprosser/obsidian-web-mcp](https://github.com/jimprosser/obsidian-web-mcp)** (92 stars, 9 tools) — Only server designed for **remote access** via Cloudflare Tunnel. OAuth 2.0 with PKCE, atomic writes, ripgrep-powered search, in-memory frontmatter index. Safe for Obsidian Sync.

Full inventory with all 16 servers and tool lists: [evidence/mcp-servers-inventory.md](evidence/mcp-servers-inventory.md)

### 3.2 kepano/obsidian-skills — What It Actually Teaches

[kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) (19,200+ stars) is authored by Steph Ango, Obsidian's CEO. It provides 5 SKILL.md files compatible with Claude Code, Codex CLI, and OpenCode:

| Skill | What it teaches | Karpathy workflow relevance |
|-------|----------------|---------------------------|
| **obsidian-markdown** | Wikilinks, embeds, callouts, frontmatter, tags, highlights, math, Mermaid, footnotes, block IDs | **HIGH** — Agent needs this to generate correct wiki articles |
| **obsidian-bases** | .base file format, YAML schema, filters (AND/OR/NOT), formulas, 4 view types, date arithmetic | **MEDIUM** — Useful for building structured views over compiled knowledge |
| **json-canvas** | .canvas files, nodes, edges, groups | **LOW** — Visual mapping, not core to text-based workflow |
| **obsidian-cli** | 15+ CLI commands: read, create, append, search, daily notes, property management, backlinks, tag analytics, plugin dev | **HIGH** — Programmatic vault interaction without MCP |
| **defuddle** | Extract clean markdown from web pages | **HIGH** — Directly supports raw article ingest stage |

**Assessment for the Karpathy workflow:**

The markdown skill is surprisingly thorough — it covers every Obsidian-specific syntax element an agent needs to generate correct wiki articles (wikilinks, callouts, frontmatter properties, embeds). The 6-step workflow it prescribes (add frontmatter → write content → link notes → embed → add callouts → verify) maps well to the "LLM compiles wiki" stage.

**Critical gaps:**
- No guidance on Dataview queries (needed for programmatic cross-reference views)
- No guidance on search operators (`path:`, `tag:`, `section:`, `block:`)
- No guidance on batch operations (the Karpathy workflow creates dozens of wiki articles)
- No guidance on file organization for large vaults
- No conflict resolution guidance for external writes

Full analysis: [evidence/kepano-skills-analysis.md](evidence/kepano-skills-analysis.md)

### 3.3 Obsidian Plugin API for Agent Interaction

Obsidian exposes a rich internal API via its plugin system, but it's designed for UI plugins, not external agents:

**Vault class** ([docs.obsidian.md](https://docs.obsidian.md/Plugins/Vault)):
- `vault.create()`, `vault.modify()`, `vault.delete()`, `vault.rename()` — full CRUD
- `vault.read()`, `vault.cachedRead()` — read with or without cache
- **`vault.process(file, fn)`** — Atomic read-modify-write (the safest write method for concurrent access)
- **`fileManager.processFrontMatter(file, fn)`** — Atomic frontmatter modification (caveat: destroys YAML formatting/comments)
- Events: `create`, `modify`, `delete`, `rename` — plugins can subscribe
- **No distinct event for "external change" vs "internal change"** — `modify` fires for both; plugins cannot distinguish agent writes from user edits
- Rename via Vault API automatically updates wikilinks (filesystem rename does NOT)

**MetadataCache** ([docs.obsidian.md](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache)):
- Parses and indexes all markdown files for fast structured access
- Events: `changed` (file re-indexed), `deleted`, `resolve`, `resolved` (all files processed)
- **Important:** `changed` is NOT fired on file renames for performance
- Access via `app.metadataCache` — provides links, headings, tags, frontmatter
- Source: https://www.mintlify.com/obsidianmd/obsidian-api/api/metadata-cache

**obsidian-local-rest-api** ([GitHub](https://github.com/coddingtonbear/obsidian-local-rest-api)):
- 17 REST endpoints in 8 categories
- CRUD on any file (including binary), periodic notes, search, commands, tags
- Surgical patching: append/prepend/replace within heading, block ref, or frontmatter field
- Search: Obsidian's built-in fuzzy search + Dataview DQL queries + JsonLogic
- OpenAPI spec exposed at `/openapi.yaml`
- **The bridge** that 3 MCP servers use (cyanheads, MarkusPfundstein, aaronsb/semantic)

**Obsidian URI scheme** (`obsidian://`):
- Native: `open`, `new` (with append/overwrite), `search`, `daily` actions
- Limited: no modify-existing, no frontmatter manipulation, no command execution
- **Advanced URI plugin** ([Vinzent03](https://publish.obsidian.md/advanced-uri-doc/Actions/Actions)) extends this significantly: heading-targeted writes, line-targeted writes, frontmatter field manipulation, search-and-replace with regex, command execution, workspace switching — making URI a viable agent interface layer

### 3.4 Filesystem Access Patterns & Failure Modes

**How file watching works:** Obsidian uses Node.js `fs.watch` with platform-native APIs (FSEvents on macOS, inotify on Linux). On local filesystems, detection is near-instant with a **~2-second debounce window**. On **cloud-synced vaults (iCloud, Dropbox, OneDrive), Obsidian switches to polling mode with a 30-second interval** — a critical detail for agent workflows targeting synced vaults. Obsidian auto-saves **~2 seconds after user input starts**, creating a real race condition window when agents write to files the user is editing.

**The critical insight:** Whether external writes are safe depends entirely on which access pattern the agent uses:

| Scenario | Direct Filesystem | REST API | Native Plugin |
|----------|-------------------|----------|---------------|
| Create new file | Safe (file appears in UI within seconds) | Safe (goes through Vault API) | Safe |
| Modify file while user has it closed | Safe | Safe | Safe |
| Modify file while user has it open | **RISKY** — user's save may overwrite agent's changes | Safer — Obsidian mediates | Safe |
| Rename file | **BREAKS LINKS** — seen as delete+create | Safe — uses Vault rename, updates links | Safe |
| Delete file | Goes to OS trash, not Obsidian trash | Goes through Obsidian deletion flow | Safe |
| Rapid burst (100+ files) | Safe on disk; UI/cache lags seconds | Rate-limited by REST API | Bound to event loop |
| Crash mid-write | **CORRUPTS FILE** — truncated content | Transaction through Obsidian | Protected by Obsidian |

**Critical discovery: `vault.process` / `vault.modify` fail during active editing.** Neither method works if called within 2 seconds of the user editing in the Obsidian editor, due to the `requestSave` debounce event ([forum](https://forum.obsidian.md/t/vault-process-and-vault-modify-dont-work-when-there-is-a-requestsave-debounce-event/107862)). This means even REST API-based writes can silently fail when the user is actively typing. No fix has been provided.

**Mitigation: [obsidian-drift](https://github.com/ryanbbrown/obsidian-drift)** — A purpose-built plugin for detecting external modifications from coding agents. Uses CodeMirror 6 transaction monitoring, provides side-by-side diff with selective accept/reject, and includes edit protection that warns before overwriting files with pending diffs.

**For the Karpathy workflow specifically:** The "LLM compiles wiki" stage creates many NEW files (compiled wiki articles). This is the safest operation mode — no conflicts with existing open files, no link breakage from renames. Direct filesystem access (mcpvault, obsidian-mcp-pro) is adequate for this stage.

The riskier stages are "wiki linting" (modifying existing files) and any workflow where the agent updates articles while the user reads them.

Full analysis: [evidence/filesystem-concurrency-analysis.md](evidence/filesystem-concurrency-analysis.md)

### 3.5 Agent-in-Obsidian Ecosystem

Three plugins now bring full agent capabilities inside Obsidian:

**[Claudian](https://github.com/YishenTu/claudian)** (5,700 stars) — Embeds Claude Code as sidebar chat. Word-level inline diffs with accept/reject. Full agentic: file CRUD, search, bash. Context-aware (auto-attaches focused note, @-mention files, tag exclusion). The closest thing to "Claude Code for your vault."

**[Agent Client](https://github.com/RAIT-09/obsidian-agent-client)** — Multi-agent support (Claude Code, Codex, Gemini CLI, custom). Multi-session. Built on Zed's Agent Client Protocol (ACP). @notename references, image attachments, terminal integration, file editing with permissions. The most agent-diverse option.

**[Obsidian AI CLI](https://github.com/blackdragonbe/obsidian-ai-cli)** — Lighter integration of Claude Code and Gemini CLI.

Full ecosystem map: [evidence/agent-ecosystem-map.md](evidence/agent-ecosystem-map.md)

---

## D4: Search Capabilities

### 4.1 Built-in Search — Deeper Than Expected

Obsidian's core search ([docs](https://help.obsidian.md/plugins/search)) is more capable than often credited:

**Operators:** `file:`, `path:`, `tag:`, `line:`, `block:`, `section:`, `task:`, `task-todo:`, `task-done:`, `match-case:`, `ignore-case:`

**Boolean logic:** Implicit AND, explicit `OR`, `-` negation, `()` grouping, nesting (`section:(tag:#important)`)

**Regex:** Full JavaScript regex between `/slashes/`, composable with operators

**Under-documented power feature:** `[property:value]` syntax enables native frontmatter search — `[author:Karpathy]`, `[status:Draft OR Published]`, `[source:null]` (find empty properties). Supports regex, OR, exact quotes. Composes with all other operators: `tag:#ml [status:reviewed] section:(loss function)`.

**Embedded search results:** Notes can embed live, auto-updating search results via `query` code blocks — useful for creating dynamic "index" notes in the Karpathy wiki.

**What's genuinely missing:**
- No relevance ranking (results ordered by modification time, not BM25)
- No fuzzy matching (Quick Switcher fuzzy-matches filenames only, not content)
- No semantic understanding
- No date range operators (`before:`, `after:` don't exist — must use Dataview for `WHERE date >= date("2024-01-01")`)
- No programmatic API for consuming search results from plugins

For the Karpathy Q&A workflow against ~100 articles: built-in search can find exact terms and regex patterns but cannot answer "what are the key arguments about X" — it's a literal matcher, not a knowledge retrieval system.

### 4.2 Omnisearch — The Fuzzy Layer

[Omnisearch](https://github.com/scambier/obsidian-omnisearch) (1,899 stars, 1.3M+ downloads, 2023 Obsidian Gems of the Year winner) adds what built-in search lacks:

- **BM25 relevance ranking** — results sorted by statistical relevance, not recency
- **Fuzzy matching** — tolerates typos and partial terms (via MiniSearch library)
- **PDF content indexing** — full-text search inside PDFs (via Text Extractor)
- **Image OCR** — search text within images
- **Path and filetype filters** — `path:"projects"`, `ext:"pdf"`

**For Karpathy workflow:** Useful for finding specific articles ("that paper about transformer efficiency") but still keyword-based — cannot answer conceptual questions.

### 4.3 Semantic/AI-Powered Search — The 2025-2026 Explosion

The landscape changed dramatically in 2025-2026. Five solutions now offer semantic search:

#### Smart Connections (4,400+ stars, 786K downloads)
- [GitHub](https://github.com/brianpetro/obsidian-smart-connections) | [Website](https://smartconnections.app)
- **Architecture:** Local-first embeddings with Smart Chat (Q&A)
- **Chunking:** Note-level AND block-level (paragraph/section) — configurable
- **Default model:** TaylorAI/bge-micro-v2 (384 dimensions)
- **Model support:** 100+ models via APIs, local via Ollama
- **Indexing speed:** ~3,000 notes in <10 minutes (BGE-micro)
- **RAG:** Smart Chat retrieves relevant chunks, passes to LLM, returns with citations
- **Limitation:** Semantic-only — no BM25 hybrid; no reranking; quality depends on model choice

#### Obsidian Copilot (logancyang/obsidian-copilot)
- [GitHub](https://github.com/logancyang/obsidian-copilot) (6,600 stars, 100K+ downloads) | [Website](https://www.obsidiancopilot.com)
- **Vault QA:** RAG with lexical (always active, no indexing needed) + semantic (optional) search
- **Hybrid:** Combines keyword + semantic retrieval
- **Embeddings:** OpenAI, Anthropic, Google, Ollama, LM Studio, any OpenAI-compatible model
- **Storage:** Orama vector database
- **v3.0+ breakthrough:** Vault search works WITHOUT building an index first
- **Agent Mode (Plus):** Autonomous tool-calling for multi-step vault operations
- **Known quality issues:** [Issue #1799](https://github.com/logancyang/obsidian-copilot/issues/1799) — "RAG hybrid search not choosing obvious candidates." Inconsistent results with local embeddings; poorly tuned hybrid can score lower than dense-only.

#### Smart Composer (glowingjade/obsidian-smart-composer)
- [GitHub](https://github.com/glowingjade/obsidian-smart-composer) (2,200 stars)
- **Explicit RAG:** Cmd+Shift+Enter triggers semantic vault search
- **Configurable:** Chunk sizes (500-1000 for precision), similarity threshold (-1.0 to 1.0)
- **`@<filename>` syntax** for specific file reference
- One-click apply AI edits to notes
- Local models via Ollama

#### Sonar (NEW — February 2026)
- [Obsidian Forum announcement](https://forum.obsidian.md/t/ann-sonar-offline-semantic-search-and-agentic-ai-chat-for-obsidian-powered-by-llama-cpp/110765)
- **Architecture:** Fully offline via llama.cpp
- **Models:** BGE-M3 (embeddings), BGE Reranker v2-m3 (reranking), Qwen3-8B (chat)
- **Hybrid retrieval:** Embeddings + BM25 + **cross-encoder reranking** — the only Obsidian plugin with reranking
- **Indexing:** Markdown, PDFs, audio transcription
- **Agentic:** Tool-use chat with extensible JavaScript tools
- **Requirements:** 32GB+ RAM, GPU recommended (Metal/CUDA)
- **Benchmark (Meta CRAG):** 43% accuracy, 32% hallucination — matched cloud GPT-4.1-mini (42%/35%) running fully local
- **Assessment:** Most technically sophisticated search plugin; hardware requirements limit accessibility but quality is validated

#### Obsidian QMD (thirteen37/obsidian-qmd)
- [GitHub](https://github.com/thirteen37/obsidian-qmd) — very new, Obsidian plugin port of [QMD by Tobi Lutke](https://github.com/tobi/qmd) (Shopify CEO)
- **Hybrid:** BM25 + semantic + query expansion
- **Embeddings:** all-MiniLM-L6-v2 (384d) via Transformers.js, entirely local
- **Chunking:** ~900-token chunks with 15% overlap, preferring markdown heading boundaries via scoring algorithm; AST-aware chunking for code files
- **Reranking:** Qwen3-Reranker-0.6B for LLM-based reranking
- **Fusion:** Reciprocal Rank Fusion (RRF) with position-aware blending (top results: 75% RRF / 25% reranker; lower results: 40% RRF / 60% reranker)
- **Assessment:** Most technically sophisticated chunking strategy; early but backed by serious engineering (Lutke's QMD CLI has wider adoption)

### 4.4 MCP Server Search Capabilities

| MCP Server | Search Type | Frontmatter Search | Date Filter | Tag Filter | Semantic |
|-----------|------------|-------------------|------------|-----------|----------|
| mcpvault | BM25 multi-word | ✅ (get_frontmatter) | ❌ | ✅ (manage_tags) | ❌ |
| cyanheads | Text + regex + JsonLogic | ✅ (manage_frontmatter) | Via JsonLogic | ✅ | ❌ |
| obsidian-mcp-pro | Full-text + folder scope | ✅ (search_by_frontmatter) | ❌ | ✅ (search_by_tag) | ❌ |
| aaronsb/plugin | Text + graph traversal | Via Dataview DQL | Via DQL | Via DQL | ❌ |
| obsidian-mcp-tools | Semantic (Smart Connections) | ❌ | ❌ | ❌ | ✅ |
| dp-veritas | Text + regex + NL queries | ✅ | ✅ | ✅ | ❌ |
| Hybrid Search MCP | BM25 + fuzzy + semantic RRF | ❌ (not documented) | ❌ | ✅ (tag filter) | ✅ |

**Key insight:** No single MCP server offers both structured metadata queries AND semantic search. The closest is combining aaronsb/mcp-plugin (Dataview DQL for structured queries) with obsidian-mcp-tools (Smart Connections for semantic) — but this requires running two MCP servers simultaneously.

### 4.5 Gap Analysis: Obsidian+Plugins vs Purpose-Built Semantic Search

For the Karpathy Q&A workflow (~100 articles, ~400K words), here is what a purpose-built system offers that Obsidian cannot match:

| Capability | Purpose-Built | Obsidian Best-Case | Gap |
|-----------|--------------|-------------------|-----|
| **Hybrid retrieval (BM25 + dense + rerank)** | Single unified pipeline | Sonar (local, 32GB RAM) or Hybrid Search MCP | Small — Sonar matches on quality |
| **Chunk-level indexing** | Configurable (sentence, paragraph, section) | Smart Connections (block-level) | Small — adequate for ~100 articles |
| **Structured metadata + semantic** | Combined in single query (`WHERE author='x' AND date>2024 AND semantic('query')`) | Two separate tools required (Dataview for metadata, then semantic search separately) | **Large** — the single biggest gap; no plugin can do this |
| **Query understanding** (expansion, synonyms) | Built-in | QMD has query expansion | Small-Medium |
| **RAG pipeline** (retrieve → LLM → answer) | Integrated with prompt engineering | Smart Connections Smart Chat, Copilot Vault QA, Sonar chat | Small — multiple options exist |
| **Incremental indexing** | <1s for new documents | Minutes for Smart Connections, variable for Sonar | Medium |
| **Index management** (rebuild, version, partial update) | Full control | Limited (Smart Connections: reset all or nothing) | **Medium** |
| **Multi-modal indexing** (PDF, images, audio) | Unified | Omnisearch (PDF+OCR), Sonar (PDF+audio) — separate tools | Medium |
| **Cross-vault search** | Single index | Per-vault only | **Large** (for multi-vault setups) |
| **Concurrent agent access** | Designed for it | No locking, no coordination | **Large** |
| **Search result provenance** (chunk → source → citation) | Full chain | Smart Connections provides citations | Small |

**Bottom line for 100 articles / 400K words:** Obsidian with Sonar or Hybrid Search MCP provides ~80% of purpose-built search quality. The gaps that matter are: (1) **no combined metadata+semantic queries** — the single biggest gap; you cannot issue `WHERE date >= '2024' AND semantic('transformer efficiency')` as one operation, (2) **pipeline fragmentation** — retrieval, reranking, and LLM Q&A are scattered across 3-4 separate tools, (3) **weak embedding defaults** — BGE-micro-v2 (384d) is materially worse than what a purpose-built system ships with (nomic-embed-text-v2, GTE-large). Scale-related gaps (index management, incremental indexing) are irrelevant at 100 articles.

**Notable context:** Both QMD (Tobi Lutke, Shopify CEO) and obsidian-skills (Steph Ango, Obsidian CEO) represent founder-level investment in this space — a signal that the "Obsidian as AI knowledge base" use case has serious institutional momentum.

### 4.6 Search for the Karpathy Workflow — Practical Assessment

**Stage: Q&A against compiled wiki**

| Query type | Tool | Quality | Experience |
|-----------|------|---------|------------|
| "Find articles about transformer efficiency" | Smart Connections | Good — semantic match on meaning | Results include relevant blocks with citations |
| "What did the 2024 papers say about scaling?" | Copilot Vault QA or Sonar | Adequate — RAG retrieves and synthesizes | May miss some papers without explicit "2024" in text |
| "Show all articles tagged #transformers from 2024" | Built-in: `tag:#transformers path:2024` OR obsidian-mcp-pro: `search_by_tag` + date | Good for exact matches | Cannot combine tag filter with semantic understanding |
| "What are the counterarguments to scaling laws?" | Sonar (hybrid + rerank) | Best available — BM25 catches "scaling laws", semantic catches conceptual counterarguments | Requires 32GB RAM, GPU |
| "Compare Author A's position with Author B's on X" | None adequate | Poor — requires cross-note reasoning | No plugin synthesizes across multiple notes |

**At ~100 articles (~400K words):** This vault size is well within Obsidian's comfortable range. BM25 alone is sufficient for keyword retrieval (Blake Crosley's research: BM25 adequate below ~2,400 notes). Adding Smart Connections or Sonar for semantic queries makes the experience comparable to a dedicated knowledge retrieval system.

**What breaks at scale:** Above ~5,000 notes, initial embedding indexing becomes slow (hours for Smart Connections with cloud models), metadata cache updates from rapid agent writes create UI lag, and built-in search performance degrades noticeably.

---

## Synthesis: Karpathy Workflow Stage Assessment

| Workflow Stage | Obsidian Support | Critical Tools | Key Risk |
|---------------|-----------------|----------------|----------|
| **Raw ingest** | ✅ Strong | mcpvault write_note, defuddle skill | None — file creation is safe |
| **LLM compiles wiki** | ⚠️ Adequate | mcpvault/mcp-pro + obsidian-markdown skill | Agent-generated content quality depends on skills; no write safety |
| **Q&A** | ✅ Strong | Sonar (best) or Smart Connections + Copilot | Hardware requirements for Sonar; quality inconsistency for Copilot |
| **Rendered output** | ✅ Strong | Obsidian's native Markdown rendering | None |
| **Wiki linting** | ⚠️ Partial | mcp-pro find_broken_links + find_orphans | No safe concurrent modification; no optimistic locking |
| **Search** | ✅ Strong (with plugins) | Hybrid Search MCP or Sonar | Fragmented — no single tool does everything |
| **Compounding knowledge** | ⚠️ Partial | Graph traversal (aaronsb/plugin), Bases | No automated "what's changed since last compilation" |

---

## Key Recommendations

1. **For the Q&A stage:** Use Sonar if hardware allows (32GB+ RAM), otherwise Smart Connections + obsidian-mcp-tools for semantic search via MCP. Combine with mcpvault or mcp-pro for structured queries.

2. **For agent writes:** Prefer creating NEW files over modifying existing ones. Use REST API bridge servers (cyanheads) when modifying existing content while Obsidian is open. Use direct filesystem servers (mcpvault, mcp-pro) only when Obsidian is closed or for new file creation.

3. **For agent formatting:** Install kepano/obsidian-skills (obsidian-markdown + obsidian-bases) into the agent's skill/instruction set. This provides adequate formatting guidance for ~90% of content generation needs.

4. **For the read-only Q&A use case:** dp-veritas/mcp-obsidian-tools is the only safe option — all other MCP servers grant full write access.

5. **Missing piece for production use:** No MCP server provides optimistic locking, atomic writes, or agent attribution. A production Karpathy workflow needs a wrapper that: (a) writes to a staging folder, (b) validates content, (c) moves to the wiki folder, (d) adds `agent-generated: true` frontmatter.

6. **Install [obsidian-drift](https://github.com/ryanbbrown/obsidian-drift)** if running any agent that writes to the vault. It provides side-by-side diff view with selective accept/reject for external modifications — the only safety net for agent writes to open files.

7. **Use git on the vault.** This is the single most important safety measure — every agent write is tracked and reversible. Combined with File Recovery core plugin (snapshots every 5 minutes), this provides defense-in-depth against data loss.

---

## Sources

### MCP Servers (16 identified)
- mcpvault: https://github.com/bitbonsai/mcpvault
- cyanheads/obsidian-mcp-server: https://github.com/cyanheads/obsidian-mcp-server
- MarkusPfundstein/mcp-obsidian: https://github.com/MarkusPfundstein/mcp-obsidian
- aaronsb/obsidian-mcp-plugin: https://github.com/aaronsb/obsidian-mcp-plugin
- aaronsb/obsidian-semantic-mcp: https://github.com/aaronsb/obsidian-semantic-mcp (archived)
- jacksteamdev/obsidian-mcp-tools: https://github.com/jacksteamdev/obsidian-mcp-tools
- rps321321/obsidian-mcp-pro: https://glama.ai/mcp/servers/rps321321/obsidian-mcp-pro
- StevenStavrakis/obsidian-mcp: https://github.com/StevenStavrakis/obsidian-mcp
- dp-veritas/mcp-obsidian-tools: https://github.com/dp-veritas/mcp-obsidian-tools
- Hybrid Search MCP: https://forum.obsidian.md/t/hybrid-search-hybrid-search-mcp-server-cli-for-ai-assistants-bm25-semantic-obsidian-native/112491
- aleksakarac/obsidian-mcp: https://github.com/aleksakarac/obsidian-mcp (45 tools)
- pvliesdonk/markdown-vault-mcp: https://github.com/pvliesdonk/markdown-vault-mcp (23 tools)
- jimprosser/obsidian-web-mcp: https://github.com/jimprosser/obsidian-web-mcp (remote access)
- iansinnott/obsidian-claude-code-mcp: https://github.com/iansinnott/obsidian-claude-code-mcp
- ben-vargas/obsidian-vectorize-mcp: https://github.com/ben-vargas/obsidian-vectorize-mcp (serverless)
- msdanyg/smart-connections-mcp: https://github.com/msdanyg/smart-connections-mcp

### Agent Integration
- Claudian: https://github.com/YishenTu/claudian
- Agent Client: https://github.com/RAIT-09/obsidian-agent-client
- kepano/obsidian-skills: https://github.com/kepano/obsidian-skills
- obsidian-local-rest-api: https://github.com/coddingtonbear/obsidian-local-rest-api

### Search Plugins
- Smart Connections: https://github.com/brianpetro/obsidian-smart-connections
- Omnisearch: https://github.com/scambier/obsidian-omnisearch
- Omnisearch MCP: https://github.com/anpigon/mcp-server-obsidian-omnisearch
- Obsidian Copilot: https://github.com/logancyang/obsidian-copilot
- Smart Composer: https://github.com/glowingjade/obsidian-smart-composer
- Sonar: https://forum.obsidian.md/t/ann-sonar-offline-semantic-search-and-agentic-ai-chat-for-obsidian-powered-by-llama-cpp/110765
- Obsidian QMD: https://github.com/thirteen37/obsidian-qmd
- ObsidianRAG (external): https://github.com/Vasallo94/ObsidianRAG

### Safety & Mitigation
- obsidian-drift: https://github.com/ryanbbrown/obsidian-drift
- vault.process debounce bug: https://forum.obsidian.md/t/vault-process-and-vault-modify-dont-work-when-there-is-a-requestsave-debounce-event/107862
- Advanced URI plugin: https://publish.obsidian.md/advanced-uri-doc/Actions/Actions

### Obsidian APIs & Documentation
- MetadataCache API: https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache
- Vault docs: https://docs.obsidian.md/Plugins/Vault
- Search docs: https://help.obsidian.md/plugins/search
- Blake Crosley hybrid retriever: https://blakecrosley.com/blog/hybrid-retriever-obsidian
- Obsidian Forum MCP discussion: https://forum.obsidian.md/t/obsidian-mcp-servers-experiences-and-recommendations/99936
