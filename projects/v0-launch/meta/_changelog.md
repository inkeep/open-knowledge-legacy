# Changelog — v0-launch

## 2026-04-13

- **Created** v0-launch master project consolidating 4 prior planning surfaces:
  - `projects/desktop-readiness/` (Andrew, on chore/restore-scoped-reports) — 5 stories
  - `projects/day-0-editor-completeness/` (this branch, prior work in PR #75) — 7 stories
  - `stories/wiki-links-next/` (Mike, PR #72 draft) — 4 stories
  - `stories/collaboration-capabilities-audit/` (Miles, PR #72) — 4 areas (3 actionable)
- **Consolidated** into 17 stories (V0-1 through V0-20, with skipped IDs for carve-outs).
- **Scope discipline:** Document covers UNFINISHED work only. Already-shipped foundations referenced as substrate, not re-enumerated as stories. See PROJECT.md strategic-context and evidence/competing-decompositions.md.
- **Phasing:** Now (8 stories, 6-8 weeks), Next (5 stories), Later (4 stories).
- **Dropped** (already shipped):
  - Dark mode (desktop-readiness Story 4 part) — PR #60, #63 shipped
- **Parked** (per PQ11):
  - Area D suggestions / tracked changes (from collaboration audit) — lives in combined "agent-proposal review" design bundle
- **Consolidation rationale:** ~40% direct overlap between surfaces (file rename in 3, real-time sidebar pattern in 2, first-run in 2); four authors planning in parallel without single source of truth would duplicate spec work.
- **Open coordination items:** XQ1 (Mike confirms absorption of Stories 1/3/4), XQ2 (Miles confirms PR #39 ownership stays), and walk-through with Andrew on desktop-readiness retirement.
- **Items table**: 30 items total — 12 Decided, 7 Open (all P0 spec-phase decisions), 8 Assumed (with verification plans), 3 Parked.

## 2026-04-13 (graph view + attribution corrections)

- **Added V0-8: Graph view of links** — promoted from "out of scope (parity-for-parity's-sake)" to Now phase in-flight close-out. Mike's PR #76 is actively shipping (296 LOC, 7 files, `react-force-graph-2d` dependency, `/api/link-graph` endpoint + `BacklinkIndex.getLinkGraph()`). V0-8 pairs with V0-11 (graph panels) as complementary list-form + visual-form surfaces on the same backend data.
- **Removed graph view from bet-level non-goals.** The "parity-for-parity's-sake unless it differentiates" exclusion was overruled by concrete in-flight shipping + differentiation argument (core Obsidian-grade feature recognizable to evaluators).
- **Now phase expanded from 8 to 9 stories.** Three of nine are in-flight close-outs (V0-6 image paste, V0-8 graph view, V0-16 Timeline).
- **Attribution corrections:**
  - PR #41 (image paste) owner: Sarah (confirmed from `sarah-inkeep`)
  - PR #72 (wiki-links-next bundle): authored by Nick, stories prepared for Mike as decision-maker (was previously incorrectly attributed as "Mike's PR #72")
  - XQ1 expanded to cover Mike's coordination surface (PR #72 bundle + PR #76 graph view — Mike is both decision-maker and direct author)
  - Distribution table updated: Mike labeled as "story decision-maker" (not "story author") for V0-3/V0-5/V0-12/V0-13; Mike labeled as "PR #76 author" for V0-8.
- **Merged since last revision:** PR #81 (wiki-link menu flash bug fix). No v0 scope impact.
- **Pre-mortem**: 7 failure modes documented with mitigations. Top risk: V0-2 real-time sidebar spec resolution taking longer than expected (5 OQs in draft spec).
- **Delete** old `projects/day-0-editor-completeness/` — absorbed into v0-launch.
- **Leave** `stories/init-and-project-switching/` in place (Part A absorbed as V0-7 with source-of-truth reference; Part B stays standalone as sibling bet).
- **Leave** `stories/wiki-links-next/` in place (source-of-truth for Mike's detailed scoping; v0-launch references it).
- **Leave** `stories/collaboration-capabilities-audit/` in place (decision brief, not implementation story).
