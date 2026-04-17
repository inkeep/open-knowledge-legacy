---
title: Hocuspocus per-room subscriber API — correction
type: evidence
sources:
  - 'node_modules/@hocuspocus/server/dist/index.d.ts'
supersedes: evidence/subscriber-presence-cost.md
---

# Hocuspocus subscriber introspection — available publicly

Earlier this spec claimed (per `evidence/subscriber-presence-cost.md`) that Hocuspocus 4.0-rc.1 had no public per-room subscriber API and that D4 would require custom Extension plumbing. The audit invalidated this.

## What the types actually expose

From `node_modules/@hocuspocus/server/dist/index.d.ts`:

- Line 134: `connections: Map<Connection, {...}>` — public Map on Document.
- Line 167: `addConnection(connection): Document`
- Line 171: `hasConnection(connection): boolean`
- Line 175: `removeConnection(connection): Document`
- Line 179: `getConnectionsCount()` (per comment "Get the number of active connections for this document")
- Line 183: `getConnections()` — array of registered connections
- Line 187-189: `getClients(connection): Set<any>`

## Implementation cost

The subscriber-presence check reduces to:

```ts
const doc = hocuspocus.documents.get(docName);
const count = doc?.connections.size ?? 0;
if (count === 0) {
  response.warning = { message: `no preview attached to ${docName}`, previewUrl };
}
```

No custom Extension. No in-memory Map maintenance. No IPC. Runs in-process against the same Hocuspocus instance used for edits.

## Why the previous investigation missed this

The earlier Explore-subagent checked `packages/server/src/standalone.ts` and `api-extension.ts` for wrappers and concluded absence of wrappers = absence of API. It did not inspect the `@hocuspocus/server` type definitions directly. Lesson: for third-party API questions, read the package's `.d.ts` first, not our wrappers.

## Caveats

- **Split-deploy case:** if MCP server and Hocuspocus are ever separated into different processes (future cloud architecture), this in-process call stops working. Then we'd need the HTTP endpoint described in the superseded evidence file. Not a concern for MVP.
- **Document loaded vs subscribed:** `hocuspocus.documents.get(docName)` returns a Document if the room is *loaded* (touched by anyone since startup), which may not match "currently subscribed." Using `connections.size` (or `hasConnection(someKnownConn)`, etc.) against the returned Document is the right signal.
