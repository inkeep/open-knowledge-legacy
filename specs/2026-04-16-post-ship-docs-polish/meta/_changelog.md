# Changelog — post-ship docs polish

Append-only process record. New entries at top.

---

## 2026-04-16 — Spec created from in-flight worktree state

**Context.** Three deliverables already implemented in `docs/post-ship-polish` worktree (uncommitted at baseline `fa0050a4`). Spec retroactively scopes + documents + gates them. Two optional items considered + deferred.

**Actions:**

- Created `specs/2026-04-16-post-ship-docs-polish/` directory structure.
- Authored SPEC.md with: problem (SCR), goals + non-goals (5 NGs), scope, 10 requirements with AC, design (3 sub-sections), 6 metrics, 7 risks, rollout plan, 10-entry decision log (D1-D10), open questions (3 P2), 5 assumptions, future work (5 items across 3 maturity tiers), agent constraints.
- Inline world model (skipped `/worldmodel` subagent dispatch due to scope proportionality — session context already comprehensive).
- Investigated:
  - `.changeset/config.json` — confirmed fixed-linked packages; private-package publishing model.
  - `packages/core/package.json` — confirmed `"private": true`; READMEs don't ship.
  - `AGENTS.md` grep for stale I1-I10 refs — confirmed no additional stale refs beyond the 4 already-edited lines.
  - Baseline commit: `fa0050a4` (matches `origin/main`).
- Verified P0 decisions with HIGH confidence: D1 (single PR), D2 (defer rawMdxFallback test), D3 (defer fidelity-attrs doc), D5 (don't move I11 file), D6 (README location), D7 (real-number worked examples), D9 (no turbo/gitignore changes), D10 (CONSIDER.md out of scope).
- D4 (don't amend sister spec) and D8 (skip changeset) are DIRECTED — recommendation with reviewer fallback.

**D8 confirmed LOCKED** (2026-04-16): user authorized skip-changeset path. Reviewer-fallback retained.

**Cross-spec CONSIDER.md for PR #161:** produced during /assess-findings investigation of a fuzz-flake finding; moved to `.claude/worktrees/ship-lossless-bridge-merge/` (new worktree off `origin/main`, branch `ship/lossless-bridge-merge`) to keep this worktree focused. Out of scope for this PR.

**Deferred to next phase:** Audit (step 6) + finalize (step 7-8).

---

## 2026-04-16 — Audit + challenger complete; /assess-findings routed

**Auditor output:** `meta/audit-findings.md` — 13 findings (2 High, 4 Medium, 5 Low, 2 Nit).

**Challenger output:** `meta/design-challenge.md` — 8 findings (2 High, 4 Medium, 2 Low).

**Assessed + applied (12 corrections autonomously):**

1. **F1 / C-Finding-2 [H] — R9/M2 self-contradict §5.1.** Rewrote R9 + M2 to target stale invariant-count assertions (`I1-I10 active`, `I11 pending`) rather than raw `I1-I10` grep; the two remaining `I1-I10` tokens at lines 530 and 778 are location descriptors by design.
2. **F2 [H] — evidence/i11-provenance.md §Grep verification contradicted the deliverable.** Rewrote the §Grep verification section to accurately describe what was edited vs. what was deliberately retained.
3. **C-Finding-1 [H] — weekly.yml comment shipped false claim.** Updated the weekly.yml comment to acknowledge that I1-I10 + handler PBTs run at elevated sample depth via `test:fidelity` but I11 (colocated with the R23 guard in core) is NOT re-run by this job. Respects NG3 (no test/workflow-action change, only comment text).
4. **F3 [M] — R5 AC didn't match shipped text verbatim.** Rewrote R5 AC to describe the semantic shape of the accurate comment rather than a substring match against a specific phrase.
5. **F4 [M] — R4 AC vague "both locations".** Rewrote R4 AC to explicitly name both file paths.
6. **F5 [M] — Fire-site count "6" underspecified.** Updated evidence/deliverables-verification.md to enumerate 5+2=7 semantic fire paths and explain the "6" headline. Also expanded README's ypsMismatch write-paths table to distinguish block context (`createNodeFromYElement`) from inline context (`createTextNodesFromYText`) and note CJS/ESM doubling.
7. **F6/F7 [M/L] — Size claims understate.** Updated §1 header (~800 → ~906 LOC), §3 scope (~300 → 372, ~470 → 529), §5.2/§5.3 outlines to include shipped line counts.
8. **F8 [L] — "fixed-linked" terminology.** Rewrote D8 rationale to use "fixed-versioned" consistently and cite the actual `fixed` / `linked` distinction in `.changeset/config.json`.
9. **F9 [L] — "Five edits" ambiguous.** Clarified as "Five edit locations" in §5.1.
10. **F10 [L] — README ypsMismatch table lacked line detail.** Folded into F5 fix above.
11. **F11 [L] — OQ1 uncited.** Added citation that `ls packages/core/tests/` at baseline `fa0050a4` confirms no top-level README.
12. **C-Finding-7 [L] — NG1 "11 attrs" vague.** Updated NG1 to hedge ("11 attr-rows / 8 distinct attr names") and cite `evidence/deliverables-verification.md` as authoritative.
13. **C-Finding-8 [L] — §13 off-by-one.** Fixed "3 edits at lines 530, 762, 776, 778 — 4 total edit locations" → "4 edits at lines 530, 762, 776, 778".
14. **F13 [Nit] — Casing on §M4/§D2.** Normalized to "§M4 / §D2" (spaced) matching AGENTS.md:776.
15. **C-Finding-3 [M] — D2 rationale glosses byte-identity gap.** Tightened D2 rationale in the Decision Log to name the gap explicitly ("I8-I10 cover activation, not byte-identity of the serializer") and explain why the decision still holds.

**Declined (1):**

- **C-Finding-5 [M] — D8 may overlook CLI init consumer.** Verified: the CLI's `init` command writes a standalone template (`AGENTS_MD_CONTENT` string constant in `packages/cli/src/content/init.ts:9`) — NOT a copy of the repo's root AGENTS.md. Consumer-visible surface unchanged by our edits. D8 holds. Updated D8 rationale to name this verification.

**Skipped (stylistic, non-blocking):**

- **F12 [Nit] — Dense §1 sentence.** Left as-is; restructuring doesn't change meaning.

**Decision-reopens surfaced to user (2):**

- **C-Finding-4 [M] — D4 sister spec annotation.** Judgment call between spec purity (don't touch shipped specs) and discoverability (future readers find the correction without tribal knowledge). Alternative: one-line marginal annotation at sister SPEC.md:61.
- **C-Finding-6 [M] — Spec proportionality meta.** Challenger suggests a "slim spec" pattern for post-ship polish. Not blocking this PR; pattern-level feedback.

**Audit + challenger total:** 20 unique findings (one merged: F1 + C-Finding-2 = same issue). 12 autonomous corrections applied. 1 declined with evidence. 2 design challenges awaiting user judgment.

**Worktree status:** `bun run check` pre-edit was 13/13 green; edits are all doc-only (no code or workflow action changes) so re-running is a sanity check, not a gate.

---

## 2026-04-16 — Design challenges resolved; spec finalized

**C-Finding-4 (D4 sister spec annotation) — resolved option B.** User adopted the marginal-annotation alternative over pure spec-freeze. Applied: added `<br>_[Corrected 2026-04-16 post-ship: I11 ships as "R23 guard precision PBT" per tolerant-parsing SPEC §M4/§D2 — not rawMdxFallback coverage. Authoritative fix in AGENTS.md and specs/2026-04-16-post-ship-docs-polish/.]_` as a trailing line to sister SPEC.md:61. Original prose preserved intact. D4 reopened + resolved; NG4 rewritten to permit corrigendum-style annotations while still forbidding prose retcons. New R11 added + R10 bumped to 4 commits. §13 SCOPE updated to include the sister spec (annotation only); §13 EXCLUDE updated to clarify the scope restriction.

**C-Finding-6 (spec proportionality) — resolved option A.** Pattern-level feedback acknowledged: future post-ship polish specs should consider a slimmer template (~80-120 lines focused on decisions + agent constraints, skipping template sections that don't carry signal for small docs-only work). This spec ships as-is because rewriting mid-flight would cause meaningful churn and lose Decision Log detail that IS useful for a first-of-kind post-ship spec. **Pattern observation noted for next time.**

**Finalize (Step 8) complete:**

- Mechanical adversarial checks: no ASSUMED decisions; no 1-way doors at LOW/MEDIUM confidence; non-goals accurate (NG1-NG5 confirmed, with NG4 updated to "NEVER edit; MAY annotate" per D4 reopening).
- Resolution status: all decisions D1-D10 LOCKED. No INVESTIGATING or ASSUMED.
- Agent Constraints (§13) updated: sister SPEC.md:61 added to SCOPE (annotation only); EXCLUDE tightened.
- Resolution completeness gate: every In Scope item has verifiable AC via R1-R11.
- Future Work: FW-1 through FW-5 all carry maturity tier + trigger-to-revisit.
- Quality bar: traceable (every R → design section + decision); no ceremony-only items.
- Baseline commit: remains `fa0050a4` (worktree HEAD unchanged by doc edits; edits are uncommitted delta from baseline, will be the commit set).

Spec is final. Ready for `/ship` to drive commits + PR + review loop end-to-end.

**Meta.** Spec produced via `/spec` skill with ultrathink reasoning. Session-context-heavy approach: full world model inline because the parent Claude produced the sister spec + post-ship analysis in the same extended session.
