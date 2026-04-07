---
title: "TipTap markdown round-trip fidelity — technical findings"
type: raw-proof
created: 2026-04-02
---

## TLDR
TipTap @3.22 handles standard CommonMark round-trip. Output is valid equivalent markdown, not byte-identical. Custom blocks (frontmatter, callouts) need custom extensions. Risk is medium (integration work), not high (fundamental research).

## What round-trips today
- Basic formatting, headings, paragraphs, blockquotes
- Lists (ordered, unordered, nested — with edge cases on nested)
- Code blocks (fenced), links, images
- Tables (GFM), task lists (GFM)

## What doesn't round-trip
- Soft breaks: \n → spaces (CommonMark spec, by design)
- Hard breaks: extra newlines (Issue #80)
- Ordered list start numbers: 5. → 1. (Issue #7353)
- Alternative syntax normalizes: *bold* → **bold**
- Input/output inconsistency: Issue #7147 (open)

## What's not supported
- YAML frontmatter: custom pre/post-processing needed
- Callouts/admonitions: custom tokenizer (TipTap has extension point)
- Math blocks: custom extension
- Footnotes: custom extension

## Key decision: BlockNote ruled out
BlockNote's markdown export is explicitly named `blocksToMarkdownLossy()`. It's designed for JSON-canonical, markdown-as-export. Incompatible with markdown-canonical architecture.

## Architecture implication
TipTap @tiptap/markdown uses MarkedJS for tokenization (CommonMark-compliant). Custom tokenizers can extend it. The extension model supports custom block types with custom serialization. This is the right foundation for markdown-canonical editing.

## JSX/MDX handling (updated 2026-04-03)
These findings apply to **standard markdown content** in the WYSIWYG editor. JSX/MDX round-trip is handled separately via **void nodes** — JSX components are stored as raw strings in void nodes, output verbatim (no conversion, no round-trip issue). The markdown serializer never touches JSX content.

The original framing of this evidence (scoping TQ3 for MDX WYSIWYG editing) was superseded by the void-node architecture after the mdx-crdt-roundtrip-fidelity research proved full WYSIWYG MDX round-trip has 6 failure vectors. See `/reports/mdx-crdt-roundtrip-fidelity/`.

## Sources
- @tiptap/markdown 3.22.0 (npm, April 2026)
- TipTap Issue #7147 (input/output inconsistency)
- TipTap Issue #7353 (ordered list start)
- ProseMirror Issue #80 (hard breaks)
- BlockNote docs: blocksToMarkdownLossy()
- y-prosemirror: does NOT affect markdown round-trip (operates on ProseMirror doc model)
