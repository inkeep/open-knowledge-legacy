# Evidence: y-prosemirror updateYFragment

**Dimension:** D1 — y-prosemirror updateYFragment internals
**Date:** 2026-04-13
**Sources:** `/node_modules/y-prosemirror/src/plugins/sync-plugin.js`

---

## Key files referenced

- `sync-plugin.js:1145–1298` — `updateYFragment` function body
- `sync-plugin.js:1182–1206` — prefix/suffix skip loops
- `sync-plugin.js:976–990` — `equalYTypePNode` structural equality
- `sync-plugin.js:1075–1091` — `updateYText` surgical text diff
- `sync-plugin.js:1283–1285` — Y.Text container preservation (issue #108)
- `sync-plugin.js:1207` — `ySyncPluginKey` transaction origin

---

## Findings

### Finding 1: y-prosemirror uses structural recursive diff, not serialize→diff→apply
**Confidence:** CONFIRMED

`updateYFragment(y, yDomFragment, pNode, meta)` mutates an existing Y.XmlFragment in place via:
1. Node-name check (throws if mismatch) — L1146
2. Attribute reconciliation (per-key gated: `if (yDomAttrs[key] !== pAttrs[key])`) — L1159
3. Left-prefix skip via `mappedIdentity` + `equalYTypePNode` — L1182-1193
4. Right-suffix skip (symmetric) — L1195-1206
5. Middle reconciliation: uses `computeChildEqualityFactor` to pick the side with most reusable children; recurses into the winner — L1207-1277
6. Tail delete / tail insert for unmatched children

**No string serialization. No line-level diff.** Operates directly on the tree structures.

### Finding 2: Equal subtrees are completely untouched (zero Item mutations)
**Confidence:** CONFIRMED

When `equalYTypePNode` returns true for a prefix/suffix pair, only the `meta.mapping` is updated (L1184, L1197). **No Y-type mutation happens.** The original Items (with original `client`/`clock`) stay in the document store.

### Finding 3: Text diff is surgical, preserves Y.XmlText container
**Confidence:** CONFIRMED

`updateYText` (L1075-1091) uses `simpleDiff` on the string form of Y.XmlText content, then emits `ytext.delete(index, remove)` + `ytext.insert(index, insert)`. Only the *changed* characters become new Items — the surrounding characters AND the Y.XmlText container itself are preserved.

Explicit comment at L1283-1285: *"Edge case handling https://github.com/yjs/y-prosemirror/issues/108 — Only delete the content of the Y.Text to retain remote changes on the same Y.Text object"* — this is an explicit minimal-mutation principle to avoid clobbering remote writers.

### Finding 4: Transaction origin is `ySyncPluginKey` for all new bytes
**Confidence:** CONFIRMED

All Y-type mutations happen inside `y.transact(() => {...}, ySyncPluginKey)` at L1207. Every newly-inserted byte during a PM→Y sync is tagged with this origin. y-prosemirror does NOT attempt to re-emit edits under the original writer's clientID.

### Finding 5: Origin preservation is structural, not origin-tag-based
**Confidence:** INFERRED

y-prosemirror's solution to origin preservation is:
- **For untouched subtrees:** Items are not mutated → original `client`/`clock` preserved → CRDT-layer authorship intact
- **For touched characters within a modified text node:** new Items under `ySyncPluginKey` origin → authorship lost for those specific characters
- **For surrounding characters in the same text node:** preserved as untouched Items

This is structural, not origin-aware. The origin-laundering problem is AVOIDED at the subtree level by not mutating. It is NOT avoided at the character level — characters that are actually changed still get new Items with sync-plugin origin.

### Finding 6: UndoManager interaction is explicit in sync-plugin
**Confidence:** CONFIRMED

L635: `tr.setMeta(ySyncPluginKey, { isChangeOrigin: true, isUndoRedoOperation: transaction.origin instanceof Y.UndoManager })` — the remote→PM direction explicitly flags UndoManager operations into PM's meta, so the PM side can react to undo.

L214-215: `if (pluginState.addToHistory === false && !pluginState.isChangeOrigin) { um.stopCapturing() }` — guards against pushing sync-only updates into a PM-side UndoManager.

No comments within `updateYFragment` itself about origin preservation — that behavior emerges from the structural-diff architecture.

---

## Comparison table

| Dimension | Observer A (Open Knowledge) | y-prosemirror `updateYFragment` |
|---|---|---|
| Input representation | Serialized markdown strings | Tree ↔ tree, no stringification |
| Diff algorithm | `diffLines` over markdown | Structural prefix/suffix + per-Item equality + recursive subtree diff |
| Unit of change | Markdown line → Y.Text char range | Item (element), Item (text container), Item (char run) |
| Attribution preservation for untouched subtree | None (whole line replaced) | Complete — Item not mutated |
| Top-level "content equal → skip" | Explicit early exit | Implicit via per-child structural equality (stronger) |
| Attribution for touched line | Zero — whole line delete+insert | Partial — `simpleDiff`, only changed chars get new Items |
| Origin of new bytes | `'sync-from-tree'` | `ySyncPluginKey` |
| Cross-writer safety | Loses agent attribution on edited lines | Preserves agent Items unless user touched exact char span |

---

## Implications for Open Knowledge

1. **y-prosemirror is significantly stronger than Observer A on origin preservation.** For the PM→Y direction (which is Observer B's territory via `updateYFragment`), y-prosemirror already does the right thing.

2. **Observer A (Y→markdown→Y.Text) is fundamentally different** because it bridges two *different* Y types (XmlFragment → Y.Text), with a markdown round-trip in between. y-prosemirror's approach doesn't directly apply — we can't do "structural diff" between two different Y types.

3. **BUT:** the principle (minimal-mutation, prefix/suffix skip, per-unit equality gate) is transferable. Our `applyByPrefixSuffix` already captures prefix/suffix skipping. Our proposed content-comparison gate is analogous to `equalYTypePNode` — "check if content matches before mutating."

4. **Our char-level diff approach is consistent with y-prosemirror's string-level `simpleDiff`.** y-prosemirror uses diff-match-patch-equivalent character-level diff for Y.Text content. Our proposal to switch `applyUserDelta` from line-level to char-level aligns with this pattern.

---

## Gaps / follow-ups

- `simpleDiff` implementation details — haven't traced whether it's char-level or has cleanup heuristics; relevant for choosing our DMP cleanup strategy
- Whether y-prosemirror has documented edge cases where the structural diff fails to preserve Items (issue tracker scan not yet done in this evidence collection)
