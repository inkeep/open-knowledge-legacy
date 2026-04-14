---
name: P3 updateYFragment source-code trace
description: Deterministic code-path trace through y-prosemirror@1.3.7 updateYFragment for content-based vs attr-based node shapes. Replaces runtime probe with source-level verification.
date: 2026-04-13
sources:
  - node_modules/y-prosemirror/src/plugins/sync-plugin.js
---

# P3 — Y.Item identity under updateYFragment

**Method:** line-by-line trace of `updateYFragment` at `sync-plugin.js:1145-1298`. No runtime probe needed; behavior is statically determinable given `matchNodeName` stability.

## TL;DR

Both content-based (`atom: false, content: 'text*'`) and attr-based (`atom: true, attrs.content: string`) shapes **preserve parent Y.XmlElement Y.Item identity** under character-level inner edits. The `_item.delete` path at line 1270 is only reached when node names differ, not when attrs or content differ.

**This corrects the prior research agent's claim** that attr-based shapes cause per-keystroke delete+reinsert. That claim applied to node-name swaps (A B → B A), not to in-place content changes. In-place changes take the recurse-and-update path regardless of shape.

## Scenario A — content-based (rawMdxFallback with content: 'text*')

Y.XmlElement `rawMdxFallback` containing one `Y.XmlText` whose content is `"<Foo"`. User appends one char; Observer B re-parses; `updateYFragment` reconciles.

Trace:

1. **Entry** — `updateYFragment(y, rootFragment, pDoc, meta)` at line 1145 on the root fragment.
2. **Root attrs** — lines 1157–1171, no change.
3. **Prefix scan** — lines 1182–1193. Walks yChildren vs pChildren. Observer B built fresh pNodes; `meta.mapping` doesn't have identity entries for the new pNodes. Falls through to `equalYTypePNode(leftY, leftP)` at line 1186.
4. **`equalYTypePNode`** at line 976. Requires `matchNodeName` (line 979) AND `_length` match (line 982) AND `equalAttrs` (line 983, deep) AND every child recursively equal (lines 984–986). Inner `Y.XmlText` check at line 988 (`equalYTextPText`) compares delta text; `"<Foo" !== "<Foob"` → returns **false**. Prefix scan stops at the rawMdxFallback index.
5. **Suffix scan** — lines 1194–1206. Children after rawMdxFallback are unchanged → walked past. Suffix stops at the same rawMdxFallback from the right. Unmatched middle is exactly one child.
6. **Middle loop** — lines 1209–1277. `leftY instanceof Y.XmlText` is **false** (XmlElement) → `else` branch at line 1219. `matchNodeName` holds → `updateLeft = true`, `updateRight = true` (line 1220–1223). Tie on equality factor → `updateLeft` path selected (lines 1236–1250).
7. **Recurse** — line 1252: `updateYFragment(y, leftY, leftP, meta)` recursed on the **same** Y.XmlElement. Identity preserved at this level.
8. **Recursion inner** — `leftY.children = [Y.XmlText]`, `leftP.content = [PMTextNode]`. At line 1214: `leftY instanceof Y.XmlText && leftP instanceof Array` — **true**. At line 1215: `equalYTextPText` false. At line 1216: **`updateYText(leftY, leftP, meta)`** called.
9. **`updateYText`** at line 1075 — uses `simpleDiff`, issues `ytext.delete(index, remove)` + `ytext.insert(index, insert)` character-level deltas (lines 1086–1087). Only the changed characters are tombstoned. The Y.Text container's Y.Item is never touched.

**Terminal action:** recursive `updateYFragment` on parent + `updateYText` character-level delta on inner text. **No `_item.delete` call. No `yDomFragment.delete(index, 1)` at parent level.**

**Verdict: Y.Item PRESERVED. Confidence: HIGH.**

## Scenario B — atom with attr (`atom: true, attrs.content: string`)

1. Entry + root attrs + prefix — same as A.
2. `equalYTypePNode` on the atom: `matchNodeName` matches, `_length === 0 === content.length`, then line 983 `equalAttrs` fails (old `content: "<Foo"` vs new `content: "<Foob"`) → returns **false**. Prefix/suffix stop at this index.
3. Middle loop, not Y.XmlText. `matchNodeName` matches → `updateLeft = true`. Recurse at line 1252.
4. **Recursion inner** — lines 1154–1171 attribute update path. Line 1159: `yDomAttrs['content'] !== pAttrs['content']` → **`yDomFragment.setAttribute('content', '<Foob')`** at line 1160. No structural child changes (atom has no content; middle loop doesn't enter).

**Terminal action:** recursive `updateYFragment` → `setAttribute`. Parent Y.XmlElement's Y.Item never tombstoned.

**Verdict: Y.Item PRESERVED. Confidence: HIGH.**

## Where `_item.delete` IS reached

Only at line 1270 (`yDomFragment.delete(left, 1)`), which is gated on `!updateLeft && !updateRight` — neither side's `matchNodeName` holds. That happens when node types differ at the same position. For Observer B's re-parse of the same markdown, the re-parsed tree has the same node names at the same positions, so this path is not reachable for in-place content changes.

It IS reachable for:
- **Node-name swaps** — when a fallback becomes structured (`rawMdxFallback` → `paragraph` because the user fixed the syntax), that position's node name changes. Line 1270 fires. The old `rawMdxFallback` Y.XmlElement is tombstoned. This is correct behavior — a different node shape genuinely needs a new element.
- **Schema-throw fallbacks via R13** — if `schema.node()` throws and our patch substitutes a different node type (`rawMdxFallback` where jsxComponent was expected), that's a name change.

In both cases, the delete is the correct semantic outcome, not a bug.

## What this changes for the spec

**D10 rationale** was "content-based shape preserves Y.Item identity under character-level edits." That's true of content-based, but ALSO true of attr-based. The rationale doesn't actually differentiate the two.

**Real distinctions that remain:**

| Dimension | Content-based | Attr-based atom |
|---|---|---|
| Y.XmlElement Y.Item identity | Preserved | Preserved |
| Inner-edit sync granularity | Char-level Y.Text deltas | Whole-attr overwrite per change |
| Concurrent-edit merge semantics | Character-granular CRDT merge | Last-writer-wins on whole string |
| Undo granularity (via UndoManager) | Per-character ops | Per-attr update |
| Sync message bytes | Delta only | Full attr value every time |

These ARE real semantic differences but they are NOT about Y.Item identity.

## Decision: D10 stands, rationale updated

Content-based rawMdxFallback still wins on three grounds:
1. **Char-level CRDT merge** — if two clients happen to edit the same broken region concurrently, content-based produces a merged result at character granularity. Attr-based produces last-writer-wins on the whole string (lost concurrent edits).
2. **Consistency with R3 jsxInline** — both use `atom: false, content: '...*'` for opaque content-bearing nodes. One precedent, one mental model.
3. **Standard PM pattern** — NodeView with `contenteditable: false` on a content-bearing node is the canonical PM pattern for "opaque but editable via source mode."

None of these is "catastrophic per-keystroke cursor jumps." The decision stands but the stakes are lower than the prior research claimed.

## Unknowns requiring runtime verification

**None for the P3 question specifically.** The algorithm is deterministic given `matchNodeName` stability.

Runtime-dependent branches exist (tie-break at lines 1236–1250 between `updateLeft` and `updateRight`) but neither branch destroys identity — both recurse.

## Source anchors

- Identity-destroying: **line 1270** `yDomFragment.delete(left, 1)` — reached only when neither node name matches
- Identity-preserving: **line 1216** `updateYText` (text deltas), **lines 1253–1258** recursive `updateYFragment` on leftY, **lines 1261–1266** recursive on rightY, **line 1160** `setAttribute`
- Equality gate: **line 983** `equalAttrs`, **line 988** `equalYTextPText`
