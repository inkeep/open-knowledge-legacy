# Evidence: D9 — Peritext paper: boundary semantics and markdown interleaving example

**Dimension:** D9
**Date:** 2026-04-17
**Sources:** Peritext paper (Litt, Lim, Kleppmann, van Hardenberg 2022), Kleppmann's blog, Peritext reference implementation

---

## Key pages referenced

- https://www.inkandswitch.com/peritext/ — primary essay
- https://www.inkandswitch.com/peritext/static/cscw-publication.pdf — CSCW 2022 paper
- https://github.com/inkandswitch/peritext — reference implementation
- https://dl.acm.org/doi/abs/10.1145/3555644 — ACM PACMHCI publication
- https://martin.kleppmann.com/2022/11/08/peritext-rich-text-crdt.html — Kleppmann's announcement post

---

## Findings

### Finding: The paper's "Example 3" shows EXACTLY the char-RGA-on-markdown interleaving artifact

**Confidence:** CONFIRMED
**Evidence:** Peritext essay (inkandswitch.com) and verified WebFetch extraction:

Alice bolds "The fox" while Bob independently bolds "fox jumped."
- Alice produces: `**The fox** jumped.`
- Bob produces: `The **fox jumped.**`

When merged as plain text via a naive char CRDT (each asterisk is just a char in the RGA), asterisks interleave:

```
**The **fox** jumped.**
```

This renders as: `**The** fox **jumped**` — with "fox" becoming NON-BOLD despite both users intending it bold. The opening `**` Bob placed before "fox" is now interpreted as CLOSING Alice's span.

**This is the canonical argument against char-RGA-on-serialized-markdown for concurrent rich-text collaboration** — it's the exact scenario the paper exists to address.

### Finding: Yjs's control-character approach suffers the SAME CLASS of problem

**Confidence:** CONFIRMED
**Evidence:** Peritext essay:

Yjs stores start/end ContentFormat markers inline in the sequence. When Bob and Alice both insert a `<bold>` start and a `</bold>` end at overlapping positions, the merged sequence can be `<bold>The <bold>fox</bold> jumped.</bold>` — rendering incorrectly because the NESTED `</bold>` closes the outer bold prematurely.

> "When we reach the end of the word 'fox', we know there is a bold range active, but the `</bold>` character after 'fox' ends that bolded range."

This is WHY Peritext was created: the marker-item approach and the literal-asterisk approach are structurally equivalent failures.

### Finding: Peritext's core fix is "mark operation SETS at character anchors" — not inline markers

**Confidence:** CONFIRMED
**Evidence:** Peritext essay:

- Each character has two anchor positions (before/after)
- Each mark operation has a unique opId and attaches to anchors
- Each character position carries `markOpsBefore` and `markOpsAfter` — SETS of active operations
- Rendering walks through the character sequence, carrying forward the set of active operations, producing correct bold/italic/link spans

### Finding: Peritext's per-mark `expand` flags solve the boundary problem

**Confidence:** CONFIRMED
**Evidence:** Peritext essay:

Different mark types need different insert-at-boundary behavior:

- **Bold, italic:** `expand: "after"` at start AND `expand: "after"` at end — text inserted inside or at the end of a bold span inherits bold. (Example 8: inserting "quick" before a bold span also becomes bold because the bold start anchored "before start" with expand-after.)
- **Link, comment:** `expand: "before"` at start and `expand: "before"` at end — text inserted AFTER the last char of a link does NOT inherit the link.

The paper states:

> "While a bold or italic span grows to include text inserted at the end of the span, a link or comment span does not grow in the same way."

### Finding: For mutually-exclusive marks (text-color red vs text-color blue), Peritext uses LWW via opId

**Confidence:** CONFIRMED
**Evidence:** Peritext essay — when two mark-types cannot coexist at the same character, the operation with the higher opId wins.

### Finding: Peritext reference implementation is built on Micromerge (simplified Automerge) — NOT on Yjs

**Confidence:** CONFIRMED
**Evidence:** https://github.com/inkandswitch/peritext — README confirms Micromerge extension.

### Finding: Loro's crdt-richtext and Automerge both ship Peritext-compatible semantics; Yjs does NOT

**Confidence:** CONFIRMED
**Evidence:**
- Loro: https://github.com/loro-dev/crdt-richtext — "Rich text CRDT that implements Peritext and Fugue"
- Automerge: https://github.com/automerge/automerge-peritext (referenced from automerge-prosemirror ecosystem)
- Yjs: no public Peritext integration; Kevin Jahns has not publicly committed to adding boundary semantics (per prior OK research at reports/peritext-on-yjs-feasibility)

---

## Implications

- **Peritext paper is the AUTHORITATIVE statement that char-RGA-on-markdown-source does not work for rich text** under concurrent mark operations.
- The artifact is VISIBLE (incorrect bold rendering) — not merely theoretical.
- Peritext solves it via STRUCTURED marks (operation sets) at character anchors, not via character merging.
- This is THE research community's recognized answer to the central research question: No, char-RGA of serialized marks does NOT converge to correct semantics in production.

---

## Gaps / follow-ups

- Full-paper PDF extraction via WebFetch failed (binary format); the primary essay was the readable source. The CSCW 2022 published version is ACM-gated.
- Peritext's performance at scale (10k+ marks) is discussed in the paper but not directly extracted here.
