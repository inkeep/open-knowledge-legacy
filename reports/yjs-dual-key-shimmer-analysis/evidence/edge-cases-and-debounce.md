# Evidence: Edge Cases and Debounce Safety Net

**Dimension:** Edge cases that could break idempotency + Debounce as safety net
**Date:** 2026-04-07
**Sources:** @tiptap/markdown source, marked v17 behavior, Yjs source

---

## Key files referenced

- `tiptap/packages/markdown/__tests__/conversion.spec.ts` — Round-trip test coverage
- `tiptap/packages/markdown/src/MarkdownManager.ts` — HTML entity handling
- `yjs/src/utils/Transaction.js` — Transaction batching

---

## Findings

### Finding: Edge cases that COULD break idempotency

**Confidence:** Mixed (see individual assessments)

#### 1. HTML comments
**Assessment:** UNCERTAIN
The official @tiptap/markdown does not have explicit test cases for HTML comments (`<!-- comment -->`). Behavior depends on whether a registered extension handles `html` type tokens. If no handler is registered, the comment would be dropped on parse, making `parse(serialize(parse(x))) !== parse(x)` trivially true (the comment is simply removed). This is a one-time normalization and IS idempotent.

#### 2. Raw HTML blocks
**Assessment:** CONFIRMED (partial loss, idempotent)
Raw HTML blocks like `<div class="custom">content</div>` depend on extension registration. The official @tiptap/markdown has sophisticated inline HTML handling (MarkdownManager.ts lines 660-700) that detects and merges split HTML tags. However, arbitrary block-level HTML without a registered handler would be dropped. This is idempotent -- once dropped, it stays dropped.

#### 3. Link titles with special characters
**Assessment:** CONFIRMED (idempotent)
Evidence: link-with-title.ts test file shows:
```
[click here](https://example.com "Example Site")
```
Round-trips correctly. Special characters in link titles (quotes, parens) are handled by marked's tokenizer.

#### 4. Code blocks containing markdown syntax
**Assessment:** CONFIRMED (idempotent)
Code block content is treated as literal text. marked's lexer produces a `code` token with the raw content. The serializer wraps it in fences without interpretation. Markdown syntax inside code blocks is preserved verbatim.

#### 5. Nested blockquotes
**Assessment:** INFERRED (likely idempotent)
The official @tiptap/markdown handles blockquotes via extension handlers. marked produces nested `blockquote` tokens. The serializer would output `> ` prefixed lines with nesting (`> > `). No evidence of normalization that would differ between cycles.

#### 6. Footnotes
**Assessment:** NOT FOUND
No footnote extension in the standard @tiptap/markdown test suite. Footnotes would require a custom extension. If implemented, they would follow the same token->JSON->markdown pattern and should be idempotent if the extension is well-written.

#### 7. &quot; entity normalization
**Assessment:** CONFIRMED (idempotent after one cycle)
Evidence: conversion.spec.ts lines 465-494

`&quot;` -> parse -> `"` -> serialize -> `"` (NOT back to `&quot;`)

This means:
- Cycle 1: `&quot;` -> `"` (normalization)
- Cycle 2: `"` -> `"` (stable)

The ProseMirror JSON contains the literal `"`, and the serializer does not re-encode quotes. This is a one-time normalization.

#### 8. NBSP character vs &nbsp; entity
**Assessment:** CONFIRMED (idempotent after one cycle)
Evidence: conversion.spec.ts lines 321-337

Literal `\u00A0` -> parse -> empty paragraph (content=[]) -> serialize -> blank line spacing (no `&nbsp;`)
Then: blank line spacing -> parse -> paragraphs -> serialize -> same blank line spacing (stable)

### Finding: Patterns that are NOT present in @tiptap/markdown (but were in tiptap-markdown)
**Confidence:** CONFIRMED

Several normalizations from the source-toggle report were specific to the third-party `tiptap-markdown` which uses markdown-it + HTML intermediary:
- **DOM whitespace normalization:** Not applicable (no DOM intermediary)
- **ProseMirror paragraph wrapping changes:** Not applicable (direct token->JSON)
- **HTML attribute rewriting:** Not applicable (no HTML rendering step)

### Finding: Debounce as safety net -- analysis

**Confidence:** INFERRED

#### Can observers be debounced?

Yes. Yjs observers are synchronous callbacks, but the dual-key sync observers would be application-level code. They can be debounced:

```javascript
import { debounce } from 'lodash';

const syncTextToTree = debounce((markdown) => {
    doc.transact(() => {
        const json = markdownManager.parse(markdown);
        // ... apply diff to Y.XmlFragment
    }, 'sync-from-text');
}, 50);

yText.observe((event, transaction) => {
    if (transaction.origin === 'sync-from-tree') return;
    syncTextToTree(yText.toString());
});
```

#### UX impact of 50ms debounce

- 50ms is below the human perception threshold (~100ms for visual feedback)
- Keystroke-to-update delay would be: keystroke -> immediate Y.Text update -> 50ms debounce -> tree update -> ProseMirror render
- For users in WYSIWYG mode seeing source changes: 50ms delay is imperceptible
- For users typing in source mode: they see their own characters immediately (Y.Text is updated synchronously by y-codemirror), the WYSIWYG view updates 50ms later

#### Does debouncing break CRDT ordering guarantees?

**No.** Debouncing occurs at the application layer, ABOVE the CRDT. The Y.Text operations are already applied synchronously with correct CRDT ordering. The debounce only delays the cross-representation sync (text -> tree or tree -> text). This is an application-level concern, not a CRDT ordering concern.

The only risk: if two rapid keystrokes happen within the debounce window, the intermediate state is never synced to the other representation. But this is actually BENEFICIAL -- it reduces unnecessary intermediate conversions.

#### When would debounce be needed?

Based on the cascade analysis, debounce should NOT be needed for shimmer prevention -- the origin guards + no-op detection already provide complete protection. Debounce would be a performance optimization to avoid running the parse/serialize pipeline on every keystroke.

For a 50KB document:
- Parse: marked lexer ~5-10ms (extrapolated from benchmarks)
- Serialize: ~5-10ms
- Delta diff: ~5-10ms
- Total: ~15-30ms per cycle

At fast typing (120 WPM = ~10 chars/second = one every 100ms), a 50ms debounce would cut the conversion frequency in half without perceptible delay.

**Implications:**
1. Edge cases that break idempotency are limited and all stabilize after one cycle
2. Debounce is a performance optimization, not a correctness requirement
3. The combination of origin guards + no-op detection is sufficient for shimmer prevention
4. Debounce does NOT break CRDT guarantees

---

## Gaps / follow-ups

* Benchmark actual parse/serialize times for 50KB documents with @tiptap/markdown
* Test with rapid (>120 WPM) automated input to verify debounce thresholds
