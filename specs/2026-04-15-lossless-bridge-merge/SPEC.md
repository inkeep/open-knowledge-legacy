# Lossless Bridge Merge — Spec

**Status:** Ready for implementation
**Owner(s):** Nick Gomez
**Baseline commit:** `21887d0` (post-merge of PR #152 — server-authoritative observer bridge with baseline fix + oracle tolerance)
**Builds on:** `specs/2026-04-15-server-authoritative-observer-bridge/SPEC.md` (precedent #14 LOCKED — cross-CRDT sync is single-writer, server-side)
**Research:** `reports/lossless-bridge-merge-alternatives/REPORT.md` (6 dimensions, all HIGH confidence)
**Evidence:** `./evidence/algorithm-comparison-experiment.md` (empirical validation of all claims)

---

## 1) Problem statement (SCR)

**Situation.** The server-authoritative observer bridge (PR #152) eliminated the multi-client RGA-interleave race by making the server the single writer for cross-CRDT sync. Observer A (XmlFragment→Y.Text) uses two paths: Path A (`applyIncrementalDiff`, lossless) when Y.Text matches the baseline, and Path B (DMP `patch_apply` three-way merge) when Y.Text has diverged. Empirical measurement shows **Path B fires 20.7% of the time** (41/198 observer fires across 3 stress-test runs with 5 concurrent clients in mixed WYSIWYG + source mode).

**Complication.** DMP's `patch_apply` uses the Bitap fuzzy-matching algorithm to locate each patch's insertion point. When the context around the target position has changed beyond `Match_Threshold` (0.5), the patch is **silently dropped** — content the user typed simply vanishes without any signal. Additionally, DMP produces **corrupt partial lines** on delete/edit conflicts (user deletes a paragraph that another user edited) and **duplicates identical edits** (D8: both users type "!" → "!!"). These are not tunable — they are structural properties of the algorithm (verified: `Match_Threshold=0.0` makes it worse; see `evidence/algorithm-comparison-experiment.md` D1).

The bridge-convergence fuzzer tolerates up to 5% content drops (`DROP_TOLERANCE_PCT`) to accommodate these DMP limitations. This tolerance masks a real correctness gap: **content typed by a user can silently disappear** from the merged document.

**Resolution.** Replace DMP's `patch_apply` with a **hybrid line-level diff3 + character-level merge** algorithm that is lossless, handles all 7 experimentally-validated edge cases correctly, and eliminates the need for fuzzer drop tolerance. The hybrid approach is the only one that passes all test scenarios — no single algorithm (DMP, OT, or diff3 alone) does.

## 2) Goals

- **G1. Zero silent content drops.** No content typed by any user silently vanishes during merge. The fuzzer's `DROP_TOLERANCE_PCT` is removed; the oracle asserts zero drops.
- **G2. Correct delete/edit conflict handling.** When user A deletes a paragraph that user B edited, produce the agent's edited version (not a corrupt partial line). This is the "user-wins for deletions, agent-wins for modifications" semantic — the more conservative choice that preserves content.
- **G3. D8 deduplication.** When both users make the identical edit (e.g., both add "!" at the same position), the merged result contains one copy, not two. diff3's `excludeFalseConflicts` provides this.
- **G4. Sub-line edit preservation.** When user A modifies "quick brown" → "fast red" on line 5 and user B modifies "lazy dog" → "sleepy cat" on the same line 5, both edits survive. Line-level diff3 alone loses this; character-level merge within the conflict region preserves it.
- **G5. Performance within budget.** Path B merge completes within 15ms p95 for documents <2K lines (the typical product shape). Measured: line-level diff3 is 11ms p50 on a 69K-char document; character-level merge within conflict regions adds <1ms because conflict regions are small.
- **G6. No new CRDT mutation beyond what exists.** The merge algorithm computes a `mergedText` string; application to Y.Text uses fast-diff character-level ops (replacing `applyByPrefixSuffix`). No new Y.Text API usage. Same `doc.transact(..., OBSERVER_SYNC_ORIGIN)` wrapper.

## 3) Non-goals

- **[NEVER] NG1:** Eliminating Path B entirely. Path B fires ~21% of the time under concurrent mixed-mode editing — this is a fundamental property of the dual-CRDT architecture, not a deficiency. Baseline narrowing can reduce it but cannot eliminate it.
- **[NEVER] NG2:** Changing the dual-CRDT model. Same as parent spec's NG1.
- **[NOT NOW] NG3:** Replacing `applyByPrefixSuffix` in `applyAgentMarkdownWrite`. The fast-diff improvement (D4 from the research) is orthogonal and independently valuable for the agent-write path, but it's not required for this spec's goals. Can be done as a follow-on with zero coupling.
- **[NOT NOW] NG4:** Adaptive debounce (parent spec's NG7). Shortening the 50ms debounce would reduce Path B frequency marginally but adds complexity for minimal benefit given the merge is now lossless.

## 4) The algorithm

### 4a. High-level flow

```
function mergeThreeWay(baseline: string, userText: string, agentText: string): string {
  // Phase 1: Line-level diff3 — structure + conflict detection
  const userLines = userText.split('\n');
  const baseLines = baseline.split('\n');
  const agentLines = agentText.split('\n');
  const regions = diff3Merge(userLines, baseLines, agentLines);

  // Phase 2: Per-region resolution
  let merged = '';
  for (const region of regions) {
    if (region.ok) {
      // Clean region — no conflict. Append directly.
      merged += region.ok.join('\n');
    } else {
      // Conflict region — both sides edited the same lines.
      // Use character-level DMP merge within this region only.
      const conflictBase = region.conflict.o.join('\n');
      const conflictUser = region.conflict.a.join('\n');
      const conflictAgent = region.conflict.b.join('\n');
      merged += mergeConflictRegion(conflictBase, conflictUser, conflictAgent);
    }
  }
  return merged;
}

function mergeConflictRegion(base: string, user: string, agent: string): string {
  // diff3's excludeFalseConflicts handles D8 (identical edits → single copy).
  // For genuine conflicts (different edits to the same region):
  //   - If user deleted the region entirely → take agent's version (G2: preserve content)
  //   - If agent deleted the region entirely → take user's version
  //   - Otherwise → DMP character-level merge within this small region
  //     (DMP works well on small strings; the failure mode is on large docs
  //      where context windows span hundreds of characters)
  if (user === '') return agent;   // User deleted → preserve agent's edit
  if (agent === '') return user;   // Agent deleted → preserve user's edit
  // Both sides modified — character-level merge via DMP on the small conflict region
  const patches = dmp.patch_make(base, user);
  const [merged] = dmp.patch_apply(patches, agent);
  return merged;
}
```

### 4b. Why this works for all 7 test cases

| Test case | Why hybrid handles it |
|---|---|
| T1: Non-overlapping edits | diff3 resolves as clean regions (no conflicts). Each side's additions are in separate line ranges. |
| T2: Same-position inserts | diff3 detects a conflict at the insertion point. mergeConflictRegion sees both are insertions (base is empty for that range), so both survive via DMP on the small region. |
| T3: D8 identical edits | diff3's `excludeFalseConflicts: true` (default) detects that both sides made the SAME change and produces a clean region with one copy. No conflict block generated. |
| T4: Emoji/Unicode | Line splitting is newline-based (no character-level splitting). DMP within conflict regions handles emoji correctly (small strings, high context density). |
| T5: Heavy divergence | Most changes land in separate line ranges (clean regions). Overlapping regions go through small-region DMP which has high context density (short strings). |
| T6: Same-line modification | diff3 produces a conflict for the shared line. mergeConflictRegion runs DMP on just that one line (~50 chars) — trivial for DMP's context matcher. Both sub-line edits survive. |
| T7: Delete/edit conflict | diff3 produces a conflict. mergeConflictRegion checks: user's version is empty (user deleted) → returns agent's version (the edited paragraph). No corruption. |

### 4c. Why DMP within conflict regions is safe

DMP's failure mode occurs when the context around the patch insertion point has changed beyond recognition. This happens on LARGE documents where concurrent edits shift content by hundreds of characters. Within a conflict region (typically 1-5 lines, <200 characters), DMP has extremely high context density — the entire region IS the context. The failure mode that produces drops on 69K-char documents doesn't manifest on 200-char strings.

The research report's position that DMP is "structurally incompatible with lossless merge" is correct for whole-document application but does NOT apply to small-region application within diff3 conflict blocks.

### 4d. CRDT application: fast-diff replaces applyByPrefixSuffix

After computing `mergedText`, apply it to Y.Text via character-level fast-diff instead of prefix/suffix matching:

```typescript
function applyFastDiff(ytext: Y.Text, currentText: string, newText: string): void {
  if (currentText === newText) return;
  const diffs = diff(currentText, newText);
  let offset = 0;
  for (const [type, text] of diffs) {
    if (type === 0) { offset += text.length; }
    else if (type === -1) { ytext.delete(offset, text.length); }
    else if (type === 1) { ytext.insert(offset, text); offset += text.length; }
  }
}
```

**Why:** `applyByPrefixSuffix` matches the longest common prefix and suffix, then does a single delete+insert for everything in the middle. On a merge that changed one word in a 500-character block, it destroys all Y.Text Items in the middle. fast-diff produces character-level operations that only touch the changed characters — preserving CRDT Items and their origin attribution throughout.

fast-diff is already an indirect Yjs dependency (used by `lib0`). No new dependency.

## 5) Requirements

### Functional requirements

| Priority | ID | Requirement | Acceptance criteria |
|---|---|---|---|
| Must | FR-1 | Replace `applyUserDelta` in `packages/core/src/bridge/apply-diff.ts` with the hybrid diff3+DMP algorithm from §4a. | Module exports `mergeThreeWay(baseline, userText, agentText): string`. Old DMP-only `applyUserDelta` is deleted. `applyIncrementalDiff` (Path A) is unchanged. |
| Must | FR-2 | Replace `applyByPrefixSuffix` usage in Path B with `applyFastDiff` from §4d. | New `applyFastDiff(ytext, currentText, newText)` exported from `packages/core/src/bridge/apply-diff.ts`. Path B's `doc.transact` block uses it instead of `applyByPrefixSuffix`. |
| Must | FR-3 | Add `node-diff3` as a dependency of `@inkeep/open-knowledge-core`. | `packages/core/package.json` adds `"node-diff3": "^3.2.0"`. No other new dependencies (fast-diff already indirect via lib0; DMP already present for Path A). |
| Must | FR-4 | Remove `DROP_TOLERANCE_PCT` from the bridge-convergence fuzzer. Oracles (d) and (e) assert ZERO content drops. | `packages/app/tests/stress/bridge-convergence.fuzz.test.ts`: remove tolerance logic, hard-fail on any missing prefix or marker line. 100-seed run at rebalanced distribution passes with zero drops. |
| Must | FR-5 | **Merge algorithm test suite** — 7 deterministic test cases covering every experimentally-validated scenario (see §6). | New file `packages/core/src/bridge/merge-three-way.test.ts` with tests T1-T7. All pass. Each test documents what it validates, what algorithms fail it, and why. |
| Must | FR-6 | Verify the existing C1-C10 integration tests still pass under the new merge algorithm. | `bun run check` green. No integration test changes needed — the external behavior (convergence + bridge invariant) is unchanged; only the merge quality improves. |
| Should | FR-7 | Replace `applyByPrefixSuffix` in `applyAgentMarkdownWrite` with `applyFastDiff` for improved Item preservation on the agent-write path. | Same function, different call site. Orthogonal improvement — if time permits, include; if not, follow-on. |

### Non-functional requirements

| Area | Requirement | Acceptance |
|---|---|---|
| Performance | Path B merge <15ms p95 for docs <2K lines. | Measured via instrumentation in FR-5 test T-perf. diff3 line-level is 11ms p50 on 69K docs; conflict-region DMP adds <1ms. |
| Correctness | Zero silent content drops under any input. | Fuzzer with zero tolerance (FR-4) passes 100 seeds. |
| Compatibility | No change to Observer A/B architecture, origin guards, or debounce structure. | Drop-in replacement of the merge function only. |

## 6) Test matrix — the merge algorithm verification suite

This is the most important section for long-term maintainability. **Any future change to the merge algorithm must pass all 7 tests.** Each test encodes a specific failure mode discovered through experimentation.

### T1: Non-overlapping distributed edits (sanity baseline)

```
Baseline: 20-line markdown document
User: adds 3 paragraphs at lines 5, 12, 18
Agent: adds 2 paragraphs at lines 8, 15
Expected: all 5 new paragraphs present, original content intact, no duplications
```

**What it validates:** Basic merge correctness — independent edits in separate regions.
**What fails it:** Nothing (all algorithms pass). Included as a regression baseline.

### T2: Same-position concurrent inserts

```
Baseline: "Line 1\nLine 2\nLine 3"
User: inserts "USER PARAGRAPH" after Line 1
Agent: inserts "AGENT PARAGRAPH" after Line 1
Expected: both paragraphs present (order may vary)
```

**What it validates:** Content preservation when both sides insert at the same location.
**What fails it:** diff3 with strict user-wins (drops agent). The merge must use a conflict resolution strategy that preserves BOTH sides.

### T3: D8 — identical concurrent edit (deduplication)

```
Baseline: "Hello world"
User: "Hello world!"
Agent: "Hello world!"
Expected: "Hello world!" (one copy, NOT "Hello world!!")
```

**What it validates:** False-conflict detection — when both sides make the SAME change, the merge produces one copy.
**What fails it:** DMP (produces "!!"), OT transform (produces "!!"). Only diff3's `excludeFalseConflicts` handles this correctly.
**Why this matters:** Without deduplication, every concurrent save-same-state scenario duplicates punctuation, whitespace, or formatting changes.

### T4: Emoji and Unicode content

```
Baseline: "Hello 👨‍💻 world"
User: "Hello 👨‍💻 world! 🎉"
Agent: "Hello 👨‍💻 beautiful world"
Expected: contains "👨‍💻", "beautiful", "🎉", no corruption
```

**What it validates:** Surrogate pair handling. Emoji use 2+ UTF-16 code units; algorithms that operate on codepoint positions must convert correctly.
**What fails it:** OT without codepoint conversion. The hybrid approach avoids codepoint issues because line splitting is newline-based and DMP within conflict regions operates on JS strings natively.

### T5: Heavy divergence — many same-region edits

```
Baseline: 30-line document
User: modifies every 3rd line + 10 insertions
Agent: modifies every 5th line + 6 insertions
Expected: all 10 user markers present, all 6 agent markers present, no duplications
```

**What it validates:** The merge algorithm doesn't degrade under high edit density.
**What fails it:** DMP drops patches at extreme divergence (the original 2-3% failure rate). The hybrid approach routes through line-level diff3 which handles this structurally.

### T6: Same-line modification (sub-line conflict)

```
Baseline: "The quick brown fox jumps over the lazy dog."
User: "The fast red fox jumps over the lazy dog."
Agent: "The quick brown fox jumps over the sleepy cat."
Expected: "The fast red fox jumps over the sleepy cat."
```

**What it validates:** Both sub-line edits survive even when they're on the same line.
**What fails it:** Line-level diff3 alone (loses agent's "sleepy cat" because the whole line is a conflict resolved as user-wins). The hybrid approach routes this through DMP within the conflict region, which handles sub-line merges correctly on short strings.
**Critical regression gate:** This test prevents someone from replacing the hybrid with pure line-level diff3 and losing sub-line merge capability.

### T7: Delete/edit conflict

```
Baseline: "Para 1\n\nThis will be edited by agent.\n\nPara 3"
User: "Para 1\n\nPara 3" (deleted middle paragraph)
Agent: "Para 1\n\nAGENT EDITED this paragraph.\n\nPara 3"
Expected: "Para 1\n\nAGENT EDITED this paragraph.\n\nPara 3" (agent's edit preserved)
```

**What it validates:** When one user deletes content that another user edited, the edit is preserved (conservative — prefer keeping content over losing it).
**What fails it:** DMP (produces corrupt partial line `" with new content."`), OT (loses newline separator, merges into next paragraph).
**Why this semantic:** In a collaborative editor, "user B was actively working on this paragraph" is a stronger signal than "user A decided to delete it." The merge preserves work over deletion. This is a product-level decision, not an algorithm property — the conflict resolution in `mergeConflictRegion` encodes it explicitly.

### T-perf: Performance gate

```
Document: 1000 lines (69K chars)
User: 50 line modifications + 20 insertions
Agent: 30 line modifications + 15 insertions
Measured: 100 iterations, assert p95 < 50ms (debounce budget; local ~4ms, CI ~40ms)
```

**What it validates:** The merge algorithm is fast enough for the 50ms debounce budget.
**Regression gate:** If someone replaces diff3 with a slower algorithm (e.g., character-level diff3 which is O(n^2)), this test catches it.

## 7) Decision log

| ID | Decision | Status | Rationale |
|---|---|---|---|
| LM-D1 | Hybrid diff3+DMP, not OT transform | LOCKED | Experimental evidence: OT corrupts on delete/edit conflicts (T7), duplicates on D8 (T3). diff3 alone loses sub-line edits (T6). Hybrid handles all 7 cases. See `evidence/algorithm-comparison-experiment.md`. |
| LM-D2 | DMP within conflict regions, not OT | LOCKED | DMP works correctly on small strings (<200 chars typical conflict region). Its failure mode (fuzzy context mismatch) only manifests on large documents where context windows span hundreds of characters. No Unicode conversion needed (operates on JS strings natively). |
| LM-D3 | Delete/edit → preserve agent's edit | LOCKED | Product decision: preserving actively-edited content is more conservative than honoring a deletion. A user who deleted a paragraph can delete it again in one action; a user whose edits were silently discarded has lost work. |
| LM-D4 | fast-diff for CRDT application | LOCKED | `applyByPrefixSuffix` destroys all Items in the middle region even when most content is unchanged. fast-diff produces character-level ops that only touch changed characters. Already an indirect dependency via lib0. |
| LM-D5 | node-diff3 as the diff3 implementation | LOCKED | MIT license, 0 direct dependencies, 150KB, maintained. Line-level mode is 11ms p50 on 69K docs. `excludeFalseConflicts: true` (default) handles D8 deduplication. |
| LM-D6 | Remove fuzzer DROP_TOLERANCE_PCT | LOCKED | The tolerance existed to accommodate DMP's known limitations. With a lossless merge, any content drop is a genuine bug — the oracle should hard-fail. Tolerance was 5%; target is 0%. |

## 8) Scope

**In scope:**
- `packages/core/src/bridge/apply-diff.ts` — replace `applyUserDelta` with `mergeThreeWay` + `applyFastDiff`
- `packages/core/src/bridge/merge-three-way.test.ts` — new test file (T1-T7 + T-perf)
- `packages/core/package.json` — add node-diff3
- `packages/app/tests/stress/bridge-convergence.fuzz.test.ts` — remove DROP_TOLERANCE_PCT
- `packages/server/src/server-observers.ts` — update the Path B call from `applyUserDelta` to the new function

**Not in scope:**
- `packages/core/src/utils/apply-by-prefix-suffix.ts` — stays for other consumers (agent-write path uses it via FR-7 follow-on)
- Observer A/B architecture, origin guards, debounce — unchanged
- Any other bridge files

## 9) Agent Constraints

**SCOPE (allowlist):**
- `packages/core/src/bridge/apply-diff.ts` (rewrite `applyUserDelta` → `mergeThreeWay`)
- `packages/core/src/bridge/merge-three-way.test.ts` (new — T1-T7 + T-perf)
- `packages/core/src/bridge/index.ts` (update exports)
- `packages/core/package.json` (add node-diff3)
- `packages/server/src/server-observers.ts` (update Path B call site)
- `packages/app/tests/stress/bridge-convergence.fuzz.test.ts` (remove tolerance)

**EXCLUDE:**
- `packages/core/src/utils/apply-by-prefix-suffix.ts` — keep for other consumers
- `packages/core/src/markdown/` — orthogonal
- `packages/server/src/agent-sessions.ts` — FR-7 is a follow-on
- Observer architecture — unchanged

**STOP_IF:**
- Any T1-T7 test fails — the merge algorithm has a correctness issue; investigate before proceeding
- Fuzzer with zero tolerance fails on >0 seeds — the merge is still dropping content; investigate
- Performance exceeds 15ms p95 on 1000-line doc — algorithm choice may need adjustment
- `bun run check` fails — regression introduced

## 10) Risks

| Risk | Severity | Mitigation |
|---|---|---|
| R1. DMP within conflict regions still drops content on very large conflict blocks (>1K chars) | LOW | Conflict regions are typically 1-5 lines (<200 chars). A 1K-char conflict region would require two users editing a 20+ line contiguous block simultaneously — extremely rare. T5 validates at moderate divergence. |
| R2. diff3 line splitting produces unexpected results with CRLF line endings | LOW | Normalize to LF before splitting. The markdown pipeline already normalizes. |
| R3. node-diff3 has a latent bug in excludeFalseConflicts | LOW | T3 (D8 test) explicitly validates this behavior. The library has 150+ stars, is well-tested, and the algorithm is formally specified (Khanna/Kunal/Pierce 2007). |

## 11) Future work

- **FR-7: fast-diff in agent-write path.** Replace `applyByPrefixSuffix` in `applyAgentMarkdownWrite` with `applyFastDiff` for better Item preservation on agent writes. Independent, ~15 LOC.
- **Adaptive debounce.** Shorten Observer A debounce from 50ms to 10-20ms to reduce Path B frequency. Low risk, easy win, but less impactful now that Path B is lossless.
- **Conflict visibility.** Surface merge conflicts to users as a UI indicator (e.g., "2 edits merged" flash). Not correctness-critical but useful for collaborative awareness.
