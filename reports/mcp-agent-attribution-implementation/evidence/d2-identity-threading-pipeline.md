# Evidence: Identity Threading Pipeline

**Dimension:** D2 — Identity threading: MCP → HTTP API → Hocuspocus
**Date:** 2026-04-14
**Sources:** Open Knowledge codebase (packages/cli, packages/server, packages/core)

---

## Key files referenced

- `packages/cli/src/mcp/server.ts:140-148` — McpServer creation, no clientInfo extraction
- `packages/cli/src/mcp/tools/write-document.ts` — httpPost without identity
- `packages/cli/src/mcp/tools/edit-document.ts` — httpPost without identity
- `packages/cli/src/mcp/tools/shared.ts` — generic httpPost helper
- `packages/server/src/api-extension.ts:520,588,903` — handleAgentWrite/Md/Patch with DEFAULT_AGENT_ID
- `packages/server/src/agent-sessions.ts:39-46,107-116` — AGENT_WRITE_ORIGIN + hardcoded awareness
- `packages/server/src/persistence.ts:159-163` — defaultWriter: id='server'
- `packages/server/src/shadow-repo.ts:120-197` — commitWip with WriterIdentity
- `packages/core/src/shadow-repo-layout.ts:112-122` — parseWriterId prefix classification

---

## Findings

### Finding: 8 hardcoded identity points form the complete attribution gap
**Confidence:** CONFIRMED

The full pipeline from MCP tool call to shadow repo commit has 8 points where identity is hardcoded or missing:

| # | Layer | File | What's Hardcoded |
|---|-------|------|-----------------|
| 1 | MCP server startup | `server.ts:140` | `clientInfo` from initialize never captured |
| 2 | MCP tool handlers | `write-document.ts`, `edit-document.ts` | No agentId in HTTP POST body |
| 3 | HTTP API handlers | `api-extension.ts:570,659,966` | `DEFAULT_AGENT_ID = 'claude-1'` in activity map |
| 4 | Agent session awareness | `agent-sessions.ts:107-116` | `name: 'Claude'`, `color: '#D97757'` |
| 5 | Agent session keying | `agent-sessions.ts:104` | Sessions keyed by `docName` only |
| 6 | L2 persistence writer | `persistence.ts:159-163` | `id: 'server'` for all auto-save commits |
| 7 | Save-version MCP tool | `save-version.ts` | No writers passed in POST body |
| 8 | Activity entry type | `core/types/awareness.ts` | `ActivityEntry.agentId` always receives `'claude-1'` |

### Finding: MCP → HTTP proxy is identity-less
**Confidence:** CONFIRMED
**Evidence:** `write-document.ts`, `shared.ts`

MCP tools call `httpPost(serverUrl, '/api/agent-write-md', { docName, markdown, position })` with exactly the parameters the MCP tool received. The `httpPost` helper is a generic JSON POST. No identity headers, no agentId in body.

### Finding: Agent session manager keys on `docName` only, creating collision for multi-agent
**Confidence:** CONFIRMED
**Evidence:** `agent-sessions.ts`

```typescript
private sessions = new Map<string, AgentDirectConnection>();
// getSession(docName) returns or creates ONE connection per document
```

When Agent A and Agent B both write to the same document, they share the same DirectConnection with the same hardcoded awareness.

### Finding: L2 persistence completely loses agent identity
**Confidence:** CONFIRMED
**Evidence:** `persistence.ts:159-163`

```typescript
const defaultWriter: WriterIdentity = {
  id: 'server',
  name: 'openknowledge-server',
  email: 'noreply@openknowledge.local',
};
```

All auto-save WIP commits are attributed to `server`. The actual triggering agent is unknown by this layer.

### Finding: Shadow repo infra is READY for per-agent attribution
**Confidence:** CONFIRMED
**Evidence:** `shadow-repo.ts`, `shadow-repo-layout.ts`

- `commitWip()` accepts arbitrary `WriterIdentity` — already parameterized
- WIP refs use `refs/wip/<branch>/<writer.id>` — per-writer by design
- `parseWriterId()` already classifies `agent-*` prefix → `classification: 'agent'`
- Only missing: real agent identity as input

---

## Pipeline diagram

```
MCP Client (e.g. Claude Code)
  │ initialize → { clientInfo: { name: "claude-code", version: "1.x" } }
  │ tools/call → { name: "write_document", args: { docName, markdown, position } }
  ▼
MCP Stdio Server ← clientInfo available but UNUSED
  │ httpPost('/api/agent-write-md', { docName, markdown, position })
  │ *** NO AGENT IDENTITY IN HTTP REQUEST ***
  ▼
HTTP API Extension
  │ activityMap.set(DEFAULT_AGENT_ID, { agentId: 'claude-1', ... })
  │ *** HARDCODED 'claude-1' ***
  ▼
Agent Session Manager
  │ getSession(docName) → single shared DirectConnection
  │ awareness: { name: 'Claude', color: '#D97757' }
  │ *** HARDCODED IDENTITY ***
  ▼
Persistence (L2 debounce)
  │ commitWip(shadow, defaultWriter, ...)
  │ writer: { id: 'server', name: 'openknowledge-server', ... }
  │ *** ALL ATTRIBUTION LOST ***
  ▼
Shadow Repo
  │ ref: refs/wip/main/server
  │ author: openknowledge-server <noreply@openknowledge.local>
```

---

## Gaps / follow-ups

- The L2 persistence debounce timer coalesces writes from ALL sources. To attribute correctly, persistence needs a "dirty tracker" that records which agent(s) modified each doc since last commit.
- Multiple agents writing to the same doc within a single debounce window would need a conflict resolution strategy (attribute to most recent? to all?).
