# Nick — V0 launch audit (last 48h)

**Stories/track:** Editor Internals / CRDT / MDX Pipeline (Nick territory per PROJECT.md §914). "Now" track: TQ5 Observer A character-level diff refactor + TQ6 US-3e stress test + bridge-matrix tests. NOT explicitly V0-N story; runs as research-infra independent track for V0-14 prerequisite.

**48h activity summary:** 58 commits authored by Nick Gomez since 2026-04-12 00:00. 3 major PRs merged in window (#101, #95, #83 all on 2026-04-13). 1 spec/reports bulk update. Commits span core markdown hardening, remark-prosemirror migration completion, and test coverage (I8-I11 invariants). Zero commits to `observers.ts:206-249` TQ5 refactor; that work deferred.

**Verdict:** Nick shipped high-value MDX guard hardening + remark-prosemirror migration hardening (post-migration stabilization). TQ5 (Observer A char-level refactor) remains PENDING — not landed in 48h window despite being declared "Now" priority.

**Material deviations:** 1 scope cut (TQ5 deferred), 1 scope add (test pyramid I8-I11 invariants beyond declared scope).

---

### Nick Territory — Editor Internals / CRDT / MDX Pipeline

- **Phase bucket:** Now (independent track for V0-14 prerequisite) + Temporary handoff work (PR #12, #23)
- **Claimed status (PROJECT.md):** Now: TQ5 Observer A character-level diff refactor (~60 LOC in `observers.ts:206-249`). TQ6 US-3e stress test. Bridge-matrix undo-invariant tests. Temporary: PR #12 (Component slash insert), PR #23 (Typed component nodes) — both until MDX pipeline clean.
- **Actual status (verified):** TQ5 NOT STARTED (0 commits to target range). TQ6 completed (US-005 + US-006 + US-007 stress tests merged). MDX pipeline stabilization SHIPPED (3 PRs merged, 17 commits core + test). PR #12/#23 handoff work PENDING (not in 48h activity).
- **Evidence:**
  - PR #101 (merged 2026-04-13 20:01 UTC): "refactor: post-migration hardening — guard fixes, parseSafe, I8-I11 test pyramid, prosemirror dedup" — 6887d34. Tests I9 (guard completeness invariant) + I10 (structural crash resistance) + I11 (nested/truncated combinations).
  - PR #95 (merged 2026-04-13 17:44 UTC): "fix: R23 guard — bare `<`, `{`, and incomplete close tags + I8 crash-resistance invariant" — bd7e2d2. Guard robustness + test pyramid baseline.
  - PR #83 (merged 2026-04-13 12:41 UTC): "feat: markdown engine migration — marked + @tiptap/markdown → unified + remark + remark-prosemirror" — ee030b5. Migration completion.
  - Commits d8c52e9 (US-003 agnostic MDX mode), 9bcc358 (US-002 jsxInline PM node), 3d6da49 (US-001 rawMdxFallback PM node) — spec finalization work, not implementation.
  - TQ5 refactor not found in git log — `git log --since="2026-04-12" -- packages/core/src/extensions/observers.ts` returns zero Nick commits.

- **Deviation from spec:**
  - **Scope cuts:** TQ5 (Observer A character-level refactor, declared "Now" priority) deferred/not started. Per PROJECT.md TQ6: "Character-level refactor reclassified as edge-case improvement (US-3e), not prerequisite" — but PROJECT.md §918 still says "Starting now." Ambiguity in spec + actual deferral.
  - **Scope adds:** Test pyramid I8-I11 invariants (guard crash-resistance + structural combinations) go beyond TQ6's declared stress-test scope. These are valuable hardening adds, not planned scope.
  - **Match summary:** MDX hardening shipped strong; TQ5 deferred without explicit re-plan note in PROJECT.md.

- **48h activity:** 58 commits. Top commits:
  - d8c52e9 [US-003] Agnostic MDX mode + remove remark-directive + simplify parseSafe
  - c15e964 fixup! local-review: address findings (pass 1)
  - 9bcc358 [US-002] Add jsxInline PM node at Layer 3 target shape + R9 isolating on jsxComponent
  - 3d6da49 [US-001] Add rawMdxFallback PM node + schema snapshot + R10 add-only invariant test
  - 6887d34 [PR #101] refactor: post-migration hardening — guard fixes, parseSafe, I8-I11 test pyramid, prosemirror dedup
  - bd7e2d2 [PR #95] fix: R23 guard — bare `<`, `{`, and incomplete close tags + I8 crash-resistance invariant
  - ee030b5 [PR #83] feat: markdown engine migration — marked + @tiptap/markdown → unified + remark + remark-prosemirror
  - Plus 51 project-planning and spec/reports commits (V0-26, V0-24, V0-25, V0-22 ownership/planning updates).

- **Blockers / risks:**
  - TQ5 (Observer A refactor) remains unstarted. No blocker identified; appears to be deferred decision or lower priority vs. MDX stability.
  - Miles (V0-14 undo owner) depends on TQ5 landing before wiring UndoManager (per PROJECT.md §924 "Miles starts UM wiring after Nick's TQ5 lands"). If TQ5 slips further, V0-14 Cmd+Z timeline at risk.
  - PR #12 (Component slash insert) and PR #23 (Typed component nodes) both pending — Dima's future Fumadocs bet blocked on these handoffs.

- **Reviewer note (for Nick/self):** TQ5 deferral not reflected in PROJECT.md; recommend explicit update to "Next / Later" + clarify 48h prioritization vs. Miles's V0-14 dependency chain. MDX hardening (I8-I11) is excellent scope-add defensibility — guards against real crash modes found by PBT. Consider surfacing risk/mitigation clarity on V0-14's TQ5 dependency.
