# Evidence: Hocuspocus Document Lifecycle and Branch-Aware Loading

**Dimension:** Hocuspocus multi-Y.Doc management, document naming as namespacing
**Date:** 2026-04-02
**Sources:** Hocuspocus docs (tiptap.dev/docs/hocuspocus), GitHub (ueberdosis/hocuspocus), Yjs community

---

## Key files / pages referenced

- https://tiptap.dev/docs/hocuspocus/server/hooks -- Hook system (onConnect, onLoadDocument, etc.)
- https://tiptap.dev/docs/hocuspocus/guides/multi-subdocuments -- Multiplexing
- https://tiptap.dev/docs/hocuspocus/guides/persistence -- Persistence model
- https://github.com/ueberdosis/hocuspocus/blob/main/packages/server/src/Hocuspocus.ts -- Server source
- https://discuss.yjs.dev/t/implementing-document-versions-using-tiptap-and-hocuspocus/1529

---

## Findings

### Finding: Hocuspocus document naming IS the namespacing mechanism, and can encode branch information
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus docs, hooks documentation

Hocuspocus uses `documentName` as the primary identifier. The recommended pattern is `entityType.entityID`:

```javascript
const [entityType, entityID] = documentName.split(".");
// e.g., "page.140"
```

This can be extended to encode branch information:

```
article.123.main     -> main branch of article 123
article.123.draft-1  -> draft-1 branch of article 123
```

Each unique `documentName` gets its own Y.Doc instance. Hocuspocus manages the lifecycle independently for each.

**Implications:** Branch isolation is free -- different document names = different Y.Docs = completely isolated CRDT states. No special branching API needed.

### Finding: onLoadDocument can load different content based on context/params
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus hooks documentation

The hook chain supports branch-aware loading:

```javascript
async onConnect(data) {
  const branch = data.requestParameters.get("branch") || "main";
  return { branch };  // Attached to context
},

async onLoadDocument(data) {
  // context.branch available from onConnect
  const ydoc = await loadFromDB(data.documentName, data.context.branch);
  return ydoc;
},

async onStoreDocument(data) {
  await saveToDB(data.document, data.context.branch);
}
```

The `context` parameter flows through the entire hook chain, making branch-aware persistence straightforward.

### Finding: Document unload is automatic when last client disconnects
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus docs, collaborative-editor-auth-secrets-lifecycle report

Lifecycle stages:
1. onConnect -- client WebSocket established
2. onLoadDocument -- Y.Doc loaded from persistence (or created)
3. afterLoadDocument -- ready for editing
4. onChange -- debounced change handler
5. onStoreDocument -- persistence trigger (debounced)
6. onDisconnect -- client leaves
7. afterUnloadDocument -- Y.Doc freed when NO clients remain

The Y.Doc is freed from memory after the last client disconnects. This means switching branches requires:
- Disconnecting from the current document name
- Connecting to the new document name
- Hocuspocus handles cleanup of the old and loading of the new automatically

### Finding: Multiplexing allows multiple documents over one WebSocket
**Confidence:** CONFIRMED
**Evidence:** https://tiptap.dev/docs/hocuspocus/guides/multi-subdocuments

Multiple providers can share a single WebSocket connection:

```javascript
const providerMain = new HocuspocusProvider({
  url: 'ws://localhost:1234',
  name: 'article.123.main'
});

const providerDraft = new HocuspocusProvider({
  url: 'ws://localhost:1234',
  name: 'article.123.draft-1'
});
```

Both documents are synced over one connection. This could enable pre-loading the target branch's Y.Doc before switching.

### Finding: The duplication trap -- loading the same content into two Y.Docs creates doubled content on merge
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus persistence docs, multi-file-crdt-operations report

Hocuspocus explicitly warns: "Do not be tempted to store the Y.Doc as JSON and recreate it as YJS binary when the user connects." If two Y.Docs are created independently from the same text, merging them via `applyUpdate` produces doubled content because Yjs merges insertions without deduplication.

**Implications:** When creating a branch, the Y.Doc for the branch must be initialized from the main Y.Doc's binary state (via `Y.encodeStateAsUpdate`), NOT by re-creating from text/JSON. The branch Y.Doc must share the same CRDT history as the origin to avoid duplication on eventual merge.

---

## Gaps / follow-ups

- How does Hocuspocus handle the case where a client switches from one documentName to another mid-session? (provider reconnection behavior)
- Performance of maintaining multiple Y.Docs in memory simultaneously (one per active branch)
