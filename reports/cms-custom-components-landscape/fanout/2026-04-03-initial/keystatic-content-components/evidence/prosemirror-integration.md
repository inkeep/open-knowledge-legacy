---
title: Keystatic ProseMirror Integration Architecture
source_type: primary
source_paths:
  - packages/keystatic/src/form/fields/markdoc/editor/schema.tsx
  - packages/keystatic/src/form/fields/markdoc/editor/custom-components.tsx
  - packages/keystatic/src/form/fields/markdoc/editor/props-serialization.ts
repo: https://github.com/Thinkmill/keystatic
---

# ProseMirror Integration Architecture

## Schema Construction

`createEditorSchema()` in `schema.tsx:543-705` dynamically builds a ProseMirror `Schema` from:
1. **Built-in node specs** (paragraph, heading, blockquote, code_block, lists, table, image, etc.)
2. **Custom component node specs** via `getCustomNodeSpecs(components)` (schema.tsx:553)
3. **Custom mark specs** via `getCustomMarkSpecs(components)` (schema.tsx:636)

The function selectively includes node types based on `EditorConfig` flags.

## How Components Become ProseMirror Nodes

`getCustomNodeSpecs()` in `custom-components.tsx:199-701` maps each ContentComponent to a ProseMirror `NodeSpec`:

### Block Components → Atom nodes
```typescript
// custom-components.tsx:213-311
{
  group: `block ${componentNames.get(name)}`,
  defining: true,
  attrs: { props: { default: toSerialized(getInitialPropsValue(schema), schema.fields) } },
  reactNodeView: { component: Block, rendersOwnContent: false },
  parseDOM: [{ tag: `div[data-component="${name}"]`, getAttrs: deserializeProps }],
  toDOM(node) { return ['div', { 'data-component': name, 'data-props': serializeProps(node.attrs.props) }]; },
  insertMenu: { label, command: insertNode, forToolbar: true, description, icon },
}
```
No `content` property → leaf node (no children in ProseMirror).

### Wrapper Components → Container nodes
```typescript
// custom-components.tsx:312-416
{
  group: `block ${componentNames.get(name)}`,
  content: 'block+',   // ← Accepts nested block content
  defining: true,
  attrs: { props: { default: ... } },
  // ... same pattern but toDOM has content hole: ['div', { ... }, 0]
}
```
`content: 'block+'` allows any block-level content as children.

### Inline Components → Inline atom nodes
```typescript
// custom-components.tsx:417-531
{
  group: 'inline',
  inline: true,
  attrs: { props: { default: ... } },
  toDOM: node => ['span', { 'data-component': name, 'data-props': ... }],
  // ...
}
```

### Mark Components → ProseMirror marks
```typescript
// custom-components.tsx:703-763 (getCustomMarkSpecs)
{
  attrs: { props: { default: ... } },
  toDOM(mark) {
    const element = document.createElement(tag);
    element.setAttribute('data-component', name);
    // Apply className and style from component config
    return element;
  },
  parseDOM: [{ tag: `${tag}[data-component="${name}"]`, getAttrs: deserializeProps }],
}
```

### Repeating Components → Constrained containers
```typescript
// custom-components.tsx:532-694
{
  content: `(${component.children.map(x => componentNames.get(x)).join(' | ')}){min,max}`,
  // Uses ProseMirror content expression for child validation
}
```

## Props Storage in ProseMirror

All component props are stored in a single `props` attribute on the ProseMirror node:
```typescript
attrs: {
  props: {
    default: {
      value: { /* serialized field values */ },
      extraFiles: [ { path, parent, contents: Uint8Array } ]
    }
  }
}
```

### Serialization Chain
1. `toSerialized(deserialized, schema)` → `{ value, extraFiles }` (props-serialization.ts:57-75)
2. Stored as `node.attrs.props`
3. `deserializeValue(value, schema)` → `Record<string, unknown>` (props-serialization.ts:77-107)
4. `useDeserializedValue` hook for React memoization (props-serialization.ts:146-149)

## React Node Views

Keystatic uses a custom `reactNodeView` system (not standard ProseMirror NodeView):
```typescript
reactNodeView: {
  component: function Block(props) { /* React component */ },
  rendersOwnContent: false,  // ProseMirror manages content rendering
}
```

The React component receives:
- `node: Node` — the ProseMirror node
- `hasNodeSelection: boolean`
- `isNodeCompletelyWithinSelection: boolean`
- `getPos: () => number | undefined`
- `children: ReactNode` — ProseMirror-rendered content (for wrapper/repeating)

## EditorSchema Type

```typescript
// schema.tsx:529-541
export type EditorSchema = {
  schema: Schema;
  nodes: Partial<{ [_ in keyof typeof nodeSpecs]: NodeType }>;
  marks: Partial<{ [_ in keyof typeof markSpecs]: MarkType }>;
  config: EditorConfig;
  components: Record<string, ContentComponent>;
  insertMenuItems: InsertMenuItem[];
  format: 'mdx' | 'markdoc';
};
```

The `format` field tracks whether the schema was created for MDX or Markdoc serialization.
