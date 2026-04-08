---
title: Fumadocs Serialization Compatibility — jsx-component fences are NOT valid MDX
description: Critical finding. Fenced code blocks with jsx-component info string render as code snippets in fumadocs, not as components. The on-disk format must be raw JSX for fumadocs compatibility. This reopens D1.
created: 2026-04-08
last-updated: 2026-04-08
---

## THE FINDING

When fumadocs processes a file containing:
````
```jsx-component
<Callout type="warning">content</Callout>
```
````

It renders a **syntax-highlighted code snippet** showing the literal text. The Callout component is never instantiated.

**Confidence:** CONFIRMED from fumadocs source trace:
1. marked/micromark parses code fence → MDAST `code` node with `lang: "jsx-component"`
2. rehypeCode passes to Shiki → `jsx-component` is not a recognized language → falls back to plaintext
3. defaultMdxComponents maps `pre` → `<CodeBlock>` → rendered as styled code block

## How fumadocs ACTUALLY renders components

Raw JSX in MDX files:
```mdx
<Callout type="warning">
  Always run integration tests before deploying.
</Callout>
```

MDX compiler (`@mdx-js/mdx` with `micromark-extension-mdxjs`) parses `<Callout>` as `mdxJsxFlowElement` → compiled to `_jsx(Callout, { type: "warning", children: ... })` → resolved from `getMDXComponents()` at runtime.

## Every MDX documentation tool uses raw JSX

- Fumadocs: raw JSX
- Docusaurus: raw JSX
- Mintlify: raw JSX
- Storybook MDX: raw JSX
- agents-docs (Inkeep): raw JSX

The `jsx-component` fenced format is unique to Open Knowledge and incompatible with the MDX ecosystem.

## Fumadocs HAS a remark plugin pattern for custom code fences

Three existing examples:
- `remarkNpm`: transforms `lang: "npm"` code blocks → `<CodeBlockTabs>` JSX
- `remarkCodeTab`: transforms code blocks with `tab` meta → `<Tabs><Tab>` JSX
- `remarkAdmonition`: transforms `:::warning` → `<Callout type="warn">` JSX

A `remarkJsxComponent` plugin COULD transform `jsx-component` fences → JSX AST nodes. But this is architecturally backward — re-implementing part of the MDX parser for content that should just be raw JSX.

## The fundamental tension

- **Editor (TipTap + marked):** `marked` doesn't understand JSX. Code fences provide a clean tokenization boundary.
- **Fumadocs/MDX:** Raw JSX is compiled to React components. Code fences are code blocks.

These are different parse pipelines with different input requirements.

## Architectural options

**Option A — Raw JSX on disk, editor adapts:**
Files contain raw JSX. Editor must handle JSX in marked (custom tokenizer or pre-processing).
Pro: Files are valid MDX everywhere. Con: Editor parser complexity.

**Option B — Fenced code blocks + remark plugin:**
Files contain fences. Custom remark plugin transforms to JSX AST for fumadocs.
Pro: Editor unchanged. Con: Non-standard format, re-implements MDX parsing.

**Option C — Dual-layer transform at persistence boundary:**
Files contain raw JSX (valid MDX). Persistence layer wraps JSX in fences on load (for editor) and unwraps on save (for disk). Editor pipeline unchanged internally.
Pro: Both worlds work. Con: Two transforms to maintain; source mode shows fenced format (leaky abstraction).

**Option D — Source-mode-first architecture:**
CM6 is primary editor, raw MDX text. TipTap WYSIWYG is secondary/optional with transforms.
Pro: Raw MDX everywhere. Con: Architecture shift.
