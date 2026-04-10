# Evidence: Emerging Patterns and Convergence

**Dimension:** D8 — Emerging patterns and convergence
**Date:** 2026-04-02
**Sources:** Anthropic engineering blog, OpenAI engineering blog, academic papers, Context7, Azure AI Search, practitioner analyses

---

## Key files / pages referenced

- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents — Anthropic context engineering
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills — Agent Skills
- https://openai.com/index/harness-engineering/ — OpenAI Harness Engineering
- https://www.newsletter.swirlai.com/p/state-of-context-engineering-in-2026 — State of Context Engineering 2026
- https://learn.microsoft.com/en-us/azure/search/agentic-retrieval-overview — Azure Agentic Retrieval
- https://arxiv.org/abs/2603.20432 — Coding Agents as Long-Context Processors
- https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html — Martin Fowler on Harness Engineering

---

## Findings

### Finding: The industry is converging on a 3-layer progressive disclosure architecture
**Confidence:** CONFIRMED
**Evidence:** Multiple independent sources arriving at the same pattern

Layer 1 — Orientation (always loaded): CLAUDE.md, AGENTS.md, llms.txt. Lightweight. Tells the agent "what this is and how to navigate it."
Layer 2 — Discovery (on demand): Search, browse, filter tools. Agent explores based on task.
Layer 3 — Full content (targeted): Read the specific article/file/document needed.

Evidence of convergence:
- Anthropic Agent Skills: metadata → SKILL.md → resources/
- OpenAI Harness: AGENTS.md → docs/ → source code
- Context7: search library → get docs
- Codified Context paper: hot memory → domain agents → cold memory
- Azure Agentic Retrieval: query planning → subquery execution → result synthesis
- Karpathy: index files → wiki articles → raw sources
- Aider: repo-map → targeted file requests

All independent implementations arrived at the same 3-layer pattern. This is the strongest convergence signal.

**Implications:** Any new agent-native KB should implement this 3-layer pattern as the primary navigation interface.

### Finding: "Context engineering" has become the umbrella term for agent knowledge management
**Confidence:** CONFIRMED
**Evidence:** https://www.newsletter.swirlai.com/p/state-of-context-engineering-in-2026, https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

"Context engineering has gone from a niche concern to the core discipline of AI engineering in under a year." Anthropic defines it as "the set of strategies for curating and maintaining the optimal set of tokens during LLM inference." Key patterns within context engineering: progressive disclosure, compression, routing, evolved retrieval, tool management.

**Implications:** The question "how should an agent navigate a KB" is now recognized as a specific instance of the broader "context engineering" discipline.

### Finding: MCP resource vs tool design maps directly to navigation layers
**Confidence:** INFERRED
**Evidence:** MCP specification, Context7 implementation, Azure Agentic Retrieval

MCP resources (static, declared upfront) map to Layer 1 (orientation). MCP tools (dynamic, invoked on demand) map to Layers 2-3 (discovery and content). The ideal MCP server for a KB exposes: resources for the catalog/index (always available), tools for search/browse/read (agent-invoked).

**Implications:** The 3-layer progressive disclosure pattern maps cleanly to MCP's resource/tool distinction.

### Finding: The "agent legibility" principle is replacing the "human readability" principle
**Confidence:** INFERRED
**Evidence:** OpenAI Harness Engineering, Codified Context paper, Context7, Cloudflare Markdown for Agents

Multiple sources now discuss making codebases/knowledge bases "legible to agents" as a primary design goal. OpenAI: repository structure prioritized "agent legibility." Codified Context: "AI must be told — repeatedly, reliably, and in a format it can act on." Cloudflare: converting HTML to markdown specifically for agent consumption. This represents a shift from "documentation for humans who might use AI" to "documentation for agents who might serve humans."

**Implications:** KB design should optimize for agent consumption first — structured frontmatter, consistent formatting, explicit cross-references, typed metadata.

### Finding: Hybrid search (keyword + semantic) with reranking is the consensus retrieval layer
**Confidence:** CONFIRMED
**Evidence:** Anthropic contextual retrieval paper, Azure Agentic Retrieval, SocratiCode, production CX systems

Every production system reviewed (Perplexity, Glean, Intercom Fin, Sierra, Zendesk, Azure AI Search) uses hybrid search with reranking. Anthropic's contextual retrieval showed 67% failure reduction. But at the 100-1000 article scale, keyword search alone achieves 90%+ of this performance (Amazon Science finding).

**Implications:** For a 100-1000 article KB, keyword search is sufficient as the initial implementation. Hybrid search is a future optimization for scaling beyond 1000 articles.

### Finding: The relationship between navigation patterns and scale follows clear breakpoints
**Confidence:** INFERRED
**Evidence:** Synthesis across all dimensions

| Scale | Navigation Pattern | Why |
|-------|-------------------|-----|
| <50 articles | Full dump in context | Fits in context window; Karpathy pattern at ~100 articles, ~400K words |
| 50-500 articles | Catalog + keyword search | Agent reads catalog, searches for specifics; Amazon Science validates |
| 500-5000 articles | Progressive disclosure + hybrid search | Too large for single catalog; need semantic understanding |
| >5000 articles | Pre-built semantic index + graph | SocratiCode, Cursor, Augment approaches needed |

**Implications:** The target scale (100-1000 articles) sits at the boundary of "catalog + keyword search" and "progressive disclosure + hybrid search." The right approach is to build the progressive disclosure infrastructure now, with keyword search as the initial retrieval layer.

---

## Gaps / follow-ups

* No controlled experiment directly comparing navigation patterns at KB scale
* The "convergence" is inferred from independent implementations — no industry body has standardized this
* How do multi-agent systems (where different agents handle different layers) compare to single-agent progressive disclosure?
