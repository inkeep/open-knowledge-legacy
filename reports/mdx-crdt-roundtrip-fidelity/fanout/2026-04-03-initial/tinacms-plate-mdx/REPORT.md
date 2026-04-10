---
title: "TinaCMS + Plate MDX Pipeline: Source-Code-Level Analysis"
date: 2026-04-03
type: research-report
status: complete
repo_commits:
  tinacms: "HEAD of main (depth=1 clone, 2026-04-03)"
  plate: "HEAD of main (depth=1 clone, 2026-04-03)"
key_packages:
  - "@tinacms/mdx (packages/@tinacms/mdx)"
  - "tinacms (packages/tinacms)"
  - "@udecode/plate-markdown (plate/packages/markdown)"
---

# TinaCMS + Plate MDX Pipeline: Source-Code-Level Analysis

## Executive Summary

TinaCMS is the only production system doing visual MDX editing with Slate/Plate. It achieves this through a **custom conversion pipeline that bypasses Plate's own markdown plugin entirely**. TinaCMS wrote its own MDAST-to-Slate and Slate-to-MDAST converters in `@tinacms/mdx`, using `remark-mdx` for parsing and `mdast-util-to-markdown` + `mdx-jsx-to-markdown` for serialization. Plate's `@udecode/plate-markdown` is a separate system with its own MDX approach. The two systems have fundamentally different architectures for handling MDX components.

**Critical finding for CRDT use**: TinaCMS's pipeline is schema-dependent -- you cannot parse MDX into Slate nodes without declaring component templates up front. Expression props (`data={chartData}`) are **not supported**; only literal values matching declared field types survive the round-trip. Import statements and ESM expressions throw parse errors.

---

## 1. Architecture Overview

### TinaCMS MDX Pipeline (the production system)

```
MDX string
    |
    v
remark().use(remarkMdx).use(remarkGfm).parse()   -- produces MDAST
    |
    v
remarkToSlate()                                    -- custom MDAST->Plate converter
    |                                                 (packages/@tinacms/mdx/src/parse/remarkToPlate.ts)
    v
Plate/Slate node tree                              -- rendered in @udecode/plate editor
    |
    v  (on save)
rootElement()                                      -- custom Plate->MDAST converter
    |                                                 (packages/@tinacms/mdx/src/stringify/index.ts)
    v
toMarkdown() with mdxJsxToMarkdown() extension     -- mdast-util-to-markdown
    |
    v
MDX string
```

### Plate's Own Markdown Plugin (separate system)

```
Markdown/MDX string
    |
    v
unified().use(remarkParse).use(remarkPlugins).parse()  -- produces MDAST
    |
    v
mdastToSlate() via convertNodesDeserialize()           -- rule-based converter
    |                                                      (plate/packages/markdown/src/lib/deserializer/)
    v
Plate/Slate node tree
    |
    v  (on serialize)
slateToMdast() via convertNodesSerialize()             -- rule-based converter
    |                                                      (plate/packages/markdown/src/lib/serializer/)
    v
unified().use(remarkStringify).stringify()             -- remark-stringify
    |
    v
Markdown string
```

**Key architectural difference**: TinaCMS does NOT use Plate's markdown plugin. It has its own complete parse/stringify pipeline in `@tinacms/mdx`.

---

## 2. MDAST to Slate Conversion (TinaCMS)

Source: `packages/@tinacms/mdx/src/parse/remarkToPlate.ts`

### Standard Markdown Mapping

| MDAST type | Plate type | Notes |
|---|---|---|
| `paragraph` | `p` | |
| `heading` (depth 1-6) | `h1`-`h6` | |
| `list` (ordered/unordered) | `ol`/`ul` | |
| `listItem` | `li` with `lic` children | `lic` = "list item content" |
| `code` | `code_block` with `code_line` children | Each line is a separate `code_line` node |
| `blockquote` | `blockquote` | Unwraps inner paragraphs to inline elements |
| `table` | `table` > `tr` > `td` > `p` | Wraps cell content in paragraph |
| `thematicBreak` | `hr` | |
| `link` | `a` | |
| `image` | `img` | Void node with `url`, `alt`, `caption` |
| `strong`/`emphasis`/`delete`/`inlineCode` | Text marks: `bold`/`italic`/`strikethrough`/`code` | Flattened to boolean marks on text nodes |
| `html` | `html` (block) or `html_inline` | Raw HTML stored as opaque string |

### JSX Component Mapping

Source: `packages/@tinacms/mdx/src/parse/mdx.ts`, function `mdxJsxElement()`

```typescript
// The function looks up the component by name in field.templates
const template = field.templates?.find((template) => {
  const templateName = typeof template === 'string' ? template : template.name;
  return templateName === node.name;
});
```

**Flow elements** (`mdxJsxFlowElement`) become `MdxBlockElement`:
```typescript
type MdxBlockElement = {
  type: 'mdxJsxFlowElement';
  name: string | null;        // component name, e.g., "Callout"
  props: Record<string, unknown>;  // extracted from JSX attributes
  children: [EmptyTextElement];    // void node -- children are in props
};
```

**Text elements** (`mdxJsxTextElement`) become `MdxInlineElement`:
```typescript
type MdxInlineElement = {
  type: 'mdxJsxTextElement';
  name: string | null;
  props: Record<string, unknown>;
  children: [EmptyTextElement];    // void node
};
```

**Critical**: JSX children with rich-text content are parsed recursively. The children markdown is re-parsed through `remarkToSlate()` and stored in `props.children` as a nested `RootElement`:

```typescript
// From mdx.ts line 67-73
const childField = template.fields.find((field) => field.name === 'children');
if (childField) {
  if (childField.type === 'rich-text') {
    props.children = remarkToSlate(node, childField, imageCallback);
  }
}
```

### Unregistered Components

If a JSX element has no matching template, it falls back to an HTML node with the raw markup stored as a string:

```typescript
// From mdx.ts line 49-54
if (!template) {
  const string = toTinaMarkdown({ type: 'root', children: [node] }, field);
  return {
    type: node.type === 'mdxJsxFlowElement' ? 'html' : 'html_inline',
    value: string.trim(),
    children: [{ type: 'text', text: '' }],
  };
}
```

This is the **only production escape hatch for unknown JSX** -- it serializes back to a raw string.

---

## 3. Component Registration Schema

Source: `@tinacms/schema-tools` types (referenced throughout)

Components are registered via the `templates` array on a `RichTextField`:

```typescript
const field: RichTextField = {
  name: 'body',
  type: 'rich-text',
  parser: { type: 'mdx' },
  templates: [
    {
      name: 'Cta',              // Must match JSX tag name exactly
      label: 'Call-to-action',
      fields: [
        { type: 'string', name: 'label' },
        { type: 'number', name: 'count' },
        { type: 'boolean', name: 'primary' },
        { type: 'object', name: 'config', fields: [...] },
        { type: 'rich-text', name: 'children' },  // enables nested markdown
        { type: 'rich-text', name: 'description' }, // non-children rich-text uses fragments
        { type: 'image', name: 'hero' },
      ],
    },
  ],
};
```

### Supported Field Types for Props

From `packages/@tinacms/mdx/src/parse/acorn.ts`:

| Field type | JSX syntax | How it's parsed |
|---|---|---|
| `string` | `label="hello"` or `label={"hello"}` | Direct string extraction |
| `number` | `count={42}` | Acorn ESTree literal extraction |
| `boolean` | `primary={true}` | Acorn ESTree literal extraction |
| `string` (list) | `items={["a", "b"]}` | Acorn ArrayExpression |
| `object` | `config={{ key: "val" }}` | Recursive ObjectExpression extraction |
| `object` (list) | `rows={[{a: 1}, {b: 2}]}` | Array of ObjectExpressions |
| `rich-text` | `desc={<>\n# Hello\n</>}` | Fragment stripped, inner content re-parsed as MDX |
| `image` | `hero="path.jpg"` | String + imageCallback transform |
| `reference` | `post="content/posts/hello.md"` | String extraction |
| `datetime` | `date="2024-01-01"` | String extraction |

### What Registration Affects

Registration is **mandatory for the Slate node structure**. Without a template match:
- Props are not extracted (the Acorn AST parsing depends on knowing field types)
- Children rich-text is not recursively parsed
- The entire JSX element degrades to an opaque `html`/`html_inline` string node

---

## 4. Slate to MDAST to MDX Serialization

Source: `packages/@tinacms/mdx/src/stringify/index.ts` and `packages/@tinacms/mdx/src/stringify/acorn.ts`

### Serialization Pipeline

```
serializeMDX(plateRoot, field, imageCallback)
  -> rootElement(plateRoot)     // converts Plate tree back to MDAST
  -> toTinaMarkdown(mdast)      // uses mdast-util-to-markdown
     with extensions:
       - mdxJsxToMarkdown()     // handles JSX elements
       - gfmToMarkdown()        // handles GFM (tables, strikethrough)
```

### Block Element Serialization

From `stringify/index.ts`, the `blockElement()` function:

```typescript
case 'mdxJsxFlowElement':
  const { children, attributes, useDirective, directiveType } =
    stringifyProps(content, field, false, imageCallback);
  // ...
  return {
    type: 'mdxJsxFlowElement',
    name: content.name,
    attributes,
    children,
  };
```

### Props Serialization

From `stringify/acorn.ts`, `stringifyProps()`:

- **Strings**: Written as plain JSX attributes: `name="value"`
- **Numbers/booleans**: Written as expression attributes: `count={42}`, `active={true}`
- **Objects**: Serialized via `JSON.stringify()` then formatted with Prettier's `acorn` parser
- **Rich-text (children)**: Recursively serialized back to MDAST nodes and placed as JSX children
- **Rich-text (non-children)**: Wrapped in fragments: `desc={<>\n  # Hello\n</>}`
- **Lists**: Written as array expressions: `items={["a", "b"]}`

### Mark Serialization

From `stringify/marks.ts`, the `eat()` function uses a greedy mark-merging algorithm:
1. Scans adjacent text nodes for shared marks
2. Wraps the longest shared run in the appropriate MDAST mark node (`strong`, `emphasis`, etc.)
3. Recursively processes remaining marks
4. Special handling for links-with-marks to produce `*[text](url)*` instead of `*text* *[text](url)*`

---

## 5. Round-Trip Fidelity: What Survives and What Doesn't

### SURVIVES round-trip

| Feature | Evidence |
|---|---|
| Standard markdown (headings, paragraphs, lists, code) | Kitchen-sink test fixture passes |
| Registered JSX components with literal props | `mdx-basic-nested-objects` test: `<Table rows={[...]} />` round-trips |
| JSX children with nested markdown | `mdx-blocks-rich-text-children` test: `<Cta>\n## Click **here**!\n</Cta>` |
| GFM tables | `mdx-basic-tables` test |
| Bold/italic/strikethrough/code marks | `markdown-basic-marks` test |
| Highlight via `<mark>` | Parsed via `parseMarkMdxText()`, serialized back as `<mark>` |
| Unregistered JSX (as opaque HTML) | `mdx-unregistered-component` test: stored as raw string, survives |
| Nested rich-text in non-children props via fragments | `<MyComp desc={<>\n# Hello\n</>}>` pattern |

### DOES NOT SURVIVE round-trip

| Feature | What happens | Source evidence |
|---|---|---|
| **Expression props** (`data={chartData}`) | **Throws parse error**. Only literal values supported -- acorn extraction requires `Literal`, `ArrayExpression`, or `ObjectExpression` nodes. Variable references are `Identifier` nodes and hit `assertType` failures. | `parse/acorn.ts` line 108-118: `assertType(attribute.expression, 'Literal')` |
| **Import statements** (`import X from 'y'`) | **Throws `RichTextParseError`** with message "Unexpected expression". The `mdxjsEsm` MDAST node type hits the error case in `remarkToSlate()`. | `remarkToPlate.ts` lines 115-123: explicit throw for `mdxjsEsm` |
| **MDX expressions** (`{someVar}`, `{1 + 1}`) | **Throws `RichTextParseError`**. Both `mdxFlowExpression` and `mdxTextExpression` are explicitly rejected. | `remarkToPlate.ts` lines 113-123 (flow), lines 394-401 (text) |
| **HTML comments** (`<!-- comment -->`) | In Plate's pipeline, converted to JSX comments `{/*comment*/}` via `htmlToJsx()`. In TinaCMS's pipeline, parsed as `html` nodes if in markdown mode, but **lost in MDX mode** because remark-mdx doesn't produce HTML comment nodes. | Plate: `htmlToJsx.ts` line 43. TinaCMS: not handled. |
| **Whitespace fidelity** | Leading newline in JSX opening tag is normalized. Example: `<Cta\n>` becomes `<Cta>` in output. Blank lines between elements may shift. | Test evidence: `in.md` has `<Cta\n>`, `out.md` has `<Cta>` |
| **Attribute quoting style** | String props always serialize as `name="value"` (double-quoted, no expression syntax). Non-string scalars always use expression syntax `count={42}`. The original quoting is not preserved. | `stringify/acorn.ts` lines 105-109 (string), 178-185 (number/boolean) |
| **Empty paragraphs** | Single-text-node paragraphs where text is empty string are **dropped** during serialization. | `stringify/index.ts` lines 193-201: explicit `return null` for empty paragraphs |
| **Code/table/thematicBreak inside list items** | **Throws parse error**. Only paragraphs, nested lists, and JSX elements are supported inside list items. | `remarkToPlate.ts` lines 234-239: explicit throw |
| **Shortcodes with HTML children** | Known FIXME. Three test directories are prefixed `FIXME-`: `FIXME-markdown-shortcodes-block-with-html-children-1`, `FIXME-markdown-shortcodes-block-with-html-children-2`, `FIXME-markdown-shortcodes-with-duplicates` |
| **Object prop formatting** | Objects are reformatted by Prettier during serialization. Original formatting, trailing commas, whitespace are all normalized. | `stringify/acorn.ts` lines 296-308: `prettier.format()` with `acorn` parser |

---

## 6. Plate's @udecode/plate-markdown: MDX Handling

Source: `plate/packages/markdown/src/lib/`

### Architecture

Plate's markdown plugin uses a **rule-based** system rather than TinaCMS's template-based system:

```typescript
// From types.ts
export type MdRules = Partial<{
  [K in keyof PlateNodeMap]: Nullable<MdNodeParser<K>>;
}> & Record<string, Nullable<AnyNodeParser>>;
```

Each rule has optional `deserialize` and `serialize` functions.

### MDX Handling in Plate

From `deserializer/utils/customMdxDeserialize.ts`:

1. When an `mdxJsxFlowElement` or `mdxJsxTextElement` is encountered, Plate looks up a registered plugin by the JSX tag name
2. If a matching plugin/rule exists, its `deserialize` function is called
3. If no match exists, it **falls back to plain text** with the tag structure preserved as a string:

```typescript
// Fallback for unregistered MDX text elements
return [{ text: `<${tagName}>${textContent}</${tagName}>` }];

// Fallback for unregistered MDX flow elements
return [{
  children: [
    { text: `<${tagName}>\n` },
    ...convertChildrenDeserialize(mdastNode.children, deco, options),
    { text: `\n</${tagName}>` },
  ],
  type: getPluginType(options.editor!, KEYS.p),
}];
```

### Plate Built-in MDX Components

From `rules/defaultRules.ts`, Plate has built-in MDX serialization for:
- `<callout>` (with attributes via `parseAttributes()`)
- `<toc>` (table of contents)
- `<mark>` (highlight)
- `<u>` (underline)
- `<sub>`/`<sup>` (sub/superscript)
- `<del>` (strikethrough)
- `<comment>` / `<suggestion>` (collaboration marks)
- `<date>` (inline date)

### Serialization in Plate

From `serializer/serializeMd.ts`:
```typescript
const toRemarkProcessor = unified()
  .use(remarkPlugins ?? [])
  .use(remarkStringify, { emphasis: '_', ...remarkStringifyOptions });
```

Plate uses `remark-stringify` for final output, while TinaCMS uses `mdast-util-to-markdown` directly with JSX and GFM extensions.

### Plate MDX Safety Handling

Plate has a fallback mechanism for incomplete MDX (`splitIncompleteMdx.ts`). When remark-mdx throws on malformed JSX, Plate:
1. Splits the string at the first incomplete tag
2. Parses the valid portion with MDX enabled
3. Parses the invalid portion with MDX disabled (plain markdown)
4. Merges the results

This is designed for **paste handling** where partial JSX might be pasted.

### HTML-to-JSX Pre-processing

From `htmlToJsx.ts`, before parsing, Plate converts:
- HTML comments to JSX comments: `<!-- text -->` becomes `{/* text */}`
- Boolean attributes: `disabled` becomes `disabled="true"`
- Attribute renames: `class=` becomes `className=`
- Self-closing void elements: `<br>` becomes `<br />`

---

## 7. Known Limitations and FIXME Tests

### TinaCMS FIXME Tests (Known Failures)

Three test directories are prefixed with `FIXME-`, indicating known broken cases:

1. **`FIXME-markdown-shortcodes-block-with-html-children-1`**: Markdown shortcodes (`{{< center >}}`) containing raw HTML (`<h2>Some text</h2>`) as children.

2. **`FIXME-markdown-shortcodes-block-with-html-children-2`**: Same pattern, different fixture.

3. **`FIXME-markdown-shortcodes-with-duplicates`**: Duplicate shortcode names in a single document.

### GitHub Issues

- **[Issue #2581](https://github.com/tinacms/tinacms/issues/2581)**: MDX file content gets wiped when saving nested rich-text fields.
- **[Issue #2580](https://github.com/tinacms/tinacms/issues/2580)**: Single container component prevents editing content outside it.
- **[Issue #4646](https://github.com/tinacms/tinacms/issues/4646)**: Rich text formatting lost on copy/paste (formatting appears in editor but doesn't serialize to markdown on save).
- **[Issue #2881](https://github.com/tinacms/tinacms/issues/2881)**: Markdown shortcodes in rich-text field cause collection parsing to fail.
- **[Issue #2564](https://github.com/tinacms/tinacms/issues/2564)**: No error UI for handling unregistered JSX in MDX.

### Architectural Limitations

1. **Schema dependency**: The TinaCMS pipeline cannot parse MDX without a complete field schema. Every JSX component must be declared with its field types before parsing. This is fundamentally at odds with a generic CRDT approach.

2. **No expression support**: The Acorn AST extraction explicitly requires literals. `data={chartData}` would require evaluation or symbol resolution, which TinaCMS intentionally does not support.

3. **Void MDX nodes**: Both flow and text MDX elements are treated as void nodes in Slate (`children: [{ type: 'text', text: '' }]`). The actual content lives in `props`. This means Slate's collaborative editing cannot operate on the internal structure of MDX components.

4. **Prettier dependency for serialization**: Object props are formatted through Prettier at serialization time, which means the serialized output is not deterministic relative to the input formatting.

---

## 8. Implications for CRDT-Backed Visual MDX Editor

### What TinaCMS Gets Right
- Clean separation of MDAST parsing from Slate node construction
- Recursive rich-text children handling
- Template-based prop extraction with type safety
- Graceful degradation for unregistered components (preserved as HTML strings)

### What Would Need to Change for CRDT
1. **Schema independence**: A CRDT system needs to handle unknown JSX without degrading. TinaCMS's approach of requiring templates up-front is too restrictive.
2. **Expression preservation**: For MDX to be truly canonical, expression props must survive. This requires storing the raw expression string alongside (or instead of) the parsed value.
3. **Import preservation**: ESM imports are part of MDX files. They need to be stored in a document-level metadata structure, not discarded.
4. **Whitespace fidelity**: A CRDT system operating on the source needs position-aware editing. TinaCMS's normalize-on-serialize approach would cause spurious diffs.
5. **Void node problem**: MDX components are void in Slate, meaning their internal state (props) is opaque to collaborative cursors and operations. A CRDT system needs either sub-document CRDTs for component props or a different representation.

---

## Key Source Files Reference

| File | Purpose |
|---|---|
| `@tinacms/mdx/src/parse/index.ts` | Entry point: MDX string -> remark AST -> Plate nodes |
| `@tinacms/mdx/src/parse/remarkToPlate.ts` | MDAST -> Plate conversion (639 lines) |
| `@tinacms/mdx/src/parse/mdx.ts` | JSX element handling + template lookup |
| `@tinacms/mdx/src/parse/acorn.ts` | Acorn ESTree -> prop value extraction |
| `@tinacms/mdx/src/parse/plate.ts` | Plate node type definitions |
| `@tinacms/mdx/src/stringify/index.ts` | Plate -> MDAST conversion + toMarkdown() |
| `@tinacms/mdx/src/stringify/acorn.ts` | Prop value -> JSX attribute serialization |
| `@tinacms/mdx/src/stringify/marks.ts` | Mark merging algorithm for serialization |
| `plate/packages/markdown/src/lib/MarkdownPlugin.ts` | Plate markdown plugin definition |
| `plate/packages/markdown/src/lib/deserializer/convertNodesDeserialize.ts` | Plate's MDAST -> Slate conversion |
| `plate/packages/markdown/src/lib/deserializer/utils/customMdxDeserialize.ts` | Plate's MDX JSX handling |
| `plate/packages/markdown/src/lib/serializer/serializeMd.ts` | Plate's Slate -> markdown serialization |
| `plate/packages/markdown/src/lib/rules/defaultRules.ts` | Plate's built-in element/mark rules |
| `plate/packages/markdown/src/lib/types.ts` | MDAST <-> Plate type mapping tables |
