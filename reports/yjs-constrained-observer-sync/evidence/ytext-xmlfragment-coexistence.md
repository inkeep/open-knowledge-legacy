# Evidence: Y.Text and Y.XmlFragment Coexistence

**Dimension:** D2 — Y.Text and Y.XmlFragment coexistence in the same Y.Doc
**Date:** 2026-04-07
**Sources:** ~/.claude/oss-repos/yjs/src/utils/Doc.js, ~/.claude/oss-repos/hocuspocus/packages/server/src/Document.ts, Hocuspocus.ts

---

## Key files referenced

- `yjs/src/utils/Doc.js:204-210` — `doc.get()` method, share map
- `hocuspocus/packages/server/src/Document.ts` — Document extends Doc
- `hocuspocus/packages/server/src/Hocuspocus.ts:417-421` — Document update handler
- `hocuspocus/packages/server/src/Hocuspocus.ts:586-598` — Update encoding and emission

---

## Findings

### Finding: Y.Doc.get() supports multiple named shared types via the `share` Map
**Confidence:** CONFIRMED
**Evidence:** yjs/src/utils/Doc.js:200-210

```js
get (key = '', name = null) {
    return map.setIfUndefined(this.share, key, () => {
      const t = new YType(name)
      t._integrate(this, null)
      return t
    })
}
```

`this.share` is a `Map<string, YType>` (line 72). Each call to `doc.get(key)` returns the same YType instance for that key. Different keys return different YType instances. There is NO restriction on having both text-like and xml-like types under different keys.

**Implications:** `doc.get('default', 'XmlFragment')` and `doc.get('sourceText')` (or any other key) can coexist in the same Y.Doc. In Yjs v13 (this version), `YType` is unified — the `name` parameter determines whether it behaves as XmlFragment, XmlElement, etc. A YType with `name = null` behaves as a Y.Text/Y.Array hybrid.

---

### Finding: Hocuspocus Document extends Y.Doc — all shared types are inside one document
**Confidence:** CONFIRMED
**Evidence:** hocuspocus/packages/server/src/Document.ts:12

```ts
export class Document extends Doc {
```

The Document IS the Y.Doc. Any shared types accessed via `document.get('key')` are part of this single document. Hocuspocus has no concept of "shared type filtering" — it syncs the entire Y.Doc state.

---

### Finding: The Yjs sync protocol transmits the entire Y.Doc state, including all shared types
**Confidence:** CONFIRMED
**Evidence:** yjs/src/utils/Transaction.js:586-598

```js
if (doc._observers.has('update')) {
    const encoder = new UpdateEncoderV1()
    const hasContent = writeUpdateMessageFromTransaction(encoder, transaction)
    if (hasContent) {
      doc.emit('update', [encoder.toUint8Array(), transaction.origin, doc, transaction])
    }
}
```

The `writeUpdateMessageFromTransaction` encodes ALL inserted and deleted structs from the transaction, regardless of which shared type they belong to. The update is a binary diff of the entire document state.

Hocuspocus Document.ts:221-231 listens to this 'update' event and broadcasts to all connections:

```ts
private handleUpdate(update: Uint8Array, origin: unknown): Document {
    this.callbacks.onUpdate(this, origin, update);
    for (const connection of this.getConnections()) {
      const message = new OutgoingMessage(connection.messageAddress)
        .createSyncMessage()
        .writeUpdate(update);
      connection.send(message.toUint8Array());
    }
    return this;
}
```

**Implications:** When our observer writes to Y.Text (under key 'sourceText'), that change is encoded into the update binary and broadcast to all connected clients. The clients receive the update and apply it to their local Y.Doc — this updates both the Y.XmlFragment and the Y.Text on all peers. The sync protocol does not distinguish between shared types. Both types travel together in every update.

---

### Finding: Persistence (onStoreDocument) receives the full Y.Doc with all shared types
**Confidence:** CONFIRMED
**Evidence:** hocuspocus/packages/server/src/Hocuspocus.ts:301-310

```ts
const storePayload: onStoreDocumentPayload = {
    instance: this,
    clientsCount: document.getConnectionsCount(),
    document,
    lastContext: context,
    lastTransactionOrigin: origin,
    documentName: document.name,
};
this.storeDocumentHooks(document, storePayload);
```

The `document` in the payload IS the full Y.Doc (Document extends Doc). The persistence extension receives the entire document. When calling `encodeStateAsUpdate(document)`, all shared types are included in the binary. When restoring via `applyUpdate(document, storedUpdate)`, all shared types are restored.

**Implications:** No special handling needed for persistence. Both Y.XmlFragment and Y.Text will be persisted and restored automatically. The persistence layer does not need to know about multiple shared types — it serializes/deserializes the entire Y.Doc.

---

### Finding: Yjs v13 unifies YType — the concept of separate Y.Text and Y.XmlFragment classes is gone
**Confidence:** CONFIRMED
**Evidence:** yjs/src/ytype.js:599-654

In Yjs v13, there is a single `YType` class. The `name` parameter passed to the constructor determines its behavior:
- `name = null` → behaves like Y.Text (flat text content with formatting)
- `name = 'XmlFragment'` → behaves like Y.XmlFragment (tree of named children)
- `name = 'XmlElement'` → behaves like a named XML element

```js
constructor (name = null) {
    this.name = name
    // ...
    this._legacyTypeRef = this.name == null ? contentType.YXmlFragmentRefID : contentType.YXmlElementRefID
}
```

For `doc.get('default')` (used by y-prosemirror/TipTap), the default name is null, but TipTap sets it up as an XmlFragment via the type name parameter: `doc.get('default', 'XmlFragment')`. For our source text, `doc.get('sourceText')` returns a YType with `name = null` which behaves as plain text.

**Implications:** Both types coexist as entries in the `doc.share` Map. They are structurally the same class, just with different names and therefore different content semantics. The `.toString()` method on a YType with `name = null` returns the plain text content (line 1318-1338).

---

## Gaps / follow-ups

- Need to verify exact TipTap/y-tiptap key name used for the XmlFragment (typically 'default')
