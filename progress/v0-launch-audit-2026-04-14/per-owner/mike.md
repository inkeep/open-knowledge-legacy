# Mike — V0 launch audit (last 48h)

**Stories owned:** 8 total (1 shipped, 2 in-progress, 5 remaining)
**Verdict:** Mike executed V0-8 (graph view) shipping 2026-04-13 and V0-12 (Unicode slug fix) shipping 2026-04-14 on-time with precise delivery. No material deviations detected; scope boundaries hold. V0-3, V0-5, V0-11, V0-13, V0-21, V0-25 remain unstarted; only V0-3 is critical path (must ship before launch).
**Material deviations:** None flagged; scopes match specification.

---

### V0-8 — Graph view of links
- **Phase bucket:** Now (close out)
- **Claimed status (PROJECT.md):** PR #76 OPEN; remaining work: review, performance validation, layout/placement, accessibility pass.
- **Actual status (verified):** SHIPPED — PR #76 merged 2026-04-13 20:55:12Z (commit 496a06d).
- **Evidence:** PR #76 merged 2026-04-13T20:55:12Z. 9 files changed (251 insertions in `GraphView.tsx` + 19 in backlink-index.ts, 23 in api-extension.ts + infrastructure). SHA e19d70d... Branch merged with "PR feedback and fullscreen button" commit authored 2026-04-13 20:47:44Z. No review comments blocking merge; ship clean.
- **Deviation from spec:**
  - **Scope cuts:** None detected. PR delivers core: `GraphView` React component consuming `GET /api/link-graph` endpoint backed by `BacklinkIndex.getLinkGraph()`, theme-aware via existing `next-themes`, panel integration in `EditorArea.tsx`, performance validation at ~5000-node scale not yet measured (marked as constraint in spec but not acceptance criterion).
  - **Scope adds:** None detected. Fullscreen button is a polish feature within reasonable scope.
  - **Match summary:** Delivered as specified; minor constraint (performance measurement at scale) deferred to optional refinement.
- **48h activity:** PR #76 merged 2026-04-13 20:55:12Z. One commit in window ("PR feedback and fullscreen button" 2026-04-13 20:47:44Z) after initial landing 2026-04-13 03:12:11Z. Spec finalized; ship clean.
- **Blockers / risks:** None. Feature complete and merged.
- **Reviewer note (for Nick):** V0-8 shipped. Constraint on performance validation at realistic KB sizes (5000+ nodes) was noted in spec but not acceptance criterion — can be measured post-launch if needed. Graph is live.

---

### V0-12 — Slug correctness (Unicode-safe + duplicate-heading anchors)
- **Phase bucket:** Now (must ship before launch)
- **Claimed status (PROJECT.md):** Not started. Scoped in detail. Migration path open (PQ9 TBD).
- **Actual status (verified):** SHIPPED — PR #123 merged 2026-04-14 16:24:46Z (commit e19d70d). Full Unicode-aware slug algorithm + duplicate-heading disambiguation landed 48h after started.
- **Evidence:** PR #123 merged 2026-04-14T16:24:46Z. Summary: "Use one shared heading-slug helper so non-ASCII pages keep stable targets and duplicate headings resolve consistently across the API and editor surfaces." 9 files changed (117 insertions); core change: replaced destructive `text.toLowerCase().replace(/[^a-z0-9]+/g, '-')` with NFKD-normalize + `\p{L}\p{N}` Unicode-aware algorithm in `packages/core/src/utils/slug.ts` (22 lines → shared heading-slug + dedup helpers); added `disambiguateSlug` and `getHeadingSlug` exports; updated `heading-anchors.ts`, `wiki-link-helpers.ts`, `api-extension.ts`, `api-pages.ts` consumers; 41 new tests (test corpus: Latin-accented, CJK, Cyrillic, emoji + dedup consistency). All gates pass (`bun run check`). PR body itemizes test plan (core slug tests, wiki-link extension tests, page-headings API tests, full gate).
- **Deviation from spec:**
  - **Scope cuts:** Migration path (S1.TQ2 / PQ9) deferred. Spec outlined three options: (a) rewrite-on-boot (no PR yet observed), (b) dual-resolve (not implemented), (c) empty-vault-only. PR #123 does NOT include migration code — fixes the algorithm and deduplication logic but does not rewrite existing non-ASCII slugs on upgrade. No evidence of Story 3 (V0-5 rename rewrite infrastructure) being used yet. **Flag for review:** Migration strategy still open; production deployment may require pre-flight data audit or opt-in dual-resolve window. Mike's PR comment should clarify whether this ships as (c) empty-vault-only or (a)/(b) with follow-up.
  - **Scope adds:** None. Delivered core fix exactly as specified.
  - **Match summary:** Core slug algorithm shipped; migration strategy not yet chosen (deferred decision per PQ9, not scope-add).
- **48h activity:** PR #123 created 2026-04-14 02:45 (createdAt), merged 16:24. Single commit (e19d70d) landing the full fix 2026-04-14 12:24:45. Authored via Cursor. No review friction; clean ship.
- **Blockers / risks:** **Migration path (PQ9) unresolved.** Spec notes three options; PR #123 implements the algorithm but not the vault-rewrite path. Existing vaults with non-ASCII titles will have broken links post-upgrade unless (a) on-boot rewrite is implemented, (b) dual-resolve is active during transition, or (c) launch targets empty vaults only. This is NOT a scope-add problem; it's a deliberately deferred decision per PROJECT.md. **Action for launch:** Confirm migration strategy with Mike or implement fallback (e.g., dual-resolve on heading-anchor lookup if old slug exists).
- **Reviewer note (for Nick):** V0-12 shipped core algorithm; migration strategy still TBD per deferred PQ9. Recommend confirming vault-handling strategy pre-launch (rewrite vs dual-resolve vs empty-vault-only).

---

### V0-3 — BacklinksPanel push-over-awareness (replace 2s polling)
- **Phase bucket:** Now (must ship before launch)
- **Claimed status (PROJECT.md):** Not started. Mike's.
- **Actual status (verified):** NOT STARTED — no branch, no PR, no recent commits under `BacklinksPanel` or awareness-push naming.
- **Evidence:** Git log since 2026-04-12 (48h window) shows no commits tagged with "backlinks push" or "awareness"; `git branch -a | grep -iE "backlinks|awareness"` returns no matches. `gh pr list --state all --author mike-inkeep` shows PR #123 (slug), #115 (markdown links), #105 (MDX), #76 (graph), #85 (dedupe). No V0-3 PR open.
- **Deviation from spec:**
  - **Scope cuts:** N/A (not started).
  - **Scope adds:** N/A.
  - **Match summary:** Story on critical path (Now phase) but not yet claimed by action.
- **48h activity:** No activity.
- **Blockers / risks:** **Critical dependency:** V0-2 push contract must be finalized by Andrew (PR #106 shipped 2026-04-13 88351e1 — server-side push broadcast + `CC1Broadcaster` + `__system__` awareness setup). Mike's V0-3 consumes this contract. V0-2 is shipped; V0-3 is unblocked. **Concern:** V0-3 is on the critical path for launch. With 48h elapsed and no start signal, confirm pickup urgently — this is a must-ship story.
- **Reviewer note (for Nick):** V0-3 unstarted but unblocked (V0-2 server-side shipped). Critical path item; recommend confirming Mike's pickup or reassigning if capacity is constrained.

---

### V0-5 — File rename + atomic backlink rewriting
- **Phase bucket:** Next (should-have to feel complete)
- **Claimed status (PROJECT.md):** Not started. Blocked on TQ5 staff-level decision (atomic-rewrite strategy). Mike's Story 3 has detailed scoping.
- **Actual status (verified):** NOT STARTED — no branch, no PR, no commits in atomic-rewrite pattern.
- **Evidence:** No PR open; no branch in git worktrees or local/remote. PROJECT.md explicitly lists "blocked on TQ5 staff-level decision (atomic-rewrite strategy)." No decision signal from 2026-04-12 onward in commit log or PR comments.
- **Deviation from spec:**
  - **Scope cuts:** N/A (blocked/not started).
  - **Scope adds:** N/A.
  - **Match summary:** Awaiting staff-level decision on crash-recovery atomicity (per-doc-with-journal vs all-in-one-transaction).
- **48h activity:** None.
- **Blockers / risks:** **Blocked on TQ5 (atomic-rewrite strategy decision).** Spec scopes two competing approaches with unknown launch implications. If decision lands, V0-5 can start; if deferred past launch, scope is Reach. Current signal: blocked, not started.
- **Reviewer note (for Nick):** V0-5 blocked on staff decision TQ5 (atomicity strategy). Confirm with Mike whether decision has landed or defer to post-launch.

---

### V0-11 — Graph panels (forward links, orphans, hubs)
- **Phase bucket:** Next (should-have to feel complete)
- **Claimed status (PROJECT.md):** Not started. Backend APIs all exist. Pure frontend work.
- **Actual status (verified):** NOT STARTED — no branch, no PR, no frontend implementation.
- **Evidence:** No commits since 2026-04-12 tagged with "panels", "orphans", "hubs", or "forward-links". `git branch -a | grep -iE "panel|orphan|hub"` returns no matches. No PR open.
- **Deviation from spec:**
  - **Scope cuts:** N/A (not started).
  - **Scope adds:** N/A.
  - **Match summary:** Ready to start (backend endpoints live, panel-docking pattern from V0-9 ready to reuse). No scope deviations; story unstarted.
- **48h activity:** None.
- **Blockers / risks:** **Depends on V0-9 panel-docking pattern (Sarah).** PROJECT.md notes: "Adopts Sarah's panel-docking pattern (defined by Sarah as cross-cutting, first expressed in V0-9)." V0-9 shipped (PR #110/#116 with docking support). V0-11 unblocked. **Concern:** Next-phase story, not critical path, but noted as "highest-ROI story in the project" — backend is done, UI is pure React. Recommend prioritizing after Now-phase V0-3 lands if Mike has capacity.
- **Reviewer note (for Nick):** V0-11 unblocked (V0-9 docking pattern shipped). Pure frontend work on live endpoints. Recommend post-V0-3 if Mike capacity permits.

---

### V0-13 — `suggest_links` MCP tool (unlinked mentions)
- **Phase bucket:** Later (polish + gated)
- **Claimed status (PROJECT.md):** Depends on V0-12 slug correctness. Promote when v0 ships and agent workflows show evidence.
- **Actual status (verified):** NOT STARTED — no branch, no PR, no MCP tool implementation. **Blockage lifted:** V0-12 shipped 2026-04-14 16:24:46Z, so slug-correctness dependency resolved. Tool can start immediately if prioritized.
- **Evidence:** No commits or PRs tagged "suggest_links", "unlinked mentions", or "mention discovery" since 2026-04-12. No MCP tool skeleton in `packages/cli/src/mcp/tools/`. Spec is Story 2 in `stories/wiki-links-next/STORY.md` (lines 127–195).
- **Deviation from spec:**
  - **Scope cuts:** N/A (not started).
  - **Scope adds:** N/A.
  - **Match summary:** Story deferred (Later phase); dependency V0-12 now resolved. Ship decision pending agent-workflow validation post-launch.
- **48h activity:** None.
- **Blockers / risks:** None. V0-12 slug correctness dependency resolved. Tool is lower priority (Later) but technically unblocked if prioritized pre-launch.
- **Reviewer note (for Nick):** V0-13 unblocked (V0-12 landed). Later-phase story; decision on pre/post-launch deferred per scope.

---

### V0-21 — Dead-link checking (surface unresolved-wiki-link data)
- **Phase bucket:** Later (polish + gated)
- **Claimed status (PROJECT.md):** Not started. Tier 1 for v0 Next. Small scope; builds on shipped infrastructure.
- **Actual status (verified):** NOT STARTED — no branch, no PR, no endpoint `/api/dead-links` yet observed.
- **Evidence:** No commits or PRs tagged "dead-links", "unresolved", or "link-hygiene" since 2026-04-12. `git branch -a | grep -iE "dead|unresolved"` returns no matches. Backend `BacklinkIndex.getUnresolvedTargets()` API exists (PR #71 wiki-links infrastructure), but no endpoint or UI panel wrapping it.
- **Deviation from spec:**
  - **Scope cuts:** N/A (not started).
  - **Scope adds:** N/A.
  - **Match summary:** Spec is tight (expose existing unresolved-link data); ready to implement when scheduled.
- **48h activity:** None.
- **Blockers / risks:** None. Depends on V0-9 panel-docking pattern (Sarah) for UI adoption. Backend endpoints exist; UI layer awaits pattern from V0-9 (shipped). Small scope (Tier 1 description: "Just expose existing unresolved-wiki-link data").
- **Reviewer note (for Nick):** V0-21 Later-phase story; unblocked (V0-9 docking pattern + backlink index live). Recommend post-launch; small scope if prioritized.

---

### V0-25 — SQLite schematization (backlink index + config into Drizzle + Zod)
- **Phase bucket:** Reach (if capacity)
- **Claimed status (PROJECT.md):** Not started. **Reach goal — lower priority than Mike's core v0 work.** Ship if Mike has capacity after core stories land.
- **Actual status (verified):** NOT STARTED — no database migration, no Drizzle setup, no schema definition. Spec exists (PROJECT.md lines 457–501) but implementation deferred.
- **Evidence:** No SQLite-related commits or PRs since 2026-04-12. No `.open-knowledge/cache/ok.db` initialization code. No Drizzle dependencies in `package.json` (as of current git). Backlink index still in-memory Map + JSON serialization (no schema changes observed).
- **Deviation from spec:**
  - **Scope cuts:** N/A (Reach goal, explicitly deferred).
  - **Scope adds:** N/A.
  - **Match summary:** Full scope documented; implementation awaiting post-core-stories capacity.
- **48h activity:** None.
- **Blockers / risks:** None. Reach goal explicitly deprioritized. Architecture decision (Drizzle vs Prisma, per-branch schema) documented; foundation for post-v0 search bet (Orama vs FTS5+sqlite-vec research).
- **Reviewer note (for Nick):** V0-25 Reach goal. Ship decision post-launch if Mike capacity permits. Prerequisite documented for post-v0 search bet.

---

## Summary by status

| Story | Phase | Status | Days ago | Notes |
|-------|-------|--------|----------|-------|
| V0-8 | Now | ✅ Shipped | 2026-04-13 | Merged PR #76; graph view live. Performance constraint (scale measurement) optional. |
| V0-12 | Now | ✅ Shipped | 2026-04-14 | Merged PR #123; Unicode slug + dedup live. Migration strategy (PQ9) deferred. |
| V0-3 | Now | ⚠️ Not started | — | Unblocked (V0-2 shipped); critical path. Recommend immediate pickup. |
| V0-5 | Next | 🔒 Blocked | — | Blocked on TQ5 (atomicity strategy). Awaiting staff decision. |
| V0-11 | Next | ⏸️ Not started | — | Unblocked (V0-9 docking pattern shipped). Pure React; high-ROI. Recommend post-V0-3 if capacity. |
| V0-13 | Later | ⏸️ Not started | — | Unblocked (V0-12 shipped). Deferred; depends on agent-workflow validation. |
| V0-21 | Later | ⏸️ Not started | — | Unblocked (V0-9 docking pattern shipped). Small scope; post-launch likely. |
| V0-25 | Reach | ⏸️ Not started | — | Reach goal; deprioritized. Post-v0 search prerequisite. |

---

## Critical path concerns

1. **V0-3 (BacklinksPanel push):** Must ship. Unblocked 2026-04-13 when V0-2 landed. No start signal yet in 48h window. **Action:** Confirm pickup or reassign.
2. **V0-12 migration strategy (PQ9):** Algorithm shipped; migration path (rewrite vs dual-resolve vs empty-vault-only) still deferred. **Action:** Confirm strategy pre-launch to avoid data corruption or user confusion on upgrade.

---

## PR velocity (Mike, 48h window)

| PR | Title | Merged | Commits | Files | Notes |
|----|-------|--------|---------|-------|-------|
| #123 | fix(core): preserve Unicode slugs and heading anchors | 2026-04-14 16:24Z | 1 | 9 | V0-12 ship; full test coverage. |
| #115 | feat: internal markdown links as first-class KB links | 2026-04-14 03:31Z | 1 | 13 | Scope-add benefit (markdown link parity); landed mid-day. |
| #76 | Graph view of links | 2026-04-13 20:55Z | 5 | 9 | V0-8 ship; reviewed + fullscreen refinement. |

**3 PRs, 2 core V0 stories shipped, 1 scope-add benefit landed. Velocity: 2 critical-path stories closed in 48h.**

