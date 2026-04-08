---
title: Children Parsing Strategy — marked.lexer() + helpers.parseBlockChildren()
description: Resolved OQ13. Code fence children can be parsed into ProseMirror fragments by tokenizing with marked.lexer() then passing tokens to helpers.parseBlockChildren(). No circular dependencies, no MarkdownManager access needed.
created: 2026-04-08
last-updated: 2026-04-08
---

## The Problem
Code fence tokens (`token.type === 'code'`) store content as `token.text` (raw string), not pre-parsed `token.tokens`. The `parseMarkdown(token, helpers)` hook can't call `helpers.parseBlockChildren(token.tokens)` because `token.tokens` is empty.

## The Solution: marked.lexer() + helpers.parseBlockChildren()

```typescript
import { marked } from 'marked';

parseMarkdown(token, helpers) {
  // token.type === 'jsxBlock' from custom markdownTokenizer (D11)
  const jsxString = token.content || '';
  const { componentName, props, childrenMarkdown } = parseJsx(jsxString); // acorn
  
  // Tokenize children markdown with marked's lexer
  const childTokens = marked.lexer(childrenMarkdown);
  
  // Parse tokens into ProseMirror JSON content array
  const parseBlockChildren = helpers.parseBlockChildren ?? helpers.parseChildren;
  const childContent = parseBlockChildren(childTokens);
  
  // Create node with both attributes AND child content
  return helpers.createNode('jsxComponentEditable', { componentName, ...props }, childContent);
}
```

## Why This Works
**Confidence:** CONFIRMED from source analysis

1. `helpers.parseBlockChildren()` accepts `MarkdownToken[]` — any array of marked tokens, not just `token.tokens` from the current token. (Source: MarkdownManager.ts:605)
2. `marked.lexer(markdownString)` returns the same `Token[]` type that marked's internal pipeline produces. (marked is already a transitive dependency via @tiptap/markdown)
3. `helpers.createNode(type, attrs, content)` accepts an optional third parameter for child content. (Source: MarkdownManager.ts:615-627)
4. No circular dependency — `marked` is imported directly, no reference to MarkdownManager needed.

## Why NOT Use Other Approaches

### Closure over mdManager (Option C from spec)
**NOT viable.** `parseMarkdown` is a static function on the extension config — no `this` context, no editor instance. A closure would create a circular dependency: sharedExtensions → JsxComponent → mdManager → sharedExtensions.

Lazy init workaround exists but is fragile (global mutable state, timing-dependent).

### Access MarkdownManager from helpers
**NOT possible.** The helpers object provides: `parseInline`, `parseChildren`, `parseBlockChildren`, `createTextNode`, `createNode`, `applyMark`. No reference to the MarkdownManager instance. (Source: core/src/types.ts:896-913)

### Custom marked plugin (Option B from spec)
**Unnecessary.** marked.lexer() gives us the tokens we need without modifying the marked pipeline.

## For renderMarkdown (serialize direction)
Already confirmed working:

```typescript
renderMarkdown(node, h) {
  const componentName = node.attrs?.componentName || '';
  const props = extractPrimitivePropsAsJsxAttrs(node.attrs);
  
  // Serialize children ProseMirror fragment to markdown
  const childrenMarkdown = node.content?.length
    ? h.renderChildren(node.content)
    : '';
  
  // Raw JSX on disk (D1 revised, D13) — no fencing
  const indentedChildren = childrenMarkdown ? indent(childrenMarkdown, '  ') : '';
  return `<${componentName}${props}>\n${indentedChildren}\n</${componentName}>`;
}
```

`h.renderChildren()` handles fragment → markdown. (Source: blockquote.tsx:74-104)

## Reference Patterns
- **Blockquote parseMarkdown:** `helpers.createNode('blockquote', undefined, parseBlockChildren(token.tokens))` — same pattern, but blockquote gets pre-parsed tokens
- **ListItem parseMarkdown:** Same — calls `parseBlockChildren(token.tokens)` on pre-parsed nested content
- **Our adaptation:** We manually tokenize with `marked.lexer()` first, then use the same `parseBlockChildren()` path
