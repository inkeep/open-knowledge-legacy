---
title: ED-4 (web onboarding) — current status
sources:
  - stories/init-and-project-switching/STORY.md
  - STORIES.md
  - projects/v0-launch/PROJECT.md
date: 2026-04-13
---

# ED-4 (web onboarding) — current status

## What's claimed

`stories/init-and-project-switching/STORY.md` (top-of-file split notice, 2026-04-12):

> Part A (onboarding) is now owned by `projects/day-0-editor-completeness/PROJECT.md` as story ED-4.

`STORIES.md` line 6:

> Next phase: See `projects/day-0-editor-completeness/PROJECT.md` for the Phase 2 decomposition — day-0 editor gaps (file ops, real-time sidebar, onboarding, graph panels, navigation, polish). Uses ED-prefixed story IDs (ED-1 through ED-7).

## What actually exists

`projects/` contains only `server-bridge-hardening/` and `v0-launch/`. **`projects/day-0-editor-completeness/` does not exist on disk.**

`STORIES.md` and the story split notice both reference ED-4 as if it has a home, but the project file hasn't been created yet. The story content for Part A (web editor onboarding) lives only in `stories/init-and-project-switching/STORY.md` (lines 13-73).

## Implication for this spec

Convergence with ED-4 (invariant I-A3) cannot mean "consume the same code" because ED-4's code doesn't exist yet. It must mean "establish the shared utility ED-4 will later consume."

This actually strengthens our position: the CLI clarity spec becomes the *first consumer* of `previewContent()`; ED-4 inherits a stable surface when it's specced.

The Future Work commitment to ED-4 alignment (R4 in this spec) should explicitly note that `previewContent()` is exported even before the second consumer materializes, so ED-4 doesn't have to invent its own enumeration.

## Risk

If ED-4 ends up requiring richer data (e.g., progressive enumeration with streaming, per-directory grouping for UI tree rendering), the synchronous `previewContent()` API may need extension. Document this as a known evolution point. Cost is low — adding a streaming variant is additive.
