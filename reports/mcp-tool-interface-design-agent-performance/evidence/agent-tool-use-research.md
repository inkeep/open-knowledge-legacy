# Evidence: Agent Tool Use Patterns from Research

**Dimension:** D3 — Agent tool use patterns from research
**Date:** 2026-04-02
**Sources:** Anthropic engineering blog, Microsoft Research, MCP-Bench, Anthropic tool use docs, AWS Prescriptive Guidance

---

## Key files / pages referenced

- https://www.anthropic.com/engineering/writing-tools-for-agents — Anthropic: Writing tools for agents
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool — Claude Tool Search Tool
- https://www.anthropic.com/engineering/advanced-tool-use — Advanced tool use
- https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era-designing-for-agent-compatibility-at-scale/ — MS Research: tool-space interference
- https://arxiv.org/abs/2508.20453 — MCP-Bench
- https://arxiv.org/abs/2603.13404 — Schema First Tool APIs

---

## Findings

### Finding: Tool descriptions are the most impactful lever for agent performance
**Confidence:** CONFIRMED
**Evidence:** Anthropic engineering blog (writing-tools-for-agents)

Anthropic: "Even small refinements to tool descriptions can yield dramatic improvements." Claude Sonnet 3.5 achieved "state-of-the-art performance" on SWE-bench Verified "after precise refinements to tool descriptions."

Best practices from Anthropic:
- "Think of how you would describe your tool to a new hire"
- Use unambiguous parameter names (user_id not user)
- Include example usage, edge cases, input format requirements, clear boundaries from other tools
- Docstrings are instructions — they specify when to use the tool, how to format arguments, what to expect back

**Implications:** The tool description IS the interface contract. For an MCP server, the description quality matters as much as or more than the tool's functional design.

---

### Finding: Tool count degrades performance measurably — up to 85% for some models
**Confidence:** CONFIRMED
**Evidence:** Microsoft Research (tool-space-interference), Jenova AI, Eclipse Source

Microsoft Research findings:
- "Performance drops...as the number of tools increases — up to 85% for some models"
- 775 tools share identical names across MCP servers ("search" appears in 32 servers)
- Flattening parameter spaces improved performance by 47%
- Tool response size varies wildly: median 98 tokens, mean 4,431, max 557,766
- Oversized responses degrade performance "up to 91% in one study"

Context window impact: 5 MCP servers × 30 tools = 150 tools → 30,000-60,000 tokens of tool definitions alone, consuming 25-30% of a 200K context window before any work begins.

**Implications:** Tool explosion is the primary failure mode for MCP-based agents. Fewer tools = better performance. This is the strongest argument for minimal tool surfaces.

---

### Finding: Anthropic's Tool Search Tool addresses the tool explosion problem
**Confidence:** CONFIRMED
**Evidence:** Anthropic docs (tool-search-tool, advanced-tool-use)

Claude's Tool Search Tool (public beta, late 2025):
- Mark tools with `defer_loading: true` — they're not loaded into context initially
- Claude searches for tools on demand, only loading what it needs
- Supports up to 10,000 tools in catalogue, returns 3-5 per search
- Available on Sonnet 4.5, Sonnet 4.6, Opus 4.5, Opus 4.6

This is the progressive disclosure pattern applied at the tool definition level — the agent discovers tools as needed rather than seeing all tool schemas upfront.

**Implications:** Even Anthropic recognizes that exposing all tools simultaneously is a design flaw. The solution is dynamic tool discovery — which suggests MCP servers should optimize for discoverability (good descriptions) over comprehensive tool surfaces.

---

### Finding: "Outcomes not operations" is the emerging design principle
**Confidence:** CONFIRMED
**Evidence:** Philschmid (philschmid.de/mcp-best-practices), Anthropic (writing-tools-for-agents)

Philschmid: "MCP servers are not thin wrappers around your existing API. A good REST API is not a good MCP server."

Instead of 3 atomic tools (get_user_by_email, list_orders, get_order_status), provide 1 outcome-oriented tool (track_latest_order) that orchestrates internally.

Anthropic: Build "a few thoughtful tools targeting specific high-impact workflows" rather than comprehensive coverage. Tools should consolidate multiple discrete operations under the hood.

**Implications:** For a knowledge platform MCP, this means `search_articles` should not just return IDs — it should return enough context (title, snippet, metadata) for the agent to decide next steps without additional calls.

---

### Finding: Error handling is a critical and underinvested tool design dimension
**Confidence:** CONFIRMED
**Evidence:** Microsoft Research, Anthropic

MS Research: Of 5,983 tool results marked successful, GPT-4.1 identified 3,536 actually contained errors. Error messages frequently lacked diagnostic value ("error: job").

Anthropic: Provide "specific and actionable improvements" rather than opaque error codes. Return helpful strings that agents can use as observations to self-correct.

**Implications:** MCP tool responses should include clear error messages that guide the agent to try a different approach, not just fail silently.

---

### Finding: MCP-Bench reveals persistent challenges in multi-tool coordination
**Confidence:** CONFIRMED
**Evidence:** MCP-Bench (Accenture, arXiv:2508.20453)

MCP-Bench connects LLMs to 28 MCP servers, 250 tools across domains. Tests: retrieving tools from fuzzy instructions, planning multi-hop trajectories, grounding in intermediate outputs, cross-domain orchestration.

"Experiments on 20 advanced LLMs reveal persistent challenges" — multi-step coordination remains hard even for frontier models.

**Implications:** Complex multi-tool workflows are fragile. Simpler tool surfaces with fewer required hops are more reliable.

---

## Gaps / follow-ups

* No published A/B test data on tool description quality vs agent accuracy (Anthropic mentions dramatic improvements but doesn't publish controlled numbers).
* The Schema First paper (Sigdel et al.) only tested one local model — need frontier model replication.
* How different response formats (JSON vs markdown vs XML) affect tool result consumption is mentioned but not systematically benchmarked.
