# Evidence: Agent Write Path

**Dimension:** D7 — Agent write path (equivalent of Hocuspocus DirectConnection)
**Date:** 2026-04-07
**Sources:** https://github.com/automerge/automerge-repo, DocHandle.ts

---

## Findings

### Finding: Server-side writes via Repo + DocHandle.change() — direct equivalent of DirectConnection
**Confidence:** CONFIRMED
**Evidence:** packages/automerge-repo/src/DocHandle.ts lines 595-609

```typescript
// Server-side agent write
const repo = new Repo({
  network: [new WebSocketClientAdapter("wss://sync.example.com")],
  storage: new NodeFSStorageAdapter("./data"),
})

const handle = repo.find(documentUrl)
await handle.whenReady()

handle.change(doc => {
  // Write text at position
  am.splice(doc, ["content"], insertionPoint, 0, "Agent-generated text")
  
  // Or use updateSpans for rich text with marks
  am.updateSpans(doc, ["content"], spans, updateSpansConfig)
})
```

Changes propagate automatically to all connected peers via the sync protocol. No explicit "send" or "push" is needed — the Repo's NetworkSubsystem handles synchronization.

### Finding: The API is as clean as Hocuspocus DirectConnection
**Confidence:** CONFIRMED
**Evidence:** API comparison

Hocuspocus:
```typescript
const conn = server.openDirectConnection("docId")
conn.transact(doc => {
  const fragment = doc.get("prosemirror", Y.XmlFragment)
  // ... modify fragment
})
```

Automerge:
```typescript
const handle = repo.find(documentUrl)
handle.change(doc => {
  am.splice(doc, ["content"], 0, 0, "text")
})
```

Both are functional/callback patterns. The Automerge version is slightly simpler because you operate directly on the document rather than through an intermediate shared type.

### Finding: Rich text writes require A.updateSpans() for proper block marker handling
**Confidence:** INFERRED
**Evidence:** Automerge API documentation and pmToAm.ts

For agents writing structured content (not just plain text insertions), the agent would need to:
1. Construct spans (block markers + text + marks)
2. Use `A.updateSpans()` to write them to the document
3. Or use `A.splice()` for text-only insertions and `A.mark()` / `A.unmark()` for formatting

The `pmNodeToSpans()` function from automerge-prosemirror could be used to convert PM Node structures to Automerge spans, enabling the agent to write using familiar PM structures.

---

## Gaps / follow-ups

- Agent needs to know the Automerge document URL (vs Hocuspocus document name)
- No built-in authentication on the sync server — agent connections are unauthenticated
- `A.updateSpans()` API needs verification for production agent use cases
