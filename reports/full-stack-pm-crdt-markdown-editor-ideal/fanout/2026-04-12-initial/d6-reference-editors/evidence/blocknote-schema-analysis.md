# BlockNote Schema Analysis — Source-Level Evidence

## Source Repository
- **Repo:** [TypeCellOS/BlockNote](https://github.com/TypeCellOS/BlockNote)
- **Docs:** [blocknotejs.org/docs](https://www.blocknotejs.org/docs)
- **Schema docs:** [blocknotejs.org/docs/features/blocks](https://www.blocknotejs.org/docs/features/blocks)

## Architecture Overview

BlockNote is a **block-oriented** rich text editor built on ProseMirror + TipTap. It introduces a higher-level abstraction layer on top of ProseMirror's document model, organizing content into discrete Block objects rather than the traditional ProseMirror tree.

### Three-Schema Architecture

1. **BlockSchema** — Block-level content types (paragraph, heading, table, etc.)
2. **InlineContentSchema** — Inline elements within blocks (text, link)
3. **StyleSchema** — Text formatting options (bold, italic, textColor)

## Block Types (Default Schema)

### Text & Content Blocks

| Block Type | Properties | Content Model |
|---|---|---|
| `paragraph` | `backgroundColor`, `textColor`, `textAlignment` | InlineContent[] |
| `heading` | `level` (1-3), `isToggleable`, standard props | InlineContent[] |
| `quote` | standard props | InlineContent[] |
| `codeBlock` | `language` | text (no inline content) |

### List Types

| Block Type | Properties | Content Model |
|---|---|---|
| `bulletListItem` | standard props | InlineContent[] |
| `numberedListItem` | standard props | InlineContent[] |
| `checkListItem` | `checked`, standard props | InlineContent[] |
| `toggleListItem` | standard props | InlineContent[] |

### Structured Content

| Block Type | Properties | Content Model |
|---|---|---|
| `table` | standard props | TableContent (cell matrices) |

### Media Blocks

| Block Type | Properties | Content Model |
|---|---|---|
| `image` | `url`, `caption` | undefined (no content) |
| `video` | `url`, `caption` | undefined |
| `audio` | `url`, `caption` | undefined |
| `file` | `url` | undefined |

### Default Properties (All Blocks)

- `backgroundColor` — Color for block background
- `textColor` — Text color (inherits to nested blocks)
- `textAlignment` — "left" | "center" | "right" | "justify"

## Inline Content Types

| Type | Description |
|---|---|
| `text` | StyledText — text segments with applied formatting |
| `link` | Anchor elements wrapping StyledText arrays with href |

## Style Types (Marks Equivalent)

BlockNote calls marks "styles." The built-in styles include:
- `bold`, `italic`, `underline`, `strikethrough`
- `code` (inline)
- `textColor`, `backgroundColor`

## Block Structure Model

```typescript
interface Block {
  id: string;          // Unique identifier, persists throughout lifecycle
  type: string;        // Block category (paragraph, heading, etc.)
  props: Record<string, any>;  // Type-specific properties
  content: InlineContent[];    // Rich text (undefined for media blocks)
  children: Block[];           // Nested blocks (tree hierarchy)
}
```

### Nesting Model

BlockNote uses a **tree-based hierarchy**. Blocks can contain child blocks, enabling:
- Indented list items with nested sublists
- Collapsible sections
- Complex organizational schemes

This is fundamentally different from ProseMirror's flat content + nested nodes model.

## Markdown Conversion Pipeline

### Dependencies
- `unified` ^11.0.5
- `remark-parse` for markdown parsing
- `remark-stringify` for markdown generation
- `rehype-*` for HTML conversion

### Flow
```
Blocks → ExportManager → unified/remark pipeline → Markdown string
Markdown string → remark-parse → AST → block conversion → Blocks
```

### Key API Methods
- `editor.blocksToMarkdownLossy()` — Export (explicitly lossy)
- `editor.tryParseMarkdownToBlocks()` — Import (best-effort)

### Lossy Nature

BlockNote's markdown export is **explicitly lossy**:
- Children of blocks that aren't list items are un-nested
- Block-level properties (colors, alignment) are dropped
- Complex BlockNote features lack markdown equivalents
- Recommended to use JSON for full-fidelity storage: `JSON.stringify(editor.document)`

## Custom Block Extension Model

```typescript
const CustomBlock = createReactBlockSpec({
  type: "myBlock",
  propSchema: { /* ... */ },
  content: "inline",  // or "none"
}, {
  render: (props) => <MyComponent {...props} />,
  toExternalHTML: (props) => <div>...</div>,
});
```

Custom blocks plug into the same schema system and get TypeScript type safety.

## Naming Convention Comparison

| Concept | BlockNote | Milkdown | prosemirror-markdown | TipTap |
|---|---|---|---|---|
| Paragraph | `paragraph` | `paragraph` | `paragraph` | `paragraph` |
| Heading | `heading` | `heading` | `heading` | `heading` |
| Bullet list | `bulletListItem` | `bullet_list` | `bullet_list` | `bulletList` |
| Ordered list | `numberedListItem` | `ordered_list` | `ordered_list` | `orderedList` |
| Quote | `quote` | `blockquote` | `blockquote` | `blockquote` |
| Code block | `codeBlock` | `code_block` | `code_block` | `codeBlock` |
| Bold | `bold` (style) | `strong` (mark) | `strong` (mark) | `bold` (mark) |
| Italic | `italic` (style) | `emphasis` (mark) | `em` (mark) | `italic` (mark) |

### Key Differences from Standard ProseMirror

1. **Lists are items, not containers.** `bulletListItem` is a block type, not a `bullet_list` containing `list_item`s. Nesting uses the `children` array.
2. **Marks are "styles."** No ProseMirror Mark concept exposed — formatting is a property of StyledText.
3. **Block-level properties.** Every block carries `backgroundColor`, `textColor`, `textAlignment` — not a ProseMirror convention.
4. **`quote` not `blockquote`.** Shorter name.
5. **No separate list item type.** Each list kind IS the item type.

## MDX Support

BlockNote does **not** have native MDX support. Custom blocks can be defined but they don't serialize to/from MDX syntax. The markdown export is lossy by design.

## Sources
- [BlockNote Default Schema](https://www.blocknotejs.org/docs/editor-basics/default-schema)
- [BlockNote Document Structure](https://www.blocknotejs.org/docs/editor-basics/document-structure)
- [BlockNote Built-in Blocks](https://www.blocknotejs.org/docs/features/blocks)
- [BlockNote Markdown Export](https://www.blocknotejs.org/docs/features/export/markdown)
- [DeepWiki BlockNote](https://deepwiki.com/TypeCellOS/BlockNote)
