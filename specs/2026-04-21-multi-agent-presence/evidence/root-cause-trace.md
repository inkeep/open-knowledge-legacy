---
title: Root-cause trace — multi-agent presence collapse
tags: [spec, evidence, presence, awareness]
sources:
  - packages/core/src/types/awareness.ts
  - packages/app/src/presence/PresenceBar.tsx
  - packages/app/src/presence/use-presence.ts
  - packages/app/src/presence/identity.ts
  - packages/server/src/agent-sessions.ts
  - packages/server/src/agent-focus.ts
  - packages/server/src/api-extension.ts
  - packages/cli/src/mcp/server.ts
  - packages/cli/src/mcp/agent-identity.ts
  - packages/cli/src/mcp/tools/write-document.ts
  - packages/app/src/components/SystemDocSubscriber.tsx
  - packages/app/src/lib/agent-focus.ts
  - node_modules/@hocuspocus/server/src/Document.ts
  - node_modules/@hocuspocus/server/src/DirectConnection.ts
---
# Root-cause trace — multi-agent presence collapse

**Parent spec:** [[specs/2026-04-21-multi-agent-presence/SPEC]]
**Baseline commit:** 05c7e371
**Date:** 2026-04-21
**Purpose:** Code-level evidence for the observation that N concurrent AI agents writing to the same document collapse into one presence slot.

---

## Observation

bug-bash 2026-04-17 (see [[projects/v0-launch/bug-bash-triage]] item #1, Cluster A). Participants reproduced: 2× Claude Code → one badge. Claude Code + Cursor → one badge (last writer wins).

## Trace

### 1. Per-MCP-process identity — correct

Each MCP stdio process generates a UUID connectionId at startup.

**`packages/cli/src/mcp/server.ts:286-311`**

```typescript
const connectionId = randomUUID();
const label = process.env.AGENT_LABEL || undefined;
const identityRef: { current: AgentIdentity } = {
  current: {
    connectionId,
    label,
    displayName: label ?? 'Agent',
    colorSeed: label ?? connectionId,
  },
};
server.server.oninitialized = () => {
  const clientInfo = server.server.getClientVersion();
  identityRef.current = {
    connectionId,
    clientInfo: clientInfo ? { name: clientInfo.name, version: clientInfo.version } : undefined,
    label,
    displayName: label ?? clientInfo?.name ?? 'Agent',
    colorSeed: label ?? clientInfo?.name ?? connectionId,
  };
};
```

**`packages/cli/src/mcp/tools/write-document.ts:58-70`** — connectionId flows through each tool call as `agentId`.

### 2. Server session keying — correct

**`packages/server/src/agent-sessions.ts:179-218`**

Sessions are keyed by `(docName, agentId)`:

```typescript
private sessionKey(docName: string, agentId: string): string {
  return `${docName}\0${agentId}`;
}

async getSession(docName, agentId = 'claude-1', identity?): Promise<AgentDirectConnection> {
  const key = this.sessionKey(docName, agentId);
  let dc = this.sessions.get(key);
  if (!dc) {
    dc = (await this.hocuspocus.openDirectConnection(docName)) as AgentDirectConnection;
    // ...
    this.sessions.set(key, dc);
  }
  return dc;
}
```

**Unit test coverage (`packages/server/src/agent-sessions.test.ts:90-96`)** confirms separate DCs per agent on the same doc:

```typescript
test('creates separate sessions for different agents on the same doc', async () => {
  const dc1 = await manager.getSession('doc.md', 'agent-alice');
  const dc2 = await manager.getSession('doc.md', 'agent-bob');
  expect(dc1).not.toBe(dc2);
});
```

### 3. The bug — shared Document.awareness

**`node_modules/@hocuspocus/server/src/Document.ts:49-50`**

```typescript
this.awareness = new Awareness(this);  // ONE per Document
this.awareness.setLocalState(null);
```

Every `Document` has exactly one `Awareness` object. The Y.Doc's `clientID` is the Awareness's `clientID`.

**`node_modules/@hocuspocus/server/src/DirectConnection.ts:12-27`**

```typescript
export class DirectConnection<Context = any> implements DirectConnectionInterface {
  document: Document | null = null;
  instance!: Hocuspocus;
  context: Context;

  constructor(document: Document, instance: Hocuspocus, context?: Context) {
    this.document = document;
    // ...
    this.document.addDirectConnection();
  }
  // no new Awareness instance
}
```

A `DirectConnection` is a thin wrapper over a `Document`. `dc.document.awareness` is literally `document.awareness`. Multiple DCs to the same Document share ONE Awareness with ONE clientID.

### 4. The stomp — setLocalState is last-write-wins

**`packages/server/src/agent-sessions.ts:202-211`**

```typescript
dc.document.awareness.setLocalState({
  user: {
    name: identity?.displayName ?? 'Claude',
    color,
    type: 'agent',
    icon,
    tabId: `agent-${agentId}`,
  },
  mode: 'idle',
});
```

When session A calls this, then session B calls it, B overwrites A. The local state under the Document's shared clientID is now B's — A is lost.

**`packages/server/src/api-extension.ts:1085, 1100` (and two similar pairs)** compound the stomp:

```typescript
dc.document.awareness.setLocalStateField('mode', 'editing');
try { ... } finally {
  dc.document.awareness.setLocalStateField('mode', 'idle');
}
```

Each write handler flips `mode` on the shared state — across agents, the mode field is also racy.

### 5. Client renders a single slot

**`packages/app/src/presence/use-presence.ts:25-34`**

```typescript
const entries = Array.from(awareness.getStates().entries());
const result: Participant[] = [];
for (const [clientId, state] of entries) {
  const s = state as Record<string, unknown>;
  if (s.user && typeof s.user === 'object') {
    result.push({ clientId, user: s.user, mode: s.mode ?? 'wysiwyg' });
  }
}
```

Iterates all awareness clientIDs. Since the server side only publishes ONE server clientID for agents (the Document's own), the loop produces at most one agent participant per doc, with whatever user was last written.

**`packages/app/src/presence/PresenceBar.tsx:136-138`**

```tsx
{participants.map((p) => (
  <PresenceAvatar key={p.clientId} user={p.user} mode={p.mode} />
))}
```

One avatar per unique clientID. Visually: humans each get their own (they connect from browsers with unique clientIDs); agents all funnel through the one server clientID → one slot.

### 6. Why `__system__` is different (and the workaround pattern already exists)

**`packages/server/src/agent-focus.ts:8-10`** — explicit comment describes the same constraint and the workaround:

```typescript
/**
 * - State is a map-valued awareness field keyed by `agentId`, so N concurrent
 *   agents coexist under the single shared `clientID` without stomping.
 */
```

**`packages/server/src/agent-focus.ts:32-75`** — implementation:

```typescript
setFocus(agentId: string, entry: AgentFocusEntry): void {
  this.mutateAgentFocus((current) => ({ ...current, [agentId]: entry }));
}

private mutateAgentFocus(update) {
  const existing = (awareness.getLocalState() ?? {}) as { agentFocus?: ... };
  const current = existing.agentFocus ?? {};
  const nextFocus = update(current);
  awareness.setLocalState({ ...existing, agentFocus: nextFocus });
}
```

This writes to `__system__` awareness — the single clientID stomp limitation still applies, but the content is a MAP, so each agent is a separate key. `mutateAgentFocus` merge-updates, preserving peers.

**`packages/app/src/lib/agent-focus.ts:48-62`** — client aggregates across all peers on the __system__ awareness, iterating the map entries, filtering stale via `ts`, returning the latest-`ts` entry.

### 7. Why humans don't hit this bug

Humans connect via browser `HocuspocusProvider` → each tab is its own WebSocket client with its own Y.Doc on the browser side with its own clientID. Their awareness entries show up on the content doc's awareness with distinct clientIDs, natively differentiated.

The presence of a bug here is specific to **server-side producers** (DirectConnection) sharing a Document. Humans never go through DirectConnection.

## Failure mode taxonomy

| Scenario                                        | Observable                                                    | Root cause                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 2 Claude Code instances, same doc               | Last writer badge only                                        | setLocalState stomp on shared clientID                                                                               |
| Claude Code + Cursor, same doc                  | Last writer badge only                                        | Same                                                                                                                 |
| Claude Code + Cursor on different docs          | Depends on active doc; confusing cross-doc state              | Presence bar ties to active doc only; `agentFocus` mapping gives correct signal but PresenceBar doesn't read from it |
| Two writes from same Claude in rapid succession | No bug here — same agentId → same session → same state update | (Not a bug)                                                                                                          |
| Mode flickering during concurrent writes        | Mode field flickers on the shared state                       | `setLocalStateField('mode', ...)` races across agents                                                                |

## Gaps in test coverage

- **No multi-agent awareness test.** `agent-sessions.test.ts` uses a mock where each DC has its own `awareness` object (`packages/server/src/agent-sessions.test.ts:16-22`). That inverts the bug's premise — tests cannot catch it.
- **No integration test for presence bar with 2+ agents.** The Playwright E2E + integration test suite does not spin two server-side DirectConnections sharing a Document.

## Related precedent

- **Precedent #3 (structured event schemas):** `AgentFocusEntry` already follows this shape; `AgentPresenceEntry` inherits the convention.
- **Precedent #8 (long-lived identity vs session concerns):** `agentId` / `connectionId` is long-lived (UUID per MCP process); session TTL + `ts` staleness are short-lived. The spec respects the separation.

## Verified by

Read of:

- `node_modules/@hocuspocus/server/src/Document.ts` (confirmed one Awareness per Document)
- `node_modules/@hocuspocus/server/src/DirectConnection.ts` (confirmed no per-DC Awareness)
- `packages/server/src/agent-sessions.ts:202-211` (confirmed stomp pattern)
- `packages/server/src/agent-focus.ts` (confirmed map-valued workaround pattern)
- `packages/server/src/agent-sessions.test.ts` (confirmed test mock inverts the bug's premise)
- `packages/cli/src/mcp/server.ts:290` (confirmed connectionId is per-process UUID)
- `packages/cli/src/mcp/tools/write-document.ts:58-70` (confirmed agentId flows correctly)
- `packages/app/src/components/SystemDocSubscriber.tsx` (confirmed browser-side __system__ provider exists)



