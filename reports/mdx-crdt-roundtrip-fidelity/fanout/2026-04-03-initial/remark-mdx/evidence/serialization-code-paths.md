---
type: evidence
source: source-code-analysis
date: 2026-04-03
files_analyzed:
  - mdast-util-mdx-jsx/lib/index.js
  - mdast-util-mdx-expression/lib/index.js
  - mdast-util-mdxjs-esm/lib/index.js
  - micromark-extension-mdx-jsx/dev/lib/jsx-flow.js
  - micromark-extension-mdx-jsx/dev/lib/jsx-text.js
  - micromark-extension-mdx-jsx/dev/lib/syntax.js
  - micromark-extension-mdx-md/index.js
---

# Serialization Code Paths

## Architecture Overview

remark-mdx is a thin wrapper that registers three extension pairs:

```
remark-mdx
  -> micromark-extension-mdxjs (parsing: tokenizer)
       -> micromark-extension-mdx-jsx (JSX tags)
       -> micromark-extension-mdx-expression (expressions)
       -> micromark-extension-mdxjs-esm (import/export)
       -> micromark-extension-mdx-md (disables HTML, autolink, indented code)
  -> mdast-util-mdx (AST construction + serialization)
       -> mdast-util-mdx-jsx (JSX elements)
       -> mdast-util-mdx-expression (expressions)
       -> mdast-util-mdxjs-esm (import/export)
```

## Flow vs Text Determination

The `<` character is registered in BOTH flow and text tokenizer contexts
(micromark-extension-mdx-jsx/dev/lib/syntax.js:42-56).

**Flow context** triggers when `<` appears at the start of a line (beginning of
a flow construct). The flow JSX tokenizer (jsx-flow.js) requires the tag to be
followed by optional whitespace and then end-of-line or another tag/expression.

**Text context** triggers when `<` appears within phrasing (inline) content.

**Key rule**: If text appears on the same line as the opening `<Tag>`, it becomes
`mdxJsxTextElement`. If the opening tag is alone on its line, it becomes
`mdxJsxFlowElement`. This means:

```
<Callout>content</Callout>     -> mdxJsxTextElement (text context)
<Callout>                      -> mdxJsxFlowElement (flow context)
  content
</Callout>
```

## JSX Serialization (mdxJsxToMarkdown)

Entry point: `mdxElement()` function in mdast-util-mdx-jsx/lib/index.js:557

### Self-closing decision (line 559-560)
```js
const selfClosing = node.name
  ? !node.children || node.children.length === 0
  : false
```
Named elements with no children always become self-closing. Fragments never do.

### Attribute serialization (lines 575-618)
Three attribute types:
1. `mdxJsxExpressionAttribute` -> `{value}` (e.g., `{...props}`)
2. `mdxJsxAttribute` with expression value -> `name={value}`
3. `mdxJsxAttribute` with string value -> `name="value"` (entity-escaped)
4. `mdxJsxAttribute` with null value -> `name` (boolean)

String values are entity-escaped via `stringifyEntitiesLight()`. This means
`"` in attribute values becomes `&quot;` (or switches to single quotes with
`quoteSmart`).

### Multi-line attribute formatting (lines 621-658)
When `printWidth` is finite and flow, attributes go on separate lines with
indentation. Default `printWidth` is `Infinity` -> attributes always on one line.

### Children serialization (lines 670-695)
- **Text elements**: uses `state.containerPhrasing()` - inline serialization
- **Flow elements**: calls custom `containerFlow()` function that adds 2-space
  indent per nesting depth

The `containerFlow()` function (lines 715-756):
- Calculates indent depth by counting `mdxJsxFlowElement` in the state stack
- Each child is serialized then indented using `state.indentLines()`
- Children are separated by `\n\n`
- JSX flow children are NOT re-indented (line 735-740) - they handle their own
  indent via the depth inference

### Depth inference (lines 762-774)
```js
function inferDepth(state) {
  let depth = 0
  let index = state.stack.length
  while (--index > -1) {
    const name = state.stack[index]
    if (name === 'blockquote' || name === 'listItem') break
    if (name === 'mdxJsxFlowElement') depth++
  }
  return depth
}
```
Depth resets at blockquote/listItem boundaries. Only `mdxJsxFlowElement`
increments depth.

## Expression Serialization (mdxExpressionToMarkdown)

Entry point: `handleMdxExpression()` in mdast-util-mdx-expression/lib/index.js:110

```js
function handleMdxExpression(node, parent, state) {
  const value = node.value || ''
  const result = state.indentLines(value, function (line, index, blank) {
    return (index === 0 || blank ? '' : '  ') + line
  })
  return '{' + result + '}'
}
```

This adds 2-space indent to ALL continuation lines (not first line, not blank
lines). This is where the indent drift occurs on template literals.

## ESM Serialization (mdxjsEsmToMarkdown)

Simplest: just returns `node.value || ''`. No transformation.

## Things the Serializer Does NOT Preserve

1. Self-closing style: `<X/>` normalizes to `<X />`
2. Quote style: single quotes normalize to double quotes
3. Close-tag style: `<X></X>` normalizes to `<X />`
4. Blank line count: multiple blank lines collapse to one
5. Trailing whitespace on JSX lines
6. List bullet character: `-` may become `*`
7. Expression child layout: inline `<X>{y}</X>` expands to multiline

## Things the Serializer DOES Preserve

1. Attribute order
2. Attribute names (including namespaced like `xml:lang`)
3. Expression content (minus indentation drift)
4. Member expression names (`Foo.Bar`)
5. Fragment syntax (`<></>`)
6. Spread attributes (`{...props}`)
7. Nested JSX structure
8. Markdown inside JSX children (headings, code blocks, links, etc.)
9. Import/export statement text (exact)
10. Code block language and content
