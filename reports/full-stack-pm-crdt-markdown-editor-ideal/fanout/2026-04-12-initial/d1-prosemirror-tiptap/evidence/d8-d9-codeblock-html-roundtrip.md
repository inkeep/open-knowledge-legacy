# D8: CodeBlock vs CodeBlockLowlight + D9: HTML Round-trip

## CodeBlock vs CodeBlockLowlight

### Architecture

- **@tiptap/extension-code-block**: Base extension. Defines `codeBlock` node, input rules (` ``` `/`~~~`), keyboard shortcuts, VS Code paste detection. NO syntax highlighting.
- **@tiptap/extension-code-block-lowlight**: Extends CodeBlock, adds a ProseMirror plugin (`LowlightPlugin`) that applies `Decoration.inline()` objects for CSS-based syntax highlighting.

Both share the same NodeSpec:
```
name: 'codeBlock'
content: 'text*'
marks: ''
group: 'block'
code: true
defining: true
```

Attribute: `language` (string|null, `rendered: false`). Serialized to HTML as `class="language-javascript"` on `<code>` element.

Sources:
- [CodeBlock source](https://github.com/ueberdosis/tiptap/tree/main/packages/extension-code-block/src)
- [CodeBlockLowlight source](https://github.com/ueberdosis/tiptap/tree/main/packages/extension-code-block-lowlight/src)

### Syntax highlighting options

| Option | Library | Performance | Quality | Size |
|---|---|---|---|---|
| CodeBlockLowlight | lowlight (highlight.js wrapper) | Fast (~44x Shiki) | Good | Light |
| tiptap-extension-code-block-shiki | Shiki (TextMate grammars) | Slower | VS Code-quality | ~250KB WASM |

Both are decoration-layer only. They do NOT modify the document model, generate Y.js transactions, or interfere with CRDT sync.

Source: [tiptap-extension-code-block-shiki](https://github.com/timomeh/tiptap-extension-code-block-shiki)

### Recommendation

Highlighting is purely a presentation concern. The existing `CodeBlockFidelity` extension (which adds `fenceDelimiter` + `fenceLength` attrs) can be extended with either lowlight or Shiki plugin without schema changes. Server-side (Hocuspocus) needs only the schema, not the highlighting plugin.

## HTML Round-trip

### Architecture: Three independent paths

1. **Markdown path**: `parseMarkdown` / `renderMarkdown` (persistence to disk)
2. **HTML path**: `parseHTML` / `renderHTML` (clipboard, `getHTML()`, `setContent(html)`)
3. **CRDT path**: Y.XmlFragment stores ProseMirror tree natively

These are completely independent. For a markdown-canonical editor, HTML round-trip only matters for **clipboard operations** (copy/paste).

### How `getHTML()` serializes atom nodes

`getHTML()` calls ProseMirror's `DOMSerializer.fromSchema(schema).serializeFragment(doc.content)`, using each node type's `toDOM`/`renderHTML` method.

For atoms: If `renderHTML` returns a spec without a `0` content hole, the serializer creates the DOM element and returns it -- no child content serialized.

Source: [prosemirror-model/src/to_dom.ts](https://github.com/ProseMirror/prosemirror-model/blob/master/src/to_dom.ts)

### Custom attribute preservation through HTML round-trip

Works IF AND ONLY IF:
1. `renderHTML` outputs all attributes as HTML attributes (e.g., `data-target="..."`)
2. `parseHTML` extracts them back (e.g., `getAttribute('data-target')`)
3. Attribute is registered in `addAttributes()`

TipTap rule: "You can't use any HTML element or attribute that is not defined in your schema." Unregistered attributes are silently dropped.

### Y.XmlFragment as source of truth: HTML round-trip not relevant for storage

- **Storage**: Y.Text -> markdown -> disk
- **Collaboration**: Y.js binary protocol (no HTML)
- **Clipboard**: HTML round-trip needed for copy/paste fidelity

The existing WikiLink and JsxComponent extensions handle clipboard correctly with `data-*` attributes.

Source: [TipTap Yjs issue #2310](https://github.com/ueberdosis/tiptap/issues/2310)

## Implications for proposed schema

1. **CodeBlock schema**: No change needed. `language` attr is a simple string. Fidelity attrs (`fenceDelimiter`, `fenceLength`) should remain flat (see D7).
2. **Syntax highlighting**: Decoration-layer concern, no schema impact. Choose lowlight or Shiki based on quality/performance trade-off.
3. **HTML round-trip**: Not a blocker for schema renames. Custom `parseHTML`/`renderHTML` methods handle clipboard fidelity independently of markdown serialization.
4. **For new atom nodes** (MDX components, wiki-links): Ensure `renderHTML` outputs all attrs as `data-*` attributes for clipboard round-trip.
