---
title: "D4: Collaboration & Multiplayer -- Cross-Competitor Evidence"
type: evidence
created: 2026-04-02
parent: openknowledge-competitive-landscape
---

# D4: Collaboration & Multiplayer -- Cross-Competitor Evidence

## Real-Time Collaboration Maturity Spectrum

| Competitor | Real-Time Co-Editing | Architecture | Live Cursors | Simultaneous Editors | Maturity |
|---|---|---|---|---|---|
| Notion | Yes | Proprietary OT/server-reconciled | Yes | Unlimited (practical) | High (years of production) |
| Confluence | Yes (Live Docs: up to 100 viewers; Pages: up to 12 editors) | Proprietary | Yes | 12-100 depending on type | High |
| AFFiNE | Yes | Yjs CRDT (y-octo Rust engine) + Socket.IO + Redis pub/sub | Yes | Supported (team plan coming) | Medium (architecture mature, product features maturing) |
| Outline | Yes | Yjs CRDT + WebSocket + Redis pub/sub | Yes | Supported | Medium-High (5+ years production Y.js) |
| Obsidian | No (core) | N/A (local-first, single-player) | Third-party only (Relay, screen.garden) | N/A | None in core |
| Mintlify | No | Git-based branching (not real-time) | No | N/A (different branches) | None |
| Chroma | No | Multi-tenant isolation (database, not collaboration) | No | N/A | None |

## Version History and Branching

| Competitor | Version History | Branching | Merge/Diff | Pull Request Workflow |
|---|---|---|---|---|
| Notion | Linear (30d Free/Plus, 90d Business, unlimited Enterprise) | None | Visual comparison (no structural diff) | None |
| Confluence | Linear auto-incrementing (v.1, v.2...) | None | Visual diff between any two versions | None |
| Obsidian | Obsidian Sync history or git plugin | Via git plugin only (not core) | Via git (not core) | Via git (not core) |
| Mintlify | Git commit history | Yes (native git branches) | Yes (git diff) | Yes (native git PRs) |
| Outline | Linear per-document | None | None documented | None |
| AFFiNE | CRDT operation log + snapshots (7-30 days depending on plan) | None | CRDT state vector comparison (internal) | None |
| Chroma | Collection forking (copy-on-write for embeddings) | Operational branching only | N/A | N/A |

**Key finding**: No competitor except Mintlify (via git) offers branching, merging, or pull-request workflows for content. This is one of the widest gaps in the landscape. For agent-native collaboration, where an agent drafts on a branch and a human reviews/merges, branching is foundational.

Sources: [Notion Sharing & Permissions](https://www.notion.com/help/sharing-and-permissions), [Confluence Page History](https://confluence.atlassian.com/doc/page-history-and-page-comparison-views-139379.html), [Mintlify Collaborate docs](https://www.mintlify.com/docs/editor/collaborate)

## Permissions Models

| Competitor | Granularity | SSO/SAML | Guest Access | Agent-Specific Permissions |
|---|---|---|---|---|
| Notion | Workspace > Teamspace > Page; 4 levels (Full/Edit/Comment/View) | Enterprise only | 10-250 depending on plan | None (Enterprise MCP controls coming) |
| Confluence | Space > Page; admin/editor/viewer + group-based | Enterprise | External collaborator access | None (agents masquerade as users) |
| Obsidian | None (local filesystem) | N/A | N/A | None (filesystem-level) |
| Mintlify | Basic editor seats; no granular roles documented | Enterprise | N/A | N/A (MCP is read-only) |
| Outline | Workspace > Collection > Document; Admin/ReadWrite/Read + groups | Required (SSO-only, no email/password) | Public sharing via tokens | None |
| AFFiNE | Basic (team features coming) | Enterprise (planned) | Limited | None |
| Chroma | Database-level multi-tenancy (4 levels) + OpenFGA auth | N/A | N/A | N/A |

## The Agent Collaboration Gap

No competitor has built primitives for agent-human co-creation:

1. **No staging area for agent changes**: In Notion, Confluence, and Outline, agent writes via MCP go live immediately. There is no mechanism for "agent drafted changes, human reviews, then publishes."
2. **No conflict resolution between human and agent**: In Obsidian, if the app and an agent write to the same file simultaneously, data loss is possible. No CRDT between app and agent.
3. **No agent presence**: No product shows agent activity alongside human activity (e.g., "Agent is updating section 3").
4. **No agent attribution in content history**: Agent edits are indistinguishable from human edits in version history.

The closest approximation is Mintlify's Workflows, where the Mintlify Agent opens git PRs for human review -- but this is Mintlify's own agent on Mintlify's infrastructure, not an open pattern for external agents.

## Third-Party Collaboration Solutions for Obsidian

Demand for multiplayer Obsidian is validated by third-party solutions:

| Solution | Architecture | Live Cursors | Web Access | Status |
|---|---|---|---|---|
| Relay (relay.md) | CRDT (Yjs), Obsidian plugin | Yes | No (Obsidian required) | Active |
| screen.garden | CRDT, plugin + web | Yes | Yes (browser editor) | Active, $5/user/month |
| Peerdraft (peerdraft.app) | E2E encrypted sessions | Yes | No | Active |

The oldest Obsidian forum feature request for collaborative editing (2020) has 2,200+ votes with no official response or commitment.

Sources: [Obsidian Forum FR](https://forum.obsidian.md/t/obsidian-sync-live-team-collaborative-editing/6058), [relay.md](https://relay.md/), [screen.garden](https://screen.garden/)
