# Evidence: Peritext Reference Implementation

**Dimension:** D4 — Peritext reference implementation analysis
**Date:** 2026-04-07
**Sources:** github.com/inkandswitch/peritext, Peritext paper (CSCW 2022)

---

## Key files referenced

- `peritext/src/micromerge.ts` — custom CRDT implementation (not Yjs, not Automerge)
- `peritext/src/peritext.ts` — boundary semantics (BoundaryPosition type)
- `peritext/src/schema.ts` — ProseMirror schema
- `peritext/src/bridge.ts` — Micromerge-to-ProseMirror bridge
- `peritext/package.json` — dependencies include prosemirror-*

---

## Findings

### Finding: Peritext reference implementation uses a custom CRDT (Micromerge), NOT Yjs
**Confidence:** CONFIRMED
**Evidence:** peritext/src/micromerge.ts, peritext/package.json

Micromerge is a simplified, purpose-built CRDT designed to demonstrate the Peritext algorithm. It is NOT Automerge and NOT Yjs — it's a from-scratch implementation with ~800 lines supporting:
- List/text CRDT operations (insert, delete)
- AddMark/RemoveMark operations with boundary position semantics
- Clock-based causal ordering

No npm package `peritext-yjs` exists. No one has ported Peritext's boundary semantics to Yjs.

### Finding: Peritext defines BoundaryPosition with "before"/"after" semantics
**Confidence:** CONFIRMED
**Evidence:** peritext/src/peritext.ts lines 17-20

```typescript
export type BoundaryPosition =
    | { type: "before"; elemId: OperationId }
    | { type: "after"; elemId: OperationId }
    | { type: "startOfText" }
    | { type: "endOfText" }
```

Mark operations reference specific character IDs with "before" or "after" anchoring. This is the core innovation: a bold mark from "before char A" to "after char E" has precise boundary semantics. Text inserted between "after char E" and "before char F" does NOT inherit bold — resolving the boundary ambiguity that Yjs's marker model cannot.

### Finding: Peritext has a ProseMirror bridge (proof of concept)
**Confidence:** CONFIRMED
**Evidence:** peritext/package.json dependencies, peritext/src/bridge.ts, peritext/src/schema.ts

The reference implementation includes prosemirror-model, prosemirror-state, prosemirror-view, and prosemirror-commands as dependencies. It has a bridge.ts that converts Micromerge state to ProseMirror documents and vice versa. This is a proof of concept, not a production binding.

### Finding: Automerge 2.2 implemented Peritext with ExpandMark enum
**Confidence:** CONFIRMED
**Evidence:** automerge.org/blog/rich-text/, automerge docs

Automerge 2.2 formally adopted Peritext semantics. Marks have an `expand` parameter:
- `"both"` — new text at either boundary inherits the mark (e.g., bold)
- `"none"` — new text at either boundary does NOT inherit (e.g., hyperlinks)
- `"before"` / `"after"` — asymmetric expansion

This is a production-grade Peritext implementation. Loro (crdt-richtext) also implements Peritext+Fugue.

### Finding: Kevin Jahns has not publicly committed to Peritext semantics for Yjs
**Confidence:** CONFIRMED (negative search)
**Evidence:** discuss.yjs.dev search, GitHub issues, Hacker News

No public statement from Kevin Jahns (dmonad) about implementing Peritext boundary semantics in Yjs. The Yjs approach uses the simpler marker/control-character model. The Peritext paper explicitly identifies this as producing anomalous results.

---

## Gaps / follow-ups

* Yjs 14's unified delta protocol could theoretically support a "mark expand" parameter, but it would require changes to the core CRDT (ContentFormat would need to encode boundary behavior). This is a non-trivial change to Yjs internals.
