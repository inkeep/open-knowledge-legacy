# Spec changelog

## 2026-04-14 — Session 1 (intake + scaffold)

- Created worktree `.claude/worktrees/graph-directory-coloring` on branch `feat/graph-directory-coloring` from `origin/main` @ `d6c6f42`.
- Intake Q&A resolved 5 seed questions:
  - Q1 → **1A + 1B** (orientation + navigation; both drive the spec)
  - Q2 → **(i) coloring granularity** (not visible-depth scope filter)
  - Q3 → **Teams** as primary persona
  - Q4 → **Flat vault = single color** (current behavior preserved)
  - Q5 → **Sidebar colors sync with graph colors** — sidebar doubles as legend; primitive must be shared across surfaces
- Locked decisions D0–D9 in SPEC.md §10 based on intake.
- Dispatched two `/explore` passes (graph surface; sidebar + color primitives) in lieu of full `/worldmodel` — feature scope is additive client-side rendering.
- Created evidence files:
  - `evidence/graph-view-surface.md`
  - `evidence/sidebar-and-color-primitives.md`
- Drafted SPEC.md §1–§13. §14 (Agent Constraints) and some OQs still open.
- 10 P0 open questions extracted (OQ1–OQ10); to be resolved in iterate loop.

## 2026-04-14 — Session 1 (iterate + cascade)

- Presented P0 batch (8 items, OQ1–OQ10 bundled) with recommendations.
- User confirmed all recommendations. Locked D10–D18.
  - D10: Palette — 12 hand-picked pastels, two theme variants, no CVD in v1.
  - D11: Path-depth semantics — prefix-truncation.
  - D12: Flat-vault UX — control always enabled, no-op.
  - D13: Active-node highlight — override directory color.
  - D14: Depth defaults — DEFAULT=1, MIN=0, MAX=5.
  - D15: Persistence — `localStorage('ok-graph-depth-v1')`.
  - D16: API shape — `colorForDocName` + `colorForFolderPath` delegating to `bucketKeyForPath`.
  - D17: Sync scope — per-browser only.
  - D18: Perf — no v1 optimization.
- Cascaded into SPEC.md §6.1–§6.7 (replaced single-function API with two-function shape, locked palette rationale, specified prefix-truncation, locked defaults).
- Populated §14 Agent Constraints (SCOPE / EXCLUDE / STOP_IF / ASK_FIRST).
- All P0 OQs resolved. Moving to audit phase.

## 2026-04-14 — Session 1 (audit: auditor pass)

- Dispatched `/audit` nested Claude Code instance. 5 findings (2 H, 2 M, 1 L).
- All 5 verified against codebase (no dismissals):
  - **[H1]** Fallback colors swapped + pure-gray HSL stripping blue-gray hue → applied: use hex `#9ca3af` (light) / `#6b7280` (dark) directly.
  - **[H2]** `safeLocalStorageGet/Set` not exported from `identity.ts` → applied: extract to new `packages/core/src/utils/local-storage.ts` (pure refactor); added to SCOPE; `identity.ts` imports the extracted helpers.
  - **[M1]** `hexToHsl`/`hslToHex` not exported; spec claim false → applied: removed from reuse list; palette uses pre-baked hex arrays, needs no runtime HSL conversion.
  - **[M2]** `/api/link-graph` payload shape wrong in evidence file → applied: corrected to `{ok, nodes: [{id,label}], links}`.
  - **[L1]** Evidence file had light/dark default colors swapped (root cause of H1) → applied: corrected evidence file.
- None of the findings reopened a decision; all were pure corrections or a minor scope clarification (adding `local-storage.ts`).
- Challenger subprocess still running.

## 2026-04-14 — Session 1 (audit: challenger pass)

- Challenger returned 5 findings (0 H, 2 M, 3 L).
- Triaged:
  - **[L3]** Private-function claims — dismissed as duplicate of auditor H2/M1, already fixed in auditor pass.
  - **[L4]** Framing softening of sidebar-sync importance — auto-applied (one-sentence edit to §1 Complication: "the graph discards directory information that is already encoded in docNames and displayed hierarchically in the sidebar").
  - **[L5]** Tooltip/collision note — auto-applied (added a paragraph to §6.3 noting existing `nodeLabel` behavior and the trivial follow-up if collisions surface).
  - **[M1]** Fullscreen breaks G3 — surfaced to user for judgment: keep FW1 (defer), qualify G3 explicitly, or add ~30-line overlay in v1.
  - **[M2]** Phasing (ship coloring alone first, then depth control) — surfaced to user for judgment: single PR (D9) vs two-PR phase. Estimated ~300–400 LOC total.

## 2026-04-14 — Session 1 (finalize)

- User resolved both surfaced challenger findings:
  - M1 → option C (add inline legend overlay in v1). Locked as D19.
  - M2 → single PR. Re-confirmed D9; logged explicitly as D20 for clarity.
- Cascaded D19:
  - Added §6.4a "Fullscreen legend overlay" with component spec.
  - Rewrote G3 — removed the "sidebar is visible" qualifier; overlay makes it unconditional.
  - Removed FW1 (promoted to v1).
  - Updated NG4 to reflect the new normal/fullscreen split.
  - Added `packages/app/src/components/GraphLegend.tsx` to §14 SCOPE.
- Mechanical adversarial checks passed:
  - All decisions D0–D20 have resolution status (LOCKED/DIRECTED). No ASSUMED/INVESTIGATING.
  - All 1-way doors (D0, D1, D4, D10, D11, D16) are LOCKED at HIGH confidence.
  - Non-goal temporal tags reviewed; NG4 updated to reflect D19 cascade.
- Set SPEC status to "Approved — ready for /decompose".
- Baseline commit retained at `d6c6f42` (no commits yet on branch).
