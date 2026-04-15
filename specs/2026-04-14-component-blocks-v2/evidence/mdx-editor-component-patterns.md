---
title: "Registered vs Unregistered Component Boundary in Production MDX/Block Editors"
description: "Source-code investigation of how five production editors (MDXEditor, TinaCMS, Sanity, BlockNote, Plate) represent JSX/custom components in their document model. Focuses on the schema-level distinction between registered and unregistered components: one type vs many, children editability, serialization strategy, and unknown-component handling."
createdAt: 2026-04-14
updatedAt: 2026-04-14
confidence: CONFIRMED (source-level for D1-D3), CONFIRMED (source-level for D4-D5)
sources:
  - https://github.com/mdx-editor/editor (commit read: HEAD, shallow clone 2026-04-14)
  - https://github.com/tinacms/tinacms (local clone at ~/.claude/oss-repos/tinacms)
  - https://github.com/sanity-io/sanity (local clone at ~/.claude/oss-repos/sanity)
  - https://github.com/TypeCellOS/BlockNote (commit read: HEAD, shallow clone 2026-04-14)
  - https://github.com/udecode/plate (local clone at ~/.claude/oss-repos/plate)
---

# Registered vs Unregistered Component Boundary in Production Editors

## Primary Question

When a WYSIWYG editor encounters JSX/custom block components, does it use a single document-model node type for all components (with registration as a runtime property), or distinct node types (with registration as a type-level distinction)? What happens to unrecognized components?

---

## D1: MDXEditor (Lexical-based)

### Schema choice: ONE node type for all JSX

MDXEditor uses a single Lexical `DecoratorNode` subclass (`LexicalJsxNode`) for every JSX element, regardless of registration status. The node type is always `'jsx'`.

**Evidence:** `src/plugins/jsx/LexicalJsxNode.tsx:33-35`
```typescript
static getType(): string {
  return 'jsx'
}
```

All JSX flow and text elements produce the same Lexical node type. The node carries the full mdast JSX node (`__mdastNode: MdastJsx`) as structured data.

### Registration is a runtime lookup, not a type distinction

At render time, `JsxEditorContainer` looks up the component name against the descriptor array. It supports a wildcard `'*'` descriptor as a catch-all:

**Evidence:** `src/plugins/jsx/LexicalJsxNode.tsx:117-119`
```typescript
const descriptor =
  jsxComponentDescriptors.find((descriptor) => descriptor.name === mdastNode.name) ??
  jsxComponentDescriptors.find((descriptor) => descriptor.name === '*')
```

If no descriptor matches AND no wildcard exists, it **throws**:
```typescript
if (!descriptor) {
  throw new Error(`No JSX descriptor found for ${mdastNode.name}`)
}
```

**Implication:** Registration is runtime dispatch. The wildcard `'*'` pattern means the developer can handle all unregistered components with a single fallback editor. Without a wildcard, unregistered components crash the editor.

### Children editability: controlled by descriptor, not node type

The `JsxComponentDescriptor.hasChildren` boolean controls whether children are rendered. When `true`, `GenericJsxEditor` renders a `NestedLexicalEditor` -- a fully independent nested Lexical editor instance that round-trips its content through the mdast tree.

**Evidence:** `src/jsx-editors/GenericJsxEditor.tsx:126-135`
```typescript
{descriptor.hasChildren ? (
  <NestedLexicalEditor<MdxJsxTextElement | MdxJsxFlowElement>
    block={descriptor.kind === 'flow'}
    getContent={(node) => node.children as PhrasingContent[]}
    getUpdatedMdastNode={(mdastNode, children) => {
      return { ...mdastNode, children } as any
    }}
  />
) : (
  <span className={styles.genericComponentName}>{mdastNode.name}</span>
)}
```

The nested editor creates a child Lexical instance with its own state, synced back to the parent on blur via mdast export.

### Serialization: structured reconstruction, always

On export, `LexicalJsxVisitor` converts the `LexicalJsxNode` back to an mdast `MdxJsxFlowElement`/`MdxJsxTextElement`. The serialization path is:

Lexical node -> mdast JSX node (from `__mdastNode`) -> `mdast-util-to-markdown` with `mdxToMarkdown()`

Import statements are reconstructed from the descriptor registry during export (`exportMarkdownFromLexical.ts:214-218`). The export visitor also uses the wildcard `'*'` descriptor for import resolution.

**No sourceRaw preservation.** The mdast node is the intermediate representation; serialization always reconstructs from structured state.

---

## D2: TinaCMS (Plate/Slate-based)

### Schema choice: ONE Slate node type per JSX kind, plus fallback types

TinaCMS uses `mdxJsxFlowElement` for block MDX and `mdxJsxTextElement` for inline MDX. Both are **void nodes** -- `children: [EmptyTextElement]`.

**Evidence:** `packages/@tinacms/mdx/src/parse/plate.ts:112-117`
```typescript
export type MdxBlockElement = {
  type: 'mdxJsxFlowElement';
  name: string | null;
  props: Record<string, unknown>;
  children: [EmptyTextElement];
};
```

### Template matching determines registration at parse time

During mdast-to-Plate conversion, each JSX node is matched against `field.templates` by name:

**Evidence:** `packages/@tinacms/mdx/src/parse/mdx.ts:40-55`
```typescript
const template = field.templates?.find((template) => {
  const templateName = typeof template === 'string' ? template : template.name;
  return templateName === node.name;
});
if (!template) {
  const string = toTinaMarkdown({ type: 'root', children: [node] }, field);
  return {
    type: node.type === 'mdxJsxFlowElement' ? 'html' : 'html_inline',
    value: string.trim(),
    children: [{ type: 'text', text: '' }],
  };
}
```

**Critical finding:** When no template matches, the JSX is re-serialized to its markdown string form and stored as an `html` (block) or `html_inline` (inline) void node. This is a **type-level demotion** -- the unregistered JSX becomes a different Slate node type (`html` vs `mdxJsxFlowElement`).

### Children: NOT editable inline

Both `MdxBlockElement` and `MdxInlineElement` have `children: [EmptyTextElement]` -- they are void nodes. Rich-text children of registered components are parsed recursively into the `props.children` field (a nested Plate document), but the parent node itself is not editable inline. Editing happens in side panels.

### Serialization: structured reconstruction for registered, source preservation for `invalid_markdown`

For registered components, `serializeMDX()` converts Plate nodes back to mdast then to markdown. For `invalid_markdown` nodes, it returns the raw `.value` string:

**Evidence:** `packages/@tinacms/mdx/src/stringify/index.ts:53-55`
```typescript
if (value?.children[0]?.type === 'invalid_markdown') {
  return value.children[0].value;
}
```

The `invalid_markdown` type is the catch-all for any parse failure -- it stores the original source verbatim and renders an error UI with a "Switch to raw-mode" button.

**Evidence:** `packages/tinacms/src/toolkit/fields/plugins/mdx-field-plugin/plate/plugins/create-invalid-markdown-plugin/index.tsx:8-18` -- registered as a void, non-inline Plate plugin.

### Summary for TinaCMS

Registration IS a type-level distinction:
- Registered JSX -> `mdxJsxFlowElement` (void, props extracted, structured serialization)
- Unregistered JSX -> `html` (void, source string preserved, opaque)
- Parse failure -> `invalid_markdown` (void, source string preserved, error UI)

---

## D3: Sanity Studio (Portable Text)

### Schema choice: many types, registration is schema-level

Sanity's Portable Text uses a typed `_type` discriminator on every block. Custom block types are declared in the schema's `of` array for the `array` field containing `block` type:

```javascript
defineField({
  name: 'content',
  type: 'array',
  of: [
    { type: 'block' },       // standard text blocks
    { type: 'image' },       // registered custom block
    { type: 'callout' },     // registered custom block
  ]
})
```

Each custom type is a separate schema type definition. There is no generic "custom block" node -- each is its own type.

### Unknown type handling: validation error, not crash

When a document contains a block whose `_type` is not in the schema's `of` array, Sanity shows an `InvalidValue` component with an error message and options to resolve (remove the block) or ignore.

**Evidence:** `packages/sanity/src/core/form/inputs/PortableText/InvalidValue.tsx` -- renders an Alert with the invalid block's JSON, a "Remove the block" action, and an "Ignore" button.

**Evidence:** `packages/sanity/src/core/i18n/bundles/studio.ts:1047-1048`
```
'inputs.portable-text.invalid-value.disallowed-type.action': 'Remove the block',
```

The i18n strings explicitly name the case: "child with key `{{key}}` has a type (`{{typeName}}`) that is not an allowed block type for this field."

### Children: per-type schema definition

Each custom block type defines its own fields in the schema. Rich text nesting is achieved by including `type: 'block'` in a nested array field. Sanity supports recursive block composition but not inline editing of custom block children within the flow.

### Serialization: Portable Text JSON (structured, always)

Portable Text is a JSON array of typed objects. There is no markdown serialization -- the JSON IS the canonical format. Custom block types serialize their fields as JSON object attributes. No source preservation concept exists.

### Summary for Sanity

Registration is a **schema-level** (compile-time) distinction. Each custom block type is a distinct schema type. Unknown types produce validation errors with explicit repair actions. No fallback rendering -- the editor shows an error card.

---

## D4: BlockNote (TipTap/ProseMirror-based)

### Schema choice: many ProseMirror node types, one per custom block

BlockNote uses `BlockNoteSchema.create({ blockSpecs: { ... } })` where each custom block is a named spec with its own ProseMirror node type. The `blockSpecs` object is a map from type name to block spec.

**Evidence:** `packages/core/src/blocks/BlockNoteSchema.ts:24-58` -- `BlockNoteSchema.create()` takes `blockSpecs`, `inlineContentSpecs`, and `styleSpecs`, each as a typed record.

Each block spec defines its `propSchema` and `content` type (`'inline' | 'none' | 'table'`):

**Evidence:** `packages/core/src/schema/blocks/types.ts:67-87`
```typescript
export interface BlockConfig<T extends string, PS extends PropSchema, C extends "inline" | "none" | "table"> {
  type: T;
  readonly propSchema: PS;
  content: C;
}
```

### Unknown type handling: throws at runtime

When a ProseMirror node has a type not matching any registered block spec, the conversion throws:

**Evidence:** `packages/core/src/api/nodeConversions/nodeToBlock.ts:425`
```
throw Error("Block is of an unrecognized type: " + blockInfo.blockNoteType);
```

Similarly for inline content (`nodeToBlock.ts:181,356`):
```
console.warn("unrecognized inline content type", node.type.name);
throw Error("ic node is of an unrecognized type: " + node.type.name);
```

**No fallback rendering.** No opaque node. No error UI. Unrecognized types crash the block conversion.

### Children: determined by block config `content` field

A block's `content` field determines whether it has editable inline content (`'inline'`), no content (`'none'` -- void), or table content (`'table'`). This is set at block spec registration time and becomes part of the ProseMirror schema.

### Serialization: structured, always

BlockNote exports to its own JSON format, HTML, and markdown. All paths reconstruct from the ProseMirror document tree. No source preservation.

### Summary for BlockNote

Registration is a **type-level** distinction (each block spec becomes a ProseMirror node type). Unknown types crash. No fallback. No opaque node.

---

## D5: Plate (Slate-based)

### Schema choice: each plugin defines its own element type

Plate follows Slate's model: each plugin registers for a `type` string. The plugin's `node.component` renders elements matching that type.

**Evidence:** `packages/core/src/lib/plugin/BasePlugin.ts:547`
```
@default DefaultElement for elements, DefaultLeaf for leaves
```

### Unknown type handling: graceful fallback to DefaultElement

When `pipeRenderElement` encounters an element whose `type` doesn't match any plugin with `isElement: true`, it falls through to a `renderElement` prop (if provided) or renders a generic `PlateElement` (which wraps Slate's `DefaultElement`):

**Evidence:** `packages/core/src/react/utils/pipeRenderElement.tsx:24-56`
```typescript
const plugin = getPluginByType(editor, props.element.type);
if (plugin?.node.isElement) {
  return pluginRenderElement(editor, plugin)({ ...props, path });
}
if (renderElementProp) {
  return renderElementProp({ ...props, path });
}
// Falls through to generic PlateElement
return (
  <ElementProvider ...>
    <PlateElement {...ctxProps}>{props.children}<BelowRootNodes /></PlateElement>
  </ElementProvider>
);
```

**Implication:** Unknown element types do not crash. They render as generic block-level elements with their children visible. The data survives round-trip through Slate's JSON model. This is the most permissive fallback of any editor surveyed.

### Children: always present (Slate model)

In Slate, every element has `children`. There is no void concept at the type level -- void is a per-plugin runtime property (`isVoid: true`). An unknown element type inherits Slate's default behavior: children are rendered as editable content.

### Serialization: plugin-driven

Each plugin provides its own serialization handler. Unknown types with no plugin pass through as-is in Slate JSON (the canonical format). Markdown/HTML serialization requires per-type handlers; missing handlers typically drop the content or emit a generic block.

### Summary for Plate

Registration is a **runtime** distinction (plugin lookup at render time). Unknown types get a graceful `DefaultElement` fallback -- no crash, content preserved, children editable. Closest to "registration is a runtime property" of all surveyed editors.

---

## Cross-Cutting Synthesis

### The spectrum

| Editor | Registration level | Unknown handling | Children model |
|---|---|---|---|
| MDXEditor | Runtime (descriptor lookup, wildcard fallback) | Throws without wildcard; wildcard = editable | Per-descriptor `hasChildren` flag |
| TinaCMS | Parse-time type demotion | Demotes to `html` void (source preserved) | Always void (props panel editing) |
| Sanity | Schema-level (distinct types) | Validation error + remove action | Per-type schema field |
| BlockNote | Schema-level (distinct PM node types) | Throws at conversion | Per-spec `content` field |
| Plate | Runtime (plugin lookup) | Graceful `DefaultElement` fallback | Always has children (Slate model) |

### Convergent pattern: registration affects serialization, not just rendering

Across all five editors, the registered/unregistered boundary determines the **serialization strategy**, not just the rendering:
- Registered components serialize from structured state (props, children extracted and reconstructed)
- Unregistered components either crash, get demoted to an opaque source-preserving type, or fall through to a generic handler

TinaCMS is the clearest example: registered JSX -> `mdxJsxFlowElement` (structured serialization), unregistered -> `html` (source string serialization). This is a two-type model at the document level.

### No editor uses one type with a runtime "registered" flag

None of the five editors use a single node type where registration is merely a boolean attribute that controls rendering/serialization behavior at runtime. The closest is MDXEditor, which uses one Lexical node type (`jsx`) but resolves registration via descriptor lookup -- and the descriptor controls children, props UI, and serialization import handling. Without a wildcard descriptor, unregistered components crash.

### The wildcard pattern (MDXEditor) vs the demotion pattern (TinaCMS)

Two viable strategies emerge for handling unregistered components within a single-type-for-all-JSX model:

1. **Wildcard descriptor** (MDXEditor): One node type, catch-all editor for unknowns. Pro: simpler schema. Con: the wildcard editor must handle arbitrary content generically; serialization reconstructs from structured state (may lose source fidelity for complex expressions).

2. **Type demotion** (TinaCMS): Unregistered JSX is re-serialized and stored as a different node type (`html`) that preserves the source string. Pro: byte-identical source preservation. Con: two node types in the document model; the demoted node loses structured editing.
