---
title: "D3: Storage & Format Model -- Cross-Competitor Evidence"
type: evidence
created: 2026-04-02
parent: openknowledge-competitive-landscape
---

# D3: Storage & Format Model -- Cross-Competitor Evidence

## The Canonical Format Spectrum

Competitors arrange on a spectrum from fully proprietary to fully open:

```
Proprietary                                                    Open
|--- Notion Blocks ---|--- ADF ---|--- CRDT Binary ---|--- ProseMirror JSON ---|--- MDX ---|--- Markdown ---|
     (Notion)          (Confluence)  (AFFiNE)           (Outline)               (Mintlify)   (Obsidian)
```

### Format Details

| Competitor | Canonical Format | Human-Readable? | Agent-Readable? | Git-Compatible? | Round-Trip Fidelity |
|---|---|---|---|---|---|
| Notion | Proprietary blocks (UUID + type + properties) | No (JSON via API only) | Via API with Notion-flavored Markdown translation | No | Lossy (databases -> CSV, colors/synced blocks dropped) |
| Confluence | ADF (~26 block types, ~8 child types, ~8 inline types, 9 marks) | No (~40x more complex than markdown) | Via MCP with markdown conversion (lossy both directions) | No | Lossy (macros, panels, extensions have no markdown equivalent) |
| Obsidian | Plain markdown files (.md) + JSON Canvas (.canvas) + JSON Bases (.base) | Yes | Yes (direct file read/write) | Yes (vaults are directories) | Near-perfect (Obsidian-specific syntax is soft lock-in: wikilinks, callouts) |
| Mintlify | MDX (Markdown + JSX) in Git repos | Yes | Via MCP (read-only) or git | Yes (native git workflow) | High for standard markdown; moderate for Mintlify-specific components |
| Outline | ProseMirror JSON (JSONB column in PostgreSQL) | No (requires decoder) | Via API/MCP with markdown conversion | No (DIY webhook-driven git sync) | Lossy -- maintainer acknowledges markdown export cannot represent all editor features |
| AFFiNE | Yjs binary CRDT (Y.Doc) | No (opaque binary) | Via GraphQL API with markdown serialization | No | Lossy -- Adapter pattern explicitly warns of data loss during conversion |
| Chroma | Embedding vectors + raw text strings | No (programmatic only) | Via SDK/MCP (CRUD) | One-way ingestion from git (Sync) | N/A (embeddings are lossy by nature) |

### Portability Winners and Losers

**Most Portable**: Obsidian (plain .md files, any tool can read/write) > Mintlify (MDX in git, standard with component extensions) > Outline (markdown export available, acknowledged lossy)

**Least Portable**: Notion (proprietary blocks, lossy export, no self-hosted) = Confluence (ADF, no native markdown export, Pandoc support still pending) = AFFiNE (CRDT binary, requires AFFiNE-specific tooling)

Sources: [Notion Data Model](https://www.notion.com/blog/data-model-behind-notion), [ADF Specification](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/), [Pandoc ADF issue #9898](https://github.com/jgm/pandoc/issues/9898), [BlockSuite Transformer and Adapter docs](https://docs.affine.pro/blocksuite-wip/store/transformer-and-adapter), [Outline Discussion #7396](https://github.com/outline/outline/discussions/7396)

## Git Integration Status

| Competitor | Git Integration | Direction | Native? |
|---|---|---|---|
| Notion | None | N/A | No |
| Confluence | None (Atlassian has its own Bitbucket but no Confluence-to-git sync) | N/A | No |
| Obsidian | Obsidian Git plugin (community) | Bidirectional (commit/push/pull) | No (plugin, not core) |
| Mintlify | GitHub App integration | Bidirectional (git is the source of truth) | Yes |
| Outline | None native; maintainer suggests webhook-driven sync | One-way (export to git) | No |
| AFFiNE | None | N/A | No |
| Chroma | Chroma Sync (reads from GitHub repos) | One-way (ingest from git) | No (ingestion only) |

**Key finding**: Only Mintlify treats git as the source of truth. Obsidian is git-compatible (vaults are directories) but not git-native (no built-in git workflow). All others require lossy conversion or have no git story at all.

## API Rate Limits Affecting Agent Workflows

| Competitor | Rate Limit | Impact on Agent Workloads |
|---|---|---|
| Notion | 3 req/s per integration | Among the tightest in SaaS. Heavy agent workflows impractical. |
| Confluence | Standard API limits (undisclosed specific rate) | Managed via Atlassian's infrastructure |
| Mintlify MCP | 5K req/hr/user, 10K req/hr/site | Generous for read-only consumption |
| Obsidian | Filesystem speed (no API rate limit) | Unlimited -- direct file I/O |
| Outline | Standard API limits | Not documented as a specific constraint |
| AFFiNE | Standard API limits | Not documented as a specific constraint |
| Chroma | Usage-based pricing (query cost: $0.0075/TiB) | Economic limit rather than rate limit |

Sources: [Notion API Rate Limits](https://developers.notion.com/reference/request-limits), [Mintlify MCP docs](https://www.mintlify.com/docs/ai/model-context-protocol)

## Agent Interaction Constraints by Format

**Notion**: 2-level nesting limit in API, 2,000 char/block, 1,000 blocks or 500KB per request. Reconstructing a full page requires recursive API calls with pagination at every level.

**Confluence**: MCP tools accept/return Markdown (not ADF). Atlassian performs conversion server-side -- pragmatic admission that ADF is unusable for agents. Full-page read/write only; no node-level ADF manipulation via MCP.

**AFFiNE**: Agents interact via GraphQL API, not directly with the CRDT layer. Content serialized to markdown for reading, deserialized back for writing. Structural information lost in round-trip. The architecture could support direct CRDT manipulation (agents as Yjs peers) but this path is unexploited.

Sources: [Notion Enhanced Markdown API](https://developers.notion.com/guides/data-apis/working-with-markdown-content), [Rovo MCP Supported Tools](https://support.atlassian.com/atlassian-rovo-mcp-server/docs/supported-tools/), [AFFiNE GitHub Issue #13262](https://github.com/toeverything/AFFiNE/issues/13262)
