# D6: updateYFragment Structural Diff

## Source analysis

Read: `node_modules/@tiptap/y-tiptap/dist/y-tiptap.js` lines 1209-1358

## Algorithm overview

`updateYFragment` performs a **structural diff** between a Y.XmlFragment tree and a ProseMirror Node tree. It's the Observer B write path (Y.Text → parse → ProseMirror JSON → updateYFragment → XmlFragment).

### Core mechanism: left-right matching with equality factors

```javascript
const updateYFragment = (y, yDomFragment, pNode, meta) => {
  // 1. Update attributes (shallow compare per key)
  // 2. Match children from left
  for (; left < minCnt; left++) {
    if (!mappedIdentity(leftY, leftP)) {
      if (equalYTypePNode(leftY, leftP)) {
        meta.mapping.set(leftY, leftP);  // update mapping
      } else break;
    }
  }
  // 3. Match children from right (same pattern)
  // 4. Process unmatched middle:
  //    - XmlText nodes: updateYText (in-place text update)
  //    - XmlElement nodes: compare by name, choose update direction
  //      based on computeChildEqualityFactor
  //    - No match: delete old + insert new
};
```

### Key design patterns

**1. Identity preservation via mapping.**
`meta.mapping` is a `Map<Y.XmlElement, ProseMirror.Node>` that tracks which CRDT items correspond to which PM nodes. Items that match (by identity or equality) are updated in-place rather than replaced.

**2. Left-right prefix/suffix matching.**
Identical to `applyByPrefixSuffix` at the tree level — find matching children from both ends, only process the divergent middle. This preserves Items for all unchanged children.

**3. equalYTypePNode — deep equality check.**
For atom nodes (leaf elements), compares all attributes. This is the check that causes the destructive delete+reinsert for atom nodes with frequently-changing attrs (per architectural precedent #10).

**4. computeChildEqualityFactor — heuristic for middle resolution.**
When both left and right unmatched elements have the same name as the target PM nodes, the algorithm picks which side to update by comparing "equality factors" (how many mapped children each side has). This is a greedy heuristic, not an optimal matching.

**5. Text node in-place update.**
```javascript
if (leftY instanceof Y.XmlText && leftP instanceof Array) {
  if (!equalYTextPText(leftY, leftP)) {
    updateYText(leftY, leftP, meta);  // in-place text mutation
  }
}
```
`updateYText` updates the Y.XmlText content without destroying the Y.Item. This is the tree-level equivalent of our `applyByPrefixSuffix` on Y.Text.

### What we can learn

**Pattern: left-right matching is the right granularity for tree structures.**
updateYFragment's prefix/suffix matching on child arrays is structurally identical to our `applyByPrefixSuffix` on character positions. Both preserve unchanged regions at the boundaries.

**Pattern: the "unmatched middle" is where information loss happens.**
In both updateYFragment and applyByPrefixSuffix, the middle region (after left-right matching) is the blast zone. updateYFragment mitigates with equality factors; our bridge currently does a single delete+insert.

**Insight: fast-diff is the character-level equivalent of updateYFragment's structural diff.**
Where updateYFragment preserves unchanged child elements by matching structure, fast-diff would preserve unchanged character runs by matching content. The analogy is exact:

| Tree level (updateYFragment) | Character level (fast-diff) |
|-------|-------|
| Match children from left | Match prefix characters |
| Match children from right | Match suffix characters |
| Update matching children in-place | Skip equal diff hunks |
| Delete+insert unmatched middle | Delete+insert changed hunks |

**Insight: updateYFragment doesn't need a "three-way merge" because it's always overwriting.**
Observer B always replaces XmlFragment content with the parsed Y.Text state. There's no "merge" — it's a unidirectional sync. The structural diff is purely for Item preservation.

Our Path B is different — it's a genuine three-way merge (baseline × user edit × agent edit). updateYFragment's approach doesn't directly apply to the merge problem, but its Item-preservation patterns apply to the APPLICATION of the merge result.

### Edge case: the Y.XmlText clear-content hack (line 1344-1349)

```javascript
if (yChildCnt === 1 && pChildCnt === 0 && yChildren[0] instanceof Y.XmlText) {
  // Edge case: retain Y.Text object but clear content
  yChildren[0].delete(0, yChildren[0].length);
}
```

This preserves the Y.XmlText object (and its remote change tracking) even when the ProseMirror model says the parent should be empty. It's a concession to CRDT identity preservation — the same principle we're pursuing.

## Assessment

updateYFragment confirms the pattern: the right approach is to (1) compute the desired result through whatever merge/diff algorithm, then (2) apply it to the CRDT with maximum Item preservation via structural matching.

For Observer A (XmlFragment → Y.Text), the equivalent is: (1) compute merged Y.Text content via a lossless merge algorithm, then (2) apply it via character-level diff (fast-diff) rather than bulk prefix/suffix replacement.

No direct code reuse possible — updateYFragment operates on trees, we need character-level operations. But the design principle transfers completely.

## Confidence: HIGH

updateYFragment source fully read. The pattern analysis is direct. No novel insights beyond confirming the approach — which is itself valuable.
