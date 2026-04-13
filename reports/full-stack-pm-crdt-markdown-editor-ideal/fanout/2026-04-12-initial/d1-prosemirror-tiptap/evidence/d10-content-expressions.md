# D10: Schema Content Expressions

## Syntax

Content expressions use a regex-like grammar compiled to a DFA:

| Syntax | Meaning | Example |
|--------|---------|---------|
| `name` | Exactly one | `"paragraph"` |
| `name+` | One or more | `"paragraph+"` |
| `name*` | Zero or more | `"inline*"` |
| `name?` | Zero or one | `"caption?"` |
| `name{n}` | Exactly n | `"paragraph{2}"` |
| `name{n,m}` | Between n and m | `"paragraph{1,5}"` |
| `A B` | Sequence | `"heading paragraph+"` |
| `A \| B` | Alternative | `"paragraph \| blockquote"` |
| `(...)` | Grouping | `"(paragraph \| blockquote)+"` |
| `groupName` | Any type in group | `"block+"` |

**Limitation:** Expressions must be unambiguous (no backtracking). Complex conditional patterns require `appendTransaction` plugin logic.

Sources:
- [ProseMirror Guide: Content Expressions](https://prosemirror.net/docs/guide/#schema.content_expressions)
- [discuss.prosemirror.net/t/new-schema-expressions/313](https://discuss.prosemirror.net/t/new-schema-expressions/313)

## Groups

Defined via `NodeSpec.group` (space-separated for multiple groups):
```typescript
paragraph: { group: "block", content: "inline*" }
blockquote: { group: "block", content: "block+" }
```

Then `"block+"` matches one or more nodes in the `"block"` group.

**Ordering matters:** The first type in the group (by order in the `nodes` map) is used as the default synthesized node. Paragraph must come before blockquote to avoid infinite recursion.

## Idiomatic `doc` content: `block+`

From `prosemirror-schema-basic`:
```typescript
doc: { content: "block+" }
```

Marijn: "It is recommended to always require at least one child node in nodes that have block content, because browsers will completely collapse the node when empty."

Source: [prosemirror-schema-basic](https://github.com/ProseMirror/prosemirror-schema-basic/blob/master/src/schema-basic.ts)

## Idiomatic `listItem` content: `paragraph block*` vs `block+`

**`paragraph block*`** (conventional default):
- Forces first child to be paragraph -- prevents list items starting with nested lists
- Works reliably with prosemirror-schema-list commands
- Matches CommonMark/GFM behavior

**`block+`** (flexible alternative):
- Allows any block type as first child
- Marijn: switching to `block+` carries "absolutely no harm" if it suits your use case
- But built-in list commands "probably won't work for those" non-standard patterns

Sources:
- [discuss.prosemirror.net/t/recommended-spec-for-list-item-content/8247](https://discuss.prosemirror.net/t/recommended-spec-for-list-item-content/8247)
- [discuss.prosemirror.net/t/list-item-schema-content/718](https://discuss.prosemirror.net/t/list-item-schema-content/718)

## `canReplaceWith`, `fillBefore`, and paste behavior

Content expressions compile to a DFA (`ContentMatch`):

- **`canReplaceWith(from, to, type)`**: Tests if replacing children `from..to` with the given type is valid. Walks the DFA.
- **`fillBefore(fragment, toEnd)`**: Synthesizes nodes needed before `fragment` to satisfy the expression. How PM auto-creates paragraphs.
- **`findWrapping(type)`**: Determines wrapper nodes needed to make `type` valid. Used during paste.

**Synthesizability requirement:** All required nodes in a content expression must have defaults for all attrs. If a node has required attrs without defaults, `fillBefore` fails.

## Implications for proposed schema

1. **`doc` content**: `block+` is correct and canonical.
2. **`listItem` content**: `paragraph block*` recommended for compatibility with prosemirror-schema-list commands. `block+` is acceptable if building custom list commands.
3. **Groups**: Define `block` and `inline` groups. Atom nodes should be in appropriate group (`inline` for wiki-link, `block` for code block/JSX).
4. **Synthesizability**: All fidelity attrs (sourceFenceChar, bulletMarker, etc.) MUST have defaults. They do in the current codebase.
5. **For unified list**: If `list` content is `listItem+`, stock commands work. If `block+` (flat-list style), custom commands required.
