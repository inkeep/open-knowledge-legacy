---
title: Timeline diff — move to side pane (no main-editor hijack)
description: Move the Timeline tab's per-entry diff preview from the main-editor hijack into an inline render in the DocPanel side pane, mirroring the Activity Panel's burst-row pattern. Click an entry to expand it inline; click again to collapse. Restore button preserved per-entry. Reuses ActivityPanelDiffView (react-diff-view); CM6 DiffView retained for ConflictResolver.
tags: [spec, timeline, docpanel, diff-viewer, restore, refactor]
status: accepted
depends_on:
  - specs/2026-04-20-timeline-to-docpanel/SPEC
  - specs/2026-04-23-agent-activity-panel/SPEC
  - specs/2026-04-24-activity-panel-to-docpanel-mode-toggle/SPEC
---
# Timeline diff → side pane (2026-04-24)

> This spec **amends** [[specs/2026-04-20-timeline-to-docpanel/SPEC]]. Timeline is already a tab in DocPanel as of that spec — this change keeps the tab in place, removes the per-entry **main-editor hijack** (which today flips `editorMode = 'diff'` and replaces the editor with a CM6 merge view), and instead renders the per-entry diff **inline below the expanded entry row**, in the DocPanel side pane. Restore semantics preserved.
>
> Architecturally this brings the Timeline preview into shape parity with the Activity Panel's per-burst inline diff render, finishing the unification kicked off by [[specs/2026-04-24-activity-panel-to-docpanel-mode-toggle/SPEC]] (which moved the Activity Panel into DocPanel as a top-level mode). The thesis: **the side pane shows what changed; the main editor shows what you're editing — never both, never one impersonating the other.**

---

## 1. Problem

**Situation.** Clicking a Timeline entry today hijacks the main editor: `EditorPane.handleEntrySelect` sets `editorMode = 'diff'` + `previewEntry = entry`, the existing TipTap/CodeMirror editor subtree is `display:none`'d, and a `@codemirror/merge` `DiffView` mounts in its place showing `historical(sha)` vs `current(Y.Text)`. A sticky bar above the editor surfaces the Restore + Close buttons.

**Complication.** The hijack pattern violates two invariants users have already learned from the Activity Panel:

1. **Side pane shows changes; editor shows the live document.** Activity bursts render their diffs inline in the side pane next to the row that triggered them. Timeline forces users into a different mental model — the editor itself becomes the diff. Two surfaces for the same kind of action ("show me what changed in this unit of work") with two different visual conventions is drift.
2. **Multi-compare is impossible.** The hijack model is single-select — one preview at a time. Activity bursts allow multi-expand (open three burst rows at once and eyeball them together). Timeline forces serial inspection.

It also imposes architectural cost: a separate `editorMode === 'diff'` state machine, a per-doc fetch effect in `EditorArea` that's separate from the rest of the editor's data flow, a sticky action bar with its own loading + error UI in `EditorPane`, and the `modeBeforeDiffRef` that has to remember+restore the user's pre-hijack mode.

**Resolution.** Move Timeline's per-entry diff into an **inline expand-to-diff** pattern matching the Activity Panel's burst-row UX:

```
┌─ Timeline tab (in DocPanel) ────────────┐
│  ▸ 2h ago · Claude · +14 −2            │   ← collapsed row
│  ▸ 5h ago · You · +2 −1                │
│  ▾ yesterday · Miles · +50 −10         │   ← expanded
│     ┌─ inline unified-diff ──────────┐ │
│     │ @@ -1,3 +1,3 @@                │ │
│     │ - old line                     │ │   ← ActivityPanelDiffView
│     │ + new line                     │ │     (split or unified —
│     │   context                      │ │      respects diffLayout)
│     └────────────────────────────────┘ │
│                          [⟲ Restore]   │   ← per-entry Restore button
│  ▸ last week · Claude · +120 −45       │
└────────────────────────────────────────┘
```

Click entry to expand; click again to collapse (no separate Close button). Per-row Restore button at the bottom of the expanded diff opens an `AlertDialog` and fires `POST /api/rollback` exactly as today. Main editor never hijacks. CM6 `DiffView` keeps its existing role in `ConflictResolver` (editable 3-way merge — the one place CM6's merge view is genuinely load-bearing).

## 2. Goals / Non-goals

### Goals

- **G-D1** — Click a Timeline entry → that entry expands inline, showing the diff between that commit's content and the current Y.Text. Main editor unchanged.
- **G-D2** — Click the same entry again → it collapses. No separate Close button.
- **G-D3** — Multi-expand: multiple entries can be open simultaneously. Matches Activity Panel.
- **G-D4** — Per-entry Restore button at the bottom of each expanded diff. Same `POST /api/rollback` semantics as today, same `AlertDialog` confirmation copy, same `restoring` / `restoreError` flow.
- **G-D5** — Split / unified layout choice preserved. The existing `diffLayout: 'split' | 'unified'` state flows through unchanged; toggle UI in `EditorHeader` continues to work; user picks freely.
- **G-D6** — `ActivityPanelDiffView` is the single inline-diff renderer in the side pane (Timeline + Activity). One component, one visual convention.
- **G-D7** — `DiffView` (`@codemirror/merge`) remains the renderer for `ConflictResolver`. Untouched.
- **G-D8** — Zero server changes. The existing `GET /api/history/:sha` endpoint feeds the new client-side hook.

### Non-goals

- **NG-D1** — **Selective hunk restore.** Today's Restore is wholesale (`POST /api/rollback` with one `commitSha` replaces the doc). Per-hunk Accept/Reject from the historical version is a feature expansion, not part of this refactor. Future work — see §10 D-D8.
- **NG-D2** — **Live re-diff while the entry is expanded.** The displayed diff is a snapshot at expand time. If the user types into the editor while an entry is expanded, the displayed diff does NOT update — they collapse + re-expand for a fresh read. Matches today's hijacked-DiffView behavior (see the `FUTURE` comment at `EditorArea.tsx:134-138`). A future enhancement could subscribe to Y.Text events and re-run `createPatch` on debounced changes.
- **NG-D3** — **Persisting expanded entries across reloads.** Per-entry expanded state is component-local; reloading the page loses it. Matches Activity Panel.
- **NG-D4** — **Server-side diff synthesis.** A new endpoint (e.g. `GET /api/history/:sha/diff`) was considered. Rejected: client-side `diff.createPatch` is fast at doc scale, requires zero server changes, and has the additional advantage of including the user's unsaved Y.Text WIP in the diff (a server-side endpoint would have to reach into the live Y.Text to match this — coupling we currently avoid).
- **NG-D5** — **Removing the `editorMode === 'diff'` state entirely.** It survives as the gating value for `ConflictResolver`'s editable merge surface. Renamed or repurposed — TBD at implementation time.
- **NG-D6** — **Removing the `DiffView` (CM6) component.** It still has one legitimate caller (`ConflictResolver`). The file stays.
- **NG-D7** — **Mobile (Sheet-mode DocPanel) layout differences.** The same expand-to-diff pattern works in mobile sheet mode. No special-cased layout.

## 3. Users and scenarios

**Persona.** Miles, same as the parent specs.

- **S-D1 Quick preview.** Miles opens the Timeline tab. He sees a list of entries. He clicks one — that entry's row expands inline; below it appears a unified diff comparing that commit's content to his current doc. Main editor is untouched. He scans the diff, then clicks the same entry → it collapses.
- **S-D2 Compare two entries side by side.** Miles wants to compare a 2 h ago commit with a yesterday commit. He clicks both — both rows expand simultaneously. He scrolls between them in the Timeline tab. (Multi-expand impossible in today's hijack model.)
- **S-D3 Restore a version.** Miles opens an entry, reads the diff, decides to restore. He clicks the Restore button at the bottom of that entry's expanded diff. The `AlertDialog` confirms ("Restore this version? This will replace the current document content with the version from 2 h ago…"). On confirm, `POST /api/rollback` fires; on success, the doc updates via the CRDT bridge and the entry collapses (or stays expanded — implementation detail). On failure, an inline error appears below the Restore button (same 4 s auto-clear as today).
- **S-D4 Layout toggle.** Miles is comparing entries with long lines. He flips the existing split/unified toggle in the header from unified → split. The expanded diffs re-render side-by-side. (Below ~700 px panel width split is cramped; user notices and flips back.)
- **S-D5 Edit while preview open.** Miles has an entry expanded. He clicks into the main editor and types a few words. The expanded entry's diff does NOT update — it's a snapshot at expand time. To see fresh diffs, he collapses + re-expands. (NG-D2.)
- **S-D6 Doc nav.** Miles has an entry expanded for doc A. He navigates to doc B (via sidebar or filename click). The Timeline tab content swaps to doc B's entries; expanded state from doc A is gone (TimelinePanel re-mounts on `docName` change).

## 4. Functional requirements

### Render flow

- **FR-D1** — `TimelinePanel.EntryRow` gains local `expanded: boolean` state. Default `false`. Clicking the row toggles it.
- **FR-D2** — When `expanded === true`, the row renders `<ActivityPanelDiffView diff={diff} viewType={diffLayout} />` inline below the row's existing collapsed-state header (timestamp, author, stat).
- **FR-D3** — The `diff` string for an expanded row comes from a new client hook `useTimelineEntryDiff(sha, docName)` — see FR-D7.
- **FR-D4** — The renderer is `ActivityPanelDiffView` exclusively. CM6 `DiffView` is NOT used in the inline path.
- **FR-D5** — Multi-expand is supported — each `EntryRow` tracks its own `expanded` state independently.
- **FR-D6** — Single click semantics: click anywhere on the entry's collapsed-row chrome (timestamp, author, stat) toggles expand/collapse. There is **no separate Close button**. Only the per-entry Restore button surfaces inside the expanded diff area.

### Diff data source

- **FR-D7** — New hook `packages/app/src/lib/use-timeline-entry-diff.ts`:
  - Signature: `useTimelineEntryDiff(sha: string | null, docName: string): { diff: string | null, status: 'idle' | 'loading' | 'ready' | 'error' }`.
  - Inert when `sha === null` (returns `{diff: null, status: 'idle'}`, no fetches).
  - On `sha` set: fetches historical content via the existing `GET /api/history/:sha?docName=<>` endpoint. Cancellation flag prevents updates after unmount or `sha` swap.
  - Strips frontmatter from both historical and current via `stripFrontmatter` from `@inkeep/open-knowledge-core` (matching existing `EditorArea.tsx` lines 168–171 logic).
  - Reads `current` from `activeProvider.document.getText('source').toString()` (same as `EditorArea.tsx` today).
  - Computes diff via `createPatch(docName, historical_body, current_body, '', '', { context: 3 })` from the `diff` package (already in `packages/app` devDeps from the Activity Panel work).
  - Returns the unified-diff string ready for `ActivityPanelDiffView` (which already strips the `Index: ...` preamble that `createPatch` emits).

### Caching

- **FR-D8** — Client-side cache for **historical content only** — never the diff string. Rationale: historical content for a given sha is git-immutable; the diff against `current` is mutable (user types, agents write).
- **FR-D9** — Cache implementation: a `HistoricalContentCache` class scoped to `TimelinePanel`'s mount lifecycle via `useRef`. Map-insertion-order LRU eviction at `HISTORICAL_CONTENT_CACHE_LIMIT = 32`. Identical shape to `BurstDiffCache` in `use-activity-panel.ts` — single pattern for two callers.
- **FR-D10** — Cache lookup pattern in `useTimelineEntryDiff`'s effect: `historical = cache.get(sha) ?? await fetchHistorical(sha); cache.set(sha, historical)`. Then **always** recompute `createPatch(historical, current)` against fresh `current` — never serve a cached diff string.
- **FR-D11** — No manual invalidation needed for cache entries. Sha guarantees historical-content immutability. Cache naturally clears when `TimelinePanel` unmounts (e.g. doc nav).

### Restore button

- **FR-D12** — Each expanded `EntryRow` renders a Restore button at the bottom of its inline diff area. Variant: `default` (primary), size: matches the existing button.
- **FR-D13** — Click opens an `AlertDialog` with the same wording as today: title `"Restore this version?"`, description includes the entry's relative timestamp ("…the version from 2 h ago…"), Cancel + destructive Restore actions.
- **FR-D14** — Confirm fires `POST /api/rollback` with `{ docName, commitSha }` — exact same shape as today's `EditorPane.handleRestore`. Server endpoint is unchanged.
- **FR-D15** — Per-entry `restoring: boolean` state for the button label (`"Restore"` → `"Restoring…"` → `"Restore"`); per-entry `restoreError: string | null` state for the inline error label below the button (4 s auto-clear, same as today's `errorTimerRef`).
- **FR-D16** — On success, the row may collapse and the doc content updates via the CRDT bridge (Y.Text + XmlFragment refresh via the existing `ROLLBACK_ORIGIN` paired-write). The user does not need to interact further — they see the editor reflect the restored content.
- **FR-D17** — `AlertDialog` is shadcn's `AlertDialog`, not `Dialog` — preserves today's `EditorPane` choice. (Activity Panel's "Undo all" uses shadcn `Dialog` — an existing inconsistency. Not normalized in this spec; flagged as future work.)

### Layout toggle

- **FR-D18** — The existing `diffLayout: 'split' | 'unified'` state in `EditorPane` is preserved unchanged. Plumbing flows through `EditorPane` → `EditorArea` → `DocPanel` → `TimelineContent` → `EntryRow` → `<ActivityPanelDiffView viewType={diffLayout} />`.
- **FR-D19** — `ActivityPanelDiffView` accepts `viewType: 'split' | 'unified'` as a prop (today it hardcodes `'unified'` — the prop is added and defaulted to `'unified'` so the Activity Panel's existing call sites remain unchanged).
- **FR-D20** — The `EditorHeader` toggle UI for split/unified continues to render whenever there is at least one expanded Timeline entry. Implementation detail: the toggle is currently visible only when `editorMode === 'diff'`; gating moves to "any TimelinePanel entry is expanded" or "always when in Timeline tab" — TBD at implementation time.

### Removed

- **FR-D21** — `EditorArea.tsx`'s `isDiffMode && <DiffView />` render branch (current lines ~289–290) is removed.
- **FR-D22** — `EditorArea.tsx`'s historical-content fetch effect (current lines ~142–199) is removed — its responsibilities migrate to `useTimelineEntryDiff`.
- **FR-D23** — `EditorPane.tsx`'s `handleEntrySelect` no longer flips `editorMode` to `'diff'`. The function signature may change or be removed entirely depending on whether any other callers remain.
- **FR-D24** — `EditorPane.tsx`'s sticky diff-mode action bar (current lines ~225–259) is removed — its Restore + Close + error display affordances migrate to per-entry rendering inside `TimelinePanel`.
- **FR-D25** — `EditorPane.tsx`'s `previewEntry`, `restoring`, `restoreError`, `errorTimerRef`, `modeBeforeDiffRef` state — all migrate to `TimelinePanel` per-entry state or are removed entirely (modeBeforeDiffRef is no longer needed since editorMode never flips).

## 5. Data flow

```
USER clicks a Timeline entry row
  ↓ EntryRow.onClick → setExpanded(prev => !prev)
EntryRow (now expanded === true)
  ↓ calls useTimelineEntryDiff(sha, docName)
  ↓
useTimelineEntryDiff effect (sha changed from null to a value):
  ↓ check historicalCache.get(sha)
  ↓ MISS → fetch GET /api/history/:sha?docName=<>
  ↓        → store { sha → content } in cache (LRU eviction at 32)
  ↓ HIT  → use cached content
  ↓
  ↓ historical = stripFrontmatter(content).body
  ↓ current   = stripFrontmatter(activeProvider.document.getText('source').toString()).body
  ↓ diff      = createPatch(docName, historical, current, '', '', { context: 3 })
  ↓
EntryRow renders inline below itself:
  <ActivityPanelDiffView diff={diff} viewType={diffLayout} />
  + Restore button at the bottom

USER clicks Restore button (per-row):
  ↓ AlertDialog confirms
  ↓ POST /api/rollback { docName, commitSha: sha }
  ↓ on success: server replaces Y.Text via ROLLBACK_ORIGIN paired-write
  ↓             CRDT bridge propagates to XmlFragment + clients
  ↓             optionally collapse the entry row (implementation detail)
  ↓ on failure: inline error label below Restore button (4 s auto-clear)

USER clicks the same entry again:
  ↓ EntryRow.onClick → setExpanded(prev => !prev) → false
  ↓ ActivityPanelDiffView unmounts. Diff is recomputed from cache on next expand.
```

## 6. Technical surface

### New file

| File | Responsibility |
|---|---|
| `packages/app/src/lib/use-timeline-entry-diff.ts` | `useTimelineEntryDiff(sha, docName)` hook + `HistoricalContentCache` class. Fetches historical content (cached), reads current Y.Text, runs `createPatch`. Returns `{ diff, status }`. |

### Modified files

| File | Change |
|---|---|
| `packages/app/src/components/TimelinePanel.tsx` (`EntryRow` + `TimelineContent`) | `EntryRow` gains `expanded` local state + inline diff rendering. Per-entry Restore button + AlertDialog migrate here from `EditorPane`. `onSelect` is removed from the Timeline tab's path (or repurposed for telemetry). |
| `packages/app/src/components/ActivityPanelDiffView.tsx` | Add `viewType?: 'split' \| 'unified'` prop, default `'unified'` for backward compat with Activity callers. |
| `packages/app/src/components/EditorArea.tsx` | Remove `isDiffMode && <DiffView />` render branch. Remove the `useEffect` that fetches `/api/history/:sha`. Remove `previewLoading` state. `previewEntry` prop is no longer used here — remove from `EditorAreaProps`. |
| `packages/app/src/components/EditorPane.tsx` | Remove `handleEntrySelect`'s `setEditorMode('diff')` flip. Remove the sticky diff-mode action bar (Restore/Close + error display). Remove `previewEntry`, `restoring`, `restoreError`, `errorTimerRef`, `modeBeforeDiffRef` state. `editorMode === 'diff'` retained only for `ConflictResolver`. |
| `packages/app/src/components/EditorHeader.tsx` | The split/unified toggle's render gate moves from `editorMode === 'diff'` to "any TimelinePanel entry is expanded" — implementation detail. May simplify to always-visible-when-Timeline-tab-active. |
| `packages/app/src/components/DocPanel.tsx` | Plumb `diffLayout` into `TimelineContent` so `EntryRow` can pass it down. |

### Unchanged

| File | Why |
|---|---|
| `packages/app/src/components/DiffView.tsx` | Still used by `ConflictResolver` — its editable 3-way merge mode is the only place CM6's merge view is genuinely load-bearing. Not deleted. |
| `packages/app/src/components/ConflictResolver.tsx` | Unaffected. |
| `packages/server/src/api-extension.ts` `handleHistoryVersion` | Endpoint shape unchanged. |
| `POST /api/rollback` server handler | Unchanged. |
| Activity Panel call site of `ActivityPanelDiffView` | Continues to work — `viewType` prop is added with `'unified'` default, matching today's hardcoded value. |

## 7. Decisions

- **D-D1 — LOCKED. No main-editor hijack.** Click-on-entry expands inline in the side pane. Restore fires from the same side pane. The main editor is never replaced for Timeline preview. Only `ConflictResolver` retains an editor-takeover (modal) surface and that is unchanged.
- **D-D2 — LOCKED. `ActivityPanelDiffView` (`react-diff-view`) is the single inline-diff renderer.** Side pane diffs (Timeline + Activity) all flow through one component. CM6 `DiffView` is reserved for `ConflictResolver`.
- **D-D3 — LOCKED. Multi-expand selection model.** Per-entry `expanded` state. Multiple entries can be open simultaneously. Matches Activity Panel.
- **D-D4 — LOCKED. No separate Close button.** Click the entry to toggle expand/collapse. The only action button inside an expanded entry is Restore.
- **D-D5 — LOCKED. Client-side diff synthesis via `diff.createPatch`.** Hook reads historical from `/api/history/:sha`, current from live Y.Text, runs `createPatch` with `context: 3`. Server side unchanged.
- **D-D6 — LOCKED. Cache only the historical content; recompute the diff every expand.** Historical is git-immutable per sha (cacheable). The diff against `current` is mutable (user types, agents write) → caching the diff would serve stale results.
- **D-D7 — DIRECTED. `HistoricalContentCache` LRU at 32 entries, component-scoped via `useRef`.** Map-insertion-order eviction. Limit chosen for ~320 KB max footprint on typical markdown sizes — adjustable without API churn.
- **D-D8 — DELEGATED → future spec. Selective hunk restore.** A user-requested superset ("restore some hunks but not others") is feasible by reusing CM6 `DiffView` in conflict mode + a new `POST /api/rollback-partial` (or composing via a different mechanism). Out of scope here. Track as future work.
- **D-D9 — LOCKED. Snapshot-at-expand-time diff (no live re-diff while expanded).** Matches today's hijacked-DiffView behavior. NG-D2 captures the rationale.
- **D-D10 — DIRECTED. Restore button uses shadcn `AlertDialog`, not `Dialog`.** Preserves today's `EditorPane` choice, even though Activity Panel's "Undo all" uses `Dialog`. The inconsistency is noted; normalizing the two confirmation primitives is a separate cleanup.
- **D-D11 — DIRECTED. Split/unified layout toggle preserved.** `diffLayout` state in `EditorPane` flows through unchanged; the renderer simply changes from CM6 `DiffView` to `<ActivityPanelDiffView viewType={diffLayout} />`. `react-diff-view`'s `viewType` prop accepts identical values. At narrow panel widths split is cramped; user self-corrects.
- **D-D12 — LOCKED. `editorMode === 'diff'` retained only for `ConflictResolver`.** May be renamed (e.g. `'merge-resolve'`) for clarity, or left as-is — implementation choice. Either way, the timeline path no longer sets it.

## 8. Acceptance criteria

- **AC-D1 (G-D1, G-D2):** Click a Timeline entry → that entry expands inline with a unified-diff view below it; main editor's `editorMode` is unchanged. Click the same entry again → it collapses. Playwright.
- **AC-D2 (G-D3):** Open three Timeline entries simultaneously; all three remain expanded (no single-select takeover). Playwright.
- **AC-D3 (FR-D7, FR-D10):** First expand of an entry triggers `GET /api/history/:sha`; second expand of the same entry within the same TimelinePanel mount does NOT re-trigger the network call (cache hit). Playwright (or integration with fetch spy).
- **AC-D4 (FR-D8, FR-D10, NG-D2):** With an entry expanded, type into the main editor. The displayed diff in the side pane does NOT update mid-typing. Collapse + re-expand → diff now reflects post-typing state. Playwright.
- **AC-D5 (G-D4, FR-D14):** Click Restore on an expanded entry → AlertDialog confirms → on accept, `POST /api/rollback { docName, commitSha }` fires once with the correct values; on success, the doc content updates. Playwright + integration test.
- **AC-D6 (G-D5, FR-D18, FR-D19):** With an entry expanded, flip the split/unified toggle in the editor header → the expanded diff re-renders in the chosen layout. Playwright.
- **AC-D7 (FR-D11):** Navigate to a different doc; the Timeline tab's `EntryRow` `expanded` state for the previous doc's entries is gone. (TimelinePanel re-mounts.) Playwright.
- **AC-D8 (FR-D21, FR-D24):** `EditorArea.tsx` no longer renders `<DiffView>` in any branch reachable from a Timeline click; `EditorPane.tsx` no longer renders the sticky diff-mode action bar. Grep + Playwright (assert main editor visible after Timeline entry click).
- **AC-D9 (FR-D6, NG-D1):** No "Close" button is rendered inside an expanded Timeline entry; only the Restore button + AlertDialog. Selective-hunk Restore is not exposed. Grep + Playwright.

Non-functional:

- **NF-D1:** First expand of an entry — fetch + diff render budget < 300 ms p95 for typical (sub-100 KB) docs. (Network-bound; `createPatch` itself is single-digit ms.)
- **NF-D2:** Re-expand of an entry within the same mount → diff render < 100 ms p95 (cache hit, no network).
- **NF-D3:** Memory: `HistoricalContentCache` footprint < 1 MB for typical markdown corpus (32 entries × avg ~30 KB = ~960 KB). Adjust `HISTORICAL_CONTENT_CACHE_LIMIT` if power-user sessions exceed this.

## 9. Implementation order

1. Add `viewType` prop to `ActivityPanelDiffView`, defaulting `'unified'`. Verify Activity Panel call site still works.
2. Create `packages/app/src/lib/use-timeline-entry-diff.ts` with hook + `HistoricalContentCache`. Unit tests for the cache (LRU eviction, MRU re-insert).
3. Modify `TimelinePanel.tsx` `EntryRow` — add `expanded` state + inline diff render + per-entry Restore button + AlertDialog. Migrate `handleRestore` logic from `EditorPane.tsx`.
4. Plumb `diffLayout` through `DocPanel` → `TimelineContent` → `EntryRow`.
5. Remove `EditorArea.tsx`'s `isDiffMode` render branch + history fetch effect. Remove `previewEntry` from props.
6. Remove `EditorPane.tsx`'s `handleEntrySelect` mode-flip + sticky action bar + associated state.
7. Audit `EditorHeader.tsx`'s split/unified toggle visibility gate; adjust to render whenever appropriate.
8. Update or rewrite Playwright tests that exercised the old hijack flow → assert the inline-diff side-pane behavior.
9. Update SPEC-20 (`timeline-to-docpanel`) with corrigendum breadcrumbs noting the per-entry render mechanism change. Update user-facing docs (timeline guide).

## 10. Risks

- **R-D1 — Large-doc diff render cost in the side pane.** A 1000-line doc with 200 lines changed produces ~500 lines of unified-diff text. `react-diff-view` renders the entire diff as DOM — no virtualization. Mitigation: `createPatch` with `context: 3` already limits output to changed-line-context windows, not full file. If this becomes a real issue, react-diff-view's `Decoration`-based fold-unchanged is available; or the D8 escape hatch (CM6 selective-restore in the main editor) provides a path for users with massive diffs.
- **R-D2 — `EditorHeader` toggle visibility logic.** The split/unified toggle is currently gated on `editorMode === 'diff'`. After this change, that gate doesn't fire from the Timeline path. Decision needed: render the toggle (a) always when in Timeline tab, (b) only when at least one entry is expanded, (c) always (Activity panel could use it too). Implementation detail; not a blocker.
- **R-D3 — Restore success → row collapse semantics.** When a Restore succeeds, should the expanded row auto-collapse, or stay expanded with a new diff (current vs. now-restored — would show no diff)? Implementation detail. Recommended: auto-collapse + close any other expanded entries from the same doc since their `current` baseline is now stale (their diffs would re-fetch on next expand anyway, but auto-collapse signals "the doc just changed; your previous comparisons are recomputed").
- **R-D4 — Telemetry continuity.** Current Restore flow has implicit telemetry breadcrumbs (`editorMode === 'diff'` is observable; Restore calls are logged). Migrating to per-entry state may shift where the spans / counters live. Audit before merge.

## 11. Future work

- **FW-D1 — Selective hunk restore.** D-D8 deferred. Spec when prioritized: opt-in "↗ Open in editor" button on each expanded entry → flips main editor into CM6 conflict view in `mergeControls=true` mode → user picks hunks → applies via a new `POST /api/rollback-partial` (or composes via Y.Text writes). Reuses the CM6 primitive that `ConflictResolver` already depends on.
- **FW-D2 — Live re-diff on Y.Text changes.** NG-D2 deferred. Subscribe to `activeProvider.document.on('update')` within `useTimelineEntryDiff` and debounce a `createPatch` recompute. Cost: re-renders the diff DOM on every typing burst. Probably fine for short docs; should be opt-in (e.g. user toggle "live diff").
- **FW-D3 — Telemetry harmonization.** ActivityPanel + Timeline use different confirmation primitives (`Dialog` vs `AlertDialog`). Future cleanup: consolidate on one (likely `AlertDialog` for destructive actions).
- **FW-D4 — `editorMode === 'diff'` rename.** With the Timeline path retired, the value's only meaning is "ConflictResolver is open." Renaming to `'merge-resolve'` or a more semantic value is a small follow-up cleanup.

## 12. Agent constraints for implementor

- **SCOPE:**
  - `packages/app/src/lib/use-timeline-entry-diff.ts` (new)
  - `packages/app/src/components/ActivityPanelDiffView.tsx` (add `viewType` prop)
  - `packages/app/src/components/TimelinePanel.tsx` (EntryRow expanded state + inline diff + per-row Restore)
  - `packages/app/src/components/EditorArea.tsx` (remove DiffView render branch + history fetch effect)
  - `packages/app/src/components/EditorPane.tsx` (remove handleEntrySelect mode flip + sticky action bar + state)
  - `packages/app/src/components/EditorHeader.tsx` (toggle visibility gate)
  - `packages/app/src/components/DocPanel.tsx` (plumb diffLayout to TimelineContent)
  - `packages/app/tests/stress/*.e2e.ts` for any tests that exercise the old hijack flow
  - `specs/2026-04-20-timeline-to-docpanel/SPEC.md` — corrigendum breadcrumbs only (no prose rewrite)
- **EXCLUDE:**
  - Any change to `packages/app/src/components/DiffView.tsx` (CM6 component) (D-D2 LOCKED)
  - Any change to `packages/app/src/components/ConflictResolver.tsx` (D-D2, D-D12 LOCKED)
  - Any change to `GET /api/history/:sha` server handler (D-D5 LOCKED)
  - Any change to `POST /api/rollback` server handler (G-D8 LOCKED)
  - Any introduction of selective-hunk-restore functionality (NG-D1, D-D8)
  - Any introduction of live re-diff while expanded (NG-D2, D-D9)
  - Any persistence of expanded-entry state across reloads (NG-D3)
  - Any new server endpoint (D-D5 — client-side synthesis is the locked path)
- **STOP_IF:**
  - `react-diff-view`'s `viewType="split"` produces visually broken output in DocPanel side-pane widths (would invalidate D-D11 and force unified-only)
  - `diff.createPatch` p95 latency on a 100 KB markdown doc exceeds 50 ms (would invalidate the recompute-every-expand model in D-D6)
- **ASK_FIRST:**
  - Adjusting `HISTORICAL_CONTENT_CACHE_LIMIT` away from 32 (D-D7 is DIRECTED, not LOCKED — but defaults matter)
  - Repurposing `editorMode === 'diff'` to a more semantic name (D-D12 leaves this open; coordinate with ConflictResolver)
  - Auto-collapsing other expanded entries on a successful Restore (R-D3 — implementation choice)

---

## See also

- [[specs/2026-04-20-timeline-to-docpanel/SPEC]] — original Timeline-in-DocPanel decision (this spec amends).
- [[specs/2026-04-23-agent-activity-panel/SPEC]] — Activity Panel; established the per-row inline diff pattern.
- [[specs/2026-04-24-activity-panel-to-docpanel-mode-toggle/SPEC]] — Activity Panel embedded in DocPanel; this spec finishes the unification by giving Timeline the same shape.
- [[packages/app/src/components/ActivityPanelDiffView.tsx]] — the inline-diff renderer (single source for Timeline + Activity after this lands).
- [[packages/app/src/components/DiffView.tsx]] — CM6 component, retained for `ConflictResolver`.
- [[packages/app/src/components/TimelinePanel.tsx]] — host of the new inline expand-to-diff UX.
