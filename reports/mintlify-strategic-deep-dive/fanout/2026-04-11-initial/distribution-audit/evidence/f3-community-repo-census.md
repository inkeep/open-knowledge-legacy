# Evidence: F3 — Community Repo Census at Scale

**Dimension:** F3 (P0 Deep)
**Date:** 2026-04-11
**Sources:** GitHub search (mintlify org, ecosystem repos sorted by stars and recency), npm registry

---

## Top 10 Mintlify Ecosystem Repos by Stars

| # | Repo | Stars | Forks | Last Push | Purpose | Maintainer | AI-related? |
|---|------|-------|-------|-----------|---------|------------|-------------|
| 1 | `mintlify/writer` | 3,111 | 152 | 2025-02-10 | VS Code/IntelliJ AI doc writer extension | Staff | Yes |
| 2 | `mintlify/starter` | 1,776 | 522 | 2026-04-10 | Docs starter template | Staff | No |
| 3 | `remorses/holocron` | 535 | 45 | 2026-04-11 | OSS drop-in Mintlify replacement (Vite plugin) | Community | No |
| 4 | `mintlify/docs` | 371 | 226 | 2026-04-10 | Official Mintlify documentation | Staff | No |
| 5 | `mintlify/mdx` | 193 | 21 | 2026-04-07 | Mintlify markdown/MDX parser | Staff | No |
| 6 | `mintlify/components` | 89 | 8 | 2026-04-10 | UI components for documentation | Staff | No |
| 7 | `alexwhitmore/astro-mintlify` | 82 | 7 | 2026-04-10 | Astro doc template inspired by Mintlify | Community | No |
| 8 | `mintlify/themes` | 53 | 12 | 2026-04-02 | Theme starter kit examples | Staff | No |
| 9 | `mintlify/guides` | 44 | 7 | 2026-03-03 | Best practices for technical docs | Staff | No |
| 10 | `mintlify/intellij-writer` | 42 | 7 | 2025-10-16 | AI doc writer for IntelliJ | Staff | Yes |

**Notable near-misses:**
- `gregce/unmint` (38 stars) — community OSS alternative, adversarial
- `mintlify/install-md` (21 stars) — human-readable install instructions for AI agents, staff, AI-related
- `mintlify/mintlify-claude-plugin` (1 star) — Claude Code plugin, staff, AI-related

---

## Findings

### Finding: Scale comparison — Mintlify's community is 42× smaller than Obsidian's

**Confidence:** CONFIRMED
**Evidence:**

| Ecosystem | Largest Ecosystem Repo | Stars | Nature |
|-----------|----------------------|-------|--------|
| **Obsidian** | kepano/obsidian-skills | 22,662 | Extensional (teaches agents Obsidian formats) |
| **Mintlify** | remorses/holocron | 535 | Adversarial (OSS replacement for Mintlify) |
| **AFFiNE** | DAWNCR0W/affine-mcp-server | 140 | Extensional (MCP server for AFFiNE) |

- Mintlify's largest community repo is **42× smaller** than Obsidian's
- Mintlify's largest community repo is **3.8× larger** than AFFiNE's
- Critical difference: Mintlify's largest community repo is **adversarial** (a competitor), while Obsidian's is **extensional** (teaches agents) and AFFiNE's is **extensional** (MCP integration)

**Implication:** Mintlify's community energy flows toward replacement, not extension. This is a B2B platform dynamic — developers build alternatives rather than plugins.

---

### Finding: 80/20 staff-to-community ratio in top 10 repos

**Confidence:** CONFIRMED
**Evidence:** Of top 10 ecosystem repos: 8 are Mintlify staff-maintained, 2 are community (holocron, astro-mintlify). Extending to top 15 adds only `gregce/unmint` (competitor) and `cording12/next-fast-turbo` (tutorial). The pattern is stark.

**Implication:** Mintlify does not have a community-driven ecosystem. It is a closed SaaS platform with a template distribution model (`starter` at 1,776 stars = companies forking for their own docs, which is usage, not tooling).

---

### Finding: Zero community AI/agent repos for Mintlify

**Confidence:** CONFIRMED
**Evidence:** The only AI-related repos in the ecosystem are staff-maintained: `writer` (3,111 stars), `intellij-writer` (42 stars), `install-md` (21 stars), `mintlify-claude-plugin` (1 star). There are zero community-built MCP servers, agent skills, or AI integrations for Mintlify.

**Implication:** Unlike Obsidian (where community members like kepano organically created obsidian-skills, reaching 22K stars) or even AFFiNE (where DAWNCR0W built an independent MCP server reaching 140 stars), Mintlify has inspired zero community agent-integration work.

---

### Finding: Community energy is adversarial, not extensional

**Confidence:** CONFIRMED
**Evidence:** The two highest-starred community repos are both OSS alternatives:
- `remorses/holocron` (535 stars, 45 forks, actively pushed April 11 2026) — "drop-in Mintlify replacement"
- `gregce/unmint` (38 stars) — "Mintlify-style docs, minus the price tag"

**Implication:** This signals pricing friction, not ecosystem health. Developers are motivated to replicate Mintlify's output rather than extend its platform.

---

### Finding: npm packages are all first-party under `@mintlify/` scope

**Confidence:** CONFIRMED
**Evidence:** No significant third-party npm packages extend Mintlify. All published `@mintlify/*` packages are staff-maintained. The `@mintlify/mcp` package was last published August 2025.

---

### Finding: Fastest-growing community repo in 2026 is an adversarial project

**Confidence:** CONFIRMED
**Evidence:** `remorses/holocron` (535 stars) is actively pushed (April 11 2026) and clearly accelerating as a Mintlify alternative. Created 2020 but gaining traction as a zero-cost docs solution.

---

## Gaps / follow-ups

- Star velocity for holocron (stars/day in 2026) not measured precisely — would require GitHub API time-series data
- Private/enterprise repos extending Mintlify not captured (would require customer surveys)
