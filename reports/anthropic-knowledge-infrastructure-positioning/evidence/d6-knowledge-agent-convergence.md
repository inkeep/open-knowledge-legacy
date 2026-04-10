# Evidence: Knowledge-Agent Convergence

**Dimension:** D6 — KBs as skill registries, every-article-as-a-skill, agent memory tools
**Date:** 2026-04-02
**Sources:** thenewstack.io, gitbook.com, dev.to, vectorize.io, mem0.ai, forum.letta.com, spring.io, agentwiki.org

---

## Key Sources Referenced

- https://thenewstack.io/agentic-knowledge-base-patterns/ — 6 Agentic KB Patterns
- https://www.gitbook.com/blog/skill-md — GitBook's skill.md positioning
- https://gofastmcp.com/servers/providers/skills — FastMCP Skills Provider
- https://github.com/zouyingcao/agentskills-mcp — AgentSkills MCP bridge
- https://vectorize.io/articles/best-ai-agent-memory-systems — Memory systems comparison

---

## Findings

### Finding: 6 agentic knowledge base patterns are emerging in practice
**Confidence:** CONFIRMED
**Evidence:** The New Stack (February 2026)

1. **Coding assistant playbooks** — Rules, conventions, debugging procedures (LinkedIn's CAPT: 70% reduction in issue triage time)
2. **Integration knowledge centers** — Schemas and compliance rules for data automation (Adeptia)
3. **Multi-agent home bases** — Vectorized repos + semantic search + RAG for multi-agent workflows (R Systems)
4. **Shared business context layers** — ERP and financial agent context (Epicor)
5. **Semantic layers for data intelligence** — Single metric definitions to eliminate dashboard discrepancies (Amazon)
6. **MCP-powered capability layers** — Governed KB access via MCP (Vendia)

**Implications:** Knowledge bases are being purpose-built for agent consumption across industries, but none of these patterns explicitly treat KB articles as executable skills.

### Finding: GitBook frames skill.md as an overlay on documentation — docs-to-skills bridge
**Confidence:** CONFIRMED
**Evidence:** gitbook.com/blog/skill-md

GitBook positions skill.md as "structured technical documentation written specifically for AI agents" that sits on top of existing docs. "Your documentation site is already your product's source of truth." The relationship: full technical docs (reference knowledge) → skill.md extracts actionable workflows (operationalized knowledge).

This is the closest anyone has come to "every article could be a skill" — GitBook is proposing that docs sites should author skill.md files that complement their reference documentation.

### Finding: FastMCP Skills Provider exposes skill directories as MCP resources
**Confidence:** CONFIRMED
**Evidence:** gofastmcp.com/servers/providers/skills

The Skills Provider "exposes skill directories as MCP resources, making skills discoverable and shareable across different AI tools and clients." Clients list resources to see available skills and read them as needed via MCP protocols.

**Implications:** This is the bridge between the skill registry concept and MCP — skills become MCP resources that agents discover and consume through a standard protocol.

### Finding: AgentSkills MCP bridges the skills standard to any MCP-compatible agent
**Confidence:** CONFIRMED
**Evidence:** github.com/zouyingcao/agentskills-mcp

AgentSkills MCP "unlocks Agent Skills for any MCP-compatible agent" using progressive disclosure architecture. This means any agent with MCP support can consume skills even if it doesn't natively support the agentskills.io standard.

### Finding: Agent memory tools (Mem0, Zep, Letta) solve a different problem than knowledge bases
**Confidence:** CONFIRMED
**Evidence:** Letta forum, Vectorize.io comparison, Mem0 blog

Two distinct problems:
1. **Personalization** (remembering who the user is) — Mem0's strength
2. **Institutional knowledge** (learning how to do the job better) — Zep and Letta's focus

Agent memory tools store conversational and temporal knowledge that evolves through interactions. Knowledge bases store curated, authored content. Skills store authored procedures. These are three different knowledge layers:
- Memory = experiential knowledge (accumulated through interactions)
- KBs = reference knowledge (curated by humans)
- Skills = procedural knowledge (authored for agent execution)

### Finding: No one is building the "every KB article becomes an executable skill" pattern at scale
**Confidence:** CONFIRMED (negative search)
**Evidence:** Multiple searches, no results

Searched for: knowledge base articles auto-converting to skills, wiki articles as executable agent actions, KB-to-skill conversion. Found: GitBook skill.md overlay (manual authoring), AgentSkills MCP bridge (skills as MCP resources), but NO automated or systematic conversion of reference articles into executable skills.

The closest patterns:
- GitBook: docs site → auto MCP server (reference access, not execution)
- GitBook: docs → manual skill.md authoring (human-in-loop)
- FastMCP: skill directories → MCP resources (makes existing skills discoverable)
- Sema4.ai: KB queries called from runbooks (knowledge feeds into procedures)

**Implications:** This is an unoccupied design space. No one is building a system where reference knowledge automatically or semi-automatically becomes executable operational knowledge.

---

## Gaps / Follow-ups

- AgentWiki (agentwiki.org) briefly surfaced but unclear how it relates to skill registries
- Spring AI agent skills pattern (spring.io) identified but not deeply investigated
