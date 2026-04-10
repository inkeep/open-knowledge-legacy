---
title: "Anthropic's Knowledge Infrastructure Positioning and the Operationalized Knowledge Landscape"
description: "Strategic analysis of Anthropic's play in knowledge/agent infrastructure (skills, MCP, Cowork, CLAUDE.md), the taxonomy of operationalized knowledge vs reference knowledge bases, and the convergence of knowledge bases with agent infrastructure. Answers whether anyone is building the 'every KB article could be an executable skill' pattern."
createdAt: 2026-04-02
updatedAt: 2026-04-02
subjects:
  - Anthropic
  - Agent Skills
  - agentskills.io
  - Model Context Protocol
  - Claude Cowork
  - AAIF
  - Sema4.ai
  - GitBook
  - Mem0
  - Zep
  - Letta
topics:
  - knowledge infrastructure
  - operationalized knowledge
  - agent skills ecosystem
  - passive vs active knowledge
  - knowledge-agent convergence
---

# Anthropic's Knowledge Infrastructure Positioning and the Operationalized Knowledge Landscape

**Purpose:** Map Anthropic's strategic positioning in knowledge/agent infrastructure, establish a taxonomy of operationalized knowledge (skills/runbooks/MCPs) vs reference knowledge bases, and assess whether the convergence pattern -- "every KB article could be an executable skill" -- exists or is being built. Intended to inform the scoping of an agent-native knowledge platform.

---

## Executive Summary

Anthropic is building knowledge infrastructure, but not calling it that. Through three product surfaces -- Agent Skills (procedural knowledge packaging), MCP (knowledge access protocol), and Claude Cowork plugins (enterprise knowledge distribution) -- Anthropic has assembled the components of a knowledge management platform without explicitly branding it as one. The strategy is emergent from product decisions, not declared as a unified vision.

The most important finding for an agent-native knowledge platform: **no one is building the "every KB article becomes an executable skill" pattern at scale.** The closest approaches are GitBook's auto-MCP-per-docs-site (turns reference docs into agent-queryable knowledge) and GitBook's skill.md positioning (proposes that docs sites should author skill.md overlays). But automated or semi-automated conversion of reference articles into executable operational knowledge is an unoccupied design space.

The landscape reveals a clear three-layer knowledge stack emerging for agents:

1. **Reference knowledge** (passive) -- Wiki articles, documentation, FAQs. Accessed via MCP servers or RAG. Every major knowledge platform (Notion, Confluence, GitBook, Google Docs, Microsoft Learn) now exposes MCP servers.
2. **Procedural knowledge** (active) -- Skills (SKILL.md), runbooks, playbooks. Injected into agent context via progressive disclosure. Authored for agent execution.
3. **Experiential knowledge** (dynamic) -- Agent memory (Mem0, Zep, Letta). Accumulated through interactions. Evolves over time.

The first two layers are where a platform play exists. The gap is the bridge between them -- turning passive reference knowledge into active procedural knowledge.

**Key Findings:**

- **Anthropic's knowledge play is skills + MCP + Cowork, not a unified knowledge product.** No blog post, announcement, or roadmap signal frames this as a knowledge management strategy. The knowledge infrastructure is distributed across product surfaces.
- **Agent Skills (agentskills.io) has not been transferred to AAIF.** MCP and AGENTS.md were donated to the Agentic AI Foundation; Agent Skills remains under Anthropic's control -- a possible signal of strategic retention.
- **skills.sh (Vercel) is a marketplace on top of agentskills.io, not a competitor.** The relationship is spec (agentskills.io) vs distribution (skills.sh), similar to npm spec vs npm registry.
- **MCP is converging as the universal knowledge access protocol.** GitBook, Notion, Confluence, Google, Microsoft Learn, Document360 all ship MCP servers. The pattern: every docs site becomes an agent-queryable knowledge source.
- **The operationalized knowledge taxonomy has four layers** from passive (articles) to active-strategic (playbooks), with skills/runbooks in the active-procedural middle.
- **The "KB as skill registry" pattern does not exist at scale.** GitBook's docs-to-skill.md bridge and FastMCP's Skills Provider are the closest precursors, but no system automatically converts reference knowledge into executable skills.
- **Agent memory tools (Mem0, Zep, Letta) solve a different problem than knowledge bases.** Memory is experiential and conversational; knowledge bases are curated and authored; skills are procedural and executable. These are three distinct layers, not competitors.

---

## Research Rubric

**Report Type:** Ecosystem Landscape / Strategic Positioning Analysis
**Primary Question:** What is Anthropic's play in knowledge/agent infrastructure, and how does the broader landscape differentiate operationalized knowledge from reference knowledge bases?
**Audience:** Product strategists scoping an agent-native knowledge platform
**Stance:** Factual

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Anthropic's knowledge infrastructure signals | Deep | P0 |
| D2 | agentskills.io governance + adoption | Moderate | P0 |
| D3 | MCP as knowledge access protocol | Deep | P0 |
| D4 | Operationalized knowledge taxonomy | Deep | P0 |
| D5 | Operationalized knowledge tools compared | Moderate | P1 |
| D6 | Knowledge-agent convergence | Deep | P0 |
| D7 | Anthropic announcements on agent knowledge | Moderate | P1 |

**Non-goals:** Per-skill authoring mechanics, distribution/packaging details, Claude Agent SDK internals (covered by existing reports in this catalogue).

---

## Detailed Findings

### D1: Anthropic's Knowledge Infrastructure Signals

**Finding:** Anthropic is building a three-layer knowledge stack (context files, skills, MCP) without framing it as a knowledge management strategy. CLAUDE.md is local project context, not an evolving knowledge standard. Skills are the knowledge play.

**Evidence:** [evidence/d1-anthropic-knowledge-signals.md](evidence/d1-anthropic-knowledge-signals.md)

Anthropic's knowledge infrastructure is distributed across three product surfaces, each serving a distinct knowledge function:

| Surface | Knowledge Function | Scope | Cross-platform? |
|---------|-------------------|-------|-----------------|
| **CLAUDE.md** | Project orientation / foundational context | Local project | No (Claude Code only) |
| **AGENTS.md** | Agent configuration / capabilities declaration | Project/repo | Yes (AAIF-governed, 60K+ adopters) |
| **Agent Skills (SKILL.md)** | Procedural knowledge packaging | Universal | Yes (30+ platforms, 109K GitHub stars) |
| **MCP servers** | Knowledge access / tool connectivity | Universal | Yes (AAIF-governed, 97M+ monthly SDK downloads) |
| **Cowork plugins** | Enterprise knowledge distribution | Organization | No (Claude Cowork only) |

The signals are clear: CLAUDE.md stays local. The cross-platform knowledge plays are SKILL.md and MCP. Anthropic frames skills explicitly as "decentralized, composable knowledge management" and compares them to "an onboarding guide for a new hire" -- procedural knowledge, not just information.

Anthropic's [context engineering blog](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) reveals the architectural philosophy: "intelligent retrieval over bulk storage." Rather than building a centralized knowledge product, Anthropic is building the primitives (context files, skills, MCP, memory tools) that let knowledge be distributed and retrieved just-in-time.

**Claude Cowork's knowledge model** is the enterprise expression of this strategy. Plugins bundle skills + connectors (MCPs) + agents into deployable units, distributed via private marketplaces with admin control. Anthropic launched 11 knowledge work categories (HR, Design, Engineering, Operations, etc.) with PwC as a regulated-industry partner. This is enterprise knowledge distribution, not knowledge creation.

**Decision triggers:**
- If building a knowledge platform that needs to integrate with Anthropic's ecosystem: align with the SKILL.md format (for procedures) and MCP (for reference access). CLAUDE.md is not an integration surface.
- If evaluating whether Anthropic will build a competing knowledge platform: evidence suggests they are building primitives, not a monolithic product. The platform opportunity sits on top of their stack.

### D2: agentskills.io Governance and Adoption

**Finding:** Agent Skills has massive adoption (109K stars, 30+ platforms, 500K+ indexed skills) but has NOT been transferred to AAIF, unlike MCP and AGENTS.md. skills.sh is a marketplace layer on top of agentskills.io, not a competitor.

**Evidence:** [evidence/d2-agentskills-governance-adoption.md](evidence/d2-agentskills-governance-adoption.md)

**Governance status as of April 2026:**

| Standard | Governance | Transfer to AAIF? |
|----------|-----------|-------------------|
| MCP | AAIF (Linux Foundation) | Yes (December 2025) |
| AGENTS.md | AAIF (Linux Foundation) | Yes (with AAIF formation) |
| Agent Skills (agentskills.io) | Anthropic | **No** |

This asymmetry is notable. MCP and AGENTS.md were contributed to neutral governance under the Linux Foundation's AAIF. Agent Skills remains under Anthropic's GitHub organization. Whether this is a timing issue (transfer pending) or a strategic choice (retain control over the knowledge packaging standard) is unclear, but it bears watching.

**Adoption metrics (March 2026):**
- anthropics/skills repo: 109K GitHub stars
- agentskills/agentskills spec repo: 14.6K stars
- Platform adopters: 30+ (Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, VS Code, Windsurf, Amp, Roo, OpenHands, OpenCode, Kiro, Goose, Hermes)
- skills.sh: 83K+ indexed skills, ~147 new skills/day
- SkillsMP: 500K+ indexed skills
- Antigravity: 1,340+ curated skills

**skills.sh and agentskills.io relationship:** [skills.sh](https://skills.sh) (Vercel) is a directory, leaderboard, and CLI (`npx skills`) that consumes the agentskills.io spec. The relationship is analogous to npm registry implementing the Node.js package spec -- skills.sh is distribution, agentskills.io is the standard. Vercel also partnered with [Snyk](https://snyk.io/blog/snyk-vercel-securing-agent-skill-ecosystem/) for security scanning at install time.

**Remaining uncertainty:** Whether Anthropic will transfer Agent Skills to AAIF. If they do, it becomes true neutral infrastructure. If they don't, it remains an Anthropic-originated standard that others have adopted -- similar to how Docker created container images before the OCI standardized them.

### D3: MCP as Knowledge Access Protocol

**Finding:** MCP has converged as the de facto protocol for agents to access knowledge. Every major docs/knowledge platform now ships an MCP server. GitBook auto-generates one for every published site. The pattern: docs sites become agent-queryable knowledge sources without additional tooling.

**Evidence:** [evidence/d3-mcp-knowledge-access-protocol.md](evidence/d3-mcp-knowledge-access-protocol.md)

**Knowledge platforms with MCP servers (confirmed):**

| Platform | MCP Type | Access Model | Auto-generated? |
|----------|----------|-------------|-----------------|
| **GitBook** | Built-in (`/~gitbook/mcp`) | Every published site | **Yes** |
| **Notion** | Official (OAuth) | Full workspace read/write | No (manual setup) |
| **Confluence** | Atlassian Remote MCP | Jira + Confluence via CQL | No (manual setup) |
| **Google Developer Docs** | Official API + MCP | Canonical docs gateway | No (API-based) |
| **Microsoft Learn** | Official MCP | Real-time doc search | No (manual setup) |
| **Document360** | Official MCP | Documentation platform | No (manual setup) |

[GitBook's pattern](https://www.gitbook.com/blog/new-in-gitbook-september-2025) is the most significant: every published docs site automatically becomes an MCP server. No configuration, no additional tooling. Append `/~gitbook/mcp` to any GitBook site URL and connect from VS Code, Cursor, or any MCP client. This turns documentation into agent-accessible knowledge at zero marginal cost.

**The orthogonality of MCP and skills is now well-established** across multiple independent analyses:

- [LlamaIndex](https://www.llamaindex.ai/blog/skills-vs-mcp-tools-for-agents-when-to-use-what): "MCP solved 'how do agents talk to tools'... skills address how to package and share workflows"
- [Armin Ronacher](https://lucumr.pocoo.org/2025/12/13/skills-vs-mcp/) (Flask creator): Skills teach agents how to use existing tools; MCP provides the tools
- [David Cramer](https://cra.mr/mcp-skills-and-agents/): "Skills teach you to cook, MCP provides the instruments"

**Implication for a knowledge platform:** MCP is how agents access reference knowledge. Skills are how agents execute procedures. A knowledge platform needs both: MCP for the "read" layer (querying articles, docs, data) and skills for the "execute" layer (running procedures, workflows, automations).

### D4: Operationalized Knowledge Taxonomy

**Finding:** A four-layer taxonomy distinguishes passive reference knowledge from active procedural knowledge, with skills and runbooks occupying the active-procedural middle. The academic literature confirms skills as a distinct paradigm ("skill engineering") beyond prompt engineering and tool use.

**Evidence:** [evidence/d4-operationalized-knowledge-taxonomy.md](evidence/d4-operationalized-knowledge-taxonomy.md)

**The Knowledge Activation Spectrum:**

```
PASSIVE                                                              ACTIVE
  |                                                                    |
  Reference          SOPs           Skills/Runbooks        Playbooks
  Knowledge          (Semi-passive)  (Active-procedural)   (Active-strategic)
  |                  |              |                      |
  Wiki articles,     Defined steps   SKILL.md, Sema4       Strategic response
  documentation,     for predictable runbooks; procedural  frameworks;
  FAQs               tasks; checklists knowledge + decision adaptive, judgment-
  |                  |              logic + tool usage      based
  Access: RAG/MCP    Access: Doc     Access: Progressive    Access: Multi-agent
                     retrieval       disclosure, context    orchestration
                                     injection
```

This taxonomy synthesizes across multiple sources. [ValueStreamAI](https://valuestreamai.com/blog/ai-knowledge-management) establishes the core distinction: "A traditional knowledge management system is passive -- it stores and retrieves. An AI agent workflow is active -- it ingests, connects, reasons, and acts." The [arXiv survey](https://arxiv.org/html/2602.12430v3) on Agent Skills for LLMs confirms skills as a distinct paradigm, identifying them as fundamentally different from both tools (which execute and return results) and knowledge bases (which provide passive information). Skills "reshape what the agent knows and can do."

[Alex Ewerlof's taxonomy](https://blog.alexewerlof.com/p/rag-vs-skill-vs-mcp-vs-rlm) proposes four mechanisms: RAG (just-in-time dependency injection), SKILL (dynamic capability loading), MCP (API gateway for AI), RLM (recursive processing). The key insight: skills are the only mechanism where the model itself decides what knowledge to load based on context.

**The traditional ops knowledge hierarchy maps onto the agent world:**

| Traditional | Agent Equivalent | Predictability | Human Analog |
|------------|------------------|---------------|-------------|
| FAQ / Wiki article | RAG-retrieved document | High | Reading a manual |
| SOP | Structured prompt / checklist | High | Following a checklist |
| Runbook | SKILL.md / Sema4.ai Runbook | Medium-High | Trained specialist |
| Playbook | Multi-agent orchestration | Low | Incident commander |

**Decision triggers:**
- If building for "articles that agents read": MCP + RAG is the established pattern
- If building for "procedures that agents execute": SKILL.md is the standard
- If building for "the bridge between articles and procedures": this is the gap no one has filled

### D5: Operationalized Knowledge Tools Compared

**Finding:** Four distinct approaches to operationalized knowledge exist, ranging from platform-agnostic open standards (agentskills.io) to platform-specific natural language systems (Sema4.ai). They represent fundamentally different theories of how knowledge should be operationalized.

**Evidence:** [evidence/d5-operationalized-knowledge-tools-compared.md](evidence/d5-operationalized-knowledge-tools-compared.md)

| Approach | Format | Agent Model | Philosophy | Authorship Model |
|----------|--------|-------------|-----------|-----------------|
| **agentskills.io** | Markdown + YAML | Any compatible agent | AI-native instructions; cross-platform | Developers / domain experts write for agents |
| **Sema4.ai Runbooks** | Natural language (Intent/Output/Recipe) | Sema4.ai platform | Human-natural language that AI interprets | Business users write for humans, AI consumes |
| **kepano/obsidian-skills** | SKILL.md (agentskills.io) | Claude Code, Codex, etc. | Tool-specific operational knowledge | Product maintainers write agent usage guides |
| **Claude Cowork plugins** | SKILL.md + MCP + agents bundled | Claude Cowork | Enterprise knowledge distribution | IT admins distribute, Claude assists authoring |

The philosophical split between [Sema4.ai](https://sema4.ai/blog/forget-flowcharts-runbooks-are-future-work/) and agentskills.io is fundamental:

- **Sema4.ai:** Knowledge is authored in human-natural language ("Forget flowcharts"). Non-technical users write runbooks that AI interprets. Platform-locked.
- **agentskills.io:** Knowledge is authored as structured AI-native instructions. Developers write markdown that agents consume directly. Cross-platform.

[kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) (19K stars, maintained by Obsidian's CEO) represents a third model: product maintainers authoring skills that teach agents how to use their specific tool correctly. This is "product documentation reimagined as agent instructions" -- the skill tells Claude how to handle wikilinks, frontmatter, Bases, and JSON Canvas.

**Remaining uncertainty:** No performance comparison exists between these approaches. Whether human-natural language runbooks (Sema4.ai) or AI-native instructions (SKILL.md) produce better agent outcomes is an open empirical question.

### D6: Knowledge-Agent Convergence

**Finding:** The "every KB article could be an executable skill" pattern does not exist at scale. The closest precursors are GitBook's docs-to-MCP bridge (reference access), GitBook's skill.md overlay model (manual authoring), and FastMCP's Skills Provider (skill discovery via MCP). This is an unoccupied design space.

**Evidence:** [evidence/d6-knowledge-agent-convergence.md](evidence/d6-knowledge-agent-convergence.md)

**What exists today:**

Six [agentic knowledge base patterns](https://thenewstack.io/agentic-knowledge-base-patterns/) are emerging in practice (The New Stack, February 2026): coding assistant playbooks (LinkedIn), integration knowledge centers (Adeptia), multi-agent home bases (R Systems), shared business context layers (Epicor), semantic layers for data intelligence (Amazon), and MCP-powered capability layers (Vendia). These are knowledge bases purpose-built for agent consumption -- but none treat KB articles as executable skills.

The patterns that come closest to the convergence thesis:

1. **GitBook: docs site --> auto MCP server.** Every GitBook site becomes agent-queryable. But this is reference access (agents read articles), not execution (agents follow procedures from articles).

2. **GitBook: docs --> skill.md overlay.** [GitBook proposes](https://www.gitbook.com/blog/skill-md) that docs sites should author skill.md files as an "overlay" on reference documentation -- extracting actionable workflows from the broader knowledge base. This is the clearest articulation of the bridge, but it requires manual authoring.

3. **FastMCP Skills Provider.** Exposes skill directories as MCP resources, making existing skills discoverable through the same protocol used for reference knowledge. This is skills-as-MCP, not articles-as-skills.

4. **AgentSkills MCP bridge.** Unlocks Agent Skills for any MCP-compatible agent via progressive disclosure. Another skills-as-MCP bridge.

5. **Sema4.ai: KB queries from runbooks.** Agents call knowledge base queries directly from their runbooks, using retrieved knowledge to inform reasoning. This is reference knowledge feeding into procedures -- the closest to automated convergence.

**What does NOT exist:**
- Automated conversion of reference articles into executable skills
- A system where publishing a wiki article automatically generates a corresponding SKILL.md
- A knowledge platform where "every article is also a skill"

**Agent memory tools (Mem0, Zep, Letta) are a separate layer entirely.** Memory is experiential knowledge accumulated through interactions. Knowledge bases store curated authored content. Skills store authored procedures. The three are complementary, not competing:

| Knowledge Layer | Type | Source | Persistence | Agent Access |
|----------------|------|--------|-------------|--------------|
| **Reference KB** | Curated facts | Human authoring | Static until edited | MCP / RAG |
| **Skills** | Procedures | Human authoring | Static until edited | Progressive disclosure |
| **Agent memory** | Experiential | Interaction logs | Continuously evolving | Temporal graph / vector |

**Decision triggers:**
- If building the "articles become skills" bridge: this is greenfield territory. No competitor exists.
- If building a knowledge platform with MCP access: GitBook's pattern is the model. Auto-generate MCP servers for every knowledge surface.
- If integrating with agent memory: Mem0 for personalization, Zep/Letta for institutional knowledge. These complement, not replace, a knowledge platform.

### D7: Anthropic's Communications on Agent Knowledge

**Finding:** Anthropic has published three canonical pieces that collectively describe their knowledge infrastructure strategy, but no standalone "knowledge management for agents" manifesto exists. The strategy is implicit in product announcements, not explicit in strategic communications.

**Evidence:** [evidence/d7-anthropic-announcements.md](evidence/d7-anthropic-announcements.md)

The three canonical pieces:

1. **"Effective Context Engineering for AI Agents"** -- The architectural philosophy. Introduces the hybrid model (CLAUDE.md + skills + MCP) and the principle of "intelligent retrieval over bulk storage."

2. **"Equipping Agents for the Real World with Agent Skills"** -- The knowledge packaging standard. Frames skills as "decentralized, composable knowledge management" and positions the open standard.

3. **"Cowork and Plugins Across the Enterprise"** -- The distribution model. Shows how procedural knowledge (skills) + connectivity (MCP) + orchestration (agents) bundle into distributable enterprise units.

Additionally, Anthropic published "The Complete Guide to Building Skills for Claude" as an enterprise-oriented PDF, framing skills as the way to package organizational knowledge.

**Implication:** Anthropic's knowledge infrastructure strategy can be reconstructed from these three sources, but the company has not yet articulated it as a unified positioning. For a competing or complementary platform, this means the "knowledge management for agents" narrative is available to claim.

---

## The Platform Opportunity: Synthesizing Across Dimensions

The convergence of these findings points to a specific platform opportunity that no one is currently building:

**The gap:** Reference knowledge (articles, docs, wikis) and procedural knowledge (skills, runbooks) are treated as separate systems with separate authoring workflows, separate access patterns, and separate distribution mechanisms. MCP bridges reference knowledge to agents. Skills bridge procedures to agents. But nothing bridges reference knowledge INTO procedural knowledge.

**What the platform would do:**

```
Author an article            -->  Article is queryable via MCP
   |                              (reference access -- exists today)
   |
   v
Article has executable        -->  Skill is loadable via progressive
sections (procedures,              disclosure (procedural access --
workflows, automations)            exists today)
   |
   v
The platform auto-generates   -->  The bridge (does NOT exist today)
SKILL.md from procedural
sections of articles
```

**What validates this gap:**
- GitBook sees it (proposes skill.md as docs overlay) but requires manual authoring
- Sema4.ai partially solves it (KB queries feed runbooks) but is platform-locked
- The 6 agentic KB patterns (New Stack) describe knowledge bases built FOR agents but not knowledge bases that BECOME agent capabilities
- The academic literature (arXiv survey) classifies skills as distinct from knowledge bases but does not discuss conversion between them

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Sema4.ai adoption metrics:** Could not confirm specific adoption numbers or revenue for Sema4.ai's runbooks platform
- **Agent Skills AAIF timeline:** Whether Agent Skills will be transferred to AAIF remains unconfirmed; no public statement found
- **Automated KB-to-skill conversion:** Searched extensively for any system that automatically converts reference articles to executable skills; confirmed this does not exist, but the negative search has inherent limitations

### Out of Scope (per Rubric)

- Per-skill authoring mechanics (covered by `claude-skills-deep-dive` and `ai-skills-authoring-new-developments-2026` reports)
- Distribution/packaging details (covered by `agent-skill-distribution-ecosystem-2026` report)
- Claude Agent SDK internals (covered by `claude-agent-sdk-packaging-distribution` report)

---

## References

### Evidence Files

- [evidence/d1-anthropic-knowledge-signals.md](evidence/d1-anthropic-knowledge-signals.md) -- Anthropic's three-layer knowledge stack and strategic signals
- [evidence/d2-agentskills-governance-adoption.md](evidence/d2-agentskills-governance-adoption.md) -- AAIF governance, adoption metrics, skills.sh relationship
- [evidence/d3-mcp-knowledge-access-protocol.md](evidence/d3-mcp-knowledge-access-protocol.md) -- MCP as universal knowledge access, GitBook auto-MCP, docs-as-MCP patterns
- [evidence/d4-operationalized-knowledge-taxonomy.md](evidence/d4-operationalized-knowledge-taxonomy.md) -- Four-layer taxonomy from passive to active knowledge
- [evidence/d5-operationalized-knowledge-tools-compared.md](evidence/d5-operationalized-knowledge-tools-compared.md) -- Sema4.ai, kepano, Claude skills, agentskills.io comparison
- [evidence/d6-knowledge-agent-convergence.md](evidence/d6-knowledge-agent-convergence.md) -- KB-skill convergence patterns, agent memory tools
- [evidence/d7-anthropic-announcements.md](evidence/d7-anthropic-announcements.md) -- Anthropic's canonical communications on agent knowledge

### External Sources

- [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic: Equipping Agents for the Real World with Agent Skills](https://claude.com/blog/equipping-agents-for-the-real-world-with-agent-skills)
- [Anthropic: Cowork and Plugins Across the Enterprise](https://claude.com/blog/cowork-plugins-across-enterprise)
- [AAIF Formation Announcement](https://aaif.io/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)
- [LlamaIndex: Skills vs MCP Tools](https://www.llamaindex.ai/blog/skills-vs-mcp-tools-for-agents-when-to-use-what)
- [Armin Ronacher: Skills vs Dynamic MCP Loadouts](https://lucumr.pocoo.org/2025/12/13/skills-vs-mcp/)
- [Alex Ewerlof: RAG vs SKILL vs MCP vs RLM](https://blog.alexewerlof.com/p/rag-vs-skill-vs-mcp-vs-rlm)
- [Sema4.ai: Runbooks Are the Future of Work](https://sema4.ai/blog/forget-flowcharts-runbooks-are-future-work/)
- [GitBook: skill.md Explained](https://www.gitbook.com/blog/skill-md)
- [GitBook: Auto MCP Server](https://www.gitbook.com/blog/new-in-gitbook-september-2025)
- [The New Stack: 6 Agentic Knowledge Base Patterns](https://thenewstack.io/agentic-knowledge-base-patterns/)
- [arXiv: Agent Skills for LLMs -- Architecture, Acquisition, Security](https://arxiv.org/html/2602.12430v3)
- [David Cramer: MCP, Skills, and Agents](https://cra.mr/mcp-skills-and-agents/)
- [ValueStreamAI: AI Knowledge Management 2026](https://valuestreamai.com/blog/ai-knowledge-management)
- [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills)
- [agentskills.io Specification](https://agentskills.io/specification)
- [Vercel: Introducing Skills](https://vercel.com/changelog/introducing-skills-the-open-agent-skills-ecosystem)

### Related Research

- [agent-skill-distribution-ecosystem-2026/](../agent-skill-distribution-ecosystem-2026/) -- Comprehensive distribution/packaging landscape
- [claude-agent-sdk-packaging-distribution/](../claude-agent-sdk-packaging-distribution/) -- Claude SDK capability loading mechanics
- [ai-skills-authoring-new-developments-2026/](../ai-skills-authoring-new-developments-2026/) -- Skill Creator 2.0, new frontmatter fields
- [claude-skills-deep-dive/](../claude-skills-deep-dive/) -- Authoritative skills format and philosophy reference
- [obsidian-wiki-ai-agents/](../obsidian-wiki-ai-agents/) -- Obsidian as agent-accessible knowledge base
