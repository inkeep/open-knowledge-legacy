# D6: Reference Editor Architectures

**Research question:** How do reference editors (Milkdown, BlockNote, Plate) structure their schemas and architectures? What patterns are canonical for ProseMirror markdown editors?

**Context:** This dimension informs the parent report's goal of determining the architecturally-ideal full-stack configuration for a greenfield ProseMirror-based CRDT markdown editor with MDX support.

---

## Executive Summary

Three reference editors (Milkdown, BlockNote, Plate) and the canonical ProseMirror ecosystem were analyzed at source-code depth across 10 dimensions. Key findings:

1. **Milkdown is the closest architectural reference** — ProseMirror + remark + Y.js with co-located parseMarkdown/toMarkdown handlers per node, mdast-canonical naming, and a custom remark plugin for delimiter preservation.
2. **No JavaScript WYSIWYG editor preserves source-text fidelity** except Open Knowledge's existing approach. This is a genuine differentiator.
3. **The remark-prosemirror library** (by Handle With Care collective) is the community-endorsed bridge between unified/remark and ProseMirror, with Marijn's explicit approval.
4. **Plate has the strongest MDX story** — remark-mdx integration with bidirectional custom rules for arbitrary components. This is the model to follow.
5. **Wiki-links should be inline atom nodes** (not marks) — strong ProseMirror community consensus.
6. **Schema naming convention:** snake_case for multi-word ProseMirror node names (`code_block`, `list_item`) is universal across the ecosystem.

---

## 1. Milkdown Schema Architecture

### Naming Convention

Milkdown uses a **hybrid convention**: mdast-canonical names for marks (`strong`, `emphasis`, `inlineCode`) and ProseMirror snake_case for multi-word nodes (`bullet_list`, `code_block`, `list_item`). Single-word names align across all systems (`heading`, `paragraph`, `blockquote`).

| Concept | Milkdown | prosemirror-markdown | TipTap | mdast |
|---|---|---|---|---|
| Bold | `strong` | `strong` | `bold` | `strong` |
| Italic | `emphasis` | `em` | `italic` | `emphasis` |
| Inline code | `inlineCode` | `code` | `code` | `inlineCode` |
| Code block | `code_block` | `code_block` | `codeBlock` | `code` |
| Bullet list | `bullet_list` | `bullet_list` | `bulletList` | `list`(!ordered) |
| Ordered list | `ordered_list` | `ordered_list` | `orderedList` | `list`(ordered) |
| List item | `list_item` | `list_item` | `listItem` | `listItem` |
| HR | `hr` | `horizontal_rule` | `horizontalRule` | `thematicBreak` |

### Three-Layer Architecture

```
Layer 1: Remark Pipeline      unified().use(remarkParse).use(remarkStringify)
Layer 2: Transformer           ParserState / SerializerState (mdast <-> ProseMirror)
Layer 3: Schema Specs          Co-located parseMarkdown + toMarkdown on each node/mark
```

Each node file contains parseDOM, toDOM, parseMarkdown, and toMarkdown together — a **co-located pattern** where the entire lifecycle of a node type lives in one file.

### List Architecture

Lists are **separate node types** (`bullet_list`, `ordered_list`), following prosemirror-schema-list. The bridge to mdast splits the unified `list` type by `ordered` boolean:
- `bullet_list.match: ({ type, ordered }) => type === 'list' && !ordered`
- `ordered_list.match: ({ type, ordered }) => type === 'list' && !!ordered`

Task list items extend `list_item` via `extendSchema()` — adding a `checked` attribute without a new node type.

### Atom Nodes

| Node | Inline? | Atom? | Notes |
|---|---|---|---|
| `hr` | No | Block atom | No content spec |
| `image` | Yes | Yes | `draggable: true`, `selectable: true`, `marks: ''` |
| `html` | Yes | Yes | Stores raw HTML in `value` attr |
| `footnote_reference` | Yes | Yes | Stores `label` attr |
| `hardbreak` | Yes | No | `selectable: false`, not strictly atom |

### MDX Support

**Not officially supported.** Milkdown maintainer (Saul-Mirone) stated MDX is "a major direction of the project" but remains a work-in-progress. Community attempts to integrate `remark-mdx` hit obstacles with the `filterHTMLPlugin` and ProseMirror node type mapping.

### Fidelity

Milkdown has a custom internal remark plugin (`remarkMarker`) that adds `marker` properties to `strong` and `emphasis` mdast nodes — enabling delimiter preservation (`*` vs `_`). This is not a published plugin and is unique to Milkdown. Beyond markers, remark-stringify's global options control serialization style.

**Evidence:** [evidence/milkdown-schema-analysis.md](evidence/milkdown-schema-analysis.md)

---

## 2. BlockNote Schema Architecture

### Block-Oriented Model

BlockNote wraps ProseMirror with a higher-level block abstraction:

```
doc → BlockGroup → BlockContainer → BlockContent + BlockGroup?
                                     (actual type)   (children)
```

Every block carries `id`, `type`, `props`, `content`, `children`. This enables Notion-style arbitrary nesting — any block can have children of any type.

### Default Schema

**15 block types:** `paragraph`, `heading`, `bulletListItem`, `numberedListItem`, `checkListItem`, `toggleListItem`, `quote`, `codeBlock`, `table`, `image`, `video`, `audio`, `file`, `divider`, `pageBreak`

**2 inline content types:** `text`, `link`

**7 styles (marks):** `bold`, `italic`, `underline`, `strike`, `code`, `textColor`, `backgroundColor`

### Key Design Differences

1. **Lists are items, not containers.** `bulletListItem` IS a block type, not `bullet_list` containing `list_item`. Nesting uses the `children` array.
2. **Marks are "styles"** — formatting is a property of `StyledText`, not a ProseMirror Mark.
3. **Block-level properties on every block** — `backgroundColor`, `textColor`, `textAlignment`.
4. **`quote` not `blockquote`** — shorter names.

### Markdown Pipeline: HTML Intermediary

BlockNote routes ALL markdown through HTML:

```
Import: Markdown → remark-parse → remark-gfm → remark-rehype → rehype-stringify → HTML → ProseMirror parse → Blocks
Export: Blocks → External HTML → rehype-parse → rehype-remark → remark-gfm → remark-stringify → Markdown
```

Three custom `remark-rehype` handlers (code, image, blockquote) and three custom rehype plugins for export (video, underlines, checkboxes). The full unified/remark stack is used, but indirectly.

### Explicitly Lossy

API named `blocksToMarkdownLossy()`. Non-list children are un-nested, styling dropped, complex features lack markdown equivalents. JSON recommended for lossless storage.

**No MDX support.** Custom blocks have `toExternalHTML()` but no `toMarkdown()` hook.

**Evidence:** [evidence/blocknote-schema-analysis.md](evidence/blocknote-schema-analysis.md)

---

## 3. Plate Schema Architecture

### Naming Convention: HTML-Inspired Short Names

| Element | Type String | mdast Equivalent |
|---|---|---|
| Paragraph | `p` | `paragraph` |
| Heading 1-6 | `h1`-`h6` | `heading` (depth) |
| Blockquote | `blockquote` | `blockquote` |
| Code block | `code_block` | `code` |
| Link | `a` | `link` |
| HR | `hr` | `thematicBreak` |
| Bold (mark) | `bold` | `strong` |
| Italic (mark) | `italic` | `emphasis` |

Key: headings are **separate types** (`h1` through `h6`) rather than a single type with a `level` attribute. Plate maintains explicit `PLATE_TO_MDAST` / `MDAST_TO_PLATE` lookup tables for bidirectional mapping.

### MDX Support: The Strongest Model

Plate has the most mature MDX story of any reference editor:

```typescript
MarkdownPlugin.configure({
  options: {
    remarkPlugins: [remarkMath, remarkGfm, remarkMdx, remarkMention],
  },
})
```

**Rule-based system:** Each custom element has explicit `serialize` and `deserialize` rules:

```typescript
rules: {
  date: {
    deserialize: (mdastNode) => ({ type: 'date', date: mdastNode.children?.[0]?.value }),
    serialize: (slateNode) => ({ type: 'mdxJsxTextElement', name: 'date', children: [...] })
  }
}
```

**Built-in MDX conversions:**
- Marks: `<del>`, `<sub>`, `<sup>`, `<u>`, `<mark>`, `<span style="...">` for font styling
- Elements: `<date>`, `<callout>`, `<column_group>`, `<toc>`, `<audio>`, `<video>`, `<file>`
- Mentions: `[display](mention:id)` (custom link-encoded syntax)

### Schema Versioning

No formal versioning. Package version = schema version. `normalizeInitialValue` hook for runtime migration. Plugin key strings (`'p'`, `'h1'`, `'bold'`) have been stable across major releases despite API surface changes.

**Evidence:** [evidence/plate-schema-analysis.md](evidence/plate-schema-analysis.md)

---

## 4. Canonical ProseMirror Patterns

### The Official prosemirror-markdown Schema

12 node types, 4 marks. All multi-word names use **snake_case**: `code_block`, `list_item`, `ordered_list`, `horizontal_rule`, `bullet_list`, `hard_break`. This is the de facto standard.

Key schema properties:
- `heading`: content `(text | image)*` (not `inline*`), `defining: true`
- `code_block`: `code: true`, `marks: ''` (no marks allowed), `whitespace: "pre"`
- Lists: `bullet_list` and `ordered_list` are separate, both contain `list_item+`, both have `tight` attr
- `image`: `inline: true`, `draggable: true`

### Marijn's Key Schema Design Principles

| Topic | Recommendation |
|---|---|
| Custom syntax | MUST be represented as distinct document nodes for proper serialization |
| Inline atoms with content | Require custom NodeView; "not something that works out of the box" |
| Atom on contentless nodes | Redundant — contentless nodes are implicitly atomic |
| Frontmatter | Extract before editing, re-attach after. Don't model as document nodes |
| Marks vs nodes | Marks for annotation (bold, italic). Nodes for self-contained units |
| Comments/annotations | Use decorations, not marks or nodes |
| Round-trip fidelity | Not a goal of prosemirror-markdown. Use CodeMirror for source preservation |
| Schema extension | Use `OrderedMap` methods before editor instantiation |
| Schema migration | "Write your own upgrade function" — no built-in support |

### remark-prosemirror: The Modern Bridge

Created by Handle With Care collective (moment.dev). Replaces prosemirror-markdown's markdown-it dependency with unified/remark. **Marijn explicitly approved**: "glad this exists now."

Architecture: explicit handler functions map between mdast types and ProseMirror types. The entire remark plugin ecosystem becomes available for parsing.

### prosemirror-flat-list Alternative

Single `list` node type with CSS-based indentation. Aims for Google Docs / Notion UX. Marijn flagged accessibility concerns with Tab/Shift-Tab override.

**Evidence:** [evidence/prosemirror-canonical-patterns.md](evidence/prosemirror-canonical-patterns.md)

---

## 5. Source-Text Fidelity

### No JS WYSIWYG Editor Preserves Source Form

| Editor | Fidelity Approach |
|---|---|
| Milkdown | Global remark-stringify options; internal `remarkMarker` for delimiter tracking |
| BlockNote | Explicitly lossy (`blocksToMarkdownLossy`) |
| Plate | Global remark-stringify pass-through |
| prosemirror-markdown | Normalized output by design |
| **Open Knowledge** | **12 fidelity extensions, 7 invariants** |

### remark-stringify Design Philosophy

From remark issue #303: "remark formats markdown: think of it as prettier." The remark ecosystem **will not** add per-node source form preservation — this is a deliberate design choice, not a missing feature.

### What remark-stringify CAN Do

Global options: `emphasis`, `strong`, `bullet`, `fence`, `setext`, `rule`, `listItemIndent`, `closeAtx`, `incrementListMarker`, `ruleRepetition`, `ruleSpaces`, `tightDefinitions`. These set a single style for ALL instances of each construct.

### Implication for Migration

If migrating to remark-based parsing/serialization, source-text fidelity requires:
1. Custom remark plugins that populate `data` fields during parse (like Milkdown's `remarkMarker`)
2. Custom serialization handlers that read ProseMirror node attributes and use them to override remark-stringify's global defaults
3. Or: the existing approach of custom serialize functions that read `mark.attrs` / `node.attrs`

**Evidence:** [evidence/fidelity-and-wikilinks.md](evidence/fidelity-and-wikilinks.md)

---

## 6. Wiki-Links

### ProseMirror: Inline Atom Node (Strong Consensus)

```typescript
wikiLink: {
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  attrs: {
    target: { default: '' },
    alias: { default: null },
    anchor: { default: null },
  },
}
```

**Why not marks:** Marks are for text annotation. Wiki-links are self-contained units that shouldn't be partially selected or split. Atom nodes get whole-node selection, NodeView for custom rendering, and no cursor edge issues within content.

### remark-wiki-link Stack

Three layers: `micromark-extension-wiki-link` (tokenizer) → `mdast-util-wiki-link` (AST: `wikiLink` node type) → `remark-wiki-link` (plugin). Default alias divider is `:` — set `aliasDivider: '|'` for Obsidian compatibility.

### Only ProseMirror Wiki-Link Implementations

- **Noteworthy** (benrbray/noteworthy) — ProseMirror + remark, bidirectional links. In development.
- **tiptap-wikilink-extension** — TipTap extension with autocomplete. Not on npm.

**Evidence:** [evidence/fidelity-and-wikilinks.md](evidence/fidelity-and-wikilinks.md)

---

## 7. Commands and Shortcuts

Keyboard shortcuts are largely standardized across editors:

| Action | Standard Shortcut |
|---|---|
| Bold | `Mod-b` |
| Italic | `Mod-i` |
| Inline code | `Mod-e` |
| Heading N | `Mod-Alt-N` |
| Bullet list | `Mod-Alt-8` (Milkdown) / `Mod-Shift-8` (TipTap) |
| Ordered list | `Mod-Alt-7` (Milkdown) / `Mod-Shift-7` (TipTap) |

Milkdown uses `$command()` utilities with `callCommand()` invocation. BlockNote uses a block-level API (`insertBlocks`, `updateBlock`). Plate uses `editor.tf.*` transforms.

**Evidence:** [evidence/commands-shortcuts-versioning.md](evidence/commands-shortcuts-versioning.md)

---

## 8. Schema Versioning

**No editor has formal schema versioning.** All rely on manual migration:

| Editor | Approach |
|---|---|
| ProseMirror | "Write your own upgrade function" (Marijn) |
| Milkdown | `extendSchema()` for non-breaking additions |
| BlockNote | JSON document, standard transformation |
| Plate | `normalizeInitialValue` hook + semver |

For markdown-backed storage, schema changes are transparent if the markdown remains valid — the markdown IS the migration format.

---

## Synthesis: Implications for Open Knowledge

### Architecture Choices Validated

1. **ProseMirror + remark pipeline** — Milkdown proves this combination works. remark-prosemirror (Marijn-approved) is the modern bridge.
2. **Separate list types** — Universal pattern. `bullet_list` / `ordered_list` with shared `list_item`.
3. **Fidelity extensions** — Open Knowledge's approach is unique and differentiated. No other editor attempts this.
4. **Wiki-links as inline atom nodes** — Consensus pattern. Open Knowledge's existing implementation aligns.
5. **Frontmatter outside document** — Marijn's explicit recommendation. Open Knowledge already does this.

### Patterns to Adopt

1. **Co-located parseMarkdown/toMarkdown** (from Milkdown) — Each node's lifecycle in one file.
2. **MDX rule system** (from Plate) — Explicit bidirectional `serialize`/`deserialize` rules per MDX component type, not generic pass-through.
3. **remark-prosemirror handler model** — handler functions per mdast type, composable with the full remark plugin ecosystem.
4. **Custom remark plugins for fidelity** — Like Milkdown's `remarkMarker`, build remark plugins that populate `data` fields during parse to preserve source form.

### Naming Convention Decision

The evidence supports **snake_case for multi-word ProseMirror node names** (`code_block`, `list_item`, `bullet_list`) following the universal ProseMirror convention. For mark names, Milkdown's approach of matching mdast names (`strong`, `emphasis`) is the most natural for a remark-based pipeline. This diverges from TipTap's defaults (`bold`, `italic`, `codeBlock`) — a deliberate choice for remark alignment.

### What to Avoid

1. **BlockNote's HTML intermediary** — Adds unnecessary information loss. Direct mdast ↔ ProseMirror is better.
2. **Plate's separate heading types** (`h1`-`h6`) — A single `heading` with `level` attr is simpler and matches mdast.
3. **Generic pass-through MDX** — Every MDX component should have an explicit handler. Unrecognized components should be treated as errors, not silently dropped or passed as text.

---

## Evidence Files

- [evidence/milkdown-schema-analysis.md](evidence/milkdown-schema-analysis.md) — Complete Milkdown node/mark types, naming comparison, architecture
- [evidence/blocknote-schema-analysis.md](evidence/blocknote-schema-analysis.md) — BlockNote block model, markdown pipeline, limitations
- [evidence/plate-schema-analysis.md](evidence/plate-schema-analysis.md) — Plate type system, MDX rules, migration patterns
- [evidence/prosemirror-canonical-patterns.md](evidence/prosemirror-canonical-patterns.md) — Official schema, Marijn's recommendations, remark-prosemirror
- [evidence/fidelity-and-wikilinks.md](evidence/fidelity-and-wikilinks.md) — Fidelity comparison, remark-stringify options, wiki-link architecture
- [evidence/commands-shortcuts-versioning.md](evidence/commands-shortcuts-versioning.md) — Command systems, keyboard shortcuts, schema migration
