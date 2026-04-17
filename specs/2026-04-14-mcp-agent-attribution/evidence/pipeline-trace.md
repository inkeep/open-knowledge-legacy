---
title: Identity Pipeline Trace
date: 2026-04-14
sources:
  - packages/cli/src/mcp/server.ts
  - packages/cli/src/mcp/tools/index.ts
  - packages/cli/src/mcp/tools/write-document.ts
  - packages/cli/src/mcp/tools/edit-document.ts
  - packages/cli/src/mcp/tools/save-version.ts
  - packages/server/src/api-extension.ts
  - packages/server/src/agent-sessions.ts
  - packages/server/src/persistence.ts
  - packages/server/src/shadow-repo.ts
  - packages/server/src/standalone.ts
  - packages/core/src/shadow-repo-layout.ts
  - packages/core/src/types/awareness.ts
  - packages/cli/src/content/shadow-log.ts
---

# Evidence: Identity Pipeline Trace

## 8 hardcoded identity points (complete enumeration)

| # | Layer | File:Line | Hardcoded Value | What Must Change |
|---|-------|-----------|-----------------|------------------|
| 1 | MCP server | `server.ts:140` | `clientInfo` never captured | Extract via `server.server.getClientVersion()` + `oninitialized` |
| 2 | MCP tools | `write-document.ts:34`, `edit-document.ts:34` | No agentId in POST body | Add `agentId`, `displayName` to POST body |
| 3 | API handlers | `api-extension.ts:573,574,662,663,969,970` | `DEFAULT_AGENT_ID` ('claude-1') × 6 | Extract from request body, use dynamic value |
| 4 | Session awareness | `agent-sessions.ts:109-111` | `name:'Claude'`, `color:'#D97757'`, `icon:'claude'` | Accept identity param in `getSession()` |
| 5 | Session keying | `agent-sessions.ts:89` | `Map<string, DC>` keyed by docName only | Key by `(docName, agentId)` |
| 6 | L2 persistence | `persistence.ts:159-163` | `defaultWriter: { id: 'server' }` | Use contributor accumulator + commit message metadata |
| 7 | Save-version | `save-version.ts:22` | No writers in POST body | Pass agent identity as writer |
| 8 | DEFAULT_AGENT_ID | `agent-sessions.ts:46` | `'claude-1'` constant | Remove; replace all consumers with dynamic identity |

## Ready infrastructure (no changes needed)

- `shadow-repo.ts:commitWip()` — already accepts `WriterIdentity` param
- `shadow-repo-layout.ts:parseWriterId()` — already classifies `agent-*` prefix
- `shadow-log.ts:ShadowCommit` — already surfaces `writerId`, `writerName`, `writerClassification`
- `awareness.ts:ActivityEntry` — type is fine; values are the problem
- `awareness.ts:AwarenessUser` — type is fine; values are the problem

## Activity map entry shape (current)

```typescript
activityMap.set(DEFAULT_AGENT_ID, {
  agentId: DEFAULT_AGENT_ID,   // always 'claude-1'
  timestamp: Date.now(),
  type: 'insert',
  description: `Added: ${markdown.trim().slice(0, 50)}`,
});
```

All three write endpoints (agent-write, agent-write-md, agent-patch) use this identical pattern.
