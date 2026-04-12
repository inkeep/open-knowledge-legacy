# Design Challenge Findings

**Artifact:** specs/2026-04-11-server-bridge-hardening-now/SPEC.md
**Challenge date:** 2026-04-11
**Total findings:** 6 (1 high, 3 medium, 2 low)

---

## High Severity

### [H] Finding 1: Unification swallows errors that callers depend on for reconciliation-state correctness

**Category:** DESIGN
**Source:** DC1 (Simpler alternative) + DC2 (Stakeholder gap)
**Location:** §1 Problem Statement ("No behavioral change for the happy path; adds the missing try/catch wrapper for the error path"), §6 U.R1, §9 "Alternatives considered" (variant B rejection), Decision Log D3
**Issue:** The spec claims unification is behavioral-equivalence on the happy path and strictly-better on the error path ("adds the missing try/catch wrapper"). This understates the error-path behavioral change. The unified handler (`createExternalChangeHandler`) has an internal try/catch that **swallows** all errors (logs + returns normally). The current `standalone.ts applyToDoc` has **no** try/catch — errors propagate to callers.

There are 7 call sites of `applyToDoc` in `standalone.ts` (lines 245, 258, 271, 554, 594, 599). Every one wraps `applyToDoc` in a caller-side try/catch that gates downstream state updates:

```typescript
// standalone.ts:243-254 (representative — all 7 sites follow this pattern)
case 'clean':
  try {
    applyToDoc(docName, result.newContent);     // throws → skips next 2 lines
    setReconciledBase(docName, result.newContent);
    incrementReconcile();
  } catch (e) {
    console.error('[reconcile] Failed to apply clean content...', e);
  }
```

**Pre-unification:** `applyToDoc` error → throw → caller's catch fires → `setReconciledBase` SKIPPED → reconciliation base stays in sync with actual Y.Doc state.

**Post-unification:** `applyToDoc` error → internal catch in `createExternalChangeHandler` → swallowed → returns normally → `setReconciledBase` RUNS → reconciliation base records content that was NOT applied to Y.Doc.

Consequence: the next disk event computes a three-way diff against a wrong base. If the disk hasn't changed, `base == theirs`, `ours != base` → reconcile interprets the Y.Doc's stale state as the user's deliberate edit. The external change is silently dropped. If the disk HAS changed, the three-way merge operates against a phantom base, producing unpredictable results. This is reconciliation-state corruption on the error path.

**Current design:** "Replace `standalone.ts applyToDoc` (lines 177-205) with `const applyToDoc = createExternalChangeHandler(hocuspocus)`. [...] No behavioral change for the happy path; adds the missing try/catch wrapper for the error path."
**Alternative:** Extract the pure transact body into a **throwing** helper (no try/catch), then:
  - `createExternalChangeHandler` wraps the helper in try/catch for the dev plugin (existing swallow behavior preserved).
  - `standalone.ts` calls the helper directly — error propagation to callers preserved.

This is variant B from §9 ("Extract body into a shared helper, keep both entry points"), rejected as "More invasive, same end state — pointless." The rejection is wrong: the end state DIFFERS on the error path. The throwing helper + wrapper approach is ~5 lines more than the current plan but preserves caller semantics exactly. It can even be structured as:

```typescript
// external-change.ts — add a non-catching export alongside the existing factory:
export function applyExternalChange(hocuspocus: Hocuspocus, docName: string, content: string): void {
  // Move the current try-body here (no try/catch)
}

export function createExternalChangeHandler(hocuspocus: Hocuspocus) {
  return async (docName: string, content: string) => {
    try { applyExternalChange(hocuspocus, docName, content); }
    catch (err) { console.error(`[file-watcher] Failed to apply...`, err); }
  };
}
```

`standalone.ts` imports `applyExternalChange` directly. `hocuspocus-plugin.ts` continues using `createExternalChangeHandler`. Drift eliminated, error semantics preserved for both consumers.

**Trade-off:** Slightly more code than a one-liner replacement (export a second function, standalone.ts imports it). But: no reconciliation-state corruption risk, no behavioral change for any caller, and the "one handler two consumers" story is cleaner — each consumer gets the error-handling contract it needs.
**Status:** CHALLENGED
**Suggested resolution:** Re-examine variant B rejection. The try/catch semantic difference between the two copies is not cosmetic — it's load-bearing for reconciliation correctness. Either adopt the throwing-helper approach or explicitly document and accept the error-path behavioral change with an argument for why `setReconciledBase`-on-error is acceptable (self-healing via next reconcile cycle, etc.).

---

## Medium Severity

### [M] Finding 2: Q4 (head-watcher behavior on missing `.git`) is already answerable — deferring it to implementation is unnecessary

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §11 Q4, §10 D8, §14 Risk "S3's head-watcher push spuriously fires on no-git setups"
**Issue:** The spec defers Q4 ("Does `startHeadWatcher` throw on missing `.git` or return cleanly?") to implementation time (D8 DEFERRED). The codebase already answers this question unambiguously.

`packages/server/src/head-watcher.ts:136-144`:
```typescript
export async function startHeadWatcher(
  projectRoot: string, onBatchBegin: OnBatchBegin, onBatchEnd: OnBatchEnd,
): Promise<HeadWatcherHandle> {
  const resolvedGitDir = resolveGitDir(projectRoot);
  if (!resolvedGitDir) {
    // Standalone mode — no .git to watch
    return { unsubscribe: async () => {}, getLastKnownBranch: () => null };
  }
  // ...
}
```

`startHeadWatcher` **returns a no-op handle** when `.git` is absent. It does NOT throw. The head-watcher catch block in `initAsync` is only reached on actual errors (e.g., `@parcel/watcher` subscribe failure on a valid `.git` directory).

Implications:
- S3.R5 ("Verify head-watcher attempted vs absent-by-design semantics") is already verified — the distinction is built into the function. No guard is needed.
- Risk "S3's head-watcher push spuriously fires on no-git setups" (§14) has likelihood **zero**, not "Medium."
- D8 can be promoted from DEFERRED to LOCKED: no implementation-time decision needed.

**Current design:** "D8 DEFERRED [...] Unknown whether `startHeadWatcher` throws on missing `.git` or returns cleanly. Resolve during implementation."
**Alternative:** Resolve Q4 now from the codebase. Remove S3.R5 Should requirement (or reclassify as "verified — no action needed"). Downgrade the head-watcher risk from Medium/Low to N/A.
**Trade-off:** None — this is pure simplification. Removes an implementation-time decision point that has a clear answer.
**Status:** CHALLENGED
**Suggested resolution:** Resolve Q4 as "returns cleanly" with the code citation. Promote D8 to LOCKED. Remove or reclassify S3.R5.

---

### [M] Finding 3: `degraded: string[]` as a 1-way-door public type should be `readonly string[]`

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §6 S3.R1, §10 D5 (1-way door), evidence/s3-degraded-signal-design.md
**Issue:** `degraded` is a mutable `string[]` returned by reference from `createServer()`. D5 correctly flags this as a 1-way door (public type). But the type permits consumers to mutate the array:

```typescript
const srv = createServer(options);
await srv.ready;
srv.degraded.push('injection');  // Compiles, mutates the source array
srv.degraded.length = 0;         // Silently clears degradation signal
```

For an operability signal that future CLI consumers and tests will branch on, mutation exposure is a reliability concern. A consumer that accidentally `push`es or `splice`s corrupts the signal for all other consumers.

**Current design:** `degraded: string[]` on `ServerInstance` interface
**Alternative:** `readonly degraded: readonly string[]` on the interface. Implementation can still use a mutable array internally; the public contract prevents consumer mutation. Zero runtime cost. Alternatively, `Object.freeze(degraded)` before returning for runtime enforcement (minor, not strictly necessary if the type is readonly).
**Trade-off:** `readonly string[]` is a stricter public contract — once published, relaxing to `string[]` is backwards-compatible, but the reverse (tightening later) is a breaking change for consumers who happened to mutate. Better to start strict.
**Status:** CHALLENGED
**Suggested resolution:** Change S3.R1 to `readonly degraded: readonly string[]`. This is a one-line type annotation change that prevents a class of consumer bugs. The 1-way-door classification in D5 argues for erring on the side of strictness.

---

### [M] Finding 4: Commit ordering — S1 tests cement post-unification error behavior without verifying it

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** §6 All.R1, §10 D15
**Issue:** The commit order is S7 → unify → S1 → S3 → S4. S1's unit tests are written AFTER unification and test the unified handler. The spec relies on U.R2 ("existing integration tests pass unchanged") as the behavioral equivalence check.

Integration tests exercise the happy path — they use well-formed markdown, valid documents, and expect success. The error paths (malformed markdown, missing document, schema mismatch) are NOT exercised by integration tests. S1's tests for these error paths (S1.R2 — "outer try/catch swallows errors") would lock the POST-unification behavior (swallowing) as the expected behavior, without any test baseline showing the PRE-unification behavior (propagating).

If Finding 1 (H) is accepted and the handler is split into a throwing helper, this concern dissolves — S1 tests the throwing helper, which has the same error semantics as the original. If Finding 1 is rejected, this ordering means the test suite will actively prevent future detection of the error-path behavioral change, because the tests will assert "errors are swallowed" as correct.

**Current design:** "Order: docs first (lowest risk), then pure refactor (behavioral equivalence), then tests (additive), then new feature (S3), then fix (S4)."
**Alternative:** If Finding 1 is rejected: consider writing S1 tests BEFORE unification (testing `external-change.ts` as-is), then unifying, then verifying S1 tests still pass. This makes the tests a behavioral equivalence oracle rather than a post-hoc lock. If Finding 1 is accepted: moot — the throwing helper preserves semantics and S1 tests the right thing regardless of order.
**Trade-off:** More complex commit structure if S1 comes before unification. But the spec already has 5 commits — reordering to S7 → S1 → unify → S3 → S4 doesn't add commits, just reorders.
**Status:** CHALLENGED
**Suggested resolution:** Contingent on Finding 1 resolution. If the throwing-helper approach is adopted, current ordering is fine. If the current unification plan is kept, strongly consider S1 before unification as a regression oracle.

---

## Low Severity

### [L] Finding 5: Wall-clock estimate for expanded scope is asserted, not decomposed

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** §1 Problem Statement ("The architecturally right path fits in the same wall-clock budget (~2.5-3 days)")
**Issue:** The complication's cost argument ("fits in the same wall-clock budget") is an assertion without per-story hour breakdowns. The original narrow wedge (S1 + S4 + S7) is 3 stories; the expanded scope adds unification + S3 (2 additional stories, one of which includes a new public type + 4 catch edits + test file). The spec doesn't show how the math works — why 5 stories fit in the same budget as 3.

`evidence/s3-degraded-signal-design.md` estimates S3 at "~4-6 hours" and notes "the PROJECT.md estimate was ~1 day, which was generous." The narrowing from 1 day to 4-6 hours is plausible but S1 was also simplified (from dual-copy testing to unified-handler testing). The spec could make the budget argument explicit: "S1 shrinks from ~1.5d to ~0.5d (saving 1d), S3 costs ~0.5d, unification costs ~0.25d, net = same."

**Current design:** "~2.5-3 days" stated without decomposition
**Alternative:** Add a brief per-story estimate table (even rough) to make the budget argument auditable.
**Trade-off:** Minor spec hygiene. Doesn't change the design.
**Status:** CHALLENGED
**Suggested resolution:** Add 3-line estimate table to §1 or §13 showing the per-story hours that sum to ~2.5-3 days.

---

### [L] Finding 6: `degraded` is accessible before `await ready` with no runtime guard

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §6 S3.R1, evidence/s3-degraded-signal-design.md §"Consumer impact"
**Issue:** The spec documents "read this AFTER awaiting `ready`" in JSDoc (D7) and notes "reading before `ready` resolves returns an incomplete list." But there is no runtime guard — `degraded` is a plain array on the returned object, readable immediately. A consumer who forgets `await ready` gets a partial list with no warning, no error, and no `undefined`-as-sentinel.

This is a minor documentation-vs-enforcement gap. For an internal signal read by test harnesses and future CLI code, JSDoc is probably sufficient. But for a 1-way-door public type, the spec could consider: making `degraded` a getter that throws if `ready` hasn't resolved, or starting as `undefined` (forcing consumers to handle the absent case).

**Current design:** `degraded: string[]` initialized empty, filled during init, documented as "read after ready"
**Alternative:** `degraded: string[] | undefined` (undefined until ready resolves). Forces consumers to null-check, making the pre-ready read a type error rather than a silent partial result.
**Trade-off:** Slightly more ceremony for consumers (`srv.degraded ?? []`). But: consumers already must `await srv.ready` — adding a type-level assertion is belt-and-suspenders, not a new requirement.
**Status:** CHALLENGED
**Suggested resolution:** Consider whether the extra type safety is worth the consumer ceremony. For a health signal on a 1-way-door type, the answer is probably yes. But this is a judgment call — the current design is defensible if the JSDoc is clear.

---

## Confirmed Design Choices (summary)

**DC1 coverage:**
- The unification direction (collapsing the drift) is sound — the architectural argument is well-evidenced and the PR #39 conflict surface analysis is thorough. The challenge is about the mechanism (direct replacement vs. throwing helper), not the decision to unify.
- S4 destroy-and-evict pattern is the right recovery mechanism — it matches existing pool lifecycle (`close`, `dispose`, `evictLru`) and doesn't introduce new consumer contracts. The alternative (adding `'error'` to SyncState) was correctly rejected as invasive.
- Deferral of S5, S6, S8 is well-justified — each lacks a forcing function, and S8 is partially addressed by Miles's PR #39. The promotion triggers are concrete and evidence-based.

**DC2 coverage:**
- S3's additive-only approach (not breaking `ready` contract) is correct — NG9 rejection is well-reasoned.
- S7's placement in CLAUDE.md (vs. AGENTS.md) is appropriate — testing philosophy belongs in the session-context document, architecture in AGENTS.md.
- PR #39 conflict surface analysis is thorough and the PQ3 reframe is well-evidenced.

**DC3 coverage:**
- The framing's core argument — "conflict-avoidance premise was falsified by evidence, enabling the architecturally right path" — holds. The complication's dimensions (dual-copy drift + Major-severity finding + falsified PQ3) are genuinely interconnected: falsifying PQ3 unlocks both unification and S3 simultaneously. Removing any one dimension weakens but doesn't eliminate the case. This is not post-hoc reasoning.
- The scope expansion from 3 to 5 changes is evidence-driven, not scope creep — each addition has a concrete finding backing it.
