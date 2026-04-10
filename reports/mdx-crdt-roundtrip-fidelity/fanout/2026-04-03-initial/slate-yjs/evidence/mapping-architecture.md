---
type: evidence
source: slate-yjs source code analysis
repo: https://github.com/BitPhinix/slate-yjs
version: "@slate-yjs/core@1.0.2"
last_commit: "2023-07-17"
files_analyzed:
  - packages/core/src/utils/convert.ts
  - packages/core/src/model/types.ts
  - packages/core/src/plugins/withYjs.ts
  - packages/core/src/applyToYjs/**
  - packages/core/src/applyToSlate/**
  - packages/core/src/utils/location.ts
  - packages/core/src/utils/delta.ts
  - packages/core/src/utils/slate.ts
  - packages/core/src/utils/clone.ts
date: 2026-04-03
---

# Mapping Architecture Evidence

## Core Type Mapping (from convert.ts)

### Slate Element -> Y.XmlText

```typescript
// packages/core/src/utils/convert.ts:36-48
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

Key finding: EVERY Slate Element (regardless of type) becomes a `Y.XmlText` instance.
Attributes (type, id, props, etc.) are stored as XmlText attributes via `setAttribute`.
Children are converted to an insert delta and applied to the XmlText content.

### Y.XmlText -> Slate Element

```typescript
// packages/core/src/utils/convert.ts:7-15
export function yTextToSlateElement(yText: Y.XmlText): Element {
  const delta = yTextToInsertDelta(yText);
  const children =
    delta.length > 0 ? delta.map(deltaInsertToSlateNode) : [{ text: '' }];
  return { ...yText.getAttributes(), children };
}
```

Key finding: On the way back, `getAttributes()` is spread directly into the Slate element.
This means ALL attributes stored on the Y.XmlText become top-level properties of the Slate Element.

### Slate Text Node -> Y.XmlText delta insert (string)

```typescript
// packages/core/src/utils/convert.ts:25-34
export function slateNodesToInsertDelta(nodes: Node[]): InsertDelta {
  return nodes.map((node) => {
    if (Text.isText(node)) {
      return { insert: node.text, attributes: getProperties(node) };
    }
    return { insert: slateElementToYText(node) };
  });
}
```

Text nodes become `{ insert: "string content", attributes: { bold: true, ... } }` in the delta.
Element nodes become `{ insert: Y.XmlText }` (embedded) in the parent's delta.

### Delta Insert -> Slate Node

```typescript
// packages/core/src/utils/convert.ts:17-23
export function deltaInsertToSlateNode(insert: DeltaInsert): Node {
  if (typeof insert.insert === 'string') {
    return { ...insert.attributes, text: insert.insert };
  }
  return yTextToSlateElement(insert.insert);
}
```

## The getProperties Helper (from slate.ts)

```typescript
// packages/core/src/utils/slate.ts:4-11
export function getProperties<TNode extends Descendant>(
  node: TNode
): Omit<TNode, TNode extends BaseText ? 'text' : 'children'> {
  return omit(
    node,
    (Text.isText(node) ? 'text' : 'children') as keyof TNode
  ) as Omit<TNode, TNode extends BaseText ? 'text' : 'children'>;
}
```

Key: For text nodes, `getProperties` strips `text` and returns all marks (bold, italic, etc.).
For element nodes, it strips `children` and returns all other properties (type, id, custom props).

## The sharedRoot Model (from withYjs.ts)

```typescript
// packages/core/src/plugins/withYjs.ts:30-31
export type YjsEditor = BaseEditor & {
  sharedRoot: Y.XmlText;
  // ...
};
```

The entire Slate document maps to a single top-level `Y.XmlText` instance called `sharedRoot`.
This is the "root" Y.XmlText, and the document tree is modeled as nested XmlText embeddings.

## Y Length Calculation (from location.ts)

```typescript
// packages/core/src/utils/location.ts:6-12
export function getSlateNodeYLength(node: Node | undefined): number {
  if (!node) return 0;
  return Text.isText(node) ? node.text.length : 1;
}
```

Critical: Element nodes occupy exactly 1 position in the parent Y.XmlText's content.
Text nodes occupy `text.length` positions (one per character).
This is how Y.XmlText indexes work: strings count by character, embeds count as 1.
