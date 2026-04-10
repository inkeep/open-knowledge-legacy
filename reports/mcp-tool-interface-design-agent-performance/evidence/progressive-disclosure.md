# Evidence: Progressive Disclosure in Tool Design

**Dimension:** D5 — The "progressive disclosure" pattern in tool design
**Date:** 2026-04-02
**Sources:** Anthropic, Synaptic Labs, MCPrism, AWS, MCP community discussions, Microsoft Agent Skills

---

## Key files / pages referenced

- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills — Anthropic: Agent Skills
- https://blog.synapticlabs.ai/bounded-context-packs-meta-tool-pattern — Meta-tool pattern
- https://github.com/jbabin91/mcprism — MCPrism: 98% context savings
- https://pub.towardsai.net/progressive-disclosure-in-ai-agent-skill-design — Progressive disclosure in agent design
- https://www.honra.io/articles/progressive-disclosure-for-ai-agents — Why agents need progressive disclosure
- https://matthewkruczek.ai/blog/progressive-disclosure-mcp-servers.html — 85x token savings benchmark
- https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1888 — MCP SEP: progressive disclosure
- https://deepwiki.com/microsoft/agent-skills/3.3-progressive-disclosure — Microsoft agent skills

---

## Findings

### Finding: Progressive disclosure reduces tool schema overhead by 80-98%
**Confidence:** CONFIRMED
**Evidence:** MCPrism, Synaptic Labs, Anthropic Tool Search

Multiple implementations measured:
- Anthropic: 150,000 tokens → 2,000 tokens (98.7% reduction) for equivalent functionality
- MCPrism: Initial tool load from ~17,000 tokens to ~1,200 tokens (93% reduction)
- Average tool description: ~500 tokens → ~150 tokens
- Total tokens per conversation: 25K+ → 3K-5K (80-88% reduction)
- Matthew Kruczek benchmark: 85x token savings with progressive disclosure MCP

**Implications:** Progressive disclosure is the most impactful architectural pattern for MCP tool design. It solves the tool explosion problem at the protocol level.

---

### Finding: The meta-tool pattern enables scaling beyond the tool count ceiling
**Confidence:** CONFIRMED
**Evidence:** Synaptic Labs blog (bounded-context-packs)

The meta-tool pattern uses 2 registered tools to provide access to unlimited capabilities:
1. **Discovery tool** — lists available agents/tools, returns schema on demand
2. **Execution tool** — routes calls to specific tools

Instead of loading 29 tool schemas at startup, the LLM loads 2. It discovers schemas on demand and executes through the execution tool.

The architecture has three layers: (1) two meta-tools, (2) domain-organized agents grouping related tools, (3) individual tools within each agent.

Synaptic Labs' Nexus implements this pattern as an open-source Obsidian plugin.

**Implications:** The meta-tool pattern is the extreme case of progressive disclosure — compress all tools into 2 meta-tools. Works well for tool-heavy environments (50+ tools).

---

### Finding: Anthropic's Agent Skills use progressive disclosure as the core design principle
**Confidence:** CONFIRMED
**Evidence:** Anthropic engineering blog (equipping-agents-for-the-real-world-with-agent-skills)

"Progressive disclosure is the core design principle that makes Agent Skills flexible and scalable, allowing agents to load information only as needed — like a well-organized manual with a table of contents, chapters, and appendices."

This means "the amount of context that can be bundled into a skill is effectively unbounded."

Agent Skills were published as an open standard in December 2025. Microsoft also adopted progressive disclosure for their agent-skills framework.

**Implications:** Progressive disclosure is not speculative — it's the official Anthropic pattern for managing agent context. MCP server design should follow the same principle.

---

### Finding: There is an active MCP SEP (Specification Enhancement Proposal) for progressive disclosure
**Confidence:** CONFIRMED
**Evidence:** GitHub issue #1888 on modelcontextprotocol repo

SEP proposal: "Progressive Disclosure for Typed Library Discovery & Introspection in MCP." This suggests the MCP protocol itself may formalize progressive disclosure, making it a first-class pattern rather than a client-side workaround.

**Implications:** Building a progressive disclosure MCP server now aligns with where the protocol is heading.

---

### Finding: Dynamic tool availability improves agent focus
**Confidence:** INFERRED
**Evidence:** Anthropic Tool Search Tool, progressive disclosure articles

"Agents get dumber when given too much information upfront." Progressive disclosure prevents context rot — irrelevant information accumulating in the agent's context.

The three-layer model:
- Layer 1 (Index): lightweight metadata, corpus overview
- Layer 2 (Details): search results, specific content summaries
- Layer 3 (Deep Dive): full content, original source material

**Implications:** The 4-tool progressive disclosure pattern (get_overview → search → list → read) maps directly to this three-layer model.

---

## Gaps / follow-ups

* No controlled A/B test comparing progressive disclosure MCP vs "all tools loaded" MCP on the same task set. The token savings are measured but task completion rate impact is assumed, not proven.
* The MCP SEP (#1888) is still a proposal — no timeline for formal adoption.
* Whether progressive disclosure hurts in scenarios where the agent needs many tools simultaneously (complex multi-domain tasks) is unexplored.
