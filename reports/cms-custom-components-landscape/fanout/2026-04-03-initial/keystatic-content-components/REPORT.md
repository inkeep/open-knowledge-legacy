# Keystatic Content Components: Deep Technical Analysis

**Date:** 2026-04-03
**Repo:** [Thinkmill/keystatic](https://github.com/Thinkmill/keystatic)
**Primary sources:** `packages/keystatic/src/content-components.ts`, `packages/keystatic/src/form/fields/markdoc/`

---

## Executive Summary

Keystatic implements custom components in its rich text editor through a **five-kind component taxonomy** (`block`, `wrapper`, `inline`, `mark`, `repeating`), each backed by a typed schema that maps directly to ProseMirror node/mark specs. The system supports **dual serialization** to both MDX and Markdoc formats from the same ProseMirror document model, with props stored as serialized JSON in ProseMirror node attributes. Editing UI is **auto-generated from schemas via modal dialogs** by default, with an escape hatch to fully custom `NodeView` components. The architecture is notable for its clean separation between editor representation, serialization format, and frontend rendering.

---

## D1: Content Component Schema Definition

**Confidence: HIGH** | [Evidence: content-components-api.md](evidence/content-components-api.md)

### Five Component Kinds

Keystatic defines content components through factory functions in `content-components.ts`:

| Factory | Kind | ProseMirror Type | Children? | Serialized As |
|---------|------|-----------------|-----------|--------------|
| `block()` | `block` | Node (atom) | No | Self-closing tag |
| `wrapper()` | `wrapper` | Node (`content: 'block+'`) | Yes — rich text | Wrapping tag |
| `inline()` | `inline` | Inline node | No | Inline self-closing |
| `mark()` | `mark` | Mark | Wraps text | Inline wrapping tag |
| `repeating()` | `repeating` | Node (constrained) | Yes — specific types | Wrapping tag |

**Source:** `packages/keystatic/src/content-components.ts:46-209`

### Schema Definition Pattern

Each component defines typed props through a `schema` record using Keystatic's field system:

```typescript
import { block, mark, wrapper, fields } from '@keystatic/core/content-components';

// Block component — no children, just props
const Callout = block({
  label: 'Callout',
  description: 'A highlighted message',
  icon: alertIcon,
  schema: {
    type: fields.select({
      label: 'Type',
      options: [
        { value: 'info', label: 'Info' },
        { value: 'warning', label: 'Warning' },
        { value: 'error', label: 'Error' },
      ],
      defaultValue: 'info',
    }),
  },
});

// Wrapper component — has rich text children
const Note = wrapper({
  label: 'Note',
  schema: {
    variant: fields.select({ /* ... */ }),
  },
});
```

### Available Field Types (ComponentSchema union)

The `ComponentSchema` type (`form/api.tsx:319-327`) is a union of:
- `FormField` — leaf field types: `text`, `select`, `integer`, `number`, `url`, `date`, `datetime`, `checkbox`, `multiselect`, `image`, `file`, `relationship`, `multiRelationship`, `pathReference`, `slug`
- `ObjectField` — nested object with sub-fields
- `ConditionalField` — discriminated union (e.g., checkbox toggles between two field sets)
- `ArrayFieldInComponentSchema` — repeated items with a sub-schema
- `ChildField` — (legacy, from old document editor)

**Source:** `packages/keystatic/src/form/fields/index.ts`, `packages/keystatic/src/form/api.tsx:319-327`

### Architectural Insight

> Keystatic's schema system is **exactly the same API** used for collection/singleton field definitions. Content components reuse the entire form field infrastructure. This means every field type available for top-level content schemas is also available inside component props — including complex types like `array(object({...}))`, `conditional()`, and `relationship()`.

---

## D2: Editing UI in the ProseMirror Editor

**Confidence: HIGH** | [Evidence: editing-ui.md](evidence/editing-ui.md)

### Default Path: Auto-Generated Modal Forms

When a developer does not provide a custom `NodeView`, Keystatic wraps components in a `BlockWrapper` that provides:

1. **Chrome header** — Shows component label, selection indicator, and "Edit" button
2. **Modal dialog** — Opens when "Edit" is clicked; contains auto-generated form fields
3. **FormValue component** — Renders form controls from the component schema, validates on save

```
┌─────────────────────────────────┐
│ ▸ Callout                [Edit] │  ← Chrome header (contentEditable=false)
├─────────────────────────────────┤
│                                 │
│   [Rich text content here]      │  ← ProseMirror-editable content (wrapper only)
│                                 │
└─────────────────────────────────┘
```

Clicking "Edit" opens a dialog that auto-generates form fields from the schema:

```
┌─ Edit Callout ──────────────────┐
│                                 │
│  Type: [Info ▾]                 │  ← Auto-generated from fields.select()
│                                 │
│  [Cancel]            [Done]     │
└─────────────────────────────────┘
```

**Source:** `packages/keystatic/src/form/fields/markdoc/editor/custom-components.tsx:65-197`

### Custom Path: NodeView Override

Developers can provide a `NodeView` component for full control:

```typescript
const CloudImage = block({
  label: 'Cloud Image',
  schema: cloudImageSchema,
  NodeView: CloudImagePreviewForNewEditor,  // Custom React component
  icon: cloudImageToolbarIcon,
  handleFile: handleFile,
});
```

The NodeView receives `{ value, onChange, onRemove, isSelected }` — and for wrapper/repeating kinds, also `children: ReactNode`.

**Source:** `packages/keystatic/src/content-components.ts:63-73`

### Props Update Flow

All edits go through ProseMirror transactions:
1. User edits props in dialog/NodeView
2. `toSerialized(value, schema.fields)` converts to stored format
3. `state.tr.setNodeAttribute(pos, 'props', serialized)` dispatches transaction
4. ProseMirror applies the change, triggers re-render

**Source:** `packages/keystatic/src/form/fields/markdoc/editor/custom-components.tsx:174-190`

### Architectural Insight

> The modal dialog pattern is pragmatic but creates a **context switch** — the user stops editing inline rich text, opens a modal, edits props, then returns. This is the trade-off of storing props as opaque attributes rather than editable content. Keystatic mitigates this with the `NodeView` escape hatch for components that need inline editing (like cloud images).

---

## D3: Serialization — MDX and Markdoc

**Confidence: HIGH** | [Evidence: serialization-formats.md](evidence/serialization-formats.md)

### Dual-Format Design

Keystatic serializes the **same ProseMirror document model** to two formats:

#### Markdoc Format (`.mdoc`)
```markdoc
{% highlight variant="success" %}some text{% /highlight %}

{% with-array array=[] /%}

wertgrfdsc{% inline-thing something="value" /%}sfasdf
```

#### MDX Format (`.mdx`)
```mdx
<Highlight variant="success">something</Highlight>

<Another array={[{"blah":"A"},{"blah":"B"}]} />

wertgrfdsc<InlineThing something="value" />asdfasdf
```

**Sources:**
- Markdoc serializer: `packages/keystatic/src/form/fields/markdoc/editor/markdoc/serialize.ts:258-270`
- MDX serializer: `packages/keystatic/src/form/fields/markdoc/editor/mdx/serialize.ts:264-280`

### Serialization Architecture

```
ProseMirror Document
        │
        ├──► proseMirrorToMarkdoc()  ──► Markdoc AST ──► format() ──► .mdoc text
        │
        └──► proseMirrorToMDXRoot()  ──► MDAST Root  ──► toMarkdown() ──► .mdx text
```

Both serializers follow the same pattern:
1. Walk ProseMirror nodes recursively
2. For each node, check if it's a known component via `schema.components[node.type.name]`
3. Convert props via `internalToSerialized(componentConfig.schema, node.attrs.props, state)`
4. Emit format-specific AST node (Markdoc `Ast.Node('tag', ...)` or MDAST `mdxJsxFlowElement`)

### Props Serialization in Text Formats

| Prop Type | Markdoc | MDX |
|-----------|---------|-----|
| String | `attr="value"` | `attr="value"` |
| Boolean | `attr=true` | `attr` (presence) |
| Number | `attr=42` | `attr={42}` |
| Array/Object | `attr=[...]` | `attr={[...]}` (expression) |

Complex values in MDX use `mdxJsxAttributeValueExpression` with JSON.stringify.

### File Reference Handling

During serialization, binary file data (images, etc.) is extracted from the ProseMirror document and collected into:
- `extraFiles: Map<string, Uint8Array>` — files at document root
- `otherFiles: Map<string, Map<string, Uint8Array>>` — files in named directories

These are returned alongside the text content and saved to the filesystem by Keystatic.

**Source:** `packages/keystatic/src/form/fields/markdoc/editor/props-serialization.ts:109-144`

### Roundtrip Evidence

From test `mdx.test.tsx:455-485`:
```
Input:  <Another array={[{blah:'A'},{blah:'B'}]} />
Output: <Another array={[{"blah":"A"},{"blah":"B"}]} />
```

From test `markdoc.test.tsx:477-506`:
```
Input:  wertgrfdsc{% inline-thing something="adkjsakjndnajksdnjk" /%}sfasdf
Output: wertgrfdsc{% inline-thing something="adkjsakjndnajksdnjk" /%}sfasdf
```

### Architectural Insight

> The dual-format approach is powerful: the same component definitions work with both Markdoc and MDX, with the format choice made at the field level, not the component level. This decouples component semantics from serialization syntax. However, it means every component must be serializable to **both** formats — complex nested structures are limited to what both formats can represent.

---

## D4: Nested Rich Text

**Confidence: HIGH** | [Evidence: prosemirror-integration.md](evidence/prosemirror-integration.md)

### Wrapper Components Enable Nested Rich Text

The `wrapper()` component kind creates a ProseMirror node with `content: 'block+'`, meaning it can contain any block-level content (paragraphs, headings, lists, other components, etc.):

```typescript
// custom-components.tsx:317-318
content: 'block+',  // Accepts any block content as children
defining: true,
```

In the editor, wrapper components render their ProseMirror-managed children via `props.children`:
```tsx
<BlockWrapper ...>
  {'ContentView' in component && component.ContentView ? (
    <component.ContentView value={value}>
      {props.children}  // ← ProseMirror renders this
    </component.ContentView>
  ) : (
    props.children
  )}
</BlockWrapper>
```

### Repeating Components Enable Constrained Children

The `repeating()` kind uses ProseMirror's content expression syntax for validation:

```typescript
// custom-components.tsx:541-547
content: `(${component.children.map(x => componentNames.get(x)).join(' | ')}){min,max}`,
```

This generates expressions like `(component0 | component1){1,5}` — only allowing specific component types as children, with count constraints.

### Recursive Nesting

Since wrapper components accept `block+` content, and components are part of the `block` group, **wrappers can nest inside other wrappers**. There is no explicit depth limit in the schema — ProseMirror's content model handles the recursion.

### Data Structure

Nested content is stored as ProseMirror child nodes, not as props. The serialized form preserves the tree structure:

```markdoc
{% note variant="info" %}

Some paragraph text.

{% callout type="warning" %}
Nested component with its own content.
{% /callout %}

{% /note %}
```

### Architectural Insight

> The wrapper/block split is a clean solution: `block` components are leaf nodes with only prop-based data, while `wrapper` components delegate content management to ProseMirror. This means nested rich text gets full ProseMirror editing behavior (cursor navigation, selection, formatting) for free. The trade-off is that content is **always block-level** — there's no way to have a wrapper component that only accepts inline content.

---

## D5: Frontend Rendering

**Confidence: HIGH** | [Evidence: frontend-rendering.md](evidence/frontend-rendering.md)

### Reader API Pattern

```typescript
import { createReader } from '@keystatic/core/reader';
const reader = createReader('./', keystatic);

const post = await reader.collections.posts.read('my-post');
const content = await post.content();
// Markdoc: { node: MarkdocNode }
// MDX: string
```

Content fields are **lazy-loaded async functions** — the content is only parsed when `content()` is called.

**Source:** `packages/keystatic/src/form/api.tsx:564-568`, `packages/keystatic/src/reader/generic.ts:97-189`

### Markdoc Rendering Pipeline

1. **`createMarkdocConfig()`** generates a Markdoc `Config` object from the same component definitions used in the editor
2. Content components become Markdoc **tags** with `render` pointing to React component names
3. Standard Markdoc `transform()` → `renderers.react()` pipeline produces React output

```typescript
import { createMarkdocConfig } from '@keystatic/core/reader/markdoc';

const config = createMarkdocConfig({
  components: { Callout, Note },
  render: {
    tags: { Callout: 'Callout', Note: 'Note' },
  },
});

const ast = Markdoc.parse(markdocText);
const tree = Markdoc.transform(ast, config);
return Markdoc.renderers.react(tree, React, {
  components: { Callout: CalloutComponent, Note: NoteComponent },
});
```

**Source:** `packages/keystatic/src/form/fields/markdoc/markdoc-config.ts:85-168`

### MDX Rendering Pipeline

For MDX, the reader returns the raw MDX string, and rendering uses standard MDX tooling:

```typescript
const mdxString = await post.content();
// Process with @mdx-js/mdx or next-mdx-remote
// Component mapping done at MDX runtime level
```

### Field-to-Attribute Type Mapping

`getTypeForField()` (`markdoc-config.ts:6-72`) maps Keystatic field types to Markdoc attribute schemas for validation:

| Keystatic Field | Markdoc Attribute Type |
|----------------|----------------------|
| `fields.select()` | `{ type: String, matches: [...values] }` |
| `fields.text()` | `{ type: String }` |
| `fields.integer()` | `{ type: Number }` |
| `fields.checkbox()` | `{ type: Boolean }` |
| `fields.array()` | `{ type: Array }` |
| `fields.object()` | `{ type: Object }` |

### Architectural Insight

> Keystatic's rendering approach is **format-native**: Markdoc content is rendered through Markdoc's own rendering pipeline, and MDX content through MDX compilers. The `createMarkdocConfig()` function bridges Keystatic's component definitions to Markdoc's schema system, but does not create a proprietary rendering layer. This is both a strength (leverages mature ecosystems) and a constraint (rendering capabilities are limited to what Markdoc/MDX support).

---

## D6: ProseMirror Integration Architecture

**Confidence: HIGH** | [Evidence: prosemirror-integration.md](evidence/prosemirror-integration.md)

### Dynamic Schema Construction

`createEditorSchema()` (`schema.tsx:543-705`) builds the ProseMirror schema dynamically:

1. Start with base nodes (`doc`, `paragraph`, `text`, `hard_break`)
2. Conditionally add feature nodes (`heading`, `blockquote`, `code_block`, lists, `table`, `image`) based on `EditorConfig`
3. Merge custom component nodes via `getCustomNodeSpecs(components)`
4. Merge custom mark specs via `getCustomMarkSpecs(components)`
5. Construct ProseMirror `Schema` from the combined spec

The schema also tracks:
- Format: `'mdx' | 'markdoc'` — affects serialization
- Components map — for serializer to look up component configs
- Insert menu items — collected from all node specs

**Source:** `packages/keystatic/src/form/fields/markdoc/editor/schema.tsx:543-705`

### Component Group Names

Each component gets a unique group name (`component0`, `component1`, etc.) for ProseMirror content expressions:

```typescript
// custom-components.tsx:202-204
const componentNames = new Map(
  Object.keys(components).map((name, i) => [name, `component${i}`])
);
```

Block/wrapper/repeating components are added to the `block` group (unless `forSpecificLocations` is set):
```typescript
group: `block ${componentNames.get(name)}`,  // Both "block" and unique name
```

### DOM Serialization for ProseMirror

ProseMirror's internal HTML serialization (used for clipboard, etc.) uses `data-component` and `data-props` attributes:

```html
<!-- Block component -->
<div data-component="Callout" data-props='{"value":{"type":"info"},"extraFiles":[]}'>
</div>

<!-- Wrapper component -->
<div data-component="Note" data-props='{"value":{"variant":"info"},"extraFiles":[]}'>
  <p>Child content here</p>
</div>

<!-- Inline component -->
<span data-component="InlineThing" data-props='{"value":{"something":"text"},"extraFiles":[]}'>
</span>
```

**Source:** `packages/keystatic/src/form/fields/markdoc/editor/custom-components.tsx:293-301, 391-399`

### React Node View System

Keystatic extends ProseMirror with a custom React node view system:

```typescript
reactNodeView: {
  component: function Block(props) { /* React component */ },
  rendersOwnContent: false,  // ProseMirror handles content rendering
}
```

When `rendersOwnContent: false`, ProseMirror manages the content DOM (the `0` hole in `toDOM`), and the React component receives `props.children` containing the ProseMirror-rendered content. This is how wrapper components get editable rich text children inside React-rendered chrome.

### Architectural Insight

> The key architectural decision is **ProseMirror-first**: content components are native ProseMirror nodes/marks, not bolted-on decorations. This means they participate fully in ProseMirror's document model — selection, undo/redo, collaborative editing (via Yjs), and content validation all work naturally. The cost is complexity in the translation layer between ProseMirror and text formats (MDX/Markdoc), but the benefit is a robust editing experience.

---

## Cross-Cutting Findings

### 1. Schema Reuse

Keystatic's content component schema system is **the same API** as its top-level collection/singleton fields. The `ComponentSchema` type, field validators, serializers, and form generators are all shared. This is an elegant design that avoids parallel implementations.

### 2. Props as Opaque Attributes

Component props are stored as a single opaque `props` attribute on ProseMirror nodes, containing `{ value, extraFiles }`. This simplifies the ProseMirror schema (one attr per component) but means props cannot be individually indexed or queried within the document — they're all-or-nothing.

### 3. Format Independence

The same component definitions work with both MDX and Markdoc. The format choice is made at the field level (`fields.markdoc()` vs `fields.mdx()`), not at the component level. This enables projects to switch formats without redefining components.

### 4. Five-Kind Taxonomy

The five kinds (block, wrapper, inline, mark, repeating) map cleanly to ProseMirror concepts (atom node, container node, inline node, mark, constrained container). This taxonomy covers most real-world use cases, though it doesn't support:
- Inline elements with children (inline wrappers)
- Mixed block+inline content inside a component
- Components that accept only specific inline content

### 5. Y.js Collaboration Support

The editor supports real-time collaboration via Y.js:
```typescript
collaboration: {
  toYjs(value) { return prosemirrorToYXmlFragment(value.doc); },
  fromYjs(yjsValue, awareness) { return createEditorStateFromYJS(getSchema(), yjsValue, awareness); },
}
```
**Source:** `packages/keystatic/src/form/fields/markdoc/index.tsx:116-127`

---

## Implications for Editor Architecture

### What Keystatic Gets Right

1. **Component kind taxonomy** — The five kinds provide a clear, non-overlapping classification that maps well to editing and serialization needs
2. **Schema-driven UI generation** — Auto-generating edit forms from field schemas reduces boilerplate significantly
3. **ProseMirror-native integration** — Components are first-class ProseMirror citizens, not decorations
4. **Dual-format serialization** — Same components, multiple output formats
5. **NodeView escape hatch** — Default auto-generated UI with full custom override capability

### What Could Be Improved

1. **Modal editing as default** — The context switch to a modal dialog for editing component props is disruptive; inline editing would be better for simple props
2. **Block-only children** — Wrapper components always accept `block+`; there's no way to constrain to inline-only or specific block types (only repeating does constrained children)
3. **No prop-level reactivity in serialization** — Props are serialized as a blob; changing one prop requires re-serializing the entire component
4. **Limited mark capabilities** — Marks support `className` and `style` but not arbitrary children or complex rendering

### Key Pattern: Schema → Node Spec → Serializer → Renderer

The central pattern is a four-stage pipeline:
1. **Schema definition** (developer-facing API: `block()`, `wrapper()`, etc.)
2. **ProseMirror node spec generation** (`getCustomNodeSpecs()` — automatic)
3. **Format serialization** (`proseMirrorToMarkdoc()` / `proseMirrorToMDXRoot()` — automatic)
4. **Frontend rendering** (`createMarkdocConfig()` / MDX compilation — developer provides components)

Steps 2-3 are fully automatic given the schema definition. Step 4 requires the developer to provide React rendering components, but the wiring (Markdoc tags/MDX components) is automated.
