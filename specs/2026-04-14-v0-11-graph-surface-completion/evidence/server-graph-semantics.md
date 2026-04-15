---
title: Server Graph Semantics
description: Current HTTP contracts, orphan/hub semantics, and derived-view invalidation behavior for graph-related endpoints.
created: 2026-04-14
last-updated: 2026-04-14
---

## Findings

### 1. Existing graph HTTP contracts already cover the required data
- **CONFIRMED:** `GET /api/forward-links?docName=...` returns `{ ok, docName, forwardLinks }`.
- **CONFIRMED:** `GET /api/link-graph` returns `{ ok, nodes: [{ id, label }], links }`.
- **CONFIRMED:** `GET /api/orphans` returns `{ ok, orphans: [{ docName, title }] }`.
- **CONFIRMED:** `GET /api/hubs?limit=...` returns `{ ok, hubs: [{ docName, title, count }] }`, defaulting invalid or missing `limit` to `20`.
  - Why it matters: the remaining V0-11 work is mostly UI surface design plus semantic tightening, not new endpoint invention.
  - Sources:
    - `packages/server/src/api-extension.ts`

### 2. Current orphan semantics are inbound-only
- **CONFIRMED:** `BacklinkIndex.getOrphans(allDocs)` filters docs only by the absence of inbound edges (`state.backward.get(docName)` empty or missing).
- **CONFIRMED:** The HTTP/API test expects `alpha` to be an orphan even though `alpha` links to `beta`, which proves outbound-only docs count as orphans today.
  - Why it matters: the user-requested orphan tightening is a real server behavior change, not just UI copy.
  - Sources:
    - `packages/server/src/backlink-index.ts`
    - `packages/server/src/api-backlinks.test.ts`

### 3. Hubs already mean "highest inbound count"
- **CONFIRMED:** `BacklinkIndex.getHubs(limit)` maps inbound edge counts, sorts by `count DESC`, then `docName ASC`, and slices to `limit`.
  - Why it matters: hub semantics do not need a server redesign for v0 unless the product wants a broader list or different ranking.
  - Sources:
    - `packages/server/src/backlink-index.ts`
    - `packages/server/src/api-extension.ts`

### 4. The full graph already contains docs with zero outbound links
- **CONFIRMED:** `getLinkGraph()` adds every key in `state.forward` as a node, even if that doc's forward set is empty.
- **CONFIRMED:** The API test asserts that `gamma` appears in `/api/link-graph` nodes despite having no outbound links.
  - Why it matters: fullscreen full-graph already has the whole project node set available; Orphans/Hubs are list projections over the same project scope.
  - Sources:
    - `packages/server/src/backlink-index.ts`
    - `packages/server/src/api-backlinks.test.ts`

### 5. The current internal graph model merges wiki links and internal markdown links
- **CONFIRMED:** `BacklinkIndex` updates its graph from extracted wiki links plus extracted internal markdown links, then deduplicates them into one forward/backward graph.
  - Why it matters: the requested wording "no inbound and no outbound wiki links" is not equivalent to today's graph model. A wiki-only orphan definition is a scope/contract decision, not a naming tweak.
  - Sources:
    - `packages/server/src/backlink-index.ts`

### 6. Project-level graph surfaces already have push-driven invalidation primitives
- **CONFIRMED:** `live-derived-index.ts` signals both `backlinks` and `graph` after live graph updates.
- **CONFIRMED:** `standalone.ts` and the Vite Hocuspocus plugin signal `backlinks` and `graph` together when graph-related file changes occur.
  - Why it matters: new fullscreen Orphans/Hubs views can reuse the existing graph/backlink invalidation model and do not need a new push channel.
  - Sources:
    - `packages/server/src/live-derived-index.ts`
    - `packages/server/src/standalone.ts`
    - `packages/app/src/server/hocuspocus-plugin.ts`

### 7. Orphans are computed over the admitted file index, not an independent disk walk
- **CONFIRMED:** `/api/orphans` passes `[...getFileIndex().keys()]` into `BacklinkIndex.getOrphans(...)`.
  - Why it matters: project-level Orphans respects the same content-admission boundary as the rest of the app/server and should stay aligned with content filtering.
  - Sources:
    - `packages/server/src/api-extension.ts`

### 8. The public MCP tool description is already semantically specific
- **CONFIRMED:** `get_orphans` is currently described as "Find pages with no incoming wiki-links."
  - Why it matters: changing orphan semantics affects the public MCP contract wording as well as the server calculation and UI copy.
  - Sources:
    - `packages/cli/src/mcp/tools/get-orphans.ts`

### 9. The current hub limit of 20 is inherited from the original graph API/tool contract
- **CONFIRMED:** The original wiki-links/backlinks spec defined `getHubs(n = 20)`, `GET /api/hubs?n=20`, and `get_hubs(... default(20))`.
- **CONFIRMED:** Current implementation preserves that default in both `BacklinkIndex.getHubs(limit = 20)` and the MCP tool description/parameter docs.
- **NOT FOUND:** The later V0-11 project-plan entry does not argue for "20" as a product-facing fullscreen UX choice; it only says Hubs belongs in fullscreen and is ordered by inbound count.
  - Why it matters: `20` looks like an inherited transport/tool default, not a strong product recommendation for the fullscreen UI.
  - Sources:
    - `specs/2026-04-10-wiki-links-backlinks/SPEC.md`
    - `packages/server/src/backlink-index.ts`
    - `packages/cli/src/mcp/tools/get-hubs.ts`
    - `projects/v0-launch/PROJECT.md`

## Open implications
- **INFERRED:** If orphan semantics truly become wiki-syntax-only, the implementation will require more than changing the existing `getOrphans()` filter because the current stored graph does not preserve link syntax as a separate dimension.
  - Confidence ceiling: inference based on the current data model and extraction path.
