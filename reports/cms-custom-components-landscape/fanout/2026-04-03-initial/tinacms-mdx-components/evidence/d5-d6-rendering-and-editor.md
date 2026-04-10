---
dimension: D5, D6
title: TinaCMS Frontend Rendering (TinaMarkdown) and Editor Architecture (Plate.js)
sources:
  - path: packages/tinacms/src/rich-text/index.tsx
    lines: "7-120"
    description: TinaMarkdown component, Components type, BaseComponents, rendering logic
  - path: packages/tinacms/src/toolkit/fields/plugins/mdx-field-plugin/plate/index.tsx
    lines: "10, 57"
    description: Plate.js import and editor initialization
  - path: packages/tinacms/src/toolkit/fields/plugins/mdx-field-plugin/plate/plugins/create-mdx-plugins/index.tsx
    lines: "11-44"
    description: MDX Plate plugins — ELEMENT_MDX_INLINE, ELEMENT_MDX_BLOCK, void node config
  - path: packages/tinacms/src/toolkit/fields/plugins/mdx-field-plugin/plate/plugins/create-mdx-plugins/component.tsx
    lines: "42-169"
    description: InlineEmbed and BlockEmbed editor components for MDX nodes
  - path: packages/tinacms/src/toolkit/fields/plugins/mdx-field-plugin/plate/nested-form.tsx
    lines: "7-39"
    description: NestedForm — creates Form from template fields, renders via FormPortal
---

## D5: Frontend Rendering

### TinaMarkdown Component (rich-text/index.tsx:91-120)

```typescript
export const TinaMarkdown = <CustomComponents extends { [key: string]: object } = any>({
  content,
  components = {},
}: {
  content: TinaMarkdownContent | TinaMarkdownContent[];
  components?: Components<{}> | Components<{...}>;
}) => {
  const nodes = Array.isArray(content) ? content : content.children;
  return (
    <>
      {nodes.map((child, index) => (
        <MemoNode components={components} key={index} child={child} />
      ))}
    </>
  );
};
```

### Custom Component Dispatch

MDX components are dispatched by name (from Node rendering code):
```typescript
case 'mdxJsxTextElement':
case 'mdxJsxFlowElement':
  const Component = components[child.name];
  if (Component) {
    const props = child.props ? child.props : {};
    return <Component {...props} />;
  }
```

### Component Type System (rich-text/index.tsx:82-84)

```typescript
export type Components<ComponentAndProps extends object> = {
  [K in keyof ComponentAndProps]: (props: ComponentAndProps[K]) => JSX.Element;
} & BaseComponentSignature;
```

BaseComponents covers all standard elements (h1-h6, p, a, img, blockquote, code_block, table, etc.).

## D6: Editor Architecture

### Framework: Plate.js (built on Slate)

Editor initialization via `@udecode/plate/react`:
```typescript
import { Plate } from '@udecode/plate/react';
import { useCreateEditor } from './hooks/use-create-editor';
```

### MDX Node Types as Plate Plugins (create-mdx-plugins/index.tsx:11-44)

```typescript
export const ELEMENT_MDX_INLINE = 'mdxJsxTextElement';
export const ELEMENT_MDX_BLOCK = 'mdxJsxFlowElement';

export const createMdxInlinePlugin = createPlatePlugin({
  key: ELEMENT_MDX_INLINE,
  node: { isElement: true, isVoid: true, isInline: true,
    component: (props) => <Embed {...props} inline={true} />,
  },
});

export const createMdxBlockPlugin = createPlatePlugin({
  key: ELEMENT_MDX_BLOCK,
  node: { isElement: true, isVoid: true,
    component: (props) => <Embed {...props} inline={false} />,
  },
});
```

Both are **void nodes** — their content is managed through props, not Slate children.

### Prop Editing via NestedForm (nested-form.tsx:7-39)

When a user clicks an MDX component:
1. `Embed` component dispatches field focus event
2. `EmbedNestedForm` renders with template fields
3. `NestedForm` creates a `Form` instance from template fields
4. `FormBuilder` renders field plugins in a portal overlay
5. `onChange` calls `editor.tf.setNodes({ props: values })` to update the Plate node
