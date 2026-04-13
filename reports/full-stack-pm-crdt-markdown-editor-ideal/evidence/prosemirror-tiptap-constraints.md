# Evidence: ProseMirror Core and TipTap Framework Constraints

**Sources:** ProseMirror source (prosemirror-model@1.x, prosemirror-state@1.x, prosemirror-commands@1.x), TipTap v2.x source, y-prosemirror, prosemirror-flat-list, Marijn Haverbeke forum posts (discuss.prosemirror.net), TipTap documentation
**Date collected:** 2026-04-12
**Confidence legend:** HIGH = confirmed from source; MEDIUM = inferred from pattern; LOW = community attribution only

---

## 1. Atom Node Contract

**Confidence: HIGH**

`atom: true` in a NodeSpec is a view-layer hint that signals the node should be treated as a single indivisible unit in editing operations. Crucially, it does not change the node's content model — content expressions are still evaluated against the schema.

From `prosemirror-model/src/schema.ts`:

```typescript
get isAtom() {
  return this.isLeaf || !!this.spec.atom;
}
```

`isLeaf` is true when `content` is `null` or `""`. `isAtom` is true for leaves AND for nodes explicitly marked `atom: true`. A node can therefore be non-leaf (have content) and still be atomic — this is the inline atom pattern used by mentions and wiki-links.

**Marks on atom nodes:** marks are controlled by the parent NodeType's `marks` expression, not by the atom node itself. An atom inline node embedded in a paragraph inherits whatever marks the paragraph allows at that position. If you want to prevent marks from being applied to the span occupied by an atom, you must either (a) use a leaf node (no content), or (b) handle it explicitly in your mark filter.

**Key distinction — leaf vs atom:**

| Property | Leaf node | Atom node (non-leaf) |
|---|---|---|
| `isLeaf` | true | false |
| `isAtom` | true | true |
| Has content | No | Yes |
| Editable interior | No | Treated as opaque by editor |
| Cursor can enter | No | No (atom blocks cursor entry) |

---

## 2. Mark vs Inline Atom Decision

**Confidence: HIGH (pattern); MEDIUM (Marijn attribution)**

The canonical decision rule for inline markdown constructs: use an inline atom node when the construct is "an indivisible semantic unit" that cannot be partially selected, partially styled, or have its interior characters modified by normal typing.

Marijn Haverbeke, discuss.prosemirror.net (paraphrased, attribution MEDIUM):
> "If the construct is an indivisible semantic unit, use an inline atom node. Marks are for styling spans of text — they compose and overlap. An inline node is for a thing that happens to live inline but isn't text."

**Applications:**

- **Wiki-links** (`[[Page Name]]`): inline atom. The link target is the identity of the node; partial edits would produce invalid targets. The display text may be static or derived from the target.
- **Inline MDX** (`<Component prop="value" />`): inline atom. JSX attribute structure cannot be partially selected or merged with adjacent marks.
- **Mentions** (`@user`): TipTap's canonical example of the inline atom pattern.

**TipTap Mention NodeSpec pattern:**

```typescript
// From @tiptap/extension-mention (simplified)
const Mention = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      id: { default: null },
      label: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-mention]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-mention': '' }, HTMLAttributes), 0];
  },
});
```

The `atom: true` + `inline: true` combination is the idiomatic TipTap pattern for non-text inline nodes that should behave as single characters in editing operations.

---

## 3. Unified List Type (prosemirror-flat-list)

**Confidence: HIGH**

`prosemirror-flat-list` replaces the standard `bulletList`/`orderedList`/`listItem` trio with a single `list` node type carrying a `kind` attribute. This eliminates the nested list nesting problem inherent in the standard PM list schema.

**NodeSpec:**

```typescript
const listNodeSpec: NodeSpec = {
  content: 'block+',
  group: 'flatList block',
  attrs: {
    kind: { default: 'bullet' },  // 'bullet' | 'ordered' | 'task' | 'toggle'
    order: { default: null },      // starting number for ordered lists
  },
  defining: true,
};
```

`content: 'block+'` means list items are blocks, not a separate `listItem` node type. The list itself is the item container.

**`checked` attribute placement:** The `checked` state for task list items belongs on the list node (or its wrapping block), NOT on a separate `listItem` node, because there is no `listItem` type in the flat-list schema. This is a common design error when porting from standard PM list schema.

**Design correction table:**

| Standard PM pattern | prosemirror-flat-list pattern | Note |
|---|---|---|
| `bulletList > listItem > paragraph` | `list[kind=bullet] > paragraph` | No listItem type |
| `orderedList[start] > listItem` | `list[kind=ordered, order=N]` | `order` on list node |
| `taskList > taskItem[checked]` | `list[kind=task] > ... ` | `checked` needs block-level placement |
| Nest via `listItem > bulletList` | Flat: list siblings in content | No nesting by containment |

**PM commands and NodeType params:** ProseMirror commands (e.g., `toggleList`, `liftListItem`, `sinkListItem`) accept `NodeType` parameters. When switching to flat-list, all command wiring must be updated to reference the single `list` NodeType rather than separate bullet/ordered types. TipTap wraps these in extension command methods that reference `this.name` — see section 4.

---

## 4. Command Coupling in TipTap

**Confidence: HIGH**

TipTap extension commands reference `this.name` (the extension's registered name) to decouple from hardcoded schema node names. This means:

- Renaming a TipTap extension changes all `this.name` references automatically.
- Commands that call ProseMirror directly (e.g., `toggleMark(this.editor.schema.marks[this.name])`) are schema-name-coupled.
- Commands using TipTap's `chain()` API are decoupled via the extension registry.

**Coupling analysis table:**

| Command pattern | Schema-name coupled? | Note |
|---|---|---|
| `this.editor.schema.nodes[this.name]` | Yes — runtime lookup | Safe if extension name === schema name |
| `this.editor.schema.marks.bold` | Yes — hardcoded | Breaks on rename |
| `toggleMark(this.name)` via chain | No | Goes through extension registry |
| `setNode(this.name)` via chain | No | Goes through extension registry |
| `prosemirror-commands` directly | Yes — NodeType by reference | Must pass correct NodeType |

**Critical:** When creating a new extension that wraps a prosemirror-flat-list node, ensure `name` in `Node.create({ name: 'list' })` matches the NodeSpec key used in the schema. Mismatches cause silent failures where commands find no matching node type at runtime.

---

## 5. Attribute Shape for Y.js Compatibility

**Confidence: HIGH**

`Y.XmlElement.setAttribute` is typed as:

```typescript
setAttribute(name: string, value: string | Y.AbstractType<any>): void
```

This has two critical implications:

1. **Flat attributes only.** Nested objects (e.g., `{ type: 'wikilink', target: 'Page' }`) cannot be stored as a single attribute value. Each logical property must be a separate attribute key.
2. **String values only** (for non-Y.AbstractType values). Numbers must be serialized to strings and deserialized on read.

**compareDeep performance:** ProseMirror's `compareDeep` (used in `Node.eq`) performs structural deep equality on attrs objects. Flat attributes with primitive values give O(1) per-key comparison. Nested objects would require recursive traversal — O(n) in object depth.

Marijn Haverbeke discourages nested attribute objects in NodeSpec (discuss.prosemirror.net, attribution MEDIUM):
> "Attribute values should be JSON-serializable primitives or simple arrays. Nested objects make equality comparison expensive and cause issues with some serialization paths."

**Recommended attribute shape for wiki-link:**

```typescript
// Correct — flat, string-valued
addAttributes() {
  return {
    target: { default: null },    // 'Page Name'
    alias: { default: null },     // 'display text' or null
    anchor: { default: null },    // '#section' or null
  };
}

// Incorrect — nested object, incompatible with Y.XmlElement.setAttribute
addAttributes() {
  return {
    data: {
      default: { target: null, alias: null, anchor: null }  // BAD
    }
  };
}
```

---

## 6. Content Expressions and DFA Compilation

**Confidence: HIGH**

ProseMirror compiles content expressions into a DFA (deterministic finite automaton) at schema construction time. The expression syntax is a regex-like DSL:

```
doc:         block+
paragraph:   inline*
listItem:    paragraph block*
codeBlock:   text*
table:       tableRow+
tableRow:    tableCell+
tableCell:   block+
```

**fillBefore synthesizability constraint:** When ProseMirror repairs document structure (e.g., during paste), it calls `fillBefore(before, after, toIndex)` to synthesize the minimum required content. If the content expression requires a node type that cannot be synthesized (e.g., no default content), repair silently fails or produces unexpected results.

**Paragraph-first ordering:** When a content expression allows multiple types, paragraph must appear first in the schema's `nodes` ordering (or in group ordering) to be selected as the default fill type. For `listItem: paragraph block*`, ProseMirror will synthesize a paragraph as the required first child.

**Group membership:** `block` and `inline` are the two standard PM groups. Custom groups (e.g., `flatList`) extend the group namespace but must be declared in the `groups` field or via NodeSpec `group` property.

---

## 7. CodeBlock NodeSpec Identity

**Confidence: HIGH**

`CodeBlock` and `CodeBlockLowlight` (TipTap's syntax-highlighted variant) share the same NodeSpec. `CodeBlockLowlight` extends `CodeBlock` and overrides only the NodeView renderer:

```typescript
// @tiptap/extension-code-block-lowlight
const CodeBlockLowlight = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockLowlightComponent);
  },
  // NodeSpec is inherited unchanged
});
```

**Syntax highlighting is decoration-layer only.** Lowlight decorations are computed from the current node content and applied via `DecorationSet` in the plugin state. They do not modify the Y.XmlElement attribute structure — the CRDT stores only `{ language: string }` as an attribute.

This means:
- Schema migrations that change CodeBlock only need to handle the NodeSpec shape.
- Syntax highlighting decorations are recomputed on every render from raw content.
- No CRDT-layer representation of token spans or highlight ranges.

---

## 8. HTML Round-Trip Paths

**Confidence: HIGH**

ProseMirror has three independent serialization/parse paths. They do NOT share implementations:

| Path | Serialize | Parse | Used for |
|---|---|---|---|
| Markdown | `mdManager.serialize()` | `mdManager.parse()` | Disk persistence, CRDT source text |
| HTML | `DOMSerializer.fromSchema()` | `DOMParser.fromSchema()` | Clipboard operations |
| CRDT (Y.js) | y-prosemirror encoding | y-prosemirror decoding | Real-time collaboration |

**Clipboard only:** HTML serialization is triggered by clipboard operations (copy/paste from external apps). It is not used for disk persistence or CRDT sync. A node that serializes correctly to HTML may still fail markdown round-trip if `toMarkdown` is not implemented.

**Three-path consistency requirement:** For a new node type to work correctly in all contexts, it must implement:
1. `renderHTML` / `parseHTML` — clipboard
2. `toMarkdown` / `fromMarkdown` via remark plugin — disk
3. Y.js attribute mapping via y-prosemirror — CRDT sync

Missing any path causes silent data loss on that specific code path. The markdown path is highest priority for this codebase (disk persistence is the source of truth).
