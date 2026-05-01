---
title: "MCP Agent Attribution — Implementation Paths"
description: "How to wire agent identity from MCP client connections through to CRDT writes and shadow repo commits in Open Knowledge. Covers SDK extraction, pipeline threading, multi-agent sessions, and cross-harness compatibility."
createdAt: 2026-04-14
updatedAt: 2026-04-14
subjects:
  - Model Context Protocol
  - Open Knowledge
  - Hocuspocus
topics:
  - agent attribution
  - MCP identity
  - multi-agent collaboration
---

# MCP Agent Attribution — Implementation Paths

**Purpose:** Provide concrete implementation guidance for wiring agent identity through Open Knowledge's MCP → HTTP → CRDT → shadow repo pipeline. The story (`collaboration-capabilities-audit/STORY.md` §14, D12) already established *what* the `AgentIdentity` struct should look like and *why* MCP `clientInfo` is the right identity primitive. This report answers *how* — the specific code paths, the threading strategy, and the cross-harness compatibility surface.

> _Updated 2026-04-30: the MCP runtime now lives in `ok start` behind the Streamable HTTP `/mcp` endpoint; `ok mcp` is a thin stdio→HTTP shim. Per-session identity is derived from each HTTP MCP session's `clientInfo.name` plus a server-generated `connectionId`. The old process-wide label model is gone, and server lifetime is owned by idle-shutdown rather than the editor that first spawned the server._

---

## Executive Summary

At the time of this report, Open Knowledge attributed all agent writes to a hardcoded `DEFAULT_AGENT_ID = 'claude-1'` and all shadow repo commits to `WriterIdentity { id: 'server' }`. Eight specific points in the pipeline dropped identity. The MCP SDK already captured `clientInfo` (harness name + version) during the initialize handshake and exposed it via `McpServer.server.getClientVersion()` — it just was not being read.

The implementation path was a straight pipeline threading: extract identity at MCP session initialization, generate a `connectionId`, compose an `AgentIdentity`, pass it through HTTP API bodies to the Hocuspocus server, use it for session management, activity map entries, and shadow repo commits. The current HTTP MCP implementation follows that direction at the MCP/session boundary: identity is per session, not process-wide.

**Key Findings:**

- **The MCP SDK gives you everything you need.** `McpServer.server.getClientVersion()` returns `{ name, version }` after the initialize handshake. For stdio transport (which all local harnesses use), generate a process-scoped UUID as `connectionId`. This works universally across Claude Code, Cursor, Windsurf, Codex, Cline, and Copilot.
- **8 hardcoded identity points form the full attribution gap.** The pipeline from MCP tool call to shadow repo commit drops identity at every layer. The fix touches 4 packages but each change is mechanical — extend HTTP body → accept in API handler → thread to sessions → thread to persistence.
- **Multi-agent requires per-agent-per-doc sessions.** The current `AgentSessionManager` keys on `docName` only. Two agents editing the same doc share one `DirectConnection` and one awareness state. Keying on `(docName, agentId)` is required for correct presence, activity attribution, and future per-agent undo.
- **Cross-harness compatibility is strong for stdio.** Every major harness uses stdio for local servers. The server-generated UUID strategy is transport-universal. `clientInfo.name` values are distinct across harnesses (`"claude-code"`, `"cursor"`, `"cascade"`, `"codex"`, `"copilot"`, `"cline"`).

---

## Research Rubric

| # | Dimension | Depth | Stance |
|---|-----------|-------|--------|
| D1 | MCP SDK extraction surface | Deep | Conclusions |
| D2 | Identity threading: MCP → HTTP API → Hocuspocus | Deep | Conclusions |
| D3 | Shadow repo attribution enrichment | Moderate | Conclusions |
| D4 | Multi-agent session management | Moderate | Conclusions |
| D5 | Cross-harness compatibility | Moderate | Conclusions |

---

## Detailed Findings

### D1: MCP SDK Extraction Surface

**Finding:** The MCP SDK (`@modelcontextprotocol/sdk@1.29.0`) stores `clientInfo` from the initialize handshake and exposes it via a clean public API path.

**Evidence:** [evidence/d1-mcp-sdk-extraction.md](evidence/d1-mcp-sdk-extraction.md)

The `Implementation` type has required `name` + `version` fields plus optional rich metadata (`title`, `description`, `websiteUrl`, `icons`). In practice, only `name` and `version` are populated by major harnesses.

**Access path:**

```
McpServer (packages/cli creates this)
  └── .server: Server (readonly, public)
        ├── .getClientVersion(): Implementation | undefined
        │     Returns { name: "claude-code", version: "2.1.87" } after initialize
        └── .oninitialized: () => void
              Callback fires when handshake completes — guarantees clientInfo is populated
```

**For stdio transport** (Open Knowledge's transport), `extra.sessionId` in tool handlers is always `undefined`. The `StdioServerTransport` does not generate or expose any connection identifier. A `connectionId` must be server-generated.

**Recommendation:** Generate a UUID at `startMcpServer()` time. Wire `server.server.oninitialized` to capture `clientInfo`. Compose into `AgentIdentity` and close over it in tool handler registrations.

```typescript
// In startMcpServer():
const connectionId = crypto.randomUUID();
let agentIdentity: AgentIdentity | undefined;

server.server.oninitialized = () => {
  const clientInfo = server.server.getClientVersion();
  agentIdentity = {
    connectionId,
    clientInfo: clientInfo ? { name: clientInfo.name, version: clientInfo.version } : undefined,
    label: options.config.agentLabel,  // from .mcp.json config
    displayName: options.config.agentLabel || clientInfo?.name || 'Agent',
    colorSeed: connectionId,
  };
};
```

**Decision trigger:** This is the extraction point. If the MCP SDK changes the `getClientVersion()` API or adds richer identity primitives (e.g., OAuth-derived identity for HTTP transport), this is the single point to update.

---

### D2: Identity Threading Pipeline

**Finding:** The full pipeline from MCP tool call to shadow repo commit has 8 points where identity is hardcoded or missing. The fix is a straight threading through 4 packages — no architectural changes, just passing a value down the call chain.

**Evidence:** [evidence/d2-identity-threading-pipeline.md](evidence/d2-identity-threading-pipeline.md)

**Current pipeline (identity lost at every layer):**

```
MCP Client → initialize { clientInfo } ← AVAILABLE but UNUSED
     │
     │ tool call
     ▼
MCP Tool Handler → httpPost('/api/agent-write-md', { docName, markdown, position })
     │                                               ← NO agentId IN BODY
     ▼
HTTP API Handler → activityMap.set('claude-1', ...)  ← HARDCODED
     │
     ▼
Agent Session → awareness { name: 'Claude' }         ← HARDCODED
     │
     ▼
Persistence → commitWip(defaultWriter)               ← id: 'server'
     │
     ▼
Shadow Repo → refs/wip/main/server                   ← ALL AGENTS MERGED
```

**Recommended threading (4 changes):**

| Layer | Change | Effort |
|-------|--------|--------|
| **MCP tools** | Add `agentId` + `agentName` to HTTP POST bodies. Close over `agentIdentity` from startup. | Small — ~10 lines per tool file |
| **HTTP API** | Accept optional `agentId` + `agentName` in request body. Use instead of `DEFAULT_AGENT_ID` when present. Backward-compatible (falls back to `DEFAULT_AGENT_ID` for non-MCP callers). | Medium — ~30 lines across 3 handlers |
| **Agent sessions** | Accept `agentId` in `getSession()`. Key sessions by `(docName, agentId)`. Set per-agent awareness. | Medium — ~50 lines refactor |
| **Persistence** | Track "last agent writer" per doc (side-channel from agent write transactions). Pass to `commitWip()` instead of `defaultWriter` when available. | Medium — ~40 lines |

**Backward compatibility:** All changes are additive. The HTTP API accepts an optional `agentId` — callers without it (e.g., direct HTTP tests, the agent simulator) get `DEFAULT_AGENT_ID` behavior. No breaking changes.

---

### D3: Shadow Repo Attribution Enrichment

**Finding:** The shadow repo infrastructure is already parameterized for per-agent attribution — it just needs real identity as input. No schema changes required.

**Evidence:** [evidence/d3-shadow-repo-attribution.md](evidence/d3-shadow-repo-attribution.md)

`WriterIdentity { id, name, email }` maps cleanly to git commit semantics. Encoding strategy:

| Field | Current value | Per-agent value |
|-------|---------------|-----------------|
| `id` | `'server'` | `'agent-<connectionId>'` → triggers `parseWriterId` → `classification: 'agent'` |
| `name` | `'openknowledge-server'` | `'Claude Code (research-agent)'` → `displayName` from `AgentIdentity` |
| `email` | `'noreply@openknowledge.local'` | `'agent-<connectionId>@openknowledge.local'` → unique per connection |

WIP refs become `refs/wip/<branch>/agent-<connectionId>` instead of `refs/wip/<branch>/server`. The `shadow-log.ts` read path already extracts `writerName` from `GIT_AUTHOR_NAME` and classifies by `agent-*` prefix — no CLI changes needed for basic attribution.

**The L2 debounce challenge:** Persistence fires `commitWip()` on a debounce timer, coalescing all writes since the last commit. If two agents write to the same doc within one debounce window, persistence must decide whose `WriterIdentity` to use. Options:

1. **Last-writer-wins:** Track the most recent agent writer per doc. Simple, loses attribution for the first writer in a burst.
2. **Per-agent dirty tracking:** Maintain a `Set<agentId>` of agents who wrote since last commit. Commit once per dirty agent. Creates more commits but preserves attribution.
3. **Combined attribution:** Use a composite writer like `agent-<id1>+<id2>`. Breaks `parseWriterId` prefix matching and complicates the model.

**Recommendation:** Option 2 (per-agent dirty tracking) aligns with the existing per-writer ref design (`refs/wip/<branch>/<writer.id>`). Each agent already gets its own ref — committing to each dirty agent's ref separately is the natural fit. The cost is more frequent git commits during multi-agent bursts, but WIP commits are lightweight (no working tree checkout, just `hash-object` + `update-ref`).

---

### D4: Multi-Agent Session Management

**Finding:** The current single-agent model breaks in 3 specific ways with multiple agents: session collision, awareness merging, and activity map overwriting.

**Evidence:** [evidence/d4-multi-agent-sessions.md](evidence/d4-multi-agent-sessions.md)

**Session collision:** `sessions = Map<docName, DirectConnection>`. Agent B writing to the same doc as Agent A silently reuses Agent A's session. Agent B's identity is invisible.

**Awareness merging:** All agents appear as a single "Claude" with the same color in the presence bar. No visual distinction.

**Activity map overwriting:** `activityMap.set('claude-1', ...)` with a single key — last writer wins. Flash attribution is wrong in multi-agent scenarios.

**Recommended session model:**

```typescript
// Current:
private sessions = new Map<string, AgentDirectConnection>();

// Proposed:
private sessions = new Map<string, Map<string, AgentDirectConnection>>();
//                         docName → agentId → DirectConnection

getSession(docName: string, agentId: string, identity: AgentIdentity): AgentDirectConnection {
  let docSessions = this.sessions.get(docName);
  if (!docSessions) {
    docSessions = new Map();
    this.sessions.set(docName, docSessions);
  }
  let dc = docSessions.get(agentId);
  if (!dc) {
    dc = this.hocuspocus.openDirectConnection(docName) as AgentDirectConnection;
    dc.document.awareness.setLocalState({
      user: {
        name: identity.displayName,
        color: colorFromSeed(identity.colorSeed),
        type: 'agent',
        icon: iconFromClientName(identity.clientInfo?.name),
        tabId: `agent-${identity.connectionId}`,
      },
      mode: 'idle',
    });
    docSessions.set(agentId, dc);
  }
  return dc;
}
```

**Resource considerations:** N agents × M docs = N×M DirectConnections. In practice, N is small (1-3 agents) and M is the number of docs actively being edited. Session eviction on idle timeout or MCP disconnect would cap growth.

**Session cleanup signal:** For stdio transport, the MCP subprocess exit is the cleanup signal. Wire `process.on('exit')` or `transport.onclose` to call `closeSessionsForAgent(agentId)`.

---

### D5: Cross-Harness Compatibility

**Finding:** For stdio transport (which all local harnesses use), the server-generated UUID strategy is universal. `clientInfo.name` values are distinct enough to identify harness type.

**Evidence:** [evidence/d5-cross-harness-compatibility.md](evidence/d5-cross-harness-compatibility.md)

**Known `clientInfo.name` values:**

| Harness | `clientInfo.name` | Confidence |
|---------|-------------------|------------|
| Claude Code | `"claude-code"` | CONFIRMED |
| Claude Desktop | `"claude-ai"` | CONFIRMED |
| Cursor | `"cursor"` | INFERRED |
| Windsurf | `"cascade"` | INFERRED |
| Cline | `"cline"` | INFERRED |
| VS Code Copilot | `"copilot"` | INFERRED |
| OpenAI Codex | `"codex"` | INFERRED |

**Why stdio transport makes this simple:** For local MCP servers, every harness spawns a subprocess. One subprocess = one stdio connection = one `clientInfo` = one `connectionId`. The server generates a UUID at startup — this UUID is the definitive identity for the lifetime of that subprocess. No session management complexity, no stale session bugs, no session recycling issues.

**Codex caveat:** Codex creates fresh MCP sessions per tool call on HTTP transport (violating the spec). This doesn't affect stdio but is a landmine for future HTTP transport support.

**Verification strategy:** Log the raw `initialize` request in `startMcpServer()` (to stderr). Ask developers using different harnesses to share the logged output. This verifies the INFERRED values with zero effort.

---

## Implementation Sequence

Based on the findings, here is the recommended implementation order within PR #39's expanded scope (TQ17/TQ18):

### Phase 1: Extract + Thread (TQ17)

1. Generate `connectionId` (UUID) at `startMcpServer()` startup
2. Capture `clientInfo` via `server.server.oninitialized`
3. Compose `AgentIdentity` struct
4. Pass `agentIdentity` into tool registration closures
5. Add `agentId` + `agentName` to HTTP POST bodies from MCP tools
6. Accept `agentId` in API handlers; use for activity map entries

**Test:** Verify `clientInfo.name` is logged for Claude Code connections. Verify activity map entries carry real agent IDs.

### Phase 2: Multi-Agent Sessions (TQ18)

7. Refactor `AgentSessionManager` to key by `(docName, agentId)`
8. Set per-agent awareness state (name, color from `colorSeed`)
9. Add session cleanup on transport close

**Test:** Two CLI processes writing to the same doc show distinct presence entries.

### Phase 3: Shadow Attribution

10. Track per-agent dirty docs in persistence (side-channel from `AGENT_WRITE_ORIGIN`)
11. Pass agent-specific `WriterIdentity` to `commitWip()` per dirty agent
12. Verify `parseWriterId` classifies correctly for `agent-<connectionId>` IDs

**Test:** Shadow repo history shows distinct agent-prefixed WIP refs. `get_history` returns agent attribution.

### Phase 4: `DEFAULT_AGENT_ID` Removal

13. Remove `DEFAULT_AGENT_ID = 'claude-1'` export
14. Update all remaining references to use dynamic identity or a graceful fallback
15. Update agent simulator to pass test identity

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **INFERRED `clientInfo.name` values** for Cursor, Windsurf, Cline, Copilot, Codex: These are based on naming conventions and community reports. Verification requires connecting each harness and logging the initialize request.
- **HTTP transport identity threading:** This report focuses on stdio transport. HTTP/SSE transport adds `Mcp-Session-Id` complexity (Codex session recycling, Cursor stale sessions) — deferred to a future iteration.

### Out of Scope (per Rubric)

- Per-agent UndoManager implementation (deferred to V0-14, depends on Phase 2 sessions being in place)
- Timeline panel display logic (covered in STORY.md §14 timeline display composition)
- Pass boundary grouping algorithm (covered in STORY.md D9)
- Agent label configuration UX (`.mcp.json` config surface)

---

## References

### Evidence Files
- [evidence/d1-mcp-sdk-extraction.md](evidence/d1-mcp-sdk-extraction.md) — MCP SDK type analysis, lifecycle hooks, `getClientVersion()` API
- [evidence/d2-identity-threading-pipeline.md](evidence/d2-identity-threading-pipeline.md) — Full pipeline trace, 8 hardcoded identity points
- [evidence/d3-shadow-repo-attribution.md](evidence/d3-shadow-repo-attribution.md) — WriterIdentity encoding, commit path analysis, L2 debounce options
- [evidence/d4-multi-agent-sessions.md](evidence/d4-multi-agent-sessions.md) — Session collision analysis, multi-agent model design
- [evidence/d5-cross-harness-compatibility.md](evidence/d5-cross-harness-compatibility.md) — clientInfo values, transport analysis, interop matrix

### External Sources
- [MCP Specification — Lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle) — `clientInfo` in initialize handshake
- [MCP Specification — Transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — stdio vs HTTP session semantics
- [Claude Code Docs — MCP](https://code.claude.com/docs/en/mcp) — MCP server lifecycle
- [Cursor Forum — Stale Session ID](https://forum.cursor.com/t/cursor-fails-to-recover-from-stale-session-id-http-400-on-mcp-reconnect/138169) — Known bug
- [OpenAI — Session Problem](https://medium.com/@ylenius/openais-mcp-session-problem-and-how-we-worked-around-it-7b40d1b19710) — Codex session recycling

### Related Research
- [stories/collaboration-capabilities-audit/STORY.md §14](../../stories/collaboration-capabilities-audit/STORY.md) — MCP identity research + AgentIdentity struct design + pass boundary grouping
