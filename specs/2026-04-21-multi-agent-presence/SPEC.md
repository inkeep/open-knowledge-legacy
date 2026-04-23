# Multi-Agent Presence — Spec

**Status:** Scope Frozen
**Owner:** Andrew Mikofalvy
**Last updated:** 2026-04-21
**Baseline commit:** 05c7e371
**Links:**

- Prior approved spec (source of `agentFocus` pattern): [[specs/2026-04-08-presence-awareness-ux/SPEC]]
- Originating bug: [[projects/v0-launch/bug-bash-triage]] §1 item #1 (Justin — "Collab icon and Claude icon overlapping in top-right"); Cluster A (Tim/Andrew presence overlap)
- Trace brief (evidence): [[specs/2026-04-21-multi-agent-presence/evidence/root-cause-trace]]
- Audit trail: [[specs/2026-04-21-multi-agent-presence/meta/audit-findings]], [[specs/2026-04-21-multi-agent-presence/meta/design-challenge]]
- Relevant [[PRECEDENTS]]: #1 (typed transaction origins), #3 (structured event schemas), #8 (long-lived agent identity)

---

## 1) Problem statement

**Situation.** Open Knowledge supports N concurrent AI agents editing the same document via MCP DirectConnections (Claude, Cursor, Windsurf, Codex, Cline, Copilot). Each MCP stdio process gets a unique `connectionId` (UUID via `randomUUID()` in `packages/cli/src/mcp/server.ts:290`) which flows through every tool call as `agentId`. Server-side `AgentSessionManager` correctly keys sessions by `(docName, agentId)` — multi-agent isolation is present at the session layer. Per-agent color/icon assignment is implemented. The `__system__` awareness broadcaster already demonstrates the correct multi-agent coexistence pattern via a map-valued `agentFocus` field. The repo also already ships a per-MCP-process heartbeat WS: `packages/cli/src/mcp/keepalive.ts` holds a persistent WS to `/collab/keepalive?pid=${pid}` for the stdio lifetime, intercepted server-side in `packages/server/src/boot.ts`.

**Complication.** Per-doc agent presence was implemented using the wrong pattern: `dc.document.awareness.setLocalState({user:...})` on each content doc's Awareness in `AgentSessionManager.getSession` (`packages/server/src/agent-sessions.ts:202-211`). Each Hocuspocus `Document` has exactly one `Awareness` instance with one server-side clientID (`node_modules/@hocuspocus/server/src/Document.ts:49-50`); all DirectConnections to that doc share it. Every new agent's `setLocalState` overwrites the prior agent's state. The browser sees one slot: **the last agent to write.** Observable consequences:

- Justin reported: "Collab icon and Claude icon overlapping in top-right." Two users editing while one Claude is writing — the bar shows three badges but one agent's identity gets stomped by the next write.
- 2× Claude → one Claude badge (last wins)
- Claude + Cursor → only the last writer shows
- The server-authored `mode` field (editing / idle) is also stomped across agents, creating transient flicker
- The colors/icons are all correctly assigned server-side but invisible to the client

Additionally, the presence bar's `-space-x-1.5` overlapping-avatar layout was designed for stacked human avatars. Once multi-agent renders correctly, the overlap becomes visibly ambiguous at N≥2 agents + humans — Justin's scenario. No automated test catches this: the unit test for `AgentSessionManager` mocks awareness per-DC (`packages/server/src/agent-sessions.test.ts:16-22`), inverting the bug's premise.

**Resolution.** Delete the per-doc agent-awareness surface entirely. Extend the existing `__system__` `AgentFocusBroadcaster` into a unified `AgentPresenceBroadcaster` that owns a map-valued `agentPresence: Record<agentId, AgentPresenceEntry>` on the single shared `__system__` awareness state. Entries carry `{displayName, icon, color, currentDoc, mode, ts}`. Cleanup is **deterministic via the existing keepalive WS**: extend the keepalive URL to carry `agentId`, wire server-side `ws.on('close') → clearPresence(agentId)`. TTL (`AGENT_PRESENCE_STALE_MS = 5_000`, matching `AGENT_FOCUS_STALE_MS`) is a belt-and-suspenders defense against clock skew + ungraceful disconnects. `PresenceBar` reads presence from the browser's `__system__` provider (already opened at app mount by `SystemDocSubscriber.tsx`) and renders in a **sectioned layout** (D12, Design B): current-doc agents left of a vertical divider, cross-doc agents (dimmed, with hover tooltip showing `currentDoc`) right of it. Each section uses the same overflow-chip rule (D7) independently. The resulting data substrate is also the foundation for Cluster A (Activity sidebar), specced separately.

## 2) Goals

- **G1:** N concurrent agents writing to the same document each render as a distinct presence badge with correct name, icon, color, and mode.
- **G2:** N concurrent agents writing to *different* documents are correctly attributed; presence bar shows them all, with current-doc priority.
- **G3:** Eliminate the visual "overlapping icon" ambiguity at the top-right when multi-participant state is dense (triage #1).
- **G4:** Create the single canonical data substrate (`__system__` agentPresence map) for current and future agent-visibility UI — including Cluster A's Activity sidebar.
- **G5:** Deterministic presence cleanup — when an MCP process exits, its badge disappears within the WS close window (<1s typical).
- **G6:** Regression coverage: an integration test asserts "2+ agents on same doc ⇒ 2+ presence entries" before the fix ships.

## 3) Non-goals

- **\[NEVER] NG1:** Per-doc agent awareness publishing. The per-doc content-awareness slot for agents is structurally unworkable (one clientID per Document). Do not add a fallback there.
- **\[NEVER] NG2:** Agent *cursor* positions. Agents apply batch diffs, not keystrokes; cursor positions are meaningless for them (locked in [[specs/2026-04-08-presence-awareness-ux/SPEC]] D7).
- **\[NOT NOW] NG3:** Activity sidebar UI. The substrate ships here; the sidebar is [[projects/v0-launch/bug-bash-triage]] Cluster A. Revisit when Cluster A spec is written. (Note: cross-doc bar visibility ships here via D11/D12; the *sidebar* remains deferred.)
- **\[NOT NOW] NG4:** Click-to-nav inside the presence bar badges. Agent-focus already drives auto-nav (with pin/typing guards). Cross-doc agent tooltip tap/click-to-nav is in scope via D11's tooltip wiki-link but the plain badge click stays inert.
- **\[NOT NOW] NG5:** Human presence on `__system__`. Humans stay per-doc because `@tiptap/extension-collaboration-cursor` and y-codemirror.next both require per-doc awareness for cursor/selection positions.
- **\[NOT UNLESS] NG6:** An additional polling-based liveness probe on top of the WS close signal. Only if the keepalive WS proves unreliable in the field (e.g., some proxy or bridge drops the close event silently).
- **\[NOT NOW] NG7:** Per-agent undo button placement changes. Out of scope; tracked separately under V0-14.
- **\[NOT NOW] NG8:** Per-brand color variation (FR-14 / formerly OQ3). Leave 2× Claude rendering with identical color; revisit if bug-bash demos surface confusion.

## 4) Personas

- **P1 — Human editor, single-agent context.** Andrew writing with one Claude Code instance. Expects to see himself + Claude, correctly identified.
- **P2 — Human editor, multi-agent context (the failing case).** Andrew writing while Claude Code + Cursor MCP are both active; or two Claude Code terminals. Expects a badge per agent.
- **P3 — Demo audience (Tim, Nick, Miles, bug-bash).** The core demo story ("agents co-edit with you") requires multi-agent visibility.
- **P4 — Future Cluster A consumer.** The Activity sidebar (not built here) reads `agentPresence` as its data source.

## 5) User journeys

### P2 journey: Claude + Cursor writing to same doc

1. Andrew opens `foo.md`. Bar: `[Andrew]`.
2. Claude Code (process A, `connectionId=uuid-A`) starts. Its MCP process opens the keepalive WS at `/collab/keepalive?pid=…&agentId=uuid-A`. First `write_document` call adds `agentPresence[uuid-A] = {displayName:'Claude', icon:'claude', currentDoc:'foo.md', mode:'editing', ts:…}`. Bar: `[Andrew] [Claude]`.
3. Cursor (process B, `connectionId=uuid-B`) starts similarly. On its first `edit_document`, broadcaster adds `agentPresence[uuid-B]`. Bar: `[Andrew] [Claude] [Cursor]`.
4. Writes complete; both agents' `mode` flips to `idle`. Bar shows both agents flat (no ring-pulse).
5. Andrew closes Cursor. MCP stdio exits → keepalive WS close → server `ws.on('close')` → `presenceBroadcaster.clearPresence(uuid-B)`. Bar: `[Andrew] [Claude]` (within \~1s of Cursor exit).
6. No writes from Claude for 5s → TTL filter drops `agentPresence[uuid-A]` from the client view. Bar: `[Andrew]`. Next Claude write re-adds it instantly.

### P2 journey: Claude on `foo.md`, Cursor on `bar.md`

1. Andrew is on `foo.md`. Claude writes to `foo.md`. Bar: `[Andrew] [Claude]`.
2. Cursor writes to `bar.md`. Server broadcasts `agentPresence[uuid-B] = {…, currentDoc:'bar.md'}`. Andrew's bar now renders in **sectioned layout (Design B)**: `[Andrew] [Claude:editing] │ [Cursor:dim]` — vertical divider between current-doc and cross-doc. Hovering Cursor's badge shows `"editing [[bar.md]]"`.
3. Andrew navigates to `bar.md`. Bar recomputes: `[Andrew] [Cursor:editing] │ [Claude:dim]` (hover tooltip: `"editing [[foo.md]]"`).
4. Clicking the tooltip's wiki-link navigates to the agent's doc (respects pin / typing guards — same path as existing agent-focus auto-nav).

### Failure / recovery

| Scenario                           | Current behavior (bug)             | Post-fix behavior                                                                                  |
| ---------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| 2 Claudes same doc                 | Last writer badge only             | Both badges                                                                                        |
| Claude + Cursor same doc           | Last writer only                   | Both badges                                                                                        |
| Claude crashes mid-session         | Old stomp persists until overwrite | WS close → entry cleared within \~1s                                                               |
| Claude respawns after crash        | Ambiguous visual state             | New connectionId = new entry; old one already cleared by WS close. No dedup needed.                |
| Server restart                     | Stomp state lost                   | `agentPresence` rebuilt as agents reconnect their keepalive WS                                     |
| Keepalive WS drops silently (rare) | N/A                                | 5s TTL (`AGENT_PRESENCE_STALE_MS`) fallback filter drops the ghost                                 |
| Clock skew (server↔client)         | N/A                                | 5s TTL uses client-local `now - entry.ts`; skew up to \~4s tolerable. Documented caveat in §13 R2. |

## 6) Requirements

### Functional

| Priority | ID    | Requirement                                                                                                                                                                                                                                                                                                                                                                   | Acceptance criteria                                                                                                                                                                                                                                                                                                                                                                            |
| -------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Must     | FR-1  | Introduce `AgentPresenceEntry` type in `packages/core/src/types/awareness.ts`. Shape: `{displayName:string, icon:string, color:string, currentDoc:string\|null, mode:'idle'\|'editing', ts:number}`. Re-export from `packages/core/src/index.ts`.                                                                                                                             | Type exported; referenced by server broadcaster and client helper.                                                                                                                                                                                                                                                                                                                             |
| Must     | FR-2  | `AgentPresenceBroadcaster` on `__system__` awareness — map-valued field `agentPresence`, keyed by `agentId`. Consolidates `AgentFocusBroadcaster`. API: `setPresence(agentId, entry)`, `clearPresence(agentId)`, `touchMode(agentId, mode)`, `getPresenceMap()`.                                                                                                              | `setPresence` upserts without clobbering; `clearPresence` removes only that key; existing `agent-focus-wiring.test.ts` passes with path/property updates only (behavior parity).                                                                                                                                                                                                               |
| Must     | FR-3  | Remove per-doc agent awareness publishing. `AgentSessionManager.getSession` and close paths stop calling `dc.document.awareness.setLocalState(...)` / `setLocalStateField('mode', ...)` on content docs.                                                                                                                                                                      | `git grep "dc.document.awareness.setLocalState"` and `git grep "setLocalStateField('mode'"` in `packages/server/src/agent-sessions.ts` + `packages/server/src/api-extension.ts` return zero hits after the change. Teardown-side `setLocalState(null)` calls at agent-sessions.ts:234/247/266/287 are removed along with the opening call — there's no per-doc agent state to clear post-FR-3. |
| Must     | FR-4  | **Deterministic cleanup via keepalive WS.** Extend the MCP-side keepalive URL to include `agentId` query param: `/collab/keepalive?pid=${pid}&agentId=${connectionId}`. Server-side `boot.ts` WS upgrade handler reads `agentId` from URL, wires `ws.on('close', () => presenceBroadcaster.clearPresence(agentId))`.                                                          | Integration test: spin MCP stdio process → write → kill MCP → `getPresenceMap()` on server is empty within 1s.                                                                                                                                                                                                                                                                                 |
| Must     | FR-5  | TTL staleness filter as backup. `AGENT_PRESENCE_STALE_MS = 5_000` (matches `AGENT_FOCUS_STALE_MS`). Client-side `pickAgentsForDoc` filters entries where `now - entry.ts >= AGENT_PRESENCE_STALE_MS`.                                                                                                                                                                         | Same pattern as `AGENT_FOCUS_STALE_MS`; if keepalive close signal fails (network partition, bridge lost), entry ages out after 5s.                                                                                                                                                                                                                                                             |
| Must     | FR-6  | Per-agent `mode` rendered on the badge. `mode:'editing'` → ring-pulse visual treatment; `mode:'idle'` → flat. Mode transitions fired by existing `setLocalStateField('mode', 'editing' / 'idle')` pattern, relocated to `presenceBroadcaster.touchMode(agentId, mode)`.                                                                                                       | Integration test: write via `handleAgentWriteMd` → within 100ms entry shows `editing`; after write completes → flips to `idle`.                                                                                                                                                                                                                                                                |
| Must     | FR-7  | PresenceBar rendering, sectioned bar (D12, Design B). Current-doc agents to the left of a vertical divider; cross-doc agents to the right, dimmed. Divider absent when no cross-doc agents. Each section uses M=4 primary avatars + `+K` overflow chip (D7) independently. Hover tooltip shows `displayName` + (if cross-doc) `"editing [[doc.md]]"` with tappable wiki-link. | Visual manual verification: bug-bash Claude+Cursor scenario renders correctly at N=(2,0), (2,1), (5,3). Playwright snapshot locks the layout.                                                                                                                                                                                                                                                  |
| Must     | FR-8  | Regression test — integration layer. Using Tier 1 harness, spin 2 server-side DirectConnections writing as distinct `agentId`s to the same doc. Assert browser-visible `agentPresence` map has **both** entries; bar renders 2 agent badges.                                                                                                                                  | `packages/app/tests/integration/multi-agent-presence.test.ts` ships with the implementation PR. Test fails without FR-2/FR-3, passes with.                                                                                                                                                                                                                                                     |
| Must     | FR-9  | Playwright E2E — Claude icon + Cursor icon both render in the bar when two server-side DCs write. Cross-doc tooltip wiki-link is clickable and navigates.                                                                                                                                                                                                                     | `packages/app/tests/stress/multi-agent-presence.e2e.ts` covering 2-agent happy path + cross-doc nav.                                                                                                                                                                                                                                                                                           |
| Must     | FR-10 | Remove `AwarenessState.user.type === 'agent'` branch. `AwarenessUser` type narrows to humans. `use-presence.ts` stops reading `state.user` when `user.type === 'agent'`. Dev-mode warning logs once per clientID if such state is observed (helps catch stale bundled clients during rollout); warning gated on `NODE_ENV !== 'test'` to avoid test-environment noise.        | Grep narrowed; no prod code path publishes `user.type === 'agent'`.                                                                                                                                                                                                                                                                                                                            |
| Must     | FR-11 | Visual overlap fix (triage #1). `-space-x-1.5` replaced with non-overlapping `gap-1.5` spacing within each section.                                                                                                                                                                                                                                                           | Justin's "overlapping" observation no longer reproduces with 2 humans + 2 agents.                                                                                                                                                                                                                                                                                                              |
| Should   | FR-12 | Cold-start replay: when a browser tab opens mid-session, the `__system__` provider's initial awareness sync delivers the current `agentPresence` map. No client-side polling needed. If the map is empty at sync time, fallback is `GET /api/metrics/agent-presence` (see §Observability).                                                                                    | Manual test: open fresh tab while 2 agents are mid-edit → bar populates within WS sync window.                                                                                                                                                                                                                                                                                                 |
| Should   | FR-13 | Consolidate `AgentFocusBroadcaster` → `AgentPresenceBroadcaster`. Derive `agentFocus` primary from `agentPresence` via migrated `pickPrimary`. Keep `setFocus`/`clearFocus` as thin shims during migration, OR delete cleanly in one PR (implementer choice per D6).                                                                                                          | One broadcaster class. `agent-focus-wiring.test.ts` asserts behavior parity post-refactor.                                                                                                                                                                                                                                                                                                     |
| Could    | FR-14 | Tooltip shows `currentDoc` as a wiki-link when the agent is on a *different* doc. Click navigates (respects pin/typing guards).                                                                                                                                                                                                                                               | Landing surface: tooltip is shadcn `Tooltip` + `Link`; uses existing `hashFromDocName` helper.                                                                                                                                                                                                                                                                                                 |

### Non-functional

- **Correctness:** No stomping. Property — for any ordering of `setPresence(A, …)` and `setPresence(B, …)`, both entries survive.
- **Performance:** Presence bar update latency <100ms. `__system__` awareness update fan-out: one broadcast per write × M connected clients. At N=5 tabs × 3 agents × 2 mode-flips/write, \~30 updates/minute per active agent cluster. Derived events only (no repetitive per-keystroke traffic); acceptable. If later field data shows fan-out cost, collapse `mode` flips into `ts`-derived view (editing iff `now - ts < 3s`) to halve traffic.
- **Consistency:** Single source of truth on `__system__`.
- **Observability:** `[agent-presence]` structured pino log `{agentId, action: 'set'|'clear'|'touchMode', currentDoc, ts}`. Diagnostic endpoint `GET /api/metrics/agent-presence` returning the server's current `agentPresence` map.

## 7) Success metrics

- **M1:** bug-bash repro scenario passes — 2× Claude + Cursor all three show, correctly labeled.
- **M2:** FR-8 integration test + FR-9 E2E pass.
- **M3:** MCP process exit → bar clears agent within 1s (FR-4 verification).
- **M4:** Zero production reports of "my agent doesn't show up" in the week following fix.

## 8) Current state

Full trace in [[specs/2026-04-21-multi-agent-presence/evidence/root-cause-trace]]. Key points:

- Server: `AgentSessionManager` keys by `(docName, agentId)`. N DCs per doc. Each DC's `dc.document.awareness` is the shared `document.awareness` — **one clientID, stomping.**
- `__system__` `agentFocus` already correctly uses map-valued awareness (documented in `agent-focus.ts:8-10`).
- Client: `SystemDocSubscriber.tsx` opens `__system__` provider at app mount; `providerRef.current` holds it.
- Keepalive: `packages/cli/src/mcp/keepalive.ts` (client) ↔ `packages/server/src/boot.ts:210-234` (server) — persistent WS per MCP process, already running, not currently carrying `agentId`.
- `PresenceBar.tsx:70-88` has an agent-user render branch (`user.type === 'agent'`); needs adaptation after FR-10 (not pure removal — see §9.6b Participant shape).

## 9) Proposed solution (vertical slice)

### Architecture (after fix)

```
MCP process A (Claude)              MCP process B (Cursor)
  connectionId = uuid-A               connectionId = uuid-B
    │                                   │
    ├── keepalive WS ────►              ├── keepalive WS ────►
    │   /collab/keepalive?              │   /collab/keepalive?
    │   pid=…&agentId=uuid-A            │   pid=…&agentId=uuid-B
    │                                   │
    │ write_document                    │ edit_document
    ▼                                   ▼
POST /api/agent-write-md          POST /api/agent-write-md
    │                                   │
    └──┬────────────────────────────────┘
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ API handlers                                                     │
│   dc = sessionManager.getSession(docName, agentId, identity)     │
│   presenceBroadcaster.setPresence(agentId, {                     │
│     ..., currentDoc: docName, mode: 'editing', ts: now           │
│   })                                                             │
│   dc.document.transact(…, AGENT_WRITE_ORIGIN)                    │
│   presenceBroadcaster.touchMode(agentId, 'idle')                 │
│   (NO content-doc awareness writes for agents)                   │
└──────────────────┬───────────────────────────────────────────────┘
                   │ awareness update on __system__
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│ Browser: SystemDocSubscriber's HocuspocusProvider(__system__)    │
│ awareness.getStates() →                                          │
│   clientID S: { agentPresence: { uuid-A: {...}, uuid-B: {...} }} │
└──────────────────┬───────────────────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│ usePresence(activeProvider, systemProvider, activeDocName)       │
│   humans: activeProvider.awareness entries (user.type==='human') │
│   agents: pickAgentsForDoc(systemAwareness, now)                 │
│     - current = filter(currentDoc === activeDocName)             │
│     - crossDoc = filter(currentDoc !== activeDocName)            │
│   returns {current, crossDoc} for PresenceBar (Design B)         │
└──────────────────┬───────────────────────────────────────────────┘
                   ▼
MCP exit ► keepalive WS close event ► boot.ts ws.on('close') ─►
           presenceBroadcaster.clearPresence(agentId) ─► awareness
           update ─► browser bar removes badge within ~1s
```

### Component design

#### 9.1 `AgentPresenceEntry` (core)

```typescript
// packages/core/src/types/awareness.ts
export interface AgentPresenceEntry {
  displayName: string;
  icon: string;        // 'claude' | 'cursor' | 'openai' | ...
  color: string;       // hex
  currentDoc: string | null;
  mode: 'idle' | 'editing';
  ts: number;          // Date.now() at last mutation
}
```

Re-export from `packages/core/src/index.ts` (alongside existing `AgentFocusEntry`). After migration, `AgentFocusEntry` can be deleted or kept as a type alias for `Pick<AgentPresenceEntry, 'agentName'|'currentDoc'|'writeKind'|'ts'>` during D6 consolidation.

#### 9.2 `AgentPresenceBroadcaster` (server)

Extends `AgentFocusBroadcaster`. Reuses `__system__` DC, `mutateAgentFocus`-style merge pattern, resolver guard.

```typescript
setPresence(agentId: string, entry: AgentPresenceEntry): void
clearPresence(agentId: string): void
touchMode(agentId: string, mode: 'editing' | 'idle'): void  // updates ts
getPresenceMap(): Record<string, AgentPresenceEntry>
```

The existing `setFocus` / `clearFocus` either delegate or are deleted once `SystemDocSubscriber` reads `agentPresence` (see D6).

#### 9.3 Server write path refactor

```typescript
// handleAgentWriteMd / handleAgentWrite / handleAgentPatch:
const identity = extractAgentIdentity(body);
const dc = await sessionManager.getSession(docName, identity.agentId, identity);
const icon = iconFromClientName(identity.clientName);
const color = AGENT_ICON_COLORS[icon] ?? colorFromSeed(identity.colorSeed);

presenceBroadcaster.setPresence(identity.agentId, {
  displayName: identity.agentName, icon, color,
  currentDoc: docName, mode: 'editing', ts: Date.now(),
});

dc.document.transact(() => {
  applyAgentMarkdownWrite(dc.document, markdown, position);
  // activity map (unchanged)
}, AGENT_WRITE_ORIGIN);

presenceBroadcaster.touchMode(identity.agentId, 'idle');
```

Removed: `dc.document.awareness.setLocalStateField('mode', ...)` pairs AND `AgentSessionManager.getSession`'s `setLocalState({user:...})` opening call AND the teardown-side `setLocalState(null)` calls in `closeSession`/`closeAllForAgent`/`closeAllForDoc`/`closeAll`. There is no per-doc agent awareness state to clear post-refactor.

#### 9.4 Session cleanup (deterministic + fallback)

**Primary: keepalive WS close.** `packages/cli/src/mcp/keepalive.ts` is extended to include `agentId=${connectionId}` in the URL query. Server-side `boot.ts` WS upgrade handler — already present at lines 210-234 — reads `agentId` from `req.url`, retains a handle via `ws.on('close', () => presenceBroadcaster?.clearPresence(agentId))`. The broadcaster handle is passed into `bootServer` context alongside the existing `hocuspocus` instance.

**Fallback: TTL.** Client-side `pickAgentsForDoc` filters entries where `now - entry.ts >= AGENT_PRESENCE_STALE_MS` (5s). Covers:

- Ungraceful process kill where WS close event doesn't propagate
- Network partition / proxy eats the close frame
- Clock skew protection (see §13 R2)

**Synchronous cleanup for orderly shutdown:** `AgentSessionManager.closeSession` / `closeAllForAgent` / `closeAllForDoc` call `presenceBroadcaster.clearPresence(agentId)` when invoked. Note: `closeAllForAgent` has zero non-test call sites today — the keepalive close handler is what invokes cleanup in practice. Spec acknowledges this in §13 R3.

#### 9.5 Client helpers

New module: `packages/app/src/lib/agent-presence.ts`

```typescript
export const AGENT_PRESENCE_STALE_MS = 5_000;

export interface AgentPresenceAwareness {
  getStates(): ReadonlyMap<number, { agentPresence?: Record<string, AgentPresenceEntry> }>;
}

/**
 * Defensive walk over all awareness peers. In production only the server-side
 * __system__ DirectConnection publishes agentPresence, but walking every peer
 * is defensive against test injections (see SystemDocSubscriber.tsx DEV hook)
 * and future producers. Same pattern as the existing pickPrimary.
 */
export function pickAgentsForDoc(
  awareness: AgentPresenceAwareness,
  activeDocName: string | null,
  now: number,
): { current: AgentPresenceEntry[]; crossDoc: AgentPresenceEntry[] };

export function pickPrimary(
  awareness: AgentPresenceAwareness,
  now: number,
): string | null;  // derived from agentPresence (D6)
```

Existing `packages/app/src/lib/agent-focus.ts::pickPrimary` is re-exported for backward compat until call sites migrate.

#### 9.6 `usePresence` refactor

```typescript
export function usePresence(
  activeProvider: HocuspocusProvider | null,
  systemProvider: HocuspocusProvider | null,
  activeDocName: string | null,
): { current: Participant[]; crossDoc: Participant[] } {
  // (a) humans via activeProvider.awareness (existing, filtered to user.type === 'human')
  // (b) agents via pickAgentsForDoc(systemProvider.awareness, activeDocName, now)
  //     with setInterval tick for TTL filter to fire without awareness events
}
```

`systemProvider` is exposed on `DocumentContext` — `SystemDocSubscriber` already holds it; the context gains a new field.

#### 9.6b `Participant` shape post-refactor

The existing `Participant` type is `{ clientId, user: AwarenessUser, mode }` (where `AwarenessUser` carries agent fields today). Post-FR-10, human and agent participants have distinct shapes:

```typescript
export type Participant = HumanParticipant | AgentParticipant;

interface HumanParticipant {
  kind: 'human';
  clientId: number;
  user: AwarenessUser;  // type narrowed to human
  mode: 'wysiwyg' | 'source' | 'idle' | 'editing';
}

interface AgentParticipant {
  kind: 'agent';
  agentId: string;
  presence: AgentPresenceEntry;
}
```

`PresenceBar.tsx:70-88` and `PresenceAvatar` adapt to the discriminated union — the agent render branch reads from `participant.presence` (name, color, icon, mode) rather than `participant.user`. This is the migration for the `user.type === 'agent'` branch cited in FR-10.

#### 9.7 PresenceBar rendering (Design B, sectioned bar)

```tsx
<div data-slot="presence-bar" className="flex items-center px-1 py-1.5">
  <div className="flex items-center gap-1.5">
    {currentDocParticipants.slice(0, M).map(p => <PresenceAvatar ... />)}
    {currentOverflow > 0 && <OverflowChip count={currentOverflow} items={currentDocParticipants.slice(M)} />}
  </div>

  {crossDocParticipants.length > 0 && (
    <>
      <div className="mx-2 h-4 w-px bg-border" aria-hidden />
      <div className="flex items-center gap-1.5 opacity-60 grayscale">
        {crossDocParticipants.slice(0, K).map(p => <PresenceAvatar ... crossDoc />)}
        {crossOverflow > 0 && <OverflowChip count={crossOverflow} items={crossDocParticipants.slice(K)} />}
      </div>
    </>
  )}
</div>
```

- `M` (current-doc primary count) and `K` (cross-doc primary count) are DELEGATED (D7); default `M=4`, `K=3`.
- Divider (`h-4 w-px bg-border`) is present iff `crossDocParticipants.length > 0`.
- Cross-doc avatars render at 60% opacity + grayscale; each has `Tooltip` showing `displayName` + `"editing [[other-doc.md]]"` with the wiki-link tappable.
- `mode === 'editing'` adds `ring-2 ring-primary/30 animate-pulse` to the avatar (current-doc only — cross-doc is dimmed regardless of mode).

### Affected files (11)

| Path                                                                          | Change                                                                                                            |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/types/awareness.ts`                                        | Add `AgentPresenceEntry`; deprecate per-doc agent user path                                                       |
| `packages/core/src/index.ts`                                                  | Re-export new type                                                                                                |
| `packages/server/src/agent-focus.ts` → rename `agent-presence.ts`             | Broadcaster extension; `setPresence`/`clearPresence`/`touchMode`/`getPresenceMap` API                             |
| `packages/server/src/agent-sessions.ts`                                       | Remove per-doc `setLocalState({user:...})` (open) AND `setLocalState(null)` (close). Session lifecycle unchanged. |
| `packages/server/src/api-extension.ts`                                        | Three `handleAgentWrite*` handlers: swap to broadcaster calls                                                     |
| `packages/server/src/standalone.ts` (or wherever broadcaster is instantiated) | Pass `presenceBroadcaster` into `bootServer` options so the keepalive WS handler can access it                    |
| `packages/server/src/boot.ts`                                                 | Read `agentId` from keepalive URL; wire `ws.on('close') → clearPresence(agentId)`                                 |
| `packages/cli/src/mcp/keepalive.ts`                                           | Append `&agentId=${identity.connectionId}` to URL                                                                 |
| `packages/app/src/lib/agent-focus.ts` → `agent-presence.ts`                   | New helper + `pickPrimary` derives from presence                                                                  |
| `packages/app/src/components/SystemDocSubscriber.tsx`                         | Minimal: expose provider via context (already holds it in `providerRef.current`)                                  |
| `packages/app/src/editor/DocumentContext.tsx`                                 | New field: `systemProvider`                                                                                       |
| `packages/app/src/presence/use-presence.ts`                                   | Accept `systemProvider`; fan-out current/crossDoc; TTL tick                                                       |
| `packages/app/src/presence/PresenceBar.tsx`                                   | Sectioned layout; discriminated-union render; fix `-space-x-1.5`                                                  |

**Tests:**

| Path                                                                 | Change                                                                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `packages/server/src/agent-sessions.test.ts`                         | Update mocks to NOT isolate awareness per DC (bug premise fix). Add multi-agent presence assertions. |
| `packages/app/tests/integration/agent-focus-wiring.test.ts`          | Path/property updates for broadcaster rename (parity behavior unchanged — see R1).                   |
| `packages/server/src/agent-focus.test.ts` → `agent-presence.test.ts` | Rename + adapt to new API; add `touchMode` and `ws.on('close')` integration.                         |
| `packages/app/tests/integration/multi-agent-presence.test.ts` (new)  | FR-8.                                                                                                |
| `packages/app/tests/stress/multi-agent-presence.e2e.ts` (new)        | FR-9.                                                                                                |

### Alternatives considered

- **Option 1 — per-doc map-valued.** \~50 LOC. Rejected: D11 now requires cross-doc bar visibility in v0, so we need `__system__` as a 2nd read source regardless. Option 2 is +10 LOC for single source of truth.
- **Option 3 — two broadcasters.** Rejected: two mutable fields on same `__system__` state inviting drift.
- **Option 4 — patch Hocuspocus for per-DC Awareness.** Rejected: requires fork + changes to `y-protocols/awareness` clientID model. Large surface.
- **Option A — Inline dimming, single row.** Rejected: at N≥3 cross-doc, bar density drops legibility.
- **Option C — Popover chip for cross-doc.** Rejected: chip visually collides with D7's `+K` overflow chip when composed; users can't distinguish the two chips at-a-glance.

## 10) Decision log

| ID  | Decision                                                                                                                                                                                                                                                                        | Type | Resolution    | 1-way? | Rationale                                                                                                                                                                                                                                                                            | Evidence                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Unify all agent presence on `__system__` awareness via a map-valued `agentPresence` field keyed by `agentId`.                                                                                                                                                                   | T    | **LOCKED**    | No     | Architectural investment: single source of truth; consolidates AgentFocusBroadcaster; D11 requires cross-doc visibility in v0 so `__system__` is needed anyway. Shipping unification as one cohesive pass (+10 LOC over narrow fix) dominates shipping Option 1 and migrating later. | Challenger #4 assessment; `packages/server/src/agent-focus.ts:8-10`; `node_modules/@hocuspocus/server/src/Document.ts:49-50`        |
| D2  | Delete per-doc agent-awareness publishing path in one PR.                                                                                                                                                                                                                       | T    | **LOCKED**    | Yes    | The current pattern IS the bug. Single-version bundle means no client/server skew risk.                                                                                                                                                                                              | SCR §Complication                                                                                                                   |
| D3  | Remove `AwarenessUser.type === 'agent'` branch; narrow type to humans.                                                                                                                                                                                                          | T    | **LOCKED**    | No     | Dead code post-D2. Dev-mode warning (gated on `NODE_ENV !== 'test'`) catches stale bundled clients during rollout.                                                                                                                                                                   | Follows D2; audit M5 on Participant shape                                                                                           |
| D4  | **Deterministic cleanup via keepalive WS close.** `AGENT_PRESENCE_STALE_MS = 5_000` as backup TTL. No heartbeat beyond the existing keepalive.                                                                                                                                  | T    | **LOCKED**    | No     | Keepalive WS infra already ships (`packages/cli/src/mcp/keepalive.ts` ↔ `boot.ts:210-234`). Extending URL with `agentId` is \~20 LOC. Deterministic O(ms) cleanup; no ghost window; respawn dedup resolves automatically; TTL matches shipped `AGENT_FOCUS_STALE_MS = 5_000`.        | Challenger #1; `packages/cli/src/mcp/keepalive.ts`; `packages/server/src/boot.ts:210-234`; `packages/app/src/lib/agent-focus.ts:17` |
| D5  | Include visual overlap fix (triage #1) in this spec.                                                                                                                                                                                                                            | P    | **LOCKED**    | No     | Structurally entangled with multi-agent rendering in the same file.                                                                                                                                                                                                                  | User intake                                                                                                                         |
| D6  | Consolidate `AgentFocusBroadcaster` → `AgentPresenceBroadcaster`. `agentFocus` derived from presence via `pickPrimary`.                                                                                                                                                         | T    | **DIRECTED**  | No     | One broadcaster, one substrate. `agent-focus-wiring.test.ts` is the behavior-parity gate (path/property updates allowed; behavior unchanged).                                                                                                                                        | `packages/server/src/agent-focus.ts`; `agent-focus-wiring.test.ts`                                                                  |
| D7  | Overflow rule: M=4 (current-doc), K=3 (cross-doc) primary avatars per section; rest behind a `+K` popover chip within each section.                                                                                                                                             | P    | **DELEGATED** | No     | Visual polish. Implementer tunes M/K; shadcn `Popover`.                                                                                                                                                                                                                              | Slack/Linear stacking conventions                                                                                                   |
| D8  | Agents with `currentDoc === null` are NOT rendered. Only appear after first write.                                                                                                                                                                                              | P    | **DIRECTED**  | No     | "Presence" means "doing work now."                                                                                                                                                                                                                                                   | User OQ2                                                                                                                            |
| D9  | Cluster A (Activity sidebar) is out of this spec. `agentPresence` substrate is the shared foundation.                                                                                                                                                                           | P    | **LOCKED**    | No     | Keeps scope shippable. Sidebar is a separate UI surface.                                                                                                                                                                                                                             | [[projects/v0-launch/bug-bash-triage]] §3                                                                                           |
| D10 | Keep per-agent `mode: 'editing' \| 'idle'` field. `editing` renders as ring-pulse; `idle` is flat. Applied to current-doc badges only (cross-doc is dimmed regardless of mode).                                                                                                 | P    | **LOCKED**    | No     | Cheap signal; addresses bug-bash "nothing tells me Claude is actively writing right now."                                                                                                                                                                                            | User OQ6                                                                                                                            |
| D11 | Cross-doc agents are visible in the presence bar with reduced prominence. Current-doc takes visual priority.                                                                                                                                                                    | P    | **LOCKED**    | No     | User wants project-wide agent visibility. Pre-empts Cluster A sidebar for the immediate need while sidebar gets properly specced. Shape → D12.                                                                                                                                       | User OQ7 + note                                                                                                                     |
| D12 | **Cross-doc presentation: Design B — sectioned bar with vertical divider.** Current-doc agents left; divider; cross-doc agents right, dimmed + hover tooltip with wiki-link. Each section uses D7 independently. Divider hidden when no cross-doc agents (zero cost at that N). | P    | **LOCKED**    | No     | Avoids visual collision between D7's `+K` overflow chip and a hypothetical `⋯ N elsewhere` chip. Cross-doc agents visible at-a-glance — matches D11 intent. Sectioned overflow isolates current/crossDoc cardinality independently.                                                  | Challenger #2; rejected Design C for chip collision; Design A rejected for density loss at N≥3 cross-doc                            |
| D13 | Extend keepalive URL with `agentId` query param. Client-side one-line edit in `packages/cli/src/mcp/keepalive.ts`.                                                                                                                                                              | T    | **LOCKED**    | No     | Required by D4. Backward-compat: server ignores unknown query params today, so older MCP clients keep working (they just don't get deterministic cleanup — fall back to TTL).                                                                                                        | Follows D4                                                                                                                          |
| D14 | Server-side `boot.ts` WS upgrade handler owns the `ws.on('close') → clearPresence(agentId)` wiring. Broadcaster handle passed into `bootServer` options.                                                                                                                        | T    | **LOCKED**    | No     | Keeps the keepalive concern co-located with its existing owner (`boot.ts` is where `/collab/keepalive` is intercepted today). Avoids spreading presence cleanup across modules.                                                                                                      | `packages/server/src/boot.ts:210-234`; Challenger #1                                                                                |

## 11) Open questions

All P0 open questions resolved during the iterative loop and audit phases. Residual items are P2 or deferred per the Decision Log.

| ID  | Question                                                | Priority | Status                                                                                                   |
| --- | ------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| OQ1 | Fix triage #14 (GitHub device sign-in) as part of this? | P2       | **Out of scope.** Unrelated to presence. [[projects/v0-launch/bug-bash-triage]] item #14 stays separate. |
| OQ2 | Reopen D8 — show idle-but-connected agents dimmed?      | P0       | ✅ **Resolved:** Hide until first write (D8).                                                             |
| OQ3 | Per-brand color variation for N same-brand agents?      | P0       | ✅ **Resolved:** Out of scope for v0 (see NG8). FR-14 demoted to Future Work.                             |
| OQ4 | Heartbeat from MCP process?                             | P0       | ✅ **Resolved:** Yes — use the existing keepalive WS. D4 LOCKED.                                          |
| OQ5 | `AGENT_PRESENCE_STALE_MS` value?                        | P0       | ✅ **Resolved:** 5\_000ms (matches `AGENT_FOCUS_STALE_MS`). D4.                                           |
| OQ6 | Keep per-agent `mode` field?                            | P0       | ✅ **Resolved:** Keep. D10.                                                                               |
| OQ7 | Cross-doc agent visibility in bar?                      | P0       | ✅ **Resolved:** Yes, with priority to current-doc. D11.                                                  |
| OQ8 | `agentFocus` shim or clean delete?                      | P2       | Implementer choice (D6 DELEGATED). Cleaner: delete.                                                      |
| OQ9 | Cross-doc visual design?                                | P0       | ✅ **Resolved:** Design B — sectioned bar. D12.                                                           |

## 12) Future work

- **Cluster A — Activity sidebar (Identified).** Substrate ships here; sidebar is a separate spec. `agentPresence` on `__system__` is the read source.
- **Per-brand color variation (FR-14, Noted).** Formerly OQ3. If bug-bash demos surface confusion between Claude-1 and Claude-2, implement color jitter seeded from `agentId` on top of the base icon color. Today: identical is acceptable.
- **Per-agent undo button placement (V0-14, Noted).** Once multi-agent renders, the stubbed undo affordance becomes meaningfully multi-click. Scope in V0-14.
- **Agent capability badges (Noted).** `clientInfo.version` could surface on hover. Revisit if users ask.
- **Narrow-viewport collapse (Noted).** In embedded view widths, the cross-doc section could collapse into a single chip. Depends on Cluster A shell decisions.

## 13) Risks

| ID | Risk                                                                                                           | Likelihood | Impact | Mitigation                                                                                                                                                                          |
| -- | -------------------------------------------------------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 | Broadcaster consolidation breaks agent-focus nav parity.                                                       | Med        | High   | `agent-focus-wiring.test.ts` is the behavior-parity gate. Path/property updates to the test are expected; behavior assertions must remain unchanged.                                |
| R2 | Keepalive WS close event doesn't fire (network partition, proxy eats close frame).                             | Low        | Low    | TTL fallback (5s) drops stale entries. Ghost window bounded to 5s. Clock skew up to \~4s tolerable before live-agent false-hide.                                                    |
| R3 | `closeAllForAgent` has zero non-test call sites today — keepalive close handler is the only real cleanup path. | Med        | Low    | Acceptable: the keepalive WS close is the signal; synchronous `closeAllForAgent` stays as a library method invocable later (e.g., future test harnesses or explicit admin actions). |
| R4 | Overflow popover a11y on shadcn `Popover`.                                                                     | Low        | Med    | shadcn Popover is a11y-tested; inherit their keyboard nav.                                                                                                                          |
| R5 | Dev-mode warning noisy in tests.                                                                               | Low        | Low    | Gated on `NODE_ENV !== 'test'` AND per-clientID throttle (FR-10).                                                                                                                   |
| R6 | Broadcast fan-out scales with N-agents × N-tabs.                                                               | Low        | Low    | Estimated ≤30 awareness updates/minute at active multi-agent cluster × 5 tabs. Mitigation available if field data shows cost: collapse `mode` flips into `ts`-derived view.         |
| R7 | Cold-start tab sees stale-until-next-write bar.                                                                | Low        | Low    | `__system__` awareness replays on WS sync → bar populates from initial sync. `GET /api/metrics/agent-presence` is a fallback poll if empty after sync (FR-12).                      |

## 14) Cross-references

- [[specs/2026-04-08-presence-awareness-ux/SPEC]] — §3.4 agent DC awareness, §3.9 PresenceBar, §6 FR4/FR11 superseded here
- [[PRECEDENTS]] #1 typed transaction origins; #3 structured event schemas; #8 long-lived agent identity
- [[projects/v0-launch/bug-bash-triage]] — item #1, Cluster A
- `packages/server/src/agent-focus.ts` — reference implementation of map-valued awareness pattern
- `packages/app/src/components/SystemDocSubscriber.tsx` — existing `__system__` client provider
- `packages/cli/src/mcp/keepalive.ts` — existing keepalive WS client (extended in D13)
- `packages/server/src/boot.ts` — existing keepalive WS upgrade handler (extended in D14)
- `packages/core/src/types/awareness.ts` — awareness shape lives here
- `packages/core/src/constants/ok-dir.ts` — `SYSTEM_DOC_NAME` constant
- [[specs/2026-04-21-multi-agent-presence/meta/audit-findings]], [[specs/2026-04-21-multi-agent-presence/meta/design-challenge]] — audit trail

## 15) Agent Constraints

**SCOPE.**
Source: `packages/core/src/types/awareness.ts`, `packages/core/src/index.ts`, `packages/server/src/agent-focus.ts` (→ rename `agent-presence.ts`), `packages/server/src/agent-sessions.ts`, `packages/server/src/api-extension.ts`, `packages/server/src/standalone.ts` (broadcaster wiring), `packages/server/src/boot.ts` (keepalive close handler), `packages/cli/src/mcp/keepalive.ts`, `packages/app/src/lib/agent-focus.ts` (→ `agent-presence.ts`), `packages/app/src/components/SystemDocSubscriber.tsx`, `packages/app/src/editor/DocumentContext.tsx`, `packages/app/src/presence/use-presence.ts`, `packages/app/src/presence/PresenceBar.tsx`.
Tests (parity updates + new): `packages/server/src/agent-sessions.test.ts`, `packages/server/src/agent-focus.test.ts` (→ `agent-presence.test.ts`), `packages/app/tests/integration/agent-focus-wiring.test.ts`, `packages/app/tests/integration/multi-agent-presence.test.ts` (new), `packages/app/tests/stress/multi-agent-presence.e2e.ts` (new).

**EXCLUDE.** Any Cluster A / Activity sidebar UI. Any changes to `@tiptap/extension-collaboration-cursor` or `yCollab` human-cursor paths. Any changes to `Y.Map('activity')` side-channel. Per-brand color variation (deferred to Future Work).

**STOP\_IF.** Broadcaster refactor cannot preserve `agent-focus-wiring.test.ts` behavior-parity (reopen D6). Sectioned bar layout fails a11y audit (revisit §9.7 render approach). Keepalive URL `agentId` param conflicts with existing server-side URL parser / breaks older MCP clients (adjust D13).

**ASK\_FIRST.** Changing any public type in `packages/core/src/types/awareness.ts` beyond the additive `AgentPresenceEntry` (Precedent #9: schema is add-only). Deleting `agentFocus` field entirely vs keeping as shim (D6 DELEGATED — either works; flag the choice in the PR description). Modifying keepalive URL shape beyond the `agentId` additive append (D13).

---

*Changelog at *[[specs/2026-04-21-multi-agent-presence/meta/_changelog]]*; root-cause trace at *[[specs/2026-04-21-multi-agent-presence/evidence/root-cause-trace]]*; audit trail at *[[specs/2026-04-21-multi-agent-presence/meta/audit-findings]]* + *[[specs/2026-04-21-multi-agent-presence/meta/design-challenge]]*.*
