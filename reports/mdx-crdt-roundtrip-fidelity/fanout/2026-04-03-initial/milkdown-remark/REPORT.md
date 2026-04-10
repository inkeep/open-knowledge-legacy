---
title: "Milkdown Source-Level Architecture Analysis: Remark Integration and Yjs Collaboration"
date: 2026-04-03
type: technical-research
status: complete
repo: https://github.com/Milkdown/milkdown
commit: HEAD (v7.20.0)
scope: |
  Source-code-depth investigation of how Milkdown uses remark for parsing/serialization,
  how it integrates with Yjs for collaboration, round-trip fidelity characteristics,
  and feasibility of adding remark-mdx to the pipeline.
---

# Milkdown Source-Level Architecture Analysis

## 1. Architecture Overview

Milkdown is a plugin-driven ProseMirror editor framework where **markdown IS the data model** -- every node and mark type defines both a `parseMarkdown` spec (MDAST -> ProseMirror) and a `toMarkdown` spec (ProseMirror -> MDAST). The remark ecosystem is used as the bridge layer.

### Core Package Map

| Package | Role |
|---------|------|
| `@milkdown/transformer` | Parser/Serializer state machines + stack utilities |
| `@milkdown/core` | Editor lifecycle, remark pipeline init, plugin orchestration |
| `@milkdown/utils` | Composable helpers: `$nodeSchema`, `$markSchema`, `$remark`, `$node` |
| `@milkdown/preset-commonmark` | Commonmark nodes/marks with parser/serializer specs |
| `@milkdown/preset-gfm` | GFM extension (tables, strikethrough, etc.) via `remark-gfm` |
| `@milkdown/plugin-collab` | Yjs/y-prosemirror integration |
| `@milkdown/prose` | Re-exports of ProseMirror packages |

### Initialization Sequence

The editor boots through a timer-based dependency chain:

```
ConfigReady -> InitReady -> SchemaReady -> ParserReady + SerializerReady
    -> CommandsReady + KeymapReady -> EditorStateReady -> EditorViewReady
```

Source: `packages/core/src/editor/editor.ts` lines 83-94 -- internal plugins loaded in order:
`schema, parser, serializer, commands, keymap, pasteRule, editorState, editorView, init(this), configPlugin`

---

## 2. How Milkdown Uses Remark

### The Remark Pipeline

Milkdown creates a unified processor with `remark-parse` and `remark-stringify`:

```typescript
// packages/core/src/internal-plugin/init.ts, line 44
ctx.inject(remarkCtx, unified().use(remarkParse).use(remarkStringify))
```

After ConfigReady, it re-creates the processor with stringify options including custom handlers:

```typescript
// packages/core/src/internal-plugin/init.ts, lines 51-54
const options = ctx.get(remarkStringifyOptionsCtx)
ctx.set(remarkCtx, unified().use(remarkParse).use(remarkStringify, options))
```

Then during SchemaReady, all remark plugins registered by presets are applied:

```typescript
// packages/core/src/internal-plugin/schema.ts, lines 56-61
const processor = remarkPlugins.reduce(
  (acc, plug) => acc.use(plug.plugin, plug.options),
  remark
)
ctx.set(remarkCtx, processor)
```

### Remark Plugins in the Pipeline

**From preset-commonmark** (source: `packages/plugins/preset-commonmark/src/composed/plugins.ts`):
- `remarkAddOrderInListPlugin` -- adds `.label` (numeric order) to list items in MDAST
- `remarkInlineLinkPlugin` -- wraps `remark-inline-links` (converts reference links to inline)
- `remarkLineBreak` -- converts `\n` within text nodes to `break` MDAST nodes with `isInline: true`
- `remarkHtmlTransformer` -- wraps standalone HTML nodes in paragraph containers (self-described as "should be deprecated after we support HTML")
- `remarkMarker` -- preserves the original emphasis/strong marker (`*` vs `_`) from source
- `remarkPreserveEmptyLinePlugin` -- strips `<br />` HTML nodes used to represent empty lines

**From preset-gfm** (source: `packages/plugins/preset-gfm/src/plugin/remark-gfm-plugin.ts`):
- `remark-gfm` -- standard GFM syntax extension (tables, strikethrough, task lists, etc.)

### Custom remark-stringify Handlers

Milkdown overrides three `remark-stringify` handlers (source: `packages/core/src/__internal__/remark-handlers.ts`):

1. **`text`**: Prevents `&#20;` entity encoding for trailing spaces; returns raw value for safe text, uses `state.safe()` with `encode: []` for others
2. **`strong`**: Respects per-node `marker` attribute (preserving original `*` vs `__`)
3. **`emphasis`**: Same marker preservation as strong

These handlers are critical for round-trip fidelity -- they ensure the serializer uses the same emphasis/strong markers that were in the source markdown.

---

## 3. The Parsing Pipeline (String -> ProseMirror Document)

### Exact Code Path

**Entry point**: `ParserState.create(schema, remark)` returns a `Parser` function.

Source: `packages/transformer/src/parser/state.ts`

```
1. parser(markdownText)
   |
2. ParserState.run(remark, markdown)           [line 208-216]
   |   a. remark.parse(markdown)               --> raw MDAST syntax tree
   |   b. remark.runSync(tree, markdown)        --> transformed MDAST (all remark plugins applied)
   |   c. state.next(tree)                      --> begin walking MDAST
   |
3. ParserState.next(nodes)                     [line 199-202]
   |   for each node: #runNode(node)
   |
4. ParserState.#runNode(node)                  [line 82-87]
   |   a. #matchTarget(node) --> scans ALL schema nodes+marks
   |      for one where spec.parseMarkdown.match(node) === true
   |   b. spec.parseMarkdown.runner(state, node, type)
   |      --> node-specific handler (e.g., paragraph opens node, processes children, closes node)
   |
5. ParserState.toDoc()                         [line 205]
   |   calls build() which closes all remaining stack elements
   |   returns the root ProseMirror Node
```

### The Stack Model

The parser uses a stack-based approach (`ParserStackElement` wraps `NodeType + content[]`):
- `openNode(type, attrs)` -- pushes new element onto stack
- `addText(text)` -- adds text node to top element, merging adjacent text nodes with same marks
- `closeNode()` -- pops element, creates ProseMirror node via `nodeType.createAndFill(attrs, content, marks)`
- Mark handling: `openMark(markType)` / `closeMark(markType)` toggle active marks; text added inherits current marks

### Concrete Example: Paragraph

```typescript
// packages/plugins/preset-commonmark/src/node/paragraph.ts
parseMarkdown: {
  match: (node) => node.type === 'paragraph',   // matches MDAST paragraph
  runner: (state, node, type) => {
    state.openNode(type)                          // push ParagraphNode onto stack
    if (node.children) state.next(node.children)  // recurse into children
    else state.addText((node.value || '') as string)
    state.closeNode()                             // pop and finalize
  },
}
```

---

## 4. The Serialization Pipeline (ProseMirror Document -> String)

### Exact Code Path

**Entry point**: `SerializerState.create(schema, remark)` returns a `Serializer` function.

Source: `packages/transformer/src/serializer/state.ts`

```
1. serializer(prosemirrorDoc)
   |
2. SerializerState.run(tree)                   [line 350-353]
   |   state.next(tree)                        --> walks ProseMirror node tree
   |
3. SerializerState.next(nodes)                 [line 334-343]
   |   if Fragment: iterate each child
   |   for each node: #runNode(node)
   |
4. SerializerState.#runNode(node)              [line 89-97]
   |   a. Sort marks by priority
   |   b. For each mark: #runProseMark(mark, node)
   |      --> finds matching mark schema via toMarkdown.match()
   |      --> calls toMarkdown.runner(state, mark, node)
   |      --> runner may return true to prevent running the node runner
   |   c. If not prevented: #runProseNode(node)
   |      --> finds matching node schema via toMarkdown.match()
   |      --> calls toMarkdown.runner(state, node)
   |   d. Closes all marks: #closeMark(mark) for each
   |
5. SerializerState.toString(remark)            [line 346-347]
   |   a. build() --> closes all stack elements, produces MDAST root
   |   b. remark.stringify(mdast)              --> remark-stringify with custom handlers
```

### Key Difference from Parser

The serializer builds an **MDAST tree** (not ProseMirror nodes). Stack elements are `SerializerStackElement` with `type: string` (MDAST node type), `children`, `value`, and `props`.

The final MDAST tree is stringified by `remark-stringify` -- Milkdown does NOT have a custom string serializer. It relies entirely on the remark ecosystem for markdown string generation.

### Mark Handling During Serialization

Marks are handled with a `#moveSpaces` mechanism that extracts leading/trailing spaces from mark content and moves them outside the mark node. This prevents issues like `** bold **` instead of ` **bold** `.

### Merge Logic

The serializer has `#maybeMergeChildren` (lines 129-159) that merges adjacent mark nodes of the same type. This is important for cases where ProseMirror splits what should be a single emphasis span into multiple mark ranges.

---

## 5. Custom Node Types / Extension API

### How to Add a Custom Block Type

Milkdown's extension API is through `$nodeSchema` / `$markSchema` (from `@milkdown/utils`). Each schema definition includes both `parseMarkdown` and `toMarkdown` specs.

**Pattern** (source: `packages/utils/src/composable/composed/$node-schema.ts`):

```typescript
const myBlockSchema = $nodeSchema('my_block', (ctx) => ({
  content: 'block+',
  group: 'block',
  attrs: { someAttr: { default: '' } },
  // MDAST -> ProseMirror
  parseMarkdown: {
    match: (node) => node.type === 'myCustomMdastType',
    runner: (state, node, type) => {
      state.openNode(type, { someAttr: node.someAttr })
      state.next(node.children)
      state.closeNode()
    },
  },
  // ProseMirror -> MDAST
  toMarkdown: {
    match: (node) => node.type.name === 'my_block',
    runner: (state, node) => {
      state.openNode('myCustomMdastType', undefined, { someAttr: node.attrs.someAttr })
      state.next(node.content)
      state.closeNode()
    },
  },
}))
```

### Adding a Remark Plugin

Use `$remark` utility (source: `packages/utils/src/composable/composed/$remark.ts`):

```typescript
const myRemarkPlugin = $remark('myPlugin', () => remarkSomePlugin)
// Then: editor.use([myRemarkPlugin])
```

This pushes the remark plugin into `remarkPluginsCtx`, which gets applied during the schema phase.

### The GFM Pattern as Template

The GFM preset demonstrates exactly how to extend Milkdown with a remark syntax plugin:
1. Wrap `remark-gfm` with `$remark()`
2. Define `$nodeSchema` for each new MDAST node type (table, strikethrough, etc.)
3. Each schema has `parseMarkdown.match` checking for the MDAST node type that `remark-gfm` produces
4. Each schema has `toMarkdown.runner` producing the MDAST node type that `remark-gfm` stringifies

---

## 6. Milkdown + Yjs Collaboration

### Architecture

Source: `packages/plugins/plugin-collab/src/collab-service.ts`

The collab plugin is a **thin wrapper** around `y-prosemirror`. It adds:

1. **`CollabService` class** -- manages lifecycle of y-prosemirror plugins
2. **Three y-prosemirror plugins**:
   - `ySyncPlugin(xmlFragment, opts)` -- core sync between Yjs XmlFragment and ProseMirror
   - `yUndoPlugin(opts)` -- Yjs-aware undo/redo
   - `yCursorPlugin(awareness, opts)` -- collaborative cursors
3. **Custom keymap plugin** -- rebinds `Mod-z`/`Mod-y`/`Mod-Shift-z` to Yjs undo/redo

### Yjs Document Binding

```typescript
// line 159-161
bindDoc(doc: Doc) {
  this.#xmlFragment = doc.getXmlFragment('prosemirror')
}
```

The fragment name is hardcoded to `'prosemirror'`.

### Template Application

The `applyTemplate` method (lines 190-216) handles initial document loading:

```typescript
applyTemplate(template, condition?) {
  // 1. Convert template (string/json/html) to ProseMirror node via parser
  // 2. Convert existing Yjs XmlFragment to ProseMirror node
  // 3. If condition met (default: empty doc), replace Yjs content
  //    using prosemirrorToYDoc() -> encodeStateAsUpdate() -> applyUpdate()
}
```

### What It Does NOT Add

- No markdown-specific sync (Yjs syncs ProseMirror document structure, not markdown text)
- No conflict resolution beyond what y-prosemirror provides
- No awareness of the remark pipeline (remark is only used when explicitly serializing)
- The XmlFragment stores ProseMirror's node tree, not MDAST or markdown

### Dependencies

```json
"peerDependencies": {
  "y-prosemirror": "*",
  "y-protocols": "*",
  "yjs": "*"
}
```

The actual y-prosemirror version used in dev: `^1.2.15`.

---

## 7. Round-Trip Fidelity Analysis

### What Changes on Round-Trip

Based on source code analysis of the parser, serializer, remark handlers, and remark plugins:

#### Whitespace
- **Trailing spaces in text**: Custom `text` handler in remark-stringify preserves trailing spaces (prevents `&#20;` encoding). Source: `remark-handlers.ts` lines 4-15.
- **Line breaks within paragraphs**: The `remarkLineBreak` plugin converts newlines to `break` MDAST nodes. On serialization, these become hard breaks in markdown output. Soft line breaks within paragraphs are NOT preserved.
- **Empty lines between blocks**: The `remarkPreserveEmptyLinePlugin` strips `<br />` HTML used as empty line markers. The paragraph serializer re-inserts `<br />` for empty paragraphs (non-last-child only). This is a lossy transform for arbitrary whitespace patterns.

#### Emphasis/Strong Markers
- **Preserved**: The `remarkMarker` plugin annotates MDAST emphasis/strong nodes with their original marker character (`*` or `_`). The emphasis/strong schemas store this as a ProseMirror mark attribute. The custom stringify handlers use it during serialization.
- **Net effect**: `*italic*` stays `*italic*`, `_italic_` stays `_italic_`.

#### List Formatting
- **Bullet markers**: NOT preserved. The bullet list serializer always outputs `list` MDAST type with `ordered: false`. remark-stringify chooses the marker.
- **Ordered list start numbers**: Preserved via `remarkAddOrderInListPlugin` which adds `.label` to each list item.
- **Spread (loose) lists**: Preserved via `spread` attribute on both `bullet_list` and `list_item` schemas.

#### Code Block Fences
- **Language**: Preserved via `language` attribute.
- **Fence character** (`` ` `` vs `~`): NOT preserved. remark-stringify defaults apply.
- **Fence count**: NOT preserved. remark-stringify defaults apply.

#### Link Style
- **Reference links**: Converted to inline links by `remark-inline-links` plugin. This is a deliberate, lossy transform.

#### HTML Content
- **Inline HTML**: Preserved as opaque `html` atom nodes (stored as string in `value` attribute).
- **Block HTML**: Wrapped in paragraphs by `remarkHtmlTransformer` (which self-describes as temporary: "should be deprecated after we support HTML").

#### Custom/Unknown Nodes
- Any MDAST node type without a matching `parseMarkdown.match` throws `parserMatchError`. Unknown content is not silently dropped -- it causes a hard error.

### Summary Table

| Feature | Preserved? | Mechanism |
|---------|-----------|-----------|
| Emphasis/strong marker (`*` vs `_`) | Yes | remarkMarker + attrs + custom stringify handler |
| List bullet marker (`-` vs `*` vs `+`) | No | remark-stringify defaults |
| Ordered list start number | Yes | remarkAddOrderInListPlugin |
| Loose/tight lists | Yes | `spread` attribute |
| Code block language | Yes | `language` attribute |
| Code fence style (`` ` `` vs `~`) | No | remark-stringify defaults |
| Reference vs inline links | No | remark-inline-links converts all to inline |
| Trailing whitespace | Mostly | Custom text handler |
| Inter-block whitespace | Partial | Empty line preservation is heuristic-based |
| HTML content | Yes (opaque) | Stored as string, not parsed |
| Unknown MDAST nodes | Error | Hard error, not silent loss |

---

## 8. Can remark-mdx Be Added to Milkdown's Pipeline?

### Current Status

There is **no official MDX support** in Milkdown. The `remarkHtmlTransformer` plugin explicitly notes it should be deprecated once HTML support improves.

### GitHub Discussion Evidence

[Discussion #772](https://github.com/orgs/Milkdown/discussions/772) documents a community attempt:

1. Adding `remark-mdx` to the remark plugins array **works at the parsing level** -- MDAST nodes like `mdxJsxFlowElement` appear in the tree.
2. The **blocker** is that there are no ProseMirror node schemas to match these MDAST types. The parser's `#matchTarget` throws `parserMatchError` when it encounters `mdxJsxFlowElement`, `mdxJsxTextElement`, `mdxjsEsm`, or `mdxFlowExpression`.
3. The `remarkHtmlTransformer` also interfered by transforming HTML-like content.

### What Would Be Needed

To add MDX support to Milkdown, you would need:

**1. Remark plugin wrapper:**
```typescript
const remarkMdxPlugin = $remark('remarkMdx', () => remarkMdx)
```

**2. ProseMirror node schemas for each MDX MDAST type:**

remark-mdx produces these MDAST node types:
- `mdxJsxFlowElement` -- block-level JSX (e.g., `<MyComponent />`)
- `mdxJsxTextElement` -- inline JSX (e.g., `<Highlight>text</Highlight>`)
- `mdxjsEsm` -- ESM import/export statements
- `mdxFlowExpression` -- block-level JS expressions (`{expression}`)
- `mdxTextExpression` -- inline JS expressions

For each, you need a `$nodeSchema` with:
- `parseMarkdown.match` for the MDAST type
- `parseMarkdown.runner` to create ProseMirror nodes (likely atom nodes for components, or container nodes for wrapping elements)
- `toMarkdown.match` and `toMarkdown.runner` to reconstruct MDAST
- Appropriate ProseMirror `NodeSpec` (atom vs container, inline vs block, attributes for props/name/etc.)

**3. Disable or modify `remarkHtmlTransformer`:**

The HTML transformer wraps standalone HTML in paragraphs, which would corrupt JSX elements. You'd need to either remove it or modify it to skip MDX node types.

**4. Custom remark-stringify handlers (potentially):**

If `remark-mdx` doesn't register its own stringify handlers (it does -- `remark-mdx` includes both parse and stringify), they should work automatically. However, Milkdown's custom `text`/`strong`/`emphasis` handlers might need testing for interaction with MDX expression content.

### Feasibility Assessment

| Aspect | Difficulty | Notes |
|--------|-----------|-------|
| Adding remark-mdx to pipeline | Trivial | One line: `$remark('remarkMdx', () => remarkMdx)` |
| Flow element schema (block JSX) | Medium | Atom node with name + attributes + children serialization |
| Text element schema (inline JSX) | Medium | Inline atom or mark with nested content |
| ESM schema | Easy | Atom node, store raw text |
| Expression schemas | Easy | Atom nodes, store raw expression text |
| Removing HTML transformer conflict | Easy | Don't use `remarkHtmlTransformer` or patch it |
| Round-trip fidelity for JSX props | Hard | ProseMirror attrs must faithfully store all JSX attributes |
| Nested MDX children editing | Hard | Container JSX elements need editable child content |

The **hardest part** is not the remark integration (which is straightforward) but designing ProseMirror node types that can represent the full richness of MDX while being editable. Block-level atom nodes (opaque, uneditable blobs displaying the component name) would be simplest; fully editable JSX with nested markdown content would require significant ProseMirror schema design work.

---

## 9. Key Architectural Insights for CRDT-Backed MDX Editor

### What Milkdown Gets Right

1. **Bidirectional specs co-located**: Every node/mark defines both `parseMarkdown` and `toMarkdown` in the same schema object. This makes it impossible to add a node type without defining its round-trip behavior.

2. **Remark as the canonical pipeline**: By using remark for both parsing and stringification, Milkdown inherits the entire remark plugin ecosystem. Adding syntax support = adding a remark plugin + ProseMirror schema.

3. **Stack-based transformer**: The parser and serializer both use explicit stack machines, making the transformation deterministic and debuggable.

4. **Marker preservation pattern**: The emphasis/strong marker preservation demonstrates how to maintain source-level fidelity through: remark plugin (annotate MDAST) -> ProseMirror attribute -> custom stringify handler.

### What's Limiting

1. **ProseMirror is the collaboration layer, not MDAST/markdown**: Yjs syncs ProseMirror nodes, not MDAST or markdown. This means collaborative edits happen in "ProseMirror space" and only get serialized to markdown on demand (via the listener plugin). There is no concept of "collaborative markdown" -- the CRDT operates on the ProseMirror document structure.

2. **No incremental re-parse**: When loading markdown, the entire string is parsed at once. There's no diffing or incremental update from markdown changes.

3. **remark-stringify controls the output format**: Features like fence style, bullet character, and reference link format are controlled by remark-stringify options, not by Milkdown. To preserve these, you'd need to annotate MDAST nodes (like the marker pattern) and write custom stringify handlers.

4. **HTML is an escape hatch, not a first-class feature**: The `remarkHtmlTransformer` wrapping HTML in paragraphs, combined with HTML nodes being opaque atoms, means any HTML-like syntax (including JSX/MDX) hits friction.

### Implications for Our System

If we want **markdown/MDX as the canonical format** with CRDT collaboration:

- **Option A**: Use Milkdown's architecture (remark pipeline + ProseMirror) but sync via y-prosemirror (ProseMirror is CRDT layer). Markdown is derived from ProseMirror state. This is what Milkdown does today.

- **Option B**: Make MDAST the CRDT layer (sync MDAST nodes via Yjs), derive both ProseMirror state AND markdown string from MDAST. This would require a different architecture than what Milkdown provides, but could use Milkdown's transformer code as a reference.

- **Option C**: Make markdown text the CRDT layer (use Yjs Text type), re-parse on every change. This has the best fidelity but worst performance for large documents.

Milkdown's architecture is firmly Option A. The remark pipeline is used at the boundaries (load/save), not as a continuous sync mechanism.
