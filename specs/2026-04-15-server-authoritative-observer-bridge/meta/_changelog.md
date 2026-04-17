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

---

## 2026-04-15 — Audit + Challenger findings routed

Ran `/spec §6` nested subprocesses: `/audit` + challenger (reading `design-challenge-protocol.md`), both against current SPEC.md state on worktree `server-authoritative-bridge` atop post-merge baseline `3eb50c2`. Auditor: 10 findings (4H/4M/2L), 41 turns, $4.39. Challenger: 12 findings (4H/5M/3L), 22 turns, $2.89.

**Baseline commit field updated** to `3eb50c2` (post-merge of PR #146 on main) — prior value referenced stale pre-merge SHAs.

**Pure corrections applied (12):**

| From | Finding | Fix |
|---|---|---|
| Audit H1 | Hocuspocus has no `onDestroyDocument` hook — unbound handler → memory leak | §7b: replaced `onDestroyDocument` → `afterUnloadDocument` in extension code sample |
| Audit H4 | FR-1 said `onLoadDocument`; SA-D9 says `afterLoadDocument` (correct — persistence populates in onLoadDocument) | FR-1: changed to `afterLoadDocument` (matches SA-D9 + §7b code) |
| Audit M1 | `standalone.ts:210`/`:825` line numbers wrong | §8: updated to `:213` (var decl) + `:845` (call) |
| Audit M2 | `observers.ts:440-500` wrong for `applyUserDelta` | `evidence/root-cause-multi-writer-rga-interleave.md`: corrected to `:280-319` |
| Audit M3 | §7b mischaracterized extension wiring (CC1Broadcaster + AgentSessionManager are NOT Hocuspocus extensions; omitted liveDerivedIndexExtension) | §7b: rewritten to list persistence.extension, liveDerivedIndexExtension, apiExtension via `configuration.extensions.push()`; noted the two standalone classes |
| Audit L1 | FR-13 said "precedent after #10 and #11"; CLAUDE.md has #1-#13 | FR-13: updated to "new precedent #14, after #11-#13 added by 2026-04-14 spec" |
| Audit L2 | ManualScheduler `test-harness.ts:578` wrong | §8: updated to `:587` (interface) + `:601` (factory) |
| Challenger C-M1 | Frontmatter sync unspecified in server Observer port | FR-1 + §7a code comments: explicit requirement to port `observers.ts:500-513` frontmatter logic symmetrically |
| Challenger C-M2 | `REMOTE_TREE_SYNC_GRACE_MS` omission rationale missing | §7a comments: documented grace-window omission — origin guard replaces timing guard on server |
| Challenger C-L1 | Single-threaded event loop assumption implicit | Assumption A7 added: server observer correctness requires single-threaded Y.Doc access per document |
| Challenger C-L2 | "+50ms" latency is best-case only | NFR Performance rewritten with full 6-step path: 25ms best / 60-120ms typical / 400-500ms worst; target <150ms p95 for docs <2K lines |
| Challenger C-L3 | V0-14 safety relies on event-loop serialization, undocumented | §7a note added: `applyAgentMarkdownWrite` runs as synchronous `doc.transact`; observer fires as subsequent setTimeout callback; V0-14's `applyAgentUndo` inherits this guarantee |

**Decision-reopen (1 cluster):**

| From | Finding | Action |
|---|---|---|
| Audit H2+H3+M4, Challenger C-M4 (all same cluster) | SA-D12's original rationale ("direct document access does not trigger broadcast") is factually incorrect — Hocuspocus `Document` extends `Y.Doc`, so direct mutations DO propagate via `afterTransaction` → broadcast. But the decision to use `openDirectConnection` still holds for DIFFERENT reasons (connection-count lifecycle + explicit teardown + consistency with agent-sessions.ts). | SA-D12 rewritten with corrected rationale; §7b code sample rewritten to actually use `openDirectConnection` per SA-D12 (previously contradicted it). Decision remains LOCKED; marked "rationale revised 2026-04-15 after audit". |

**Outstanding for user:** 5-6 design challenges presented in session (see assistant response) — C-H1 awareness-gossip risk for mode broadcast; C-H2 CPU budget realism; C-H3 missing test scenarios C6-C9; C-H4 missing Mutation G; C-M3 server-side reconciliation as unevaluated alternative; C-M5 disconnect-then-mode-switch UX gap.

---

## 2026-04-15 — Design challenges resolved under greenfield lens

User directive: re-evaluate design challenges under greenfield principles (architectural correctness + clean codebase + best product experience, no pragmatism creep, no deferred tech debt). All 6 findings resolved with the stricter stance:

**C-H1 (mode broadcast gossip race):** Accepted. Resolution: **delete the feature flag entirely.** In a monorepo with atomic client+server deploy, the flag was pure ceremony — let the broken architecture coexist with its fix during a staged rollout that doesn't happen. Precedent #7 ("remove broken capabilities rather than shipping them") applies. SA-D5 revised from "runtime feature flag via env var + awareness broadcast" to "no feature flag; atomic PR deploy; rollback via git revert." FR-7 revised from "client gate behind option" to "delete client cross-CRDT write paths." FR-8 (feature-flag infrastructure) becomes just "Vite plugin migration." NG10 added documenting why no flag. SA-D11 (skip mid-session flips) removed — obsolete without a flag. Net effect: spec simplifies significantly — no handshake change, no awareness extension, no gossip-window race to mitigate, no mid-session flip edge cases. Client `observers.ts` estimated ~200 LOC reduction.

**C-H2 (CPU budget aspirational):** Accepted. Resolution: **replace unsubstantiated absolute targets with a substantiated relative target.** Original G7 "<5% at 10 clients, reject >20%" was a guess. Revised to: per-fire cost within 10% of pre-refactor client observer baseline at equivalent state + delta; fails acceptance if >2× regression on any seed. This is measurable (client baseline is instrumentable from pre-refactor code) and reflects the refactor's actual nature (relocation of logic, not compute-adding). NG9 added: markdown pipeline incremental serialization — explicitly out of scope for this spec; promoted to triggered-follow-on if the budget is systematically exceeded at target product scale. A2 (target scale) revised to 2-5 concurrent editors typical / ~20 stretch (Notion-style), not 100+.

**C-H3 (test coverage gaps):** Accepted. Resolution: **all 4 new scenarios (C6/C7/C8/C9) promoted to Must.** Under greenfield, deterministic regression gates for every unique code path — probabilistic fuzzer coverage is a floor, not a ceiling. C1-C9 all Must in FR-10. Adds ~6-8 hours test scope; no counter-argument under greenfield lens.

**C-H4 (Mutation G missing):** Accepted. Resolution: added Mutation G to FR-11 — revert the FR-7 deletion of client write paths → C1/C2/C3 all fail with multi-writer RGA interleave. Completes the validation triangle E/F/G. 30 min implementation. SA-D10 revised to include G.

**C-M3 (server-side reconciliation alternative not evaluated):** Accepted. Resolution: added as Option 8 to `evidence/rejected-alternatives.md` with full rejection rationale — user-visible corruption window (50-150ms of RGA-interleave visible in the editor as broken typing) is disqualifying for a prose editor; heuristic detection is non-trivial; corrective-write cascade risk. Under greenfield, architectural correctness beats expediency even at 3× the effort cost. Summary table updated to reflect the additional rejected option.

**C-M5 (disconnect-then-mode-switch UX gap):** Accepted. Resolution: **block mode-switch when disconnected.** SA-D13 (new) + FR-7a added. UI disables source-mode toggle when `provider.status !== 'connected'`; tooltip explains. This is the only option that meets all three correctness criteria (no-silent-stale-display / no-silent-edit-loss / no-confusion). Alternatives (warning-banner, hybrid-local-display, accept-trade-off) all fail at least one criterion. §5 failure-path journey rewritten.

**Net scope impact:** The C-H1 simplification (delete feature flag) *reduces* scope by more than the test additions + FR-7a UI *add* it. Revised spec is smaller and cleaner than the original. Total estimated scope: 3-4 days (unchanged from original — the additions fit in the scope freed by the flag deletion).

**Decision Log additions:** SA-D13 (disconnect blocks mode-switch), SA-D14 (substantiated per-fire budget). Revisions: SA-D5 (no flag), SA-D6 (deletion not gating), SA-D10 (includes Mutation G). Removals: SA-D11 (obsolete without flag).
