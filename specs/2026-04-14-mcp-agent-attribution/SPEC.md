# MCP Agent Attribution

**Status:** FINAL
**Author:** Miles
**Baseline commit:** 107e2ef
**Related:** [STORY.md §14 (D12)](../../stories/collaboration-capabilities-audit/STORY.md), [REPORT.md](../../reports/mcp-agent-attribution-implementation/REPORT.md)

---

## 1. Problem Statement

**Situation:** Open Knowledge is a CRDT collaborative editor where AI agents write documents via MCP tools. The system has three attribution surfaces — shadow repo (git journal), activity map (real-time flash UI), and awareness (presence bar) — all architected to carry per-writer identity.

**Complication:** Every agent write is attributed to hardcoded identities: `DEFAULT_AGENT_ID = 'claude-1'` in the activity map, `name: 'Claude'` in presence, and `WriterIdentity { id: 'server' }` in shadow repo commits. When multiple agents — or multiple instances of the same harness — edit documents, they appear as a single entity across all surfaces. The timeline, presence, and history features being built in PR #39 will show "Claude" for everything.

**Resolution:** Thread real agent identity from MCP `clientInfo` (proven available via `McpServer.server.getClientVersion()`) through the full pipeline: MCP → HTTP API → agent sessions → activity map → persistence → shadow repo commit messages.

---

## 2. Goals

1. **Distinct agent identity in presence.** Each connected agent appears with its own name, color, and icon in the presence bar.
2. **Per-agent activity attribution.** The activity map carries real agent IDs so flash UI shows which agent wrote what.
3. **Honest shadow repo attribution.** WIP commits carry structured contributor metadata in the commit message body. The timeline can show "Claude Code wrote intro.md, Cursor wrote auth-flow.md" per commit.
4. **Multi-agent session isolation.** Two agents editing the same document get separate `DirectConnection`s with independent awareness state.
5. **Cross-harness compatibility.** The identity extraction works for all major MCP clients: Claude Code, Claude Desktop, Cursor, Windsurf, Codex, Cline, Copilot.
6. **Agent label configuration.** Users can assign human-readable labels to agents via `.mcp.json` env vars.

## 3. Non-Goals

- **NOT NOW: Per-agent UndoManager.** Depends on this work (per-agent sessions must exist) but is a separate architectural concern. Deferred to V0-14 three-UndoManager architecture.
- ~~NOT NOW: Timeline panel UI rendering.~~ **IN SCOPE** — PR #39 merged. Timeline rendering of agent contributors is included (see §7.11).
- **NOT NOW: HTTP/SSE transport identity.** This spec covers stdio transport only (all local MCP connections). HTTP transport adds `Mcp-Session-Id` complexity (Codex session recycling, Cursor stale sessions) — deferred.
- **NOT NOW: Pass boundary grouping.** The product-native user-action-bounded grouping (STORY.md D9) is a timeline-layer concern that consumes agent identity but doesn't define it.
- **NEVER: Cryptographic identity verification.** `clientInfo` is self-reported. We do not attempt to verify that a client claiming to be "claude-code" is actually Claude Code.

---

## 4. Personas

1. **Solo developer + one agent.** Uses Claude Code to write docs. Wants to see "Claude Code wrote this" vs "I wrote this" in the timeline.
2. **Solo developer + multiple agents.** Has Claude Code and Cursor both connected. Wants to distinguish them in presence and history.
3. **Team + agents.** Multiple developers, each with their own Claude Code process. Wants to see which developer's agent wrote what (distinguished by `connectionId`, not just `clientInfo.name`).
4. **MCP tool author.** Builds custom MCP tools. Needs the identity contract documented so their tools carry attribution correctly.

---

## 5. Current State

### Identity pipeline (8 hardcoded points)

```
MCP Client → initialize { clientInfo } ← AVAILABLE but UNUSED
     │ tool call
     ▼
MCP Tool Handler → httpPost('/api/agent-write-md', { docName, markdown, position })
     │                                               ← NO agentId IN BODY
     ▼
HTTP API Handler → activityMap.set('claude-1', ...)  ← HARDCODED × 6 locations
     │
     ▼
Agent Session → awareness { name: 'Claude' }         ← HARDCODED
     │ sessions keyed by docName only                 ← COLLISION on multi-agent
     ▼
Persistence → commitWip(defaultWriter)               ← id: 'server'
     │
     ▼
Shadow Repo → refs/wip/main/server                   ← ALL AGENTS MERGED
```

See [evidence/pipeline-trace.md](evidence/pipeline-trace.md) for the complete file-by-line trace.

### What's already ready (no changes needed)

- `shadow-repo.ts:commitWip()` — already accepts `WriterIdentity` param
- `shadow-repo-layout.ts:parseWriterId()` — already classifies `agent-*` prefix
- `shadow-log.ts:ShadowCommit` — already surfaces `writerId`, `writerName`, `writerClassification`
- `awareness.ts` types — shape is correct; values are the problem
- Identity extraction verified via local probe (methodology: MCP `McpServer.server.getClientVersion()` returns `{ name: "claude-code", version: "2.1.101", title: "Claude Code" }` from a live Claude Code connection)

---

## 6. Target State

### AgentIdentity struct (from STORY.md D12)

```typescript
interface AgentIdentity {
  connectionId: string;      // server-generated UUID (stdio) or extra.sessionId (HTTP)
  clientInfo?: {
    name: string;            // e.g., "claude-code", "cursor", "cascade"
    version: string;
  };
  label?: string;            // user-provided via AGENT_LABEL env var in .mcp.json
  displayName: string;       // derived: label || clientInfo.name || "Agent"
  colorSeed: string;         // derived: connectionId → deterministic color
}
```

### Target pipeline

```
MCP Client → initialize { clientInfo: { name: "claude-code", version: "2.1.101" } }
     │
     │ server.server.oninitialized → capture clientInfo + generate connectionId
     │ compose AgentIdentity → close over it in tool registrations
     │
     │ tool call
     ▼
MCP Tool Handler → httpPost('/api/agent-write-md', {
     │               docName, markdown, position,
     │               agentId: "agent-<connectionId>",
     │               agentName: "claude-code" })
     ▼
HTTP API Handler → activityMap.set("agent-<connectionId>", {
     │               agentId: "agent-<connectionId>", ... })
     │             → recordContributor(docName, agentId, displayName)
     ▼
Agent Session → getSession(docName, agentId, identity)
     │            → per-agent awareness { name: "claude-code", color: <derived> }
     │            → sessions keyed by (docName, agentId)
     ▼
Persistence → L2 commitToWipRef()
     │           → reads pendingContributors accumulator
     │           → builds commit message with ok-contributors: block
     │           → commits as WriterIdentity { id: 'server' } (honest composite)
     ▼
Shadow Repo → refs/wip/main/server (commit message carries attribution)
     │
     ▼
shadow-log.ts → parses ok-contributors: from %b
              → ShadowCommit.contributors: [{ agentId, displayName, docs }]
```

---

## 7. Detailed Design

### 7.1 MCP Identity Extraction (packages/cli)

**File:** `packages/cli/src/mcp/server.ts`

At `startMcpServer()` time:

1. Generate `connectionId = randomUUID()` before `server.connect(transport)`.
2. Wire `server.server.oninitialized` callback to capture `clientInfo` via `getClientVersion()`.
3. Read optional `AGENT_LABEL` from `process.env` (set via `.mcp.json` env config).
4. Compose `AgentIdentity` and pass to `registerAllTools()`.

```typescript
const connectionId = randomUUID();
const label = process.env.AGENT_LABEL;

// Ref pattern (matches ShadowRef idiom) — tool handlers read .current at call time
const identityRef: { current: AgentIdentity } = {
  current: {
    connectionId,
    displayName: label || 'Agent',
    colorSeed: label || connectionId,  // prefer stable seed when label exists
  },
};

server.server.oninitialized = () => {
  const clientInfo = server.server.getClientVersion();
  identityRef.current = {
    connectionId,
    clientInfo: clientInfo ? { name: clientInfo.name, version: clientInfo.version } : undefined,
    label,
    displayName: label || clientInfo?.name || 'Agent',
    colorSeed: label || clientInfo?.name || connectionId,  // stable seed hierarchy
  };
  log(`Agent identity: ${identityRef.current.displayName} (${connectionId.slice(0, 8)})`);
};
```

**Threading:** `identityRef` (not `identityRef.current`) is passed to `registerAllTools()`. Tool handlers read `identityRef.current` at call time, so they always see the post-handshake identity. This matches the `ShadowRef` pattern used elsewhere in the codebase.

**`RegisterAllToolsOptions` change:**

```typescript
export interface RegisterAllToolsOptions {
  serverUrl?: string;
  projectDir: string;
  config: Config;
  identityRef: { current: AgentIdentity };  // NEW
}
```

Individual tool `register()` signatures change from `(server, serverUrl)` to `(server, serverUrl, identityRef)`.

### 7.2 MCP Tool Threading (packages/cli)

**Files:** `write-document.ts`, `edit-document.ts`, `save-version.ts`

Each tool handler receives `agentIdentity` via closure from `registerAllTools()`. Add `agentId` and `agentName` to HTTP POST bodies:

```typescript
// write-document.ts
httpPost(serverUrl, '/api/agent-write-md', {
  docName, markdown, position,
  agentId: agentIdentity.connectionId,       // raw UUID — server prefixes 'agent-'
  agentName: agentIdentity.displayName,
});
```

For `save-version.ts`, pass the agent as a writer:

```typescript
httpPost(serverUrl, '/api/save-version', {
  writers: [{
    id: `agent-${agentIdentity.connectionId}`,
    name: agentIdentity.displayName,
    email: `agent-${agentIdentity.connectionId}@openknowledge.local`,
  }],
});
```

### 7.3 HTTP API Identity Acceptance (packages/server)

**File:** `packages/server/src/api-extension.ts`

All three write handlers (`handleAgentWrite`, `handleAgentWriteMd`, `handleAgentPatch`) extract optional `agentId` and `agentName` from the request body. Fall back to `DEFAULT_AGENT_ID` for backward compatibility (non-MCP callers, tests).

```typescript
const rawAgentId = body.agentId;  // raw UUID from MCP, or undefined
const agentId = rawAgentId ? `agent-${rawAgentId}` : 'claude-1';  // server owns prefix; inline fallback
const agentName = body.agentName ?? 'Claude';

// Uses CURRENT ActivityEntry shape (not TQ11 refactored shape — TQ11 is out of scope)
activityMap.set(agentId, {
  agentId,
  timestamp: Date.now(),
  type: 'insert',
  description: `Added: ${markdown.trim().slice(0, 50)}`,
});
```

**Contributor recording:** After each write, call the shared accumulator:

```typescript
recordContributor(docName, agentId, agentName);
```

### 7.4 Multi-Agent Session Management (packages/server)

**File:** `packages/server/src/agent-sessions.ts`

Change session map key from `docName` to `${docName}\0${agentId}`:

```typescript
private sessions = new Map<string, AgentDirectConnection>();

private sessionKey(docName: string, agentId: string): string {
  return `${docName}\0${agentId}`;
}

async getSession(
  docName: string,
  agentId: string = DEFAULT_AGENT_ID,
  identity?: { displayName: string; colorSeed: string; clientName?: string },
): Promise<AgentDirectConnection> {
  const key = this.sessionKey(docName, agentId);
  let dc = this.sessions.get(key);
  if (!dc) {
    dc = (await this.hocuspocus.openDirectConnection(docName)) as AgentDirectConnection;
    dc.document.awareness.setLocalState({
      user: {
        name: identity?.displayName ?? 'Claude',
        color: colorFromSeed(identity?.colorSeed ?? agentId),
        type: 'agent',
        icon: iconFromClientName(identity?.clientName),
        tabId: `agent-${agentId}`,
      },
      mode: 'idle',
    });
    this.sessions.set(key, dc);
  }
  return dc;
}

// Session cleanup — composite key aware
async closeSession(docName: string, agentId: string): Promise<void> {
  const key = this.sessionKey(docName, agentId);
  const dc = this.sessions.get(key);
  if (dc) {
    dc.document.awareness.setLocalState(null);
    await dc.disconnect();
    this.sessions.delete(key);
  }
}

async closeAllForAgent(agentId: string): Promise<void> {
  for (const [key, dc] of this.sessions) {
    if (key.endsWith(`\0${agentId}`)) {
      dc.document.awareness.setLocalState(null);
      await dc.disconnect();
      this.sessions.delete(key);
    }
  }
}

async closeAllForDoc(docName: string): Promise<void> {
  for (const [key, dc] of this.sessions) {
    if (key.startsWith(`${docName}\0`)) {
      dc.document.awareness.setLocalState(null);
      await dc.disconnect();
      this.sessions.delete(key);
    }
  }
}

async closeAll(): Promise<void> {
  for (const [key, dc] of this.sessions) {
    dc.document.awareness.setLocalState(null);
    await dc.disconnect();
  }
  this.sessions.clear();
}
```

**Session eviction (D11):** No active eviction for stdio transport. In embedded mode (`open-knowledge start`), the MCP subprocess and Hocuspocus share a process — process exit cleans up everything. In connected mode (`open-knowledge mcp` connecting to a separate `start`), sessions in the Hocuspocus process survive MCP process death, but the practical impact is low (N agents × M docs). A heartbeat or TTL mechanism is Future Work.

**Helper functions** (new, in `agent-sessions.ts`):

```typescript
function colorFromSeed(seed: string): string {
  // Deterministic color from a palette of 8 agent colors
  const AGENT_COLORS = [
    '#D97757', '#5B8DEF', '#43A047', '#E53935',
    '#8E24AA', '#F4511E', '#00897B', '#3949AB',
  ];
  let hash = 0;
  for (const ch of seed) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
}

function iconFromClientName(name?: string): string {
  const ICON_MAP: Record<string, string> = {
    'claude-code': 'claude',
    'claude-ai': 'claude',
    'cursor': 'cursor',
    'cascade': 'windsurf',
    'codex': 'openai',
    'copilot': 'github',
    'cline': 'cline',
  };
  return name ? (ICON_MAP[name] ?? 'bot') : 'bot';
}
```

### 7.5 Contributor Accumulator (packages/server)

**File:** `packages/server/src/contributor-tracker.ts` (NEW — dedicated module)

A server-local `Map` imported by both `api-extension.ts` (writes) and `persistence.ts` (drains). Clean separation: the accumulator is a write-time concern that persistence consumes at L2 commit time.

```typescript
interface ContributorEntry {
  agentId: string;
  displayName: string;
  docs: Set<string>;
}

// Shared contributor accumulator
const pendingContributors = new Map<string, ContributorEntry>();
//                              agentId → { displayName, docs }

export function recordContributor(docName: string, agentId: string, displayName: string): void {
  let entry = pendingContributors.get(agentId);
  if (!entry) {
    entry = { agentId, displayName, docs: new Set() };
    pendingContributors.set(agentId, entry);
  }
  entry.docs.add(docName);
}

/** Read contributors as JSON lines for commit message. Does NOT clear. */
export function formatContributors(): string {
  if (pendingContributors.size === 0) return '';
  const lines: string[] = [''];
  for (const entry of pendingContributors.values()) {
    lines.push(`ok-contributors: ${JSON.stringify({
      id: entry.agentId,
      name: entry.displayName,
      docs: [...entry.docs],
    })}`);
  }
  return lines.join('\n');
}

/** Clear after successful commit. */
export function clearContributors(): void {
  pendingContributors.clear();
}
```

**Commit message example:**

```
WIP auto-save 2026-04-14T15:00:00Z

ok-contributors: {"id":"agent-abc123","name":"claude-code","docs":["intro.md","setup.md"]}
ok-contributors: {"id":"agent-def456","name":"cursor","docs":["auth-flow.md"]}
```

Each `ok-contributors:` line is a self-contained JSON object. Parseable with `line.slice('ok-contributors: '.length)` → `JSON.parse()`. Handles spaces in display names and doc paths. Extensible — add fields without format version bump.

In `commitToWipRef()` — drain AFTER success to avoid data loss on failed commits:

```typescript
const contributors = formatContributors();  // reads but does NOT clear
const message = `WIP auto-save ${new Date().toISOString()}${contributors}`;
const sha = await commitWip(shadow, defaultWriter, contentRoot, message);
clearContributors();  // only clear after commit succeeds
```

### 7.6 Shared Contributor Parser (packages/core)

**File:** `packages/core/src/shadow-repo-layout.ts` (co-located with existing `parseWriterId`)

Per architectural precedent #4 ("shared computation, per-surface rendering"), the contributor parsing logic lives in core so both readers consume the same implementation.

```typescript
export interface ShadowContributor {
  id: string;
  name: string;
  docs: string[];
}

const OK_CONTRIBUTORS_PREFIX = 'ok-contributors: ';

/** Parse ok-contributors JSON lines from a commit message body. */
export function parseContributors(body: string): ShadowContributor[] {
  if (!body) return [];
  const contributors: ShadowContributor[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith(OK_CONTRIBUTORS_PREFIX)) {
      try {
        contributors.push(JSON.parse(trimmed.slice(OK_CONTRIBUTORS_PREFIX.length)));
      } catch { /* skip malformed lines */ }
    }
  }
  return contributors;
}
```

### 7.7 Shadow Log Reader Extension (packages/cli)

**File:** `packages/cli/src/content/shadow-log.ts`

Extend `ShadowCommit` with parsed contributors:

```typescript
export interface ShadowCommit {
  // ... existing fields
  contributors: ShadowContributor[];  // from core's parseContributors()
}
```

Switch git log format from `|`-delimited to `%x00` (null byte) delimited, and add `%b` (body):

```typescript
// BEFORE: '--format=%H|%aI|%an|%s'
// AFTER:
'--format=%H%x00%aI%x00%an%x00%s%x00%b',
```

Split on `\0` instead of `|` in the parser. Parse `ok-contributors:` from the body field via `parseContributors()` from core. Commits without `ok-contributors:` produce empty `contributors[]` (backward compat).

### 7.8 Timeline Query Extension (packages/server)

**File:** `packages/server/src/timeline-query.ts`

The server-side history reader (used by `/api/history` and the `get_history` MCP tool) must also parse contributors. Update:

1. Change `GIT_LOG_FORMAT` to include `%b` and switch to `%x00` delimiter.
2. Parse `ok-contributors:` via `parseContributors()` from core.
3. Add `contributors: ShadowContributor[]` to `TimelineEntry` type.

Without this, the contributor data written in Phase 3 is invisible to the timeline UI and the MCP `get_history` tool — the primary consumers.

### 7.11 Timeline Panel UI (packages/app)

**File:** `packages/app/src/components/TimelinePanel.tsx`

The current timeline uses heuristic agent detection — `getAuthorColor` checks for `'agent'`, `'cursor'`, or `'claude'` in the author string. Replace with structured data from `TimelineEntry.contributors`.

**Changes to `TimelinePanel.tsx`:**

1. **Replace `getAuthorColor` heuristic** with `entry.contributors`-aware logic:
   - If `entry.contributors.length > 0`: agent entry. Use per-agent color from `colorFromSeed(contributor.name)`.
   - If `entry.contributors.length === 0`: existing behavior (upstream/human/server classification from `author` field).

2. **Replace `displayAuthor` heuristic** with contributor rendering:
   - Single contributor: show `contributor.name` (e.g., "claude-code") with agent dot color.
   - Multiple contributors: show comma-joined names or "2 agents" with expandable detail.
   - No contributors (pre-attribution commits): existing behavior — "Auto-save" for server, raw author for human.

3. **Entry row enhancement** — for entries with contributors, show:
   - Agent name as a styled badge/pill using `--color-agent` CSS var.
   - Doc list from `contributor.docs` as subtle secondary text (e.g., "intro.md, setup.md").
   - Existing relative timestamp unchanged.

**Backward compat:** Entries from pre-attribution commits have `contributors: []`. The existing heuristic display logic is the fallback path — no visual regression for historical entries.

### 7.12 Agent Label Configuration

Users configure labels via `.mcp.json` env vars:

```json
{
  "mcpServers": {
    "open-knowledge": {
      "command": "npx",
      "args": ["@inkeep/open-knowledge", "mcp"],
      "env": {
        "AGENT_LABEL": "research-agent"
      }
    }
  }
}
```

`startMcpServer()` reads `process.env.AGENT_LABEL` and uses it as the `displayName` (takes precedence over `clientInfo.name`).

### 7.13 DEFAULT_AGENT_ID Removal

After all consumers are updated to accept dynamic identity:

- **Remove** the `DEFAULT_AGENT_ID` named constant from `agent-sessions.ts`
- **Remove** the `DEFAULT_AGENT_ID` export from `server/src/index.ts`
- **Remove** all imports of `DEFAULT_AGENT_ID` in `api-extension.ts`
- **Inline** the fallback value `'claude-1'` at usage sites in `api-extension.ts` for backward compatibility (callers that don't send `agentId`)

The named constant is gone. The fallback behavior is preserved via an inline default string. This makes the code explicitly show where fallback identity is used rather than hiding it behind a constant name.

---

## 8. Acceptance Criteria

### AC-1: Identity extraction
- [ ] `startMcpServer()` generates a `connectionId` UUID at startup
- [ ] `server.server.oninitialized` captures `clientInfo` from the MCP handshake
- [ ] `agentIdentity.displayName` is `AGENT_LABEL` (if set) > `clientInfo.name` > `"Agent"`
- [ ] Identity logged to stderr on connection

### AC-2: HTTP API threading
- [ ] `POST /api/agent-write-md` accepts optional `agentId` and `agentName` in body
- [ ] `POST /api/agent-patch` accepts optional `agentId` and `agentName` in body
- [ ] `POST /api/agent-write` accepts optional `agentId` and `agentName` in body
- [ ] `POST /api/save-version` receives `writers[]` from MCP tool with agent identity
- [ ] Callers without `agentId` fall back to `DEFAULT_AGENT_ID` (backward compat)

### AC-3: Activity map attribution
- [ ] Activity map entries use dynamic `agentId` from request body
- [ ] Two agents writing to the same doc produce distinct activity map entries
- [ ] Flash UI shows per-agent attribution (existing flash implementation, new data)

### AC-4: Multi-agent sessions
- [ ] `AgentSessionManager` keys sessions by `(docName, agentId)`
- [ ] Two agents writing to the same doc get separate `DirectConnection`s
- [ ] Each agent's awareness state has distinct `name`, `color`, and `icon`
- [ ] Presence bar shows multiple agent entries when multiple agents are connected

### AC-5: Shadow repo contributor metadata
- [ ] L2 WIP commits include `ok-contributors:` block in commit message body
- [ ] Contributor block lists each agent that wrote since last commit with their `displayName` and affected `docName`(s)
- [ ] `pendingContributors` accumulator is drained (cleared) after each L2 commit
- [ ] Commits remain attributed to `WriterIdentity { id: 'server' }` (honest composite)

### AC-6: Shadow log parsing
- [ ] `ShadowCommit` includes a `contributors: ShadowContributor[]` field
- [ ] `ok-contributors:` block in commit message body is parsed into typed structs
- [ ] Commits without `ok-contributors:` produce empty `contributors` array (backward compat)

### AC-7: Agent label configuration
- [ ] `.mcp.json` `env.AGENT_LABEL` is read at MCP server startup
- [ ] Label overrides `clientInfo.name` as `displayName`
- [ ] Label appears in presence, activity map, and shadow repo contributor metadata

### AC-9: Timeline panel rendering
- [ ] Timeline entries with `contributors` show agent name(s) instead of heuristic-based "Auto-save"
- [ ] Per-agent colors in timeline dot indicators use `colorFromSeed(contributor.name)` (stable across sessions)
- [ ] Multi-contributor entries show all contributing agents
- [ ] Pre-attribution entries (empty `contributors[]`) render with existing heuristic fallback — no visual regression
- [ ] Doc list from contributors visible as secondary text on agent entries

### AC-10: DEFAULT_AGENT_ID removal
- [ ] `DEFAULT_AGENT_ID` named constant removed from `agent-sessions.ts`
- [ ] All 6 hardcoded references in `api-extension.ts` use dynamic identity
- [ ] `DEFAULT_AGENT_ID` export removed from `server/src/index.ts`
- [ ] Fallback value `'claude-1'` inlined at usage sites (not via named constant)
- [ ] No remaining imports of `DEFAULT_AGENT_ID` across the codebase

---

## 9. Implementation Phases

### Phase 1: Extract + Thread (TQ17)
**Files:** `server.ts`, `tools/index.ts`, `write-document.ts`, `edit-document.ts`, `save-version.ts`, `api-extension.ts`

1. Generate `connectionId` and capture `clientInfo`
2. Thread `agentIdentity` into tool registrations
3. Add `agentId`/`agentName` to HTTP POST bodies
4. Accept `agentId`/`agentName` in API handlers
5. Use dynamic identity in activity map entries
6. Read `AGENT_LABEL` from env

**Validates:** AC-1, AC-2, AC-3, AC-7

### Phase 2: Multi-Agent Sessions (TQ18)
**Files:** `agent-sessions.ts`, `api-extension.ts`

7. Refactor session map key to `(docName, agentId)`
8. Accept identity in `getSession()`
9. Set per-agent awareness (name, color, icon)
10. Add `colorFromSeed()` and `iconFromClientName()` helpers

**Validates:** AC-4

### Phase 3: Shadow Attribution
**Files:** `contributor-tracker.ts` (NEW), `persistence.ts`, `api-extension.ts`

11. Create `contributor-tracker.ts` with `pendingContributors` Map, `recordContributor()`, `drainContributors()`
12. Import `recordContributor` in `api-extension.ts`, call after each agent write
13. Import `drainContributors` in `persistence.ts`, drain in `commitToWipRef()` into commit message
14. Wire `recordContributor()` calls in all three write handlers

**Validates:** AC-5

### Phase 4: Read Path + Timeline UI + Cleanup
**Files:** `core/shadow-repo-layout.ts`, `shadow-log.ts`, `timeline-query.ts`, `TimelinePanel.tsx`, `agent-sessions.ts`, `api-extension.ts`, `server/index.ts`

15. Add `ShadowContributor` type + `parseContributors()` to `core/shadow-repo-layout.ts` (shared parser)
16. Extend `shadow-log.ts`: switch to `%x00` delimiter, add `%b`, parse contributors via shared parser
17. Extend `timeline-query.ts`: switch to `%x00` delimiter, add `%b`, parse contributors via shared parser, add `contributors` to `TimelineEntry`
18. Update `TimelinePanel.tsx`: replace heuristic agent detection with `contributors`-aware rendering
19. Remove `DEFAULT_AGENT_ID` constant and export, inline fallback value
20. Update agent simulator to use test identity

**Validates:** AC-6, AC-9, AC-10

---

## 10. Decision Log

| # | Decision | Status | Resolution | Evidence |
|---|----------|--------|------------|----------|
| D1 | Extract identity from MCP `clientInfo` + server-generated UUID | LOCKED | Proven by probe script. `McpServer.server.getClientVersion()` returns `{ name, version }` after handshake. | [evidence/mcp-sdk-identity.md](evidence/mcp-sdk-identity.md) |
| D2 | Thread identity via HTTP POST body (not headers, not URL params) | LOCKED | Consistent with existing API contract (JSON bodies). Backward compatible (optional fields). | [evidence/pipeline-trace.md](evidence/pipeline-trace.md) |
| D3 | Shadow repo commits stay `WriterIdentity { id: 'server' }` with `ok-contributors:` in message | LOCKED | Avoids false single-agent attribution on coalesced commits. Honest composite. | [evidence/l2-attribution-design.md](evidence/l2-attribution-design.md) |
| D4 | Server-local accumulator for L2 contributor tracking (not Y.Map, not transaction origin) | LOCKED | Accumulates all agents (no last-writer-wins). No CRDT pollution. Bridges write-time and commit-time. | [evidence/l2-attribution-design.md](evidence/l2-attribution-design.md) |
| D5 | Sessions keyed by `(docName, agentId)` for multi-agent isolation | LOCKED | Required for distinct presence, activity attribution, and future per-agent undo. | [evidence/pipeline-trace.md](evidence/pipeline-trace.md) |
| D6 | `AGENT_LABEL` env var for user-provided display names | DIRECTED | Implementer picks env var name convention. `AGENT_LABEL` is the recommendation. | — |
| D7 | Per-agent undo: OUT OF SCOPE | LOCKED | Separate architectural concern (V0-14). Depends on per-agent sessions from this spec. | STORY.md §14 |
| D8 | Timeline UI rendering: IN SCOPE | LOCKED | PR #39 merged. Timeline already has heuristic agent detection (`getAuthorColor`). Replace with structured `contributors` data. Minimal UI change. | PR #39 merged 2026-04-14 |
| D9 | Contributor accumulator in dedicated `contributor-tracker.ts` module | LOCKED | Clean separation — accumulator is a write-time concern, persistence drains it. Both api-extension and persistence import from it. | OQ-1 resolution |
| D10 | Custom `ok-contributors:` JSON lines (not git trailers) with `%x00` null-byte delimiter | LOCKED | Git trailers are flat k/v, no JS API in simple-git. Custom JSON lines handle spaces in names/paths, extensible without format version bump. `%x00` avoids `\|` collision. Superseded by D14 for format detail. | OQ-2 resolution |
| D11 | No session eviction for stdio | LOCKED | Embedded mode (`start`): same process, process exit cleans up. Connected mode (`mcp` → separate `start`): sessions survive MCP death but impact is low (N×M). Heartbeat/TTL deferred to Future Work. | OQ-3 resolution |
| D12 | Raw UUID in HTTP body; server prefixes `agent-` | LOCKED | MCP layer sends the connectionId as-is. Server owns the `agent-<uuid>` naming convention for WriterIdentity.id and activity map keys. Keeps MCP tools simple, server authoritative over ID namespace. | OQ-4 resolution |
| D13 | `timeline-query.ts` in scope — shared contributor parser in core | LOCKED | Primary consumer of contributor data is the server-side `/api/history` endpoint, not just the CLI reader. Per precedent #4, parsing logic shared in core. | Audit F1/F5/F8 |
| D14 | `ok-contributors:` uses JSON lines format (not space-delimited) | LOCKED | JSON handles spaces in display names and doc paths, extensible without format version bump, trivially parseable. Replaces the fragile space-delimited format from D10. | Audit F6/M1 |
| D15 | Probe scripts not committed — deleted | LOCKED | Evidence references updated to describe the verification methodology rather than referencing specific scripts. | Audit M2 |
| D16 | Contributor drain-after-success ordering | LOCKED | `formatContributors()` reads without clearing. `clearContributors()` called only after `commitWip()` succeeds. Prevents data loss on failed commits. | Audit F2 |
| D17 | Ref pattern for identity threading | LOCKED | `{ current: AgentIdentity }` matches codebase's `ShadowRef` idiom. Avoids `let` mutation across closure boundaries. | Audit F4 |
| D18 | Color seed prefers stable identity | LOCKED | `colorSeed: label ?? clientInfo?.name ?? connectionId`. Consistent colors across sessions when agent has a stable identity. | Audit F9 |

---

## 11. Open Questions

| # | Question | Type | Priority | Status |
|---|----------|------|----------|--------|
| OQ-1 | Should `recordContributor` live in `persistence.ts` or a new `contributor-tracker.ts`? | Technical | P0 | RESOLVED → D9 |
| OQ-2 | Should the `ok-contributors:` format use git trailers convention instead of custom format? | Technical | P0 | RESOLVED → D10 |
| OQ-3 | Session eviction: when should per-agent sessions be cleaned up for disconnected agents? | Technical | P0 | RESOLVED → D11 |
| OQ-4 | Should `agentId` in the HTTP body be the raw `connectionId` UUID or the prefixed `agent-<connectionId>`? | Technical | P0 | RESOLVED → D12 |

All P0 open questions resolved. No remaining blockers.

---

## 12. Assumptions

| # | Assumption | Confidence | Verification Plan | Expiry |
|---|------------|------------|-------------------|--------|
| A-1 | All major harnesses send `clientInfo` during MCP initialize | HIGH | Verified for Claude Code (probe). INFERRED for Cursor, Windsurf, Codex. Verify by pointing probe at each. | When any harness is tested |
| A-2 | Stdio is the only transport for local MCP connections | HIGH | MCP spec + harness docs confirm. HTTP is for remote servers only. | If a harness switches to HTTP for local |
| A-3 | `oninitialized` fires before any tool calls | HIGH | MCP spec requires `initialize` → `initialized` before any requests. SDK enforces this. | If SDK changes lifecycle |

---

## 13. Risks / Unknowns

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R-1 | `oninitialized` timing: if a tool call arrives before `oninitialized`, `agentIdentity` has no `clientInfo` | Low | Pre-populate `agentIdentity` with UUID-only identity at startup. `clientInfo` enriches it when handshake completes. Tool calls will never arrive before initialize per MCP spec. |
| R-2 | Per-agent sessions increase DirectConnection count (N agents × M docs) | Low | N is small in practice (1-3 agents). Sessions evict on disconnect. |
| R-3 | `ok-contributors:` parsing breaks on malformed commit messages | Low | Defensive parsing: if `ok-contributors:` block is missing or malformed, return empty `contributors[]`. Backward compat with pre-attribution commits. |
| R-4 | Crash between agent write and L2 commit loses contributor metadata | Low | Same window where file content needs CRDT recovery. Attribution degrades gracefully — content survives, attribution shows as `server`. Not a new failure mode. |

---

## 14. Future Work

### Explored

- **Per-agent UndoManager** (V0-14): Three-UndoManager architecture (WYSIWYG user + Source user + N × Agent server-side). Each agent's UndoManager scoped to their `connectionId` via typed `LocalTransactionOrigin`. Depends on per-agent sessions from this spec. See STORY.md §14.
- **HTTP/SSE transport identity**: `Mcp-Session-Id` header available. Codex session recycling and Cursor stale sessions are known issues. Need transport-aware `connectionId` strategy.
- **Pass boundary grouping** (STORY.md D9): Product-native user-action-bounded grouping. Contiguous `agent-write` WIP commits between user edits, grouped by `AgentIdentity.connectionId`. Optional `session_id?` enrichment for clients with turn semantics.

### Identified

- **Agent presence icons**: Rendering harness-specific icons (Claude, Cursor, Copilot logos) in the presence bar from `iconFromClientName()`.

### Noted

- **INFERRED `clientInfo.name` values**: Cursor, Windsurf, Cline, Copilot, Codex values need live verification via the probe script.
- **Agent identity in branch/park operations**: `parkBranch()` uses `human-<sessionId>` — may need `agent-<connectionId>` path for agent-initiated parks.

---

## 15. Scope

### In Scope

- MCP identity extraction (`clientInfo` + `connectionId`)
- HTTP API identity threading (`agentId`/`agentName` in POST bodies)
- Activity map dynamic attribution
- Multi-agent session management (`(docName, agentId)` keying)
- Per-agent awareness state (name, color, icon)
- Contributor accumulator and commit message metadata
- Shadow log reader extension (`ShadowCommit.contributors`)
- Agent label configuration (`AGENT_LABEL` env var)
- `DEFAULT_AGENT_ID` removal
- Timeline panel contributor rendering (`TimelinePanel.tsx`)

### Out of Scope

- Per-agent UndoManager (V0-14)
- HTTP/SSE transport identity
- Pass boundary grouping (STORY.md D9)
- Agent presence icon assets
- Cryptographic identity verification

---

## 16. Agent Constraints

### SCOPE
- `packages/cli/src/mcp/server.ts`
- `packages/cli/src/mcp/tools/` (write-document, edit-document, save-version, index, shared)
- `packages/server/src/agent-sessions.ts`
- `packages/server/src/api-extension.ts`
- `packages/server/src/persistence.ts`
- `packages/server/src/contributor-tracker.ts` (NEW)
- `packages/server/src/index.ts` (exports)
- `packages/cli/src/content/shadow-log.ts`
- `packages/core/src/types/awareness.ts` (if type changes needed)
- `packages/core/src/shadow-repo-layout.ts` (`ShadowContributor` type + `parseContributors()`)
- `packages/server/src/timeline-query.ts` (`%b` parsing + contributors field)
- `packages/core/src/types/timeline.ts` (`TimelineEntry` needs `contributors` field)
- `packages/app/src/components/TimelinePanel.tsx` (contributor rendering)

### EXCLUDE
- `packages/server/src/shadow-repo.ts` (no changes needed — already parameterized)
- `packages/app/` (all other app files — only `TimelinePanel.tsx` is in scope)
- `packages/server/src/reconciliation.ts`
- `packages/server/src/head-watcher.ts`
- Observer layer (`observers.ts`)

### STOP_IF
- A change to `AGENT_WRITE_ORIGIN` shape is needed (load-bearing for observer origin guards)
- `WriterIdentity` type needs new fields beyond `id`/`name`/`email`
- The `%x00` delimiter doesn't work with `simple-git`'s output handling (fallback: two-pass git log)

### ASK_FIRST
- Adding new fields to `ActivityEntry` type in core (cross-package type change)
- Changing the `ok-contributors:` format after first implementation (becomes a backward compat surface)
- Adding new exports to `@inkeep/open-knowledge-server` public API

---

## References

### Evidence Files
- [evidence/pipeline-trace.md](evidence/pipeline-trace.md) — complete file-by-line identity trace
- [evidence/mcp-sdk-identity.md](evidence/mcp-sdk-identity.md) — SDK API surface + probe results
- [evidence/l2-attribution-design.md](evidence/l2-attribution-design.md) — debounce problem + accumulator design

### Prior Research
- [reports/mcp-agent-attribution-implementation/REPORT.md](../../reports/mcp-agent-attribution-implementation/REPORT.md) — 5-dimension investigation
- [stories/collaboration-capabilities-audit/STORY.md §14](../../stories/collaboration-capabilities-audit/STORY.md) — MCP identity research + AgentIdentity struct + D12

### External Sources
- [MCP Specification — Lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
- [MCP Specification — Transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
