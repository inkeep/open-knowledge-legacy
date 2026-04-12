# Evidence: F4 — Cross-Agent Compatibility + Plugin Marketplace Presence

**Dimension:** F4 (P0 Moderate)
**Date:** 2026-04-11
**Sources:** Claude Code plugin marketplace, VS Code marketplace, Cursor Directory, agentskills.io, github.com/mintlify

---

## Findings

### Finding: Mintlify has a Claude Code plugin (official, 1 star)

**Confidence:** CONFIRMED
**Evidence:** `mintlify/mintlify-claude-plugin` is listed in `anthropics/claude-plugins-official` marketplace.json. Contains one skill (`skills/mintlify/SKILL.md` ~8.7KB) with four reference files (api-docs.md, components.md, configuration.md, navigation.md). Purpose: teach Claude Code how to author Mintlify documentation. 1 GitHub star.

**Contrast:** `kepano/obsidian-skills` has 22,662 stars and 5 skills. Mintlify's plugin is **22,662× smaller** by star count.

---

### Finding: Mintlify has official Cursor integration guidance

**Confidence:** CONFIRMED
**Evidence:** Mintlify publishes [Cursor integration docs](https://www.mintlify.com/docs/guides/cursor) and has a [Cursor Directory listing](https://cursor.directory/c/mintlify). Provides `.mdc` rule files for `.cursor/rules/` and MCP server connection guidance for searching Mintlify docs during authoring.

**Implication:** This is vendor-published, not community-curated. Obsidian's cursor rules come from the community (obsidian-skills ecosystem). Mintlify's come from the company itself.

---

### Finding: VS Code extensions exist but are authoring tools, not agent-skill distribution

**Confidence:** CONFIRMED
**Evidence:**
- **Mintlify Doc Writer** — AI-powered code documentation generator (Python, JS, TS, Java, C#, Ruby)
- **Mintlify MDX** — code snippets for Mintlify components
- Also available on JetBrains Marketplace

These are traditional developer tools. They are not agent-skill distribution mechanisms (not SKILL.md-based, not installable via `npx skills add`).

---

### Finding: No dedicated plugins for Continue.dev, Goose, OpenHands, or Gemini CLI

**Confidence:** CONFIRMED (negative search)
**Evidence:** No Mintlify-specific plugins found for these agent tools. However, because Mintlify sites serve `/.well-known/skills/` and `/.well-known/agent-skills/` discovery endpoints following the agentskills.io spec, any spec-compatible agent can consume auto-generated skills passively.

**Implication:** Cross-agent reach is passive (via open standard), not active (via dedicated plugins).

---

### Finding: Per-site auto-generated skills are passively reachable by 35+ agents

**Confidence:** CONFIRMED
**Evidence:** The agentskills.io spec lists compatibility with 35+ agents: Claude Code, Cursor, GitHub Copilot, VS Code, OpenAI Codex, Gemini CLI, Goose (Block), Roo Code, Mistral Vibe, TRAE (ByteDance), Junie (JetBrains), Kiro (AWS), Windsurf, and others. Every Mintlify customer's docs site auto-generates a skill.md that these agents can discover and install via `npx skills add <docs-url>`.

**Implication:** Mintlify achieves broad cross-agent compatibility not through dedicated plugins but through conforming to the agentskills.io standard. This is the same mechanism Obsidian uses, but with a critical structural difference (see below).

---

### Finding: Fundamentally different distribution architectures — format-level vs content-level

**Confidence:** CONFIRMED
**Evidence:**

| Dimension | Obsidian (obsidian-skills) | Mintlify (auto-generated skill.md) |
|-----------|---------------------------|-----------------------------------|
| **Scope** | Format-level: "How to write Obsidian Markdown" | Content-level: "What THIS product's API does" |
| **Count** | 1 centralized repo, 5 skills | N skills (one per Mintlify customer site) |
| **Maintenance** | Manual curation by kepano | Auto-generated on every deploy |
| **What agents learn** | Universal format literacy (wikilinks, callouts, frontmatter) | Product-specific knowledge (API endpoints, usage patterns) |
| **Distribution** | Plugin marketplace + `npx skills add` + git clone | `npx skills add <url>` + well-known discovery |
| **Star signal** | 22,662 stars on ONE repo | 1 star on the authoring plugin; per-site skills have no star signal |
| **Beneficiary** | Obsidian (all agents learn its format → user lock-in) | Mintlify's customers (each gets an agent-readable skill) |

**Implication:** These are complementary, not competing strategies. Obsidian's approach teaches agents a universal format (one skill to rule them all). Mintlify's approach creates a skills *marketplace* where each customer's docs become an independent agent skill. The per-site model is potentially larger in aggregate surface area (thousands of customer skills) but lacks the viral distribution signal of a single 22K-star repo.

---

## Summary table: Agent-format-distribution reach

| Surface | Obsidian | Mintlify | AFFiNE |
|---------|----------|----------|--------|
| Claude Code plugin | Yes (22,662 stars) | Yes (1 star) | No |
| `npx skills add` | Yes (centralized repo) | Yes (per-site URL) | No |
| Cursor rules | Yes (community) | Yes (vendor-published) | No |
| VS Code extension | No (Obsidian is desktop app) | Yes (Doc Writer, MDX) | No |
| agentskills.io registry | Yes | Yes (per-site auto-listings) | No |
| Community cursor-rules repos | Yes | No | No |
| 35+ agent passive discovery | Yes | Yes (per-site) | No |

---

## Gaps / follow-ups

- Could not verify whether `npx skills add https://mintlify.com/docs` works in practice (requires local npm execution)
- Did not audit quality of auto-generated skill.md vs manually-curated SKILL.md in head-to-head agent performance
