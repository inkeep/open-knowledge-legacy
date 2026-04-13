# Fidelity Attributes and Wiki-Links — Evidence

## Source-Text Fidelity Across Reference Editors

### Summary: No editor preserves source-form choices

| Editor | Fidelity Approach | Evidence |
|---|---|---|
| **Milkdown** | Global remark-stringify options only | `remarkStringifyOptionsCtx` allows configuring markers globally (e.g., `emphasis: '*'`), but no per-instance preservation |
| **BlockNote** | Explicitly lossy | API named `blocksToMarkdownLossy()`. JSON recommended for lossless storage. |
| **Plate** | Global remark-stringify pass-through | Uses remark pipeline but no per-node marker tracking |
| **prosemirror-markdown** | Normalized output | `serialize(parse(md))` produces canonical markdown by design |
| **Open Knowledge** | 12 fidelity extensions | Stores delimiter attributes on ProseMirror nodes/marks. Unique in JS WYSIWYG editors. |

### What remark-stringify Can Configure (Globally)

| Option | Values | Default |
|---|---|---|
| `emphasis` | `'*'` or `'_'` | `'*'` |
| `strong` | `'*'` or `'_'` | `'*'` |
| `bullet` | `'-'`, `'*'`, `'+'` | `'*'` |
| `bulletOrdered` | `'.'` or `')'` | `'.'` |
| `fence` | `` '`' `` or `'~'` | `` '`' `` |
| `setext` | `boolean` | `false` |
| `closeAtx` | `boolean` | `false` |
| `listItemIndent` | `'mixed'`, `'one'`, `'tab'` | `'one'` |
| `rule` | `'*'`, `'-'`, `'_'` | `'*'` |
| `ruleRepetition` | number (min 3) | `3` |
| `ruleSpaces` | `boolean` | `false` |
| `incrementListMarker` | `boolean` | `true` |
| `tightDefinitions` | `boolean` | `false` |

Source: [remark-stringify README](https://github.com/remarkjs/remark/blob/main/packages/remark-stringify/readme.md)

### Why remark Cannot Preserve Per-Node Source Form

1. **mdast discards delimiters:** remark-parse produces abstract syntax. An `Emphasis` node has no field indicating `*` vs `_` was used. The mdast spec: "Abstract means not all information is stored in this tree and an exact replica of the original document cannot be re-created."
2. **remark-stringify normalizes:** Applies a single global style per construct. `emphasis: '*'` means ALL emphasis uses `*`.
3. **No `data` field usage:** Every mdast node CAN have a `data` field, but no standard plugin populates delimiter info there, and remark-stringify ignores it.

Source: [mdast spec](https://github.com/syntax-tree/mdast), [remark issue #303](https://github.com/remarkjs/remark/issues/303)

### remark Issue #303: "Emphasis should use marker identical with input"

**Request:** Preserve original emphasis/strong markers on round-trip.
**Resolution:** Closed by maintainer wooorm: "remark formats markdown: think of it as prettier. You can pass it options for syntax... I don't think we should do this."
**Implication:** This is a **design philosophy** decision, not a missing feature. remark is a formatter that normalizes, not a source-preserving tool.

Source: [github.com/remarkjs/remark/issues/303](https://github.com/remarkjs/remark/issues/303)

### Non-JS Solutions That DO Preserve Source Form

- **flexmark-java** (Java): "Source level AST with details of source position down to individual characters." Has `AS_IS` options for list markers, ATX trailing markers, etc. The gold standard.
- **Markdig** (.NET): `trackTrivia: true` mode preserves whitespace/trivia. `RoundtripRenderer` emits identical markdown. Does NOT preserve emphasis delimiters.
- **markdown-it-ast-spec** (draft): Attempts to define lossless AST with `marker` field. Incomplete and unstable.

### Milkdown's remarkMarker

The Milkdown deep dive agent found that Milkdown has a custom remark plugin (`remarkMarker`) that adds `marker` properties to `strong` and `emphasis` mdast nodes. This allows the ProseMirror schema to preserve `*` vs `_` delimiters. However, this is an **internal implementation detail** of Milkdown, not a published remark plugin.

---

## Wiki-Links

### Implementation Status Across Editors

| Editor | Wiki-Link Support | Notes |
|---|---|---|
| Milkdown | None built-in | Architecture supports it via remark plugin + custom node |
| BlockNote | None built-in | Custom inline content API could handle it |
| Plate | None built-in | Could use remark-wiki-link in markdown plugin |
| Obsidian | Yes | Uses CodeMirror 6, not ProseMirror |
| SilverBullet | Yes | Uses CodeMirror 6, not ProseMirror |
| Noteworthy | Yes | ProseMirror-based, supports `[[wikilink]]` syntax |

### remark-wiki-link Ecosystem

**Three-layer stack:**

1. **micromark-extension-wiki-link** — Tokenizer level. Parses `[[...]]` syntax.
2. **mdast-util-wiki-link** — AST level. Creates `wikiLink` mdast nodes:
   ```json
   {
     "type": "wikiLink",
     "value": "Test Page",
     "data": {
       "alias": "Test Page",
       "permalink": "test_page",
       "exists": false,
       "hName": "a",
       "hProperties": { "className": "internal new", "href": "#/page/test_page" },
       "hChildren": [{ "type": "text", "value": "Test Page" }]
     }
   }
   ```
3. **remark-wiki-link** — Plugin level. Composing layer with options for `permalinks`, `pageResolver`, `hrefTemplate`, `aliasDivider`.

Sources:
- [remark-wiki-link](https://github.com/landakram/remark-wiki-link)
- [micromark-extension-wiki-link](https://github.com/landakram/micromark-extension-wiki-link)
- [mdast-util-wiki-link](https://github.com/landakram/mdast-util-wiki-link)

**Default alias divider is `:` not `|`.** Obsidian uses `|` (`[[page|display]]`). Configurable via `aliasDivider` option.

### ProseMirror: Mark vs Inline Atom Node

**Strong consensus: inline atom nodes for wiki-links.**

Reasons for inline atom node:
- Wiki-links are self-contained units with a single target
- Users should not partially select or split them
- `atom: true` makes node act as single selectable/deletable unit
- NodeView enables custom rendering (chip, existence indicator, click handler)
- Standard pattern for mention-like constructs in ProseMirror/TipTap

Reasons against marks:
- Marks are for text annotation (bold, italic, link)
- Marks can be partially applied or split
- Marks cannot have their own NodeView

**Recommended ProseMirror spec:**
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

### ProseMirror Editors With Native Wiki-Link Support

- **Noteworthy** — ProseMirror-based, `[[wikilink]]` with bidirectional links. In development.
- **tiptap-wikilink-extension** — TipTap extension with autocomplete. Not on npm.
- **remark-prosemirror** — Could integrate wiki-links via handler for `wikiLink` mdast type.

Sources:
- [Noteworthy](https://github.com/benrbray/noteworthy)
- [tiptap-wikilink-extension](https://github.com/aarkue/tiptap-wikilink-extension)
- [remark-prosemirror](https://github.com/handlewithcarecollective/remark-prosemirror)
