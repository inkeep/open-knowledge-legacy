# Evidence: Practical Recommendations for MCP Tool Design

**Dimension:** D7 — Practical recommendations for our MCP tool design
**Date:** 2026-04-02
**Sources:** Synthesis of all prior dimensions, Anthropic guidance, AWS guidance, Philschmid, industry patterns

---

## Key files / pages referenced

- https://www.anthropic.com/engineering/writing-tools-for-agents — Tool design principles
- https://www.philschmid.de/mcp-best-practices — MCP best practices
- https://docs.aws.amazon.com/prescriptive-guidance/latest/mcp-strategies/mcp-tool-strategy-organization.html — AWS guidance
- https://www.mcpbundles.com/blog/mcp-tool-design-pattern — Six-tool pattern
- https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era/ — Tool-space interference
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool — Tool Search Tool

---

## Findings

### Finding: The converging recommendation is 4-6 semantic tools with filesystem-like simplicity
**Confidence:** INFERRED
**Evidence:** Synthesis across all sources

The evidence converges on a specific design:

**Core tools (4):**
1. `get_overview` — corpus orientation (what's in the KB, categories, stats)
2. `search` — hybrid keyword+semantic search with filtering
3. `list_articles` — browse/filter by metadata (topic, date, tags)
4. `read_article` — full content by slug/ID

**Optional extensions (2):**
5. `get_related` — cross-references for a given article
6. `get_section` — partial content (specific section of an article)

This maps to: Context7 (2 tools) + progressive disclosure (overview + browse) = 4-6 tools.

**Implications:** This tool surface is small enough to avoid the tool explosion problem, while being rich enough to support multiple retrieval strategies (direct lookup, search, browse, explore).

---

### Finding: Tool descriptions should include usage examples, boundary conditions, and output format
**Confidence:** CONFIRMED
**Evidence:** Anthropic (writing-tools-for-agents)

Anthropic's specific recommendations:
- Include example usage, edge cases, input format requirements
- Specify clear boundaries from other tools
- Use unambiguous parameter names (user_id not user)
- Docstrings are instructions — specify when to use, how to format, what to expect
- Consider adding a response_format enum (concise/detailed) for token efficiency
- Implement pagination with sensible defaults
- Return helpful error messages that guide retry behavior

**Implications:** Every MCP tool description should be written as if for a new hire — clear, complete, with examples.

---

### Finding: Tool responses should be formatted for LLM consumption, not API consumption
**Confidence:** CONFIRMED
**Evidence:** Philschmid, Anthropic, MS Research

Philschmid: "MCP is a User Interface for AI agents. Build it like one."

Specific formatting guidance:
- Use semantic terms (name, image_url) not technical identifiers (uuid, mime_type)
- Resolve IDs to human-readable names where possible
- Implement truncation with helpful instructions ("showing top 10 of 847 results — refine your query")
- Claude Code restricts tool responses to 25,000 tokens by default
- Paginate with limit defaults (20-50), include has_more, next_offset, total_count

MS Research: Median tool output is 98 tokens, mean is 4,431, max is 557,766. Oversized responses degrade performance by up to 91%.

**Implications:** MCP tool responses should be concise, structured (markdown or JSON), paginated, and include enough metadata for the agent to decide next steps without additional calls.

---

### Finding: Snake_case with domain prefix is the recommended naming convention
**Confidence:** CONFIRMED
**Evidence:** AWS, Philschmid, Anthropic, MCP community

Converging convention:
- Pattern: `{domain}_{noun}_{verb}` or `{domain}_{verb}_{noun}`
- Examples: `kb_articles_search`, `kb_article_read`, `kb_overview_get`
- Snake_case preferred (GPT-4o tokenizer optimized for it)
- Domain prefix prevents collisions when multiple MCP servers are loaded

**Implications:** Name tools with a consistent domain prefix and descriptive verb-noun pairs.

---

### Finding: Error responses should guide agent behavior, not just report failures
**Confidence:** CONFIRMED
**Evidence:** Anthropic, MS Research

Anthropic: "If a tool call fails, don't throw a Python exception — return a helpful string that the agent can use as an observation to self-correct."

MS Research: Of 5,983 "successful" tool results, 3,536 actually contained errors. Error messages like "error: job" provide no guidance.

Good error response example: "No articles found matching 'oauth setup'. Try broader terms like 'authentication' or 'oauth', or use list_articles to browse available topics."

**Implications:** Error handling is part of the tool interface design. Every error response should suggest an alternative action.

---

## Gaps / follow-ups

* The 4-6 tool recommendation is a synthesis, not a benchmark result. No one has A/B tested 2-tool vs 4-tool vs 6-tool MCP servers on the same knowledge base.
* Response formatting best practices are emerging but not standardized — would benefit from empirical testing of JSON vs markdown vs structured text.
* The naming convention recommendation is a consensus, not a formal standard in the MCP spec.
