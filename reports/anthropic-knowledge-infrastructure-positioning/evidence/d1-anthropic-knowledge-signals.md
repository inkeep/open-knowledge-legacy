# Evidence: Anthropic's Knowledge Infrastructure Signals

**Dimension:** D1 — Anthropic's knowledge infrastructure signals
**Date:** 2026-04-02
**Sources:** anthropic.com, claude.com, code.claude.com, GitHub repos, SiliconANGLE, VentureBeat, The New Stack

---

## Key Sources Referenced

- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents — Context engineering blog
- https://claude.com/blog/equipping-agents-for-the-real-world-with-agent-skills — Agent Skills positioning
- https://claude.com/blog/cowork-plugins-across-enterprise — Cowork enterprise plugins
- https://claude.com/product/cowork — Cowork product page
- https://code.claude.com/docs/en/best-practices — Claude Code best practices
- https://github.com/anthropics/skills — Official skills repo (109K stars as of March 2026)
- https://github.com/anthropics/knowledge-work-plugins — Knowledge work plugins repo

---

## Findings

### Finding: CLAUDE.md is positioned as foundational context, not an evolving knowledge standard
**Confidence:** CONFIRMED
**Evidence:** Anthropic context engineering blog (2025)

Anthropic describes CLAUDE.md as files "naively dropped into context up front" serving as foundational orientation. No signal that CLAUDE.md is evolving toward a cross-platform knowledge standard — it remains Claude Code-specific project context. AGENTS.md, by contrast, was donated to AAIF and is adopted by 60,000+ open-source projects.

**Implications:** CLAUDE.md = local project context; AGENTS.md = cross-platform agent configuration; SKILL.md = cross-platform procedural knowledge. Anthropic is NOT building CLAUDE.md into a knowledge standard — they're building skills into one.

### Finding: Anthropic frames skills as "procedural knowledge packages" — explicitly the knowledge play
**Confidence:** CONFIRMED
**Evidence:** claude.com/blog/equipping-agents-for-the-real-world-with-agent-skills

Anthropic positions Agent Skills as "modular expertise packages" equivalent to "an onboarding guide for a new hire." The framing is explicitly knowledge-centric: "real work requires procedural knowledge and organizational context." They describe skills as "decentralized, composable knowledge management" — the exact language of a knowledge platform play.

### Finding: Claude Cowork's knowledge model is plugin-centric with three components
**Confidence:** CONFIRMED
**Evidence:** claude.com/blog/cowork-plugins-across-enterprise, support.claude.com

Cowork plugins bundle three components:
1. Skills (task-specific capabilities)
2. Connectors (MCP integrations to enterprise tools)
3. Agents (orchestration logic)

Cowork launched with 11 knowledge work categories: HR, Design, Engineering, Operations, Brand Voice, Financial Analysis, Investment Banking, Equity Research, Private Equity, Wealth Management. Admin control via "Customize" menu, private marketplaces, per-user provisioning.

### Finding: Anthropic advocates "intelligent retrieval over bulk storage" for agent knowledge
**Confidence:** CONFIRMED
**Evidence:** Anthropic context engineering blog

The hybrid model: CLAUDE.md provides lightweight orientation, skills inject procedural knowledge on demand, MCP provides connectivity. A newly released "memory tool" enables agents to "build up knowledge bases over time" outside the context window. This is a three-layer knowledge stack: context files (orientation) → skills (procedures) → MCP (connectivity + retrieval).

---

## Gaps / Follow-ups

- No Anthropic blog post or announcement specifically about "knowledge management for agents" as a topic — the knowledge framing is embedded in skills/context engineering content
- Claude Cowork's memory persistence model (beyond projects) is unclear
