---
title: "Evidence: Pipeline B Breakpoint - No remark-mdx in Milkdown"
pipeline: milkdown-prosemirror-yjs
step: B.1 (Parse to MDAST) and B.2 (MDAST to ProseMirror)
severity: critical
files:
  - milkdown/packages/transformer/src/parser/state.ts
  - milkdown/packages/plugins/preset-commonmark/src/node/html.ts
  - milkdown/packages/plugins/preset-commonmark/src/plugin/remark-html-transformer.ts
---

# Pipeline B Breakpoint: No remark-mdx in Milkdown

## Root Cause

Milkdown's preset-commonmark configures remark for standard CommonMark + GFM
parsing. It does NOT include `remark-mdx` as a syntax extension. This means:

1. JSX tags (`<Tabs>`, `<Tab>`, etc.) are parsed as raw HTML nodes
2. Expression attributes (`{chartData}`) inside HTML tags are preserved as part
   of the raw HTML string value, but never structurally parsed
3. JSX nesting (parent-child relationships between components) is flattened into
   a sequence of independent html atoms

## How HTML Nodes Are Handled

### Step 1: remark-html-transformer wraps html nodes

File: `milkdown/packages/plugins/preset-commonmark/src/plugin/remark-html-transformer.ts`

```typescript
const BLOCK_CONTAINER_TYPES = ['root', 'blockquote', 'listItem']

export const remarkHtmlTransformer = $remark(
  'remarkHTMLTransformer',
  () => () => (tree: Node) => {
    flatMapWithDepth(tree, (node, _index, parent) => {
      if (!isHTML(node)) return [node]
      if (parent && BLOCK_CONTAINER_TYPES.includes(parent.type)) {
        node.children = [{ ...node }]
        delete node.value
        ;(node as { type: string }).type = 'paragraph'
      }
      return [node]
    })
  }
)
```

When an `html` node appears as a direct child of `root`, `blockquote`, or
`listItem`, it gets wrapped in a `paragraph` node. This transforms:
```
html { value: "<Tabs>" }
```
into:
```
paragraph { children: [html { value: "<Tabs>" }] }
```

### Step 2: htmlSchema creates atomic inline nodes

File: `milkdown/packages/plugins/preset-commonmark/src/node/html.ts`

```typescript
export const htmlSchema = $nodeSchema('html', (ctx) => {
  return {
    atom: true,
    group: 'inline',
    inline: true,
    attrs: {
      value: { default: '', validate: 'string' },
    },
    parseMarkdown: {
      match: ({ type }) => Boolean(type === 'html'),
      runner: (state, node, type) => {
        state.addNode(type, { value: node.value as string })
      },
    },
```

Key properties:
- `atom: true` -- the node is a single unit, not editable internally
- `inline: true` -- the node is inline, must appear inside a text block
- `group: 'inline'` -- participates in inline content

This means `<Tabs>` becomes an opaque inline token. The user sees it as a
non-editable chip/badge in the editor. The full tag string including attributes
is preserved in `attrs.value`.

## What This Means for the Test Case

The 3-level nested JSX structure:
```
<Tabs>
  <Tab title="Docker">
    ## Using Docker
    <Callout type="info">...</Callout>
  </Tab>
</Tabs>
```

Becomes a flat sequence of ProseMirror blocks:
```
paragraph [ html_atom("<Tabs>") ]
paragraph [ html_atom('<Tab title="Docker">') ]
heading(2) "Using Docker"
... content ...
paragraph [ html_atom('<Callout type="info">') ]
... content ...
paragraph [ html_atom("</Callout>") ]
paragraph [ html_atom("</Tab>") ]
... (Podman tab) ...
paragraph [ html_atom("</Tabs>") ]
```

**Nesting is completely lost.** The relationship between `<Tabs>` and its
`<Tab>` children exists only in the user's mental model, not in the document
structure. There is no structural guarantee that tags are balanced.

## Paradoxical Advantage

Despite being structurally worse (no nesting), Pipeline B preserves MORE raw
information than Pipeline A:

| Feature | Pipeline A | Pipeline B |
|---------|-----------|-----------|
| `title="Docker"` | LOST | Preserved in atom value |
| `type="info"` | LOST | Preserved in atom value |
| `data={chartData}` | LOST | Preserved in atom value |
| `responsive={true}` | LOST | Preserved in atom value |
| `<Chart ... />` form | Becomes `<Chart>...</Chart>` | Preserved as-is in atom value |

This is because Pipeline B never tries to parse the JSX -- it treats the entire
tag string as an opaque blob. Pipeline A parses it correctly (via remark-mdx)
but then discards the parsed data during the MDAST-to-Slate conversion.

## Impact on CRDT Safety

Because html atoms are opaque inline nodes (not character sequences), y-prosemirror
handles them as single units in the delta. A concurrent edit cannot partially
modify an html atom's value. This is SAFER than Pipeline A where JSX tags are
character-level text that can be split by concurrent insertions.

However, there is no structural validation for tag matching. An agent could insert
`<Tab>` without `</Tab>`, producing invalid JSX on serialization.
