---
title: "Evidence: Round-Trip Fidelity Analysis"
date: 2026-04-03
type: evidence
sources:
  - packages/core/src/__internal__/remark-handlers.ts
  - packages/plugins/preset-commonmark/src/plugin/remark-marker-plugin.ts
  - packages/plugins/preset-commonmark/src/plugin/remark-inline-link-plugin.ts
  - packages/plugins/preset-commonmark/src/plugin/remark-line-break.ts
  - packages/plugins/preset-commonmark/src/plugin/remark-preserve-empty-line.ts
  - packages/plugins/preset-commonmark/src/node/code-block.ts
  - packages/plugins/preset-commonmark/src/node/bullet-list.ts
---

# Round-Trip Fidelity Evidence

## Emphasis/Strong Marker Preservation Chain

### Step 1: remarkMarker annotates MDAST

File: `packages/plugins/preset-commonmark/src/plugin/remark-marker-plugin.ts`

```typescript
export const remarkMarker = $remark(
  'remarkMarker',
  () => () => (tree, file) => {
    const getMarker = (node) => {
      return (file.value as string).charAt(node.position!.start.offset!)
    }
    visit(tree, (node) => ['strong', 'emphasis'].includes(node.type), (node) => {
      node.marker = getMarker(node)
    })
  }
)
```

Reads the original source character at the node's start position to determine `*` vs `_`.

### Step 2: Parser stores marker as ProseMirror attribute

File: `packages/plugins/preset-commonmark/src/mark/emphasis.ts`, lines 39-40

```typescript
parseMarkdown: {
  match: (node) => node.type === 'emphasis',
  runner: (state, node, markType) => {
    state.openMark(markType, { marker: node.marker })
    state.next(node.children)
    state.closeMark(markType)
  },
},
```

### Step 3: Serializer passes marker to MDAST

File: `packages/plugins/preset-commonmark/src/mark/emphasis.ts`, lines 46-49

```typescript
toMarkdown: {
  match: (mark) => mark.type.name === 'emphasis',
  runner: (state, mark) => {
    state.withMark(mark, 'emphasis', undefined, {
      marker: mark.attrs.marker,
    })
  },
},
```

### Step 4: Custom stringify handler uses marker

File: `packages/core/src/__internal__/remark-handlers.ts`, lines 16-30

```typescript
emphasis: (node, _, state, info) => {
  const marker = node.marker || state.options.emphasis || '*'
  // ...uses marker for wrapping
},
```

### Net Result
`*italic*` -> MDAST emphasis {marker: '*'} -> PM mark {marker: '*'} -> MDAST emphasis {marker: '*'} -> `*italic*`
`_italic_` -> MDAST emphasis {marker: '_'} -> PM mark {marker: '_'} -> MDAST emphasis {marker: '_'} -> `_italic_`

## Reference Links -- Deliberate Loss

File: `packages/plugins/preset-commonmark/src/plugin/remark-inline-link-plugin.ts`

```typescript
import remarkInlineLinks from 'remark-inline-links'
export const remarkInlineLinkPlugin = $remark(
  'remarkInlineLink',
  () => remarkInlineLinks
)
```

`remark-inline-links` converts all reference-style links to inline links during the MDAST transformation phase. This happens BEFORE the parser sees the MDAST, so there is no mechanism to preserve reference links.

## Code Block -- Language Preserved, Fence Style Lost

File: `packages/plugins/preset-commonmark/src/node/code-block.ts`

```typescript
parseMarkdown: {
  match: ({ type }) => type === 'code',
  runner: (state, node, type) => {
    const language = node.lang ?? ''
    const value = node.value as string | null
    state.openNode(type, { language })
    if (value) state.addText(value)
    state.closeNode()
  },
},
toMarkdown: {
  match: (node) => node.type.name === 'code_block',
  runner: (state, node) => {
    state.addNode('code', undefined, node.content.firstChild?.text || '', {
      lang: node.attrs.language,
    })
  },
},
```

Only `lang` is preserved. The MDAST `code` node also has `meta` (for things like `js {1-3}`), which is NOT captured. Fence character (`` ` `` vs `~`) and count are not stored -- remark-stringify uses its defaults.

## Bullet List -- Marker Not Preserved

File: `packages/plugins/preset-commonmark/src/node/bullet-list.ts`

```typescript
parseMarkdown: {
  match: ({ type, ordered }) => type === 'list' && !ordered,
  runner: (state, node, type) => {
    const spread = node.spread != null ? `${node.spread}` : 'false'
    state.openNode(type, { spread }).next(node.children).closeNode()
  },
},
toMarkdown: {
  match: (node) => node.type.name === 'bullet_list',
  runner: (state, node) => {
    state.openNode('list', undefined, {
      ordered: false,
      spread: node.attrs.spread,
    }).next(node.content).closeNode()
  },
},
```

Only `spread` is preserved. The bullet marker (`-`, `*`, `+`) is not captured from MDAST and not stored in ProseMirror attributes. remark-stringify uses its default (`-` or whatever is configured).

## Line Breaks -- Converted to Break Nodes

File: `packages/plugins/preset-commonmark/src/plugin/remark-line-break.ts`

This remark plugin converts newlines within text nodes to `break` MDAST nodes with `{ isInline: true }`. On round-trip, these are serialized back as hard breaks (depending on hardbreak schema), which may produce different whitespace than the original soft line breaks.

## Text Whitespace -- Custom Handler

File: `packages/core/src/__internal__/remark-handlers.ts`, lines 4-15

```typescript
text: (node, _, state, info) => {
  const value = node.value
  if (/^[^*_\\]*\s+$/.test(value)) {
    return value  // Direct passthrough for trailing-space-only text
  }
  return state.safe(value, { ...info, encode: [] })
}
```

The `encode: []` option prevents remark-stringify from encoding characters like spaces as HTML entities. This is specifically to preserve trailing spaces that markdown typically collapses.

## Empty Lines -- Heuristic Preservation

File: `packages/plugins/preset-commonmark/src/node/paragraph.ts`, lines 39-49

```typescript
toMarkdown: {
  runner: (state, node) => {
    state.openNode('paragraph')
    if (
      (!node.content || node.content.size === 0) &&
      node !== lastNode &&
      shouldPreserveEmptyLine(ctx)
    ) {
      state.addNode('html', undefined, '<br />')
    } else {
      serializeText(state, node)
    }
    state.closeNode()
  },
},
```

Empty paragraphs (except the last one in the document) are serialized as `<br />` HTML nodes in the MDAST, which remark-stringify outputs as literal `<br />`. On re-parse, the `remarkPreserveEmptyLinePlugin` strips these. This creates a cycle: empty paragraph -> `<br />` in markdown -> stripped on re-parse -> empty paragraph. But arbitrary whitespace patterns (multiple blank lines, etc.) are not preserved.
