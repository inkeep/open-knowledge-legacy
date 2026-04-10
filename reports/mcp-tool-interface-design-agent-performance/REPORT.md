---
title: "MCP Tool Interface Design for Agent Performance: Filesystem vs Semantic Tools"
description: "Evidence-driven analysis of how tool interface design affects AI agent performance — comparing filesystem-style tools (grep, cat, ls) vs domain-specific semantic tools (search_articles, read_article, get_overview) for knowledge platform MCP servers. Covers benchmarks, production A/B tests, MCP server design survey, progressive disclosure patterns, and practical recommendations for tool count, naming, and response formatting."
createdAt: 2026-04-02
updatedAt: 2026-04-02
subjects:
  - Claude Code
  - Cursor
  - Mintlify
  - Context7
  - Anthropic
  - SWE-agent
  - SocratiCode
  - Microsoft Research
  - MCP-Bench
  - Mem0
  - GitHub MCP Server
  - Notion MCP Server
topics:
  - MCP tool design
  - agent tool interfaces
  - filesystem vs semantic tools
  - progressive disclosure
  - tool explosion problem
  - agent performance benchmarks
---

# MCP Tool Interface Design for Agent Performance: Filesystem vs Semantic Tools

**Purpose:** Determine whether an agent-native knowledge platform MCP server should expose filesystem-style tools (grep, cat, ls), domain-specific semantic tools (search_articles, read_article), or both — grounded in evidence from benchmarks, production systems, and research.

---

## Executive Summary

The question "filesystem tools or semantic tools?" has a clear answer from converging evidence: **semantic tools, designed with filesystem-like simplicity.** The optimal MCP server for a knowledge platform exposes 4-6 domain-specific tools following a progressive disclosure pattern, with tool descriptions written to the standard of onboarding a new hire.

The evidence does not support building a filesystem illusion (ChromaFs-style) for an MCP server consumed by diverse external agents. While Mintlify's ChromaFs is an elegant internal architecture, the structured MCP approach (2-6 semantic tools) is what the ecosystem has converged on for inter-agent interoperability. Notably, Mintlify itself maintains both — ChromaFs for its internal assistant and a 2-tool structured MCP for external consumption.

The key findings that drive this recommendation:

**Key Findings:**

- **Tool count is the strongest predictor of agent failure.** Microsoft Research found performance degradation "up to 85% for some models" as tool count increases. Flattening parameter spaces alone improved performance by 47%. The most popular documentation MCP servers (Context7: 51.6K stars, Mintlify, Mem0) all expose exactly 2 tools. The recommended range is 5-15 per server; the emerging optimum for knowledge servers is 2-6.

- **Grep-only is sufficient for small codebases but not for knowledge retrieval.** Mini-SWE-agent achieves 74% on SWE-bench with only bash. Augment found grep beat embeddings on SWE-bench. But SWE-bench repos are small and code is structured. For natural language content at 100-1000 articles, hybrid search (semantic + keyword) uses 61% fewer tokens and 84% fewer tool calls than grep-only at scale (SocratiCode benchmark on 2.45M lines).

- **Semantic search provides measurable improvements over grep-only — Cursor proved it.** In the only controlled A/B test in production, Cursor found 12.5% higher accuracy on offline benchmarks (6.5-23.5% depending on model) and +2.6% code retention on 1,000+ file codebases. The combination of grep AND semantic search produces the best outcomes.

- **Progressive disclosure reduces context overhead by 80-98%.** Anthropic's Tool Search Tool, MCPrism, and the meta-tool pattern all demonstrate that loading tool schemas on demand rather than upfront is the highest-leverage architectural decision. Anthropic adopted progressive disclosure as the core design principle for Agent Skills.

- **Tool descriptions matter more than tool architecture.** Anthropic reports that "even small refinements to tool descriptions can yield dramatic improvements" — Claude Sonnet 3.5 achieved state-of-the-art SWE-bench performance after tool description refinements. The tool description IS the interface.

- **"Outcomes not operations" is the design principle.** A good MCP server is not a REST API wrapper. Instead of atomic CRUD operations, expose high-level tools that orchestrate internally and return agent-consumable results.

---

## Research Rubric

**Report Type:** Comparative Analysis / Technology Deep-Dive
**Primary Question:** Should an agent-native knowledge platform MCP server expose filesystem-style tools, domain-specific semantic tools, or both?
**Audience:** Product/engineering team designing an MCP server for a knowledge platform
**Stance:** Factual — presenting evidence for the team to make the design decision

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Filesystem tools vs semantic tools — benchmarks and evidence | Deep (quantitative + comparative) | P0 |
| D2 | MCP server tool interface design survey | Deep (comparative + primary source) | P0 |
| D3 | Agent tool use patterns from research | Deep (academic + practical) | P0 |
| D4 | Agent as codebase navigator — file tools + semantic tools | Deep (comparative + quantitative) | P0 |
| D5 | Progressive disclosure in tool design | Deep (practical + comparative) | P0 |
| D6 | Mintlify ChromaFs vs structured MCP | Deep (primary source + adversarial) | P0 |
| D7 | Practical recommendations for MCP tool design | Deep (synthesis) | P0 |

**Non-goals:** Implementation guides for specific vector databases; vendor pricing; 1P codebase analysis; general LLM capability surveys.

---

## Detailed Findings

### D1: Filesystem Tools vs Semantic Tools — What Do Agents Perform Better With?

**Finding:** No one has directly benchmarked filesystem-style MCP tools against semantic MCP tools for knowledge retrieval. However, converging indirect evidence from five independent sources shows that filesystem tools work well for structured code but semantic tools are superior for natural language content at scale.

**Evidence:** [evidence/filesystem-vs-semantic-tools.md](evidence/filesystem-vs-semantic-tools.md)

#### The Evidence Landscape

| Study | Domain | Finding | Scale |
|-------|--------|---------|-------|
| [Mini-SWE-agent](https://github.com/SWE-agent/mini-swe-agent) | Code | Bash-only achieves 74% on SWE-bench | Small repos |
| [Augment/Jason Liu](https://jxnl.co/writing/2025/09/11/why-grep-beat-embeddings-in-our-swe-bench-agent-lessons-from-augment/) | Code | Grep beat embeddings; agent persistence compensates | SWE-bench repos |
| [Cursor A/B test](https://cursor.com/blog/semsearch) | Code | Semantic search: +12.5% accuracy, +2.6% retention at 1K+ files | Production |
| [SocratiCode](https://github.com/giancarloerra/SocratiCode) | Code | Hybrid search: 61% fewer tokens, 84% fewer calls vs grep | 2.45M lines |
| [Amazon Science](https://arxiv.org/abs/2602.23368) | QA | Keyword search + agentic tool use: >90% of vector RAG | QA benchmarks |
| [Letta](https://www.letta.com/blog/benchmarking-ai-agent-memory) | Memory | Filesystem-based memory achieves 74% on LoCoMo | Conversations |

#### The "Grep is Enough" Argument — and Its Limits

The case for filesystem tools is strongest in code navigation. The SWE-agent team's evolution is instructive: "Back in 2024, there was emphasis on tools and special interfaces for the agent, but one year later, as LMs have become more capable, a lot of this is not needed at all to build a useful agent." Mini-SWE-agent proves this with 74% SWE-bench accuracy using only bash.

But this finding has critical boundary conditions:

1. **SWE-bench repos are small.** 90% of problems take less than an hour for a good engineer. Real-world codebases are much larger.
2. **Code is structured.** Identifiers, function names, and class hierarchies are grep-friendly. Natural language articles are not.
3. **Agent persistence compensates.** As Augment found, agents retry grep with different patterns until they find what they need. This works but burns tokens — SocratiCode shows 61% more tokens consumed by grep-only at enterprise scale.
4. **The Cursor A/B test is definitive.** In the only controlled production experiment, adding semantic search to grep improved accuracy by 12.5% offline and code retention by 2.6% on large codebases.

#### What This Means for Knowledge Retrieval

A knowledge base of 100-1000 markdown articles is closer to "large codebase with natural language content" than to "small SWE-bench repo." The evidence suggests:

- Grep-only would work (agents are persistent) but would be token-inefficient
- Semantic search adds measurable value, especially as content grows
- The optimal approach combines both: structured search for discovery, full-text retrieval for deep reading

**Remaining uncertainty:** No direct A/B test exists for filesystem-style vs semantic MCP tools on a documentation knowledge base. The code navigation evidence is strong but analogical.

---

### D2: How Existing MCP Servers Design Their Tool Interfaces

**Finding:** MCP servers cluster into three archetypes: minimal (2-3 tools), moderate (5-15), and comprehensive (20-30+). The most successful documentation servers use the minimal pattern. There is strong convergence on domain-specific semantic tools over filesystem-style tools for knowledge access.

**Evidence:** [evidence/mcp-server-tool-survey.md](evidence/mcp-server-tool-survey.md)

#### MCP Server Survey

| Server | Domain | Tools | Pattern | Stars |
|--------|--------|-------|---------|-------|
| [Context7](https://github.com/upstash/context7) | Docs | 2 | resolve-library-id + get-library-docs | 51.6K |
| [Mintlify MCP](https://www.mintlify.com/docs/ai/model-context-protocol) | Docs | 2 | search + get_page | N/A |
| [Mem0](https://github.com/mem0ai/mem0-mcp) | Memory | 2 | add_memory + search_memory | N/A |
| [Confluence](https://github.com/sooperset/mcp-atlassian) | Knowledge | ~7 | ls_spaces, get_space, ls_pages, get_page, search... | N/A |
| [Filesystem](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) | System | 11-14 | read_file, write_file, list_directory, search_files... | N/A |
| [GitBook](https://github.com/rickysullivan/gitbook-mcp) | Docs | 12 | search_content, get_page, get_code_blocks... | N/A |
| [Notion](https://developers.notion.com/guides/mcp/mcp-supported-tools) | Productivity | 12+ | notion-search, notion-query-data-sources... | N/A |
| [GitHub](https://github.com/github/github-mcp-server) | DevOps | ~26 | 5 toolsets: context, issues, PRs, repos, users | N/A |

**Three archetypes:**

1. **Minimal (2-3 tools):** Search + read. Context7, Mintlify, Mem0. Highest community adoption. Agents learn the interface immediately — zero ambiguity about which tool to use.

2. **Moderate (5-15 tools):** Domain CRUD with semantic grouping. Confluence, GitBook, Filesystem. Balanced capability and complexity. Follows the domain-noun-verb naming pattern.

3. **Comprehensive (20-30+ tools):** Full platform surface. GitHub, Notion. Requires toolset filtering or progressive disclosure to avoid overwhelming agents.

**No successful MCP server for documentation uses filesystem-style tools.** Every documentation/knowledge MCP server — Context7, Mintlify, GitBook, Confluence — uses domain-specific semantic tools (search, get_page, list_spaces). The official Filesystem MCP server exists for actual file access, not as a knowledge retrieval interface.

#### Naming Conventions

Two dominant patterns have emerged:

| Convention | Example | Recommended By |
|-----------|---------|----------------|
| `domain_noun_verb` | `github_issue_create` | [AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/mcp-strategies/mcp-tool-strategy-organization.html) |
| `domain_verb_resource` | `slack_send_message` | [Philschmid](https://www.philschmid.de/mcp-best-practices) |

Snake_case is preferred (GPT-4o tokenizer optimized for it). [Anthropic](https://www.anthropic.com/engineering/writing-tools-for-agents) notes "prefix vs. suffix approaches produce non-trivial effects on tool-use evaluations."

**Decision triggers:**
- If your MCP server will coexist with many others: domain prefix is essential (prevents collisions — [Microsoft Research](https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era-designing-for-agent-compatibility-at-scale/) found 775 tools share identical names across servers, "search" appearing in 32 different servers).
- If standalone: simpler names (search, read_article) suffice.

---

### D3: Agent Tool Use Patterns from Research

**Finding:** Tool descriptions are the highest-leverage investment in MCP server design. Tool count is the strongest predictor of agent failure. The emerging principle is "outcomes not operations" — tools should map to agent goals, not API endpoints.

**Evidence:** [evidence/agent-tool-use-research.md](evidence/agent-tool-use-research.md)

#### Tool Descriptions Are the Interface

[Anthropic's guidance](https://www.anthropic.com/engineering/writing-tools-for-agents) is unequivocal: "Even small refinements to tool descriptions can yield dramatic improvements." Claude Sonnet 3.5 achieved state-of-the-art SWE-bench performance "after precise refinements to tool descriptions."

A good tool description should read like onboarding instructions for a new hire:
- When to use this tool (and when NOT to)
- How to format arguments (with examples)
- What to expect back (shape of the response)
- Edge cases and error handling
- Boundaries from other tools (when to use tool A vs tool B)

#### The Tool Explosion Problem

[Microsoft Research](https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era-designing-for-agent-compatibility-at-scale/) quantified the damage:

| Metric | Finding |
|--------|---------|
| Performance degradation with more tools | Up to 85% for some models |
| Flattening parameter spaces | +47% performance improvement |
| Tool response size (median vs max) | 98 tokens vs 557,766 tokens |
| Oversized response impact | Up to 91% performance degradation |
| Context window consumed by 150 tools | 30,000-60,000 tokens (25-30% of 200K) |

The practical ceilings:
- [OpenAI](https://platform.openai.com/docs/guides/function-calling) recommends fewer than 20 functions at any one time
- Cursor enforces a hard limit of 40 MCP tools total
- [AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/mcp-strategies/mcp-tool-strategy-organization.html) recommends no more than 50 tools per MCP server
- [Philschmid](https://www.philschmid.de/mcp-best-practices) recommends 5-15 tools per server

#### "Outcomes Not Operations"

The principle from [Philschmid](https://www.philschmid.de/mcp-best-practices): "MCP servers are not thin wrappers around your existing API. A good REST API is not a good MCP server."

Instead of atomic operations:
```
get_user_by_email(email) → user_id
list_orders(user_id) → order_ids
get_order_status(order_id) → status
```

Expose outcome-oriented tools:
```
track_latest_order(email) → {status, eta, tracking_url}
```

For a knowledge platform: `search_articles` should return enough context (title, snippet, metadata, relevance score) for the agent to decide next steps without additional calls.

---

### D4: The Agent as Codebase Navigator — File Tools + Semantic Tools

**Finding:** Every successful coding agent uses file tools as the foundation and is adding semantic tools as an enhancement layer. The trajectory is clear: file tools alone hit performance ceilings at scale; semantic tools (LSP, embeddings) are the upgrade path. The knowledge retrieval analogy: start with search + read, enhance with overview + browse.

**Evidence:** [evidence/codebase-navigator-pattern.md](evidence/codebase-navigator-pattern.md)

#### The Universal File Tool Surface

From our prior research ([AI Coding Agent Tool Surfaces](../ai-coding-agent-tool-surfaces/REPORT.md)), 11 coding agents converge on 5 operations: read file, write file, edit file, search content (regex), search paths (glob). This is the filesystem primitive layer.

#### The Semantic Enhancement Layer

The path from file-only to file+semantic is happening across the industry:

- **Cursor:** Grep + semantic search produces best outcomes. A/B tested: [+12.5% accuracy](https://cursor.com/blog/semsearch), +2.6% retention at 1K+ files.
- **Claude Code:** Currently grep/glob/read only. Community demand for [LSP integration](https://github.com/anthropics/claude-code/issues/5495) (1000+ upvotes) citing "100-1000x performance improvement for code navigation."
- **LSP analogy:** Go-to-definition takes ~50ms vs ~45 seconds for grep-based reference finding. Practitioners report [900x speed improvement](https://amirteymoori.com/lsp-language-server-protocol-ai-coding-tools/) for semantic operations. Token consumption: 500 tokens (LSP) vs 2000+ tokens (grep) for the same reference lookup in a 100-file project.

The pattern is clear: **file tools are the universal foundation, semantic tools are the performance multiplier.** Both are needed.

**Implications for knowledge retrieval:**
- File tools analog: `read_article` (full content) + `search` (text matching)
- Semantic tools analog: `search` (hybrid semantic+keyword) + `get_overview` (corpus orientation) + `list_articles` (structured metadata browse)
- The semantic layer is where domain-specific knowledge tools add value that raw file operations cannot

---

### D5: The Progressive Disclosure Pattern in Tool Design

**Finding:** Progressive disclosure is the single most impactful architectural pattern for MCP tool design, reducing context overhead by 80-98% while maintaining full capability. It is endorsed by Anthropic, implemented in production by multiple systems, and being considered for formalization in the MCP spec.

**Evidence:** [evidence/progressive-disclosure.md](evidence/progressive-disclosure.md)

#### Token Savings Are Dramatic

| Implementation | Measurement | Reduction |
|---------------|-------------|-----------|
| [Anthropic Tool Search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) | 150K → 2K tokens | 98.7% |
| [MCPrism](https://github.com/jbabin91/mcprism) | 17K → 1.2K initial load | 93% |
| Conversation-level | 25K+ → 3K-5K tokens | 80-88% |

#### Three Implementation Approaches

1. **Tool-level progressive disclosure (Anthropic Tool Search Tool):** Mark tools with `defer_loading: true`. Claude discovers and loads tools on demand. Supports up to 10,000 tools. Available on Sonnet 4.5+, Opus 4.5+.

2. **Meta-tool pattern ([Synaptic Labs](https://blog.synapticlabs.ai/bounded-context-packs-meta-tool-pattern)):** Two registered tools (discovery + execution) provide access to unlimited capabilities. The LLM sees 2 tools instead of 29. Implemented in their open-source Nexus plugin.

3. **Content-level progressive disclosure (our 4-tool pattern):** The tools themselves implement progressive disclosure — overview gives the map, search gives pointers, list gives metadata, read gives full content. Each layer reveals more detail on demand.

#### The 4-Tool Progressive Disclosure Pattern

This pattern, identified in our [prior research](../agent-knowledge-retrieval-paradigms-2025-2026/REPORT.md), maps directly to the three-layer model:

| Layer | Tool | Returns | Token Cost |
|-------|------|---------|------------|
| Index | `get_overview` | Corpus structure, categories, article count | ~200 tokens |
| Discovery | `search` | Ranked snippets with titles, paths, relevance | ~500-2000 tokens |
| Browse | `list_articles` | Metadata for filtered articles (topic, date, tags) | ~500-1500 tokens |
| Deep Read | `read_article` | Full article content | ~1000-5000 tokens |

The agent chooses its path: direct search if it knows what it wants, browse if it's exploring, overview if it's orienting. This is progressive disclosure applied at the content level — not the tool schema level.

#### Formal Recognition

- [Anthropic](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) adopted progressive disclosure as the "core design principle" for Agent Skills (published as open standard, December 2025)
- [Microsoft](https://deepwiki.com/microsoft/agent-skills/3.3-progressive-disclosure) adopted it for their agent-skills framework
- An active [MCP SEP (#1888)](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1888) proposes formalizing progressive disclosure in the protocol
- The core insight: "Agents get dumber when given too much information upfront"

---

### D6: Mintlify ChromaFs vs Structured MCP — What Can We Learn?

**Finding:** ChromaFs is an elegant and operationally efficient architecture for Mintlify's specific use case (internal assistant, read-only documentation, single-agent consumer). However, it is not the right pattern for an MCP server consumed by diverse external agents. The structured MCP approach is simpler, more interoperable, and what the ecosystem has converged on.

**Evidence:** [evidence/chromafs-analysis.md](evidence/chromafs-analysis.md)

#### What ChromaFs Got Right

[ChromaFs](https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant) is genuinely clever engineering:

| Metric | Sandbox (Before) | ChromaFs (After) |
|--------|-------------------|-------------------|
| P90 session creation | ~46 seconds | ~100 milliseconds |
| Marginal cost/conversation | ~$0.0137 | ~$0 |
| Monthly scale | 850K conversations | 30K+/day |

The two-stage grep (`grep -r` → Chroma $contains coarse filter → in-memory fine filter) is an efficient hybrid search implementation hidden behind familiar unix syntax. The in-memory path tree makes ls/cd/find zero-network-call operations.

#### Why ChromaFs Is Not the Right Pattern for an External MCP Server

1. **Limited expressiveness.** The agent can't formulate semantic queries ("articles about OAuth authentication patterns") — it must construct grep patterns. A `search` tool with a natural language query parameter is more expressive.

2. **No structured metadata access.** The agent can't filter by tags, dates, categories, or topics through filesystem commands. A `list_articles` tool with filter parameters is more capable.

3. **False mental model.** The agent may make incorrect assumptions about filesystem behavior (expecting symlinks, file modification times, permissions). A semantic tool has no false expectations to violate.

4. **Interoperability overhead.** ChromaFs requires just-bash (custom TypeScript bash reimplementation), a specific filesystem interface, and a path tree bootstrap. A standard MCP server with 2-4 tools has zero custom infrastructure beyond the tools themselves.

5. **Mintlify's own verdict.** Mintlify maintains BOTH ChromaFs (for their internal assistant) AND a [structured 2-tool MCP server](https://www.mintlify.com/docs/ai/model-context-protocol) (search + get_page) for external agent consumption. The structured MCP is what they expose to the ecosystem.

#### The Lesson

ChromaFs demonstrates that agents CAN use filesystem commands effectively on a virtual knowledge base. But "can" is not "should." The ecosystem has voted with implementations: every documentation MCP server uses semantic tools, not filesystem emulation. The agent's familiarity with grep/cat/ls is real but not sufficient to outweigh the advantages of purpose-built tools with rich descriptions, structured parameters, and domain-specific semantics.

---

### D7: Practical Recommendations for MCP Tool Design

**Finding:** The converging recommendation from Anthropic, AWS, Microsoft Research, and production MCP servers is: 4-6 domain-specific semantic tools with progressive disclosure, rich descriptions, outcome-oriented design, and LLM-consumable response formats.

**Evidence:** [evidence/practical-recommendations.md](evidence/practical-recommendations.md)

#### Recommended Tool Surface

**Core (4 tools):**

| Tool | Purpose | Parameters | Returns |
|------|---------|------------|---------|
| `get_overview` | Corpus orientation | none (or optional category filter) | Categories, article count, topic map, freshness info |
| `search_articles` | Hybrid keyword+semantic search | `query` (required), `topic` (optional), `limit` (default 10) | Ranked results: title, slug, snippet, relevance, topics |
| `list_articles` | Browse/filter by metadata | `topic` (optional), `sort_by` (optional), `limit` (default 20) | Article metadata: title, slug, topics, updated_at, description |
| `read_article` | Full content retrieval | `slug` (required), `section` (optional) | Full markdown content with frontmatter |

**Optional extensions (2 tools):**

| Tool | Purpose | When to add |
|------|---------|-------------|
| `get_related_articles` | Cross-references for an article | When articles have explicit relationships |
| `get_section` | Retrieve specific section of an article | When articles are long (5000+ words) |

#### Tool Description Template

Each tool description should include:

```
[Tool Name]: [One-line purpose]

Use this tool when: [Specific scenarios]
Do NOT use this tool when: [Anti-patterns — use X instead]

Parameters:
- query (required): Natural language search query. Examples: "how to configure OAuth", "rate limiting best practices"
- topic (optional): Filter to a specific topic. Use list_articles to discover available topics.
- limit (optional, default 10): Maximum results. Range: 1-50.

Returns: JSON array of {title, slug, snippet, relevance_score, topics[], updated_at}

Example: search_articles(query="authentication setup", topic="security", limit=5)

If no results found: Try broader terms or use list_articles to browse available topics.
```

#### Response Formatting

Based on [Anthropic](https://www.anthropic.com/engineering/writing-tools-for-agents), [Philschmid](https://www.philschmid.de/mcp-best-practices), and [Microsoft Research](https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era-designing-for-agent-compatibility-at-scale/):

1. **Keep responses concise.** Median tool output should be under 500 tokens. Never exceed 25,000 tokens per response (Claude Code's default limit).
2. **Use semantic field names.** `title`, `description`, `updated_at` — not `uuid`, `mime_type`, `blob_ref`.
3. **Paginate by default.** Return 10-20 results with `has_more`, `total_count`, `next_offset` metadata.
4. **Include navigation hints.** "Showing 10 of 847 results. Refine your query or filter by topic."
5. **Return markdown for content.** Article content should be markdown (not HTML, not raw text). Frontmatter metadata should be structured JSON.
6. **Errors should guide retry.** "No articles found matching 'oauth setup'. Try broader terms like 'authentication' or 'oauth', or use list_articles to browse available topics."

#### Naming Convention

Follow the `{domain}_{verb}_{noun}` pattern with snake_case:
- `kb_search_articles` (or just `search_articles` if standalone)
- `kb_read_article`
- `kb_list_articles`
- `kb_get_overview`

If the server will coexist with other MCP servers, use a domain prefix to prevent collisions.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **No direct benchmark of filesystem MCP vs semantic MCP for knowledge retrieval.** All evidence is from code navigation (SWE-bench, Cursor) or QA (Amazon Science). A controlled experiment on a documentation knowledge base would be definitive but does not exist.
- **Tool description optimization is underpublished.** Anthropic reports "dramatic improvements" from description refinement but hasn't published controlled data. The specific phrasing and structure that maximizes agent performance is still craft knowledge, not science.
- **Response format impact is unquantified.** Whether JSON, markdown, or structured text produces better tool result consumption by agents has been mentioned by multiple sources but never systematically benchmarked.

### Out of Scope (per Rubric)

- Implementation guides for specific vector databases
- Vendor pricing comparisons
- 1P codebase analysis
- General LLM capability surveys
- Write operations (create_draft, update_article) — this report focuses on read/retrieval tools

---

## References

### Evidence Files
- [evidence/filesystem-vs-semantic-tools.md](evidence/filesystem-vs-semantic-tools.md) - Benchmarks and A/B tests comparing filesystem and semantic tool approaches
- [evidence/mcp-server-tool-survey.md](evidence/mcp-server-tool-survey.md) - Survey of 9 MCP servers across categories with tool counts and patterns
- [evidence/agent-tool-use-research.md](evidence/agent-tool-use-research.md) - Research on tool descriptions, tool explosion, and design principles
- [evidence/codebase-navigator-pattern.md](evidence/codebase-navigator-pattern.md) - How coding agents use file + semantic tools
- [evidence/progressive-disclosure.md](evidence/progressive-disclosure.md) - Token savings, meta-tool pattern, Anthropic/Microsoft adoption
- [evidence/chromafs-analysis.md](evidence/chromafs-analysis.md) - Mintlify ChromaFs architecture, performance, and trade-offs
- [evidence/practical-recommendations.md](evidence/practical-recommendations.md) - Synthesized design recommendations

### External Sources
- [Anthropic: Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents) - Primary design guidance for agent tool design
- [Anthropic: Advanced tool use (Tool Search Tool)](https://www.anthropic.com/engineering/advanced-tool-use) - Dynamic tool discovery and deferred loading
- [Anthropic: Equipping agents with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) - Progressive disclosure as core design principle
- [Cursor: Improving agent with semantic search](https://cursor.com/blog/semsearch) - A/B test data on semantic search impact
- [Mintlify: How we built ChromaFs](https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant) - Virtual filesystem architecture
- [Philschmid: MCP best practices](https://www.philschmid.de/mcp-best-practices) - 5-15 tools, outcomes not operations
- [Microsoft Research: Tool-space interference](https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era-designing-for-agent-compatibility-at-scale/) - Tool count degradation data
- [AWS Prescriptive Guidance: MCP tool organization](https://docs.aws.amazon.com/prescriptive-guidance/latest/mcp-strategies/mcp-tool-strategy-organization.html) - Naming conventions, tool count limits
- [Jason Liu / Augment: Why grep beat embeddings](https://jxnl.co/writing/2025/09/11/why-grep-beat-embeddings-in-our-swe-bench-agent-lessons-from-augment/) - Grep-first argument and its limits
- [SocratiCode](https://github.com/giancarloerra/SocratiCode) - Hybrid search benchmark (61% fewer tokens, 84% fewer calls)
- [Mini-SWE-agent](https://github.com/SWE-agent/mini-swe-agent) - Bash-only agent achieving 74% SWE-bench
- [MCP-Bench](https://arxiv.org/abs/2508.20453) - Multi-tool agent benchmark (250 tools, 28 servers)
- [Sigdel et al.: Schema First Tool APIs](https://arxiv.org/abs/2603.13404) - Controlled study of tool interface design
- [Synaptic Labs: Meta-tool pattern](https://blog.synapticlabs.ai/bounded-context-packs-meta-tool-pattern) - Progressive disclosure via meta-tools
- [MCPBundles: Six-tool pattern](https://www.mcpbundles.com/blog/mcp-tool-design-pattern) - Consolidating tools from 12 to 6
- [Context7 MCP](https://github.com/upstash/context7) - Minimal 2-tool docs MCP (51.6K stars)
- [Letta: Benchmarking agent memory](https://www.letta.com/blog/benchmarking-ai-agent-memory) - Filesystem-based memory at 74% LoCoMo

### Related Research
- [Agent Knowledge Retrieval Paradigms 2025-2026](../agent-knowledge-retrieval-paradigms-2025-2026/REPORT.md) - Deeper coverage of RAG evolution, retrieval architectures, and the 4-tool progressive disclosure recommendation
- [AI Coding Agent Tool Surfaces](../ai-coding-agent-tool-surfaces/REPORT.md) - Detailed tool schemas for 11 coding agents
