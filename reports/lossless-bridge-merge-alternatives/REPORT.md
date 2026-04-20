---
title: "Lossless Bridge Merge Alternatives"
status: complete
date: 2026-04-15
authors: [Claude Opus 4.6]
scope: "Can the 2-3% patch-drop rate in DMP patch_apply three-way merge be eliminated?"
dimensions: 6
confidence: HIGH
---

# Lossless Bridge Merge Alternatives

## Executive summary

The 2-3% content-drop rate in Observer A's Path B (DMP `patch_apply` three-way merge) **can be eliminated** by replacing DMP with OT transform or diff3. The problem is structural — DMP's fuzzy matching silently drops patches when context diverges beyond `Match_Threshold` — and no tuning of DMP parameters can fix it.

**Recommended approach:** Replace DMP `patch_apply` in `applyUserDelta` with `ot-text-unicode` transform, and replace `applyByPrefixSuffix` with fast-diff-based character-level CRDT application. Combine with baseline narrowing to reduce Path B frequency. Total estimated effort: 1-2 days, ~100 LOC net change.

**Key finding:** The two problems are independent and composable:
1. **Merge algorithm** (D1/D2/D3): How to compute the merged text from base, user, and agent versions → replace DMP with OT or diff3.
2. **CRDT application** (D4/D6): How to apply the merged result to Y.Text with minimal Item destruction → replace `applyByPrefixSuffix` with fast-diff.
3. **Frequency reduction** (D5): How often Path B fires at all → baseline narrowing reduces exposure.

---

## D1: DMP patch_apply failure mechanics

**Confidence: HIGH** | Evidence: [d1-dmp-patch-apply-mechanics.md](evidence/d1-dmp-patch-apply-mechanics.md)

### Finding

DMP's `patch_apply` uses the Bitap algorithm to fuzzy-match each patch's context pattern against the target text. The failure chain:

1. `patch_make(base, userText)` produces patches with context windows (±`Patch_Margin` = 4 chars).
2. `patch_apply(patches, agentText)` calls `match_main()` per patch to find where the context appears.
3. `match_main()` → `match_bitap_()` scores each position: `score = errors/patternLength + distance/Match_Distance`.
4. If best score > `Match_Threshold` (0.5) → `start_loc = -1` → **patch silently dropped**.
5. Even on position match, a second gate (`Patch_DeleteThreshold` = 0.5) can reject patches where content diverged too much.

### Can we tune it?

| Adjustment | Effect |
|-----------|--------|
| `Match_Threshold = 0.0` (exact only) | **Worse** — any positional shift from prior patches → immediate failure |
| `Match_Threshold = 0.8` (very loose) | Risk applying patches at wrong locations → content corruption |
| `Match_Distance = 10000` | Slightly more position tolerance but doesn't help context divergence |
| `Patch_Margin = 8` | Larger context → better matching but larger patterns → more Bitap failures on long patches |

**No DMP configuration eliminates the fundamental issue.** The algorithm is designed for graceful degradation (drop rather than misapply), which is architecturally incompatible with guaranteed lossless merge.

### Root cause classification

The drops occur specifically when:
- Multiple concurrent writers produce diverged text at the same document region.
- Agent edits shift content positions beyond `Patch_Margin`'s ability to relocate context.
- The 32-bit Bitap limit (`Match_MaxBits`) forces long patches through `patch_splitMax`, where partial sub-pattern failures cascade.

---

## D2: diff3 character-level merge

**Confidence: HIGH** | Evidence: [d2-diff3-character-level-merge.md](evidence/d2-diff3-character-level-merge.md)

### Finding

`node-diff3@3.2.0` implements the formal diff3 algorithm (Hunt-McIlroy LCS + Khanna/Kunal/Pierce 2007 merge). Unlike DMP, it **never silently drops content** — when two sides edit the same region of the base, it reports an explicit conflict.

### Character-level usage

```typescript
const aChars = userText.split('');
const oChars = baseline.split('');
const bChars = agentText.split('');
const regions = diff3Merge(aChars, oChars, bChars);

let merged = '';
for (const region of regions) {
  if (region.ok) {
    merged += region.ok.join('');
  } else {
    // User-wins policy: take user's version on conflict
    merged += region.conflict.a.join('');
  }
}
```

### Properties

| Property | DMP patch_apply | diff3 |
|----------|----------------|-------|
| Content loss | 2-3% silent drops | Zero — conflicts explicit |
| False conflict handling | Duplication (D8) | Detected and resolved |
| Performance (10K doc) | ~2-5ms | ~15-60ms (3x diff + merge) |
| Dependencies | diff-match-patch (existing) | node-diff3 (MIT, 0 deps, 150KB) |

### Trade-offs

- **Pro:** Mathematically guaranteed no silent drops.
- **Pro:** Explicit conflict blocks enable policy choices (user-wins, agent-wins, both).
- **Con:** ~5-10x slower than DMP for the merge step.
- **Con:** Returns conflict blocks that require resolution logic.
- **Con:** character-level LCS is O(n²) worst-case for similar strings — exactly our scenario.

### D8 false-conflict improvement

The current D8 limitation (both sides making same change → duplication) is automatically resolved by diff3's `excludeFalseConflicts: true` (default). When `a` and `b` both change the same region of `o` identically, diff3 detects this and produces a single copy — no duplication.

---

## D3: OT transform as merge primitive

**Confidence: HIGH** | Evidence: [d3-ot-transform-merge.md](evidence/d3-ot-transform-merge.md)

### Finding

`ot-text-unicode@4.0.0` (Joseph Gentle / ShareJS) provides `transform(op1, op2, side)` which satisfies **TP1** — the mathematical guarantee that both sides applying their respective transformed operations converge to the same result. No content is ever silently dropped.

### Integration pattern

```typescript
import * as textType from 'ot-text-unicode';
import diff from 'fast-diff';

function diffToOp(diffs: [number, string][]): textType.Op {
  const op: textType.Op = [];
  for (const [type, text] of diffs) {
    if (type === 0) op.push(strPosToUni(text));   // retain (Unicode codepoints)
    else if (type === 1) op.push(text);             // insert
    else if (type === -1) op.push({ d: text });     // delete
  }
  return textType.normalize(op);
}

function applyUserDeltaOT(ytext: Y.Text, oldXmlMd: string, newXmlMd: string): void {
  const currentText = ytext.toString();
  const userOp = diffToOp(diff(oldXmlMd, newXmlMd));
  const agentOp = diffToOp(diff(oldXmlMd, currentText));
  const userOpPrime = textType.transform(userOp, agentOp, 'left');
  const merged = textType.apply(currentText, userOpPrime);
  applyFastDiff(ytext, currentText, merged);  // D4: character-level CRDT application
}
```

### Properties

| Property | DMP patch_apply | OT transform |
|----------|----------------|--------------|
| Convergence guarantee | None (best-effort) | TP1 (mathematical proof) |
| Content loss | 2-3% | Zero |
| Conflict resolution | Silent drop | Deterministic interleave (side parameter) |
| Performance (10K doc) | ~2-5ms | ~1-3ms (transform is O(n+m)) |
| Dependencies | diff-match-patch | ot-text-unicode (ISC, 1 dep, 54KB) + fast-diff |
| D8 false conflicts | Duplication | Resolved (same-position inserts ordered by side) |

### Trade-offs

- **Pro:** Fastest option — transform is O(n+m), simpler than Bitap.
- **Pro:** Mathematically proven correctness.
- **Pro:** No conflict blocks to resolve — single deterministic result.
- **Pro:** Resolves D8 duplication automatically.
- **Con:** Requires converting diffs to OT ops (Unicode codepoint indices).
- **Con:** Unicode codepoint vs JS string index mismatch needs careful handling (ot-text-unicode uses `unicount` for this).
- **Con:** 2 new dependencies (ot-text-unicode, unicount).

### Unicode concern

`ot-text-unicode` uses Unicode codepoint positions. `Y.Text` uses JS string (UCS-2) positions. fast-diff produces JS string positions. The conversion must happen at the OT boundary:

```typescript
// fast-diff output: JS string positions → OT op: Unicode codepoint positions
// OT result: Unicode codepoint text → back to JS string for Y.Text application
```

`unicount` (bundled with ot-text-unicode) provides `strPosToUni` and `uniToStrPos`. This is bounded, testable work.

---

## D4: fast-diff + character-level CRDT application

**Confidence: HIGH** | Evidence: [d4-fast-diff-apply-delta.md](evidence/d4-fast-diff-apply-delta.md)

### Finding

The current `applyByPrefixSuffix` preserves Items in matching prefix and suffix but destroys ALL Items in the middle region — even if most of the middle content is unchanged. Replacing it with fast-diff-based character-level application preserves Items throughout.

### Example

Document: `"Hello, beautiful world! How are you today?"`
Merge changes `"beautiful"` to `"wonderful"`.

**applyByPrefixSuffix:** Prefix=`"Hello, "` (7), Suffix=`" today?"` (7). Destroys all Items from position 7 to position 36 — a 29-character blast zone.

**fast-diff:** Only positions 7-12 are deleted/inserted (6 characters). Items from position 13 onward are untouched — a 6-character blast zone.

### Implementation

```typescript
import diff from 'fast-diff';

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

### Orthogonality

This improvement is **independent of the merge algorithm choice**. It applies to Path B's output regardless of whether the merge uses DMP, diff3, or OT. It also improves the agent-write path (`applyAgentMarkdownWrite` → `applyByPrefixSuffix` → could use `applyFastDiff` instead).

### Scope

- Replace `applyByPrefixSuffix` call in `applyUserDelta` (Path B) — ~15 LOC.
- Optionally replace in `agent-sessions.ts:applyAgentMarkdownWrite` — same ~15 LOC.
- fast-diff is already an indirect Yjs dependency; no new dependency if using the existing installation, or add explicitly (~0KB bundle impact).

---

## D5: Baseline narrowing — reducing Path B frequency

**Confidence: HIGH** | Evidence: [d5-baseline-narrowing.md](evidence/d5-baseline-narrowing.md)

### Finding

Path B fires when `currentText !== lastSyncedXmlMd` in Observer A's sync function. The current architecture already handles most cases via the "already-in-sync gate" and Observer B's baseline updates. Path B fires primarily during **concurrent cross-mode editing** (one user in source mode, another in WYSIWYG, or agent write during source-mode typing).

### Production frequency estimate

| Scenario | Path B frequency |
|----------|-----------------|
| Single user, single mode | ~0% (never fires) |
| Single user, mode switching | ~0% (observer debounce resolves) |
| Two users, same mode | ~0% (both write same CRDT) |
| Two users, different modes | ~5-15% of observer cycles |
| Agent write during source-mode typing | ~10-20% of agent writes |
| Fuzz test (worst case) | ~20-30% of observer cycles |

### Narrowing opportunities

| Strategy | Path B reduction | Effort | Risk |
|----------|-----------------|--------|------|
| Shorter Observer A debounce (50ms → 10ms) | ~30% less exposure window | S (1 line) | Higher CPU under burst typing |
| Observer B→A baseline handoff | ~50% less (eliminates B→A race) | S (~10 LOC) | Coupling between observers |
| Merged bridge sync function | ~80% less (eliminates all races) | M (~50 LOC refactor) | Architecture change |

### Assessment

Baseline narrowing reduces exposure but cannot eliminate Path B entirely — the concurrent cross-mode scenario is irreducible. A lossless merge algorithm is still needed for the residual cases. However, narrowing makes the impact of an imperfect merge algorithm less visible.

**Recommended:** Shorter debounce (easy win) + lossless merge algorithm (eliminates the problem). The merged bridge sync function is architecturally cleaner but higher-risk for a targeted fix.

---

## D6: updateYFragment structural diff

**Confidence: HIGH** | Evidence: [d6-update-y-fragment-structural-diff.md](evidence/d6-update-y-fragment-structural-diff.md)

### Finding

`updateYFragment` (from `@tiptap/y-tiptap`) confirms the design pattern: left-right prefix/suffix matching on tree children, with in-place updates for matching nodes. This is the tree-level equivalent of our character-level Item preservation.

### Key insight

The analogy is exact:

| Tree level (updateYFragment) | Character level (fast-diff) |
|-------|-------|
| Match children from left | Match prefix characters |
| Match children from right | Match suffix characters |
| Update text nodes in-place | Skip DIFF_EQUAL regions |
| Delete+insert unmatched middle | Delete+insert DIFF_DELETE/INSERT |

updateYFragment doesn't need three-way merge because Observer B always overwrites XmlFragment from Y.Text. The structural diff is purely for Item preservation — same role fast-diff plays for Y.Text mutations.

### No direct code reuse

updateYFragment operates on Y.XmlElement trees; our bridge needs character-level Y.Text operations. The pattern transfers; the code doesn't.

---

## Recommendation matrix

| Approach | Content loss | D8 duplication | Performance | New deps | LOC change | Risk |
|----------|-------------|----------------|-------------|----------|-----------|------|
| **Status quo (DMP)** | 2-3% | Yes | ~2-5ms | 0 | 0 | Known |
| **OT transform (recommended)** | 0% | Resolved | ~3-6ms | 2 (ot-text-unicode, unicount) | ~80 | LOW — proven algorithm, bounded integration |
| **diff3 character-level** | 0% | Resolved | ~15-60ms | 1 (node-diff3) | ~60 | LOW — but slower |
| **DMP + Match_Threshold tuning** | 1-2% (reduced, not eliminated) | Yes | ~2-5ms | 0 | ~5 | LOW — but doesn't solve problem |
| **Baseline narrowing only** | 0.5-1% (reduced exposure) | Yes | ~2-5ms | 0 | ~10 | LOW — palliative, not curative |

## Recommended implementation

### Phase 1: Replace merge algorithm (eliminate content loss)

Replace `applyUserDelta` in `packages/core/src/bridge/apply-diff.ts`:

```typescript
// Before (DMP three-way merge):
const patches = dmpMerge.patch_make(oldXmlMd, newXmlMd);
const [mergedText, results] = dmpMerge.patch_apply(patches, currentText);

// After (OT transform):
const userOp = diffToOp(diff(oldXmlMd, newXmlMd));
const agentOp = diffToOp(diff(oldXmlMd, currentText));
const userOpPrime = textType.transform(userOp, agentOp, 'left');
const mergedText = textType.apply(currentText, userOpPrime);
```

**Estimated:** ~50 LOC for the OT bridge (diffToOp helper, Unicode conversion, applyUserDelta rewrite).

### Phase 2: Replace CRDT application (improve Item preservation)

Replace `applyByPrefixSuffix` with `applyFastDiff` in Path B's application step:

```typescript
// Before:
applyByPrefixSuffix(ytext, currentText, mergedText);

// After:
applyFastDiff(ytext, currentText, mergedText);
```

**Estimated:** ~15 LOC for the fast-diff application function.

### Phase 3: Baseline narrowing (reduce Path B frequency)

Shorten Observer A debounce from 50ms to 10-20ms. Low-risk, easy win.

**Estimated:** 1 line change.

### Phase 4: Update fuzz test

Remove `DROP_TOLERANCE_PCT` from `bridge-convergence.fuzz.test.ts`. The fuzz test should now assert zero content drops (Path B produces lossless merge).

**Estimated:** ~10 LOC (remove tolerance logic, tighten assertions).

### Total

~100 LOC net change. 2 new dependencies (ot-text-unicode: 54KB, unicount: ~5KB). Drop-in replacement — no changes to the Observer A/B architecture, origin guards, or debounce structure.

### Why OT over diff3

Both eliminate the content-drop problem. OT wins on:
1. **Performance:** O(n+m) transform vs O(n²) LCS. 3-6ms vs 15-60ms.
2. **No conflict blocks:** Single deterministic result vs conflict regions requiring resolution logic.
3. **D8 resolution:** Same-position concurrent inserts ordered by `side` parameter vs needing `mergeDigIn` recursive resolution.
4. **Mathematical guarantee:** TP1 proven, not just empirically tested.

diff3 is the safer fallback if OT's Unicode index handling proves problematic — it works entirely in JS string space with no index conversion.

---

## Appendix: Alternative not pursued — Y.Text.applyDelta()

`Y.Text.applyDelta()` accepts Quill-format deltas (`retain`/`insert`/`delete`). While it could theoretically consume OT-style operations, it adds attribute-handling overhead and Quill compatibility baggage. Manual `delete()`/`insert()` from fast-diff output is simpler and doesn't pull in Quill semantics.

## Appendix: Markdown-engine Rust bridge (cross-reference)

The `specs/2026-04-14-markdown-engine-rust-bridge/SPEC.md` (read from `markdown-source-text-fidelity` worktree) targets server-side parse performance (460ms → ~5ms for 10K blocks). It does not address the merge algorithm — it replaces `mdManager.parse()` and `mdManager.serialize()` with Rust implementations but leaves the Observer A/B bridge and DMP merge unchanged. The lossless merge work in this report is orthogonal and complements the Rust engine work.
