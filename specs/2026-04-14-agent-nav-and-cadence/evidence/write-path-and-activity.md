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

A fourth side-effect on every write, in the handler alongside the Y.Text mutation:

```ts
session.systemDc.awareness.setLocalStateField('agent', {
  agentId, agentName, classification: 'agent',
  currentDoc: targetPath,
  writeKind: 'write' | 'edit',
  ts: Date.now(),
});
```

Scope: `__system__` awareness → all clients. Existing per-doc signals unchanged. No CRDT writes to target doc beyond what already happens.

## Agent session lifecycle hook

`packages/server/src/agent-sessions.ts` owns `AgentSessionManager` — tracks per-agent `DirectConnection`s and `UndoManager`s. This is the right place to:

- On `openAgentSession(agentId)`: also open `hocuspocus.openDirectConnection('__system__')` and stash the handle on the session record.
- On `closeAgentSession(agentId)`: release the `__system__` DC (awareness auto-clears via protocol timeout, but explicit release is belt-and-suspenders).

The handle is then available to write handlers via the session lookup.
