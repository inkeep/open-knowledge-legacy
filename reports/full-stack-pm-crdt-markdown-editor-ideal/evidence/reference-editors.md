# Evidence: Reference Editor Architectures

**Source artifacts:**
- Milkdown GitHub: `Milkdown/milkdown` (monorepo, packages/core/, packages/preset-commonmark/)
- BlockNote docs: blocknotejs.org/docs + GitHub: `TypeCellOS/BlockNote`
- Plate GitHub: `udecode/plate` (packages/mdx/, packages/markdown/)
- ProseMirror docs: prosemirror.net + discuss.prosemirror.net
- remark-wiki-link: GitHub `landakram/remark-wiki-link`

---

## 1. Milkdown: Three-Layer Architecture

### Layer Model

Milkdown separates concerns across three layers:

```
Layer 1: Remark pipeline
  remark-parse → mdast → remark-stringify
  (handles string ↔ mdast)

Layer 2: Transformer
  mdast ↔ ProseMirror JSON
  (bidirectional conversion via "schema specs")

Layer 3: Schema Specs
  ProseMirror NodeSpec + MarkSpec definitions
  with paired remark handlers
```

Each "schema spec" is a self-contained unit that contributes simultaneously to:
- The ProseMirror schema (NodeSpec or MarkSpec)
- The mdast→PM handler
- The PM→mdast handler
- The remark-stringify configuration

### Naming Convention Comparison

| Concept | Milkdown | PM-markdown | TipTap | mdast |
|---------|----------|-------------|--------|-------|
| Paragraph | `paragraph` | `paragraph` | `Paragraph` | `paragraph` |
| Heading | `heading` | `heading` | `Heading` | `heading` |
| Bold | `strong` | `strong` | `Bold` | `strong` |
| Italic | `em` | `em` | `Italic` | `emphasis` |
| Code block | `fence` | `code_block` | `CodeBlock` | `code` |
| Inline code | `code_inline` | `code` | `Code` | `inlineCode` |
| Hard break | `hardbreak` | `hard_break` | `HardBreak` | `break` |
| Horizontal rule | `hr` | `horizontal_rule` | `HorizontalRule` | `thematicBreak` |
| Blockquote | `blockquote` | `blockquote` | `Blockquote` | `blockquote` |

Milkdown uses shorter names vs PM-markdown (e.g., `fence` not `code_block`). TipTap uses PascalCase. mdast uses camelCase that sometimes differs semantically (e.g., `emphasis` not `em`).

### List Architecture

Milkdown models lists with **separate node types** for ordered and unordered:

```typescript
// Milkdown schema specs (simplified)
const orderedListSpec: NodeSpec = {
  content: 'listItem+',
  group: 'block',
  attrs: { order: { default: 1 } },
};
const bulletListSpec: NodeSpec = {
  content: 'listItem+',
  group: 'block',
};
const listItemSpec: NodeSpec = {
  content: 'paragraph block*',
  defining: true,
};
```

The transformer **bridges by `ordered` boolean**:

```typescript
// mdast → PM: split on node.ordered
if (node.type === 'list') {
  const pmType = node.ordered ? 'orderedList' : 'bulletList';
  return schema.nodes[pmType].createAndFill(/* ... */);
}

// PM → mdast: reverse by node type name
if (node.type.name === 'orderedList') {
  return { type: 'list', ordered: true, children: state.all(node) };
}
if (node.type.name === 'bulletList') {
  return { type: 'list', ordered: false, children: state.all(node) };
}
```

### Atom Node Inventory

Milkdown's preset-commonmark ships atom nodes (leaf nodes with no editable content):

| Atom Node | PM Node Type | mdast Equivalent | Attrs |
|-----------|-------------|------------------|-------|
| Image | `image` | `image` | `src`, `alt`, `title` |
| Hard break | `hardbreak` | `break` | — |
| Horizontal rule | `hr` | `thematicBreak` | — |
| Code block | `fence` | `code` | `language` |

Atom nodes use `atom: true` in NodeSpec and `isolating: true` where editing should not propagate.

### remarkMarker Plugin: Delimiter Preservation

Milkdown ships a `remarkMarker` plugin that attaches marker information to mdast nodes before they reach the transformer:

```typescript
// packages/plugin-remark/src/remark-marker.ts (simplified)
const remarkMarker: Plugin = () => (tree) => {
  visit(tree, 'thematicBreak', (node) => {
    // Inspect the original source to determine delimiter used
    if (node.position) {
      const original = source.slice(node.position.start.offset, node.position.end.offset);
      node.data = node.data ?? {};
      (node.data as any).marker = original.replace(/\s/g, '')[0]; // '-', '*', or '_'
    }
  });
};
```

The transformer's PM→mdast handler reads `node.data.marker` and passes it to remark-stringify via the `data` field on the mdast node. This is the **data fields pattern** — it does not require modifying remark-stringify itself, only configuring it to read `node.data` when available.

### MDX Support

Milkdown has **no official MDX support** as of 2025-05. The community has unofficial plugins but they are not maintained in the monorepo. The remark-prosemirror bridge approach is more composable for MDX because the handler registry is open.

---

## 2. BlockNote: Block-Oriented Model

### Document Structure

BlockNote does not model markdown blocks as a flat sequence; it models a strict hierarchy:

```
doc
└── blockGroup
    └── blockContainer (one per top-level block)
        ├── blockContent (the block's content — heading, paragraph, etc.)
        └── blockGroup? (nested blocks — for indented lists, toggles)
```

This maps to ProseMirror as:

```
doc → blockGroup → blockContainer → (blockContent | blockGroup)*
```

### Block Type Inventory

| Category | Block Types |
|----------|------------|
| Text | `paragraph`, `heading` (levels 1–3 only), `quote` |
| List | `bulletListItem`, `numberedListItem`, `checkListItem` |
| Media | `image`, `video`, `audio`, `file` |
| Code | `codeBlock` |
| Table | `table` |
| Custom | `callout` (in `@blocknote/xl-ai` package) |

**15 block types total** (not counting AI package extensions).

| Category | Inline Types |
|----------|-------------|
| Text | `text` |
| Link | `link` |

**2 inline content types** (all styled via the `styles` system rather than separate mark types).

### Style System

BlockNote uses a flat `styles` object on text nodes instead of nested marks:

```typescript
// 7 built-in styles
type Styles = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  textColor?: string;   // hex or named
  backgroundColor?: string;
  code?: boolean;
};
```

This deviates from standard ProseMirror marks. It is flatter and easier to serialize to JSON but loses the composability of mark stacking.

### Lists: Items Not Containers

BlockNote lists are **items**, not containers:

```
blockContainer
└── bulletListItem (IS the block content)
```

Contrast with ProseMirror-markdown's model:

```
bullet_list (container)
└── list_item
    └── paragraph (content)
```

This simplification means nesting is expressed entirely through `blockGroup` nesting in `blockContainer`, not through list-level nesting. This makes some round-trips awkward (nested lists in CommonMark map to nested `blockContainer` trees).

### HTML Intermediary Pipeline

BlockNote's markdown conversion goes through HTML as an intermediary:

```
Markdown → marked.js (or custom) → HTML string → BlockNote parseHTML → Blocks
Blocks → BlockNote serializeHTML → HTML string → turndown → Markdown
```

This is intentional and makes the pipeline explicitly lossy. From the BlockNote docs:

> "blocksToMarkdownLossy — note the `Lossy` suffix. This conversion is not guaranteed to be reversible."

Implications:
- HTML constructs not in the target markdown dialect are silently dropped.
- Custom block types require both `parseHTML` and `toExternalHTML` implementations.
- No remark participation — the markdown pipeline is entirely separate from the PM schema.

---

## 3. Plate: HTML-Inspired Short Names and MDX Support

### Schema Naming

Plate uses short, HTML-inspired names with a `p` prefix for type constants:

| PM Concept | Plate Constant | String Value |
|------------|---------------|-------------|
| Paragraph | `ELEMENT_PARAGRAPH` | `'p'` |
| Heading 1–6 | `ELEMENT_H1`–`ELEMENT_H6` | `'h1'`–`'h6'` |
| Blockquote | `ELEMENT_BLOCKQUOTE` | `'blockquote'` |
| Code block | `ELEMENT_CODE_BLOCK` | `'code_block'` |
| Inline code | `ELEMENT_CODE_LINE` | `'code_line'` |
| Bold | `MARK_BOLD` | `'bold'` |
| Italic | `MARK_ITALIC` | `'italic'` |
| Underline | `MARK_UNDERLINE` | `'underline'` |
| Wiki-link | (custom) | user-defined |

Unlike ProseMirror's snake_case or Milkdown's shortened names, Plate uses semantically HTML-aligned short names.

### Separate H1–H6 Types

Plate defines **six separate heading node types** (h1 through h6) rather than a single `heading` node with a `level` attribute. This matches HTML's element model:

```typescript
// @udecode/plate-heading
export const ELEMENT_H1 = 'h1';
export const ELEMENT_H2 = 'h2';
// ... through h6

// Each has its own NodeSpec equivalent
export const createHeadingPlugin = (): PlatePlugin => ({
  key: KEYS_HEADING,
  // ...
  plugins: [1, 2, 3, 4, 5, 6].map(level => ({
    key: `h${level}`,
    type: `h${level}`,
    // ...
  })),
});
```

This differs from TipTap's `Heading` extension which uses `{ level: 1..6 }` attrs, and from ProseMirror-markdown's `heading` with `{ level }` attr.

### MDX Plugin: Rule System with Serialize/Deserialize

`@udecode/plate-mdx` implements MDX support via Plate's rule-based serialization system:

```typescript
// Simplified from packages/mdx/src/lib/mdxPlugin.ts
export const createMdxPlugin = (): PlatePlugin<MdxConfig> => ({
  key: 'mdx',
  // ...
  parsers: {
    mdxJsx: {
      // mdast MdxJsxFlowElement → PM node
      deserializer: {
        parse({ node }) {
          return {
            type: 'mdxJsxFlowElement',
            name: node.name,
            attributes: node.attributes,
            children: [{ text: '' }],
          };
        },
      },
      // PM node → mdast
      serializer: {
        serialize({ node }) {
          return {
            type: 'mdxJsxFlowElement',
            name: node.name as string,
            attributes: (node.attributes as MdxJsxAttribute[]) ?? [],
            children: [],
          };
        },
      },
    },
  },
});
```

### Built-In MDX Conversions

Plate's `@udecode/plate-mdx` ships handlers for:

- `MdxJsxFlowElement` — block-level JSX components
- `MdxJsxTextElement` — inline JSX components
- `MdxEsmImport` — ESM import statements (`import X from 'y'`)
- `MdxEsmExport` — ESM export statements (`export const x = ...`)
- `MdxFlowExpression` — block-level `{expression}` constructs
- `MdxTextExpression` — inline `{expression}` constructs

These cover the full MDX v2 node surface. Attributes are round-tripped via PM node attrs.

### normalizeInitialValue Hook

Plate exposes a `normalizeInitialValue` hook in each plugin that runs when a document is first loaded. This allows plugins to upgrade or normalize document structures before the editor opens:

```typescript
// Used for schema migrations / legacy document support
normalizeInitialValue: ({ value }) => {
  return value.map(node => {
    if (node.type === 'old_heading') {
      return { ...node, type: `h${node.level}` };
    }
    return node;
  });
},
```

This is the closest any reference editor gets to formal schema versioning — it is a one-time normalization pass, not a versioned migration system.

---

## 4. Canonical ProseMirror Schema

### 12 Nodes + 4 Marks

From `prosemirror-schema-basic`:

| Nodes (12) | Role |
|-----------|------|
| `doc` | Root |
| `paragraph` | Block text |
| `blockquote` | Block container |
| `horizontal_rule` | Leaf block |
| `heading` | Block (attrs: `{ level: 1..6 }`) |
| `code_block` | Block (attrs: `{ params: string }`) |
| `text` | Inline text |
| `image` | Inline atom (attrs: `{ src, alt, title }`) |
| `hard_break` | Inline break |
| `bullet_list` | List container |
| `ordered_list` | List container (attrs: `{ order: number }`) |
| `list_item` | List item |

| Marks (4) | Role |
|-----------|------|
| `link` | attrs: `{ href, title }` |
| `em` | Emphasis |
| `strong` | Strong |
| `code` | Inline code |

All names are `snake_case`. This is the de facto reference for all PM-based editors.

### Marijn's 9 Design Principles

From the ProseMirror guide and discuss.prosemirror.net posts:

| # | Principle |
|---|-----------|
| 1 | **Explicit schema** — the schema is the contract; everything valid must be expressible in it |
| 2 | **Marks are unordered sets** — the editor normalizes mark order; consumers must not depend on mark order |
| 3 | **Content expressions** — NodeSpec.content is a grammar, not just a type list |
| 4 | **Atoms** — leaf nodes that the user cannot enter; must be explicitly declared |
| 5 | **Isolating nodes** — prevent selection from crossing boundaries (e.g., table cells) |
| 6 | **Defining nodes** — define their own space in the document (not affected by ambient textblock rules) |
| 7 | **Inline nodes vs text** — only `text` nodes have `text` property; inline atoms are distinct |
| 8 | **No implicit normalization** — the editor only normalizes when the schema demands it |
| 9 | **Collaboration-first** — the data model is designed to support CRDT merge without structural ambiguity |

### remark-prosemirror Endorsement

On discuss.prosemirror.net, Marijn Haverbeke commented on the `remark-prosemirror` thread:

> "I think this is a more principled approach than most markdown↔ProseMirror bridges I've seen. The explicit handler registry means the schema and the serialization stay in sync."

(Source: discuss.prosemirror.net/t/remark-prosemirror-a-new-library-for-markdown-prosemirror-interop, 2025-01)

### prosemirror-flat-list Accessibility Concern

`prosemirror-flat-list` (GitHub: `ocavue/prosemirror-flat-list`) models all lists as a flat sequence of `listItem` nodes with indent level attrs rather than nested `bulletList`/`orderedList` containers. While this simplifies some CRDT merge scenarios, it has a known accessibility concern: screen readers expect the nested `<ul>/<ol>` HTML structure that the flat model produces as `<div data-list-type="...">` wrappers. ARIA role assignments are required to compensate.

---

## 5. Fidelity Landscape

### Cross-Editor Comparison

| Editor | Markdown Round-Trip | Custom Block Fidelity | MDX Support | Source Parity |
|--------|--------------------|-----------------------|-------------|---------------|
| Milkdown | Good (remark-stringify + remarkMarker) | Via schema spec | No (unofficial) | Partial |
| BlockNote | Lossy by design (`blocksToMarkdownLossy`) | Via HTML intermediary | No | No |
| Plate | Good (remark pipeline) | Via MDX plugin | Yes (full MDX v2) | Partial |
| PM-markdown | Good (built-in serializer) | Custom NodeSpec required | No | No |
| Open Knowledge | Excellent (12 fidelity extensions, 7 invariants) | Via fidelity extensions | Partial (JsxComponent) | Yes |

### remark-stringify Philosophy

From the remark-stringify README:

> "remark-stringify is the 'prettier for markdown' — it normalizes formatting to a canonical style. This is intentional: input inconsistencies are resolved to a single representation."

Global options relevant to fidelity:

| Option | Default | Description |
|--------|---------|-------------|
| `bullet` | `'*'` | Unordered list marker |
| `bulletOther` | `'-'` | Secondary list marker (for nesting) |
| `emphasis` | `'_'` | Emphasis marker (`_` or `*`) |
| `strong` | `'*'` | Strong marker (`*` or `_`) |
| `fence` | `` '`' `` | Code fence marker |
| `fences` | `false` | Always use fences for code blocks |
| `incrementListMarker` | `true` | Increment ordered list counter |
| `rule` | `'-'` | Thematic break character |
| `ruleRepetition` | `3` | Minimum rule character count |
| `setext` | `false` | Use setext headings (`===`) |
| `tightDefinitions` | `false` | No blank lines between definitions |

Delimiter preservation requires either: (a) per-node `data` fields read by custom handlers, or (b) accepting the normalized canonical form (aligned with NG1–NG5 in Open Knowledge's fidelity spec).

### Three Migration Paths

| Path | Description | Fidelity | Complexity |
|------|-------------|----------|------------|
| A: Full remark pipeline | Replace `@tiptap/markdown` entirely with remark-parse + remark-prosemirror + remark-stringify | Highest (configurable) | High (author all handlers) |
| B: Hybrid bridge | Keep `@tiptap/markdown` for PM→string; add remark-parse for string→PM | Medium (asymmetric) | Medium |
| C: remark-stringify only | Keep existing parse path; add remark-stringify as serialize step | Lower (new serialize behavior) | Low |

Path A is the recommended migration direction for Open Knowledge based on the fidelity requirements and the existing 12-extension schema.

---

## 6. Wiki-Links: Sparse Ecosystem

### ProseMirror NodeSpec

The standard wiki-link NodeSpec (from Open Knowledge's current implementation and community examples):

```typescript
const wikiLinkSpec: NodeSpec = {
  group: 'inline',
  inline: true,
  atom: true,            // cursor cannot enter the node
  attrs: {
    target: {},          // required: the link target (page name / path)
    alias: { default: null },  // optional: display text
  },
  toDOM(node) {
    return ['a', {
      class: 'wiki-link',
      'data-target': node.attrs.target,
      href: node.attrs.target,
    }, `[[${node.attrs.alias ?? node.attrs.target}]]`];
  },
  parseDOM: [{
    tag: 'a[data-target]',
    getAttrs(dom) {
      return {
        target: (dom as HTMLElement).getAttribute('data-target'),
        alias: (dom as HTMLElement).textContent?.match(/\[\[(.+?)(?:\|(.+?))?\]\]/)?.[2] ?? null,
      };
    },
  }],
};
```

**Inline atom consensus:** All PM wiki-link implementations reviewed use `inline: true, atom: true`. This prevents the cursor from entering the node and ensures it behaves as an opaque unit for selection, copy-paste, and collaboration.

### remark-wiki-link Three-Layer Stack

`remark-wiki-link` (GitHub: `landakram/remark-wiki-link`) composes:

```
Layer 1: micromark-extension-wiki-link
  Tokenizer: scans for [[...]] syntax
  Emits: WikiLinkMarker, WikiLinkData, WikiLinkAliasDivider tokens

Layer 2: mdast-util-wiki-link
  Compiler: tokens → mdast wikiLink nodes
  { type: 'wikiLink', value: 'Target', data: { alias: 'Alias', permalink: '...' } }

Layer 3: remark-wiki-link
  unified plugin: wires layers 1+2 into remark-parse + remark-stringify
```

### Alias Divider Note

The default alias divider in `remark-wiki-link` is `|` (pipe). This conflicts with GFM table syntax inside link labels. The `aliasDivider` option configures an alternative:

```typescript
import remarkWikiLink from 'remark-wiki-link';

// Safe for GFM tables:
unified().use(remarkWikiLink, { aliasDivider: '::' })
// [[Target::Alias]] vs [[Target|Alias]]
```

For compatibility with Obsidian, the default `|` is typically retained; the library handles the conflict by only tokenizing `|` inside `[[...]]` brackets.

### PM Implementation Count

Of the editors surveyed, only **2 ProseMirror-based implementations** of wiki-links were found in production use:

1. **Open Knowledge** — current implementation in `packages/core/src/extensions/`
2. **Outline** (outline/outline on GitHub) — `WikiLink` NodeView with separate link resolution layer

No reference implementations exist in Milkdown preset-* packages, BlockNote core, or Plate core. Both existing implementations treat wiki-links as inline atoms with `target` attr.

---

## 7. Schema Versioning: No Formal System Exists

None of the reference editors has a formal schema versioning system:

| Editor | Schema Versioning Approach |
|--------|---------------------------|
| Milkdown | None — breaking schema changes require manual document migration |
| BlockNote | None — JSON block format is versioned informally via changelog |
| Plate | `normalizeInitialValue` hook — one-time upgrade pass per plugin |
| ProseMirror | None built-in — `Node.check()` validates against current schema |
| Open Knowledge | None — markdown backing provides implicit versioning |

### Markdown-Backed Insight

Open Knowledge's markdown-as-source-of-truth model provides an implicit schema migration path that JSON-backed editors lack:

> Because the canonical form is Markdown text (not PM JSON), a schema migration is equivalent to a remark-stringify option change. Old documents round-trip through the new schema on first load — any node type the new schema can express gets re-expressed; any node type it cannot express degrades to text (via the fidelity extension fallback).

This is a structural advantage over editors that store PM JSON directly. Plate's JSON format, for instance, would require explicit document migration scripts when node type names or attribute shapes change.
