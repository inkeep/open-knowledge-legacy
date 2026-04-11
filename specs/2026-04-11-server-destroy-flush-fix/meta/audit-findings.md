# Audit Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/specs/2026-04-11-server-destroy-flush-fix/SPEC.md`
**Evidence:** `/Users/edwingomezcuellar/projects/open-knowledge/specs/2026-04-11-server-destroy-flush-fix/evidence/destroy-investigation-findings.md`
**Audit date:** 2026-04-11
**Auditor:** Cold-read audit subprocess (parent: spec iteration for this bug)
**Baseline:** Spec stamps `8801bd3`; audited against baseline + drift check to `origin/main` at `3a5ee59`.
**Total findings:** 8 (1 high, 4 medium, 3 low)

---

## Summary

The spec is tight, evidence-dense, and the primary technical claims all verify cleanly against source. The two-bug diagnosis is correct; the two-part fix code in §8.1 + §8.2 mirrors the internal `Server.destroy()` pattern in `@hocuspocus/server@4.0.0-rc.1` and correctly encodes D9 (cached-Promise idempotency guard), D10 (try/finally for Phase 5), D11 (10s timeout), and D17's intent. Decision Log, goals, and user journeys are internally consistent with the proposed solution.

One material factual finding — the changelog's drift-check bullet claiming `agent-flow.test.ts` was *deleted* on main is false; the file still exists on `origin/main` (partially modified, not removed). This does not affect the fix because the spec explicitly labels this as "not load-bearing," but it is a factual error in the audit trail and worth correcting.

The remaining findings are mostly minor citation-line drift (1–3 line ranges slightly off), one internal coherence mismatch between §8.3's illustrative test code and §9 R3's mitigation advice, and a latent NG6/J2/J3 framing inconsistency between "up to 2s shutdown latency" and §1's corrected "up to 10s of writes stranded."

**Verdict:** ACCEPTABLE TO FINALIZE with minor corrections. No high-severity findings reopen any Decision Log entries. The only H-rated item is a factual correction to the changelog.

---

## High Severity

### [H] Finding 1: Changelog claims `agent-flow.test.ts` was "DELETED on main" — file actually still exists on main

**Category:** FACTUAL
**Source:** T1 (own codebase) — `git ls-tree origin/main packages/app/src/server/agent-flow.test.ts`
**Location:** `meta/_changelog.md` — the "Drift check" bullet (line 32 of the changelog)

**Issue:** The drift-check bullet states that `packages/app/src/server/agent-flow.test.ts` was "**DELETED on main** as part of PR #38 test reorganization into stress test shards." This is factually incorrect — the file still exists at `origin/main` (blob `797f272`) and has only been **modified** (one three-way-merge–dependent test removed, dropping it from ~391 to 307 lines). The commit `3a5ee59` shows the edit as a file modification, not a deletion.

**Current text (changelog line 32):**
> `packages/app/src/server/agent-flow.test.ts` — **DELETED on main** as part of PR #38 test reorganization into stress test shards. Minor citation-hygiene note: the evidence file references it as a pattern reference, but it's not load-bearing — the destroy-fix spec's test plan is self-contained at `packages/server/src/standalone.test.ts`.

**Evidence:**
- `git ls-tree origin/main packages/app/src/server/agent-flow.test.ts` → `100644 blob 797f272089b1f97ba00584e1f045fdc3f95647a4	packages/app/src/server/agent-flow.test.ts`
- `git show origin/main:packages/app/src/server/agent-flow.test.ts | wc -l` → `307`
- `git diff 8801bd3..origin/main -- packages/app/src/server/agent-flow.test.ts` shows a partial diff (removal of `threeWayMerge` import and one `test('agent write during source mode: non-conflicting paragraphs merge on toggle-back (three-way merge)', ...)` block), not a file deletion.

**Status:** CONTRADICTED

**Why this doesn't reopen a decision:** The spec's own reasoning explicitly marks this citation as "not load-bearing — the destroy-fix spec's test plan is self-contained at `packages/server/src/standalone.test.ts`." The spec's test design does not depend on `agent-flow.test.ts` as a pattern reference (evidence Finding 2 anchors the regression test pattern to `shadow-repo.test.ts:134-136` instead, not `agent-flow.test.ts`). So the factual error in the drift-check changelog bullet has zero blast radius on the spec's implementation plan. But the audit trail in `meta/_changelog.md` should be corrected so future readers don't pull the wrong mental model.

**Suggested resolution:** Append a correction line to `meta/_changelog.md`:
> Correction (audit): `agent-flow.test.ts` was **not deleted** in PR #38. It was modified (removal of one test tied to the also-removed `three-way-merge` module), reducing the file from ~391 → 307 lines. File still exists on `origin/main`. Spec's test plan remains unaffected — was never load-bearing on this file.

---

## Medium Severity

### [M] Finding 2: §8.3 test code uses `debounce: 2000` but §9 R3 mitigation says use `debounce: 60_000`

**Category:** COHERENCE
**Source:** L1 (cross-section contradiction)
**Location:** SPEC.md §8.3 (test code at line 348) vs §9 R3 (risk mitigation)

**Issue:** §9 R3 flags test-flakiness risk and states the mitigation: "set `debounce: 60_000` in the test so natural debounce can't fire within test wall-clock — this proves we're actually exercising the destroy-time flush, not the normal debounce." But §8.3's illustrative test code shows `debounce: 2000, // default — the window the bug fires in`. A reader following §8.3 verbatim would write the exact test R3 warns against.

**Current text (§8.3 line 348):**
> `debounce: 2000,   // default — the window the bug fires in`

**Current text (§9 R3):**
> Mitigation: set `debounce: 60_000` in the test so natural debounce can't fire within test wall-clock — this proves we're actually exercising the destroy-time flush, not the normal debounce.

**Evidence:** Internal cross-reference only; no external source needed.

**Status:** INCOHERENT — §9 R3 is the forward-looking mitigation plan; §8.3 shows the un-mitigated version. Whichever the implementer follows, the other is wrong.

**Suggested resolution:** Update §8.3 to use `debounce: 60_000` with an inline comment `// 60s debounce — ensures natural debounce cannot fire within test wall-clock (per R3). Test asserts the destroy-time flush path, not natural debounce.` This makes §9 R3 describe residual risk-acceptance rather than a pending-implementation adjustment.

---

### [M] Finding 3: Shutdown latency framing in NG6/J2/J3 ("up to 2s") conflicts with §1's corrected "up to 10 seconds stranded"

**Category:** COHERENCE
**Source:** L1 (cross-section), L5 (summary vs detail)
**Location:** §1 "Actual data-loss window" paragraph vs §3 NG6 / §6 J2 / §6 J3

**Issue:** §1 (line 32) corrects the "up to 2 seconds" framing and documents that **up to 10 seconds of writes can be stranded** due to `maxDebounce=10000ms` as the reset ceiling. But three downstream sections still use the "up to 2 seconds" number for the post-fix shutdown latency:
- §3 NG6: "the fix adds up to 2 seconds to shutdown latency (the L1 debounce window) in the worst case"
- §6 J2 After: "Up to 2s of disk-write latency if there were pending writes"
- §6 J3 After: "destroy() awaits L1+L2 drain. Up to 2s added to quit latency"

Two readings reconcile this:
1. **"Latency is the flush execution time, not the debounce window."** A8 estimates realistic L1 execution at 100–500ms per doc, so post-fix shutdown latency is sub-second. In this reading, the "up to 2s" NG6/J2/J3 numbers are already too high and the right answer is "sub-second, up to ~500ms per pending doc."
2. **"Latency equals the natural debounce window that destroy() preempts."** Under this reading, the latency could be anywhere from 0 to `maxDebounce` (10s) depending on where the debounce cycle lands when destroy() fires. The "up to 2s" NG6/J2/J3 numbers are too low and should be "up to 10s" to match §1.

Either reading is defensible, but the spec uses both interpretations in different sections. A reader who checks §1 and NG6 side-by-side will see a 5× discrepancy on the same number.

**Current text (§1 line 32):**
> **up to 10 seconds of writes can be stranded**

**Current text (§3 NG6):**
> The fix adds up to 2 seconds to shutdown latency (the L1 debounce window) in the worst case

**Current text (§6 J2):**
> Up to 2s of disk-write latency if there were pending writes. Usually <100ms if idle.

**Evidence:**
- `@hocuspocus/server/src/Hocuspocus.ts:499-500` confirms `maxDebounce=10000ms` as the reset ceiling (verified via Read).
- A8 ("10-second timeout is longer than any legitimate `onStoreDocument` execution time") implies legitimate flush latency is ≪ 10s.

**Status:** INCOHERENT

**Suggested resolution:** Pick one framing and use it consistently.
- **Recommended (matches A8 and the flush-execution mental model):** Change NG6 to "the fix adds up to ~500ms per pending doc to shutdown latency in the worst case" and J2/J3 likewise. §1's "10 seconds stranded" stays as the *data-loss window* (how much typing could have accumulated) and NG6/J2/J3 is the *flush latency* (how long destroy() takes to finish). Add a one-line footnote distinguishing the two: "Stranded-writes window ≠ flush latency: the window is how much typing accumulates before destroy() fires; the latency is how long flush takes to write it out."

---

### [M] Finding 4: Evidence Finding 2 miscites `shadow-repo.test.ts:134-136` — actual code uses a `shadowGit(shadow)` helper, not raw `simpleGit().env(...)`

**Category:** FACTUAL
**Source:** T1 (own codebase) — direct read of `shadow-repo.test.ts` and `shadow-repo.ts`
**Location:** `evidence/destroy-investigation-findings.md` Finding 2; SPEC.md OQ-02 resolution text (§11) and the changelog's OQ-02 bullet

**Issue:** The evidence file and the spec both claim the regression test should reuse the pattern at `shadow-repo.test.ts:134-136`, specifically:
> `simpleGit().env({ GIT_DIR: gitDir }).raw('rev-parse', 'refs/wip/<branch>/<writer-id>')`

But the current code at `shadow-repo.test.ts:125-140` uses a `shadowGit(shadow)` helper (exported from `shadow-repo.ts:41-49`) which wraps `simpleGit({baseDir, timeout}).env({GIT_DIR: shadow.gitDir, GIT_WORK_TREE: shadow.workTree})`. The actual rev-parse line is **133-134**, not 134-136. And the idiomatic way to construct it is via `shadowGit(shadow)`, not ad-hoc `simpleGit().env({...})`.

**Current text (evidence Finding 2):**
> ```typescript
> const sg = simpleGit().env({ GIT_DIR: shadow.gitDir });
> const refSha = (await sg.raw('rev-parse', `refs/wip/main/${writer.id}`)).trim();
> ```

**Actual code (`shadow-repo.test.ts:132-134`):**
> ```typescript
> // Verify ref exists (default branch = 'main')
> const sg = shadowGit(shadow);
> const refSha = (await sg.raw('rev-parse', `refs/wip/main/${writer.id}`)).trim();
> ```

And `shadowGit` at `shadow-repo.ts:41-49`:
> ```typescript
> export function shadowGit(shadow: ShadowHandle) {
>   return simpleGit({
>     baseDir: shadow.workTree,
>     timeout: { block: GIT_TIMEOUT_MS },
>   }).env({
>     GIT_DIR: shadow.gitDir,
>     GIT_WORK_TREE: shadow.workTree,
>   });
> }
> ```

**Evidence:**
- Read of `packages/server/src/shadow-repo.test.ts` at lines 125-140 confirms `shadowGit(shadow)` usage
- Read of `packages/server/src/shadow-repo.ts` at lines 41-49 confirms helper signature
- Export check: `shadowGit` is exported from `packages/server/src/index.ts:69` (package public API)

**Status:** STALE / imprecise citation (the underlying *pattern* is correct — same `.env({GIT_DIR, GIT_WORK_TREE})` mechanism — but the idiomatic access is via the `shadowGit` helper, not ad-hoc `simpleGit().env(...)`). Implementation using the raw pattern would still work, but the reviewer will ask "why not use `shadowGit`?"

**Suggested resolution:** In evidence Finding 2, replace the two-line code sketch with:
> ```typescript
> import { shadowGit } from '@inkeep/open-knowledge-server'; // or relative path
> // ... after destroy() ...
> const sg = shadowGit(shadowHandle); // requires access to the shadow handle
> const refSha = (await sg.raw('rev-parse', `refs/wip/main/${writer.id}`)).trim();
> ```

Also correct the line range `shadow-repo.test.ts:134-136` → `shadow-repo.test.ts:132-135`.

Note that this triggers the already-flagged sub-concern: the test needs access to the `shadow` handle, which `ServerInstance` does not expose. Evidence Finding 2 already recommends "compute from convention" instead of expanding the API surface — that recommendation stands. But the test will need to construct the `ShadowHandle` (or a minimal equivalent) manually, not just call `simpleGit().env({GIT_DIR})`. This is worth calling out at the implementation stage.

---

### [M] Finding 5: "A1-A13" referenced in audit task — spec only has A1-A8

**Category:** COMPLETENESS (meta — not a spec defect, but a task-scope mismatch worth recording)
**Source:** Task prompt vs §12 Assumptions table
**Location:** SPEC.md §12

**Issue:** The audit task instructions ask to review "A1-A13 in §12. Each has a confidence + verification plan." The spec's §12 Assumptions table contains only **A1 through A8** (8 rows). There are no A9, A10, A11, A12, or A13 entries. Either (a) the task prompt is stale relative to an earlier draft of the spec that had more assumptions, or (b) assumptions A9–A13 were merged into decisions/OQs during the iterative loop and not re-extracted back into the assumptions table.

**Evidence:** Grep `^\| A\d+ \|` on SPEC.md returns exactly 8 rows, A1–A8. Verified via the changelog: "§12 A1–A8 assumptions" — the changelog also only references A1–A8.

**Status:** UNVERIFIABLE (cannot audit assumptions that don't exist); spec itself is internally consistent on having 8 assumptions.

**Suggested resolution:** No action needed in the spec. The audit covers the actual A1–A8 (see Confirmed Claims below). If the task author believed there should be A9–A13, that's a separate question for them. Noting here so the parent agent knows the audit scope was adjusted to fit the actual artifact.

---

## Low Severity

### [L] Finding 6: Line-range citations in evidence Finding 1 are slightly off (one-line drift)

**Category:** FACTUAL
**Source:** T2 (OSS source reads)
**Location:** `evidence/destroy-investigation-findings.md` Finding 1

**Issue:** Evidence Finding 1 cites the following line ranges; each is slightly imprecise (usually off by 1–4 lines):

| Citation in evidence | Actual location (verified) | Delta |
|---|---|---|
| `DirectConnection.ts:29-44` (transact) | 29-44 | ✅ exact |
| `Document.ts:52-53` (Y.Doc update handler) | Line 52 is *awareness* update, line 53 is the Y.Doc update handler | Off-by-one: should be `Document.ts:53` |
| `Document.ts:221-227` (handleUpdate invokes onUpdate) | 221-233, call at line 222 | Range too narrow but call is within |
| `Hocuspocus.ts:263-311` (handleDocumentUpdate) | 263-311 | ✅ exact |
| `Hocuspocus.ts:417-421` (createDocument wires onUpdate → handleDocumentUpdate) | 417-423 | Off by 2 lines (inner block is 417-423) |
| `types.ts:40-50` (shouldSkipStoreHooks) | 40-50 | ✅ exact |

None of these drift the semantic claims; the functions, code paths, and logic are all present at the cited lines. These are citation-hygiene inaccuracies, not factual defects.

**Status:** STALE (drift at the 1–4-line granularity)

**Suggested resolution:** Optional — update each citation if doing a pass anyway. Low value otherwise.

---

### [L] Finding 7: Evidence Finding 4 cites `DirectConnection.ts:46-89` — disconnect method spans those lines but `storeDocumentHooks(..., true)` call is at lines 50-64

**Category:** FACTUAL
**Source:** T2 (OSS source read)
**Location:** `evidence/destroy-investigation-findings.md` Finding 4

**Issue:** Evidence Finding 4 states "`DirectConnection.disconnect()` at `@hocuspocus/server/src/DirectConnection.ts:46-89` calls: `await this.instance.storeDocumentHooks(this.document, { ... }, true);`". The **method** `disconnect()` does span lines 46-89 (I verified), but the specific call to `storeDocumentHooks(..., true)` is at lines 50-64. A reader pulling up the line range will see the whole disconnect implementation, which is fine, but the citation could be more precise.

**Status:** STALE (imprecise citation, semantics correct)

**Suggested resolution:** Optional — narrow to `DirectConnection.ts:50-64` if doing a citation-hygiene pass.

---

### [L] Finding 8: §8.1 helper has a dead-code race guard (redundant with caller early-return)

**Category:** COHERENCE / code review
**Source:** L4 (evidence-synthesis fidelity — checking that illustrative code in the spec is clean)
**Location:** SPEC.md §8.1 code block

**Issue:** In §8.1, `flushAllStoresAndWait()` begins with:

```typescript
const docNames = Array.from(hocuspocus.documents.keys());
if (docNames.length === 0) return;
```

and then inside the `new Promise<void>((resolve) => { ... })` block:
```typescript
// Race guard: if docs already drained by the time the hook is installed
if (hocuspocus.getDocumentsCount() === 0) resolve();
```

The race-guard check inside the Promise executor is **synchronously reachable** immediately after the early-return check at the top of the function. Between the two checks, no awaits occur — they're back-to-back synchronous code. The race guard is therefore dead unless documents are mutated synchronously between the two lines (which is not possible in Node's single-threaded model during the executor).

However, Hocuspocus's own `Server.ts:200-225` uses this exact pattern without a top-of-method early return — so the race guard IS doing work there. The spec's helper copied the race guard but *also* added the top-level early return, making the race guard redundant.

This is not a bug — redundant checks are harmless. But a code reviewer will flag it. And if the implementer adds meaningful logic between the top-level early return and the Promise executor in a future refactor (e.g., "log pending doc count"), the race guard could become load-bearing again or become confusing.

**Status:** INCOHERENT (minor — illustrative code quality)

**Suggested resolution:** Either:
1. Remove the top-level `if (docNames.length === 0) return;` and rely solely on the race guard inside the Promise executor (matches Server.ts:200-225 exactly).
2. Remove the race guard inside the Promise executor and rely solely on the top-level early return (the code is logically equivalent and easier to read).
3. Keep both and add a comment explaining why both exist (e.g., "Top-level guard avoids pushing a doomed hook; inline guard mirrors `Server.destroy()` pattern for safety in case of future refactors").

Option 2 is probably cleanest. Option 1 matches upstream verbatim. Option 3 documents intent. Any works.

---

## Confirmed Claims (summary)

The following load-bearing technical claims in the spec were verified via direct source reads and all check out. Coverage was intentionally thorough because the spec's central design decisions (D2, D5, D9, D10, D11) depend on them.

### Hocuspocus internals (T2 — `@hocuspocus/server@4.0.0-rc.1` source reads)

- **`flushPendingStores()` is fire-and-forget.** Verified at `Hocuspocus.ts:165-177` — signature is `flushPendingStores() { ... }` (no `async`, no explicit return type, returned Promises from `debouncer.executeNow()` are discarded). ✅ Matches spec §1, §7.
- **`Server.destroy()` uses the one-shot `afterUnloadDocument` hook pattern.** Verified at `Server.ts:200-225`. Installs hook → closes connections → calls `flushPendingStores()` → awaits a Promise that resolves when `getDocumentsCount() === 0`. ✅ The spec's §8.1 helper mirrors this pattern exactly.
- **`storeDocumentHooks` uses `immediately ? 0 : configuration.debounce` with `maxDebounce` ceiling.** Verified at `Hocuspocus.ts:499-500`. ✅ Matches Finding 7 in evidence and the §1 data-loss-window correction.
- **"Document stays in memory" branch.** Verified at `Hocuspocus.ts:486-490`: on a generic Error (not `SkipFurtherHooksError`), the function logs and returns without calling the unload `setTimeout`, so `afterUnloadDocument` never fires. ✅ Validates D12/OQ-03 test recipe (inject generic Error, watch 10s timeout).
- **`SkipFurtherHooksError` unlike generic Error still proceeds to unload.** Verified at `Hocuspocus.ts:476-483`. ✅ Matches OQ-03 caveat in evidence Finding 3.
- **`DirectConnection.transact()` sets `{source: "local"}` without `skipStoreHooks`.** Verified at `DirectConnection.ts:29-44`. ✅ Matches evidence Finding 1.
- **`shouldSkipStoreHooks` returns `false` for `local` + no `skipStoreHooks` flag.** Verified at `types.ts:40-50`. ✅ Matches evidence Finding 1 chain.
- **`handleDocumentUpdate` calls `storeDocumentHooks` when `shouldSkipStoreHooks` returns false.** Verified at `Hocuspocus.ts:263-311` (check at 297, call at 310). ✅ Completes the chain.
- **`DirectConnection.disconnect()` calls `storeDocumentHooks(..., true)`.** Verified at `DirectConnection.ts:46-89` (call at 50-64). ✅ Evidence Finding 4 correct.
- **`DirectConnection.disconnect()` calls `unloadDocument` when `connectionsCount === 0 && !saveMutex.isLocked()`.** Verified at `DirectConnection.ts:69-85`. ✅ Evidence Finding 4 correct.
- **`unloadDocument` fires `afterUnloadDocument` hook.** Verified at `Hocuspocus.ts:554-591` (hook fires at line 581). ✅ Validates R1 risk mitigation and A1.
- **`hocuspocus.documents` is a public `Map<string, Document>`.** Verified at `Hocuspocus.ts:66`. ✅ `Array.from(hocuspocus.documents.keys())` is valid.
- **`hocuspocus.getDocumentsCount()` is public.** Verified at `Hocuspocus.ts:141`. ✅.
- **`hocuspocus.configuration.extensions.push(...)` post-construction is the same idiom Hocuspocus uses internally.** Verified at `Hocuspocus.ts:104` (constructor default), `Server.ts:145` (startup), `Server.ts:205` (destroy). ✅ Validates D2 and the "public API only" constraint.

### Open Knowledge codebase (T1 — at baseline `8801bd3`)

- **`standalone.ts:399-424` contains the buggy `destroy()` sequence verbatim as shown in §7.** ✅ Verified — exact match.
- **`standalone.ts:130` uses `new Hocuspocus(...)`, not `Server(...)`.** ✅ Verified. Confirms §1 claim that "OK uses the bare `Hocuspocus` class, not `Server`."
- **`standalone.ts:153` pushes the API extension post-construction.** ✅ Verified — same idiom the §8.1 helper uses.
- **`ServerInstance` interface exposes `destroy`, `hocuspocus`, `sessionManager`, `ready` — no `shadowGitDir`.** ✅ Verified at `standalone.ts:82-88`. Confirms evidence Finding 2's "compute from convention" recommendation.
- **`persistence.ts:264-279` `flushPendingGitCommit` function matches the excerpt in §7.** ✅ Verified.
- **`persistence.ts:388` is the `scheduleGitCommit()` call inside `onStoreDocument`.** ✅ Verified — confirms that L1 (onStoreDocument) is what schedules L2 (gitCommitTimer), which is the load-bearing "L1-before-L2 ordering" justification for D5.
- **`packages/cli/src/commands/start.ts:37-57` is the only production caller of `destroy()` and binds SIGINT + SIGTERM to the same `shutdown` closure.** ✅ Verified — both handlers register the same function (line 56-57). This directly motivates D9's cached-Promise idempotency guard.
- **`packages/cli/src/config/schema.ts:26-29` defines `debounceMs: 2000, maxDebounceMs: 10000` as the OK defaults.** ✅ Verified. Matches evidence Finding 7.
- **`packages/app/src/server/hocuspocus-plugin.ts:88` uses raw `new Hocuspocus(...)`, not `createServer()`.** ✅ Verified. Confirms OQ-P2-05 and A7 side-finding.
- **`packages/app/src/server/hocuspocus-plugin.ts` calls `activeWatcher.unsubscribe()` at lines 176 and 191, does NOT call `destroy()`.** ✅ Verified. Confirms OQ-P2-05.
- **`packages/server/src/agent-sessions.ts` `closeAll()` signature (at baseline `8801bd3`) matches the spec's claim.** ✅ Verified. Note drift: on `origin/main`, `closeAll` gained optional `docName?: string` parameter — this is backward compatible (the spec calls it with no args) and not a blocker.

### Load-bearing assumption review (§12 A1–A8)

All HIGH-confidence assumptions verify cleanly:

- **A1** (afterUnloadDocument fires once per unload): ✅ Confirmed via `Hocuspocus.ts:554-591` unloadDocument path. The hook is fired at line 581 after `document.destroy()`. Fires exactly once per unload because the `unloadingDocuments` map deduplicates (lines 561-563, 586). HIGH is correct.
- **A2** (extensions.push() after startup works): ✅ Confirmed — Hocuspocus itself uses this idiom at `Hocuspocus.ts:104`, `Server.ts:145`, `Server.ts:205`. HIGH is correct.
- **A3** (closeConnections + flushPendingStores → unload chain resolves): ✅ Chain verified end-to-end through source reads. HIGH is correct.
- **A4** (DirectConnection.transact triggers onStoreDocument debounce): ✅ Fully traced through DirectConnection.ts → Document.ts → Hocuspocus.ts → types.ts. HIGH VERIFIED is correct. Line-range drift is minor (see Finding 6).
- **A5** (debounce 60_000 prevents natural fire within test wall-clock): HIGH is correct *IF* the test actually uses 60_000. But §8.3 shows 2_000 — see Finding 2 (coherence mismatch).
- **A6** (flushPendingGitCommit works when called AFTER L1 populates queue): HIGH is correct by source inspection of `persistence.ts:264-279`. The function only operates if `gitCommitTimer` is set, which is set inside `onStoreDocument` (line 388). Ordering is load-bearing and verified.
- **A7** (no existing code depends on current buggy ordering): HIGH VERIFIED is correct. grep confirms only production caller is the CLI `start.ts`, and the Vite dev plugin bypasses `createServer()`. Side finding about CLI SIGINT + SIGTERM concurrent-call race is verified and is the motivation for D9.
- **A8** (10s timeout > legitimate onStoreDocument time): Reasonable — the actual serialization + file write is bounded at hundreds of ms per doc. Cannot be strictly "verified" without benchmark evidence, but the estimate is defensible. HIGH is acceptable.

### Evidence findings

All seven numbered findings in `evidence/destroy-investigation-findings.md` check out at the semantic level. Minor citation drift is noted in Findings 6 and 7 above and in Low-severity findings in this audit.

---

## Unverifiable Claims

None material. The spec's claims that fall outside source inspection (e.g., "most users haven't noticed because most edits are already flushed during normal idle periods," "up to ~500ms per pending doc," "~30s of CI time for 6 tests") are order-of-magnitude estimates labeled as such, not load-bearing factual claims. They don't need verification at audit time.

---

## Pending items (noted, not findings)

- **§15 Agent Constraints — "TBD at finalize".** Flagged in the task prompt as a pending item, not an audit failure. The spec's Default workflow correctly defers SCOPE/EXCLUDE/STOP_IF/ASK_FIRST derivation to Step 8 of the iterative loop. Not an audit concern.
- **Missing A9–A13 in §12.** The task prompt referenced "A1–A13" but the spec only has A1–A8. See Medium Finding 5 — the audit adjusted scope to fit the actual artifact.

---

## Action Required Verdict

**ACCEPTABLE TO FINALIZE WITH MINOR CORRECTIONS.**

The spec's core technical claims and design decisions (D1–D12) are all either source-verified or internally coherent. The fix code in §8.1/§8.2 correctly encodes D9 (cached-Promise idempotency), D10 (try/finally for Phase 5), D11 (10s timeout), and the phase-reordering intent — mirroring the internal `Server.destroy()` pattern from `@hocuspocus/server`.

**Recommended corrections before finalize:**
1. **[H]** Fix the changelog claim that `agent-flow.test.ts` was deleted on main. It was modified, not deleted. (Low blast radius, audit-trail hygiene only.)
2. **[M]** Reconcile §8.3's illustrative test `debounce: 2000` with §9 R3's `debounce: 60_000` mitigation. Update §8.3 to show the mitigated version.
3. **[M]** Pick one framing (stranded-write window vs flush-execution latency) for the "up to Ns" numbers in NG6/J2/J3 vs §1's "10 seconds stranded." Add a footnote distinguishing the two concepts.
4. **[M]** Update evidence Finding 2 to cite `shadowGit(shadow)` helper usage at `shadow-repo.test.ts:132-134`, not ad-hoc `simpleGit().env({GIT_DIR})`. Note that the test will need access to a `ShadowHandle` (or must be constructed independently).

**Optional / low-priority:**
5. **[L]** Correct line-range citations in evidence Finding 1 (Document.ts:53 not 52-53, Hocuspocus.ts:417-423 not 417-421, etc.).
6. **[L]** Narrow `DirectConnection.ts:46-89` citation in Finding 4 to `50-64` for the specific `storeDocumentHooks` call.
7. **[L]** Simplify §8.1 helper by removing the redundant race guard (either the top-level early return or the Promise-executor inline check).

None of these findings reopen any P0 decision or block implementation. The spec can proceed to Step 7 (assess-findings) and Step 8 (finalize) after applying corrections 1–4.
