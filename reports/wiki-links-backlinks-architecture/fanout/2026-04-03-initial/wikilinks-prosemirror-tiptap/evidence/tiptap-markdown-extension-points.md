# Evidence: tiptap-markdown Extension Points

**Source:** `tiptap-markdown` package  
**Repo:** https://github.com/aguingand/tiptap-markdown  
**Local path:** `/Users/edwingomezcuellar/.claude/oss-repos/tiptap-markdown/src/`

## Architecture: Two-Phase HTML Intermediary

tiptap-markdown does NOT build ProseMirror AST directly from markdown. It uses an HTML intermediary:

### Parse Pipeline (Markdown → TipTap)

```
Markdown string
  → [extension.parse.setup(md)] — register markdown-it plugins
  → markdown-it.render() — produces HTML
  → DOMParser.parseFromString() — produces DOM
  → [extension.parse.updateDOM(element)] — mutate DOM
  → normalizeDOM() — clean up blocks/newlines
  → element.innerHTML — returned as HTML string
  → ProseMirror DOMParser.parse() — uses schema's parseDOM
```

**File:** `src/parse/MarkdownParser.js`

- Line 17-21: Creates `markdownit()` instance with `{ html, linkify, breaks }`
- Line 26-28: Iterates extensions, calls `parse.setup(md)` — register markdown-it plugins
- Line 30: `this.md.render(content)` — markdown-it renders to HTML
- Line 31: `elementFromString(renderedHTML)` — create DOM element
- Line 33-35: Iterates extensions, calls `parse.updateDOM(element)` — mutate DOM
- Line 39: Returns `element.innerHTML`

### Serialize Pipeline (TipTap → Markdown)

**File:** `src/serialize/MarkdownSerializer.js`

- Lines 28-40: `get nodes()` — maps schema node names to HTML fallback, then overlays extension serializers
- Lines 43-56: `get marks()` — same pattern for marks
- Uses `prosemirror-markdown`'s `MarkdownSerializerState` (extended in `src/serialize/state.js`)

---

## Extension Registration API

### Spec Lookup: `getMarkdownSpec()` 

**File:** `src/util/extensions.js`, lines 4-16

```typescript
function getMarkdownSpec(extension) {
  // 1. Check extension.storage.markdown (user-defined)
  // 2. Fall back to built-in defaults from src/extensions/index.js
  // 3. Merge both, with extension's own spec taking priority
}
```

### Node Spec Shape

**File:** `index.d.ts`, lines 29-35

```typescript
type MarkdownNodeSpec<O = any> = {
  serialize(
    this: SpecContext<O>,
    state: MarkdownSerializerState,
    node: Node,
    parent: Node,
    index: number
  ): void,
  parse?: {
    setup?(this: SpecContext<O>, markdownit: MarkdownIt): void,
    updateDOM?(this: SpecContext<O>, element: HTMLElement): void
  },
}
```

### Mark Spec Shape

**File:** `index.d.ts`, lines 37-46

```typescript
type MarkdownMarkSpec<O = any> = {
  serialize: {
    open: string | ((this: SpecContext<O>, state, mark, parent, index) => string);
    close: string | ((this: SpecContext<O>, state, mark, parent, index) => string);
  },
  parse?: {
    setup?(this: SpecContext<O>, markdownit: MarkdownIt): void,
    updateDOM?(this: SpecContext<O>, element: HTMLElement): void
  },
}
```

---

## Wikilink Integration Path

### Registration via `addStorage()`

```javascript
const WikilinkNode = Node.create({
  name: 'wikilink',
  // ... standard node config ...
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write(`[[${node.attrs.target}]]`);
        },
        parse: {
          setup(markdownit) {
            // Register a markdown-it inline rule for [[...]]
            markdownit.use(markdownItWikilinks);
            // OR: markdownit.inline.ruler.push('wikilink', wikilinkRule);
            // AND: markdownit.renderer.rules.wikilink = renderToHTML;
          },
        },
      },
    };
  },
});
```

### Existing Examples

**Task list plugin registration:**  
`src/extensions/nodes/task-list.js`, line 19: `markdownit.use(taskListPlugin)`

**Task item DOM mutation:**  
`src/extensions/nodes/task-item.js`, lines 22-29: `parse.updateDOM(element)` adds `data-type` and `data-checked` attributes

**Code block serialization:**  
`src/extensions/nodes/code-block.js`, lines 14-19: Custom `serialize()` function

**Link mark (closest analog):**  
`src/extensions/marks/link.js`: Uses `prosemirror-markdown`'s `defaultMarkdownSerializer.marks.link`

---

## Key Finding: Uses `markdown-it`, NOT `remark/unified`

The underlying parser is **markdown-it v14** (`package.json`, line 49). This means `remark-wiki-link` cannot be used directly. Instead, use a markdown-it wikilink plugin (e.g., `markdown-it-wikilinks`) or write a custom inline rule.

### Serializer State Methods

Available via `prosemirror-markdown`'s `MarkdownSerializerState`:
- `state.write(text)` — append text
- `state.text(text, escape)` — write with optional markdown escaping
- `state.ensureNewLine()` — ensure newline at end
- `state.closeBlock(node)` — close block node
- `state.renderContent(node)` — render all children
- `state.renderInline(node)` — render inline content
