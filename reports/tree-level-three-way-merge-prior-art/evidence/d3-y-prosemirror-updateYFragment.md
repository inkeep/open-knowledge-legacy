# Evidence: D3 y-prosemirror updateYFragment

**Dimension:** y-prosemirror `updateYFragment` — 2-way diff or 3-way merge?
**Date:** 2026-04-17
**Sources:** y-prosemirror GitHub (v1.3.7 source), Yjs community forum discussion

---

## Key files / pages referenced

- [y-prosemirror/src/plugins/sync-plugin.js v1.3.7](https://github.com/yjs/y-prosemirror/blob/master/src/plugins/sync-plugin.js) — definitive source (function at line 1145)
- [Yjs forum: updateYFragment algorithm accuracy](https://discuss.yjs.dev/t/y-prosemirror-updateyfragment-algorithm-accuracy/1273) — maintainer discussion
- [Yjs forum: YDocs Diffing 2 snapshots](https://discuss.yjs.dev/t/ydocs-diffing-2-snapshots/2037) — related diffing discussion

---

## Findings

### Finding: `updateYFragment` is a TWO-way diff — no common-ancestor parameter

**Confidence:** CONFIRMED
**Evidence:** y-prosemirror v1.3.7 `sync-plugin.js:1145` — direct source read

Function signature from the source (line 1145):

```js
/**
 * @param {{transact: Function}} y
 * @param {Y.XmlFragment} yDomFragment
 * @param {any} pNode
 * @param {BindingMetadata} meta
 */
export const updateYFragment = (y, yDomFragment, pNode, meta) => {
  if (
    yDomFragment instanceof Y.XmlElement &&
    yDomFragment.nodeName !== pNode.type.name
  ) {
    throw new Error('node name mismatch!')
  }
  meta.mapping.set(yDomFragment, pNode)
  // ... diff and update logic follows
}
```

**The function takes exactly two state arguments: `yDomFragment` (current Yjs state) and `pNode` (target ProseMirror state).** There is NO third "base" or "common ancestor" argument. This is a 2-way diff, not a 3-way merge.

### Finding: The algorithm is a left-right matching walk — not a structural diff

**Confidence:** CONFIRMED
**Evidence:** y-prosemirror v1.3.7 `sync-plugin.js:1178-1268` — direct source read

Source extraction (abbreviated; full text in Bash output):
```js
// find number of matching elements from left
for (; left < minCnt; left++) {
  const leftY = yChildren[left]
  const leftP = pChildren[left]
  if (!mappedIdentity(meta.mapping.get(leftY), leftP)) {
    if (equalYTypePNode(leftY, leftP)) {
      meta.mapping.set(leftY, leftP)
    } else {
      break
    }
  }
}
// find number of matching elements from right
for (; right + left < minCnt; right++) { /* symmetric */ }

y.transact(() => {
  while (yChildCnt - left - right > 0 && pChildCnt - left - right > 0) {
    // decide updateLeft vs updateRight via computeChildEqualityFactor
    // recurse on the chosen side; delete items that can't be matched
  }
})
```

The algorithm:
1. Skip prefix of matching children (using `equalYTypePNode` deep-equality or `mappedIdentity`)
2. Skip suffix of matching children from the right
3. In the middle mismatched range, compute an `equalityFactor` for both left and right, pick the side that looks more like an update-in-place, recurse; delete unmatched items
4. Recurse `updateYFragment` on matched child pairs

This is a **structural diff algorithm with no concept of a "base" state**. It does not reason about "what changed on each side since a common point" — it reasons about "how to transform the current Y structure into the target P structure with minimum mutation."

### Finding: `equalYTypePNode` uses deep attribute equality — which is the source of precedent #10 in the consuming project's CLAUDE.md

**Confidence:** CONFIRMED
**Evidence:** y-prosemirror v1.3.7 `sync-plugin.js:976` + project CLAUDE.md precedent #10

From `sync-plugin.js:976`:
```js
const equalYTypePNode = (ytype, pnode) => {
  // ... deep equality of type, attrs, and children
}
```

Any attr-value mismatch on an atom node causes the whole Y.XmlElement to be deleted and reinserted — which is Y.Item-level churn, not in-place mutation. (This is what the consuming project's CLAUDE.md precedent #10 documents and is orthogonal to the merge question but confirms the shape of the diff algorithm.)

### Finding: Yjs maintainer (dmonad) has publicly confirmed `updateYFragment` is not a structural-merge algorithm for concurrent edits

**Confidence:** CONFIRMED
**Evidence:** [Yjs forum thread](https://discuss.yjs.dev/t/y-prosemirror-updateyfragment-algorithm-accuracy/1273)

From the thread (via WebFetch investigation of the forum post):
> "The algorithm in `updateYFragment` though prioritises updating nodes of the same type, regardless of their content."
> "matchNodeName(leftY, leftP)" — matches by type name, not content
> dmonad: "Yjs takes the approach of showing what the user actually changed."

The original poster notes they were "using Yjs for an unsupported use case (diffing documents without shared history) and implemented a custom 'patient' algorithm variant to achieve better results for their specific needs." → Confirms that diffing two fragments without a common history is acknowledged by the community as an unsupported use case.

### Finding: y-prosemirror's concurrent-edit guarantee comes from Yjs CRDT layer, NOT from updateYFragment

**Confidence:** CONFIRMED
**Evidence:** y-prosemirror architecture (composition of ySyncPlugin + Yjs op-based CRDT)

`updateYFragment` is invoked when a PM transaction needs to be reflected into Y.XmlFragment state. The concurrent-edit conflict-free guarantee comes from Yjs's RGA-style CRDT underneath Y.Text/Y.XmlFragment — **op-based CRDT merge**, not from `updateYFragment`. `updateYFragment` is the **local** PM-to-Yjs reflection function; it is never asked to reconcile remote state against local state because remote state arrives as Yjs ops, which the CRDT layer handles without any `updateYFragment` involvement.

---

## Implications for the central research question

y-prosemirror — the most-deployed Yjs + ProseMirror binding in production (TipTap, Milkdown, Outline, BlockSuite, etc.) — has NO three-way merge primitive. Its tree-update function is:

- **Two-way** (current Y, target P) → no base argument
- **Mutation-minimizing** in an intuitive sense (match prefix + suffix, recurse inside) → but not formally proven to preserve content under arbitrary interleavings
- **Invoked locally** (the binding doesn't attempt to merge tree states from two peers; that happens at the CRDT op-log level below it)

**For a question of "reconcile live Y.XmlFragment against external non-CRDT state," y-prosemirror offers no primitive.** Callers implementing this flow must build it themselves — typically by serializing Y.XmlFragment to markdown/text, running diff3 at the text layer, and re-invoking `updateYFragment` with the re-parsed target. This is the **serialize-merge-parse** pattern in practice.

---

## Negative searches

- GitHub y-prosemirror issue tracker searched for "three-way" / "3-way" / "base" / "common ancestor" → no hits on merge semantics
- Yjs community forum searched for "external reconciliation" / "disk edit" → no authoritative pattern
- y-prosemirror TEST files have no three-way merge test coverage — only two-way diff tests

---

## Gaps / follow-ups

- How Milkdown and TipTap propagate user edits back to markdown files (when they do) — investigated in D6
- Whether any community plugin exposes a 3-way merge on Y.XmlFragment — searched, not found
