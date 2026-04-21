# Timeline in DocPanel — Spec

**Status:** Draft
**Owner(s):** sarah
**Last updated:** 2026-04-20
**Baseline commit:** 757d9fb3
**Links:**
- Evidence: [./evidence/](./evidence/)

---

## 1) Problem statement

**Situation:** The document timeline (version history) currently lives in a standalone right-side Sheet overlay (`TimelinePanel.tsx`), separate from the DocPanel sidebar which contains Outline, Backlinks, Outgoing Links, and Graph tabs. Versioning is per-file — the history API is scoped to `?docName=`. The editor has three modes: wysiwyg, source, and diff. Selecting a timeline entry puts the editor into diff mode.

**Complication:** Two UX friction points make version navigation painful:

1. **Open/close cycling.** The Sheet overlay covers the editor content. To compare versions, users must: open Sheet → click entry → close Sheet to see the diff → reopen Sheet to try another version → repeat. The version list disappears every time you want to look at what it's showing you. Every competing product (VS Code Timeline, Figma, Notion, Google Docs) keeps the version list visible while viewing a historical version.

2. **Stale diff on file switch.** When navigating to a different file while in diff mode, the editor stays in diff mode showing the previous file's historical version. The `useEffect` at `EditorPane.tsx:101` only clears diff state when navigating to a *folder*, not when switching between files. Since history is per-file, this is a bug — the user sees a stale diff from a file they're no longer viewing.

**Resolution:** Move the timeline into the DocPanel as a 5th tab, fix the stale-diff-on-file-switch bug, and design the tab to support click-through version browsing without leaving the panel. Future project-level activity (cross-file/folder changes) is a separate surface, not this tab.

## 2) Goals
- G1: Users can browse version history and view diffs without any open/close cycle — click entries in the sidebar, diff updates in the main area.
- G2: Version history automatically scopes to the active document and clears on file switch.
- G3: The change is additive to the existing DocPanel tab pattern — no new layout paradigm.

## 3) Non-goals
- **[NOT NOW]** NG1: Project-level activity view (cross-file/folder changes) — this is a different surface (sidebar section or top-level view), not a DocPanel tab. Revisit if: user requests or when collaboration features require project-wide change awareness.
- **[NOT NOW]** NG2: Live-updating diff while in diff mode (agent writes updating the "current" side) — existing FUTURE comment in `EditorArea.tsx:72-76` acknowledges this. Revisit if: multi-user collaboration makes stale diffs a real problem.
- **[NEVER]** NG3: Editing historical versions in place — all products use read-only historical view + explicit restore. This is the correct pattern.
- **[NOT NOW]** NG4: Timeline in mobile Sheet mode refinement — the DocPanel already renders in a Sheet on mobile. Timeline-as-tab inherits that behavior. Revisit if: mobile usage grows and the narrower Sheet width causes usability issues.

## 4) Personas / consumers
- P1: **Solo author** — primary user today. Wants to quickly scan what changed and optionally restore a prior version. Version archaeology is occasional, not constant.
- P2: **Author + AI agent** — uses timeline to see what the agent wrote, undo agent edits. Needs to distinguish agent vs. human entries (already supported via contributor coloring).

## 5) User journeys

### P1: Solo author browsing history
1. User is editing a document in wysiwyg or source mode.
2. Clicks the Timeline tab in the DocPanel sidebar (or it's already visible).
3. Sees a list of versions (checkpoints prominent, WIP collapsed between checkpoints, current WIP expanded at top).
4. Clicks a version entry → main editor area switches to diff view showing changes between that version and current.
5. Clicks another entry → diff updates to show that version vs. current. **No panel close/reopen needed.**
6. Clicks "Now" or exits diff → editor returns to previous editing mode.
7. Optionally clicks "Restore" to roll back to a selected version.

### File switch during history browsing
1. User is viewing a diff (timeline tab open, entry selected).
2. Clicks a different file in the sidebar.
3. Editor exits diff mode, returns to previous editing mode (wysiwyg/source).
4. Timeline tab automatically shows the new file's history.
5. No stale diff content visible.

### Failure / recovery
- History API unavailable → "History unavailable" message in the Timeline tab (existing behavior).
- No history entries → "No history yet" empty state (existing behavior).
- Restore fails → error toast, document unchanged (existing behavior).

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Timeline tab | Skeleton rows | "No history yet" | "History unavailable" | Entry list with checkpoints + WIP groups | N/A |
| Diff view | Spinner overlay | "No changes" toast + exit diff | Fetch error → stays in diff with no content | Side-by-side or unified diff | N/A |

## 6) Requirements

### Functional requirements

| Priority | ID | Requirement | Acceptance criteria | Notes |
|---|---|---|---|---|
| Must | FR-1 | Timeline is a tab in DocPanel | Timeline icon+tab appears alongside Outline, Backlinks, Outgoing Links, Graph. Clicking it shows the version list. | Replaces the standalone Sheet. |
| Must | FR-2 | Version list stays visible during diff | When a timeline entry is selected and the editor shows a diff, the Timeline tab remains open and interactive. User can click another entry without closing anything. | Core pain point fix. |
| Must | FR-3 | Exit diff on file switch | When `activeDocName` changes, clear `previewEntry`, exit diff mode (restore prior editing mode), and let the Timeline tab re-fetch for the new file. | Bug fix. |
| Must | FR-4 | Remove standalone TimelinePanel Sheet | Delete the Sheet wrapper. The `TimelinePanel` component's content (entry list, WIP groups, loading/error/empty states) moves into a DocPanel-compatible shape. | Cleanup. |
| Must | FR-5 | History button in EditorHeader activates Timeline tab | The existing History toggle button should switch DocPanel to the Timeline tab (and expand the panel if collapsed), rather than opening a Sheet. | Discoverability preserved. |
| Should | FR-6 | "Save Version" accessible from Timeline tab | A "Save Version" button in the Timeline tab header or footer so users can checkpoint without going to the EditorHeader. | Convenience — reduces context switching. |
| Should | FR-7 | Compact entry layout for narrower widths | Timeline entries should work at the DocPanel's minimum width (~300px) by truncating author names and using compact timestamps. | Current 350px fixed width was Sheet-optimized. |
| Should | FR-8 | Timeline tab shows "viewing version" indicator | When in diff mode, the Timeline tab shows which entry is selected (highlight) and a small "Now" escape button at the top. | Already exists in the Sheet header — port it. Important because switching to another tab while in diff mode leaves the user without a tab-local exit affordance when they return. |

### Non-functional requirements
- **Performance:** Timeline polling (10s interval) continues as-is. No new API calls. Tab lazy-mounts (existing DocPanel pattern — content only renders when tab is active).
- **Reliability:** No change to data layer. History API and restore API unchanged.
- **Accessibility:** Tab follows existing DocPanel ARIA pattern (`role="tab"`, `role="tabpanel"`). Entry list remains keyboard-navigable.

## 7) Success metrics & instrumentation
- **Primary signal:** Reduction in open/close cycles. Not instrumented today — qualitative improvement.
- **Secondary:** No new bugs in diff mode lifecycle (stale diff, mode stuck, etc.). Covered by existing E2E tests + the FR-3 fix.

## 8) Current state (how it works today)

### Component hierarchy
```
EditorPane
├── EditorHeader (History button → toggles timelineOpen state)
├── EditorArea
│   └── ResizablePanelGroup (desktop) or Sheet (mobile)
│       ├── Editor content (EditorActivityPool or DiffView)
│       └── DocPanel (Outline | Backlinks | Outgoing Links | Graph)
└── TimelinePanel (standalone Sheet, 350px, overlays everything)
```

### State flow
- `EditorPane` owns: `editorMode`, `timelineOpen`, `previewEntry`, `diffLayout`
- `TimelinePanel` receives: `open`, `onOpenChange`, `docName`, `onEntrySelect`, `selectedSha`
- `DocPanel` receives: `docName`, `isSourceMode` (no awareness of timeline/diff state)
- Entry selection: `TimelinePanel.onEntrySelect` → `EditorPane.handleEntrySelect` → sets `previewEntry` + `editorMode='diff'`

### Bug: stale diff on file switch
`EditorPane.tsx:101-108`:
```typescript
useEffect(() => {
  if (activeTarget?.kind !== 'folder') return;
  setPreviewEntry(null);
  setTimelineOpen(false);
  if (editorMode === 'diff') {
    setEditorMode(modeBeforeDiffRef.current);
  }
}, [activeTarget, editorMode]);
```
Only clears on folder navigation. File-to-file navigation leaves `previewEntry` and `editorMode === 'diff'` stale.

### Key constraints
- `DocPanel` currently has no awareness of diff state or timeline entry selection. Moving timeline in requires passing `onEntrySelect`, `selectedSha`, and potentially `previewEntry` through `DocPanel`.
- The existing `EditorHeader` History button calls `onTimelineToggle()` which toggles a boolean. This needs to change to "activate timeline tab + expand panel."
- Timeline data fetching is self-contained in `TimelinePanel` (local state + polling). This stays as-is — no lift to context needed.

## 9) Proposed solution (vertical slice)

### User experience / surfaces

**DocPanel changes:**
- Add `'timeline'` to `PanelTab` union type.
- Add Timeline tab with a `Clock` (or `History`) icon to the tab bar.
- When active, render the timeline entry list (extracted from current `TimelinePanel`).
- `DocPanel` gains new props: `onEntrySelect`, `selectedSha`, `editorMode` (to show selection state and "Now" escape).

**EditorHeader changes:**
- History button no longer toggles a Sheet. Instead, it:
  1. Sets the DocPanel active tab to `'timeline'` (new callback prop or shared state).
  2. Expands the DocPanel if collapsed (calls `panelRef.current?.expand()`).

**EditorPane changes:**
- Remove `timelineOpen` state entirely.
- Remove `<TimelinePanel>` render.
- Add `useEffect` on `activeDocName` change (not just `activeTarget`) to clear `previewEntry` and exit diff mode.
- Pass `onEntrySelect`, `selectedSha`, `editorMode` down through `EditorArea` to `DocPanel`.

**TimelinePanel refactor:**
- Extract the entry list, grouping logic, loading/error/empty states into a `TimelineContent` component (no Sheet wrapper).
- `TimelineContent` takes the same data props but renders as a plain scrollable div, not a Sheet.
- Delete the `Sheet`/`SheetContent`/`SheetHeader` wrapper.
- Keep the "Save Version" button (FR-6) in a small header area within the tab.
- Keep the "Viewing historical version" footer when `selectedSha` is set.
- Preserve exported helpers `formatRelativeTime` and `displayAuthor` — `EditorPane.tsx:16` imports them for the diff-mode viewing banner (`EditorPane.tsx:207`). These can stay in the refactored module or move to a shared utils file.

### System design

**Tab activation from EditorHeader:**

Two options:

**(a) Lift `activeTab` to EditorArea (controlled component):**
`DocPanel` becomes controlled — `activeTab` + `onActiveTabChange` as props. `EditorArea` owns the state. The History button callback flows: `EditorHeader` → `EditorPane` → `EditorArea` → sets `activeTab='timeline'` + expands panel.

**(b) Ref-based imperative API:**
`DocPanel` exposes a `setActiveTab` method via `useImperativeHandle`. `EditorArea` holds a ref and calls `docPanelRef.current?.setActiveTab('timeline')`. Less prop threading.

Recommendation: **(a) Lift state.** It's more React-idiomatic, works with the existing prop-drilling pattern, and the React Compiler handles the re-render cost. The `activeTab` state is simple (a string enum). This also enables future features like "deep-link to a specific tab."

**Diff mode exit on file switch:**

Replace the folder-only `useEffect` with one that also triggers on `activeDocName`:

```typescript
useEffect(() => {
  // Clear stale diff state when the active document changes.
  // editorMode is intentionally excluded from deps — this effect should fire
  // once per doc change, not re-fire on mode transitions within the same doc.
  setPreviewEntry(null);
  if (editorMode === 'diff') {
    setEditorMode(modeBeforeDiffRef.current);
  }
}, [activeDocName]);
```

This fires on every doc change (including folder navigation, since `activeDocName` changes). The existing folder-specific effect (`EditorPane.tsx:101-108`) can be removed entirely — it also called `setTimelineOpen(false)`, which is no longer needed since the Sheet is deleted and the timeline tab persists naturally.

#### Data flow diagram

```
EditorHeader                    EditorPane (state hub)
  [History btn] ──onHistoryTab──→ calls onRequestTimelineTab()
                                    │
                                    ▼
                                EditorArea (owns activeTab + panelRef)
                                  setActiveTab('timeline')
                                  panelRef.expand() if collapsed
                                    │
                         ┌──────────┴──────────┐
                         ▼                      ▼
                   Editor content          DocPanel (controlled)
                   (DiffView when            │
                    editorMode='diff')   ┌───┴───┐
                                         │Timeline│ ← activeTab='timeline'
                                         │Content │
                                         └───┬───┘
                                             │ onEntrySelect(entry)
                                             ▼
                                        EditorPane
                                        setPreviewEntry(entry)
                                        setEditorMode('diff')
```

- Primary flow: User clicks Timeline tab → entry list renders → user clicks entry → `onEntrySelect` bubbles to `EditorPane` → sets diff mode + `previewEntry` → `EditorArea` fetches historical content → renders `DiffView`.
- Shadow paths:
  - **File switch during diff:** `activeDocName` changes → `useEffect` clears `previewEntry` + exits diff mode → Timeline tab re-fetches new file's history.
  - **Panel collapsed:** History button expands panel + activates timeline tab in one action.
  - **No history:** Empty state in timeline tab, no diff mode possible.

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| Timeline tab | History API 500 | fetch catch | "History unavailable" in tab | No version browsing; editing unaffected |
| Diff view | Historical content fetch fails | fetch catch | Stay in diff with null content | User sees empty diff; can exit via "Now" |
| Restore | Rollback API fails | Response status | Error toast | Document unchanged |

### Alternatives considered

**A) Keep Sheet but fix the pain points:**
- Make Sheet non-modal (doesn't overlay editor) by rendering it in the panel area.
- Downside: Still a separate surface. Doesn't unify the mental model. Two "right panel" concepts persist.

**B) Timeline as a dedicated mode (Google Docs style):**
- Replace the entire editor area with a timeline browser when entering history mode.
- Downside: Overkill for per-file version browsing. Loses the quick-glance nature. Better suited for the future project-level activity view.

**C) Timeline as a collapsible section within Outline tab (VS Code style):**
- VS Code puts Timeline as a collapsible section below the file tree, not as a separate tab.
- Downside: DocPanel tabs are a cleaner metaphor for this app. A collapsible section inside another tab adds nesting complexity. Tabs are one-click.

**Why we chose the proposed solution:** Tab-in-DocPanel matches the existing UI pattern, solves both pain points, and is the simplest change. The version list stays visible during diff (no Sheet open/close), and the tab auto-scopes to the active file.

## 10) Decision log

| ID | Decision | Type (P/T/X) | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Timeline becomes a DocPanel tab, not a standalone Sheet | X | LOCKED | No (reversible) | Solves the open/close cycling pain. Matches VS Code, Figma, Notion patterns. | [evidence/ux-research.md](./evidence/ux-research.md) | DocPanel gains timeline-related props. Sheet code deleted. |
| D2 | Lift `activeTab` state from DocPanel to EditorArea (controlled component) | T | DIRECTED | No | Enables History button to activate the timeline tab. More React-idiomatic than imperative ref. Implementer owns the exact prop shape. | — | DocPanel becomes controlled; EditorArea owns tab state. |
| D3 | Clear diff state on `activeDocName` change, not just folder navigation | T | LOCKED | No | Bug fix — stale diff on file switch. Per-file history scoping demands per-file diff lifecycle. | `EditorPane.tsx:101-108` | Replaces folder-only `useEffect`. |
| D4 | Project-level activity is a separate surface, not this tab | P | LOCKED | No | Per-file history tab and project-wide activity have different scopes, data sources, and interaction models. Cramming both into one tab would compromise both. | User input: "in the future we may add a full project activity view" | Future spec needed for project activity. |
| D5 | History button in EditorHeader activates timeline tab + expands panel | T | DIRECTED | No | Preserves discoverability. Same button, different target (tab instead of Sheet). | — | EditorHeader needs a callback to DocPanel tab activation. EditorArea auto-expands panel when `activeTab` changes to `'timeline'` while collapsed (panelRef is internal to EditorArea). |
| D6 | Diff mode persists across DocPanel tab switches | X | LOCKED | No | Diff is about the document, not the active tab. Switching from Timeline to Backlinks while viewing a diff keeps the diff visible — the EditorHeader diff controls (Exit preview, Restore, layout toggle) and the diff-mode banner provide persistent context regardless of active tab. Exiting diff requires explicit user action: EditorHeader "Exit preview" or Timeline tab "Now" button. | Design challenge #5 | Tab-local "Now" escape (FR-8) is important for when user returns to Timeline tab while still in diff mode. |
| D7 | Tab mutual exclusivity accepted — no simultaneous timeline + other tabs | X | LOCKED | No | The old Sheet overlay allowed timeline + another DocPanel tab simultaneously, but covered the editor content. The new tab shows timeline alongside the diff (the actual content being inspected), which is a net improvement. If simultaneous metadata views become needed, the correct path is a split-panel DocPanel, not restoring the Sheet. | Design challenge #4 | — |

## 11) Open questions

| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | Should the Timeline tab auto-activate when the user clicks "Save Version"? | P | P2 | No | Decide during implementation — low-stakes UX polish. | Open |
| Q2 | Should the Timeline tab icon be `Clock`, `History`, or `GitCommitVertical`? | P | P2 | No | Implementer picks; visually consistent with the existing tab icons. | Open |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | Timeline entry list renders well at ~300px width (DocPanel min) | HIGH | Visual check during implementation. Current entries already use truncation + compact timestamps. | Implementation | Active |
| A2 | 10s polling in a DocPanel tab (vs. Sheet that's explicitly opened) has no meaningful perf impact | HIGH | Tab lazy-mounts — timeline only polls when active. Same behavior as current Sheet (polls when open). | Implementation | Active |

## 13) In Scope (implement now)

- **Goal:** Move timeline from Sheet to DocPanel tab. Fix stale-diff-on-file-switch bug.
- **Non-goals:** See §3 (project activity, live diff updates, mobile refinement).
- **Requirements:** FR-1 through FR-5 (Must), FR-6 through FR-8 (Should/Could). See §6.
- **Proposed solution:** See §9.
- **Next actions:**
  1. Extract `TimelineContent` from `TimelinePanel` (content without Sheet wrapper).
  2. Add `'timeline'` tab to `DocPanel`, render `TimelineContent` when active.
  3. Lift `activeTab` to `EditorArea`, thread props for entry selection + diff state.
  4. Wire History button to tab activation + panel expand.
  5. Fix `useEffect` in `EditorPane` to clear diff on `activeDocName` change.
  6. Delete Sheet wrapper and `timelineOpen` state.
  7. Note: No existing E2E tests reference the timeline Sheet (verified via grep). Consider adding E2E coverage for the file-switch diff-clear behavior (FR-3).
- **Risks + mitigations:** See §14.
- **Instrumentation:** No new instrumentation. Existing history API logging suffices.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| No existing E2E coverage for timeline | Consider adding E2E test for FR-3 (diff clears on file switch) | `bun run check` passes |
| EditorHeader History button behavior | Smoke test: button activates tab + expands panel | Manual + E2E |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Timeline tab polls even when user doesn't want it (tab left active) | Low | Low | Existing pattern: only polls when tab is active (lazy mount). Same as Sheet polling when open. | Implementer |
| Prop threading from EditorPane → EditorArea → DocPanel becomes unwieldy | Medium | Low | Controlled `activeTab` + 3 new props (`onEntrySelect`, `selectedSha`, `editorMode`) is manageable. If EditorArea prop count crosses ~10, extract to an `EditorPaneContext` publishing `{ editorMode, previewEntry, onEntrySelect, activeTab, setActiveTab }`. | Implementer |

## 15) Future Work

### Explored
- **Project-level activity view**
  - What we learned: User explicitly wants this as a future feature. It's cross-file/folder, different data source (shadow repo log across all docs), different interaction model (not tied to a single doc's diff view).
  - Recommended approach: Dedicated sidebar section or top-level view. Not a DocPanel tab — DocPanel is per-document context.
  - Why not in scope now: Different data requirements, different UX surface. The per-file timeline tab is independently valuable and doesn't block or constrain this.
  - Triggers to revisit: Collaboration features, multi-user workflows, customer request for "what changed across the project."

### Noted
- **Live diff updates** — Agent or peer writes updating the "current" side of the diff while viewing. `@codemirror/merge` supports `Chunk.updateA()/updateB()`. Noted in `EditorArea.tsx:72-76`.
- **Timeline entry deep-linking** — URL hash encoding of `?version=<sha>` to share links to specific historical versions.

## 16) Agent constraints

- **SCOPE:** `packages/app/src/components/TimelinePanel.tsx`, `packages/app/src/components/DocPanel.tsx`, `packages/app/src/components/EditorPane.tsx`, `packages/app/src/components/EditorArea.tsx`, `packages/app/src/components/EditorHeader.tsx`. E2E tests under `packages/app/tests/stress/` that reference the timeline Sheet.
- **EXCLUDE:** Server-side history API (`packages/server/`), core package, markdown pipeline, bridge/observer layer, other DocPanel tabs (Outline, Backlinks, Outgoing Links, Graph).
- **STOP_IF:** The change requires modifying the history API contract, or requires new React context providers beyond prop threading.
- **ASK_FIRST:** Any change to the EditorMode state machine beyond adding the `activeDocName` cleanup effect.
