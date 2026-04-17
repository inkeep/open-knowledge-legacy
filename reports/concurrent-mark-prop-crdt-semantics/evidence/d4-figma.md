# Evidence: D4 — Figma multiplayer, text properties, per-property LWW

**Dimension:** D4
**Date:** 2026-04-17
**Sources:** Figma's own blog post by Evan Wallace (former Figma CTO/co-founder)

---

## Key pages referenced

- https://www.figma.com/blog/how-figmas-multiplayer-technology-works/ — primary source, authored by Evan Wallace

---

## Findings

### Finding: Figma uses server-authoritative per-property last-writer-wins

**Confidence:** CONFIRMED
**Evidence:** Figma blog:

> "the document will just end up with the last value that was sent to the server."

> "changes are atomic at the property value boundary. The eventually consistent value for a given property is always a value sent by one of the clients."

### Finding: Text content is a single atomic property, not a CRDT — Figma EXPLICITLY does not merge concurrent text edits

**Confidence:** CONFIRMED (direct quote from Figma)
**Evidence:** Figma blog:

> "This is why simultaneous editing of the same text value doesn't work in Figma. If the text value is B and someone changes it to AB at the same time as someone else changes it to BC, the end result will be either AB or BC but never ABC. That's ok with us because Figma is a design tool, not a text editor."

### Finding: Data model is a two-level map — `Map<ObjectID, Map<Property, Value>>`

**Confidence:** CONFIRMED
**Evidence:** Figma blog:

> "Each object has an ID and a collection of properties with values, which can be thought of as a two-level map: Map<ObjectID, Map<Property, Value>>."

### Finding: Figma is inspired by CRDTs but is NOT a "true" CRDT — it uses server-authoritative LWW because centralized

**Confidence:** CONFIRMED
**Evidence:** Figma blog explicitly acknowledges this is an LWW-register style and that they're server-authoritative.

### Finding: Ordered sequences (layer stacking) use fractional indexing with server tie-breaking, not char-RGA

**Confidence:** CONFIRMED
**Evidence:** Figma blog describes fractional-index ordering for z-index/layer stacks.

---

## Implications

- Figma is the canonical production example of: **whole-property LWW** with NO character-level merging.
- Text "body" of a text layer is a single atomic value — loss of concurrent edits is accepted as a product decision.
- This is the OPPOSITE extreme of HedgeDoc/Yjs text CRDT. Design tool vs text tool framing.
- Structured attrs (fill color, opacity, font size) resolve by LWW register.

---

## Gaps / follow-ups

- Whether Figma's newer text editing (post-Wallace blog) has moved toward finer-grained CRDT is not publicly documented; their design-tool stance makes a shift unlikely.
