# Evidence: D3 — Google Docs OT-based mark composition

**Dimension:** D3
**Date:** 2026-04-17
**Sources:** UW/IDL 2010 paper, DEV.to explainer, Wikipedia OT article

---

## Key pages referenced

- https://idl.uw.edu/future-scholarly-communication/files/2010-GoogleDocs-OT.pdf — the definitive "What's different about the new Google Docs" technical paper
- https://dev.to/dhanush___b/how-google-docs-uses-operational-transformation-for-real-time-collaboration-119
- https://en.wikipedia.org/wiki/Operational_transformation — OT origins (Ellis & Gibbs 1989, MCC — NOT Xerox PARC)

---

## Findings

### Finding: Google Docs reduces all edits to three op kinds: insert, delete, apply-style

**Confidence:** CONFIRMED
**Evidence:** UW/IDL paper on Google Docs architecture:

> "In Google documents, all edits boil down to three basic types of changes: inserting text, deleting text, and applying styles to a range of text."

### Finding: Concurrent non-conflicting style ops compose cleanly — a range can be both red and italic

**Confidence:** CONFIRMED
**Evidence:** UW/IDL paper:

> "when a style change is transformed against a different type of style change, there is no conflict: {ApplyStyle italic @10-20} transformed against {ApplyStyle font-color=red @0-30} results in the same {ApplyStyle italic @10-20} because the range of text can be both red and italic simultaneously."

### Finding: Marks are semantic operations on RANGES, not serialized inline source chars

**Confidence:** CONFIRMED
**Evidence:** The OT edit algebra: `{ApplyStyle italic @10-20}` — a range-typed operation, not a character insert.

When Google Docs transforms a concurrent `{ApplyStyle bold @0-5}` against an insert at position 3, the OT system adjusts the range bounds — it does NOT represent bold as two `**` character inserts.

### Finding: OT was invented at MCC (Austin, TX) by Ellis & Gibbs 1989, NOT Xerox PARC

**Confidence:** CONFIRMED
**Evidence:** Wikipedia OT article + academic consensus:

> "Operational Transformation was pioneered by C. Ellis and S. Gibbs in the GROVE (GRoup Outline Viewing Edit) system in 1989. Developed by Clarence A. Ellis and Simon J. Gibbs at Microelectronics and Computer Technology Corporation (MCC) in Austin, Texas."

### Finding: Google Docs adopted OT for collaboration features in 2009 (via Apache Wave work)

**Confidence:** CONFIRMED
**Evidence:** Wikipedia OT article history section.

---

## Implications

- Google Docs is the largest-scale production editor with full concurrent rich-text semantics.
- Marks are typed range operations that compose by orthogonal-style-stack: italic @10-20 + bold @5-15 composes trivially because bold and italic apply to ranges independently.
- Char-RGA on serialized chars is NOT what Google Docs ships.
- Same-attribute concurrent operations (e.g., bold @5-10 vs bold @7-12) transform against inserts/deletes to adjust bounds — still not char-RGA, still semantic-op-typed.

---

## Gaps / follow-ups

- Google Docs' exact same-attribute same-range concurrent-bold resolution (e.g., bold+unbold the same text span at the same time) is not publicly documented beyond the general OT framework.
- The private-Google OT implementation has evolved since 2010; the paper is the last detailed public description.
