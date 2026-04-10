---
type: technical-research
topic: remark-mdx source-code analysis for CRDT round-trip fidelity
date: 2026-04-03
status: complete
packages_analyzed:
  remark-mdx: 3.1.1
  mdast-util-mdx: 3.0.0
  mdast-util-mdx-jsx: 3.x
  mdast-util-mdx-expression: 2.x
  mdast-util-mdxjs-esm: 2.x
  micromark-extension-mdxjs: 3.x
  micromark-extension-mdx-jsx: 3.x
  micromark-extension-mdx-md: 2.x
repos_cloned:
  - https://github.com/mdx-js/mdx (packages/remark-mdx)
  - https://github.com/syntax-tree/mdast-util-mdx
  - https://github.com/syntax-tree/mdast-util-mdx-jsx
  - https://github.com/syntax-tree/mdast-util-mdx-expression
  - https://github.com/syntax-tree/mdast-util-mdxjs-esm
  - https://github.com/micromark/micromark-extension-mdxjs
  - https://github.com/micromark/micromark-extension-mdx-jsx
  - https://github.com/micromark/micromark-extension-mdx-md
evidence_files:
  - evidence/ast-shapes.json
  - evidence/round-trip-results.md
  - evidence/serialization-code-paths.md
  - evidence/github-issues.md
---

# remark-mdx: Source-Code Analysis for CRDT Round-Trip Fidelity

## 1. Architecture

remark-mdx is a thin unified plugin (44 lines) that registers three extension
pairs on the processor:

```
remark-mdx
  Parsing (micromark tokenizers):
    micromark-extension-mdxjs
      -> micromark-extension-mdx-jsx       (JSX tags)
      -> micromark-extension-mdx-expression (curly-brace expressions)
      -> micromark-extension-mdxjs-esm      (import/export)
      -> micromark-extension-mdx-md         (disables HTML, autolinks, indented code)
  AST (mdast-util-from-markdown + mdast-util-to-markdown extensions):
    mdast-util-mdx
      -> mdast-util-mdx-jsx       (JSX elements -> MDAST + MDAST -> MDX text)
      -> mdast-util-mdx-expression (expressions -> MDAST + MDAST -> MDX text)
      -> mdast-util-mdxjs-esm      (ESM -> MDAST + MDAST -> MDX text)
```

The actual logic lives entirely in the dependency packages. remark-mdx itself
(packages/remark-mdx/lib/index.js) is just glue:

```js
export default function remarkMdx(options) {
  const data = this.data()
  data.micromarkExtensions.push(mdxjs(settings))
  data.fromMarkdownExtensions.push(mdxFromMarkdown())
  data.toMarkdownExtensions.push(mdxToMarkdown(settings))
}
```

## 2. MDX Node Types Added to MDAST

remark-mdx adds 7 node types to the standard MDAST:

### Block-level nodes (children of root or flow parents)

| Node Type | Description | Extends | Content Model |
|-----------|-------------|---------|---------------|
| `mdxJsxFlowElement` | Block JSX like `<Callout>...</Callout>` | MdastParent | children: BlockContent[] |
| `mdxFlowExpression` | Block expression like `{variable}` | MdastLiteral | value: string |
| `mdxjsEsm` | Import/export like `import X from 'y'` | MdastLiteral | value: string |

### Inline nodes (children of paragraphs or phrasing parents)

| Node Type | Description | Extends | Content Model |
|-----------|-------------|---------|---------------|
| `mdxJsxTextElement` | Inline JSX like `<Badge>text</Badge>` | MdastParent | children: PhrasingContent[] |
| `mdxTextExpression` | Inline expression like `{value}` | MdastLiteral | value: string |

### Attribute-level nodes (inside JSX element `.attributes[]`)

| Node Type | Description | Key Fields |
|-----------|-------------|------------|
| `mdxJsxAttribute` | Named attr: `type="warning"` or `data={expr}` | name: string, value: string \| MdxJsxAttributeValueExpression \| null |
| `mdxJsxExpressionAttribute` | Spread: `{...props}` | value: string |
| `mdxJsxAttributeValueExpression` | Expression value: `{chartData}` | value: string, data.estree?: Program |

## 3. How JSX Components Are Represented

### Flow vs Text determination

The parser registers `<` in both flow and text tokenizer contexts. The
determination happens at the micromark level:

- **Flow**: `<` at the start of a line, tag must be followed by EOL or
  another tag/expression. Creates `mdxJsxFlowElement`.
- **Text**: `<` within phrasing content. Creates `mdxJsxTextElement`.

Critical implication: the same MDX can parse as either type depending on context:

```mdx
<Callout>content</Callout>    -> mdxJsxTextElement (text on same line as opening tag)

<Callout>                     -> mdxJsxFlowElement (opening tag alone on line)
  content
</Callout>
```

This distinction is **not preserved** in the AST if an editor changes the layout.

### Attribute storage

String props and expression props are differentiated by the `value` field type:

```js
// type="warning"  ->  value is a string
{ type: 'mdxJsxAttribute', name: 'type', value: 'warning' }

// data={chartData}  ->  value is an MdxJsxAttributeValueExpression node
{ type: 'mdxJsxAttribute', name: 'data', value: {
    type: 'mdxJsxAttributeValueExpression',
    value: 'chartData',
    data: { estree: /* ESTree Program */ }
  }
}

// collapsed  ->  value is null (boolean attribute)
{ type: 'mdxJsxAttribute', name: 'collapsed', value: null }
```

### Children of JSX components

Markdown inside JSX flow elements IS fully parsed. `<Callout>Some **bold** text</Callout>` produces:

```json
{
  "type": "mdxJsxFlowElement",
  "name": "Callout",
  "children": [{
    "type": "paragraph",
    "children": [
      { "type": "text", "value": "Some " },
      { "type": "strong", "children": [{ "type": "text", "value": "bold" }] },
      { "type": "text", "value": " text" }
    ]
  }]
}
```

Flow elements can contain any block content: headings, code blocks, lists,
nested JSX, etc. Text elements can only contain phrasing content.

## 4. Serialization Behavior

### What is preserved byte-for-byte

- Attribute order and names (including namespaced like `xml:lang`)
- Member expression names (`Foo.Bar`)
- Fragment syntax (`<></>`)
- Spread attributes (`{...props}`)
- Import/export statement text (exact, via `node.value`)
- Code block language annotations and content
- Nested JSX depth structure
- Markdown formatting inside JSX children (bold, links, etc.)
- Complex expression attributes (`data={{ x: 1, y: 2 }}`)
- Attributes with URL special characters

### What is normalized (converges in 1 pass)

| Normalization | Input | Output | Configurable? |
|---------------|-------|--------|---------------|
| Self-closing space | `<X/>` | `<X />` | `tightSelfClosing: true` |
| Quote style | `type='w'` | `type="w"` | `quote: "'"` |
| Empty to self-close | `<X></X>` | `<X />` | No |
| Blank line collapse | `\n\n\n` | `\n\n` | No |
| Trailing whitespace | `<X>  \n` | `<X>\n` | No |
| Missing blank line | `# H\n<X>` | `# H\n\n<X>` | No |
| List bullet | `-` item | `*` item | `bullet: '-'` |
| Inline to block | `<X>{y}</X>` | `<X>\n  {y}\n</X>` | No |

### CRITICAL DEFECT: Indentation drift on multiline expressions

**This does NOT converge.** Each parse/serialize cycle adds 2 spaces to
continuation lines of multiline expression values.

Root cause traced to two compounding indent operations:

1. `mdast-util-mdx-expression` `handleMdxExpression()` adds 2-space indent to
   continuation lines of the `node.value` string.
2. `mdast-util-mdx-jsx` `containerFlow()` adds parent-depth indent to all
   non-blank lines of child content.

On parse, the expression value captures the indented text as-is. On serialize,
both indent operations fire again, adding 2 more spaces. Net: +2 spaces per
round-trip per nesting level on multiline expression values.

```
Pass 0: {`line1\nline2`}
Pass 1: {`line1\n    line2`}    (+4: 2 from expression + 2 from container)
Pass 2: {`line1\n      line2`}  (+2 more)
Pass 3: {`line1\n        line2`} (+2 more)
```

GitHub: mdx-js/mdx#2533 (closed, "expected behavior")

## 5. Import/Export Handling

ESM nodes are the simplest: `mdxjsEsm` stores the raw text in `value` and
optionally an ESTree AST in `data.estree`. Serialization returns `node.value`
verbatim. Import/export statements round-trip perfectly.

```js
// Parse
{ type: 'mdxjsEsm', value: "import { Chart } from './Chart'" }

// Serialize
handleMdxjsEsm(node) { return node.value || '' }
```

Multiple import/export blocks separated by blank lines become separate nodes.
Consecutive lines (no blank line) stay as a single node.

## 6. Whitespace Sensitivity

### Blank lines between JSX and markdown

A blank line after the opening JSX tag triggers markdown parsing of children.
Without it, content is still parsed, but the serializer always inserts blank-line
separation between flow children. Result: missing blank lines are added on output.

### Blank lines inside JSX children

The `containerFlow()` function separates children with `\n\n` (line 749). This
means children are always double-newline separated, regardless of how many blank
lines the original had.

### Indentation of JSX children

Children of flow JSX are indented by 2 spaces per nesting depth. The
`inferDepth()` function counts `mdxJsxFlowElement` in the state stack, resetting
at `blockquote` or `listItem` boundaries.

### micromark-extension-mdx-md disables

The MDX extension disables four CommonMark constructs:
- `autolink` (no `<url>` autolinks - conflicts with JSX)
- `codeIndented` (no 4-space indented code blocks - conflicts with JSX child indent)
- `htmlFlow` (no HTML blocks - replaced by JSX)
- `htmlText` (no inline HTML - replaced by JSX)

## 7. Implications for CRDT Editor Design

### Block model mapping

The MDAST flow/text distinction maps well to a block editor model:

- `mdxJsxFlowElement` = block-level component (has block children)
- `mdxJsxTextElement` = inline component (phrasing children only)
- `mdxFlowExpression` = block-level expression
- `mdxTextExpression` = inline expression
- `mdxjsEsm` = file-level metadata (import/export)

### Round-trip strategy

1. **Parse once, normalize**: Run one parse/serialize cycle immediately after
   loading to normalize all the converging transforms. Store the normalized
   form as the canonical baseline.

2. **Expression value workaround**: Before serialization, strip leading
   whitespace from continuation lines of `mdxFlowExpression` and
   `mdxTextExpression` value strings, and from `mdxJsxAttributeValueExpression`
   values. This prevents the indent drift.

3. **Configure serializer**: Set `bullet: '-'`, `quote: '"'`, `fences: true`
   to match common MDX authoring conventions and minimize normalization diffs.

4. **Flow/text stability**: The editor must track whether a JSX component is
   flow or text and not change it during editing. Converting between them
   changes the AST type and child content model.

### Things that will cause CRDT conflicts

- Any multiline expression value that gets serialized by different clients
  will produce different indent levels if not normalized.
- Changing a flow JSX element to have no children (or adding children to an
  empty one) changes self-closing behavior.
- Moving a JSX component from inline position to block position changes its
  type and content model entirely.

### Recommended normalizer pass

After parsing, run this normalization:
1. Strip accumulated indent from expression values
2. Ensure consistent attribute quoting
3. Ensure consistent self-closing style
4. Validate flow/text element type matches position

After serializing, before writing to git:
1. Ensure trailing newline
2. Validate no indent drift has occurred
