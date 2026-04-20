---
title: Demo Capability Baseline
description: Current product and MCP-surface findings relevant to the graph-demo iteration loop.
created: 2026-04-16
last-updated: 2026-04-16
---

# Demo Capability Baseline

## Finding 1 — Current MCP surface (21 tools) is sufficient for a stage-0 graph-bloom demo
**Confidence:** CONFIRMED

The current MCP registry includes 21 tools spanning read, write, graph intelligence, and version control:

**Read/navigation:**
- `exec` — Read-only bash (allowlisted commands) with enriched metadata (frontmatter, backlink/forward-link counts, shadow-repo activity)
- `read_document` — File contents + frontmatter + shadow-repo history + backlinks + forward links
- `search` — Grep with per-file metadata enrichment
- `list_documents` — File index listing

**Corpus building:**
- `init-content`, `ingest`, `research`, `consolidate` — Workflow tools that return instructional text

**Live editing:**
- `write_document` — CRDT write (append/prepend/replace)
- `edit_document` — Targeted find/replace with optional offset
- `rename_document` — Managed rename with inbound link rewriting

**Graph intelligence:**
- `get_backlinks` — Pages linking TO a given page (source, anchor, title, snippet)
- `get_forward_links` — Pages a given page links TO (doc + external kinds)
- `get_orphans` — Disconnected pages (incoming/outgoing/both modes)
- `get_hubs` — Most-linked pages by inbound count (configurable limit)
- `suggest_links` — Missing link candidates with precise offsets (500ms time budget)
- `get_dead_links` — Broken internal link targets (optional source filter)

**Version control:**
- `get_history` — Shadow-repo timeline entries
- `save_version` — Snapshot all documents to shadow repo
- `rollback_to_version` — Restore to historical version

**Preview/other:**
- `get_preview_url` — Browser URL for a doc (required before write/edit)

**Primary sources:**
- `packages/cli/src/mcp/tools/index.ts`
- `packages/cli/src/mcp/server.ts`

## Finding 2 — The app supports fullscreen graph modes with orphan/hub views
**Confidence:** CONFIRMED

`GraphPanel` supports fullscreen modes: `explore` (force graph), `orphans` (disconnected pages with incoming/outgoing/both sub-modes), `hubs` (top linked pages by inbound count, limit 50 in fullscreen). A `ToggleGroup` in the panel header switches between them. Orphans and hubs are fullscreen-only.

**Primary sources:**
- `packages/app/src/components/GraphPanel.tsx`

## Finding 3 — `/api/link-graph` returns structural data only, no frontmatter metadata
**Confidence:** CONFIRMED

Response shape:
```ts
{
  ok: true,
  nodes: Array<
    | { id: string; kind: 'doc'; docName: string; anchor: string | null; label: string }
    | { id: string; kind: 'external'; url: string; label: string }
  >,
  links: Array<{ source: string; target: string }>
}
```

No `cluster`, `category`, `tags`, `status`, `lastEditedBy`, or `colorSeed` fields. Labels are resolved via `readPageTitleForDocName()` (reads frontmatter title from disk per call).

Supports optional `docName` + `degrees` params for neighborhood subgraph.

**Primary sources:**
- `packages/server/src/api-extension.ts` (handleLinkGraph, lines ~1282-1341)

## Finding 4 — Graph rendering uses fixed color constants, no metadata encoding
**Confidence:** CONFIRMED

`GraphView.tsx` uses `react-force-graph-2d` (Canvas 2D). All doc nodes are the same gray, active node is blue, external nodes are amber. No metadata-driven coloring.

Labels appear only at `globalScale >= 1.8`. Max labels: 10 fullscreen, 18 docked. Label placement uses collision-free layout via `planGraphLabels()`.

Node sizing: active = 8px radius (nodeVal=18), other = 5px (nodeVal=6).

**Primary sources:**
- `packages/app/src/components/GraphView.tsx`

## Finding 5 — Phase-unlocking MCP tools are absent
**Confidence:** CONFIRMED

Not in the current MCP registry:
- `get_link_graph` — agent-accessible graph topology query
- `update_frontmatter` — targeted frontmatter field mutation
- `bulk_update_frontmatter` — batch frontmatter mutation
- `apply_graph_plan` — declarative doc/link/frontmatter creation
- `apply_suggested_links` / `autolink_document` — auto-link application

**Primary sources:**
- `packages/cli/src/mcp/tools/index.ts`

## Finding 6 — Agent identity flows through write/edit paths
**Confidence:** CONFIRMED

MCP write/edit tools forward: `agentId`, `agentName`, `clientName`, `colorSeed`. Foundation for future graph attribution.

**Primary sources:**
- `packages/cli/src/mcp/tools/write-document.ts`
- `packages/cli/src/mcp/tools/edit-document.ts`

## Finding 7 — `demo.md` exists and contains a well-structured demo plan
**Confidence:** CONFIRMED

`demo.md` (repo root) contains:
- Narrative insight: "The best demo is not 'agent writes docs.' It is a living knowledge garden forming itself in real time."
- A single-agent hero prompt (5 clusters, 4-6 spokes each, ~25-30 docs)
- A 4-agent parallel script (Architect, Cluster Builder A, Cluster Builder B, Gardener)
- Recording sequence and social-media positioning
- Feature priority list matching the spec's phase ordering

**Primary sources:**
- `demo.md` (repo root)

## Finding 8 — The existing repo is itself a large graph-ready corpus
**Confidence:** CONFIRMED

The `.open-knowledge/config.yml` uses defaults: `content.dir: .`, `content.include: ["**/*.md"]`. This means every `.md` file in the repo (specs, reports, evidence, changelogs, CLAUDE.md) is a document. The repo contains 1500+ markdown files with existing wiki-links, frontmatter, and natural graph structure.

This provides a "real corpus" option for demos: point Open Knowledge at this repo and show the graph of actual project documentation without creating anything synthetic.

**Primary sources:**
- `.open-knowledge/config.yml`
- `.mcp.json`

## Finding 9 — Frontmatter mutation is partially achievable today via edit_document
**Confidence:** CONFIRMED (with caveats)

`edit_document` with targeted find/replace can modify frontmatter YAML (e.g., `find: "category: old"`, `replace: "category: new"`). This works but is fragile:
- Requires knowing the exact current value
- YAML formatting differences can break the find
- No atomic merge semantics (can't add a field without knowing the full frontmatter block)

A dedicated `update_frontmatter` tool would be more robust: parse YAML, merge fields, write back. But basic retagging demos are partially achievable without it.

**Primary sources:**
- `packages/cli/src/mcp/tools/edit-document.ts`

## Finding 10 — suggest_links returns precise offsets usable by edit_document
**Confidence:** CONFIRMED

`suggest_links` returns `{ target: { docName, title, aliases }, mentions: [{ source, excerpt, offset }] }`. The `offset` is a precise JavaScript string offset into the source doc's markdown, designed to be consumed by `edit_document`'s `offset` parameter. This means an agent can discover missing links AND apply them today — it just requires multiple tool calls rather than a single `apply_suggested_links`.

**Primary sources:**
- `packages/server/src/suggest-links.ts`
- `packages/cli/src/mcp/tools/edit-document.ts`
