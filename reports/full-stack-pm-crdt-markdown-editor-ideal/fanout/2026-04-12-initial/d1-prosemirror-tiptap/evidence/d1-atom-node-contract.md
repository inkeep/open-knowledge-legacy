# D1: ProseMirror Atom Node Contract

## What `atom: true` means

`atom: true` in `NodeSpec` is a **view-layer hint**, not a model-layer constraint. From the prosemirror-model source (`schema.ts`):

> "Can be set to true to indicate that, though this isn't a leaf node, it doesn't have directly editable content and should be treated as a single unit in the view."

The `NodeType.isAtom` getter:
```typescript
get isAtom() { return this.isLeaf || !!this.spec.atom }
```

Marijn on discuss.prosemirror.net: `atom` is "just a hint to the selection managing code that arrowing into the node should select it, rather than enter it."

Source: [discuss.prosemirror.net/t/cursor-movement-on-node-with-atom-true/1252](https://discuss.prosemirror.net/t/cursor-movement-on-node-with-atom-true/1252)

## `atom: true` vs `leaf: true`

| Property | Has content? | Editable in view? | `isLeaf` | `isAtom` | `nodeSize` |
|----------|-------------|-------------------|----------|----------|------------|
| `content: ""` (no atom flag) | No | N/A | `true` | `true` | `1` |
| `content: "text*", atom: true` | Yes | No (view hint) | `false` | `true` | `2 + content.size` |
| `content: "block+"` (no atom flag) | Yes | Yes | `false` | `false` | `2 + content.size` |

Marijn: "atom does nothing for nodes without content -- those are implicitly atoms."

Source: [discuss.prosemirror.net/t/am-i-using-the-atom-in-correct-way/6394](https://discuss.prosemirror.net/t/am-i-using-the-atom-in-correct-way/6394)

## Marks on atom nodes

**Marks CAN apply to inline atom nodes.** Mark permissions are determined by the **parent node type**, not the individual inline node type. The `NodeSpec.marks` string compiles into a `markSet` on `NodeType`:

```typescript
type.markSet = markExpr == "_" ? null :
  markExpr ? gatherMarks(this, markExpr.split(" ")) :
  markExpr == "" || !type.inlineContent ? [] : null
```

If a paragraph allows bold marks, ALL inline children (including atoms) can carry bold. You **cannot** selectively disable marks for a specific inline node type.

Marijn: "Marks can't be configured per node, only per parent node."

Sources:
- [discuss.prosemirror.net/t/nodespec-marks-not-work-at-inline-node/2414](https://discuss.prosemirror.net/t/nodespec-marks-not-work-at-inline-node/2414)
- [discuss.prosemirror.net/t/dont-wrap-certain-inline-nodes-in-another-marks/2784](https://discuss.prosemirror.net/t/dont-wrap-certain-inline-nodes-in-another-marks/2784)

### `enterInlineAtoms` option on `toggleMark`

```typescript
export function toggleMark(markType: MarkType, attrs?: Attrs, options?: {
  removeWhenPresent?: boolean
  enterInlineAtoms?: boolean  // default: true
}): Command
```

When `enterInlineAtoms: false`, the mark applies to the atom as a unit but does NOT descend into its content. When `true` (default), it descends.

Source: [prosemirror-commands/src/commands.ts](https://github.com/ProseMirror/prosemirror-commands/blob/master/src/commands.ts)

## Cursor, selection, deletion behavior

**Arrow keys** (`prosemirror-view/src/capturekeys.ts`): `selectHorizontally` creates `NodeSelection` for atoms instead of entering them.

**Click** (`prosemirror-view/src/input.ts`): `selectClickedLeaf` creates `NodeSelection` for atoms when `NodeSelection.isSelectable(node)` is true (default for non-text nodes).

**Backspace** (`prosemirror-commands/src/commands.ts`, `joinBackward`):
```typescript
if (before.isAtom && $cut.depth == $cursor.depth - 1) {
  if (dispatch) dispatch(state.tr.delete($cut.pos - before.nodeSize, $cut.pos).scrollIntoView())
  return true
}
```

**Delete** (`joinForward`): Same pattern, deletes the entire atom as a unit.

## Inline atoms: `inline: true` + `atom: true`

Behavioral characteristics:
1. Rendered inline within text flow
2. Arrow keys create NodeSelection (step over atomically)
3. Inherit mark permissions from parent node
4. Click selects the whole node
5. Backspace/Delete removes as unit
6. Must implement `contentDOM = null` in NodeView for true non-editability

The canonical example: ProseMirror footnote example:
```javascript
{
  group: "inline",
  content: "text*",
  inline: true,
  atom: true,
  toDOM: () => ["footnote", 0],
  parseDOM: [{tag: "footnote"}]
}
```

Source: [prosemirror.net/examples/footnote/](https://prosemirror.net/examples/footnote/)

## Known issues

- Cursor positioning immediately before inline atoms can be incorrect on some browsers ([ProseMirror #1031](https://github.com/ProseMirror/prosemirror/issues/1031))
- Deletion of inline node immediately followed by inline atom can behave unexpectedly ([discuss.prosemirror.net/t/8101](https://discuss.prosemirror.net/t/deletion-of-an-inline-node-is-not-working-if-it-is-immediately-followed-by-an-inline-atom-node/8101))

## Implications for proposed schema

1. **wiki-link as inline atom**: Correct pattern. Marks from parent will apply to it (bold wiki-link is possible); cannot be disabled per-node.
2. **MDX inline components as inline atoms**: Correct pattern. Same mark behavior applies.
3. **For atoms that should reject marks**: The only recourse is a custom `appendTransaction` plugin that strips unwanted marks from specific node types.
