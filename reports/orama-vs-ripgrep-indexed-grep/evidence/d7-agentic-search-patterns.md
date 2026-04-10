# Evidence: Agentic Search Patterns

**Dimension:** D7 — How agents use search vs grep differently than humans
**Date:** 2026-04-05
**Sources:** Existing reports (agent-knowledge-retrieval-paradigms-2025-2026, kb-index-navigation-patterns-for-agents, mcp-tool-interface-design-agent-performance)

---

## Key reports referenced

- `/Users/edwingomezcuellar/reports/agent-knowledge-retrieval-paradigms-2025-2026/REPORT.md` — D2 (coding agent retrieval), D8 (MCP interface design)
- `/Users/edwingomezcuellar/reports/kb-index-navigation-patterns-for-agents/REPORT.md` — D1 (index patterns), D2 (index-first), D7 (practitioner evidence), D8 (convergence)
- `/Users/edwingomezcuellar/reports/mcp-tool-interface-design-agent-performance/REPORT.md` — D1 (tool design), D3 (tool count), D5 (progressive disclosure)

---

## Findings

### Finding: Agents need ranked results — context window budgets are a hard constraint
**Confidence:** CONFIRMED
**Evidence:** Three independent reports converge:

- MCP Tool Interface Design, D5: "Progressive disclosure reduces context overhead by 80-98%."
- Agent Knowledge Retrieval, D8: "Token efficiency comparison (500-article KB): No index (grep only) = ~20K-100K total tokens. Catalog + keyword search = ~8K-12K total tokens."
- MCP Tool Interface Design, D3: "Tool count is the strongest predictor of agent failure... Microsoft Research found performance degradation 'up to 85% for some models' as tool count increases."

**Implications:** grep returns all matches equally — an agent processing 200 grep hits across 50 files consumes 10-50x more tokens than getting the top 5 ranked documents from a search engine. At $3-15/MTok for frontier models, this is both a quality and cost constraint.

### Finding: Agents use search for orientation/discovery — not just finding known patterns
**Confidence:** CONFIRMED
**Evidence:** KB Index Navigation, Executive Summary:

"The three layers are: (1) Orientation layer (always loaded, ~1K tokens): A lightweight catalog — article titles, one-line descriptions, topic tags. (2) Discovery layer (on demand): Search and filter tools. (3) Content layer (targeted): Read the full article when the agent needs it."

KB Index Navigation, D8: "The convergence is striking — eight independent implementations arrived at the same structure." These include Anthropic Agent Skills, OpenAI Codex AGENTS.md, Context7 MCP, Aider repo-map, CLAUDE.md, llms.txt, Mintlify llms-full.txt, and Fumadocs llms.txt.

KB Index Navigation, D2: "AGENTS.md (Harness pattern) is explicitly described as 'a table of contents pointing to a structured docs/ directory.' The agent reads AGENTS.md first, then navigates to specific docs as needed."

**Implications:** Agents don't start with "find lines matching X." They start with "what exists here?" — an orientation question that grep cannot answer. The search engine's ability to return ranked, topic-level results serves orientation. grep serves the later "find specific pattern" phase.

### Finding: Progressive disclosure (index → search → list → read) is industry-converged
**Confidence:** CONFIRMED
**Evidence:** Three reports independently validate:

- Agent Knowledge Retrieval, D8: "Layer 1: Index → get_overview / list_articles. Layer 2: Summary → search snippets. Layer 3: Full Read → read_article."
- KB Index Navigation, D8: "Every major tool builder has independently arrived at this pattern."
- MCP Tool Interface Design, D5: "Progressive disclosure is the single most impactful architectural pattern for MCP tool design, reducing context overhead by 80-98%... Anthropic adopted progressive disclosure as the 'core design principle' for Agent Skills (published as open standard, December 2025)."

**Implications:** search (Layer 2) is the discovery/filtering step in a proven 3-layer pipeline. grep serves a different purpose — it's a Layer 3 operation (targeted content extraction once you know what you're looking for).

### Finding: Agents adapt to available tools — they don't inherently prefer conceptual search
**Confidence:** CONFIRMED (nuances the "search by concept" claim)
**Evidence:** Agent Knowledge Retrieval, D2:

"Claude Code uses a three-tool hierarchy (Glob -> Grep -> Read) with strict cost ordering. Compensates for lack of semantic search by running parallel triangulation searches across multiple terms."

Amazon Science (cited in KB Index Navigation, D7): "'Keyword Search is All You Need.' Agentic tool use with keyword search achieves 94.5% faithfulness, 88% context recall, 91.5% answer correctness — over 90% of RAG-level performance without a vector database."

But MCP Tool Interface Design, D1: "Grep-only would work (agents are persistent) but would be token-inefficient. Semantic search adds measurable value."

**Implications:** The claim "agents search by concept, not pattern" is too strong. More accurate: agents CAN work with grep-only (they iterate with keyword variations), but BM25/semantic search is MORE token-efficient. The search engine doesn't unlock a capability agents lack — it makes an existing capability cheaper and more reliable. Cursor's A/B test showed +12.5% accuracy with semantic search vs keyword-only.

---

## Negative searches

* Searched for: head-to-head comparison of agent performance with search engine vs grep-only — no controlled experiment found in our reports or academic literature
* Searched for: quantified recall difference (search engine vs grep) for agent knowledge retrieval — only the Amazon Science 94.5% keyword figure found, no direct comparison with BM25

---

## Gaps / follow-ups

* No controlled experiment measuring agent task completion rate with search engine vs grep-only
* The +12.5% accuracy figure from Cursor's A/B test (cited in MCP report) would benefit from primary source verification
* Token cost comparison at 1K docs specifically (current evidence extrapolates from 500-article figure)
