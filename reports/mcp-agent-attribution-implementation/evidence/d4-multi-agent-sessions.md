# Evidence: Multi-Agent Session Management

**Dimension:** D4 — Multi-agent session management
**Date:** 2026-04-14
**Sources:** Open Knowledge codebase (packages/server)

---

## Key files referenced

- `packages/server/src/agent-sessions.ts:1-170` — AgentSessionManager full implementation
- `packages/server/src/api-extension.ts:520,588,903,1998-2000` — write endpoint handlers
- `packages/server/src/index.ts:5` — DEFAULT_AGENT_ID export

---

## Findings

### Finding: Sessions keyed by `docName` only — multi-agent collision
**Confidence:** CONFIRMED
**Evidence:** `agent-sessions.ts`

```typescript
private sessions = new Map<string, AgentDirectConnection>();

async getSession(docName: string): Promise<AgentDirectConnection> {
  const existing = this.sessions.get(docName);
  if (existing) return existing;
  // creates single DirectConnection for this docName
}
```

Agent A writes `my-doc.md` → session created with hardcoded awareness. Agent B writes `my-doc.md` → gets Agent A's session. Agent B's identity is invisible.

### Finding: Hardcoded awareness state — all agents appear as one "Claude"
**Confidence:** CONFIRMED
**Evidence:** `agent-sessions.ts:107-116`

```typescript
dc.document.awareness.setLocalState({
  user: {
    name: 'Claude',
    color: '#D97757',
    type: 'agent',
    icon: 'claude',
    tabId: `agent-${crypto.randomUUID()}`,
  },
  mode: 'idle',
});
```

`tabId` gets a UUID but it's not correlated to the calling agent — it's random per session creation.

### Finding: Activity map overwrites on each write — last writer wins
**Confidence:** CONFIRMED
**Evidence:** `api-extension.ts:570-571`

```typescript
activityMap.set(DEFAULT_AGENT_ID, {
  agentId: DEFAULT_AGENT_ID,  // always 'claude-1'
  timestamp: Date.now(),
  action: { kind: 'write', metadata: { position, docName } },
  visibility: 'flash',
});
```

With a single key (`'claude-1'`), each write overwrites the previous entry. Two agents writing in quick succession: only the last one's flash is visible.

### Finding: DirectConnection lifecycle is lazy-create, indefinite-cache
**Confidence:** CONFIRMED
**Evidence:** `agent-sessions.ts`

- Created on first `getSession(docName)` call
- Cached until explicit `closeSession(docName)` or `closeAll()`
- No timeout, no eviction, no reference counting
- `closeAll()` called by test-reset and server shutdown

### Finding: Per-agent UndoManager requires per-agent sessions
**Confidence:** INFERRED
**Evidence:** `agent-sessions.ts:1-9` (file header)

```
Per-agent undo is deferred to V0-14 (three-UndoManager architecture).
The broken scaffold was removed in V0-16 per TQ13.
```

With one DirectConnection per doc, any future UndoManager tracks ALL agents' edits as a single stack. Per-agent undo (D12/STORY.md) requires per-agent-per-doc connections.

---

## Multi-agent session model: required changes

| Component | Current | Required |
|-----------|---------|----------|
| Session key | `Map<docName, DC>` | `Map<docName, Map<agentId, DC>>` or `Map<"${docName}:${agentId}", DC>` |
| Awareness | Single hardcoded `name: 'Claude'` | Per-agent: `name: identity.displayName`, `color: hash(connectionId)` |
| Activity map | Single key `'claude-1'` | Per-agent key: `agentId` from request |
| API contract | No `agentId` param | Add optional `agentId` to write endpoints |
| Session eviction | None | Add idle timeout or MCP disconnect cleanup |
| UndoManager (future) | N/A (removed) | Per-agent-per-doc UndoManager |

---

## Three multi-agent scenarios

1. **Different harnesses** (Claude Code + Cursor): Different `clientInfo.name`, different `connectionId`. Distinguished by both.
2. **Same harness, different processes** (two Claude Code CLIs): Same `clientInfo.name`, different `connectionId`. Distinguished by `connectionId` only.
3. **Same process, sequential calls** (one Claude Code, multiple tool calls): Same `clientInfo.name`, same `connectionId`. Same agent. Pass boundaries distinguish bursts.

Scenario #2 is the design-critical one — keying on `clientInfo.name` alone would merge two developers' agents into one identity.

---

## Gaps / follow-ups

- Session eviction strategy needed: when an MCP client disconnects (stdio process exits), the server has no signal — DirectConnections linger indefinitely.
- Resource cost of per-agent-per-doc sessions: each DirectConnection holds a Y.Doc reference and awareness state. N agents × M docs = N×M connections.
