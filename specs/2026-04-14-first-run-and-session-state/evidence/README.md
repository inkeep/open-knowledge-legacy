# Evidence pointer

Sources for this spec:

- **Linear ticket:** [PRD-6522 V0-7](https://linear.app/inkeep/issue/PRD-6522/v0-7-first-run-onboarding-session-persistence-starter-document)
- **Project doc:** `projects/v0-launch/PROJECT.md` §V0-7 (lines 878–902), PQ6 (1014), TQ7 (1026), TQ8 (1027), TQ9 (1028), CC6 (1064)
- **Sibling spec:** `specs/2026-04-14-multi-project-path/SPEC.md` — the multi-project CLI/hub work this one is complementary to
- **Related research:**
  - `reports/onboarding-multiproject-ux/REPORT.md` — original onboarding research
  - `reports/onboarding-walkthrough-audit/REPORT.md` — the F3 finding that motivates the "suspicious" welcome variant
- **Story:** `stories/V0-7-onboarding/STORY.md` — referenced in the Linear ticket; not read in this session but pointed at here for implementation handoff

The key insight that expanded this spec's scope beyond the ticket as originally written:

> "I think that the welcome screen is missing something. I think there is a high likelihood that users will add this to an existing knowledgebase with many documents. Perhaps not just an empty state, but also part of the saved state"

This rewrote the welcome-screen shape from two variants (empty / has-files) to four (empty / small / large / suspicious) and resolved TQ7 by making dismissal state part of `state.json`.
