# Evidence: Operationalized Knowledge Taxonomy

**Dimension:** D4 — Skills vs runbooks vs playbooks vs SOPs; passive vs active knowledge frameworks
**Date:** 2026-04-02
**Sources:** arxiv.org, llamaindex.ai, lucumr.pocoo.org, blog.alexewerlof.com, valuestreamai.com, cutover.com, sema4.ai

---

## Key Sources Referenced

- https://arxiv.org/html/2602.12430v3 — "Agent Skills for LLMs: Architecture, Acquisition, Security" (survey)
- https://www.llamaindex.ai/blog/skills-vs-mcp-tools-for-agents-when-to-use-what — LlamaIndex analysis
- https://lucumr.pocoo.org/2025/12/13/skills-vs-mcp/ — Armin Ronacher (Flask creator) analysis
- https://blog.alexewerlof.com/p/rag-vs-skill-vs-mcp-vs-rlm — RAG vs SKILL vs MCP vs RLM taxonomy
- https://valuestreamai.com/blog/ai-knowledge-management — AI Knowledge Management 2026
- https://cutover.com/blog/differences-runbooks-playbooks-sops — Runbooks vs Playbooks vs SOPs

---

## Findings

### Finding: The taxonomy of operationalized knowledge has four layers, from passive to active
**Confidence:** INFERRED (synthesis across multiple sources)
**Evidence:** Multiple sources synthesized

**Layer 1: Reference Knowledge (Passive)**
- Wiki articles, documentation, FAQs
- Agent access pattern: RAG retrieval, MCP server query
- Human analog: Reading a manual
- Characteristics: Descriptive, factual, declarative

**Layer 2: Standard Operating Procedures (Semi-passive)**
- SOPs with defined steps for predictable tasks
- Agent access pattern: Document retrieval + step following
- Human analog: Following a checklist
- Characteristics: Procedural but predictable; inputs/outputs well-defined

**Layer 3: Skills / Runbooks (Active-procedural)**
- SKILL.md, Sema4.ai Runbooks, operational runbooks
- Agent access pattern: Progressive disclosure, context injection, executable scripts
- Human analog: Trained specialist performing a workflow
- Characteristics: Procedural knowledge + decision logic + tool usage; adapts to context

**Layer 4: Playbooks (Active-strategic)**
- Strategic response frameworks for unpredictable situations
- Agent access pattern: Multi-agent orchestration, reasoning chains
- Human analog: Incident commander coordinating a response
- Characteristics: Adaptive, judgment-based, multiple possible paths

### Finding: The arXiv survey classifies skills as a distinct paradigm — "skill engineering" beyond prompt engineering and tool use
**Confidence:** CONFIRMED
**Evidence:** arxiv.org/html/2602.12430v3

The survey identifies skills as fundamentally different from both tools and knowledge bases:
- Tools: execute and return results (function calls)
- Knowledge bases: provide passive information (RAG)
- Skills: "reshape what the agent knows and can do" through progressive disclosure

Skills represent "a self-contained package: a structured instruction file (SKILL.md), optional scripts, reference documents, and assets" — they bundle procedural expertise with workflow guidance and executable code.

### Finding: Alex Ewerlof proposes a four-mechanism taxonomy: RAG vs SKILL vs MCP vs RLM
**Confidence:** CONFIRMED
**Evidence:** blog.alexewerlof.com

- RAG = "Just-In-Time dependency injection" (passive retrieval)
- SKILL = "Dynamic Link Libraries" (model-directed capability loading)
- MCP = "API Gateway for AI" (standardized external system access)
- RLM = "External environment variables" (recursive processing of massive data)

Key insight: Skills are the only mechanism where the model itself decides what knowledge to load based on context. RAG injects blindly, MCP connects to tools, RLM processes bulk data.

### Finding: Active vs passive knowledge is becoming a recognized framework
**Confidence:** CONFIRMED
**Evidence:** valuestreamai.com

ValueStreamAI explicitly states: "A traditional knowledge management system is passive — it stores and retrieves. An AI agent workflow is active — it ingests, connects, reasons, and acts."

A passive system answers "Where is that document?" An active agent answers "What does our organization know, and how do we act on it?"

### Finding: Sema4.ai Runbooks represent the "natural language operational knowledge" approach
**Confidence:** CONFIRMED
**Evidence:** sema4.ai/blog

Sema4.ai Runbooks capture three elements: Intent (purpose), Output (success criteria), Recipe (steps). Written in natural language, not code or flowcharts. Positioned as "executable blueprints" that non-technical users can create and modify. Agents interpret runbooks as operating instructions.

### Finding: kepano/obsidian-skills represents the "teach agents your tools" approach
**Confidence:** CONFIRMED
**Evidence:** github.com/kepano/obsidian-skills (19K stars)

Created by Obsidian's CEO. Skills that teach Claude Code how to work with Obsidian-specific formats (wikilinks, frontmatter, Bases, JSON Canvas). Uses the agentskills.io standard. Pattern: skills as "product documentation for agents" — not just general knowledge but specific operational instructions for using a tool correctly.

---

## Gaps / Follow-ups

- No formal academic framework for "passive vs active knowledge" in the AI agent context
- The taxonomy presented in Layer 1-4 is synthesized across sources, not from a single authoritative source
