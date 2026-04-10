# Evidence: Loro Peritext Rich Text Implementation

**Dimension:** D1 — Loro Peritext rich text implementation
**Date:** 2026-04-07
**Sources:** loro.dev/llms-full.txt, github.com/loro-dev/crdt-richtext, loro.dev/blog/loro-richtext, HN discussion

---

## Key files / pages referenced

- https://www.loro.dev/llms-full.txt — Full docs including rich text API
- https://github.com/loro-dev/crdt-richtext — Standalone Peritext+Fugue Rust implementation (306 stars)
- https://loro.dev/blog/loro-richtext — Blog post on Loro's rich text CRDT
- https://news.ycombinator.com/item?id=39102577 — HN discussion on Loro rich text

---

## Findings

### Finding: Loro implements Peritext boundary semantics via mark expand flags
**Confidence:** CONFIRMED
**Evidence:** loro.dev/llms-full.txt (rich text section)

Loro supports per-mark boundary expansion behavior via an `expand` flag with three modes:

- `after` (default): text inserted at the end of a marked range inherits the mark. Appropriate for bold, italic.
- `before`: text inserted at the start of a marked range inherits the mark.
- `none`: inserted text never inherits the mark. Appropriate for links, comments.

Configuration example from docs:
```
"bold: { expand: 'after' }, link: { expand: 'none' }"
```

This directly implements the core Peritext boundary semantics that Yjs lacks entirely (Yjs has no per-mark expand flag; it always inherits formatting from adjacent markers).

**Implications:** Loro correctly handles the Peritext edge cases that matter for rich text — bold text at the boundary expands to include new characters, while links do not. This is the behavior the Peritext paper identifies as essential for intuitive rich text collaboration.

### Finding: Loro uses "style anchors" rather than Peritext's original approach
**Confidence:** CONFIRMED
**Evidence:** Web search results, loro.dev/blog/loro-richtext

Loro uses "style anchors" — special control characters in the CRDT sequence that mark formatting boundaries. This differs from Peritext's reference implementation approach but achieves the same semantics. The reason: Loro is based on the Event Graph Walker (Eg-walker) algorithm, which cannot integrate the original Peritext algorithm directly. The Loro team created a new rich text algorithm that is independent of specific List CRDTs and works with Eg-walker.

### Finding: Loro's rich text model is flat text + formatting annotations
**Confidence:** CONFIRMED
**Evidence:** loro.dev/llms-full.txt

LoroText API:
- `insert(pos, text)` — insert plain text
- `delete(pos, len)` — delete text
- `mark(range, key, value)` — apply formatting to a range
- `unmark(range, key)` — remove formatting
- `updateByLine()` — line-level operations
- `getCursor(pos)` — get stable cursor position

The model is flat text with mark annotations — not a tree structure. Marks are applied to ranges with key-value pairs (e.g., "bold": true, "link": "https://..."). This is semantically identical to Automerge's Peritext implementation and fundamentally different from Yjs's Y.XmlFragment tree model.

### Finding: Rich text optimizes away when not used
**Confidence:** CONFIRMED
**Evidence:** loro.dev/llms-full.txt

"The system optimizes by operating as plain text when no rich text features are used, maintaining O(log N) complexity for insert/delete operations via internal B-tree structure."

### Finding: Block-level structure is NOT part of Loro's rich text model
**Confidence:** CONFIRMED
**Evidence:** HN discussion (item 39102577)

HN commenters noted Loro "hasn't focussed a lot on rich-text block elements (like lists, tables & sections)." The Peritext model (and Loro's implementation) focuses on inline formatting. Block-level structure must be handled at a higher layer — either by the ProseMirror schema mapping or by using Loro's tree/list types for document structure.

**Implications:** This mirrors Automerge's situation. The ProseMirror binding must map ProseMirror's tree document model onto Loro's flat text + marks for inline content, with some other Loro container type (likely LoroMap or LoroList) for block structure.

### Finding: Comparison to Automerge's Peritext implementation
**Confidence:** INFERRED
**Evidence:** Cross-referencing Peritext paper, Automerge docs, Loro docs

Both Loro and Automerge implement the core Peritext boundary semantics:
- Both use flat text + mark annotations
- Both support per-mark expand behavior
- Both handle concurrent overlapping format operations correctly

Key differences:
- Automerge uses the original Peritext algorithm on top of its own CRDT
- Loro uses style anchors with Eg-walker, a reimagined approach that achieves the same semantics
- Loro claims better merge behavior via Fugue (maximal non-interleaving)
- Automerge's implementation is more battle-tested (Ink & Switch research backing)

---

## Gaps / follow-ups

- Exact behavior during concurrent overlapping format operations (e.g., two users bold overlapping ranges) — not tested firsthand
- Performance of mark operations on very large documents
- How Loro handles mark deletion when the marked text is partially deleted
