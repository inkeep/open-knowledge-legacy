# Audit Findings

## Finding 1: Tab label mismatch — "Forward Links" vs "Outgoing Links"
- **Severity:** MEDIUM
- **Category:** FACTUAL
- **Description:** Spec refers to "Forward Links" throughout. Actual display label is "Outgoing Links" (`DocPanel.tsx:16`).
- **Suggested fix:** Replace "Forward Links" with "Outgoing Links" throughout.

## Finding 2: No E2E tests reference timeline Sheet
- **Severity:** LOW
- **Category:** FACTUAL
- **Description:** Deployment table says "E2E tests referencing timeline Sheet — update selectors." Grep of `packages/app/tests/` for TimelinePanel/timeline/History returns zero matches. No E2E tests exist for timeline.
- **Suggested fix:** Remove vacuous deployment concern. Note coverage gap.

## Finding 3: Proposed useEffect drops editorMode dependency
- **Severity:** LOW
- **Category:** COMPLETENESS
- **Description:** Existing effect has deps `[activeTarget, editorMode]`. Proposed replacement has `[activeDocName]`, dropping `editorMode` without rationale.
- **Suggested fix:** Add rationale note.

## Finding 4: Folder-nav auto-close becomes tab-stays-open
- **Severity:** LOW
- **Category:** COMPLETENESS
- **Description:** Existing `setTimelineOpen(false)` on folder nav disappears. Tab stays visible but shows empty/different state.
- **Suggested fix:** Document the behavior change.

## Finding 5: panelRef for expand() is internal to EditorArea
- **Severity:** LOW
- **Category:** COMPLETENESS
- **Description:** FR-5 requires History button to expand panel, but `panelRef` is internal to EditorArea.
- **Suggested fix:** Note EditorArea can auto-expand when `activeTab` changes to `'timeline'` while collapsed.

## Finding 6: Mobile Sheet widths differ from desktop min-width
- **Severity:** LOW
- **Category:** COMPLETENESS
- **Description:** FR-7 says "~300px" but mobile Sheet is w-80/w-96 (320px/384px).
- **Suggested fix:** Clarify both constraints.

## Finding 7: formatRelativeTime/displayAuthor exports not in refactor plan
- **Severity:** MEDIUM
- **Category:** COMPLETENESS
- **Description:** EditorPane imports `displayAuthor` and `formatRelativeTime` from TimelinePanel for the diff-mode banner. FR-4 refactor must preserve these exports.
- **Suggested fix:** Add to refactor section.

## Finding 8: WIP grouping description accurate
- **Severity:** LOW
- **Category:** FACTUAL
- **Suggested fix:** No action needed.

## Finding 9: Data flow diagram contradicts option (a)
- **Severity:** MEDIUM
- **Category:** COHERENCE
- **Description:** Diagram shows EditorPane calling `setActiveTab('timeline')`, but option (a) lifts activeTab to EditorArea. EditorPane can't directly set it.
- **Suggested fix:** Update diagram to show callback flowing through EditorPane to EditorArea.
