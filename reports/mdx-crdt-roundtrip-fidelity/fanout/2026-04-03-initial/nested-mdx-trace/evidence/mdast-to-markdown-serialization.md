---
title: "Evidence: MDAST-to-Markdown Serialization for MDX JSX"
step: A.5 / B.5 (Serialize back)
file: mdast-util-mdx-jsx/lib/index.js
lines: 519-790
---

# MDAST-to-Markdown Serialization: mdxJsxToMarkdown

## How mdast-util-mdx-jsx Serializes JSX Elements

File: `mdast-util-mdx-jsx/lib/index.js`, function `mdxJsxToMarkdown()` (line 519).

The serializer registers handlers for both `mdxJsxFlowElement` and
`mdxJsxTextElement` MDAST node types:

```javascript
return {
  handlers: {
    mdxJsxFlowElement: mdxElement,
    mdxJsxTextElement: mdxElement
  },
  fences: true,
  resourceLink: true
};
```

### Self-closing detection (line 559-561)

```javascript
const selfClosing = node.name
  ? !node.children || node.children.length === 0
  : false
```

Self-closing is determined by whether the element has children, NOT by a
`selfClosing` flag on the node. This means `<Chart data={chartData} />` would
correctly serialize as self-closing IF it arrives as a `mdxJsxFlowElement`
with an empty children array.

### Attribute serialization (lines 575-618)

Expression attributes are serialized as `{value}`:
```javascript
if (attribute.type === 'mdxJsxExpressionAttribute') {
  result = '{' + (attribute.value || '') + '}'
}
```

Regular attribute values are serialized with quotes:
```javascript
if (typeof value === 'object') {
  right = '{' + (value.value || '') + '}'  // expression values
} else {
  right = appliedQuote + stringifyEntitiesLight(value, ...) + appliedQuote
}
```

This correctly handles:
- `title="Docker"` -- string attribute, quoted
- `data={chartData}` -- expression value, braced
- `responsive={true}` -- expression value, braced

### Children serialization (flow elements, lines 671-686)

```javascript
if (node.children && node.children.length > 0) {
  if (node.type === 'mdxJsxTextElement') {
    value += state.containerPhrasing(node, { ... })
  } else {
    tracker.shift(2)
    value += '\n'
    value += containerFlow(node, state, tracker.current())
    value += '\n'
  }
}
```

Flow elements get their children serialized with the custom `containerFlow()`
function (line 715), which adds indentation per nesting level.

### Indentation via inferDepth (lines 762-774)

```javascript
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

The serializer counts the nesting depth of `mdxJsxFlowElement` in the state
stack to determine indentation. Each level adds 2 spaces.

## Relevance to Pipeline Roundtrip

### Pipeline A (Plate)

The serialization code in `mdast-util-mdx-jsx` is CAPABLE of correctly
serializing nested MDX with expression props, self-closing tags, and
proper indentation. However, Pipeline A never reaches this code path for
unknown JSX components because:

1. The MDAST-to-Slate conversion destroys JSX structure (Step A.2)
2. The Slate-to-MDAST conversion (`serializeMd`) only produces
   `mdxJsxFlowElement` MDAST nodes for known registered types (like
   `callout`, `toc`, `column`) via their explicit serialize rules
3. Unknown components were flattened to paragraphs with literal text,
   so they serialize as regular paragraphs

**The serializer infrastructure exists but is unreachable for unknown components.**

### Pipeline B (Milkdown)

Milkdown does not use `mdast-util-mdx-jsx` at all. Its serialization uses
the `html` node serializer, which emits raw HTML strings:

```typescript
toMarkdown: {
  match: (node) => node.type.name === 'html',
  runner: (state, node) => {
    state.addNode('html', undefined, node.attrs.value)
  },
},
```

The html node's `value` attribute is emitted as-is. This preserves the
original tag string including all attributes, but loses:
- Indentation (each tag is emitted as a standalone HTML line)
- Nesting context (tags are flat, not indented within parents)
- Whitespace between tags and content

### Expected serialized output (Pipeline B)

```markdown
<Tabs>

<Tab title="Docker">

## Using Docker

First, **build** the image:

```bash
docker build -t myapp .
```

<Callout type="info">

See the [Docker docs](https://docs.docker.com) for more details.

</Callout>

</Tab>

<Tab title="Podman">

## Using Podman

Similar to Docker but rootless:

```bash
podman build -t myapp .
```

</Tab>

</Tabs>

<Chart data={chartData} responsive={true} />

Final paragraph.
```

Note: All indentation is lost. Each tag and content block is at the top level
with blank lines between them (remark-stringify adds blank lines between
block nodes). The expression props in `<Chart>` are preserved because they
were never parsed.
