---
title: Version history UX patterns across products
created: 2026-04-20
sources:
  - VS Code Timeline view
  - Google Docs Version History
  - Notion Page History
  - Figma Version History
  - GitHub file history
  - GitLens VS Code extension
---

# Version history UX patterns

## Universal pattern

Every product that uses a sidebar/panel model keeps the version list visible while viewing a historical version. The user clicks through entries and the main area updates live. No open/close cycle.

## Two dominant models

### Sidebar tab (VS Code, Figma, Notion)

Version list is a tab or section in the existing sidebar. Clicking entries updates the main area. Sidebar stays open.

- **VS Code Timeline:** Bottom of Explorer sidebar (collapsible section). Per-file, auto-follows file focus. Click entry → diff tab opens. Timeline list stays visible. Switch files → timeline updates to new file's history.
- **Figma:** Right sidebar panel replaces design panel. Click through versions, canvas updates.
- **Notion:** Right sidebar panel via `...` menu. Selecting a version replaces page content with read-only snapshot. Dismiss panel to return.

### Dedicated mode (Google Docs, Figma full-screen)

Entering history replaces the entire UI. Version list on right, historical content in center. Explicit exit to return.

## File switch behavior

| Product | On file switch |
|---|---|
| VS Code Timeline | Auto-updates to new file's history. Diff tab remains as separate tab but timeline list switches. |
| Google Docs / Figma | N/A — single-document context. Must exit history mode first. |
| Notion | Switching pages closes the history panel. |
| GitHub | Full page load — history context lost. |

## Key design principles

1. **Version list stays visible while viewing a historical version** — unanimous.
2. **Per-file, not global** — every product scopes history to the active document.
3. **Read-only historical view + explicit restore action** — no editing historical versions in place.
4. **Diff as the default inspection mode** — VS Code, GitHub, GitLens default to showing changes. Google Docs and Notion show snapshots with change highlighting.

## Implication for Open Knowledge

VS Code Timeline is the closest analog: collapsible sidebar section, per-file, click-to-diff, auto-follows file focus. The shadow repo's git history maps naturally to timeline entries. Moving to a DocPanel tab achieves this pattern.
