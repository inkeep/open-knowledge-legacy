# D3: Unified List Type Feasibility

## prosemirror-schema-list: Commands accept NodeType, not hardcoded names

All four core commands take a `NodeType` parameter:

```typescript
export function wrapInList(listType: NodeType, attrs?: Attrs): Command
export function splitListItem(itemType: NodeType, itemAttrs?: Attrs): Command
export function liftListItem(itemType: NodeType): Command
export function sinkListItem(itemType: NodeType): Command
```

**However, `addListNodes()` hardcodes names:**
```typescript
return nodes.append({
  ordered_list: add(orderedList, {content: "list_item+", group: listGroup}),
  bullet_list: add(bulletList, {content: "list_item+", group: listGroup}),
  list_item: add(listItem, {content: itemContent})
})
```

You are NOT required to use `addListNodes()`. You can define custom schema nodes and pass resolved `NodeType` to commands.

Source: [prosemirror-schema-list/src/schema-list.ts](https://github.com/ProseMirror/prosemirror-schema-list/blob/master/src/schema-list.ts)

## TipTap: Three separate extensions, NOT unified

| Extension | Node name | Content | Item reference |
|---|---|---|---|
| BulletList | `'bulletList'` | `${itemTypeName}+` | hardcodes `'listItem'` |
| OrderedList | `'orderedList'` | `${itemTypeName}+` | hardcodes `'listItem'` |
| TaskList | `'taskList'` | `${itemTypeName}+` | references `'taskItem'` |

`@tiptap/extension-list` is a **convenience bundle** (ListKit), not a unified node. It re-exports BulletList + OrderedList + ListItem + TaskList + TaskItem + ListKeymap.

**TipTap has no official unified list node.**

Sources:
- [extension-list/src/index.ts](https://github.com/ueberdosis/tiptap/blob/main/packages/extension-list/src/index.ts)
- [ListKit docs](https://tiptap.dev/docs/editor/extensions/functionality/list-kit)

## prosemirror-flat-list: Proven unified implementation

Source: [github.com/ocavue/prosemirror-flat-list](https://github.com/ocavue/prosemirror-flat-list)

### NodeSpec

```typescript
export function createListSpec(): NodeSpec {
  return {
    content: 'block+',
    group: `${flatListGroup} block`,
    definingForContent: true,
    definingAsContext: false,
    attrs: {
      kind: { default: 'bullet' },
      order: { default: null },
      checked: { default: false },
      collapsed: { default: false },
    },
    toDOM: (node) => listToDOM({ node }),
    parseDOM: createParseDomRules(),
  }
}
```

### Types

```typescript
export type ListKind = 'bullet' | 'ordered' | 'task' | 'toggle'

export interface ListAttributes {
  kind?: string
  order?: number | null
  checked?: boolean
  collapsed?: boolean
}
```

### Key design decisions

1. **Uses `kind` string**, not `ordered: boolean` -- more extensible for task/toggle
2. **Content `block+`**, not `listItem+` -- any block can be a child (including nested lists)
3. **Renders as `<div>`, not `<ul>/<ol>`** -- markers via CSS counters
4. **No separate listItem node** -- the `list` node acts as both container and item
5. **Completely custom commands** -- replaces all prosemirror-schema-list commands

### Command API

- `createWrapInListCommand` -- wraps selection in a list
- `createToggleListCommand` -- toggles list kind
- `createSplitListCommand` -- splits list at cursor
- `createIndentListCommand` / `createDedentListCommand` -- indent/outdent
- `createUnwrapListCommand` -- removes list wrapping
- `createMoveListCommand` -- move items up/down
- `createToggleCollapsedCommand` -- toggle collapse

### Marijn's feedback

Only concern: Tab/Shift-Tab key bindings conflict with keyboard navigation. Author switched to Mod-[/Mod-] as defaults.

Source: [discuss.prosemirror.net/t/prosemirror-flat-list-alpha/5191](https://discuss.prosemirror.net/t/prosemirror-flat-list-alpha/5191)

## mdast list structure

mdast uses a unified model:
```
List (parent)
  ordered: boolean
  start: number | null
  spread: boolean
  children: ListItem[]

ListItem (parent)
  checked: boolean | null  // null = not task, true/false = task
  spread: boolean
  children: FlowContent[]
```

**Key difference from proposed schema:** mdast puts `checked` on `listItem`, not on `list`. This is correct because a single list can contain a mix of checked and unchecked items.

## Analysis: Unified `list` node with `ordered: boolean`

### Feasibility

**Proven viable** by prosemirror-flat-list. The ProseMirror model layer fully supports it.

### Design choices

| Decision | `kind` string (flat-list) | `ordered: boolean` (proposed) |
|---|---|---|
| Extensibility | 4+ kinds (bullet, ordered, task, toggle) | Binary; task requires separate mechanism |
| mdast parity | Deviates (kind != ordered) | Close match (but checked on wrong node) |
| Toggling | `setNodeMarkup(pos, null, { kind: 'ordered' })` | `setNodeMarkup(pos, null, { ordered: true })` |

### Recommendation

For mdast parity, use `list` + `listItem` with:
- `list.attrs.ordered: boolean` (matches mdast `list.ordered`)
- `list.attrs.start: number` (matches mdast `list.start`)
- `list.attrs.spread: boolean` (matches mdast `list.spread`)
- `listItem.attrs.checked: boolean | null` (matches mdast `listItem.checked`)
- `listItem.attrs.spread: boolean` (matches mdast `listItem.spread`)

This preserves the `list > listItem` hierarchy (enabling prosemirror-schema-list command reuse) while unifying bullet/ordered/task into a single list type.

### TipTap integration cost

Merging into a single `list` node requires replacing BulletList + OrderedList + TaskList extensions with a custom one, including custom `toggleList` commands, input rules, and keyboard shortcuts.

TipTap's `wrappingInputRule` wrapper has hardcoded `"bulletList"` / `"orderedList"` / `"taskList"` strings for `keepAttributes` logic -- these would need updating.
