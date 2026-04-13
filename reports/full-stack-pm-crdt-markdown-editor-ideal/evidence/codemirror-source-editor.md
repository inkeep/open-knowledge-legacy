# Evidence: CodeMirror 6 Source Editor Integration

**Source artifacts:**
- `node_modules/y-codemirror.next/src/` — v0.3.5 (unpacked from node_modules)
- `@codemirror/lang-markdown` v6.5.0 — package source + README
- `@lezer/markdown` v1.6.3 — grammar source

---

## 1. y-codemirror.next v0.3.5: ViewPlugin-Based Sync

y-codemirror.next connects a CodeMirror 6 `EditorView` to a `Y.Text` instance. The synchronization is implemented as a CM6 `ViewPlugin`.

### CM → Y.Text (Editor Writes)

```typescript
// Simplified from y-codemirror.next/src/y-sync.ts
class YSyncPluginValue implements PluginValue {
  update(update: ViewUpdate) {
    if (update.docChanged) {
      const ydoc = this.ytext.doc!;
      ydoc.transact(() => {
        update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          if (toA > fromA) {
            this.ytext.delete(fromA, toA - fromA);
          }
          if (inserted.length > 0) {
            this.ytext.insert(fromA, inserted.sliceString(0));
          }
        });
      }, ySyncPluginKey); // origin = ySyncPluginKey (echo prevention)
    }
  }
}
```

Changes are translated to Y.Text `delete`/`insert` operations via `iterChanges`, wrapped in a single Y.Doc transaction with `ySyncPluginKey` as the transaction origin.

### Y.Text → CM (Remote Writes)

```typescript
// Y.Text observer → CM dispatch
this.ytext.observe((event) => {
  if (event.transaction.origin === ySyncPluginKey) {
    // Echo prevention: skip changes we just sent
    return;
  }
  // Translate Y.Text delta to CM ChangeSet
  const changes = deltaToChanges(event.delta, this.view.state.doc);
  this.view.dispatch({ changes, annotations: [ySyncAnnotation.of(true)] });
});
```

Echo prevention is symmetric: CM→Y.Text uses `ySyncPluginKey` as origin; Y.Text→CM skips events with that origin.

### Cursor / Awareness: Relative Positions

y-codemirror.next uses `Y.createRelativePositionFromTypeIndex` and `Y.createAbsolutePositionFromRelativePosition` to maintain cursor stability across remote edits. The awareness state carries serialized relative positions, not absolute integer offsets.

### yCollab API Signature

```typescript
function yCollab(
  ytext: Y.Text,
  awareness: Awareness | null,
  options?: {
    undoManager?: Y.UndoManager | false;
    // Additional options...
  }
): Extension;
```

Returns a CM6 `Extension` array. Compose into `EditorState.create({ extensions: [...yCollab(ytext, awareness)] })`.

---

## 2. Zero ProseMirror Coupling

y-codemirror.next operates exclusively on `Y.Text`. It has **no awareness** of:

- ProseMirror node types or schemas
- `Y.XmlFragment` (TipTap's CRDT binding)
- Any parser or serializer (remark, `@tiptap/markdown`, etc.)
- The observer layer connecting `Y.Text` ↔ `Y.XmlFragment`

```
Y.Doc
├── Y.XmlFragment('default')  ← TipTap binds here
│        ↑↓
│   [Observer layer — observers.ts]   ← the coupling surface
│        ↑↓
├── Y.Text('source')          ← CodeMirror binds here via yCollab
```

**Migration implication:** Migrating from `@tiptap/markdown` to a remark-based pipeline changes what happens in the observer layer (`observers.ts`). The CodeMirror side (`SourceEditor.tsx`, `yCollab` wiring) requires zero changes. The migration boundary is cleanly contained to:

1. `observers.ts` — Observer A `serialize()` call and Observer B `parse()` call
2. `agent-sessions.ts` — `syncTextToFragment()` implementation
3. `core/src/extensions/` — Extension/handler definitions

---

## 3. @codemirror/lang-markdown v6.5.0: Lezer Incremental Parser

### Architecture

`@codemirror/lang-markdown` wraps `@lezer/markdown` in a CM6 `LanguageSupport`. The parser is **two-phase incremental**:

1. **Block structure** — parsed top-down, identifies paragraph boundaries, code fences, headings, etc.
2. **Inline content** — parsed within block boundaries

Because Lezer is incremental, re-parsing after an edit is O(edit-size), not O(document-size).

### GFM Configuration Gap

The `markdown()` function accepts a `MarkdownConfig`:

```typescript
function markdown(config?: {
  base?: Language;           // default: commonmarkLanguage
  extensions?: MarkdownConfig[];
  addKeymap?: boolean;
  // ...
}): LanguageSupport;
```

Two base language presets:

| Preset | GFM Tables | Strikethrough | Task Lists | Sub/Super | Emoji |
|--------|-----------|---------------|------------|-----------|-------|
| `commonmarkLanguage` | No | No | No | No | No |
| `markdownLanguage` | Yes | Yes | Yes | Yes | Yes |

**Current gap in Open Knowledge:** `SourceEditor.tsx` calls `markdown()` with no arguments, which defaults to `commonmarkLanguage`. GFM tables, task lists, and strikethrough are not highlighted in source mode even though the WYSIWYG mode (TipTap) supports them via the `Table`, `TaskList`, and `Strike` extensions.

Fix is a one-liner:

```typescript
// SourceEditor.tsx — before
import { markdown } from '@codemirror/lang-markdown';
// ...
markdown()

// After
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
// ...
markdown({ base: markdownLanguage })
```

---

## 4. MDX/JSX in CodeMirror: Approaches

`@codemirror/lang-markdown` has no built-in MDX/JSX support. Four approaches, ordered by architectural cleanliness:

### Approach 1: `parseInline` Extension Point

Register a custom inline parser that recognizes `{expression}` delimiters:

```typescript
const mdxInlineParser: MarkdownConfig = {
  defineNodes: [{ name: 'MdxExpression', style: tags.processingInstruction }],
  parseInline: [{
    name: 'MdxExpression',
    parse(cx, next, pos) {
      if (next !== 123 /* '{' */) return -1;  // fast path
      const end = cx.findClosing(pos + 1, 125 /* '}' */);
      if (end < 0) return -1;
      return cx.addElement(cx.elt('MdxExpression', pos, end + 1));
    },
  }],
};
```

Pros: Simple, incremental. Cons: Inline only; does not handle JSX block elements.

### Approach 2: `parseBlock` Extension Point

```typescript
const mdxBlockParser: MarkdownConfig = {
  defineNodes: [{ name: 'MdxJsxBlock', block: true, style: tags.processingInstruction }],
  parseBlock: [{
    name: 'MdxJsxBlock',
    parse(cx, line) {
      if (!line.text.startsWith('<') && !line.text.startsWith('{')) return false;
      // consume lines until closing tag
      // ...
      return true;
    },
  }],
};
```

Pros: Handles block-level JSX. Cons: Stateful line-by-line parsing is error-prone for nested JSX.

### Approach 3: Nested Language via `wrap`

Embed a full JSX language parser for JSX blocks:

```typescript
import { jsxLanguage } from '@codemirror/lang-javascript';

const mdxConfig: MarkdownConfig = {
  wrap: parseMixed((node) => {
    if (node.name === 'MdxJsxBlock') {
      return { parser: jsxLanguage.parser };
    }
    return null;
  }),
};
```

Pros: Full JSX syntax highlighting within MDX blocks. Cons: Requires first identifying MDX blocks (needs parseBlock step above), more complex composition.

### Approach 4: Decoration ViewPlugin (Fallback)

Skip Lezer participation entirely; use a `ViewPlugin` to apply `Decoration.mark` over JSX spans detected by regex:

```typescript
const jsxDecorationPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }
  update(update: ViewUpdate) {
    if (update.docChanged) this.decorations = this.buildDecorations(update.view);
  }
  buildDecorations(view: EditorView): DecorationSet {
    // regex over view.state.doc.toString() — not incremental
    // ...
  }
}, { decorations: v => v.decorations });
```

Pros: Easy to implement. Cons: Not incremental, no participation in syntax tree (other plugins cannot query JSX nodes), brittle against edge cases.

### Recommendation

For Open Knowledge's MDX/wiki-link support: **nested parser** (Approach 3) is architecturally cleanest. It participates in Lezer's syntax tree, enabling downstream consumers (linters, folding, etc.) to query JSX structure. The two-step (parseBlock to identify boundaries + wrap for nested parsing) is the accepted pattern.

---

## 5. Extension Model: Five MarkdownConfig Points

```typescript
interface MarkdownConfig {
  // Declare new node types the parser can produce
  defineNodes?: readonly NodeSpec[];

  // Inline parsers (e.g., wiki-links [[...]], expressions {...})
  parseInline?: readonly InlineParser[];

  // Block parsers (e.g., MDX JSX blocks, directives)
  parseBlock?: readonly BlockParser[];

  // Remove built-in constructs (e.g., remove ATX headings to handle them custom)
  remove?: readonly string[];

  // Wrap with a mixed-language parser (e.g., embed JS inside JSX blocks)
  wrap?: ParseWrapper;
}
```

### Wiki-Link Lezer Example (Inline)

```typescript
const wikiLinkConfig: MarkdownConfig = {
  defineNodes: [
    { name: 'WikiLink', style: tags.link },
    { name: 'WikiLinkTarget', style: tags.url },
    { name: 'WikiLinkAlias', style: tags.labelName },
  ],
  parseInline: [{
    name: 'WikiLink',
    parse(cx, next, pos) {
      // Match [[target]] or [[target|alias]]
      if (next !== 91 /* '[' */ || cx.char(pos + 1) !== 91) return -1;
      let end = pos + 2;
      while (end < cx.end && !(cx.char(end) === 93 && cx.char(end + 1) === 93)) end++;
      if (end >= cx.end) return -1;  // unclosed
      const pipePos = cx.slice(pos + 2, end).indexOf('|');
      const children: Element[] = [];
      if (pipePos >= 0) {
        children.push(cx.elt('WikiLinkTarget', pos + 2, pos + 2 + pipePos));
        children.push(cx.elt('WikiLinkAlias', pos + 2 + pipePos + 1, end));
      } else {
        children.push(cx.elt('WikiLinkTarget', pos + 2, end));
      }
      return cx.addElement(cx.elt('WikiLink', pos, end + 2, children));
    },
  }],
};
```

---

## 6. Lezer vs Decoration: Comparison

| Dimension | Lezer Extension | Decoration ViewPlugin |
|-----------|----------------|----------------------|
| Syntax tree participation | Yes — queryable by other plugins | No |
| Incremental reparsing | Yes — O(edit-size) | No — O(doc-size) |
| Implementation complexity | Medium (requires Lezer API knowledge) | Low |
| Composability with folds, linters | Yes | Limited |
| Correctness on nested structures | Yes (grammar-driven) | Fragile (regex) |
| MDX JSX accuracy | High (with nested parser) | Low |

---

## 7. Improvement Opportunities

Five improvements to `SourceEditor.tsx` that are independent of any remark migration:

1. **Switch to `markdownLanguage` base** — enables GFM table, task list, and strikethrough highlighting (one-liner).
2. **Add wiki-link Lezer extension** — inline syntax highlighting for `[[...]]` links; uses `parseInline` config point.
3. **Add MDX expression decoration** — `{expression}` blocks highlighted as processing instructions; low-effort via `parseInline`.
4. **Add MDX JSX block nested parser** — full JSX highlighting inside JSX blocks; medium effort.
5. **Expose `undoManager` option** — `yCollab(ytext, awareness, { undoManager: false })` would disable CM's built-in undo in favor of the server-side UndoManager already used by the agent API.

None of these changes affect the ProseMirror side, Observer A/B, or `syncTextToFragment`.

---

## 8. Architecture Diagram

```
Y.Doc
├── Y.XmlFragment('default')
│   ↕ TipTap HocuspocusProvider
│   ↕ Observer A: XmlFragment → Y.Text (origin: 'sync-from-tree')
│   ↕ Observer B: Y.Text → XmlFragment (origin: 'sync-from-text')
│   ↕ [serialize / parse boundary — migration target]
├── Y.Text('source')
│   ↕ yCollab(ytext, awareness)  [NO PM COUPLING]
│   ↕ @codemirror/lang-markdown Lezer parser
│   ↕ CodeMirror EditorView
├── Y.Map('metadata')   — frontmatter cache
└── Y.Map('activity')   — agent write attribution

Migration boundary:
  observers.ts: serialize(fragment) → fromProseMirror() + remark-stringify()
  observers.ts: parse(text)         → remark-parse()   + toProseMirror()
  agent-sessions.ts: syncTextToFragment() → remark-parse() + toProseMirror()
```

The CodeMirror layer (everything below `Y.Text('source')` in the diagram) is **untouched** by a remark-based pipeline migration.
