---
title: Agent write path and existing side-effects
description: Where write_document and edit_document actually mutate, and what signals they emit today
sources:
  - packages/server/src/api-extension.ts
  - packages/server/src/agent-sessions.ts
  - packages/cli/src/mcp/tools/write-document.ts
  - packages/cli/src/mcp/tools/edit-document.ts
---

# Agent write path

## MCP tool → HTTP handler

- `write_document` MCP tool → POST `/api/agent-write-md` (`packages/cli/src/mcp/tools/write-document.ts:34`)
- `edit_document` MCP tool → POST `/api/agent-patch` (`packages/cli/src/mcp/tools/edit-document.ts:34`)

Both tools take a single `docName` per request. No batch shape. Content is sent atomically.

## Server-side handlers

Both handlers in `packages/server/src/api-extension.ts:599, 914` follow the same shape:

1. Open `DirectConnection` for the agent session on the target doc
2. Mutate Y.Text in a transaction with origin tagged as `'agent-write'`
3. Update per-doc `activity` Y.Map entry: `{agentId, timestamp, type, description}` (lines 669-675, 976-982)
4. Flip awareness mode field to `'editing'` / `'idle'` (lines 650, 678, 963, 985)

## Current signal surfaces (pre-spec)

| Signal | Location | Scope | Who consumes |
|--------|----------|-------|--------------|
| Y.Text mutation | Target doc | Per-doc CRDT peers | Clients viewing that doc |
| Activity Y.Map entry | Target doc | Per-doc CRDT peers | Activity-flash UI in the editor |
| Awareness mode | Target doc | Per-doc awareness peers | Presence bar (if viewing that doc) |

**No global nav signal exists today.** The server does not emit any push signal when an agent write lands — that's the gap this spec fills.

## What the spec adds

A fourth side-effect on every write, in the handler alongside the Y.Text mutation — publishing to the existing server-wide `__system__` `DirectConnection` (the one CC1 already owns), via a small `AgentFocusBroadcaster` helper:

```ts
agentFocusBroadcaster.setFocus(agentId, {
  agentName,
  currentDoc: targetPath,
  writeKind: 'write' | 'edit',
  ts: Date.now(),
});
```

Internally `setFocus` does `awareness.setLocalStateField('agentFocus', {...current, [agentId]: entry})` on the shared DC. The single-peer publisher surfaces all active agents as a map keyed by `agentId`.

Scope: `__system__` awareness → all clients. Existing per-doc signals unchanged. No CRDT writes to target doc beyond what already happens. No new `DirectConnection`.

## Why the shared DC — not per-agent

`AgentSessionManager.getSession(docName)` at `packages/server/src/agent-sessions.ts:101-103` throws when `isSystemDoc(docName)` returns true (reserved-docname guard, per CLAUDE.md §CC1 cross-cutting skip policy). Opening a per-agent `DirectConnection` to `__system__` would require either bypassing this guard (breaks policy — every doc-keyed subsystem short-circuits through `isSystemDoc()`) or creating a parallel session-lifecycle path. Reusing the CC1-owned DC with a map-valued `agentFocus` field gives us N concurrent agents under a single `clientID`, with map-entry upsert/remove doing the isolation work that per-peer separation would otherwise handle natively.

## Agent session lifecycle hook

`packages/server/src/agent-sessions.ts` owns `AgentSessionManager`. No new DC. Add two one-liners:

- On `openAgentSession(agentId)`: `agentFocusBroadcaster.setFocus(agentId, {agentName, currentDoc: null, writeKind: null, ts: Date.now()})` — advertises the agent's existence before it writes anything.
- On `closeAgentSession(agentId)`: `agentFocusBroadcaster.clearFocus(agentId)` — removes the entry from the map.

The `agentFocusBroadcaster` singleton is wired from server startup (same module that already wires the CC1 broadcaster's shared DC).
