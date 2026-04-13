# Plate Schema Analysis — Source-Level Evidence

## Source Repository
- **Repo:** [udecode/plate](https://github.com/udecode/plate)
- **Docs:** [platejs.org](https://platejs.org/)
- **Framework:** Slate + React (NOT ProseMirror)

## Node Type Names

Plate uses **short, HTML-inspired type strings** for node types:

| Element | Type String | Plugin |
|---|---|---|
| Paragraph | `p` | `ParagraphPlugin` |
| Heading 1 | `h1` | `H1Plugin` |
| Heading 2 | `h2` | `H2Plugin` |
| Heading 3 | `h3` | `H3Plugin` |
| Heading 4 | `h4` | `H4Plugin` |
| Heading 5 | `h5` | `H5Plugin` |
| Heading 6 | `h6` | `H6Plugin` |
| Blockquote | `blockquote` | `BlockquotePlugin` |
| Code block | `code_block` | `CodeBlockPlugin` |
| Code line | `code_line` | (child of code_block) |
| Link | `a` | `LinkPlugin` |
| Table | `table` | `TablePlugin` |
| Horizontal rule | `hr` | `HorizontalRulePlugin` |

### Mark Type Names

Accessed via `KEYS` namespace:
- `KEYS.bold` — bold formatting
- `KEYS.italic` — italic formatting
- `KEYS.underline` — underline
- `KEYS.strikethrough` — strikethrough
- `KEYS.code` — inline code
- `KEYS.suggestion` — suggestion mark
- `KEYS.comment` — comment mark

## Package Structure (v49+)

Major restructuring in v49.0.0:
- `@udecode/plate-*` renamed to `@platejs/*`
- `BasicBlocksKit` bundles paragraph, headings (H1-H6), blockquote, horizontal rule
- `INDENT_LIST_KEYS` migrated to `KEYS` namespace
- `editor.getType()` now accepts plugin key strings

## Markdown Plugin (`@platejs/markdown`)

### Conversion Pipeline

```
Deserialization: Markdown → remark-parse → mdast → conversion rules → Plate nodes
Serialization:   Plate nodes → conversion rules → mdast → remark-stringify → Markdown
```

### mdast-to-Plate Type Mappings

| mdast Type | Plate Type | Notes |
|---|---|---|
| `paragraph` | `p` | |
| `heading` (depth 1-6) | `h1`-`h6` | Split by depth |
| `blockquote` | `blockquote` | |
| `code` (fenced) | `code_block` | Contains `code_line` children |
| `inlineCode` | `code` (mark) | |
| `strong` | `bold` (mark) | |
| `emphasis` | `italic` (mark) | |
| `link` | `a` | |
| `table` | `table` | |

### Remark Plugin Integration

```typescript
MarkdownPlugin.configure({
  options: {
    plainMarks: [KEYS.suggestion, KEYS.comment],
    remarkPlugins: [remarkMath, remarkGfm, remarkMdx, remarkMention],
  },
})
```

Supports: `remark-gfm`, `remark-math`, `remark-mdx`, custom `remarkMention`.

## MDX Support (The Strongest Among Reference Editors)

Plate has the most mature MDX story:

### How It Works

1. Uses `remark-mdx` to parse MDX syntax in the remark pipeline
2. Custom `rules` map MDX elements to Plate node types
3. Bidirectional: Plate nodes serialize back to MDX elements

### Custom Rule Pattern

```typescript
rules: {
  date: {
    deserialize: (mdastNode) => ({
      type: 'date',
      date: mdastNode.children?.[0]?.value,
      children: [{ text: '' }]
    }),
    serialize: (slateNode) => ({
      type: 'mdxJsxTextElement',
      name: 'date',
      children: [{ type: 'text', value: slateNode.date }]
    })
  }
}
```

### Built-in MDX Conversions

**Marks (inline MDX):**
- `<del>` — strikethrough
- `<sub>` — subscript
- `<sup>` — superscript
- `<u>` — underline
- `<mark>` — highlight

**Elements (block/inline MDX):**
- `<date>` — date picker
- `<callout>` — callout blocks
- `<column_group>` / `<column>` — multi-column layout
- `<file>`, `<audio>`, `<video>` — media embeds
- `<toc>` — table of contents
- `[display](mention:id)` — mentions (custom syntax, not pure MDX)

### Key Insight

Plate's MDX approach is **rule-based**: each custom element type has explicit `serialize` and `deserialize` rules. There's no generic "pass-through" MDX handling — every MDX element must have a registered rule.

## Schema Versioning

Plate handles schema evolution through **major version migrations**:
- v49: Complete package rename (`@udecode/plate-*` → `@platejs/*`)
- Constants migration: `INDENT_LIST_KEYS.listStyleType` → `KEYS.listType`
- Plugin instances → plugin key strings for `editor.getType()`
- No automated document migration — breaking changes require manual migration code

## Naming Convention Comparison

| Concept | Plate | Milkdown | prosemirror-markdown |
|---|---|---|---|
| Paragraph | `p` | `paragraph` | `paragraph` |
| Heading 1 | `h1` | `heading` (attrs.level=1) | `heading` (attrs.level=1) |
| Blockquote | `blockquote` | `blockquote` | `blockquote` |
| Code block | `code_block` | `code_block` | `code_block` |
| Bold | `bold` | `strong` | `strong` |
| Italic | `italic` | `emphasis` | `em` |
| Link | `a` | `link` | `link` |

**Key differences:**
1. Plate uses **HTML tag names** for elements (`p`, `h1`-`h6`, `a`, `hr`)
2. Headings are **separate types** (`h1` through `h6`) rather than a single type with a `level` attribute
3. Bold/italic use **application-oriented names** (`bold`, `italic`) not mdast names (`strong`, `emphasis`)

## Sources
- [Plate Markdown Docs](https://platejs.org/docs/markdown)
- [Plate Basic Blocks](https://platejs.org/docs/basic-blocks)
- [Plate Migration Guide](https://platejs.org/docs/migration)
- [Plate GitHub](https://github.com/udecode/plate)
