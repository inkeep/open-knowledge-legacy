# ProseMirror Canonical Patterns — Source-Level Evidence

## The Official prosemirror-markdown Schema

**Source:** [ProseMirror/prosemirror-markdown](https://github.com/ProseMirror/prosemirror-markdown)

### Node Types

| Node | Content | Group | Key Properties |
|---|---|---|---|
| `doc` | `block+` | -- | top-level |
| `paragraph` | `inline*` | block | |
| `blockquote` | `block+` | block | |
| `horizontal_rule` | -- | block | leaf, renders `<div><hr></div>` |
| `heading` | `(text \| image)*` | block | attrs: `{level: {default: 1}}`, `defining: true` |
| `code_block` | `text*` | block | attrs: `{params: {default: ""}}`, `code: true`, `defining: true`, `whitespace: "pre"` |
| `ordered_list` | `list_item+` | block | attrs: `{order: {default: 1}, tight: {default: false}}` |
| `bullet_list` | `list_item+` | block | attrs: `{tight: {default: false}}` |
| `list_item` | `block+` | -- | `defining: true` |
| `text` | -- | inline | |
| `image` | -- | inline | `inline: true`, `draggable: true`, attrs: `{src, alt, title}` |
| `hard_break` | -- | inline | `inline: true`, `selectable: false` |

### Mark Types

| Mark | Key Properties |
|---|---|
| `em` | `emphasis` in mdast |
| `strong` | `strong` in mdast |
| `link` | attrs: `{href, title}`, `inclusive: false` |
| `code` | `code: true` |

### Naming Convention

All multi-word names use **snake_case**: `code_block`, `list_item`, `ordered_list`, `horizontal_rule`, `bullet_list`, `hard_break`. This is the de facto ProseMirror standard, consistently followed across prosemirror-markdown, prosemirror-schema-basic, prosemirror-schema-list, and prosemirror-tables.

## prosemirror-tables Schema

**Source:** [ProseMirror/prosemirror-tables](https://github.com/ProseMirror/prosemirror-tables)

| Node | Content | tableRole | Key Properties |
|---|---|---|---|
| `table` | `table_row+` | `table` | `isolating: true` |
| `table_row` | `(table_cell \| table_header)*` | `row` | |
| `table_cell` | user-defined | `cell` | `isolating: true`, attrs: `{colspan, rowspan, colwidth}` |
| `table_header` | user-defined | `header_cell` | `isolating: true`, attrs: `{colspan, rowspan, colwidth}` |

Key: `isolating: true` prevents cursor operations from escaping boundaries.

## prosemirror-schema-list

**Source:** [ProseMirror/prosemirror-schema-list](https://github.com/ProseMirror/prosemirror-schema-list)

Exports: `orderedList`, `bulletList`, `listItem` (camelCase export names) registered as `ordered_list`, `bullet_list`, `list_item` (snake_case schema IDs).

Commands: `wrapInList`, `splitListItem`, `liftListItem`, `sinkListItem`

## Marijn's Key Recommendations

### Schema Extension
From [discuss.prosemirror.net/t/new-schema-extending-customizing-it/315](https://discuss.prosemirror.net/t/new-schema-extending-customizing-it/315):
> Use `OrderedMap` methods. Schema comes first, then editor, then plugins. Cannot modify schema after editor initialization.

### Inline Atoms
- `atom: true` on contentless nodes is redundant (they are implicitly atomic)
- Inline nodes with content require custom NodeView
- Fundamental tradeoff: atom nodes gain whole-node selection but lose direct content editability

### Custom Components (MDX)
From [discuss.prosemirror.net/t/prosemirror-markdown-with-liquid-tags/4391](https://discuss.prosemirror.net/t/prosemirror-markdown-with-liquid-tags/4391):
> Custom syntax MUST be represented as distinct document nodes to receive special serialization treatment.

### Wiki Links
From [discuss.prosemirror.net/t/inline-node-with-simple-content/1176](https://discuss.prosemirror.net/t/inline-node-with-simple-content/1176):
> Inline nodes with contents "aren't something that tends to work out of the box, since browsers aren't very coherent about cursor motion around inline node edges." Custom NodeView required.

### Marks vs Nodes
From [discuss.prosemirror.net/t/rationale-for-marks/379](https://discuss.prosemirror.net/t/rationale-for-marks/379):
> Marks exist because "emphasis isn't hierarchical, it is an extra attribute added to a stretch of content." Benefits: no duplication, canonical representation, simplified positions, cleaner block splitting.

### Frontmatter / Metadata
From [discuss.prosemirror.net/t/meta-data-nodes/1163](https://discuss.prosemirror.net/t/meta-data-nodes/1163):
> "I would really recommend putting only the visible, editable part of the document into the editor." Metadata should be extracted before editing and re-attached after. Hidden nodes are vulnerable to "select all + delete."

### Round-Trip Fidelity
> prosemirror-markdown provides normalized (lossy) round-trip by design. Source-text fidelity requires storing extra attrs (marker style, indentation, etc.)
> For preserving source markers, Marijn suggests using CodeMirror instead.

## Schema Versioning

From [discuss.prosemirror.net/t/schema-versioning-and-migrations/321](https://discuss.prosemirror.net/t/schema-versioning-and-migrations/321):

Marijn: "This is best left to the user. Write your own upgrade function."

**Community patterns (kiejo):**
1. Direct JSON modification of document structure
2. ProseMirror Transforms method: create migration schema supporting both constraints, iterate nodes, collect transforms, execute

From [discuss.prosemirror.net/t/upgrading-a-doc-to-a-different-schema/5370](https://discuss.prosemirror.net/t/upgrading-a-doc-to-a-different-schema/5370):
Marijn: "No [built-in]. You'll need to write your own code to convert documents."

## Flat List Alternative

From [discuss.prosemirror.net/t/prosemirror-flat-list-alpha/5191](https://discuss.prosemirror.net/t/prosemirror-flat-list-alpha/5191):

**prosemirror-flat-list** by ocavue: Single `list` node type with indentation via CSS and data attributes. Uses CSS counters for ordered lists. Aims for Google Docs / Notion UX. Marijn flagged Tab/Shift-Tab accessibility concerns.

## remark-prosemirror Library

From [discuss.prosemirror.net/t/new-markdown-library-remark-prosemirror/8049](https://discuss.prosemirror.net/t/new-markdown-library-remark-prosemirror/8049):

Created by Handle With Care collective (moment.dev). Replaces markdown-it with unified/remark. Marijn responded positively: "glad this exists now."

Architecture: handler-based mapping between mdast types and ProseMirror types. Full remark plugin ecosystem access.

Sources:
- [handlewithcarecollective/remark-prosemirror](https://github.com/handlewithcarecollective/remark-prosemirror)
- [@handlewithcare/remark-prosemirror on npm](https://www.npmjs.com/package/@handlewithcare/remark-prosemirror)
