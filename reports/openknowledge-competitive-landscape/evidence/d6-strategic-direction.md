---
title: "D6: Strategic Direction -- Cross-Competitor Evidence"
type: evidence
created: 2026-04-02
parent: openknowledge-competitive-landscape
---

# D6: Strategic Direction -- Cross-Competitor Evidence

## Strategic Positioning Trajectories

| Competitor | Past Position | Current Position (2026) | Direction |
|---|---|---|---|
| Notion | "All-in-one workspace" (2016) | "The AI workspace that works for you" | Agent-captive: deeper walled garden via bundled agents, credits, Mail, Sites |
| Confluence | Enterprise wiki (Jira companion) | Knowledge layer in unified work platform ("Collections") | System-of-work: bundling Jira+Confluence+Loom+Rovo, AI-as-table-stakes |
| Obsidian | "Second brain, for you, forever" | Same position, expanding with Bases and CLI | Deliberate stasis: will not add AI, collab, enterprise, or VC funding |
| Mintlify | "Beautiful docs that convert" (2022) | "The Intelligent Knowledge Platform" / "Infrastructure for the agentic future" | Aggressive AI infrastructure play: Trieve + Helicone acquisitions |
| Outline | "Fast knowledge base for growing teams" | Same, with MCP and AI Answers added | Incremental: bootstrapped, one-person core, no extensibility story |
| AFFiNE | "Open-source Notion+Miro alternative" | "AI knowledge base" pivot (v0.25.0) | Pivoting to "AI-native knowledge base" but execution is LLM-assisted editing, not agent-native |
| Chroma | "The embedding database" (2022) | "Data infrastructure for AI" | Database -> Data Infrastructure -> Agent Infrastructure (retrieval stack, not knowledge platform) |

## Acquisition Signals

### Mintlify
| Date | Target | Strategic Purpose |
|---|---|---|
| July 2025 | Trieve | RAG infrastructure. 50% faster search, 40% better accuracy. 23M+ queries/month. |
| March 2026 | Helicone | LLM observability and AI gateway. 16K organizations. Multi-provider routing. |

Trajectory: Own the retrieval layer + operations layer + content layer = "Cloudflare of AI knowledge."

Source: [Mintlify acquires Trieve](https://www.mintlify.com/blog/mintlify-acquires-trieve-to-improve-rag-search-in-documentation), [Mintlify acquires Helicone](https://www.mintlify.com/blog/mintlify-acquires-helicone)

### Notion
| Year | Target | Strategic Purpose |
|---|---|---|
| 2021 | Automate.io | Integration platform (200+ connectors) |
| 2022 | Cron | Calendar -> Notion Calendar |
| 2022 | Flowdash | Workflow automation |
| 2024 | Skiff | Privacy/encryption, email -> Notion Mail |

Each acquisition deepened the "everything in Notion" strategy.

Source: [SaaStr Notion Analysis](https://www.saastr.com/notion-and-growing-into-your-10b-valuation-a-masterclass-in-patience/)

## Who Is Most Likely to Build What We Are Building?

### Tier 1: Architecturally Capable but Strategically Misaligned

**AFFiNE**: Has CRDT infrastructure, MIT license, BlockSuite as reusable toolkit. Could technically pivot to agent-native. But: CRDT binary (not markdown) is canonical; blog/communications focus on individual AI assistance, not agent co-creation; $18M raised with no new round since Oct 2023.

**Obsidian**: Has markdown+filesystem substrate, developer trust, plugin ecosystem. Could add git-native workflows and agent primitives. But: philosophical commitment to single-player ("for you, forever"), 18-person team, bootstrapped, no roadmap signals.

### Tier 2: Moving Toward AI/Agent but in Wrong Architecture

**Mintlify**: Most vocal about "agent-native" future. Building AI infrastructure stack (Trieve, Helicone). But: read-only MCP, docs-only product surface, closed-source, bundled LLM compute.

**Notion**: Massive AI investment (agents, credits, MCP). But: proprietary format, walled garden, agent-captive strategy. Economically irrational to open up.

**Confluence/Atlassian**: GA MCP server, Rovo agents. But: ADF format lock-in, AI bolted on not native, Jira coupling is the real moat.

### Tier 3: Adjacent / Different Category

**Chroma**: Building retrieval infrastructure for agents, not knowledge management. Category gap, not feature gap.

**Outline**: Shipped MCP, has collaboration. But: ProseMirror JSON canonical (not markdown), no extensibility model, BSL license, one-person core team.

## Structural Barriers to Incumbents Becoming Agent-Native

For Notion:
1. Adopt markdown+git as source of truth -> undermines proprietary block model
2. Remove LLM compute -> kills agent credits revenue
3. Make agents fully external -> cedes AI experience control
4. Add branching/merging -> requires fundamental re-architecture of real-time sync

For Confluence:
1. Replace ADF with agent-friendly format -> multi-year, backwards-incompatible
2. Add git-like version control -> contradicts linear history model
3. Make agents first-class identities -> requires new permission model
4. Adopt BYO-model AI -> contradicts Rovo bundling strategy

For Obsidian:
1. Build real-time collaboration -> local-first architecture barrier
2. Add agent event system -> requires new infrastructure beyond filesystem
3. Build enterprise features -> contradicts "for you, forever" identity
4. Raise capital to fund expansion -> contradicts bootstrapped identity

Sources: [AFFiNE CEO Interview Part 1](https://affine.pro/blog/what-is-affine-interview-with-affine-ceo-1), [Notion 3.0 Release](https://www.notion.com/releases/2025-09-18), [Obsidian About](https://obsidian.md/about)
