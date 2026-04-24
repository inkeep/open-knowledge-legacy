---
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-server": minor
"@inkeep/open-knowledge": minor
---

feat(presence): unify agent presence on `__system__` awareness (multi-agent)

N concurrent agents (Claude + Cursor, two Claudes, etc.) now coexist in the presence bar as distinct badges. The previous per-content-doc awareness surface stomped because every Hocuspocus `Document` has one shared `Awareness` clientID — every agent's `setLocalState` overwrote the prior. Presence now lives on the `__system__` Y.Doc's awareness as a map-valued `agentPresence` field keyed by `agentId`.

**Breaking (core):**

- `AwarenessUser.type` narrowed from `'human' | 'agent'` to `'human'`. Agents no longer publish per-doc awareness — construct `AgentPresenceEntry` instead and call the server-side `AgentPresenceBroadcaster`. If you were reading `user.type === 'agent'` on per-doc awareness, that path is gone; read `agentPresence?` on `__system__.awareness` instead.
- `AgentFocusEntry` type export removed. Use `AgentPresenceEntry` from `@inkeep/open-knowledge-core`.
- `AwarenessState.agentFocus?` field removed. Replaced by `agentPresence?: Record<string, AgentPresenceEntry>` on the same type.

**Breaking (server):**

- `AgentFocusBroadcaster` renamed to `AgentPresenceBroadcaster`. API replaced: `setFocus`/`clearFocus`/`getFocusMap` → `setPresence(agentId, entry)`, `clearPresence(agentId)`, `touchMode(agentId, mode)`, `getPresenceMap()`. Entry shape now `{displayName, icon, color, currentDoc, mode, ts}` (was `{agentName, currentDoc, writeKind, ts}`).
- `ServerInstance.agentFocusBroadcaster` renamed to `agentPresenceBroadcaster`.
- `ApiExtensionOptions.agentFocusBroadcaster` renamed to `agentPresenceBroadcaster`.
- New endpoint `GET /api/metrics/agent-presence` returns the presence map for operator diagnostics (not polled by the browser).

**CLI:**

- MCP keepalive URL now carries `&agentId=${connectionId}` so the server can deterministically clear presence on process exit. Older MCP clients without the param fall back gracefully to the 5s TTL filter.

**Client:**

- `PresenceBar` renders sectioned: current-doc agents + humans | divider | cross-doc agents (dimmed). Cross-doc agents are now keyboard-accessible — the avatar itself is a button with an aria-label describing the target doc; clicking navigates.
- `-space-x-1.5` (overlapping avatars) replaced with `gap-1.5` so 2+ agents render side-by-side cleanly (triage #1 fix).
