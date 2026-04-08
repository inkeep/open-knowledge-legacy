---
title: TipTap MarkdownManager Fragment Serialization for Layer 3
description: How parseMarkdown creates nodes with child content, and how renderMarkdown serializes content fragments back to markdown. Blockquote + listItem as reference patterns.
created: 2026-04-08
last-updated: 2026-04-08
---

## Finding 1: helpers.createNode() accepts child content as third parameter
**Confidence:** CONFIRMED (source: tiptap/packages/markdown/src/MarkdownManager.ts:615-627)

```typescript
createNode: (type: string, attrs?: any, content?: JSONContent[]) => { ... }
```

Current jsxComponent passes only attributes. Layer 3 must pass children as the third parameter.

## Finding 2: helpers.parseBlockChildren() converts tokens to ProseMirror fragment
**Confidence:** CONFIRMED (source: MarkdownManager.ts:603-605)

```typescript
parseBlockChildren: (tokens: MarkdownToken[]) => this.parseTokens(tokens, true)
```

Used by blockquote and listItem to parse nested markdown tokens into JSONContent arrays.

## Finding 3: h.renderChildren() serializes fragment arrays to markdown
**Confidence:** CONFIRMED (source: MarkdownManager.ts:936-945)

```typescript
renderChildren: (nodes: JSONContent | JSONContent[], separator?: string) => string
```

Blockquote uses this to serialize its children back to markdown with `> ` prefix.

## Finding 4: Blockquote is the reference pattern
**Confidence:** CONFIRMED (source: tiptap/packages/extension-blockquote/src/blockquote.tsx:68-104)

**parseMarkdown:**
```typescript
parseMarkdown: (token, helpers) => {
  const parseBlockChildren = helpers.parseBlockChildren ?? helpers.parseChildren
  return helpers.createNode('blockquote', undefined, parseBlockChildren(token.tokens || []))
}
```

**renderMarkdown:**
```typescript
renderMarkdown: (node, h) => {
  if (!node.content) return ''
  node.content.forEach((child, index) => {
    const childContent = h.renderChild?.(child, index) ?? h.renderChildren([child])
    // ... prefix with '> '
  })
}
```

## Finding 5: CRITICAL CONSTRAINT — code fence tokens don't have pre-parsed children
**Confidence:** INFERRED

Code fence tokens (`token.type === 'code'`) store content as `token.text` (raw string), NOT as `token.tokens` (pre-parsed). Blockquote receives `token.tokens` because marked pre-parses blockquote content.

**Implication:** We cannot call `helpers.parseBlockChildren(token.tokens)` directly on a code fence token. We need to:
1. Extract the JSX children string from the code fence content
2. Re-parse that children markdown string into tokens ourselves
3. Then pass the result to `helpers.createNode()`

**Options for re-parsing children markdown:**
- A) Call `mdManager.parse()` on the children string and extract the content array — but mdManager may not be accessible from the parseMarkdown hook
- B) Use marked's lexer directly to tokenize the children markdown
- C) Store children as a raw string attribute during parse, then hydrate to ProseMirror nodes in a post-processing step (editor-side, not parser-side)
- D) Create a custom markdown-it/marked plugin that pre-parses jsx-component fence content

**Option C is likely the pragmatic path for P0** — parse children lazily during editor hydration rather than in the markdown parser.
