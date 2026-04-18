# Evidence: D4 — CRDT-Native Merge via Yjs State Vectors

**Dimension:** Yjs state-vector-based operation extraction. Is it structurally content-preserving? Can it be used as a three-way-merge primitive inside a bridge?
**Date:** 2026-04-16
**Sources:** `yjs@13.6.30` source at `node_modules/yjs/src/utils/encoding.js`, `node_modules/yjs/src/utils/updates.js`. CRDT literature on state-based vs delta-based sync.

---

## Key files referenced

- `node_modules/yjs/src/utils/encoding.js:476-492` — `applyUpdate` / `applyUpdateV2`
- `node_modules/yjs/src/utils/encoding.js:504-541` — `writeStateAsUpdate` / `encodeStateAsUpdateV2`
- `node_modules/yjs/src/utils/encoding.js:555` — `encodeStateAsUpdate` (V1 wrapper)
- `node_modules/yjs/src/utils/encoding.js:565-644` — state vector read/write
- `node_modules/yjs/src/utils/updates.js:186, 333-` — `mergeUpdates` / `mergeUpdatesV2`

---

## Findings

### Finding F4.1: State vectors are per-client-ID clock maps

**Confidence:** CONFIRMED
**Evidence:** `node_modules/yjs/src/utils/encoding.js:565-574`:

```javascript
export const readStateVector = decoder => {
  const ss = new Map()
  const ssLength = decoding.readVarUint(decoder.restDecoder)
  for (let i = 0; i < ssLength; i++) {
    const client = decoding.readVarUint(decoder.restDecoder)
    const clock = decoding.readVarUint(decoder.restDecoder)
    ss.set(client, clock)
  }
  return ss
}
```

A Yjs state vector is literally a `Map<clientID, nextClock>` — for each client that has written operations, the clock value of the *next* expected operation from that client. `encodeStateVector(doc)` serializes this map; `decodeStateVector(sv)` reads it back.

**Implication:** The state vector captures *exactly which operations this replica has seen*, by client-ID. Two replicas with the same state vector have seen the same operations (modulo ordering) and therefore will converge to the same state after applying those operations. This is the basis of Yjs's delta-based sync protocol.

### Finding F4.2: `encodeStateAsUpdate(doc, baseSV)` extracts exactly "ops since baseSV"

**Confidence:** CONFIRMED
**Evidence:** `node_modules/yjs/src/utils/encoding.js:504-541`:

```javascript
export const writeStateAsUpdate = (encoder, doc, targetStateVector = new Map()) => {
  writeClientsStructs(encoder, doc.store, targetStateVector)
  writeDeleteSet(encoder, createDeleteSetFromStructStore(doc.store))
}
...
export const encodeStateAsUpdateV2 = (doc, encodedTargetStateVector = new Uint8Array([0]), encoder = new UpdateEncoderV2()) => {
  const targetStateVector = decodeStateVector(encodedTargetStateVector)
  writeStateAsUpdate(encoder, doc, targetStateVector)
  ...
}
```

The function takes a target state vector (representing what the *other* replica has) and writes all structs (operations) that this document has but the target does not. `writeClientsStructs` walks `doc.store` per-client and emits only the structs with `clock >= targetStateVector.get(client)`.

**Implication:** This is a CRDT-native "delta between two states." Unlike diff3 which works on (A, O, B) snapshots where O is a guess about what the base was, Yjs state-vector deltas work on **exact ordered operation identity** — each struct has a unique `(clientID, clock)` ID. The "missing ops" set is exact, not inferred.

### Finding F4.3: `applyUpdate` structurally merges the delta into the target doc

**Confidence:** CONFIRMED
**Evidence:** `node_modules/yjs/src/utils/encoding.js:462, 476-492`:

```javascript
export const readUpdate = (decoder, ydoc, transactionOrigin) => readUpdateV2(decoder, ydoc, transactionOrigin, new UpdateDecoderV1(decoder))

export const applyUpdateV2 = (ydoc, update, transactionOrigin, YDecoder = UpdateDecoderV2) => {
  const decoder = decoding.createDecoder(update)
  readUpdateV2(decoder, ydoc, transactionOrigin, new YDecoder(decoder))
}
```

`readUpdateV2` deserializes the update into individual `Item` / `GC` / `Delete` structs and inserts them into the target `StructStore`. Each struct has a globally-unique `(clientID, clock)` ID, and the insertion uses the RGA-like algorithm to place the struct relative to its origin references. **The result is state-convergent:** applying the same set of updates (in any order) to two replicas produces byte-identical documents.

**Implication for content preservation:** When this path is used, no content can be lost. Every struct emitted by `encodeStateAsUpdate` carries its own identity and references; applying it to the target inserts it into the RGA sequence at its correct position. There is no "alignment" phase to go wrong — the alignment is given by the struct IDs themselves.

### Finding F4.4: This is how Yjs's native sync protocol works — CRDT content preservation is a structural property

**Confidence:** CONFIRMED
**Evidence:** Yjs sync protocol implementation in `y-protocols/sync.js` (external) and `@y/websocket` / Hocuspocus use the same primitives.

The standard Yjs sync dance is:
1. Client sends `stepSV = encodeStateVector(clientDoc)` to server.
2. Server computes `update = encodeStateAsUpdate(serverDoc, stepSV)` — "operations I have that you're missing."
3. Server sends `update` to client.
4. Client `applyUpdate(clientDoc, update)` — structurally integrates.
5. Symmetric exchange for operations the client has that server lacks.

**Crucial property:** This dance is **symmetric and content-preserving** because both replicas carry the full CRDT operation log (after step 4, both have converged). There's no "alignment" or "conflict resolution" layer — the RGA-like algorithm handles concurrent inserts by total-ordering on (client, clock) tuples. Two concurrent inserts at the same logical position interleave deterministically, never overwrite.

### Finding F4.5: Y.XmlFragment and Y.Text BOTH use the same underlying Item store

**Confidence:** CONFIRMED
**Evidence:** Yjs architecture — both `Y.XmlFragment` and `Y.Text` are `AbstractType<Content*>` views backed by the single `StructStore` per-document. Items in each type are ordinary `Item` structs with their own `(clientID, clock)` IDs. `encodeStateAsUpdate` serializes *all* Items in the doc's StructStore regardless of which type they belong to.

**Implication:** A state vector and update capture the full state of a Y.Doc — including XmlFragment Items, Y.Text Items, Y.Map entries, everything. There is no type-level granularity: you can't say "just extract Y.Text ops since time T" using `encodeStateAsUpdate`. You get all ops or none.

### Finding F4.6: State-vector-based merge is NOT a bridge between two Y types on the same doc

**Confidence:** INFERRED (critical framing for our bridge question)
**Evidence:** F4.1 + F4.5 — state vectors are per-DOC, not per-TYPE.

**This is the key question the user raised.** Can state-vector-based merge replace diff3+DMP in the bridge?

- **If mine and theirs are two different Y.Docs:** yes, `encodeStateAsUpdate(mineDoc, theirsSV)` + `applyUpdate(theirsDoc, update)` merges them structurally, losslessly.
- **If mine and theirs are two different Y *types* on the SAME Y.Doc (Y.XmlFragment vs Y.Text in Open Knowledge):** no, the state vector applies to the whole doc. You cannot extract "the Y.Text Items since baseline" without also extracting the Y.XmlFragment Items from the same time window.

**For the bridge question:** state-vector-based sync is the right primitive for *peer-to-peer* CRDT sync (what Yjs + Hocuspocus already do at the WebSocket layer). It is **not** directly applicable as a replacement for diff3+DMP inside the Observer A / Observer B bridge, because the bridge is translating content *between* two Y types *within a single Y.Doc* — state vectors don't distinguish types.

### Finding F4.7: To use state-vector semantics at the type-boundary, two distinct Y.Docs would be required

**Confidence:** INFERRED
**Evidence:** F4.5 + F4.6. Architectural reasoning.

One alternative architecture: the bridge could maintain TWO Y.Docs — one for `xmlFragmentDoc` and one for `yTextDoc` — connected by a synchronous translation layer. A translation function `markdownFromXmlFragment: xmlDoc → markdown` would run on every `xmlDoc` change; a `markdownToYTextOps: markdown → ops` would emit Y.Text ops to the `yTextDoc`. Both sides would be separate CRDT histories; the "bridge" becomes a one-way markdown pipe, not a CRDT-op bridge.

**Problem:** this doesn't solve the concurrent-write question either. If a user types in Source (Y.Text) while an agent writes through XmlFragment, the two doc histories diverge at the markdown level — and merging them *back* into a single markdown requires … a three-way merge on strings, which is exactly diff3+DMP. So moving to two Y.Docs shifts the question but doesn't answer it.

### Finding F4.8: The architecturally correct escape is within-Y.Doc CRDT-op-based merge — which requires per-op tracking

**Confidence:** INFERRED
**Evidence:** F4.6 + F4.7. Architectural reasoning from CRDT literature.

For the bridge to be content-preserving by construction, it needs to:
1. Track per-op history on both Y.XmlFragment and Y.Text (which already exists — each has its own Items with (client, clock) IDs).
2. When translating Y.Text changes into Y.XmlFragment changes, **preserve the Y.Text Item IDs structurally** — don't re-parse-and-rebuild, which would create new Items with different IDs.

This is architecturally what `y-prosemirror`'s `updateYFragment` does for PM-tree ↔ Y.XmlFragment (structural diff preserves untouched subtrees' Items — see existing report `crdt-origin-laundering-prior-art/REPORT.md` finding D1). But the bridge's job is harder: it translates **across type boundaries** (Y.Text flat string ↔ Y.XmlFragment tree) where the Item correspondence is not 1:1. There's no structural alignment between "char at Y.Text offset 37" and "text node inside <h2> Y.XmlElement."

**This is why Peritext-style single-CRDT architectures exist** — they eliminate the type boundary entirely by using ONE CRDT for both representations (D5 evidence). Within Yjs today, with two distinct types, the type-boundary translation is unavoidable unless you move to a single type (e.g., pure Y.Text + formatting markers, Peritext model).

### Finding F4.9: `mergeUpdates` is also content-preserving — but operates on update blobs, not live docs

**Confidence:** CONFIRMED
**Evidence:** `node_modules/yjs/src/utils/updates.js:333-420`

```javascript
export const mergeUpdatesV2 = (updates, YDecoder = UpdateDecoderV2, YEncoder = UpdateEncoderV2) => {
  if (updates.length === 1) {
    return updates[0]
  }
  ...
  // Write higher clients first ⇒ sort by clientID & clock and remove decoders without content
  lazyStructDecoders.sort(
    (dec1, dec2) => {
      if (dec1.curr.id.client === dec2.curr.id.client) {
        const clockDiff = dec1.curr.id.clock - dec2.curr.id.clock
        ...
      } else {
        return dec2.curr.id.client - dec1.curr.id.client
      }
    }
  )
```

`mergeUpdates` takes N update blobs (Uint8Arrays) and produces a single merged blob that, when applied to any doc, is equivalent to applying all N updates in sequence. Merge is based on total-ordering structs by `(clientID, clock)`. **No content is lost** — each struct with a unique ID is included exactly once.

**Implication:** if our bridge had *two concurrent Y.Doc operation streams* (one from the local client, one from the remote peer via server) and it could collect them as Uint8Array blobs before applying, `mergeUpdates` could fuse them losslessly. But this is still the peer-to-peer sync case, not the type-boundary bridge case.

---

## Negative searches

- Searched Yjs source for a "merge two types within one doc" primitive → NOT FOUND. The state-vector / update machinery is doc-scoped, not type-scoped.
- Searched for `mergeUpdates` applied across distinct Y.Docs → NOT APPLICABLE; updates carry client IDs that are doc-scoped, and `mergeUpdates` assumes the updates come from the same logical doc.
- Searched for Yjs "cross-type bridge" prior art → NOT FOUND. The `y-codemirror.next` + `y-prosemirror` stack binds one PM view and one CM view to the *same* Y type (Y.XmlFragment via PM, Y.Text via CM in a different doc). Our bridge is architecturally distinctive because it binds a PM view AND a CM view to the same Y.Doc with two different types.
- Searched for Peritext-on-Yjs implementations → referred to existing report `peritext-on-yjs-feasibility/REPORT.md` (summarized in D5 evidence).

---

## Gaps / follow-ups

- The question of whether an alternative sync architecture (e.g., the bridge observing Y-protocol updates directly and forwarding a structural translation) is viable is out of scope for this 3P report. It would be architectural follow-up for the 1P spec.
- The recommendation is: state-vector-based sync is the right primitive for *reducing the problem* — if the bridge's two sides become two independent Y.Docs, the state-vector dance preserves content at the CRDT layer. But the translation function between markdown and the other type is then pushed into the bridge's translation layer, which becomes the new content-loss locus.
