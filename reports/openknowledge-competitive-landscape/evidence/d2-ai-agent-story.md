---
title: "D2: AI / Agent Story -- Cross-Competitor Evidence"
type: evidence
created: 2026-04-02
parent: openknowledge-competitive-landscape
---

# D2: AI / Agent Story -- Cross-Competitor Evidence

## MCP Server Comparison

| Competitor | MCP Server | Type | Auth | Tools | Read/Write | Agent Identity |
|---|---|---|---|---|---|---|
| Notion | Official hosted + OSS local (4.2K stars) | First-party | OAuth 2.0 | 22 (CRUD, search, comments) | Read + Write | No (OAuth user) |
| Confluence | Official (Apache-2.0, GA) | First-party | OAuth 2.1 | 11 (page CRUD, search, comments) | Read + Write | No (masquerades as user) |
| Obsidian | Community only (12+ servers) | Third-party | None (filesystem) | Varies (file CRUD, search, tags) | Read + Write | No (filesystem writes) |
| Mintlify | Auto-generated per docs site | First-party | OAuth (private docs) | 2 (Search, Get Page) | Read ONLY | N/A |
| Outline | First-party (shipped Feb 2026) | First-party | API key | ~5 (search, CRUD, comments) | Read + Write | No (API key owner) |
| AFFiNE | Community (76-tool server) + native MCP config | Mixed | PAT | 76 (full GraphQL surface) | Read + Write | No |
| Chroma | Official (chroma-core/chroma-mcp) | First-party | Various | 12 (collection + doc CRUD) | Read + Write | N/A (database) |

Sources: [Notion MCP Blog](https://www.notion.com/blog/notions-hosted-mcp-server-an-inside-look), [Notion MCP GitHub](https://github.com/makenotion/notion-mcp-server), [Atlassian MCP GitHub](https://github.com/atlassian/atlassian-mcp-server), [Mintlify MCP Docs](https://www.mintlify.com/docs/ai/model-context-protocol), [Outline MCP Changelog](https://www.getoutline.com/changelog/mcp), [AFFiNE MCP Server](https://github.com/DAWNCR0W/affine-mcp-server), [Chroma MCP GitHub](https://github.com/chroma-core/chroma-mcp)

## AI Architecture Patterns

### Pattern 1: Bundled LLM Compute (Walled Garden)
**Notion, Confluence/Rovo, AFFiNE, Outline, Mintlify**

All five embed LLM compute in the product. The user pays the vendor for AI features, and the vendor routes to underlying model providers.

- Notion: GPT-5.2, Claude Opus 4.5, Gemini 3 via agent credits ($10/1K credits)
- Confluence/Rovo: Bundled free with all paid plans (was $20-24/user/month, reversed due to adoption struggles)
- AFFiNE: OpenAI GPT, Claude Sonnet 4.5, Gemini 2.5 Pro (cloud); BYOK for self-hosted
- Outline: OpenAI gpt-4o-mini + text-embedding-ada-002 (AI Answers feature)
- Mintlify: Claude Sonnet 4.5 for AI Assistant, proprietary for Workflows agent

Sources: [Notion 3.3 Release](https://www.notion.com/releases/2026-02-24), [TechTarget on Rovo pricing](https://www.techtarget.com/searchitoperations/news/366622263/Atlassian-Rovo-pricing-shifts-amid-AI-adoption-struggles), [Outline OpenAI docs](https://docs.getoutline.com/s/hosting/doc/openai-iiTYCN9Nct), [AFFiNE AI Docs](https://docs.affine.pro/self-host-affine/administer/ai)

### Pattern 2: External Agents via Filesystem (No AI in Product)
**Obsidian**

Zero AI features in core product. CEO strategy: teach agents Obsidian's formats via obsidian-skills (19K stars) rather than embed AI. Agents interact at filesystem level. Community provides 86 catalogued AI plugins.

Source: [obsidian-skills GitHub](https://github.com/kepano/obsidian-skills)

### Pattern 3: Retrieval Infrastructure (Machine-Facing Only)
**Chroma**

AI-optimized retrieval stack. Context-1 (20B parameter retrieval model), Package Search MCP. No human-facing AI features. Separates retrieval from generation.

Source: [Context-1 Research](https://www.trychroma.com/research/context-1)

## Critical Finding: No Competitor Has Agent Co-Creation

Across all seven primary competitors, no product supports agents as first-class knowledge co-creators:

1. **No agent identity**: In every product with MCP write access, agent edits appear as the authenticated user. No attribution, no audit trail distinguishing human from agent contributions.
2. **No review workflows for agent content**: No product offers a "staging area" where agent-generated changes can be reviewed before going live. Notion, Confluence, and Outline all apply agent writes immediately.
3. **No event subscription for agents**: No product allows agents to subscribe to content change events and react (e.g., auto-update related pages when a dependency changes). Obsidian's filesystem is closest but has no event system.
4. **No agent permissions model**: All MCP servers grant agents the same permissions as the authenticated user. No scoped agent access (read-only on some collections, write on others).
5. **Mintlify's MCP is read-only**: The most vocal "agent-native" company ships only Search and Get Page tools. Agents cannot write.

## Mintlify's "Read-Only Agent" Pattern

Mintlify auto-generates three agent-readable surfaces for every docs site (including free tier):
- MCP Server at `/mcp` (Search + Get Page tools)
- llms.txt at `/llms.txt` (page index) and `/llms-full.txt` (full content)
- skill.md at `/.well-known/skills/default/skill.md` (machine-readable usage guide)

This is the strongest agent-consumption surface in the landscape, but it is strictly one-directional. Only Mintlify's own internal agent (Workflows) can write, and it runs on Mintlify's LLM compute in sandboxed Daytona environments.

Sources: [Mintlify llms.txt docs](https://www.mintlify.com/docs/ai/llmstxt), [Mintlify skill.md blog](https://www.mintlify.com/blog/skill-md), [Mintlify Autopilot blog](https://www.mintlify.com/blog/autopilot)

## Rovo Pricing Reversal as Market Signal

Atlassian's reversal of Rovo pricing (from $20-24/user/month to bundled-free with paid plans, April 2025) is a significant market signal. It indicates AI features struggled to reach adoption at premium pricing, and Atlassian chose distribution over direct monetization. This suggests AI-as-add-on pricing may not be sustainable -- relevant for any competitor considering AI pricing models.

Source: [TechTarget](https://www.techtarget.com/searchitoperations/news/366622263/Atlassian-Rovo-pricing-shifts-amid-AI-adoption-struggles)
