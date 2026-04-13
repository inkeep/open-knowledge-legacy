# Milkdown Schema Analysis — Source-Level Evidence

## Source Repository
- **Repo:** [Milkdown/milkdown](https://github.com/Milkdown/milkdown)
- **Key packages:** `@milkdown/preset-commonmark`, `@milkdown/preset-gfm`, `@milkdown/transformer`
- **Schema API docs:** [milkdown.dev/docs/api/preset-commonmark](https://milkdown.dev/docs/api/preset-commonmark)

## Node Type Names (ProseMirror Schema Registration IDs)

These are the exact string IDs passed to `$nodeSchema(id, ...)`, which become the ProseMirror `NodeType.name`:

### preset-commonmark

| ProseMirror Node Name | Source File | mdast Type Matched | Schema Export |
|---|---|---|---|
| `doc` | `doc.ts` | `root` | `docSchema` |
| `paragraph` | `paragraph.ts` | `paragraph` | `paragraphSchema` |
| `heading` | `heading.ts` | `heading` | `headingSchema` |
| `blockquote` | `blockquote.ts` | `blockquote` | `blockquoteSchema` |
| `code_block` | `code-block.ts` | `code` | `codeBlockSchema` |
| `image` | `image.ts` | `image` | `imageSchema` |
| `hardbreak` | `hardbreak.ts` | `break` | `hardbreakSchema` |
| `hr` | `hr.ts` | `thematicBreak` | `hrSchema` |
| `bullet_list` | `bullet-list.ts` | `list` (!ordered) | `bulletListSchema` |
| `ordered_list` | `ordered-list.ts` | `list` (ordered) | `orderedListSchema` |
| `list_item` | `list-item.ts` | `listItem` | `listItemSchema` |
| `html` | `html.ts` | `html` | `htmlSchema` |
| `text` | `text.ts` | `text` | `textSchema` |

### preset-gfm

| ProseMirror Node Name | Source File | mdast Type Matched |
|---|---|---|
| `table` | `table/schema.ts` | `table` |
| `table_header_row` | `table/schema.ts` | `tableRow` (isHeader) |
| `table_row` | `table/schema.ts` | `tableRow` |
| `table_cell` | `table/schema.ts` | `tableCell` (!isHeader) |
| `table_header` | `table/schema.ts` | `tableCell` (isHeader) |
| `footnote_definition` | `footnote/definition.ts` | `footnoteDefinition` |
| `footnote_reference` | `footnote/reference.ts` | `footnoteReference` |

## Mark Type Names

### preset-commonmark

| ProseMirror Mark Name | Source File | mdast Type Matched |
|---|---|---|
| `strong` | `strong.ts` | `strong` |
| `emphasis` | `emphasis.ts` | `emphasis` |
| `inlineCode` | `inline-code.ts` | `inlineCode` |
| `link` | `link.ts` | `link` |

### preset-gfm

| ProseMirror Mark Name | Source File | mdast Type Matched |
|---|---|---|
| `strike_through` | `strike-through.ts` | `delete` |

## Naming Convention Analysis

**Pattern:** Milkdown uses **snake_case** for multi-word node names (`bullet_list`, `code_block`, `list_item`, `strike_through`) following ProseMirror's historical convention from `prosemirror-schema-list`. Mark names use **camelCase** (`inlineCode`) following mdast convention. Single-word names are the same across all systems (`heading`, `paragraph`, `blockquote`, `image`, `link`).

**Comparison:**

| Concept | Milkdown | prosemirror-markdown | TipTap | mdast |
|---|---|---|---|---|
| Bold | `strong` | `strong` | `bold` | `strong` |
| Italic | `emphasis` | `em` | `italic` | `emphasis` |
| Inline code | `inlineCode` | `code` | `code` | `inlineCode` |
| Code block | `code_block` | `code_block` | `codeBlock` | `code` |
| Bullet list | `bullet_list` | `bullet_list` | `bulletList` | `list` (!ordered) |
| Ordered list | `ordered_list` | `ordered_list` | `orderedList` | `list` (ordered) |
| List item | `list_item` | `list_item` | `listItem` | `listItem` |
| HR | `hr` | `horizontal_rule` | `horizontalRule` | `thematicBreak` |
| Hard break | `hardbreak` | `hard_break` | `hardBreak` | `break` |
| Strikethrough | `strike_through` | N/A | `strike` | `delete` |

## List Architecture

Lists are **separate node types** (`bullet_list` and `ordered_list`), following the `prosemirror-schema-list` split pattern. They share a common `list_item` child type.

The bridge to mdast splits a single `list` type by the `ordered` boolean:
- `bullet_list.parseMarkdown.match`: `({ type, ordered }) => type === 'list' && !ordered`
- `ordered_list.parseMarkdown.match`: `({ type, ordered }) => type === 'list' && !!ordered`

Task list items are NOT a separate node type. The GFM preset uses `listItemSchema.extendSchema()` to add a `checked` attribute to the existing `list_item` node.

## Atom Nodes

- **`hr`**: Block-level atom (no content spec). Matches mdast `thematicBreak`.
- **`image`**: Inline atom (`inline: true`, `atom: true`, `selectable: true`, `draggable: true`, `marks: ''`). Attrs: `src`, `alt`, `title`.
- **`hardbreak`**: Inline but not atom (`selectable: false`, no `atom: true`).
- **`html`**: Inline atom (`atom: true`, `inline: true`). Stores raw HTML in `value` attribute.
- **`footnote_reference`**: Inline atom (`atom: true`, `inline: true`). Stores `label` attribute.

## Architecture: Three-Layer mdast-to-ProseMirror Bridge

### Layer 1: Remark Pipeline
```typescript
unified().use(remarkParse).use(remarkStringify, options)
```
Additional remark plugins added via `remarkPluginsCtx`. GFM preset wraps `remark-gfm`.

### Layer 2: Transformer (`@milkdown/transformer`)
- **Parsing:** `markdown string` -> `remark.parse()` -> `remark.runSync()` -> `mdast tree` -> `ParserState` walks tree, calling `parseMarkdown.match()` on each ProseMirror spec -> `parseMarkdown.runner()` builds ProseMirror nodes
- **Serialization:** `ProseMirror Node tree` -> `SerializerState` walks tree, calling `toMarkdown.match()` -> `toMarkdown.runner()` builds mdast tree -> `remark.stringify()` -> `markdown string`

### Layer 3: Schema Specs (co-located)
Each ProseMirror node/mark schema definition includes:
- `parseMarkdown: { match: (mdastNode) => boolean, runner: (state, node, type) => void }`
- `toMarkdown: { match: (pmNode) => boolean, runner: (state, node) => void }`

This is a **co-located pattern** — parseDOM, toDOM, parseMarkdown, and toMarkdown all live in the same node definition file.

## Key Architectural Decisions

1. **`$nodeSchema(id, factory)`** takes a string ID that becomes both the ProseMirror node type name AND the key in the schema's nodes map.
2. **`$nodeSchema` supports `extendSchema()`** for GFM-style extensions (e.g., task list items extend `list_item`).
3. **Custom remark plugins run before parsing** to enrich the mdast tree (e.g., `remarkMarker` adds `marker` properties to emphasis/strong nodes for delimiter preservation).
4. **Matching is a linear scan**, not a lookup table — iterates all node types and calls each spec's `match()` function.
