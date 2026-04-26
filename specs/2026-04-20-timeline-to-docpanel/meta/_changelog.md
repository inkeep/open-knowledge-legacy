# Changelog

## 2026-04-20 — Audit + design challenge pass

- Ran independent auditor and design challenger against the spec
- **Audit corrections applied (9 findings, 0 HIGH):**
  - Fixed "Forward Links" → "Outgoing Links" label throughout (MEDIUM, factual)
  - Removed vacuous E2E deployment concern — grep confirmed no tests reference timeline (LOW, factual)
  - Added rationale for dropping `editorMode` from useEffect deps (LOW, completeness)
  - Documented folder-nav auto-close behavior change (LOW, completeness)
  - Noted panelRef expand handled internally by EditorArea (LOW, completeness → rolled into D5)
  - Added `formatRelativeTime`/`displayAuthor` export preservation note to refactor section (MEDIUM, completeness)
  - Fixed data flow diagram to match option (a) — EditorArea owns activeTab + panelRef (MEDIUM, coherence)
- **Design challenge outcomes (5 challenges, all hold):**
  - Tab crowding: 5 icon tabs at \~184px within 300px min — no issue
  - Prop threading: holds; named `EditorPaneContext` as escape hatch if count crosses 10
  - Controlled vs uncontrolled: D2 DIRECTED is correct; implementer picks approach
  - Simultaneous views: tradeoff made explicit → added D7
  - Diff mode lifecycle: promoted FR-8 from Could to Should; added D6 documenting diff persistence across tab switches

## 2026-04-20 — Initial draft

- Scaffolded SPEC.md from user's problem statement + discussion
- Investigated current codebase: TimelinePanel.tsx, DocPanel.tsx, EditorPane.tsx, EditorArea.tsx
- Confirmed bug: stale diff on file switch (EditorPane.tsx:101 only clears on folder nav)
- Confirmed versioning is per-file (history API scoped to `?docName=`)
- Researched UX patterns across VS Code, Google Docs, Notion, Figma, GitHub, GitLens
- Key decision: Timeline as DocPanel tab (D1 LOCKED), project-level activity is separate surface (D4 LOCKED)
- User input: future project-level activity view should be a separate surface
- Evidence files: ux-research.md, current-state-analysis.md

## 2026-04-26 — E2E coverage + status finalization

- Added `packages/app/tests/stress/timeline-docpanel.e2e.ts` — three Playwright cases covering FR-3 (file switch exits diff + Timeline refetches), D6 (diff persists across DocPanel tab switches), and FR-8 (Current version row exits diff). Closes §13 next-actions item 7 (the only outstanding deliverable post-PR-#304).
- Mocks `/api/history?docName=` and `/api/history/<sha>?docName=` via `page.route()` because the per-worker dev fixture in `_helpers/fixtures.ts` runs `gitEnabled: false` (`hocuspocus-plugin.ts:91`). Same isolation precedent that `agent-activity-panel.e2e.ts` documents in its AC-P8 carve-out.
- Updated [[timeline|user-facing Timeline guide]] to describe the DocPanel-tab access path (no more clock icon in the editor header — D5 LOCKED).
- Aligned [[collaboration-recovery]] wording to "Timeline tab in the document panel" matching the [[agent-activity-panel|Agent Activity Panel]] guide grain.
- Marked **Status: Final** (was: Draft) and bumped Last updated.
