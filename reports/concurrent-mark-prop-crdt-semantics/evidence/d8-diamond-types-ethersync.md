# Evidence: D8 — Diamond-types and Ethersync operational CRDTs

**Dimension:** D8
**Date:** 2026-04-17
**Sources:** diamond-types README + INTERNALS, Seph Gentle blog, Eg-walker paper

---

## Key pages referenced

- https://github.com/josephg/diamond-types
- https://github.com/josephg/diamond-types/blob/master/INTERNALS.md
- https://josephg.com/blog/crdts-go-brrr/
- https://arxiv.org/abs/2409.14252 — Eg-walker paper (Gentle & Kleppmann 2024)
- https://loro.dev/blog/loro-richtext — Loro's own writeup on Peritext + Fugue integration

---

## Findings

### Finding: Diamond-types currently only supports plain text editing — NO rich text formatting

**Confidence:** CONFIRMED
**Evidence:** diamond-types README:

> "This version of diamond types only supports plain text editing."

Seph Gentle (author) has stated interest in future Peritext integration but it is not shipped.

### Finding: Diamond-types uses a range-tree (b-tree variant) instead of Yjs's linked list — otherwise similar semantics

**Confidence:** CONFIRMED
**Evidence:** diamond-types README:

> "Diamond is almost identical to Yjs, but it uses a range tree instead of a linked list internally to store all of the items"

### Finding: Ethersync uses diamond-types for plain-text sync; no rich text

**Confidence:** INFERRED (from architecture docs)
**Evidence:** Ethersync is positioned as a plain-text filesystem sync engine for code; rich text is not its target domain.

### Finding: Eg-walker (Gentle & Kleppmann 2024) is a new algorithm targeting plain-text performance — Peritext integration is a FUTURE item

**Confidence:** CONFIRMED
**Evidence:** Loro team writeup:

> "the Loro project is based on the Event Graph Walker algorithm proposed by Joseph Gentle, but this algorithm cannot integrate the original version of Peritext, which motivates creating a new rich text algorithm independent of specific List CRDTs that works with Eg-walker."

Loro has its own `crdt-richtext` that implements Peritext-compatible semantics on top of Fugue-style list CRDT, published at https://github.com/loro-dev/crdt-richtext.

---

## Implications

- Diamond-types and Ethersync are shipping examples of plain-text-only CRDT — they deliberately skip rich-text formatting.
- They DO operate on raw source characters (diamond-types's text would be the serialized source code or markdown IF consumers chose to sync markdown as plain text) — but they don't provide any mark semantics.
- If someone built a "markdown-in-diamond-types" collaborative editor, they'd hit exactly the char-RGA-on-`**` interleaving problem that Peritext describes — with no Peritext mitigation.
- No production editor is reported as doing this for rich text.

---

## Gaps / follow-ups

- No production rich text editor ships on diamond-types.
- Loro + crdt-richtext is shipping Peritext on top of Fugue; that's a structured-mark path, not char-RGA-on-source.
