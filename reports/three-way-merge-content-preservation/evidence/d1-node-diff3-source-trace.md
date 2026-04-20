# Evidence: D1 — node-diff3 Algorithm Correctness

**Dimension:** node-diff3 source trace, conflict classification, `excludeFalseConflicts` trade-off
**Date:** 2026-04-16
**Sources:** `node-diff3@3.2.0` at `node_modules/node-diff3/src/diff3.mjs`; Hunt & McIlroy 1976; Khanna-Kunal-Pierce 2007

---

## Key files referenced

- `node_modules/node-diff3/src/diff3.mjs:1-554` — entire library (single file, 554 lines)
- `node_modules/node-diff3/package.json` — version 3.2.0, MIT, `"sideEffects": false`
- Cited upstream: [Khanna, Kunal, Pierce — "A Formal Investigation of Diff3" (FSTTCS 2007)](http://www.cis.upenn.edu/~bcpierce/papers/diff3-short.pdf) (cited in source at `diff3.mjs:200-205`)

---

## Findings

### Finding F1.1: node-diff3's merge operates on arrays of comparable units (NOT characters)

**Confidence:** CONFIRMED
**Evidence:** `node_modules/node-diff3/src/diff3.mjs:326-381`

```javascript
function diff3Merge(a, o, b, options) {
  let defaults = {
    excludeFalseConflicts: true,
    stringSeparator: /\s+/   // <-- splits on whitespace runs by default
  };
  options = Object.assign(defaults, options);
  if (typeof a === 'string') a = a.split(options.stringSeparator);
  if (typeof o === 'string') o = o.split(options.stringSeparator);
  if (typeof b === 'string') b = b.split(options.stringSeparator);
```

**Implication:** `diff3Merge` is NOT line-aware by default. Strings are split on whitespace runs (`/\s+/`) — each word is a unit. The caller must either:
1. Pre-split to lines (`stringSeparator: '\n'`) for line-level merge, or
2. Pass arrays directly (skips the string path entirely).

For the Open Knowledge bridge, `mergeThreeWay` pre-splits to lines and calls the array API — see `packages/app/src/editor/observers.ts` (out of scope for this 3P report, but the shape matches).

### Finding F1.2: LCS backbone — Hunt–McIlroy 1976 algorithm

**Confidence:** CONFIRMED
**Evidence:** `node_modules/node-diff3/src/diff3.mjs:17-76`

```javascript
// Text diff algorithm following Hunt and McIlroy 1976.
// J. W. Hunt and M. D. McIlroy, An algorithm for differential buffer
// comparison, Bell Telephone Laboratories CSTR #41 (1976)
function LCS(buffer1, buffer2) {
  let equivalenceClasses = {};
  ...
}
```

**Implication:** node-diff3 computes Longest Common Subsequence over arbitrary array items using `equivalenceClasses` on the item's JS-coerced key (`equivalenceClasses[item]` — implicit `toString`). Two units are "equal" iff they have the same `toString` representation. This is correct for strings, but means array-of-object inputs are compared by `[object Object]` key collision. For line-level merge (array of strings) this is correct.

### Finding F1.3: `diff3MergeRegions` — the classification core

**Confidence:** CONFIRMED
**Evidence:** `node_modules/node-diff3/src/diff3.mjs:207-320`

The function walks two `diffIndices` outputs (`o→a` and `o→b`), sorts the combined hunks by position in `o`, then processes regions:

```javascript
while (hunks.length) {
    let hunk = hunks.shift();
    let regionStart = hunk.oStart;
    let regionEnd = hunk.oStart + hunk.oLength;
    let regionHunks = [hunk];
    advanceTo(regionStart);
    // Try to pull next overlapping hunk into this region
    while (hunks.length) {
      const nextHunk = hunks[0];
      const nextHunkStart = nextHunk.oStart;
      if (nextHunkStart > regionEnd) break;   // no overlap
      regionEnd = Math.max(regionEnd, nextHunkStart + nextHunk.oLength);
      regionHunks.push(hunks.shift());
    }
```

**Three possible outputs per region:**
1. **Stable `o` region** (unchanged by either side) → copied from `o` verbatim via `advanceTo`.
2. **Stable `a` or `b` region** (one side changed, the other didn't) → copied from that side (single-sided hunk touches region → `regionHunks.length === 1` branch, lines 260-272).
3. **Unstable region** — both sides changed the same range of `o` → conflict triple (`aContent`, `oContent`, `bContent`) at lines 300-311.

**Key property:** If only one side changes a region and the other side leaves it at baseline, diff3 picks the changed side. This is content-preserving **only when the untouched side's content at that region is still in the baseline** — which it is by definition, since the untouched side didn't change it. So unilateral edits from one peer cannot be lost.

### Finding F1.4: `excludeFalseConflicts` — element-by-element equality

**Confidence:** CONFIRMED
**Evidence:** `node_modules/node-diff3/src/diff3.mjs:349-363`

```javascript
function isFalseConflict(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

regions.forEach(region =>  {
  if (region.stable) {
    okBuffer.push(...region.bufferContent);
  } else {
    if (options.excludeFalseConflicts && isFalseConflict(region.aContent, region.bContent)) {
      okBuffer.push(...region.aContent);  // same content, take one side
    } else {
      flushOk();
      results.push({ conflict: {...} });  // real conflict
    }
  }
});
```

**Trade-off:**
- **With `excludeFalseConflicts: true` (default):** When both A and B applied the *same edit* to the same O region, diff3 collapses to a single copy of that content (not a conflict). This is content-preserving — the content that both sides wanted is present once.
- **Without it:** Same content appears as a conflict region, forcing the caller (or user) to resolve. Caller-side resolution is where content loss typically creeps in — automatic "take mine" or "take theirs" loses one side's edits if they differ in context. With `excludeFalseConflicts: false` and naive resolution, duplicate-insert scenarios could be mishandled.

**For content-preservation analysis:** `excludeFalseConflicts: true` is always safer — it removes the need to make a potentially-lossy decision about identical edits. The only cost is that the caller sees fewer "conflicts," which is a UX concern, not a correctness one.

### Finding F1.5: `mergeDigIn` — sub-diff within conflict regions for common pieces

**Confidence:** CONFIRMED
**Evidence:** `node_modules/node-diff3/src/diff3.mjs:463-506`

```javascript
function mergeDigIn(a, o, b, options) {
  ...
  regions.forEach(region => {
    if (region.ok) {
      result = result.concat(region.ok);
    } else {
      const c = diffComm(region.conflict.a, region.conflict.b);
      for (let j = 0; j < c.length; j++) {
        let inner = c[j];
        if (inner.common) {
          result = result.concat(inner.common);   // content in both a and b
        } else {
          conflict = true;
          result = result.concat([aSection], inner.buffer1, [xSection], inner.buffer2, [bSection]);
        }
      }
    }
  });
```

**Implication:** `mergeDigIn` attempts to reduce conflict scope by running a *two-way* `diffComm` inside each conflict region, carving out shared content as "common" and narrowing the remaining conflict markers. **This is still a two-way diff** — it operates on `a` and `b` alone, without `o`. So content added independently by both sides (in the same region but at different positions) still produces conflict markers around both sides' unique content. The result is not lossy — it wraps everything in `<<<<<<<` / `>>>>>>>` blocks — but it produces markers, not a clean merge.

**For a caller doing post-processing** (like our bridge's `mergeConflictRegion` with DMP), `mergeDigIn` is less useful than `diff3Merge` because the caller wants raw conflict triples `{a, o, b}`, not already-marker-wrapped output.

### Finding F1.6: node-diff3 loses NO content in the stable/conflict classification itself

**Confidence:** CONFIRMED
**Evidence:** `node_modules/node-diff3/src/diff3.mjs:265-271` (single-hunk branch), `diff3.mjs:282-311` (conflict branch)

Every byte in the output comes from exactly one of `a`, `o`, or `b`:

- Stable regions of `o` → copied from `o`.
- Single-hunk regions → the contents from `a` or `b` are copied via `bufferContent: buffer.slice(hunk.abStart, hunk.abStart + hunk.abLength)`.
- Conflict regions → `aContent` and `bContent` are both captured in the conflict object. **It is the caller's responsibility** to resolve conflicts without losing content.

**THIS IS THE KEY FINDING:** node-diff3 itself is content-preserving at the *classification* layer. **Content loss happens downstream of node-diff3**, inside the caller's conflict resolver. If the caller calls `diff3Merge(a, o, b)` and emits `<<<<<<<` markers for conflicts, every byte is preserved (just wrapped). If the caller calls a custom resolver like `mergeConflictRegion` that uses DMP to pick one side, loss can occur in that resolver — not in diff3.

### Finding F1.7: Pathological input classes — where line-level diff3 misclassifies

**Confidence:** INFERRED (from algorithm inspection)
**Evidence:** `node_modules/node-diff3/src/diff3.mjs:223-225`

```javascript
diffIndices(o, a).forEach(item => addHunk(item, 'a'));
diffIndices(o, b).forEach(item => addHunk(item, 'b'));
hunks.sort((x,y) => x.oStart - y.oStart);
```

**Three pathologies of line-level diff3 — not content loss, but *classification* failures:**

1. **Adjacent-line moves as deletes-and-inserts.** If peer A moves line 5 to line 10, LCS sees line 5 removed and line 10 inserted. diff3 sees two single-hunk changes. If peer B also edits line 5 *in place*, their edit lands at the "move from" position. Result: B's edit may be "lost" (displaced) because diff3 treated the region around line 5 as changed by A and left it alone.

2. **Near-duplicate lines within a merge window.** If `o = ["x", "y", "x"]`, `a = ["x", "y", "x", "y"]`, `b = ["x", "y", "x", "z"]`, LCS's equivalence classes match both `x` tokens to both candidates. Depending on LCS choice, the "add y" vs "add z" hunks may align at different positions than the author intended. This produces conflict markers, not content loss — but the conflict region is wider than necessary.

3. **Shared-prefix suffix anchoring.** LCS is greedy-extend on longest runs. If `a` and `b` both add the same prefix `"foo "` before different words, the prefix is stable, and the words are a two-sided conflict. Default `excludeFalseConflicts` can't help because the words differ. Caller must resolve.

None of these are content-loss bugs in diff3 — they're classification choices that push the problem to the caller's resolver.

---

## Negative searches

- Searched for content loss in node-diff3 itself → NOT FOUND. The entire library is 554 lines and every code path preserves all input bytes either in the output or in the conflict triple. Loss is a caller-resolver property.
- Searched for formal proofs of node-diff3's correctness → NOT FOUND in the library. The source cites Khanna-Kunal-Pierce 2007 but doesn't prove the node-diff3 implementation conforms; the comment says "The interested reader may wish to consult [the paper]" (line 198-205).
- Searched for `node-diff3` issue tracker references to content loss → NOT AUDITED in this pass (3P library issues not pulled; focus is source-correctness).

---

## Gaps / follow-ups

- The Khanna-Kunal-Pierce paper characterizes diff3's *semantic* (as-intended) behavior vs the implementation. See D3 evidence for whether node-diff3 matches the paper's characterization.
- GNU diff3 (C source) has a different algorithm in detail, though same classification output. See D3/D7 for whether the algorithms' differences matter for content preservation.
