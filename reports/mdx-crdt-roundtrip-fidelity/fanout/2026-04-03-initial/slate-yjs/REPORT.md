---
type: research-report
topic: "slate-yjs: Slate-to-Yjs CRDT Mapping Architecture"
repo: https://github.com/BitPhinix/slate-yjs
version: "@slate-yjs/core@1.0.2"
last_upstream_commit: "2023-07-17"
date: 2026-04-03
confidence: high (full source code analysis of all 18 core source files)
evidence:
  - evidence/mapping-architecture.md
  - evidence/operation-flows.md
  - evidence/concurrent-edit-semantics.md
  - evidence/known-issues.md
---

# slate-yjs: How Slate Nodes Map to Yjs Types

## Executive Summary

slate-yjs uses a single Yjs type -- `Y.XmlText` -- to represent the entire Slate document tree. Every Slate Element (paragraphs, headings, code blocks, custom MDX components, void elements -- everything) maps to a `Y.XmlText` instance. Text content and formatting marks live as string segments with attributes inside the parent `Y.XmlText`'s content. The library is type-agnostic: it handles arbitrary Slate node types without modification. However, the project has been unmaintained since July 2023, has 20 open bugs (including data corruption issues with inline void nodes), and nested object props get LWW semantics instead of field-level merging.

---

## 1. The Mapping Architecture

### The Single Primitive: Y.XmlText

The entire mapping is built on one Yjs type. There is no use of `Y.Map`, `Y.Array`, or `Y.XmlElement` anywhere in the binding layer. Every Slate node, regardless of its `type`, becomes a `Y.XmlText`.

```
Slate Document (Editor)
  |
  +-- sharedRoot: Y.XmlText  (the document root)
        |
        content: [
          Y.XmlText (paragraph),      -- embed, occupies 1 position
          Y.XmlText (heading),        -- embed, occupies 1 position
          Y.XmlText (mdx-component),  -- embed, occupies 1 position
        ]
```

### How Each Slate Node Type Maps

| Slate Node | Yjs Representation | Properties Storage | Content Storage |
|---|---|---|---|
| **Element** (paragraph, heading, etc.) | `Y.XmlText` embedded in parent | `setAttribute(key, value)` for each non-children prop | Children as delta content |
| **Text** (leaf with marks) | String segment in parent `Y.XmlText` delta | Marks stored as delta attributes (`{ insert: "text", attributes: { bold: true } }`) | Text stored as the string itself |
| **Custom Element** (MDX component) | `Y.XmlText` embedded in parent | `setAttribute('type', 'mdx-component')`, `setAttribute('componentName', 'Callout')`, etc. | Children as delta content |
| **Void Element** (image, embed) | `Y.XmlText` embedded in parent | `setAttribute('type', 'image')`, `setAttribute('src', '...')` | Must have at least `[{ text: '' }]` child per Slate rules |
| **Inline Element** (link, mention) | `Y.XmlText` embedded within another `Y.XmlText`'s delta | `setAttribute(key, value)` for each prop | Text/children as delta content |

### Detailed: What Happens to a Slate MDX Component

Given this Slate node:
```json
{
  "type": "mdx-component",
  "componentName": "Callout",
  "props": { "variant": "warning" },
  "children": [
    { "text": "Be careful with this." }
  ]
}
```

It becomes a `Y.XmlText` with:
- **Attributes** (individually addressable via Y.Map semantics):
  - `type` = `"mdx-component"`
  - `componentName` = `"Callout"`
  - `props` = `{ variant: "warning" }` (stored as ONE attribute value -- see implications below)
- **Content** (as a delta):
  - `[{ insert: "Be careful with this." }]`

The conversion code (`slateElementToYText` in `convert.ts`) destructures `{ children, ...attributes }` and stores ALL non-children keys as individual `Y.XmlText` attributes. This is completely type-agnostic.

### How Text Marks Work

A Slate text node `{ text: "hello", bold: true, italic: true }` is NOT a separate Y.XmlText. It becomes a string insert in the parent Y.XmlText's delta:

```
{ insert: "hello", attributes: { bold: true, italic: true } }
```

Adjacent text nodes with different marks become separate delta entries:
```
[
  { insert: "plain text" },
  { insert: "bold text", attributes: { bold: true } },
  { insert: "more plain" }
]
```

Yjs formatting operations (`format()`) handle mark changes as range-based attribute applications.

### Y.XmlText Length Semantics

A critical detail: in the parent's Y.XmlText content, text nodes occupy `string.length` positions, while element nodes (embedded Y.XmlText) occupy exactly **1 position**. This is how `getSlateNodeYLength()` works:

```typescript
return Text.isText(node) ? node.text.length : 1;
```

---

## 2. Data Flow: Slate Ops to Yjs Mutations

### Local Changes (Slate -> Yjs)

1. `editor.apply(op)` is intercepted; op + current `editor.children` snapshot are buffered
2. On `editor.onChange()`, buffered ops are grouped by origin and flushed in Y.Doc transactions
3. Each op type dispatches to a specific handler:

| Slate Operation | Yjs Mutation |
|---|---|
| `insert_text` | `yParent.insert(offset, text, attributes)` |
| `remove_text` | `yParent.delete(offset, length)` |
| `insert_node` (text) | `yParent.insert(offset, text, marks)` |
| `insert_node` (element) | `yParent.insertEmbed(offset, slateElementToYText(node))` |
| `remove_node` | `yParent.delete(start, end - start)` |
| `set_node` (element) | `yTarget.setAttribute(key, value)` per changed key |
| `set_node` (text) | `yParent.format(start, length, newAttributes)` |
| `split_node` | Clone trailing content into new Y.XmlText, delete from original, insertEmbed |
| `merge_node` | Copy source content into target via applyDelta, delete source |
| `move_node` | Clone + delete from origin, applyDelta at target |
| `set_selection` | No-op (not synced) |

### Remote Changes (Yjs -> Slate)

1. `sharedRoot.observeDeep(handleYEvents)` fires for non-local transactions
2. Each `Y.YTextEvent` is translated to Slate operations:
   - **Key changes** on a Y.XmlText -> `set_node` ops (attribute updates on elements)
   - **Delta changes** -> `insert_text`, `remove_text`, `insert_node`, `remove_node`, `split_node`, `set_node` ops
3. Operations are applied to the editor within `Editor.withoutNormalizing()`

---

## 3. Concurrent Edit Behavior

### Property-level concurrency

Since each top-level Slate node attribute maps to an individual `Y.XmlText.setAttribute()` call, concurrent edits to **different** properties on the same node merge cleanly. This is Yjs Map semantics: each key is independently resolvable.

- User A sets `variant: 'warning'`, User B sets `title: 'Note'` -> **Both merge, no conflict**
- User A sets `variant: 'warning'`, User B sets `variant: 'info'` -> **LWW, one wins deterministically**
- User A edits children text, User B changes an attribute -> **Clean merge** (content vs attributes are independent)

### The Nested Props Problem

If an MDX component stores props as a single nested object:
```json
{ "props": { "variant": "warning", "size": "lg" } }
```

The ENTIRE `props` object is ONE Y.XmlText attribute. Concurrent edits to different fields within `props` result in LWW on the whole object. **One user's changes are silently lost.**

**Mitigation**: Flatten props to top-level Slate node attributes:
```json
{ "type": "mdx-component", "prop_variant": "warning", "prop_size": "lg" }
```

Now each prop is an independent Y.XmlText attribute with independent LWW per field.

### Text-level concurrency

Text edits inside elements follow standard Y.XmlText CRDT behavior:
- Concurrent inserts at the same position: interleaved by client ID
- Concurrent inserts at different positions: merge cleanly
- One delete + one insert at same position: insert survives
- Concurrent deletes of overlapping ranges: union of deletions

---

## 4. Custom Node Type Support

### Does slate-yjs need to know about each type?

**No.** The mapping is completely type-agnostic. The `slateElementToYText` function destructures `{ children, ...attributes }` and stores whatever attributes exist. The `yTextToSlateElement` function does `{ ...yText.getAttributes(), children }`. The library never inspects `type`, `componentName`, or any specific key.

### Can we add MDX component nodes without modifying slate-yjs?

**Yes.** As long as the Slate node conforms to the standard `Element` interface (has `children` and additional properties), it will round-trip through Yjs correctly. The test suite demonstrates this with custom types like `unordered-list`, `unordered-list-item`, `note-link`, etc., all without any special handling in slate-yjs.

### What about void elements?

Void elements (where `editor.isVoid(element) === true`) work because slate-yjs doesn't check for void status. The element becomes a Y.XmlText with its attributes and its required `[{ text: '' }]` child. However, see issue #390 -- inline void elements have a known bug when combined with text in the same Yjs delta event.

### What about inline elements?

Inline elements are Y.XmlText embeds within text runs. They work for the basic case (see test `onDataChangeOnInline.tsx`), but have known issues (#390, #401) when mixed with text insertions in the same transaction.

---

## 5. Known Issues Relevant to MDX-CRDT Use

### Severity: CRITICAL

| Issue | Description | Impact |
|---|---|---|
| **#390** (OPEN) | `applyRemoteEvents` breaks on text + inline void in same delta | MDX inline components mixed with text will crash on remote sync |
| **#386** (OPEN) | Null parent reference during `flushLocalChanges` | Intermittent crashes during normal editing |
| **#382** (OPEN) | Content duplication on offline reconnection | Offline-first use case is broken |

### Severity: HIGH

| Issue | Description | Impact |
|---|---|---|
| **#391** (OPEN) | `move_node` forward within same parent miscalculates offsets | Reordering MDX components produces wrong state |
| **#332** (OPEN) | Undo removes blocks with remote changes | Undoing component creation can lose collaborator edits |

### Severity: MEDIUM

| Issue | Description | Impact |
|---|---|---|
| **#379** (OPEN) | Undo after replacing selected text with mark is incorrect | Undo/redo reliability for formatted text |
| **#343** (OPEN) | Empty text nodes not synced | Void elements require empty text children; mismatch possible |

### Project Health

- **Last commit**: July 17, 2023 (nearly 3 years stale)
- **Maintainer response**: None since mid-2023
- **Open issues**: 20, including confirmed data corruption bugs
- **Peer dependencies**: `slate >=0.70.0`, `yjs ^13.5.29`

---

## 6. Summary: Fitness for MDX-CRDT Visual Editor

### What Works

1. **Type-agnostic mapping** -- Any Slate node type, including MDX components, round-trips without modification
2. **Top-level attribute merging** -- Different attributes on the same node merge concurrently without conflict
3. **Text CRDT semantics** -- Rich text inside MDX components gets proper collaborative editing
4. **Full Slate operation coverage** -- All 9 Slate operation types are mapped to Yjs mutations

### What Does Not Work

1. **Nested object props** -- A `props` object stored as a single attribute gets LWW, not field-level merge
2. **Inline void elements** -- Known crash bug (#390) when inline voids and text are edited in the same transaction
3. **move_node forward** -- Incorrect offset calculation (#391) when reordering within a parent
4. **Undo with remote changes** -- Undo can destroy collaborator edits (#332)
5. **Offline reconnection** -- Content duplication (#382)

### Architectural Assessment

The fundamental mapping (Element -> Y.XmlText with attributes + content) is sound and extensible. The attribute-per-key pattern gives good concurrent editing granularity for flat props. The text CRDT behavior is inherited directly from Yjs and is well-proven.

However, the implementation has unfixed bugs in edge cases that matter for a production MDX editor (inline voids, move operations, undo). The project being unmaintained for 3 years means these bugs will need to be fixed in a fork.

### Recommendations for MDX-CRDT

1. **Flatten MDX props** to individual top-level Slate attributes for concurrent merge granularity
2. **Avoid inline void MDX components** or fork slate-yjs to fix #390
3. **Fork the library** and patch #390, #391, and #386 for production use
4. **Consider alternatives** like BlockSuite (Yjs-native) or building a custom Yjs binding layer if the bug surface is too large
5. **Test extensively** with MDX component creation, editing, reordering, and deletion across multiple concurrent users

---

## Appendix: File Map

```
packages/core/src/
  model/types.ts          -- Delta types, YTarget, RelativeRange
  plugins/
    withYjs.ts            -- Main plugin, connect/disconnect, change flow
    withCursors.ts        -- Remote cursor sync
    withYHistory.ts       -- Yjs-based undo/redo
  applyToYjs/
    index.ts              -- Op dispatcher
    types.ts              -- ApplyFunc, OpMapper types
    node/
      insertNode.ts       -- insert_node -> insertEmbed/insert
      removeNode.ts       -- remove_node -> delete
      setNode.ts          -- set_node -> setAttribute/format
      splitNode.ts        -- split_node -> clone + delete + insertEmbed
      mergeNode.ts        -- merge_node -> applyDelta + delete
      moveNode.ts         -- move_node -> clone + delete + applyDelta
    text/
      insertText.ts       -- insert_text -> insert
      removeText.ts       -- remove_text -> delete
  applyToSlate/
    index.ts              -- Event dispatcher
    textEvent.ts          -- YTextEvent -> Slate ops (key changes + delta)
  utils/
    convert.ts            -- slateElementToYText, yTextToSlateElement (THE mapping)
    location.ts           -- getYTarget, getSlatePath, offset conversions
    delta.ts              -- Delta normalization, slicing
    position.ts           -- RelativePosition <-> SlatePoint
    slate.ts              -- getProperties helper
    object.ts             -- deepEquals, pick, omit
    clone.ts              -- Deep clone Y.XmlText
    yjs.ts                -- assertDocumentAttachment
```
