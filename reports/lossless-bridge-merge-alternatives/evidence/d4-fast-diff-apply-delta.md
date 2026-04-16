# D4: fast-diff + Y.Text.applyDelta

## Source analysis

Read: `fast-diff@1.3.0` source from npm (`/tmp/fast-diff-pkg/package/diff.js`)
Read: Yjs docs for `Y.Text.applyDelta()`

## fast-diff overview

fast-diff is a stripped-down fork of Google's diff-match-patch — diff only, no match or patch. It produces character-level diffs as `[type, text]` tuples:
- `[0, "unchanged"]` — DIFF_EQUAL
- `[1, "inserted"]` — DIFF_INSERT
- `[-1, "deleted"]` — DIFF_DELETE

It's already an indirect dependency via Yjs's internal diffing.

## Current approach: applyByPrefixSuffix

The current `applyByPrefixSuffix` in `packages/core/src/utils/apply-by-prefix-suffix.ts`:

```typescript
// Finds matching prefix and suffix, deletes+inserts only the middle.
let prefixLen = 0;
while (prefixLen < minLen && currentText[prefixLen] === newText[prefixLen]) prefixLen++;
let suffixLen = 0;
while (...) suffixLen++;
ytext.delete(prefixLen, deleteLen);
ytext.insert(prefixLen, insertStr);
```

This is O(n) for prefix/suffix scanning, then **one delete + one insert** for the middle region. Any CRDT Items in the middle are destroyed, even if most of the middle content is unchanged.

## fast-diff alternative

```typescript
import diff from 'fast-diff';

function applyFastDiff(ytext: Y.Text, currentText: string, newText: string): void {
  const diffs = diff(currentText, newText);
  let offset = 0;
  for (const [type, text] of diffs) {
    if (type === 0) {        // EQUAL — skip
      offset += text.length;
    } else if (type === -1) { // DELETE
      ytext.delete(offset, text.length);
    } else if (type === 1) {  // INSERT
      ytext.insert(offset, text);
      offset += text.length;
    }
  }
}
```

### How this preserves more Items

Example — current text: `"Hello, beautiful world!"`, new text: `"Hello, wonderful world!"`:

**applyByPrefixSuffix:**
- Prefix match: `"Hello, "` (7 chars)
- Suffix match: `" world!"` (7 chars)
- Delete middle: 9 chars `"beautiful"` at offset 7
- Insert middle: 9 chars `"wonderful"` at offset 7
- **All Items in the middle region are destroyed and replaced.**

**fast-diff approach:**
- Diff: `[0,"Hello, "], [-1,"beauti"], [1,"wonder"], [0,"ful world!"]`
- Delete 6 chars at offset 7, insert 6 chars at offset 7
- **Items in `"ful world!"` (positions 13-23) are preserved.** Only the 6-char differing region is mutated.

### Y.Text.applyDelta() as an alternative to manual delete/insert

`Y.Text.applyDelta()` accepts Quill-format deltas:
```javascript
ytext.applyDelta([
  { retain: 7 },           // skip "Hello, "
  { delete: 6 },           // delete "beauti"
  { insert: "wonder" },    // insert "wonder"
  { retain: 10 }           // skip "ful world!"
])
```

However, `applyDelta` is designed for Quill integration and handles formatting attributes. Using manual `delete()`/`insert()` is simpler and avoids the attribute-handling overhead.

### Quantifying the improvement

For Path B's `applyUserDelta`:

**Current flow:**
1. DMP `patch_apply` → merged string (may silently drop patches)
2. `applyByPrefixSuffix(ytext, currentText, mergedString)` → one big middle replacement

**Improved flow (regardless of merge algorithm):**
1. Any merge algorithm → merged string (diff3, OT, or improved DMP)
2. `applyFastDiff(ytext, currentText, mergedString)` → character-level CRDT mutations

The second step preserves more Items even if the merge algorithm produces the same result. This is orthogonal to the merge algorithm choice — it improves Item preservation for ANY merge output.

### For Path A too?

Path A already uses `applyIncrementalDiff` with line-level diffing via `diffLinesFast`. Could fast-diff character-level replace it?

**No — line-level is correct for Path A.** Path A fires when Y.Text matches baseline, so the diff represents structural changes (added/removed lines). Line-level diffing produces fewer, coarser CRDT operations, which is better for undo-stack coherence (Y.UndoManager groups by transaction, and smaller number of operations = cleaner undo). Character-level would produce many tiny operations that fragment undo behavior.

**fast-diff is strictly better for Path B** where the merge output may differ from current Y.Text at many character positions scattered through the document.

### Performance

fast-diff is O(n²) worst case (Myers diff), but typically O(n*D) where D is the edit distance. For our use case (merge output vs agent text, typically very similar), this is ~1-3ms for 10K documents.

## Assessment

Replacing `applyByPrefixSuffix` with fast-diff-based character-level application in Path B is a clear win for Item preservation, regardless of which merge algorithm is chosen. It's orthogonal and composable.

The improvement is most valuable when the merge algorithm produces a result that differs from `currentText` at multiple scattered positions — exactly the case where `applyByPrefixSuffix` wastes Items in the middle region between the first and last change.

## Confidence: HIGH

fast-diff source fully read. The improvement is mechanically sound. The only risk is edge cases in fast-diff's output (e.g., Unicode surrogate pairs), but fast-diff handles these correctly per its test suite.
