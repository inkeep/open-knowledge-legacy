# E2: Atom Node Support & Custom mdast Type Analysis

**Source:** Source code analysis of `mdast-util-to-prosemirror.ts` and `mdast-util-from-prosemirror.ts`

## How Atom Nodes Work (toProseMirror Direction)

### The `toPmNode` helper and atom nodes

`toPmNode` calls `nodeType.createAndFill(attrs, children)` where `children = state.all(node)`.

For atom nodes (e.g., `horizontal_rule`, `image`):
- `state.all(node)` returns `[]` (no children in mdast)
- `createAndFill(attrs, [])` succeeds for atom nodes — ProseMirror allows empty content for atoms

### Custom handler approach for atoms (recommended)

```typescript
// Wiki-link atom example
handlers: {
  wikiLink(node, _, state) {
    // node is the custom mdast wikiLink node from remark-wiki-link
    return schema.nodes.wikiLink.create({
      target: node.data?.alias ?? node.value,
      href: node.data?.permalink,
    });
    // No state.all() needed — atom has no children
  }
}
```

### toPmNode works for simple atoms too

```typescript
// Simpler approach — toPmNode works if the node has no children
handlers: {
  thematicBreak: toPmNode(schema.nodes.horizontal_rule),
  image: toPmNode(schema.nodes.image, (node) => ({
    src: node.url,
    alt: node.alt,
    title: node.title,
  })),
}
```

### Key insight: `createAndFill` vs `create`

- `toPmNode` uses `createAndFill()`, which returns `null` if the content doesn't match the schema
- For atom nodes, `createAndFill({}, [])` always succeeds because atoms have no content expression
- For non-atom nodes that require children, `createAndFill` auto-fills with required defaults

## Custom mdast Types (Beyond Standard mdast)

### Type constraint on handlers map

The `MdastHandlers` type is:
```typescript
type MdastHandlers = {
  [Type in MdastNodes["type"]]?: MdastNodeHandler<Type>;
};
```

Where `MdastNodes["type"]` is the union of standard mdast types:
```
"root" | "blockquote" | "break" | "code" | "definition" | "delete" |
"emphasis" | "footnoteDefinition" | "footnoteReference" | "heading" |
"html" | "image" | "imageReference" | "inlineCode" | "link" |
"linkReference" | "list" | "listItem" | "paragraph" | "strong" |
"table" | "tableCell" | "tableRow" | "text" | "thematicBreak" | "yaml"
```

### The dispatch mechanism (zwitch)

```typescript
const zwitcher = zwitch("type", {
  invalid,
  unknown,        // ← THROWS for unknown types
  handlers: {
    ...builtins,
    ...handlers,  // ← user handlers spread over builtins
  }
});
```

`zwitch` dispatches on `node.type`. If no handler exists for a type, it calls the `unknown` function which **throws**.

### Custom types: TypeScript will reject, but runtime works

**TypeScript-level:** The handler map keys are constrained to `MdastNodes["type"]`. Custom types like `mdxJsxFlowElement` or `wikiLink` are not in the union — the compiler will reject them.

**Runtime-level:** The `...handlers` spread just adds keys to a plain object passed to `zwitch`. Any string key will work.

### Workarounds for custom types

**Option A: Type assertion (minimal)**
```typescript
handlers: {
  ...(myCustomHandlers as any),
}
```

**Option B: Module augmentation (correct)**
```typescript
// Augment the mdast type definitions
declare module 'mdast' {
  interface RootContentMap {
    mdxJsxFlowElement: MdxJsxFlowElement;
    wikiLink: WikiLink;
  }
}
// Now MdastNodes["type"] includes "mdxJsxFlowElement" | "wikiLink"
// Handler map accepts these keys without assertion
```

**Option C: Use `toProseMirror` directly (bypass remark plugin)**
```typescript
import { toProseMirror } from "@handlewithcare/remark-prosemirror";
// Same type constraint exists on Options.handlers
```

### Verification: Module augmentation is the ecosystem pattern

remark-mdx already augments `mdast`:
```typescript
// From @types/mdast or mdast-util-mdx:
declare module 'mdast' {
  interface RootContentMap {
    mdxJsxFlowElement: MdxJsxFlowElement;
    mdxJsxTextElement: MdxJsxTextElement;
    mdxFlowExpression: MdxFlowExpression;
    mdxTextExpression: MdxTextExpression;
    mdxjsEsm: MdxjsEsm;
  }
}
```

This means: **once `mdast-util-mdx-jsx` types are imported, the handler map naturally accepts `mdxJsxFlowElement` as a key.**

## From-ProseMirror Direction (Custom Nodes)

### Node handler registration

```typescript
type PmNodeHandlers<PmNodes extends string> = Partial<Record<PmNodes, PmNodeHandler>>;
```

`PmNodes` comes from your `Schema<PmNodes, PmMarks>` — any node name in your schema is a valid key. No restrictions on custom types.

### Atom nodes in fromProseMirror

For atom nodes, `state.all(pmNode)` returns `[]` (no children). The handler receives the PmNode and can read its attrs:

```typescript
nodeHandlers: {
  wikiLink: (node, _, state) => ({
    type: "wikiLink" as any,  // or with module augmentation
    value: node.attrs.target,
    data: { permalink: node.attrs.href },
  }),
}
```

### Nodes with no handler → silent null

Unlike toProseMirror (which throws), fromProseMirror returns `null` for nodes without handlers. These are silently dropped from the mdast output.
