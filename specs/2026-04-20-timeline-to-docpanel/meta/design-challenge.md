# Design Challenge Findings

## Challenge 1: Tab count — does a 5th tab crowd the tab bar?

**What was found:** DocPanel tab bar renders icon-only buttons using `size="icon"` (32px square) with `gap-0.5` (2px) spacing and `px-2` (8px) padding. Current: 4 tabs ≈ 150px. Proposed: 5 tabs ≈ 184px. DocPanel minimum width is 300px (`EditorArea.tsx:285`), leaving 116px of breathing room. In sheet mode (320-384px), even more comfortable.

**Verdict: Holds.** Tab bar wouldn't need overflow until ~8-9 icon-only tabs. No revision needed.

## Challenge 2: Prop threading depth

**What was found:** Threading `onEntrySelect`, `selectedSha`, `editorMode` from EditorPane through EditorArea to DocPanel. After adding D2's `activeTab`/`onActiveTabChange`, EditorArea receives ~9 props. Timeline state genuinely must live in EditorPane (owns `editorMode` state machine, `handleEntrySelect`/`handleRestore`).

**Alternative not considered:** `EditorPaneContext` publishing `{ editorMode, previewEntry, onEntrySelect, activeTab, setActiveTab }`. Eliminates bucket brigade through EditorArea while keeping EditorPane as state owner.

**Verdict: Holds with caveat.** Note `EditorPaneContext` as the named extraction if prop count crosses 10.

## Challenge 3: Controlled vs uncontrolled DocPanel

**What was found:** The sole motivation for lifting `activeTab` is the History button needing to programmatically activate the timeline tab. Parent only needs to *write* (set tab to `'timeline'`), never *read*. Textbook use case for imperative handle.

**Alternative not considered:** Hybrid where DocPanel keeps internal state but accepts optional `requestedTab` prop. When it changes, `useEffect` calls internal `setActiveTab`. One-way signal without full control.

**Verdict: Holds.** D2 is already DIRECTED (not LOCKED), which is the right resolution. Implementer can pick approach.

## Challenge 4: Loss of simultaneous timeline + other tabs

**What was found:** Tabs are mutually exclusive by definition. The Sheet overlay, despite open/close pain, did allow viewing timeline while DocPanel showed backlinks.

**Why it holds:** The Sheet didn't solve simultaneous viewing well — it covered the *editor content*, so you could see backlinks + timeline but not the diff. The proposed solution shows diff AND timeline simultaneously (the actual improvement). If the need becomes real, the correct answer is a split-panel DocPanel, not keeping the Sheet.

**Verdict: Holds, but make the tradeoff explicit** in Alternatives or Decision Log.

## Challenge 5: Diff mode lifecycle — mixing a mode-changing tab with info-only tabs

**What was found:** This is the strongest challenge. The four existing tabs are pure read-only info panels. Timeline is fundamentally different: clicking an entry triggers `onEntrySelect` which sets `editorMode='diff'`.

Key UX asymmetries:
- **Tab-switch surprise:** Switching from Timeline (while viewing a diff) to Backlinks does NOT exit diff mode. User sees a diff in editor but Backlinks in panel.
- **Exit affordance ambiguity:** The "Now" button lives in Timeline tab. If user switches to Backlinks while in diff mode, their only exit is EditorHeader's "Exit preview" button.

**Why it holds:** Diff mode persisting across tab switches is actually correct (diff is about the document, not the tab). EditorHeader already shows diff controls when `editorMode === 'diff'`. The diff-mode banner provides persistent context. VS Code has the same pattern.

**Verdict: Holds with two changes:**
1. Promote FR-8 from "Could" to "Should" — the "viewing version" indicator with "Now" escape is important.
2. Add D6: "Diff mode persists across DocPanel tab switches — exiting diff requires explicit user action."

## Summary

| # | Challenge | Verdict | Action needed |
|---|-----------|---------|---------------|
| 1 | Tab bar crowding at 5 tabs | Holds | None |
| 2 | Prop threading depth | Holds with caveat | Note EditorPaneContext as extraction if prop count crosses 10 |
| 3 | Controlled vs uncontrolled DocPanel | Holds | D2 DIRECTED is right; both approaches valid |
| 4 | Loss of simultaneous timeline + other tabs | Holds | Make tradeoff explicit |
| 5 | Diff mode lifecycle mixing | Holds with changes | Promote FR-8; add D6 for diff-persistence |
