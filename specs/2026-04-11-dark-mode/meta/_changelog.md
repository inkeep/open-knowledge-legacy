# Changelog — dark mode spec

Append-only process history. Most recent at top.

## 2026-04-11 — Spec scaffold and initial decision batch

- Created `SPEC.md` skeleton at baseline commit `2e27338`.
- Wrote evidence files:
  - `current-state-tokens.md` — confirmed full `.dark` token block + Tailwind v4 dark variant already exist in `globals.css`; documented mechanism gaps.
  - `gap-inventory.md` — exhaustive HIGH/MEDIUM/LOW severity catalog of every surface in `packages/app` that won't theme correctly. 11 HIGH, 8 MEDIUM, 1 LOW.
  - `reference-impl-agents-manage-ui.md` — captured what we mirror from the Next.js reference (provider config, toggle UI) vs adapt for Vite SPA.
  - `codemirror-dark-theme.md` — surveyed CM6 dark theme options; recommended `@codemirror/theme-one-dark` for MVP with token-mapped theme as Future Work.
  - `vite-spa-fouc.md` — designed inline FOUC-prevention script for Vite SPA; documented next-themes storage format compatibility (JSON-stringified values).
- Locked decisions D1-D8 from the initial batch:
  - D1: Three-state toggle (light/dark/system), system default
  - D2: Toggle in EditorHeader right cluster
  - D3: `next-themes` (non-Next usage)
  - D4: Scope = `packages/app` only
  - D5: Inline FOUC script in index.html
  - D6: CodeMirror gets `@codemirror/theme-one-dark` via Compartment
  - D7: Storage key `ok-theme-v1`
  - D8: `disableTransitionOnChange` matching reference
- Open questions Q1-Q6 surfaced — all P0, none blocking; resolvable during implementation visual review.

## 2026-04-11 — Decision batch 2 (placement + MEDIUM scope)

- D9 LOCKED: ThemeToggle is leftmost in EditorHeader right cluster (before PresenceBar and AgentUndoButton). Rationale: keeps collaboration affordances grouped; theme reads as "view setting."
- D10 LOCKED: All MEDIUM-severity gap-inventory items (#12-#19) are In Scope for MVP, not deferred. Rationale: 1-line CSS additions in same file; cost to defer exceeds cost to do upfront.
- Cascade applied:
  - §6 R7 acceptance criteria expanded to include strikethrough + selectedCell.
  - §9 placement language updated.
  - §13 Next Action 7 expanded; Next Action 9 simplified ("Visual review pass").
  - §13 Non-goals trimmed (no longer mentions deferred MEDIUM items).
  - §14 risk row "MEDIUM-severity items overlooked" downgraded — items now explicitly enumerated and scoped.

## 2026-04-11 — Audit + design challenge complete

**Auditor finding (HIGH, verified):** Assumption A2 was FALSE. `next-themes@^0.4.6` stores theme as a plain string, not JSON-encoded. The inline FOUC script as drafted would have called `JSON.parse("system")` and thrown a SyntaxError silently caught by try/catch — every dark user would have seen a light flash on cold load, defeating R3/R4.

**Corrections applied:**
- `evidence/vite-spa-fouc.md`: dropped JSON.parse from script; rewrote Verification section with accurate quote and noted prior version's incorrect claim.
- `SPEC.md §9`: clarified storage format read-as-plain-string.
- `SPEC.md §12 A2`: rewritten as resolved with HIGH confidence and verification source.
- `SPEC.md §14`: risk row clarified.

**Challenger finding C1 (HIGH, verified):** Gap inventory missed Callout.tsx (inline pastel hex), JsxComponentView.tsx (inline #f0f0f0), WikiLinkView.tsx (resolved/unresolved chips bg-sky-50/bg-red-50 with no dark variants), CreatePageDialog.tsx (text-red-600 error). Verified by reading each file. Two of these (Callout, JsxComponentView) require component refactor since inline styles can't be overridden by `.dark` CSS.

**Corrections applied:**
- `evidence/gap-inventory.md`: prepended new HIGH section with H-A through H-D entries.
- `SPEC.md §16 SCOPE`: expanded to include the four new files.
- `SPEC.md §10 D12 LOCKED`: documents the addition.

**Design challenges presented & dispositioned:**
- C2 (drop next-themes): Dismissed via D13. User explicitly chose D3; argument noted in design-challenge.md is sound but not load-bearing now that A2 is resolved.
- C3 (FileSidebar placement): Dismissed via D14. User explicitly chose D2/D9; FileSidebar footer is a future move.
- C4 (mental model trap): Accepted via D15. Documented as known limitation in §5; Future Work entry "Visual indicator on ThemeToggle when in explicit-mode" added.
- C5 (Compartment safety): Accepted via D16. A4 verification upgraded from "test during implementation" to focused integration smoke test; remount fallback documented.
- S5 (visual regression infra): Folded into Future Work (Noted tier).

**Open questions closed:** Q2 (folded into gap-inventory #14, In Scope), Q5 (closed with D8 default), Q6 (promoted to D11).

Decision Log now D1-D16. All In Scope items pass resolution completeness gate.
