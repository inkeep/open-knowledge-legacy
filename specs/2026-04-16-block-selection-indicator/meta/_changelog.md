# Changelog — 2026-04-16-block-selection-indicator

## 2026-04-16 — Spec authored (Phase 1)

- Created SPEC.md based on pre-existing research report `reports/block-selection-indicator-patterns/`.
- All P0 decisions (D-1 through D-9) resolved inline from research evidence — no open questions.
- Baseline commit: `041603c` (tip of `worktree-component-blocks-v2`).
- Evidence files referenced from the research report (same worktree); no new evidence required for spec authoring.
- Ship phase transition: Phase 1 (spec) → Phase 1 exit (state init).

## 2026-04-16 — Phase 3 implementation complete (12/12 stories, 8/8 E2E)

- All 12 user stories (US-001 through US-012) implemented and committed.
- Full Playwright selection-indicator E2E suite: 8/8 scenarios green after subscriber-re-render + drag-event fixes committed as 3697790.
- 23 selection-state-plugin + compute-selection-anchor unit tests passing.
- Precedents #15 through #20 codified in CLAUDE.md + AGENTS.md (also deduplicated from 16× repetition to canonical 733 lines as in-scope cleanup).
- Fix deviations (committed in-scope per greenfield directive, documented in D-9 revision):
  - **D-9 revision (US-006)**: Floating UI proof-usage is a dedicated hook integration test + pure `computeSelectionAnchor` unit test rather than production Radix Popover rewire. Rationale: Radix Popover already uses Floating UI internally; dual-source positioning adds risk without signal.
  - **Subscription pattern (US-002/US-008)**: `useBlockSelection` subscribes via `editor.on('transaction')` + `'selectionUpdate'` — the canonical TipTap integration used by BubbleMenu, SideMenu, suggestion plugins — rather than `useSyncExternalStore` against a PluginView.update notifier. Empirically the latter produced stale-closure re-render failures under React 19 + Strict Mode.
  - **Drag event handling (US-001)**: Drag listeners registered on `view.dom` in capture phase (in the plugin's `view()` method) rather than `handleDOMEvents.dragstart/end/drop`. Reason: NodeView `pmViewDesc.stopEvent()` intercepts drag events before PM's `handleDOMEvents` chain.
- Phase 3 complete; transition to Phase 4 (/docs).
