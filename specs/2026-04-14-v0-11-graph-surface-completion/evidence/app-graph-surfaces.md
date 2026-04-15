---
title: App Graph Surfaces
description: Current app-side information architecture for docked graph panels and fullscreen graph exploration.
created: 2026-04-14
last-updated: 2026-04-14
---

## Findings

### 1. Docked doc-level graph surfaces already exist
- **CONFIRMED:** `DocPanel` exposes four tabs: `outline`, `backlinks`, `forward-links`, and `graph`.
  - Why it matters: `Outgoing Links` and `Graph` are already distinct docked surfaces, so the user request is about preserving an existing local-vs-project split rather than inventing one.
  - Sources:
    - `packages/app/src/components/DocPanel.tsx`

### 2. `Outgoing Links` is already a doc-scoped docked panel
- **CONFIRMED:** `ForwardLinksPanel` fetches `GET /api/forward-links?docName=...` and renders the targets for the active document only.
  - Why it matters: "keep Forward links as the docked doc-level panel" matches shipped behavior and should not require an information-architecture migration.
  - Sources:
    - `packages/app/src/components/ForwardLinksPanel.tsx`

### 3. Fullscreen graph is a mode of `GraphPanel`, not a separate route
- **CONFIRMED:** `GraphPanel` toggles the browser Fullscreen API on its own panel element and tracks `isFullscreen` from `fullscreenchange`.
  - Why it matters: the existing "fullscreen / full-graph" experience is an extension point inside the current graph panel, not a route/page-level surface.
  - Sources:
    - `packages/app/src/components/GraphPanel.tsx`

### 4. Fullscreen graph already means "whole project graph"
- **CONFIRMED:** `GraphView` calls `buildVisibleGraphData(rawGraphData, activeDocName, isFullscreen ? Number.POSITIVE_INFINITY : 2)`.
  - Why it matters: docked graph = local neighborhood; fullscreen graph = full graph. This matches the requested doc-level vs project-level split.
  - Sources:
    - `packages/app/src/components/GraphView.tsx`
    - `packages/app/src/components/graph-view-utils.ts`
    - `packages/app/src/components/graph-view-utils.test.ts`

### 5. The app has no current UI consumer for `/api/orphans` or `/api/hubs`
- **CONFIRMED:** Searches in `packages/app/src` found no references to `/api/orphans` or `/api/hubs`.
  - Why it matters: Orphans/Hubs are new app surfaces, not rewrites of existing UI.
  - Sources:
    - `rg "/api/orphans|/api/hubs" packages/app/src`

### 6. Client refresh plumbing already exists for graph-related surfaces
- **CONFIRMED:** `GraphView` reloads on derived-view channels `files` or `graph`.
- **CONFIRMED:** `SystemDocSubscriber` invalidates React Query keys `['backlinks']` and `['forward-links']` when derived-view channels include `files` or `backlinks`.
  - Why it matters: fullscreen Orphans/Hubs can reuse the current push + re-fetch model rather than introducing polling-only behavior.
  - Sources:
    - `packages/app/src/components/GraphView.tsx`
    - `packages/app/src/components/SystemDocSubscriber.tsx`
    - `packages/app/src/lib/documents-events.ts`

### 7. Panel styling and interaction patterns are already standardized
- **CONFIRMED:** `Panel`, `PanelHeader`, `PanelTitle`, `PanelCount`, `PanelBody`, `PanelEmpty`, and `PanelError` provide the established visual language for docked panels.
- **CONFIRMED:** Outline, Backlinks, and Forward Links reuse those primitives with consistent loading, empty, and click-navigation behavior.
  - Why it matters: fullscreen Orphans/Hubs should reuse these patterns where possible instead of inventing a new list aesthetic.
  - Sources:
    - `packages/app/src/components/ui/panel.tsx`
    - `packages/app/src/components/OutlinePanel.tsx`
    - `packages/app/src/components/BacklinksPanel.tsx`
    - `packages/app/src/components/ForwardLinksPanel.tsx`

## Open implications
- **INFERRED:** The most natural v0 implementation shape is to extend fullscreen `GraphPanel` with project-level modes (for example `Explore`, `Orphans`, `Hubs`) rather than creating a second fullscreen shell.
  - Confidence ceiling: this is a design inference grounded in the current app architecture, not a shipped behavior.
