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

## 2026-04-13 (team ownership map + design→impl pattern + dead-link checking + post-v0 deprioritizations)

### Team ownership reference added

New top-of-document section ("Team ownership reference") laying out per-person scope across 7 team members (Andrew, Mike, Miles, Tim, Dima, Sarah, Nick) plus cross-cutting concern owners. Per-person view complements the per-story Distribution table.

### Design → implementation handoff pattern formalized

For UI stories that are design-taste-heavy in spec but mechanical in build, Sarah specs and Dima implements. Sarah reviews. Pattern explicitly applied to:
- **V0-9 outline panel** (NEW story, split from V0-11): Sarah designs panel-docking pattern + interaction; Dima implements scroll integration with TipTap + CodeMirror, IntersectionObserver active-heading detection, tree rendering
- **V0-10 Cmd+K**: Sarah designs interaction model + visual; Dima implements fuzzy-match library + performance + keyboard state machine + Floating UI overlay
- **V0-18 find/replace**: Sarah designs; Dima implements TipTap + CodeMirror coordination
- **V0-19 sort + word count**: Dima implements both (Sarah reviews placement)

Sarah's scope now centers on novel UX, pattern-setting, taste decisions. Dima's stack includes mechanical UI implementation in addition to his sidebar/CRUD/docs-system territory.

### New stories added

- **V0-9 Document outline panel** (Next phase) — split out from V0-11 per Sarah-owns-outline-experience decision. Sets the panel-docking visual pattern V0-11 adopts.
- **V0-21 Dead-link checking** (Next phase) — Mike + Tim. Tier 1 scope: surface existing unresolved-wiki-link data via UI panel + MCP tool (BacklinkIndex already tracks this). Tier 2 (external URL validation) and Tier 3 (section-anchor validation) deferred to post-v0.

### Story scope changes

- **V0-11** scope reduced from 4 panels (outline + forward + orphans + hubs) to 3 panels (forward + orphans + hubs) since outline became V0-9. Mike still owns; adopts Sarah's panel-docking pattern from V0-9.
- **V0-2** ownership made explicit: Andrew (server push infra) + Dima (client sidebar consumer)
- **V0-3** ownership made explicit: Mike (consumer) + Andrew (push infra)
- **V0-7** ownership clarified as layered: Sarah (feature + UI) + Andrew (state.json + init scaffolding primitives)
- **V0-17** ownership confirmed: Miles end-to-end (1:1 with his change-attribution feature area)
- **V0-18, V0-19** owners updated per design→impl pattern

### Owner clarifications across team

| Decision | Owner | Note |
|----------|-------|------|
| Server-side broadcast (CC1) | Andrew | Confirmed |
| Persistence indicator UI (V0-17) | Miles end-to-end | Per feature-owner-1:1-with-feature principle |
| Keyboard shortcut scheme | Sarah | Cross-cutting design |
| OpenTelemetry / instrumentation (PR #36) | Andrew | Confirmed |
| Component slash insert (PR #12) | Nick → Dima (post-MDX-pipeline-clean) | Handoff plan |
| Slash-command-generalization (Draft spec) | Dima long-term | Engineering refactor; Nextra-adjacent |
| Outline panel | Sarah designs + Dima implements | Split from V0-11 graph panels |
| Electron desktop app | Andrew (staged) | Later; gated on spec promotion |
| Testing / CI / quality gates | Andrew | Cross-cutting |
| Permissions model | Miles (if needed) | Future |
| Docs site / Fumadocs | Dima | Plus future "OK as Fumadocs editor" bet (long-term, Nick consulting on MDX) |
| Frontmatter UX | Sarah | Future feature |
| Dead-link checking | Mike + Tim | New V0-21 |
| Assets / Raw folder structural | Andrew | Mike consulted on lifecycle semantics |
| A11y as engineering practice | **Dima POST-V0** (deprioritized 2026-04-13) | Baseline a11y stays as engineering hygiene in v0; formal practice + compliance + tooling moves post-v0 |

### Post-v0 section added

New "Post-v0" section enumerates items explicitly deprioritized to post-v0 with promote triggers:
- A11y as a formal engineering practice (compliance audit, axe-core in CI, Playwright a11y suite) — deprioritized 2026-04-13
- Full-text search bet (Mike, separate project)
- User-facing version history UI beyond Timeline (Miles, separate project)
- Electron native distribution (Andrew, separate project; V0-20 is the gating story)
- Multi-project switching Part B (separate bet)
- "OK as Fumadocs editor" future bet (Dima long-term, Nick consulting)
- Permissions model (Miles, future, if needed)
- Suggestions / tracked changes (PQ11 parked with branching/draft UX bundle)
- Dead-link checking Tier 2/3 expansions

### Counts updated

- Now: 9 stories (unchanged)
- Next: 5 → 7 (added V0-9 outline + V0-21 dead-link)
- Later: 4 → 5 (corrected count; V0-13 was already there)
- Total: 17 → 19 + the newly explicit post-v0 section

### Future bet added to non-goals

"OK as a WYSIWYG editor for a Fumadocs project" — Dima long-term owner; Nick consulting on generalizable MDX editing + component rendering. Promote when v0 ships AND MDX pipeline stabilizes.

### Andrew load watch added

Andrew's stack is platform-heavy after this round. Note added: if Electron promotes from staged before v0 ships, or testing/CI needs formal investment, consider splitting.
- **Pre-mortem**: 7 failure modes documented with mitigations. Top risk: V0-2 real-time sidebar spec resolution taking longer than expected (5 OQs in draft spec).
- **Delete** old `projects/day-0-editor-completeness/` — absorbed into v0-launch.
- **Leave** `stories/init-and-project-switching/` in place (Part A absorbed as V0-7 with source-of-truth reference; Part B stays standalone as sibling bet).
- **Leave** `stories/wiki-links-next/` in place (source-of-truth for Mike's detailed scoping; v0-launch references it).
- **Leave** `stories/collaboration-capabilities-audit/` in place (decision brief, not implementation story).
