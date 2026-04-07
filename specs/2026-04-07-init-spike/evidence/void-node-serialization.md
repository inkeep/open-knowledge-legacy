---
title: Void node markdown serialization approach
type: evidence
sources:
  - npm:@tiptap/markdown
  - CommonMark spec (fenced code blocks)
  - npm:marked
verified: 2026-04-07
---

# Void Node Markdown Serialization

## Decision: Fenced code block with custom info string

```
```jsx-component
<Callout type="warning">Some text</Callout>
```
```

## Why this approach wins

1. **Verbatim preservation by spec.** CommonMark defines fenced code block content as literal — no escaping, no entity conversion, no transformation. The JSX string survives exactly.
2. **Graceful degradation.** Any markdown renderer shows it as a code block labeled "jsx-component" — readable, not broken.
3. **Simple parsing.** In @tiptap/markdown (which uses marked): intercept `code` tokens where `lang === 'jsx-component'` via `walkTokens` hook. No custom tokenizer needed.
4. **Edge case handling.** Only edge case: closing ``` on its own line inside JSX. Solvable by using 4+ backticks as the fence delimiter.

## Rejected alternatives

**A. Raw HTML passthrough:** JSX isn't valid HTML — expression attributes (`count={3}`), self-closing components (`<Spacer />`), fragments (`<>...</>`) break HTML parsing. Fragile.

**B. HTML comment wrapper:** Content inside `<!-- -->` is opaque but invisible in rendered markdown (bad UX in non-aware renderers). Also breaks if JSX contains `-->`.

**D. Pandoc fenced directive (:::):** What `createAtomBlockMarkdownSpec()` uses. Neither marked nor markdown-it understand `:::` natively. Body content is parsed as markdown by default — raw JSX inside would get mangled. Fine for attribute-only void nodes, not for storing arbitrary JSX strings.

## Implementation in the spike
- Define a TipTap extension with `atom: true`, `group: 'block'`
- Store raw JSX in a `content` string attribute
- `renderMarkdown`: emit fenced code block with `jsx-component` info string
- `parseMarkdown`: intercept `code` tokens with matching lang, create the void node
- ReactNodeViewRenderer renders the actual React component for preview
