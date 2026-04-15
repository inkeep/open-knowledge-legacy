---
type: codebase-trace
sources:
  - packages/app/src/editor/observers.ts:117-249
  - packages/app/src/editor/observers.ts:327-333
  - packages/app/src/editor/diff-lines-fast.ts
---

# Observer A's two code paths and their different problems

## Path selection (observers.ts:327-333)

```typescript
if (currentText === lastSyncedXmlMd) {
  applyIncrementalDiff(ytext, currentText, md);
} else {
  applyUserDelta(ytext, lastSyncedXmlMd, md);
}
```

## Path A: applyIncrementalDiff (line 117-141) — simple path

**Trigger:** `currentText === lastSyncedXmlMd` — Y.Text hasn't diverged from Observer A's last sync.

**What it does:** Diffs `currentText` against `newText` (new XmlFragment md) using `diffLinesFast`, applies changes at byte offsets via `ytext.delete(offset, len)` + `ytext.insert(offset, value)`.

**Agent-write interaction:** In this path, Y.Text matches the baseline. Agent writes would have made Y.Text diverge, triggering Path B instead. So this path fires when there are NO concurrent agent writes — the diff shows only user changes. Agent content that was PREVIOUSLY synced is in EQUAL regions and never touched.

**Origin-laundering risk:** LOW for normal operation. The diff hunks are user changes; EQUAL regions preserve agent Items. Risk exists only if the diff library produces a suboptimal REMOVED+ADDED pair for content that hasn't actually changed (e.g., unterminated final line aliasing — already documented in the code comments at line 120-128).

**Content-comparison gate opportunity:** Before each REMOVED+ADDED pair, check if `currentText.substring(offset, offset + removedLen)` already equals the ADDED content. If yes, skip. Belt-and-suspenders — low impact since agent Items are usually in EQUAL regions on this path.

## Path B: applyUserDelta (line 189-249) — diverged path

**Trigger:** `currentText !== lastSyncedXmlMd` — Y.Text has diverged (agent wrote to it, or external change landed).

**What it does:** Computes line-level diff between `lastSyncedXmlMd` and new XmlFragment md (the USER's delta only). Walks the diff hunks and tries to apply each change to the current Y.Text lines using `indexOf(line, resultCursor)` for matching. Produces a merged `newText`, then applies via `applyByPrefixSuffix`.

**Agent-write interaction:** This is the problematic path. The diff shows the user's changes. The `indexOf(line)` matching tries to locate each diff hunk in the current Y.Text (which has agent content). When user and agent edited the same LINE:
- `indexOf("original_line")` may not find an exact match (agent changed the line)
- The REMOVED hunk fails to match → stays in resultLines
- The ADDED hunk inserts at cursor → creates duplicate/mixed content
- `applyByPrefixSuffix` then compares the merged result against currentText and applies minimal changes

**Origin-laundering risk:** HIGH on same-line collision. The `applyByPrefixSuffix` step does preserve matching prefix/suffix Items, but the MIDDLE (the changed region) gets delete+reinsert with 'sync-from-tree' origin.

**Character-level diff fix:** Switching from `diffLines` to `diffChars` for the user's delta computation produces SMALLER, MORE PRECISE hunks. The three-way merge logic works better because:
- Char-level EQUAL regions are larger → more agent Items in the preserved prefix/suffix
- Char-level ADDED hunks are smaller → the delete+reinsert blast radius shrinks
- Same-line concurrent edits that touch different character ranges produce separate hunks instead of merging into one line-level hunk

## Performance (from prior Probe B data)

| Blocks | diffLines (ms) | diffChars (ms) | Ratio |
|--------|---------------|----------------|-------|
| 1,000  | 0.525         | 3.053          | 5.8x  |
| 10,000 | 5.010         | 35.405         | 7.1x  |

Path B fires only when Y.Text has diverged (~10% of Observer A firings in practice). The 7x slowdown on the diverged path is acceptable because:
1. It's the rare path (90% of fires use Path A which stays on line-level)
2. The total cost (35ms at 10K blocks) fits within the 50ms debounce budget
3. Serialize is the dominant cost (23ms), not diff (5-35ms)
