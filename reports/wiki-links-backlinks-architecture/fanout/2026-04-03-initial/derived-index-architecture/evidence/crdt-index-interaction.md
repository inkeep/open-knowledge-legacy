# Evidence: CRDT + Derived Index Interaction Patterns

## Yjs Observation API

**Source**: [yjs/yjs](https://github.com/yjs/yjs) | [Yjs Docs](https://docs.yjs.dev/)

### Y.Doc Events
- `Y.Doc.on('update', (update: Uint8Array, origin: any, doc: Y.Doc) => void)` — fires on every document mutation
- `Y.Doc.on('updateV2', ...)` — same but with v2 encoding
- `Y.Doc.on('afterTransaction', (transaction: Y.Transaction, doc: Y.Doc) => void)` — fires after each transaction

### Y.Text / Y.XmlFragment Observation
- `ytype.observe(callback)` — synchronous listener, fires on every modification to the shared type
- `ytype.observeDeep(callback)` — listener for changes to this type or ANY children (recursive)
- Events provide delta format compatible with Quill Delta: `{ insert, delete, retain, attributes }`
- `Y.TextEvent.target` — the Y.Text instance that changed
- `Y.TextEvent.changes.keys` — Map of `{ action: 'add'|'update'|'delete', oldValue }`

### Key Property: Convergence
- YATA algorithm ensures all peers converge to the same state
- Paper: "Near Real-Time Peer-to-Peer Shared Editing on Extensible Data Types" (Nicolaescu, Jahns, Derntl, Klamma, GROUP 2016)
- Source: [ACM DL](https://dl.acm.org/doi/10.1145/2957276.2957310) | [ResearchGate](https://www.researchgate.net/publication/310212186)

---

## Hocuspocus Server Hooks

**Source**: [ueberdosis/hocuspocus](https://github.com/ueberdosis/hocuspocus) | [Hocuspocus Docs](https://tiptap.dev/docs/hocuspocus/server/hooks)

### onChange Hook
- **Fires once per document** per update, NOT per connection
- Payload: `{ clientsCount, context, document: Y.Doc, documentName, instance, requestHeaders, requestParameters, update: Uint8Array, socketId }`
- **Critical warning from docs**: "It's highly recommended to debounce extensive operations as this hook can be fired up to multiple times a second"
- The `context` field carries data from prior `onConnect` hooks (auth info, user identity)

### onStoreDocument Hook
- Fires AFTER onChange
- **Debounced by default** via `debounce` and `maxDebounce` server configuration
- Same payload as onChange
- Designed for persistence operations
- This is where you'd trigger backlink index updates

### Extension System
- Hooks implemented as extensions (classes with lifecycle methods)
- Multiple extensions can register for the same hook
- Extensions run in registration order
- Database extension pattern: `fetch()` returns Y.Doc Uint8Array, `store()` persists it

### Server Configuration Relevant to Index Updates
```typescript
const server = new Hocuspocus({
  debounce: 2000,     // ms before onStoreDocument fires
  maxDebounce: 10000, // max ms to wait before forcing onStoreDocument
  quiet: false,
})
```

---

## TipTap / y-prosemirror Integration

**Source**: [ueberdosis/tiptap](https://github.com/ueberdosis/tiptap) | [yjs/y-prosemirror](https://github.com/yjs/y-prosemirror)

### Collaboration Extension Configuration
```typescript
Collaboration.configure({
  document: new Y.Doc(),  // shared Y.Doc
  field: 'default',       // Y.XmlFragment name within the doc
  // OR
  fragment: ydoc.getXmlFragment('body')  // direct fragment reference
})
```

### Server-Side Document Parsing
- `yDocToProsemirrorJSON(ydoc, field)` — converts Y.Doc to ProseMirror JSON **without requiring the ProseMirror schema**
- This is critical for server-side link extraction: you can parse the Y.Doc in Hocuspocus's onChange hook to extract links
- Source: [y-prosemirror utilities](https://github.com/yjs/y-prosemirror), [y-tiptap](https://github.com/ueberdosis/y-tiptap)

### Link Extraction from Y.Doc (Server-Side Pattern)
```
1. Hocuspocus onChange fires with { document: Y.Doc, documentName }
2. Convert: yDocToProsemirrorJSON(document, 'default') → ProseMirror JSON
3. Walk JSON tree, find nodes with type === 'mention' and attrs.type === 'document'
4. Extract link targets from attrs.modelId or attrs.href
5. Update backlink index with new link set for this document
```

---

## Event Flow for Index Updates

### Real-Time Editing (CRDT Path)
```
User types in TipTap editor
  → Y.XmlFragment modified (Yjs CRDT operation)
  → Synced to Hocuspocus server via WebSocket
  → Hocuspocus onChange fires (once per document, all connections merged)
  → [DEBOUNCE: 2000ms default]
  → Hocuspocus onStoreDocument fires
  → Server extracts links from Y.Doc via yDocToProsemirrorJSON
  → Backlink index updated incrementally
```

### File Save (Git Path)
```
User saves / auto-save triggers
  → File written to disk (markdown)
  → Git commit (manual or auto)
  → Filesystem watcher detects change
  → File re-parsed for links
  → Backlink index updated incrementally
```

### Consistency Window
- Between CRDT edit and index update: **2-10 seconds** (debounce window)
- This is **eventual consistency** — acceptable for backlinks
- The Y.Doc is always authoritative; the index is a derived view
- If the index is stale, backlink queries return slightly outdated results
- Failure mode: briefly missing a newly added link, or showing a just-removed link

---

## Debouncing Strategy for Index Updates

### Recommended Pattern
```
CRDT edits arrive continuously
  → Accumulate in Y.Doc (always consistent via CRDT)
  → Hocuspocus onChange signals "something changed"
  → Start/reset debounce timer (2s)
  → If no more changes for 2s: extract links, update index
  → Hard maximum: 10s — force index update even if edits continue
```

### Why This Works
1. **Correctness**: The Y.Doc is the source of truth. The index can be rebuilt from it at any time.
2. **Performance**: Debouncing prevents re-parsing on every keystroke. A 2s window catches "burst" edits.
3. **Concurrency**: Multiple users editing simultaneously produce merged CRDT state. The server sees one document, not per-user views. This naturally serializes index updates.
4. **Recovery**: If the index becomes inconsistent (crash, bug), rebuild from all Y.Docs. This is always safe because CRDTs converge.
