---
title: "Evidence: Slate-Yjs Binding - How Slate Elements Map to Y.XmlText"
pipeline: plate-slate-yjs
step: A.3 (Slate to Yjs)
file: slate-yjs/packages/core/src/utils/convert.ts
---

# Slate-Yjs Binding Mechanics

## Core Conversion

File: `slate-yjs/packages/core/src/utils/convert.ts`

### Slate Element to Y.XmlText

```typescript
export function slateElementToYText({
  children,
  ...attributes
}: Element): Y.XmlText {
  const yElement = new Y.XmlText();

  Object.entries(attributes).forEach(([key, value]) => {
    yElement.setAttribute(key, value);
  });

  yElement.applyDelta(slateNodesToInsertDelta(children), { sanitize: false });
  return yElement;
}
```

Every Slate `Element` becomes a `Y.XmlText`. The element's non-children properties
(like `type`, `url`, `lang`, etc.) become Yjs attributes. The children are
converted to an insert delta.

### Children to Delta

```typescript
export function slateNodesToInsertDelta(nodes: Node[]): InsertDelta {
  return nodes.map((node) => {
    if (Text.isText(node)) {
      return { insert: node.text, attributes: getProperties(node) };
    }
    return { insert: slateElementToYText(node) };
  });
}
```

Text nodes become string inserts with formatting attributes (bold, italic, etc.).
Element children become nested `Y.XmlText` inserts.

### Y.XmlText back to Slate Element

```typescript
export function yTextToSlateElement(yText: Y.XmlText): Element {
  const delta = yTextToInsertDelta(yText);
  const children =
    delta.length > 0 ? delta.map(deltaInsertToSlateNode) : [{ text: '' }];
  return { ...yText.getAttributes(), children };
}
```

The reverse: Yjs attributes become Slate element properties, and the delta is
converted back to Slate children.

## Implications for MDX Test Case

### For Pipeline A's degraded tree:

After `customMdxDeserialize` flattens `<Tabs>` into a paragraph:
```
{ type: 'p', children: [
    { text: '<Tabs>\n' },
    { text: '<Tab>\n' },
    { bold: true, text: 'build' },
    { text: '\n</Tab>' },
    { text: '\n</Tabs>' }
]}
```

This becomes a Y.XmlText with:
- Attribute: `type = 'p'`
- Delta: `[
    { insert: '<Tabs>\n<Tab>\n' },
    { insert: 'build', attributes: { bold: true } },
    { insert: '\n</Tab>\n</Tabs>' }
  ]`

The JSX tag strings are character-level text in the Yjs delta. Any concurrent
edit that targets a position within these strings can split them:

- User A inserts text after "build": safe, targets different position
- User B inserts text inside `"<Tabs>\n"`: splits the tag string, producing
  `"<Tab" + inserted_text + "s>\n"` -- catastrophically broken

### Connection Lifecycle

File: `slate-yjs/packages/core/src/plugins/withYjs.ts`

The `connect()` method (line 204-218):
```typescript
e.connect = () => {
  e.sharedRoot.observeDeep(handleYEvents);
  const content = yTextToSlateElement(e.sharedRoot);
  e.children = content.children;
  CONNECTED.add(e);
  Editor.normalize(editor, { force: true });
};
```

On connect, the editor's children are completely replaced by the Yjs content.
Slate normalization then runs, which may further modify the tree if the Yjs
content violates schema constraints (e.g., headings inside paragraphs from the
MDX fallback).

### Local Change Propagation

```typescript
e.apply = (op) => {
  if (YjsEditor.connected(e) && YjsEditor.isLocal(e)) {
    YjsEditor.storeLocalChange(e, op);
  }
  apply(op);
};

e.onChange = () => {
  if (YjsEditor.connected(e)) {
    YjsEditor.flushLocalChanges(e);
  }
  onChange();
};
```

Local Slate operations are stored and then flushed as a Yjs transaction.
The `applySlateOp` function translates Slate operations (insert_text,
remove_text, insert_node, etc.) into Yjs delta operations on the shared
Y.XmlText tree.

For our degraded MDX content, a text edit like "build" -> "create" would be:
1. Slate op: `{ type: 'remove_text', path: [0, 2], offset: 0, text: 'build' }`
2. Slate op: `{ type: 'insert_text', path: [0, 2], offset: 0, text: 'create' }`
3. These translate to Yjs delta: retain to position, delete 5, insert "create"

This works correctly because the edit targets a Slate text node that maps to
a clean text segment in the Yjs delta.
