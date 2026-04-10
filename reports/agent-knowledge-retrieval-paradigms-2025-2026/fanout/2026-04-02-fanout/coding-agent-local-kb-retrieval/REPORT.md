# Coding Agent & Local KB Retrieval: How AI Agents Find and Consume Knowledge (2025-2026)

**Research date**: 2026-04-03
**Dimension**: D2 (Coding Agent Retrieval) + D5 (Local KB Retrieval)
**Confidence**: High (primary sources, multiple corroborating practitioners)
**Parent report**: Agent Knowledge Retrieval Paradigms 2025-2026

---

## Executive Summary

The dominant retrieval paradigm for AI coding agents in 2025-2026 is **agentic search** — iterative tool use (grep, glob, file read) without pre-indexing — not embedding-based RAG. Anthropic tested both approaches and dropped RAG early. SWE-bench results confirm grep + find were sufficient. For structured knowledge bases of 100-1000 articles, the evidence strongly favors an **index-first progressive disclosure** pattern over RAG, following Karpathy's auto-maintained index approach and the converging llms.txt / AGENTS.md standards.

**Key finding for KB design**: At the scale of ~100-1000 markdown articles with frontmatter, the optimal MCP interface should expose a browsable index (TOC) as the primary retrieval mechanism, with article-level read on demand — not a search endpoint backed by embeddings.

---

## D2: How Coding Agents Retrieve Context

### The Retrieval Paradigm Spectrum

Five distinct approaches are in production across major coding agents:

| Agent | Approach | Indexing | Primary Mechanism |
|-------|----------|----------|-------------------|
| **Claude Code** | Agentic search | None | Grep → glob → read loop |
| **Cursor** | Embedding + rerank | Cloud (Turbopuffer) | Vector search + AI reranking |
| **Windsurf** | Local RAG + context tracking | Local embeddings | RAG + action/memory tracking |
| **Aider** | Structural graph | Local (tree-sitter) | PageRank on dependency graph |
| **Devin** | Three-layer hybrid | DeepWiki + trigger-based KB | SWE-grep RL subagent + DeepWiki + Knowledge Base |
| **Codex CLI** | Shell-based | None (proposed in #5181) | ripgrep via shell + AGENTS.md |

### Finding 1: Claude Code's Agentic Search Outperformed RAG

Boris Cherny (Claude Code creator, Anthropic): *"Early versions of Claude Code used RAG + a local vector db, but we found pretty quickly that agentic search generally works better."* ([vadim.blog](https://vadim.blog/claude-code-no-indexing))

The architecture uses a **three-tool hierarchy** with strict cost ordering:
1. **Glob** (cheapest) — pattern-match file paths, sorted by modification time
2. **Grep** (medium) — ripgrep content search with chained refinement queries
3. **Read** (expensive) — full file load at 500-1,500 tokens per file

Key mechanism: Claude Code compensates for lack of semantic search by running **parallel triangulation searches** — e.g., "auth", "session", "token", "middleware", "jwt", "bearer" — to converge on a module. This multi-step reasoning is impossible with single-shot embedding retrieval. ([code.claude.com](https://code.claude.com/docs/en/overview))

**Explore sub-agents** run on Haiku with read-only tools in isolated context windows, enabling parallel codebase exploration without polluting the main conversation. Up to 7 agents simultaneously. ([code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents))

**SWE-bench validation**: Claude 3.7 Sonnet achieves 70.3% on SWE-bench Verified. Anthropic found "embedding-based retrieval tools were not the bottleneck — grep and find were sufficient." ([anthropic.com/research/swe-bench-sonnet](https://www.anthropic.com/research/swe-bench-sonnet))

**Evidence file**: [evidence/claude-code-agentic-search.md](evidence/claude-code-agentic-search.md)

### Finding 2: Cursor's Embedding Pipeline — Sophisticated But Fragile

Cursor implements the most complex retrieval pipeline among coding agents:
1. **Local chunking** via tree-sitter at semantic boundaries
2. **Merkle tree** change detection with 10-minute refresh cycles
3. **Cloud embedding** via OpenAI or custom code-tuned models
4. **Turbopuffer** vector storage with path obfuscation
5. **Two-stage retrieval**: vector search → AI reranking

**Performance**: @codebase queries take 10-20s without reranking, 20-30s with reranking. ([read.engineerscodex.com](https://read.engineerscodex.com/p/how-cursor-indexes-codebases-fast))

**Known failure modes**: Users report @codebase "doesn't add any files to context" even when indexed. Previously fell back to BM25; now requires successful embedding indexing (no graceful degradation). Files >600 lines require explicit @-referencing. ([forum.cursor.com](https://forum.cursor.com/t/cursor-not-able-to-access-full-code-base/36021))

Windsurf (Codeium) takes a privacy-first approach: embeddings generated **locally**, combined with action tracking and memory for context assembly. ([windsurf.com/cascade](https://windsurf.com/cascade))

**Evidence file**: [evidence/cursor-windsurf-embedding-retrieval.md](evidence/cursor-windsurf-embedding-retrieval.md)

### Finding 3: Aider's Structural Graph — The Third Way

Aider implements a fundamentally different approach: **tree-sitter AST parsing + PageRank on dependency graphs**.

- Extracts symbol definitions/references across 40+ languages
- Builds a graph where files are nodes and edges are dependencies
- Ranks by PageRank with personalization factors
- Binary search to fit symbols within token budget (default: 1K tokens)
- Achieves 4.3-6.5% context utilization while preserving architectural context

Relevance derives from **structural relationships** (imports, calls, inheritance) — neither semantic similarity nor text matching. ([aider.chat/2023/10/22/repomap.html](https://aider.chat/2023/10/22/repomap.html))

**Evidence file**: [evidence/codex-devin-agents-md.md](evidence/codex-devin-agents-md.md)

### Finding 4: The "Grep Is All You Need" Evidence

Multiple independent practitioners converge on this conclusion:

**Augment/SWE-bench** (Colin Flaherty, interview with Jason Liu): *"Embedding-based retrieval wasn't the bottleneck. We explored adding various embedding-based retrieval tools, but found that for SWE-Bench tasks this was not the bottleneck — grep and find were sufficient."* Agent persistence compensated for simpler tools. ([jxnl.co](https://jxnl.co/writing/2025/09/11/why-grep-beat-embeddings-in-our-swe-bench-agent-lessons-from-augment/))

**Amazon Science** (arXiv 2602.23368): Keyword search via agentic tool use achieves **>90% of RAG-level performance** without vector databases.

**Cline** mirrors Claude Code's no-indexing philosophy: "Why Cline Doesn't Index Your Codebase (And Why That's a Good Thing)." ([cline.bot/blog](https://cline.bot/blog/why-cline-doesnt-index-your-codebase-and-why-thats-a-good-thing))

**Why grep wins for code specifically**:
- Code has explicit structural relationships (imports, calls, types) that embeddings don't capture
- Exact match is the primary need (finding `createD1HttpClient`, not "something similar")
- Grep fails loudly (no match) vs embeddings failing silently (wrong match)
- Zero setup, instant freshness, complete privacy

**Cursor quantified the hybrid advantage**: Adding semantic search to grep yielded **12.5% accuracy improvement** and **2.6% code retention gain on large codebases (1,000+ files)**. Uses custom embedding model trained on agent session traces. ([cursor.com/blog/semsearch](https://cursor.com/blog/semsearch))

**SocratiCode benchmark** on VS Code's 2.45M-line codebase: hybrid semantic+BM25 needed **5 steps** vs grep's **31 steps** — 61% less tokens, 84% fewer tool calls, **37x faster**. At enterprise scale, grep-only is dramatically inferior. ([github.com/giancarloerra/SocratiCode](https://github.com/giancarloerra/SocratiCode))

**Cognition SWE-grep**: RL-trained models executing **up to 8 parallel tool calls per turn**, matching frontier model quality at **order of magnitude faster speed**. A third way beyond both grep-only and embedding-only. ([cognition.ai/blog/swe-grep](https://cognition.ai/blog/swe-grep))

**ContextBench** (academic, 1,136 tasks, 66 repos): *"Sophisticated agent scaffolding does not necessarily improve context retrieval performance"* — simpler approaches often match complex designs. ([arxiv.org/html/2602.05892](https://arxiv.org/html/2602.05892))

**Steve Krouse correction**: Despite being frequently cited, no primary source evidence exists for Steve Krouse (Val Town) publicly making the "grep is all you need" argument.

**When embeddings win**: large codebases (1,000+ files), unfamiliar codebases, natural language queries, cross-cutting concerns with inconsistent naming, non-code artifacts, high-volume repeated queries.

**The deeper insight** (per Morph's analysis): *"Agentic search offloads the learned semantics of an embedding model to an LLM."* The question is not grep vs embeddings but **who does the semantic reasoning — a frozen embedding model or a live reasoning model?**

**Evidence file**: [evidence/grep-vs-embeddings-evidence.md](evidence/grep-vs-embeddings-evidence.md)

---

## D5: Local KB and Personal Knowledge Retrieval

### Finding 5: Karpathy's Index-First Pattern Eliminates RAG at Small Scale

Karpathy published his approach on X on April 2, 2025 ([x.com/karpathy/status/2039805659525644595](https://x.com/karpathy/status/2039805659525644595)). His personal knowledge system operates at ~100 articles / ~400K words, using:
- `raw/` directory for source materials
- LLM processing layer compiling sources into structured markdown
- Obsidian as reading interface
- **Auto-maintained index**: LLM generates summaries, backlinks, categories, and tracking files

He expected to need "fancy RAG pipelines" but discovered the LLM handles index maintenance directly. At this scale, the LLM can "read all relevant material fairly easily" without complex retrieval.

**Self-accumulating loop**: Query outputs feed back as new wiki entries. "Health checks" — periodic LLM passes over the entire wiki to identify inconsistencies and surface candidates for new articles.

**Evidence file**: [evidence/karpathy-index-first-pattern.md](evidence/karpathy-index-first-pattern.md)

### Finding 6: llms.txt and AGENTS.md Are Converging Standards

Two parallel standards for packaging knowledge for AI consumption:

**llms.txt** (Jeremy Howard, September 2024): Standardized markdown at `/llms.txt` providing LLM-friendly documentation. Structure: H1 title → blockquote summary → body → H2 link sections. Mintlify auto-publishes llms.txt + MCP servers for 10,000+ companies. LLM traffic projected from 0.25% (2024) to 10% (end 2025). ([llmstxt.org](https://llmstxt.org))

**AGENTS.md** (OpenAI/community, 2025): "A README for agents" adopted by 60,000+ repositories. Hierarchical discovery with override support. Max 150 lines / 32 KiB. GitHub Blog analysis of 2,500+ repos identifies best practices. ([agents.md](https://agents.md/), [github.blog](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/))

Both standards implement **the same pattern**: structured index metadata first, detailed content on demand.

**Evidence file**: [evidence/llms-txt-agents-md-standards.md](evidence/llms-txt-agents-md-standards.md)

### Finding 7: Context7 — MCP as the Delivery Layer

Context7 (Upstash) provides documentation retrieval as an MCP server, accessible to 30+ AI assistants. Indexes **33,000+ libraries** using DiskANN on Upstash Vector Database. Two tools:
1. `resolve-library-id` — resolve name → Context7 ID
2. `ctx7 docs` — retrieve version-specific documentation

Recent optimization: **65% token reduction** (9,700→3,300 avg tokens), **38% latency reduction** (24s→15s), **30% fewer tool calls** — through server-side reranking returning only relevant pieces. ([github.com/upstash/context7](https://github.com/upstash/context7))

Separately, a survey found **19,000 companies have a docs MCP server** (via Mintlify, GitBook, ReadMe, or Fern) and most don't know it. ([lefthook.com/blog/docs-mcp-servers-who-ships-them](https://lefthook.com/blog/docs-mcp-servers-who-ships-them))

### Finding 8: Obsidian Copilot — Hybrid Retrieval in Practice

Obsidian Copilot implements the most sophisticated hybrid retrieval for personal knowledge:
- **RetrieverFactory** selects among HybridRetriever (Orama), TieredLexicalRetriever (BM25+), MiyoSemanticRetriever
- **ContextManager** assembles L1-L5 layered prompt envelope (direct context → vault retrieval → external sources → structured data → system context)

Blake Crosley's benchmark on **16,894 markdown files** is the most concrete evidence: hybrid search (BM25 + vector + RRF fusion) completes in **23 milliseconds**, while grep through the same vault takes **11-66 seconds**. Full-text-only search became unusable above ~3,000 files. The Mandalivia benchmark (2,400 notes) confirmed hybrid mode won for AI agent integration, and that **splitting into specialized collections** significantly improved retrieval quality. ([blakecrosley.com/blog/hybrid-retriever-obsidian](https://blakecrosley.com/blog/hybrid-retriever-obsidian))

This validates that **hybrid (BM25 + vector) outperforms either alone** for structured markdown content.

### Finding 9: GitBook's Evolution — RAG → Agentic Retrieval

GitBook Assistant (August 2025) upgraded from keyword RAG to **agentic retrieval** that considers:
- User's current page context
- Previously-read pages
- Prior conversation history
- External sources via MCP

This mirrors the broader industry trend: moving from static retrieval toward context-aware, multi-step reasoning about what to retrieve. ([gitbook.com/blog](https://www.gitbook.com/blog/new-adaptive-content-gitbook-assistant))

**Evidence file**: [evidence/obsidian-context7-docs-retrieval.md](evidence/obsidian-context7-docs-retrieval.md)

---

## Synthesis: Implications for Agent-Native KB Design

### The Retrieval Decision Framework

For a knowledge platform serving ~100-1000 markdown articles with frontmatter:

| Scale | Recommended Approach | Rationale |
|-------|---------------------|-----------|
| 1-100 articles | Index-first only | Karpathy pattern; entire index fits in context |
| 100-500 articles | Index-first + keyword search | Index for browsing, grep/BM25 for specific queries |
| 500-1000 articles | Index + hybrid search | Add vector search for semantic discovery |
| 1000+ articles | Full hybrid RAG | Index becomes too large for single pass |

### Design Recommendations for the MCP Server Interface

Based on converging evidence from coding agents, Karpathy, llms.txt, and Context7:

1. **Primary tool: `list_articles`** — Returns structured index (title, summary, categories, tags from frontmatter). This is the agent's first call. Always. Following llms.txt structure.

2. **Secondary tool: `read_article`** — Returns full article content by ID/slug. Progressive disclosure — agent decides what to read based on index.

3. **Tertiary tool: `search_articles`** — Keyword search (BM25) for when the agent knows what term to find. NOT the primary interface.

4. **Optional tool: `search_semantic`** — Vector search for natural language queries. Only add when scale exceeds what index-first can handle.

5. **Article format**: Rich frontmatter is critical — title, summary, categories, related articles, last updated. This IS the retrieval metadata. Following AGENTS.md pattern of making content self-describing.

### Why NOT Embedding-First

The evidence is overwhelming for this scale:

- Anthropic tested RAG vs agentic search and dropped RAG
- Karpathy tested fancy RAG pipelines vs index maintenance and dropped RAG
- SWE-bench results show grep achieves >90% of RAG performance
- Context7's biggest optimization was **reducing** what gets returned (reranking), not improving what gets indexed
- The failure modes of embedding retrieval (silent wrong matches, staleness, indexing failures) are worse than the failure modes of index-first (missing items the agent didn't select)

### The Agent-Native Pattern

```
Agent reads index → Agent selects relevant articles → Agent reads full content → Agent synthesizes answer
```

This mirrors exactly how Claude Code navigates codebases (glob → grep → read) and how Karpathy's system works (index → select → read). The agent's reasoning ability IS the retrieval mechanism. RAG outsources retrieval decisions to an embedding model; agent-native retrieval lets the agent decide.

---

## Evidence Files

| File | Dimension | Topic |
|------|-----------|-------|
| [claude-code-agentic-search.md](evidence/claude-code-agentic-search.md) | D2 | Claude Code architecture, Boris Cherny quotes, tool hierarchy |
| [cursor-windsurf-embedding-retrieval.md](evidence/cursor-windsurf-embedding-retrieval.md) | D2 | Cursor Merkle tree/Turbopuffer pipeline, Windsurf local RAG |
| [codex-devin-agents-md.md](evidence/codex-devin-agents-md.md) | D2 | Codex CLI retrieval, AGENTS.md discovery, Aider graph approach |
| [grep-vs-embeddings-evidence.md](evidence/grep-vs-embeddings-evidence.md) | D2 | Practitioner evidence, SWE-bench findings, when each approach wins |
| [karpathy-index-first-pattern.md](evidence/karpathy-index-first-pattern.md) | D5 | Karpathy's system, progressive disclosure, scale boundaries |
| [llms-txt-agents-md-standards.md](evidence/llms-txt-agents-md-standards.md) | D5 | llms.txt spec, AGENTS.md convention, Mintlify adoption data |
| [obsidian-context7-docs-retrieval.md](evidence/obsidian-context7-docs-retrieval.md) | D5 | Obsidian hybrid retrieval, Context7 MCP, GitBook evolution |

---

## Key Uncertainties

1. **Scale boundary precision**: Exactly where index-first breaks down (500? 1000? 2000 articles?) depends on article length, topic diversity, and context window size. No rigorous benchmarks exist.

2. **Devin's SWE-grep generalizability**: Cognition's RL-trained retrieval models are impressive on benchmarks but not open-source. Whether the approach generalizes beyond Cognition's training distribution is unknown.

3. **Karpathy's specific implementation**: Referenced widely but primary source details (blog post, code) are sparse. The pattern is clear but exact implementation varies.

4. **Long-context vs retrieval tradeoff**: As context windows grow (1M+ tokens), the threshold at which RAG becomes necessary keeps shifting upward. Current evidence reflects 128K-200K window constraints.

5. **Token cost at scale**: The grep/agentic approach burns more tokens per query than cached embedding retrieval. At high query volumes, this may shift the economics toward hybrid approaches.
