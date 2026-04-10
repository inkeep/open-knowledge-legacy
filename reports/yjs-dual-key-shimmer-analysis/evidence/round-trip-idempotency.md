# Evidence: Round-Trip Idempotency

**Dimension:** Round-trip idempotency proof for @tiptap/markdown
**Date:** 2026-04-07
**Sources:** @tiptap/markdown source (tiptap monorepo packages/markdown/), marked v17, conversion tests

---

## Key files referenced

- `packages/markdown/src/MarkdownManager.ts` — Core parse and serialize logic
- `packages/markdown/__tests__/conversion.spec.ts` — Round-trip test suite
- `packages/markdown/__tests__/conversion-files/*.ts` — Per-content-type round-trip fixtures
- `packages/markdown/package.json` — Confirms `marked ^17.0.1` dependency

---

## Findings

### Finding: @tiptap/markdown uses marked (not markdown-it) as its parser
**Confidence:** CONFIRMED
**Evidence:** packages/markdown/package.json line 38, MarkdownManager.ts line 20

```typescript
import { type Lexer, type Token, type TokenizerExtension, type TokenizerThis, marked } from 'marked'
```

The user's prompt referenced "marked is the parser inside @tiptap/markdown" -- this is correct. Note: the THIRD-PARTY package `tiptap-markdown` (npm: tiptap-markdown) uses markdown-it. The OFFICIAL `@tiptap/markdown` (in the tiptap monorepo) uses marked v17+.

### Finding: Parse path is markdown string -> marked lexer tokens -> JSONContent
**Confidence:** CONFIRMED
**Evidence:** MarkdownManager.ts lines 299-325

The parse path:
1. `marked.Lexer.lex(markdown)` produces token array
2. `parseTokens(tokens)` iterates tokens, dispatching to registered extension handlers
3. Each handler converts a token type to JSONContent (TipTap's ProseMirror JSON format)

There is NO intermediate HTML step in the official @tiptap/markdown. This differs from the third-party tiptap-markdown which goes markdown -> markdown-it -> HTML -> DOM -> ProseMirror.

### Finding: Serialize path is JSONContent -> markdown string via renderMarkdown handlers
**Confidence:** CONFIRMED
**Evidence:** MarkdownManager.ts lines 268-276, 913-972

The serialize path:
1. `serialize(docOrContent)` calls `renderNodes()`
2. `renderNodes()` dispatches to `renderNodesWithMarkBoundaries()` for arrays
3. Each node type has a registered `renderMarkdown` handler that produces markdown text
4. Mark boundaries (bold, italic, etc.) are tracked and opened/closed at the correct positions

### Finding: Round-trip tests pass for all standard content types
**Confidence:** CONFIRMED
**Evidence:** conversion.spec.ts lines 171-187

The test suite iterates all conversion files and runs TWO tests per content type:
1. `parse(expectedInput)` === `expectedOutput` (markdown -> JSON)
2. `serialize(expectedOutput).trim()` === `expectedInput.trim()` (JSON -> markdown)

Content types with passing round-trip tests:
- bullet-list
- ordered-list
- ordered-list-with-bullet-list
- ordered-list-separated-by-bullet
- mixed-list-types
- task-list
- link-with-title
- link-without-title
- hard-break-marks
- soft-break-marks
- trailing-whitespace-marks
- nested-nodes
- custom-block
- custom-atom
- custom-inline

### Finding: Code blocks normalize tilde to backtick -- but this IS idempotent
**Confidence:** CONFIRMED
**Evidence:** conversion.spec.ts lines 340-393

```
parse("~~~\ncode block\n~~~") === parse("```\ncode block\n```")
```

Both tilde and backtick fenced code blocks parse to the same JSON. The serializer always outputs backtick syntax. This means:
- First cycle: `~~~code~~~` -> JSON -> ` ```code``` `
- Second cycle: ` ```code``` ` -> JSON -> ` ```code``` ` (STABLE)

This is the idempotency condition: `serialize(parse(serialize(parse(x)))) === serialize(parse(x))` after one normalization.

### Finding: HTML entities round-trip correctly with one normalization
**Confidence:** CONFIRMED
**Evidence:** conversion.spec.ts lines 396-586

- `&lt;` -> parsed as `<` -> serialized as `&lt;` (ROUND-TRIP STABLE)
- `&amp;` -> parsed as `&` -> serialized as `&amp;` (ROUND-TRIP STABLE)
- `&quot;` -> parsed as `"` -> serialized as `"` (NORMALIZATION: entity form lost)
  - But: `"` -> parsed as `"` -> serialized as `"` (STABLE after one cycle)

### Finding: Multiple empty paragraphs use &nbsp; markers and round-trip with one normalization
**Confidence:** CONFIRMED
**Evidence:** conversion.spec.ts lines 189-338

The official test at line 265-267:
```typescript
const remarked = markdownManager.serialize(parsed)
expect(remarked).toBe(markdown)
```
This explicitly tests serialize(parse(serialize(json))) === serialize(json).

However, literal `\u00A0` (NBSP character) normalizes to blank-line spacing:
- `"Line1\n\n\u00A0\n\nLine2"` -> parse -> 3 nodes -> serialize -> `"Line1\n\n\n\nLine2"`
- `"Line1\n\n\n\nLine2"` -> parse -> 3 nodes -> serialize -> `"Line1\n\n\n\nLine2"` (STABLE)

### Finding: Hard breaks with trailing whitespace round-trip correctly
**Confidence:** CONFIRMED
**Evidence:** hard-break-marks.ts

The input `**Speaker:**  \nJohn Doe.` (two trailing spaces before newline) is parsed as a hardBreak node and serialized back to the same form.

**Implications:** The parse(serialize(parse(x))) === parse(x) condition holds for all standard content types in @tiptap/markdown. Normalizations exist but are idempotent -- they stabilize after exactly one cycle.

---

## Gaps / follow-ups

* Need to verify behavior for raw HTML blocks (not just entities)
* Need to verify reference-style links (marked may inline them)
* Indented code blocks need verification (marked may convert to fenced)
