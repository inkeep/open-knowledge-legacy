# Changelog — server-bridge-hardening-now spec

## 2026-04-11

### Session start
- Spec seeded from [projects/server-bridge-hardening/PROJECT.md](../../../projects/server-bridge-hardening/PROJECT.md) Now phase: S1 (external-change.ts tests), S4 (provider-pool.ts init-throw guard), S7 (CLAUDE.md + JSDoc sharpening).
- User explicitly asked for ONE spec covering all three, not three separate specs.
- Baseline commit stamped: `2d35736`.

### Intake
- SCR adapted from PROJECT.md project level to spec level. Compressed Phase 1 (grounding) because PROJECT.md + prior audit already did world-model-equivalent investigation. Skipped /worldmodel dispatch.

### World model investigation
- **CRITICAL FINDING:** `external-change.ts` + `standalone.ts applyToDoc` are drifted duplicates (evidence/external-change-dual-copy.md).
  - The PROJECT.md S1 premise was partially wrong: bridge-matrix exercises `standalone.ts applyToDoc`, NOT `external-change.ts`.
  - The two copies have drifted (try/catch, log line).
  - S1 scope must choose between testing the dev-mode copy only, testing both copies separately, or unifying (which violates PQ3 conflict-avoidance).
  - **Decision: D2 LOCKED — test both copies separately.** Respects PQ3, higher test surface, no source modification.
  - **NG1 — unification deferred to Later with trigger "PR #39 merges."**
- `provider-pool.ts setupObservers` init-throw path traced (evidence/provider-pool-setupobservers-path.md).
  - Existing `onSyncError` callback handles runtime errors only; init errors are a separate unguarded path.
  - `destroyEntry` pattern exists and matches; D4 LOCKED destroy-and-evict recovery.
  - Existing tests use DUMMY_WS so `onSynced` never fires — no existing test exercises the init path.
- `observers.ts` + `observers.test.ts` + CLAUDE.md current state captured (evidence/observers-applyuserdelta-current-state.md).
  - JSDoc already mentions "peer" abstractly — S7 sharpening is promoting the parenthetical to named production trigger + PR #43 lineage.
  - D7 LOCKED: integrate into existing "Testing — per-test docName isolation" section.

### Phase 1+2+3 compressed decisions
- D1 LOCKED: Single PR, three atomic commits, order S7 → S1 → S4 by increasing code risk.
- D2 LOCKED: S1 tests both copies (unit for external-change.ts, integration for standalone.ts applyToDoc).
- D3 DIRECTED: 4 branches covered (document-missing, frontmatter asymmetry, Y.Text no-op, transaction origin).
- D4 LOCKED: S4 destroy-and-evict recovery matching existing pool lifecycle.
- D5 DIRECTED: S4 test stubs `setupObservers` via module monkey-patch to force throw.
- D6 DIRECTED: S4 re-throws with `[ProviderPool] setupObservers init failed for <docName>: <original>` prefix matching existing error format.
- D7 LOCKED: S7 integrates into existing Testing section in CLAUDE.md.
- D8 LOCKED: S7 JSDoc-only, no applyUserDelta behavioral change (NG4).
- D9 LOCKED: S1 CLI-path test is integration-level (applyToDoc is closure-scoped, not importable).
- D10 DEFERRED: Dual-copy unification → Later phase (PR #39 merge trigger).

### Pending (carried forward)
- Q1 Open: Can setupObservers actually throw synchronously on realistic input? Resolves during S4 implementation.
- Q2 Parked: JSDoc-to-test crosslink — do at implementation if natural.
- Q3 Open: New file vs describe block for S1 CLI integration test — implementation-time decision.

### Assumptions active
- A1: PR #39 will merge eventually (MEDIUM)
- A2: setupObservers can throw in realistic failure modes (MEDIUM) — Q1 verifies
- A3: Frontmatter asymmetry is intentional invariant (HIGH)
- A4: onSynced fires once per connection in common case (MEDIUM)
- A5: bun run check passes per-commit (HIGH)

### PQ3 reframe + scope expansion (2026-04-11, post-D2 confirmation)
- User surfaced: "I'm ok with making Miles rebase if we fix the correct bugs/issues and do what's architecturally right if it's evidence-based."
- Agent verified: PR #39 actual conflict surface against our target files.
  - standalone.ts: Miles's change is +1 line at line 138 (`flushGitCommit: () => persistence.flushPendingGitCommit(),`). Our edits at 177-205 (unification), 82-88 + 426-687 (S3). Zero textual overlap.
  - hocuspocus-plugin.ts: Miles adds shadow repo init — partially addresses S8. Rebase against PR #38 already locked in regardless.
  - api-extension.ts: heavy additions from Miles, we don't touch.
- Evidence captured: evidence/pr39-conflict-surface-analysis.md
- **PQ3 in PROJECT.md is empirically falsified.** The "heavy conflict-avoidance" framing was precautionary, based on file-list overlap rather than textual diff.

### Scope expansion (user confirmed via AskUserQuestion)
- **Unification PROMOTED** from NG1 → In Scope. Variant: replace `standalone.ts applyToDoc` with `createExternalChangeHandler(hocuspocus)` call (~20 line change).
- **S3 (server.degraded signal) PROMOTED** from Later → In Scope. Only Major-severity finding in the backlog.
- **S1 SIMPLIFIED.** Dual-copy test plan dropped; now tests the unified handler directly. Reduces S1 scope from ~1.5 days → ~0.5 day.
- **S5, S6, S8 REMAIN DEFERRED** — not conflict-blocked anymore, but lack forcing functions. S8 partially addressed by Miles's PR.
- **New commit structure:** 5 atomic commits (S7 → unify → S1 → S3 → S4) ordered by increasing risk.

### New decisions (D2-D15 revised/added)
- D2 LOCKED: PQ3 relaxed — evidence-based, not heavy conflict-avoidance
- D3 LOCKED: Unification variant = replace applyToDoc with factory call (user confirmed)
- D4 LOCKED: S1 tests unified handler only (replaces prior "test both copies" plan)
- D5 LOCKED: S3 signal shape = `degraded: string[]` additive field on ServerInstance (1-way door — public type)
- D6 DIRECTED: S3 values = `'shadow-repo' | 'file-watcher' | 'head-watcher'`
- D7 DIRECTED: S3 read semantics = "after await ready"
- D8 DEFERRED: Head-watcher "attempted vs absent-by-design" — resolve at implementation (Q4)
- D9-D11: S4 decisions unchanged
- D12-D13: S7 decisions unchanged
- D14 LOCKED: S5, S6, S8 stay deferred (no forcing function)
- D15 DIRECTED: Commit order S7 → unify → S1 → S3 → S4 by increasing risk

### New evidence files
- evidence/pr39-conflict-surface-analysis.md — verified textual conflict surface is zero
- evidence/s3-degraded-signal-design.md — S3 implementation plan with line-level edits

### New open questions
- Q3: S3 test file location (new vs extend existing) — implementation time
- Q4: startHeadWatcher behavior on missing .git — blocks S3.R2 decision
- Q5: Unification behavioral equivalence — verified by U.R2 (existing tests must pass unchanged)

### Assumptions added
- A6: applyToDoc ↔ createExternalChangeHandler behavioral equivalence (HIGH, verified by code diff + U.R2)
- A7: Miles won't push new standalone.ts commits before merge (MEDIUM)

## 2026-04-11 (evening) — Audit + Challenger assessment

### Inputs
- `meta/design-challenge.md`: 6 findings (1 H, 3 M, 2 L) from challenger subprocess
- `meta/audit-findings.md`: 6 findings (1 H, 4 M, 1 L) from auditor subprocess

### Convergence: H1 in both outputs
Both subprocesses independently identified the **same high-severity finding**: the unification's direct-factory-call approach (variant A) would silently swallow errors via `createExternalChangeHandler`'s inner try/catch, breaking the 6 caller-side try/catch gates in `standalone.ts` that depend on synchronous throw propagation to skip `setReconciledBase`. This would corrupt the reconciliation base after any failed external-change apply.

Verified against live code: 6 applyToDoc call sites at lines 245, 258, 271, 554, 594, 599, all inside try/catch blocks (audit's "5 of 6" was a minor miscount). Spec's prior variant B rejection ("more invasive, same end state — pointless") was wrong: the end states DIFFER on the error path.

### Applied fixes

**D3 reshaped (variant A → variant B / throwing-helper):**
- U.R1 now prescribes extracting `applyExternalChange(hocuspocus, docName, content): void` as a throwing export from `external-change.ts`
- U.R2 now prescribes replacing `standalone.ts applyToDoc` with a thin wrapper that calls `applyExternalChange` directly, preserving throw semantics
- U.R3 (new) verifies behavioral equivalence on BOTH happy path AND error path via integration tests + manual error injection
- §9 "Alternatives considered" rewritten: variant A now REJECTED, variant B now CHOSEN
- Commit 2 description in §13 expanded with 4 sub-steps
- D3 Decision Log entry updated with full rationale + evidence refs

**D8 LOCKED (was DEFERRED) — Q4 resolved from code:**
- `head-watcher.ts:141-144` has explicit `if (!resolvedGitDir) { return no-op handle }` guard
- No guard needed in S3.R2; head-watcher catch is unreachable in standalone mode
- Q4 marked Resolved; Risk row "head-watcher spurious push" marked Moot
- S3.R5 (head-watcher verification requirement) removed
- Evidence file `s3-degraded-signal-design.md` updated: "head-watcher wrinkle RESOLVED" section

**D5 tightened — `readonly degraded: readonly string[]`:**
- Added `readonly` modifier to public type per design-challenge Finding 3
- Compile-time protection against consumer mutation on a 1-way-door public type
- Zero runtime cost
- Evidence file updated with the new type signature
- D5 Decision Log entry references the audit finding

**Coherence fixes (audit M1, M2, M4, L1):**
- §1 "three catches" → "four catches" (matches S3.R2 which always said four)
- §10 D3 implications column: "NG1" → "Unification" (was a label collision between PROJECT.md numbering and this spec's §3 NG1)
- §16 EXCLUDE: "line 138" → "lines 143-153" (line 138 was a PR-39-diff-header artifact anchored to pre-PR-38; the actual createApiExtension block is at 143-153 in current main)
- evidence/pr39-conflict-surface-analysis.md: same line-number correction with explanatory note about the diff-header anchor
- §8 "lines 170-183" → "lines 169-183" (cosmetic — 169 is the `/**` opener)
- Agent constraint cleanup to reference region, not stale line number

**Budget decomposition added (challenger L5):**
- Table in §1 showing per-commit hour estimates summing to ~2.25-2.75 days

### Dismissed

**Challenger Finding 6 (L) — `degraded: string[] | undefined` sentinel:**
- Stricter variant considered but rejected. The `readonly` from Finding 3 + JSDoc "read after ready" is sufficient for a first-ship.
- Adding a runtime/type sentinel against pre-ready reads has consumer ergonomics cost not warranted by the evidence.
- Dismissed with rationale documented in D7.
- Can tighten later if a misuse surfaces.

### Pending
- All P0 open questions resolved or routed to implementation
- Spec is ready for Phase 8 (Verify + finalize: quality bar, agent constraints validation, baseline re-stamp)

## 2026-04-11 (finalization)

### Mechanical adversarial checks — PASS
- No ASSUMED decisions in the Decision Log (all 15 are LOCKED or DIRECTED)
- No LOW/MEDIUM confidence assumptions underpin 1-way doors — D5 (public type) is backed by A6 HIGH confidence
- All 9 non-goals carry correct temporal tags (NG1-5, NG8 = NOT NOW; NG6, NG7, NG9 = NEVER)

### Resolution completeness gate — PASS
- Every In Scope item (§13) has all its decisions made, acceptance criteria verifiable, no dependency on Future Work
- 3P deps: none introduced
- Architectural viability validated (throwing-helper unification verified against 6 call sites)
- Integration feasibility: existing bridge-matrix + file-watcher integration tests serve as the behavioral-equivalence oracle

### Decision log audit — PASS
- D1-D15 all have resolution status (10 LOCKED, 5 DIRECTED, 0 DEFERRED/ASSUMED/INVESTIGATING)
- Every decision has rationale + evidence references
- Every 1-way door (D5, D6) has explicit HIGH confidence backing

### Agent Constraints — VALIDATED
- SCOPE lists all target files with line ranges
- EXCLUDE protects `standalone.ts:143-153` (Miles's PR #39 region, corrected from stale line 138)
- STOP_IF updated to reference U.R3 (renamed from U.R2), Q1, Q4-resolved, and PR #39 merge-time re-check
- ASK_FIRST covers dependency additions, SyncState changes, CLAUDE.md placement, commit structure

### New §17 Evidence & References
- Indexed 5 spec-local evidence files, 2 audit artifacts, 11 code references, 4 upstream artifacts, 2 external references
- Every evidence file in the directory is listed in the index (traceability checkpoint passes)

### Baseline commit
- Stamped at scaffold: `2d35736`
- Still valid at finalization — no new commits pushed during this session
- Verified against by auditor subprocess

### Status transition
- Draft → Approved (ready for implementation)
- Spec is ready to hand to implementer (or `/implement`)

## 2026-04-11 (later) — Cross-spec analysis + coordination edits

### Trigger
User surfaced that a parallel spec `specs/2026-04-11-server-destroy-flush-fix/SPEC.md` is being drafted concurrently in the non-worktree checkout (owned by Nick Gomez, addresses silent data-loss in `createServer().destroy()`).

### Investigation
Ran `/analyze` protocol against both specs:
- Read full Spec B (882 lines) + its evidence file (`destroy-investigation-findings.md`)
- Region-level collision check on `standalone.ts` — all edit regions disjoint (verified line 399 for destroy() matches Spec B's reference against our 2d35736 baseline)
- Semantic dependency trace — neither spec reads/writes the other's fields

### Findings
- **Zero textual conflict** on standalone.ts — edits at 55-80, ~106-175, 399-424 (Spec B) vs 82-88, 177-205, 428-680, 685-687 (Spec A)
- **One mechanical conflict:** both specs create `standalone.test.ts` as new file
- **No semantic dependency** — either can ship first in any order
- **Optional synergies:** (1) Spec B's shutdown log could include `srv.degraded` for lifecycle observability, (2) Spec A's S3 catches could use shared `log` binding if Spec B lands first, (3) shared test fixtures in merged test file

### Applied edits (per user direction: "update Spec A only, don't lock merge order")
- §16 Agent Constraints SCOPE for standalone.test.ts: added prescriptive note about extend-not-create path when Spec B has landed first
- §12 Assumptions: added A9 (disjoint region assumption, HIGH confidence, verified) and A10 (no functional dependency, HIGH confidence, verified)
- §14 Risks: added two new rows for file-collision coordination risk and fixture confusion risk (both Low severity)
- §17 Evidence & References: new subsection "Parallel specs (coordination, not dependency)" cross-linking Spec B with the interaction summary

### Not applied (per user direction)
- Spec B left untouched (lives in different checkout, owned by Nick)
- Merge order not locked — either order works, decide at merge time
- Synergy enrichments not applied — optional, non-blocking

### Pending
- No blocking items. Spec A finalization stands. Cross-spec coordination is documented.

## 2026-04-11 (evening) — Post-migration drift audit

### Trigger
Spec artifacts were migrated from `.claude/worktrees/test-isolation-parallelism` (baseline 2d35736) to a new worktree at `.claude/worktrees/server-bridge-hardening-now` branched from `origin/main` (48d8f04). Three commits landed on main between those baselines:
- **fe89406** — feat: zero-config bunx CLI packaging (#57)
- **611f2bd** — spec: zero-config bunx CLI packaging (#54)
- **48d8f04** — Prevent whole-document duplication after server restart (#56)

Drift audit ran before declaring ready-to-ship.

### Verification results
- `standalone.ts` — **zero drift.** 688 lines; destroy() at 399; applyToDoc at 177. All Spec A target regions (82-88, 177-205, 428-464, 680, 685-687) intact.
- `external-change.ts` — **zero drift.** 69 lines.
- `observers.ts`, `observers.test.ts`, `CLAUDE.md` — **zero drift** (not touched by any of the 3 commits).
- `head-watcher.ts:141-144` — **no-op guard still at exact same lines.** D8 (locked decision on `startHeadWatcher` returning no-op handle) remains valid.
- `persistence.ts` — module-level state (`reconciledBaseByBranch`, `batchInProgress`, `consecutiveGitFailures`) shifted +3 lines from baseline but still module-level. NG2 (S5 deferred) still coherent.
- `file-watcher.ts` — **grew from ~465 → 628 lines** (+163) via PR #57. `writeTracker` at line 68 (was 64), `lastKnownHash` at line 108 (was 104) — both still `export const` module-level. NG2 still coherent. Note: PR #57 was named "zero-config bunx CLI packaging" but actually touched file-watcher/head-watcher/persistence substantively — misleading PR name, real server-package changes.
- `provider-pool.ts` — **material drift from PR #56.** Grew from 200 → 240 lines. `onSynced` at line 97 (was 92, +5). `destroyEntry` at line 209 (was 193, +16). New `PoolEntry` fields: `hasSynced`, `tearingDown`. New method: `recycleDisconnectedEntry`. `destroyEntry` now sets `tearingDown = true` and wraps `provider.destroy()` in try/catch.

### Impact on S4
- **S4 still valid.** The `setupObservers` call inside `onSynced` is still unguarded; the bug S4 targets still exists.
- **Integration is cleaner than pre-PR-56.** PR #56's `tearingDown` guard at the top of each event handler means S4's `destroyEntry()` call automatically suppresses late-firing events — the latent concern in A4 (reconnect storm re-fire) is now structurally prevented.
- **No interaction race with `recycleDisconnectedEntry`.** S4's catch fires during `onSynced` (before `onDisconnect`); both paths are idempotent via `tearingDown`.
- **Line numbers shifted.** Spec + evidence file references updated.

### Applied edits
- **SPEC.md header:** baseline bumped `2d35736` → `48d8f04`; Last updated annotated with "post-migration drift audit"
- **SPEC.md §6 S4.R1:** line refs updated `92-111` → `97-116`; added note about `tearingDown` guard interaction
- **SPEC.md §8 "provider-pool.ts setupObservers call site":** rewrote with PR #56 context, new line refs, `recycleDisconnectedEntry` interaction note, new PoolEntry fields, hardened destroyEntry, new integration test file note
- **SPEC.md §12 A4:** strengthened with post-PR-56 mechanism reference
- **SPEC.md §16 SCOPE:** line refs for provider-pool.ts updated; baseline note added
- **evidence/provider-pool-setupobservers-path.md:** baseline updated to 48d8f04 with superseded-baseline note; TLDR rewritten with new line refs and PR #56 integration summary; "The call site" section updated with post-PR-56 code showing `tearingDown` guard + `hasSynced` assignment; new "PR #56 drift audit" section added with full impact table; `destroyEntry` section marked "PRE-PR-56" and preserved for historical context

### NOT applied (verified unnecessary)
- `external-change.ts` references — unchanged file, no drift
- `standalone.ts` line refs — unchanged file, no drift
- `observers.ts` line refs — unchanged file, no drift
- `CLAUDE.md` refs — unchanged file, no drift
- `head-watcher.ts` refs (D8 evidence) — unchanged lines
- Decision Log entries — no decisions invalidated by the drift
- Non-goals — none invalidated
- Assumptions beyond A4 — A3/A5/A6/A7/A8/A9/A10 all unaffected
- Items in S7 / Unification / S1 / S3 — all orthogonal to the drift

### Status
- Spec remains **Approved (ready for implementation)** at new baseline `48d8f04`.
- Drift audit is the final pre-ship check. **Ready to push branch and open PR (or hand to `/implement`).**
