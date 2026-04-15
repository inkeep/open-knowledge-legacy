# Changelog

## 2026-04-15 — Spec authored

Authored during the 2026-04-14 `bridge-convergence-under-concurrent-writes` ship's post-hardening pass.

**Source of findings:**

1. `/assess-findings` pass identified 7 hardening items in FR-17 fuzzer + test harness.
2. Commits 1-5 of hardening landed (precedent #1 fix, Scheduler DI, clock unification, full-body oracle, origin-laundering rigor).
3. Commit 6 (op distribution rebalance + D18 gate tightening) revealed an architectural issue: the 2-4% fuzzer convergence-timeout flake is a real multi-client production race, not an infra timing issue.
4. `/debug` Phase 5 report identified root cause: Observer A multi-writer RGA interleave (see `evidence/root-cause-multi-writer-rga-interleave.md`).
5. `/research` pass evaluated alternatives (awareness leader election, per-paragraph IDs, Y.Map replacement, LWW at Y.Text primitive layer, server-authoritative, UX mode-locking, unified YType). Server-authoritative chosen as the architecturally-correct-within-constraints answer (user directive: "moving away from bidirectional observers is not an option"; symmetric coverage directive: "research more and also think through the test plan so we can have coverage for this class of concurrent writers on either side").
6. Session-budget assessment: 3-4 day refactor exceeds remaining session capacity. Chose Option X: write SPEC now + close current ship cleanly + land the refactor in a dedicated fresh-context ship.

**Spec supersedes:**

- 2026-04-14 hardening Commit 6 (op distribution rebalance) — folded into this spec's FR-10.
- 2026-04-14 hardening Commit 7 (regression corpus + V0-14 breadcrumb) — corpus naturally populated by this spec's C1-C5 tests and Mutation E/F. V0-14 breadcrumb becomes a cross-reference from AGENTS.md precedent.

**Does not supersede:**

- 2026-04-14 `bridge-convergence-under-concurrent-writes/SPEC.md` D1-D18 LOCKED decisions. This spec extends that one.
- Bug-D handoff to V0-14 (still handed off; `applyAgentUndo` shape unchanged).
