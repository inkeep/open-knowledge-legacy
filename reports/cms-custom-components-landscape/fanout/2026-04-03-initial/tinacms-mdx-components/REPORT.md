# TinaCMS MDX Component Registration System

**System:** TinaCMS (open-source, Git-backed headless CMS)
**Repo:** [tinacms/tinacms](https://github.com/tinacms/tinacms) — `packages/@tinacms/schema-tools`, `packages/@tinacms/mdx`, `packages/tinacms`
**Date:** 2026-04-03
**Confidence:** High — all findings sourced from primary codebase inspection

---

## Executive Summary

TinaCMS implements a **template-driven** system for registering custom MDX components in its rich text editor. Developers define component schemas as `Template` objects with typed `fields` arrays; TinaCMS auto-generates editing UI, serializes to/from MDX, and renders on the frontend — all from a single schema definition. The editor is built on **Plate.js** (Slate wrapper), with MDX components represented as **void nodes** whose props are edited via modal form panels. Rich text can be nested recursively inside component props, enabling arbitrary composition depth.

### Key Architectural Patterns for Editor Design

| Pattern | TinaCMS Implementation | Transferable Insight |
|---------|----------------------|---------------------|
| Schema-driven UI | `Template.fields` → auto-generated form | Single schema drives editing, serialization, and rendering |
| Void node model | MDX = Plate void elements; props edited in side panel | Block components don't mix editor state with content state |
| Name-based matching | Template `name` matches JSX component name | Loose coupling; no import references in schema |
| Recursive nesting | `rich-text` fields within templates recursively spawn sub-editors | Arbitrary composition depth without special casing |
| Dual serialization | `children` field → direct content; other rich-text → `<>fragment</>` | Distinguish "slot" content from "attribute" content |

---

## D1: MDX Component Schema Registration

### The Templates System

TinaCMS registers MDX components through the `templates` array on a `rich-text` field. Each template is a `Template` object that defines the component's name, label, and typed fields (props).

**Core types** (`packages/@tinacms/schema-tools/src/types/index.ts`):

```typescript
// Template — the schema for one MDX component (line 513-546)
export type Template<WithNamespace extends boolean = false> = {
  label?: string | boolean;
  name: string;                    // Must match the JSX component name
  ui?: {
    itemProps?(item): { key?: string; label?: string | boolean };
    defaultItem?: DefaultItem<Record<string, any>>;
    previewSrc?: string;           // Visual preview in block selector
  };
  fields: Field<WithNamespace>[];  // Typed prop definitions
};

// RichTextTemplate — extends Template with MDX-specific options (line 381-406)
export type RichTextTemplate<WithNamespace extends boolean = false> =
  Template<WithNamespace> & {
    inline?: boolean;              // true = inline JSX, false = block JSX
    match?: {                      // Custom shortcode syntax
      start: string;
      end: string;
      name?: string;
    };
  };
```

### The TinaField Type Union

All field types share `BaseField` (`name`, `label`, `required`, `description`, `searchable`) and extend it with type-specific properties (line 494-508):

| Field Type | `type` Value | Key Properties | List Support |
|-----------|-------------|----------------|-------------|
| `StringField` | `'string'` | `options?: Option[]`, `isTitle`, `isBody` | Yes |
| `NumberField` | `'number'` | — | Yes |
| `BooleanField` | `'boolean'` | — | Yes |
| `DateTimeField` | `'datetime'` | `dateFormat`, `timeFormat` | Yes |
| `ImageField` | `'image'` | `uploadDir` callback | Yes |
| `ReferenceField` | `'reference'` | `collections: string[]` | No |
| `RichTextField` | `'rich-text'` | `templates`, `parser`, `overrides` | No |
| `ObjectField` | `'object'` | `fields` OR `templates` (polymorphic) | Yes |
| `PasswordField` | `'password'` | — | No |

### Registration Example

A collection using MDX with embedded components (`examples/tina-self-hosted-demo/tina/config.tsx`):

```typescript
{
  name: 'post',
  path: 'content/posts',
  format: 'mdx',
  fields: [
    { type: 'string', name: 'title', isTitle: true, required: true },
    {
      type: 'rich-text',
      name: '_body',
      isBody: true,
      templates: [
        {
          name: 'DateTime',           // Must match <DateTime /> in MDX
          label: 'Date & Time',
          inline: true,               // Renders inline within text
          fields: [
            { name: 'format', type: 'string', options: ['utc', 'iso', 'local'] },
          ],
        },
        {
          name: 'BlockQuote',
          label: 'Block Quote',
          fields: [
            { name: 'children', type: 'rich-text' },  // Nested rich text!
            { name: 'authorName', type: 'string' },
          ],
        },
      ],
    },
  ],
}
```

### Architectural Insight

Components are registered **twice** but loosely coupled: once in the TinaCMS schema (template definition) and once in the React component library (rendering implementation). The link is purely the `name` string — no React imports in the schema, no schema imports in the components. This enables backend-agnostic schema definitions.

---

## D2: Editing UI Generation from Templates

### Auto-Generated Form Pipeline

When a user clicks an MDX component in the editor, TinaCMS generates a form panel automatically:

```
User clicks MDX component in editor
    ↓
InlineEmbed/BlockEmbed (component.tsx:42-169) calls handleSelect()
    ↓
Dispatches 'forms:set-active-field-name' to CMS state
    ↓
EmbedNestedForm renders (component.tsx:184-203)
    ↓
NestedForm creates Form from template.fields (nested-form.tsx:17-26)
    ↓
FormBuilder renders via FormPortal (modal overlay)
    ↓
FieldsBuilder iterates fields, looks up FieldPlugin per field.component
    ↓
Each plugin.Component renders the appropriate input widget
```

### NestedForm Component

`packages/tinacms/src/toolkit/fields/plugins/mdx-field-plugin/plate/nested-form.tsx:7-39`:

```typescript
export const NestedForm = (props: {
  onClose: () => void;
  id: string;
  label: string;
  fields: Field[];
  initialValues: object;
  onChange: (values: object) => void;
}) => {
  const FormPortal = useFormPortal();
  const form = new Form({
    ...props,
    relativePath: props.id,
    onChange: ({ values }) => { props.onChange(values); },
  });
  return (
    <FormPortal>
      {({ zIndexShift }) => (
        <GroupPanel isExpanded={true} style={{ zIndex: zIndexShift + 1000000 }}>
          <PanelHeader onClick={props.onClose}>{props.label}</PanelHeader>
          <FormBuilder form={{ tinaForm: form }} hideFooter={true} />
        </GroupPanel>
      )}
    </FormPortal>
  );
};
```

### Field Plugin System

TinaCMS uses a **plugin registry** pattern for field rendering. Each field type has a `FieldPlugin` (`packages/tinacms/src/toolkit/form-builder/field-plugin.tsx:4-18`):

```typescript
export interface FieldPlugin<ExtraFieldProps = {}, InputProps = {}> {
  __type: 'field';
  name: string;                // e.g., 'text', 'select', 'image'
  Component: React.FC<...>;   // The React form widget
  validate?(...): string | undefined;
  parse?: (value, name, field) => any;
  format?: (value, name, field) => any;
  defaultValue?: any;
}
```

Field lookup in `FieldsBuilder` (`form-builder/fields-builder.tsx:75-77`):

```typescript
const plugin = fieldPlugins.find(
  (plugin: FieldPlugin) => plugin.name === field.component
);
```

### Default Field Plugins Registered

Registered in `toolkit/tina-cms.ts:46-68`:

| Plugin Name | Field Type | Widget Rendered |
|------------|-----------|-----------------|
| `text` | `string` | `<input>` text field |
| `textarea` | `string` (multiline) | `<textarea>` |
| `number` | `number` | Number input with step |
| `toggle` | `boolean` | Toggle switch |
| `select` | `string` with options | `<select>` dropdown |
| `radio-group` | `string` with options | Radio buttons |
| `image` | `image` | Upload/media picker |
| `color` | `string` (color) | Color picker (sketch/block) |
| `date` | `datetime` | Date/time picker |
| `group` | `object` (single) | Nested panel (recursive) |
| `group-list` | `object` (list) | Sortable list with nested panels |
| `blocks` | `object` with templates | Block selector + forms |
| `tags` | `string` (list) | Tag input |
| `rich-text` / `mdx` | `rich-text` | Full Plate editor |

### Wrapper: wrapFieldsWithMeta

All field plugins are wrapped with `wrapFieldsWithMeta` (`fields/plugins/wrap-field-with-meta.tsx:13-33`), which adds label, description, and error display around the field widget. This HOC ensures consistent chrome without per-plugin boilerplate.

### Architectural Insight

The plugin registry pattern means **adding a new field type requires only registering a new plugin** — no changes to form rendering, serialization, or the template type system. The form builder is fully generic and recursive (object fields containing object fields containing rich-text fields all work automatically).

---

## D3: MDX Serialization Pipeline

### Parse Pipeline: MDX String → Plate IR

```
MDX String
    ↓ remark() + remarkMdx + remarkGfm
MDAST (Markdown AST)
    ↓ remarkToSlate() [parse/remarkToPlate.ts:33-137]
Plate RootElement
```

**Template-driven parsing** — when an MDX JSX element is encountered, `mdxJsxElement()` (`parse/mdx.ts:16-87`) finds the matching template and extracts attributes based on field type definitions:

```typescript
const template = field.templates?.find(t => t.name === node.name);
const props = extractAttributes(node.attributes, template.fields, imageCallback);
```

If no template matches, the element is **demoted to raw HTML** for safety:

```typescript
if (!template) {
  return {
    type: node.type === 'mdxJsxFlowElement' ? 'html' : 'html_inline',
    value: toTinaMarkdown({ type: 'root', children: [node] }, field).trim(),
    children: [{ type: 'text', text: '' }],
  };
}
```

### Plate IR — The Internal Representation

Defined in `packages/@tinacms/mdx/src/parse/plate.ts`:

```typescript
type RootElement = { type: 'root'; children: BlockElement[] };

// MDX components as void elements:
type MdxBlockElement = {
  type: 'mdxJsxFlowElement';
  name: string | null;
  props: Record<string, unknown>;   // All parsed attributes
  children: [EmptyTextElement];     // Always [{ type: 'text', text: '' }]
};

type MdxInlineElement = {
  type: 'mdxJsxTextElement';
  name: string | null;
  props: Record<string, unknown>;
  children: [EmptyTextElement];
};
```

Standard block types: `p`, `h1`-`h6`, `blockquote`, `code_block`, `ol`, `ul`, `li`, `table`, `hr`, `html`, `invalid_markdown`.
Standard inline types: text (with `bold`, `italic`, `code`, `strikethrough`, `highlight` marks), `a`, `img`, `break`, `html_inline`.

### Serialize Pipeline: Plate IR → MDX String

```
Plate RootElement
    ↓ rootElement() [stringify/index.ts:145-162]
MDAST Root
    ↓ toTinaMarkdown() [stringify/index.ts:82-143]
MDX String (via mdast-util-to-markdown with mdxJsx extension)
```

**Props reconstruction** (`stringify/acorn.ts`) maps each Plate prop back to an MDX attribute based on the field type:

| Field Type | Serialized As |
|-----------|--------------|
| `string` | `prop="value"` |
| `number`, `boolean` | `prop={5}`, `prop={true}` |
| `object` | `prop={{key: "value"}}` (JSON expression) |
| `image` | `prop="path"` (with image URL callback) |
| `rich-text` (children) | Direct JSX children |
| `rich-text` (other) | `prop={<>markdown content</>}` (fragment expression) |

### Two Parser Implementations

TinaCMS maintains both a legacy remark-based parser and a modern micromark-based parser (`packages/@tinacms/mdx/src/next/`). The modern parser uses custom micromark extensions for MDX JSX parsing and supports custom shortcode syntax.

### Architectural Insight

The serialization pipeline is **template-aware** — it uses field type definitions to determine how to parse and serialize each prop. This means the pipeline cannot handle components not registered in the schema (they get demoted to HTML). This is a deliberate safety/predictability tradeoff: the system guarantees type-safe roundtripping for known components.

---

## D4: Rich Text Nesting Inside MDX Components

### How Nesting Works

TinaCMS fully supports rich text nested inside MDX components. The mechanism differs based on the field name:

**`children` field (special case):** When a template has a field named `children` with `type: 'rich-text'`, the content between the JSX opening and closing tags becomes the rich text content.

```mdx
<BlockQuote authorName="Jane">
  ## This is a heading

  With **bold** text and [links](https://example.com)
</BlockQuote>
```

**Other rich-text props:** Rich text content in non-children props is serialized as JSX fragment attributes:

```mdx
<Card
  title="My Card"
  description={<>
    This is **rich** description text
  </>}
>
  Main card content here
</Card>
```

### Parse-Side Implementation

`packages/@tinacms/mdx/src/parse/mdx.ts:63-73`:

```typescript
const childField = template.fields.find((field) => field.name === 'children');
if (childField) {
  if (childField.type === 'rich-text') {
    if (node.type === 'mdxJsxTextElement') {
      node.children = [{ type: 'paragraph', children: node.children }];
    }
    props.children = remarkToSlate(node, childField, imageCallback);
  }
}
```

The `remarkToSlate` call is **recursive** — it processes the component's children through the same full parse pipeline, producing a nested `RootElement` stored in `props.children`.

### Serialize-Side Implementation

`packages/@tinacms/mdx/src/next/stringify/acorn.ts:194-245`:

For `children` field: the rich-text AST is converted to MDAST nodes and pushed directly as children of the JSX element (line 210-215).

For other rich-text fields: the AST is stringified to markdown, then wrapped in a `<>...</>` fragment expression (line 226-244).

### Internal Representation

In the Plate IR, nested rich-text content is stored as a full `RootElement` tree within the component's `props`:

```json
{
  "type": "mdxJsxFlowElement",
  "name": "BlockQuote",
  "props": {
    "children": {
      "type": "root",
      "children": [
        { "type": "h2", "children": [{ "type": "text", "text": "Heading" }] },
        { "type": "p", "children": [{ "type": "text", "text": "Content", "bold": true }] }
      ]
    },
    "authorName": "Jane"
  },
  "children": [{ "type": "text", "text": "" }]
}
```

### Test Coverage

The MDX package includes extensive test fixtures for nested rich text:
- `packages/@tinacms/mdx/src/next/tests/mdx-blocks-rich-text-children/` — basic nesting
- `packages/@tinacms/mdx/src/next/tests/mdx-blocks-multiple-rich-text-fields/` — multiple rich-text props
- `packages/@tinacms/mdx/src/next/tests/markdown-shortcodes-nested-rich-text-children/` — 2-level deep nesting

### Architectural Insight

The `children` vs. non-children distinction is a key design decision. The `children` field maps to **natural JSX children** (content between tags), while other rich-text fields become **attribute expressions** with fragment wrappers. This is ergonomic for MDX authors but creates a serialization asymmetry that the pipeline must handle carefully. The system supports **arbitrary nesting depth** via recursive parsing, but each level adds serialization complexity.

---

## D5: Frontend Rendering

### TinaMarkdown Component

`packages/tinacms/src/rich-text/index.tsx:91-120`:

```typescript
export const TinaMarkdown = ({ content, components = {} }) => {
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

`TinaMarkdown` recursively walks the content tree and dispatches each node to the appropriate React component. It uses `React.useMemo` with `JSON.stringify` comparison for client-side optimization.

### Component Mapping

Custom MDX components are mapped by name (from the recursive Node renderer):

```typescript
case 'mdxJsxTextElement':
case 'mdxJsxFlowElement':
  const Component = components[child.name];
  if (Component) {
    return <Component {...child.props} />;
  }
```

The `Components<T>` type (`line 82-84`) provides full TypeScript typing:

```typescript
export type Components<ComponentAndProps extends object> = {
  [K in keyof ComponentAndProps]: (props: ComponentAndProps[K]) => JSX.Element;
} & BaseComponentSignature;
```

### Base Component Types

TinaCMS provides typed overrides for all standard markdown elements (`rich-text/index.tsx:7-49`):

- **Text blocks:** `h1`-`h6`, `p`, `blockquote`
- **Inline marks:** `bold`, `italic`, `underline`, `strikethrough`, `code`, `highlight`
- **Rich media:** `img` (url, alt, caption), `a` (url, children), `code_block` (lang, value), `mermaid` (value)
- **Lists:** `ul`, `ol`, `li`, `lic`
- **Tables:** `table` (align, tableRows with tableCells)
- **Special:** `hr`, `break`, `html`, `html_inline`, `component_missing` (fallback)

### Rendering Nested Rich Text

For custom components with rich-text `children`, the rendering component recursively calls `TinaMarkdown`:

```typescript
const BlockQuote = (props) => (
  <blockquote>
    <TinaMarkdown content={props.children} />  {/* Recursive! */}
    <cite>{props.authorName}</cite>
  </blockquote>
);
```

### SSR Variant

`packages/tinacms/src/rich-text/static.tsx` provides `StaticTinaMarkdown`, which removes `MemoNode` wrapping and React hooks for server-side rendering compatibility.

### Architectural Insight

The rendering layer is **completely decoupled** from the schema and editing layers. `TinaMarkdown` knows nothing about templates, field types, or the editor — it only understands the content tree structure. This means the same rendering pipeline works for both CMS-managed and static MDX content.

---

## D6: Editor Architecture — Plate.js

### Framework

TinaCMS uses **Plate.js** (`@udecode/plate/react`), which is a React-first framework built on Slate.js. The editor is initialized via `usePlateEditor` in `packages/tinacms/src/toolkit/fields/plugins/mdx-field-plugin/plate/hooks/use-create-editor.ts`.

### MDX as Void Nodes

MDX components are represented as **void elements** — Slate nodes that don't have editable text children. This is a fundamental architectural choice:

`packages/tinacms/src/toolkit/fields/plugins/mdx-field-plugin/plate/plugins/create-mdx-plugins/index.tsx:11-44`:

```typescript
export const ELEMENT_MDX_INLINE = 'mdxJsxTextElement';
export const ELEMENT_MDX_BLOCK = 'mdxJsxFlowElement';

export const createMdxBlockPlugin = createPlatePlugin({
  key: ELEMENT_MDX_BLOCK,
  node: {
    isElement: true,
    isVoid: true,       // Content not editable inline
    component: (props) => <Embed {...props} inline={false} />,
  },
});
```

The void node always has `children: [{ type: 'text', text: '' }]`. All meaningful content is in `props`.

### Component Editing in Editor

When a user clicks an MDX component:

1. **`InlineEmbed` / `BlockEmbed`** renders the component as a non-editable chip/card with a label and dot menu
2. On click, `handleSelect()` dispatches a CMS state update and opens the editing panel
3. **`EmbedNestedForm`** creates a `NestedForm` with the template's fields
4. Changes flow back via `editor.tf.setNodes({ props: values }, { at: path })` — updating the void node's props

### Inline vs Block Handling

Inline components (`mdxJsxTextElement`) can appear within headings and paragraphs. Block components (`mdxJsxFlowElement`) are top-level elements. The `HANDLES_MDX` constant specifies which block types can contain inline MDX (h1-h6, p).

### All Custom Plate Plugins

From `packages/tinacms/src/toolkit/fields/plugins/mdx-field-plugin/plate/plugins/editor-plugins.tsx`:

- `createMdxBlockPlugin` / `createMdxInlinePlugin` — MDX component nodes
- `createImgPlugin` — Image nodes (void)
- `createHTMLBlockPlugin` / `createHTMLInlinePlugin` — Raw HTML preservation
- `createBlockquoteEnterBreakPlugin` — Break handling in blockquotes
- `createInvalidMarkdownPlugin` — Parse error display with raw-mode fallback

Plus standard Plate plugins: `BasicMarksPlugin`, `HeadingPlugin`, `ParagraphPlugin`, `CodeBlockPlugin` (with lowlight syntax highlighting), `BlockquotePlugin`, `LinkPlugin`, `ListPlugin`, `TablePlugin`, `SlashPlugin`, `AutoformatPlugin`, `ExitBreakPlugin`, `SoftBreakPlugin`, `FloatingToolbarPlugin`.

### Editor Context

`EditorContext` (`plate/editor-context.tsx:4-21`) provides templates and raw mode toggle to all editor components via React context. This is how embed components look up their template definition.

### Architectural Insight

The **void node model** is the critical design decision. By making MDX components opaque to the Slate editor, TinaCMS avoids the complexity of editing structured content inline. The tradeoff is that users must edit component props in a separate panel rather than directly in the document flow. This is simpler to implement and more predictable, but less "WYSIWYG" than inline editing would be.

---

## Cross-Cutting Observations

### 1. Single Schema, Three Consumers

The `Template` definition serves three purposes simultaneously:
- **Editing:** Fields become form widgets in the sidebar panel
- **Serialization:** Field types determine parse/serialize behavior for each prop
- **Rendering:** Component name links schema to React component

This is a powerful pattern but creates tight coupling between schema changes and all three layers.

### 2. Safety via Template Matching

Unknown components are demoted to raw HTML rather than being silently dropped or causing parse errors. This preserves content fidelity while preventing execution of unregistered components.

### 3. Recursive Architecture

The template system is recursively composable: `ObjectField` can contain `RichTextField`, which can contain `templates` with more `ObjectField` and `RichTextField` entries. The parse/serialize pipelines handle this via recursive calls.

### 4. Plugin Extensibility

The field plugin registry (`cms.plugins.getType('field')`) allows adding new field types without modifying core code. This is the primary extension point for custom editing experiences.

### 5. Dual Representation Gap

MDX components exist in two different forms: as Plate void nodes during editing (props in a flat object) and as MDX JSX elements in the serialized file (props as JSX attributes with type-specific syntax). The `acorn.ts` module bridges this gap, but it's the most complex part of the pipeline.

---

## Evidence Files

- [evidence/d1-schema-types.md](evidence/d1-schema-types.md) — Complete type definitions for Template, TinaField, RichTextField, and all field type variants
- [evidence/d3-serialization-pipeline.md](evidence/d3-serialization-pipeline.md) — Parse and serialize pipeline with code excerpts for template matching, children handling, and prop serialization
- [evidence/d5-d6-rendering-and-editor.md](evidence/d5-d6-rendering-and-editor.md) — TinaMarkdown component, Plate plugin definitions, void node model, and NestedForm system
