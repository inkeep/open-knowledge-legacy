---
name: Pattern selection rationale — pointer to research report
description: Cross-reference to the editor-project-navigator-patterns research that grounded the Obsidian-pattern decision
sources:
  - reports/editor-project-navigator-patterns/REPORT.md
  - reports/editor-project-navigator-patterns/evidence/d3-obsidian.md
date: 2026-04-25
---

# Evidence: Pattern selection rationale

## Pointer

The pattern decision (Obsidian-style Vault Switcher) is grounded in [`reports/editor-project-navigator-patterns/REPORT.md`](../../../reports/editor-project-navigator-patterns/REPORT.md) — a 7-app comparative study of project-navigator patterns across desktop editors and KB apps.

## Why Obsidian (summary)

The research enumerated four patterns:
1. Welcome page (in-editor tab — VSCode, Cursor, Zed)
2. Welcome window (separate OS window — JetBrains)
3. Vault Switcher (modal — Obsidian; in-chrome variant — Logseq)
4. No-navigator (Sublime)

Open Knowledge desktop's existing surface already structurally mirrors **Obsidian's modal Vault Switcher**:

- **Same icon**: `ChevronsUpDown` glyph (Obsidian's vault profile icon)
- **Same position**: bottom of left sidebar
- **Same window relationship**: dedicated separate Navigator BrowserWindow (matches Obsidian's separate switcher window)
- **Same lifecycle**: navigator stays alive when user opens a project (Obsidian's "two windows" behavior — `evidence/d3-obsidian.md` finding "Opening another vault always spawns a new window — no swap-in-place affordance")

The user has chosen this pattern based on the research. The implementation gap is purely the **return-to-navigator affordance** — Obsidian's "Manage Vaults…" entry in the vault profile menu — which OK desktop is missing.

## What this evidence file is NOT

This is a navigation aid pointing to the upstream research. It is not new evidence. The 3P pattern findings live in the research report's evidence directory; do not duplicate them here.
