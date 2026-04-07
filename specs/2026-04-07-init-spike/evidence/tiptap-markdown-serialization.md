---
title: TipTap markdown serialization options
type: evidence
sources:
  - npm:@tiptap/markdown@3.22.1
  - npm:prosemirror-markdown
  - npm:tiptap-markdown@0.8.10
verified: 2026-04-07
---

# TipTap Markdown Serialization Options

## @tiptap/markdown (official, v3.22.1)
- Uses `marked` (^17.0.1) internally — NOT prosemirror-markdown, NOT markdown-it
- CommonMark-compliant tokenization
- Each TipTap extension defines `parseMarkdown` (token→node) and `renderMarkdown` (node→string)
- Stock extensions (headings, lists, code blocks, links, images, bold, italic) ship with both parse and render rules
- Custom extensions (including void nodes) MUST define both sides manually — no automatic fallback
- If a custom node lacks `renderMarkdown`, it is **silently dropped** during serialization

## prosemirror-markdown
- Uses `markdown-it` internally
- CommonMark only: paragraphs, headings, blockquotes, code blocks, lists, images, links, emphasis, strong, inline code
- **No support for:** tables, strikethrough, frontmatter, task lists, or any GFM extension
- Community `prosemirror-remark` (uses remark/unified) adds GFM and frontmatter

## tiptap-markdown (community, @aguingand, v0.8.10)
- Dependencies: markdown-it, prosemirror-markdown
- Maintainer has stated they will not address open issues since @tiptap/markdown exists
- **Do not use for new projects**

## Void node serialization patterns
For `atom: true` nodes, `@tiptap/markdown` requires a `renderMarkdown` rule. Common patterns:
1. **Pandoc fenced directives:** `:::blockName` / `:::` — TipTap ships `createAtomBlockMarkdownSpec()` utility
2. **HTML comment markers:** `<!-- custom:myBlock {...attrs} -->`
3. **Raw HTML passthrough:** `<div data-type="myNode" data-attrs="...">` if consumer supports HTML
4. **Image-like syntax:** `![type](id?param=value)` for embeds

## y-prosemirror vs y-tiptap
- TipTap v3: `@tiptap/extension-collaboration` depends on `@tiptap/y-tiptap` (^3.0.2) — NOT y-prosemirror directly
- `@tiptap/y-tiptap` is TipTap's maintained fork/wrapper of y-prosemirror, packaged under @tiptap scope
- v2 depended on y-prosemirror directly (pinned at 1.0.20, caused version conflicts with @hocuspocus/transformer)
- v3 migration resolved peer dependency issues

## Implication for spike
Use `@tiptap/markdown` (official). Write custom `parseMarkdown`/`renderMarkdown` for the void node extension. Tables need @tiptap/extension-table which ships with markdown rules in the official package. Frontmatter is NOT handled by any of these — needs custom pre/post processing.
