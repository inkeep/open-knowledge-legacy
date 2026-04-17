# D1: DMP patch_apply Failure Mechanics

## Source analysis

Read: `node_modules/diff-match-patch/index.js` (Google's diff-match-patch v1.0.5)

## How patch_apply works

`applyUserDelta` in `packages/core/src/bridge/apply-diff.ts` calls:

```javascript
const patches = dmpMerge.patch_make(oldXmlMd, newXmlMd);  // user's edits as patches
const [mergedText, results] = dmpMerge.patch_apply(patches, currentText);  // apply to agent's text
```

### Step-by-step patch_apply algorithm (line 1809-1899)

1. **Deep copy** patches (non-destructive).
2. **Add padding** — null characters prepended/appended to avoid edge effects.
3. **patch_splitMax** — break oversized patches (>32 chars pattern) into sub-patches.
4. **Track delta offset** — cumulative shift from expected→actual positions.
5. For each patch:
   a. Extract `text1` (the context/pattern from `diff_text1(patch.diffs)`).
   b. Call `match_main(text, text1, expected_loc)` to find where the context appears.
   c. If `match_main` returns `-1`: **patch fails** → `results[x] = false`, delta adjusted.
   d. If found: apply the patch's insert/delete operations at the found location.

### match_main → match_bitap_ (the Bitap algorithm)

`match_main` (line 1428) does:
1. Exact substring check at `expected_loc` — if found, return immediately.
2. Otherwise → `match_bitap_` (line 1460), the fuzzy matching engine.

**match_bitap_** uses the Bitap algorithm (shift-or) with these parameters:
- **Match_Threshold** (default 0.5): Score cutoff. Score = `errors/patternLength + distance/Match_Distance`. A score > threshold means no match.
- **Match_Distance** (default 1000): How far from expected location before scoring penalizes.
- **Match_MaxBits** (default 32): Maximum pattern length for Bitap (32-bit integer constraint).

### What causes patch failure

A patch fails when `match_main` returns `-1`. This happens when:

1. **Context text is too different** — the agent's Y.Text has diverged so much from the baseline that the patch's surrounding context can't be found within threshold.
2. **Context has shifted too far** — the matched location is so far from expected that `accuracy + proximity/Match_Distance > Match_Threshold`.
3. **Monster delete** — for patches >32 chars, `patch_splitMax` breaks them up. Both start AND end sub-patterns must match; if either fails, the whole delete fails.

### The Patch_DeleteThreshold second gate (line 1870-1876)

Even when `match_main` finds a location, there's a second check for imperfect matches:
```javascript
if (text1.length > this.Match_MaxBits &&
    this.diff_levenshtein(diffs) / text1.length > this.Patch_DeleteThreshold) {
  results[x] = false;  // Content too different despite position match
}
```

### Can we set Match_Threshold = 0 for exact-only?

**Setting `Match_Threshold = 0.0`** would mean:
- Only `score = 0.0` (perfect match at exact position) passes.
- `match_bitapScore_(0, loc)` = `0/patternLength + 0/Match_Distance = 0.0` ≤ 0.0 → passes.
- `match_bitapScore_(0, loc+1)` = `0 + 1/1000 = 0.001` > 0.0 → fails.

This means **patches only apply at their exact original position**. Any positional shift from prior patches, agent edits, or concurrent writes → immediate failure. This would dramatically INCREASE the drop rate, not decrease it.

### Current configuration

```javascript
// In apply-diff.ts:
const dmpMerge = new DiffMatchPatch();
dmpMerge.Match_Threshold = 0.5;  // pinned per audit F15
```

`Match_Threshold = 0.5` is the DMP default and the most permissive reasonable setting. Going higher (e.g., 0.8) would accept more fuzzy matches but risk applying patches at wrong locations.

### The fundamental limitation

DMP's patch_apply is designed for **graceful degradation**, not **guaranteed application**. It's a best-effort fuzzy matcher — when context diverges beyond threshold, it silently drops the patch rather than risk applying it at the wrong location. This is the correct behavior for DMP's original use case (human-authored patches applied to independently-edited text), but it's a structural mismatch for a CRDT bridge where we need guaranteed lossless three-way merge.

## Confidence: HIGH

The failure mechanics are deterministic and fully understood from source code reading. The 2-3% rate is inherent to DMP's architecture, not a tuning problem.
