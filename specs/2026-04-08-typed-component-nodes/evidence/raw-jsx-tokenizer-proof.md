---
title: Raw JSX markdownTokenizer — Proven via Prototype (24/24 tests pass)
description: Complete proof that TipTap's markdownTokenizer API supports raw JSX on disk. Prototype built and tested. All edge cases pass. Round-trips are stable.
created: 2026-04-08
last-updated: 2026-04-08
---

## Summary

The `markdownTokenizer` API in TipTap v3 (@tiptap/markdown with marked v17) is a first-class extension point that lets us register a custom block tokenizer. This tokenizer intercepts raw JSX (uppercase tags like `<Callout>`) BEFORE marked's HTML tokenizer sees them, producing custom `jsxBlock` tokens.

**Prototype: 24/24 tests pass.** File: `init_spike/src/editor/extensions/jsx-tokenizer-prototype.test.ts`

## What was proven

| Test Category | Count | Status |
|---|---|---|
| Basic parsing (self-closing, paired, multiple) | 3 | Pass |
| Serialization (self-closing, paired children) | 2 | Pass |
| Round-trip stability | 4 | Pass |
| Mixed document (heading + paragraph + 4 JSX blocks) | 1 | Pass |
| Serialization fidelity | 3 | Pass |
| Edge: boolean attributes | 1 | Pass |
| Edge: expression attributes `{metrics}` | 1 | Pass |
| Edge: nested same-name tags | 1 | Pass |
| Edge: blank lines in children | 1 | Pass |
| Edge: JSX at start/end of document | 2 | Pass |
| Edge: multiple sequential JSX blocks | 1 | Pass |
| Edge: expression attributes with braces | 1 | Pass |
| Surrounding content preservation | 3 | Pass |

## Architecture comparison

| Aspect | Old (fenced code block) | New (markdownTokenizer) |
|---|---|---|
| On-disk format | `` ```jsx-component\n<Callout>...</Callout>\n``` `` | `<Callout>...</Callout>` |
| MDX valid? | No (wrapped in code fence) | Yes (raw JSX) |
| Extension priority hack? | Yes (priority 60 to beat codeBlock) | No (own token type) |
| Token name | `code` (shared with codeBlock) | `jsxBlock` (dedicated) |
| Fumadocs compatible? | No (renders as code snippet) | Yes (raw JSX compiled to component) |

## How marked.js handles the tokenizer

From TipTap's MarkdownManager.ts (lines 179-231):
1. Extension declares `markdownTokenizer` with `name`, `level`, `start`, `tokenize`
2. MarkdownManager.registerTokenizer() wraps it as a `TokenizerExtension`
3. Calls `this.markedInstance.use({ extensions: [markedExtension] })`
4. Custom tokenizer runs BEFORE built-in tokenizers (marked extension priority)
5. `raw` field length controls cursor advancement

## Server-side behavior (persistence.ts)

Custom tokenizer works server-side because:
- MarkdownManager constructor registers tokenizer via `marked.use()` (global to that instance)
- persistence.ts creates MarkdownManager from sharedExtensions (line 28)
- Server-side `parseHTMLToken` fallback is NEVER reached because tokens are `jsxBlock`, not `html`
- **Confirmed:** No `typeof window` issues — tokenizer is pure regex, no DOM APIs

## Observer sync compatibility

- Observer A (tree→text): renderMarkdown outputs raw JSX → Y.Text contains raw JSX
- Observer B (text→tree): marked.parse() fires custom tokenizer → creates jsxBlock tokens → parseMarkdown creates nodes
- Round-trip stable: same JSX in → same node out → same JSX back → no shimmer
- Origin guards unchanged (sync-from-tree / sync-from-text)
- **No changes needed to observers.ts**

## Source mode display

Y.Text contains raw JSX (no fences). CodeMirror's Lezer markdown parser treats JSX tags as inline HTML — provides basic HTML syntax highlighting. This is correct (shows what's on disk).

## Three tokenizer versions evaluated

| | Version A (simple) | Version B (robust) | Version C (acorn) |
|---|---|---|---|
| Lines | ~20 | ~80 | N/A (delegates) |
| Nested same-name | No | Yes (tag counting) | Yes |
| Expression attrs with `>` | Yes (via backtracking) | Yes (brace depth) | Yes |
| Dependencies | None | None | acorn + acorn-jsx |

**Recommendation: Version B** — ~80 lines, zero deps, handles all edge cases including nested same-name (which is a latent bug in Version A even though agents-docs has zero occurrences).

## Dual-format migration

Two extensions can coexist:
- `JsxComponentFenced`: markdownTokenName 'code', parses old fenced format
- `JsxComponentRaw`: markdownTokenName 'jsxBlock' + custom tokenizer, parses AND serializes raw format
- Both create the same node type. Last registered renderMarkdown wins (raw format).
- Old content opens correctly, saves as raw JSX. Transparent migration.
