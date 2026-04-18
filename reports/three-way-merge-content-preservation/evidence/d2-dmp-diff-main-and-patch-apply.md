# Evidence: D2 — DMP `diff_main` Within Conflict Regions, vs `patch_apply`

**Dimension:** Myers diff (DMP `diff_main`) content-preservation properties; what DMP contributes inside a three-way conflict region; contrast with `patch_apply`'s known fuzz-loss behavior.
**Date:** 2026-04-16
**Sources:** `diff-match-patch@1.0.5` at `node_modules/diff-match-patch/index.js`; Myers 1986 paper.

---

## Key files referenced

- `node_modules/diff-match-patch/index.js:95-149` — `diff_main` entry point
- `node_modules/diff-match-patch/index.js:164-223` — `diff_compute_` (recursive bisect / line-mode dispatch)
- `node_modules/diff-match-patch/index.js:236-293` — `diff_lineMode_` (line-mode pre-pass)
- `node_modules/diff-match-patch/index.js:296-417` — `diff_bisect_` (Myers O(ND) middle-snake bisect)
- `node_modules/diff-match-patch/index.js:1801-1906` — `patch_apply` (fuzz-tolerant pattern-search apply)

---

## Findings

### Finding F2.1: DMP `diff_main` is content-preserving in the round-trip sense

**Confidence:** CONFIRMED
**Evidence:** `node_modules/diff-match-patch/index.js:299` (cite of Myers 1986); semantics of returned `[op, text]` tuples.

`diff_main(text1, text2)` returns an array of `[op, text]` tuples where `op ∈ {DIFF_DELETE=-1, DIFF_INSERT=+1, DIFF_EQUAL=0}`. The full round-trip identities are mechanical:

- `diff_text1(diffs)` = concat of EQUAL ∪ DELETE = `text1`.
- `diff_text2(diffs)` = concat of EQUAL ∪ INSERT = `text2`.

Code reference at `index.js:113-118` (the equal-input speedup): if `text1 == text2` returns a single `DIFF_EQUAL`, which trivially round-trips. Code at `index.js:170-175` (one-side-empty speedup): if `text1` is empty, returns single `INSERT(text2)`; if `text2` empty, returns single `DELETE(text1)`. Both round-trip exactly.

**Implication:** Applying the diff `D = diff_main(A, B)` to A produces exactly B. **No content from A or B is dropped during the diff computation itself.**

### Finding F2.2: DMP `diff_main` does NOT preserve "content unique to A" when applied to A

**Confidence:** CONFIRMED
**Evidence:** Algorithm semantics — `diff_main(A, B)` is a 2-way diff describing how to transform A into B.

This is the critical asymmetry. `diff_main(A, B)` produces a transformation from A to B. Applying it (consuming `EQUAL` and `INSERT` ops to produce `B`) **discards everything A had that B lacks** — that's the entire point of a 2-way diff.

So if we have base/mine/theirs and we call `diff_main(mine, theirs)`, the diff describes: "to transform mine into theirs, delete X (mine-only content) and insert Y (theirs-only content)." Applying that diff to mine produces theirs, **losing all mine-only content** that diff3 would have classified as a conflict. This is the architectural shape of the existing `mergeConflictRegion` problem in our PR #161.

**The 2-way diff has no notion of "content I want to preserve from both sides"** — it has only "here's the recipe to make B from A."

### Finding F2.3: Why DMP inside conflict regions can still lose content

**Confidence:** CONFIRMED
**Evidence:** Combination of F2.2 + node-diff3's conflict triple `{a, o, b}` (D1 evidence F1.6).

Picture a three-way conflict region with these contents:
- `o = "common base text"`
- `a = "common A-only added base text"`  (A inserted "A-only added " between "common " and "base")
- `b = "common base text B-only addendum"`  (B appended " B-only addendum")

Line-level diff3 will likely produce a single conflict region spanning both edits because both touch the area around `o` (depending on splitting). The conflict triple is `{a: "...A-only added...", o: "common base text", b: "common base text B-only addendum"}`.

If the resolver does `diff_main(a, b)`:
- The diff says: delete "A-only added " (it's in a, not in b), insert " B-only addendum" (it's in b, not in a).
- Applying this diff to a produces: `"common base text B-only addendum"`.
- **A's "A-only added " text is lost.**

This is structurally identical to the failing-seed reproducer in the user's flake. The DMP `diff_main` between mine and theirs cannot preserve mine-only content — it has no semantic representation of "content unique to one side that should appear in the merged output."

### Finding F2.4: A semantically-correct three-way DMP-based merge needs a 3-way primitive

**Confidence:** INFERRED (from F2.2 / F2.3 + algorithm shape)
**Evidence:** DMP API surface — `diff_main` is strictly 2-way. No 3-way diff in the library.

To preserve content from both sides within a conflict region using DMP, the resolver must:
1. Compute `Da = diff_main(o, a)` (additions/deletions from base→mine).
2. Compute `Db = diff_main(o, b)` (additions/deletions from base→theirs).
3. Compose Da and Db into a single output that includes all INSERTs from both diffs and all DELETEs that are non-conflicting.

This is essentially re-implementing diff3 at character-level using DMP as the LCS oracle. **The library does not provide this** — the caller must compose it manually. And the composition is exactly where loss creeps in: how do you order interleaved INSERTs from both diffs? How do you handle a DELETE in Da that conflicts with an INSERT in Db at the same position?

**The naive composition** (just concatenate all INSERTs from both diffs after resolving deletes) **may preserve characters** (multiset-subset invariant b) **but won't preserve order or semantic structure** (invariant c).

### Finding F2.5: DMP `patch_apply` — the documented context-fuzz lossy path

**Confidence:** CONFIRMED
**Evidence:** `node_modules/diff-match-patch/index.js:1849-1853, 1871-1878`

```javascript
if (start_loc == -1) {
  // No match found.  :(
  results[x] = false;
  // Subtract the delta for this failed patch from subsequent patches.
  delta -= patches[x].length2 - patches[x].length1;
}
```

`patch_apply` runs `match_main` (a fuzzy pattern-matcher gated by `Match_Threshold` and `Patch_DeleteThreshold` defaults) to locate each patch in the target text. **If the fuzzy match score falls below threshold, the patch is silently dropped** (`results[x] = false`). The caller can detect by inspecting the `results` boolean array — but the output text simply lacks that patch's content.

Lines 1873-1877 — the secondary "unacceptable diff" rejection:
```javascript
if (text1.length > this.Match_MaxBits &&
    this.diff_levenshtein(diffs) / text1.length >
    this.Patch_DeleteThreshold) {
  // The end points match, but the content is unacceptably bad.
  results[x] = false;
}
```

Even when the match is found, if the located region's contents differ too much from the patch's expected `text1`, the patch is dropped.

**This is the documented behavior** that motivated the PR #161 switch from `patch_apply` to the diff3+DMP hybrid. The fuzz-loss behavior is a *feature* of `patch_apply` (intended for "best-effort apply when context drifted"), but it's a *bug* for "preserve all content from both writers." The hybrid (diff3 + `diff_main` in conflict regions) was supposed to eliminate the fuzz-loss path but reintroduced a different content-loss mode via F2.3.

### Finding F2.6: `diff_cleanupMerge` and `diff_cleanupSemantic` may rearrange but not delete

**Confidence:** CONFIRMED
**Evidence:** `node_modules/diff-match-patch/index.js:147` (call to `diff_cleanupMerge` from `diff_main`); function definitions deeper in file.

`diff_cleanupMerge` and `diff_cleanupSemantic` post-process the raw bisect output to:
- Merge adjacent EQUAL runs.
- Coalesce consecutive INSERT/DELETE runs.
- "Slide" edits to align on natural boundaries (whitespace, punctuation).

These operations **preserve the round-trip identity** (concat of EQUAL+DELETE = text1, concat of EQUAL+INSERT = text2). They rearrange the diff for readability and for better patch reuse, but they never drop characters. So the composition argument in F2.2-F2.4 is unaffected by cleanup.

### Finding F2.7: DMP's checklines speedup (`diff_lineMode_`) is content-preserving

**Confidence:** CONFIRMED
**Evidence:** `node_modules/diff-match-patch/index.js:236-293`

`diff_lineMode_` runs a line-level diff first (via `diff_linesToChars_` → `diff_main(charstrs)` → `diff_charsToLines_`), then re-diffs replacement blocks character-by-character. Lines 268-285 are the re-diff loop:

```javascript
case DIFF_EQUAL:
  if (count_delete >= 1 && count_insert >= 1) {
    // Delete the offending records and add the merged ones.
    diffs.splice(pointer - count_delete - count_insert,
                 count_delete + count_insert);
    pointer = pointer - count_delete - count_insert;
    var subDiff =
        this.diff_main(text_delete, text_insert, false, deadline);
    ...
  }
```

The line-mode pre-pass is just a heuristic to identify likely-changed regions. The character-level re-diff still runs `diff_main` on the changed blocks, preserving the round-trip identity. **No content is lost in this speedup.**

### Finding F2.8: DMP runtime deadline can produce a non-minimal but content-preserving diff

**Confidence:** CONFIRMED
**Evidence:** `node_modules/diff-match-patch/index.js:333-337, 412-415`

```javascript
for (var d = 0; d < max_d; d++) {
    // Bail out if deadline is reached.
    if ((new Date()).getTime() > deadline) {
      break;
    }
    ...
}
// Diff took too long and hit the deadline or
// number of diffs equals number of characters, no commonality at all.
return [new diff_match_patch.Diff(DIFF_DELETE, text1),
        new diff_match_patch.Diff(DIFF_INSERT, text2)];
```

If the bisect hits the deadline, DMP returns the trivial diff `DELETE(text1) + INSERT(text2)`. **This still satisfies the round-trip identity** — applying it to text1 produces text2. So even time-bounded diffs are content-preserving in the round-trip sense.

**Implication for the hybrid:** even pathological inputs that slow down DMP cannot cause content loss inside `diff_main` itself. The loss is purely in F2.3 — the semantic asymmetry of using a 2-way diff for 3-way conflict resolution.

---

## Negative searches

- Searched DMP source for any 3-way `diff` API → NOT FOUND. The library is strictly 2-way (text1, text2). All three-way logic is the caller's.
- Searched for "preserve" / "lossless" / "conflict" in DMP comments → NOT FOUND. The library doesn't claim three-way correctness; that's outside its scope.
- Searched DMP issue tracker for content-loss reports → NOT AUDITED in this pass. PR #161's prior context (2-3% silent loss under `patch_apply` with `Match_Threshold` defaults) is the established baseline.

---

## Gaps / follow-ups

- The post-condition design (D8) needs to consider F2.3 directly: a 2-way diff inside a 3-way conflict region is the precise mechanism that loses mine-only content. The right post-condition is whatever invariant FAILS on F2.3 inputs, signaling the algorithmic mismatch.
- A character-level 3-way diff library exists in the form of `diff3` for character arrays (node-diff3 with `stringSeparator: ''`), but performance characteristics on large strings haven't been audited here.
