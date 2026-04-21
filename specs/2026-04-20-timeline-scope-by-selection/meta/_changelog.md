# Changelog — timeline-scope-by-selection

## 2026-04-20 — spec kickoff

- Created spec directory at `specs/2026-04-20-timeline-scope-by-selection/`.
- SCR problem frame + stress-test captured in SPEC.md §1.
- World model built from existing research report + 1P codebase inspection. Evidence captured in `evidence/current-state.md`.
- Key 1P insight: `activeTarget: ResolvedNavigationTarget` in DocumentContext already encodes user's current "view target" (doc / folder / folder-index / missing). Scope binding maps cleanly onto this — no new state machinery required.
- Draft SPEC.md written: problem, goals/non-goals, consumers, in-scope/out-of-scope, system context diagram, 6 user journeys, proposed design sketch, risks, assumptions, future work, acceptance criteria (AC1-AC11), agent constraints (draft).
- 8 open questions (D1-D8) queued for decision batch in first iterate round.
