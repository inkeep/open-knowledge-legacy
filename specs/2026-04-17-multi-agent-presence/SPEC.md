# Multi-agent presence — Spec

**Status:** Draft (scaffold)
**Owner(s):** Andrew Mikofalvy
**Last updated:** 2026-04-17
**Baseline commit:** `0b707bd1`
**Links:**

- Evidence: [`./evidence/`](./evidence/)
- Changelog: [`./meta/_changelog.md`](./meta/_changelog.md)
- Related precedent: [[AGENTS]] §8 (long-lived agent identity vs short-lived session concerns)
- Related subsystem: [[packages/server/src/agent-sessions]]

---

## 1) Problem statement

**Situation.** Open Knowledge is a multi-agent collaborative markdown editor. Multiple AI agents (Claude Code, Cursor, Codex, Windsurf, Cline, Copilot) can connect simultaneously via MCP; each has a unique `connectionId` (UUID from `randomUUID()` at MCP handshake, `packages/cli/src/mcp/server.ts:290`), and each writes through `AgentSessionManager.getSession(docName, agentId)` which keys per-agent `DirectConnection`s by `(docName, agentId)`.

**Complication.** The presence bar silently collapses concurrent agent activity down to a single slot because all server-side `DirectConnection`s for a document share one Y.Doc (Hocuspocus caches by docName — `createDocument` at `node_modules/@hocuspocus/server/dist/hocuspocus-server.esm.js:2224`) and therefore one `Y.Awareness.clientID` (derived from `doc.clientID` at `node_modules/y-protocols/awareness.js:49`). Each agent's `dc.document.awareness.setLocalState({user, mode})` in `packages/server/src/agent-sessions.ts:177` writes the same slot — last writer wins. This breaks (1) the real-time "watch your agents work" UX, (2) concurrent-write visibility, and (3) multi-agent trust. Activity, contributor tracking, and agent-focus push-nav already work per-agent — bug is narrowly scoped to awareness broadcast, but the wire format is a 1-way door shared with browser clients.

**Resolution.** Allocate a stable synthetic `Y.Awareness.clientID` per MCP agent session (hash of `connectionId`) and publish via `applyAwarenessUpdate` into the shared Y.Awareness, so N concurrent agents occupy N independent slots. Disambiguate same-type instances via per-instance color seeding and conditional name suffix.

## 2) Goals

- **G1.** N concurrent MCP agents render as N independent icons with correct type, name, and color.
- **G2.** Two instances of the same agent type are visually distinguishable at-a-glance.
- **G3.** Agent awareness slots auto-expire on MCP disconnect — no ghost icons.
- **G4.** Existing per-agent subsystems (activity map, contributor tracker, agent-focus, shadow-repo attribution) unchanged.
- **G5.** Client-side `PresenceBar` rendering path unchanged (no UI rewrite).

## 3) Non-goals

- **\[NOT NOW]** NG1: Agent-to-agent coordination via awareness. Revisit if: a concrete agent-to-agent feature lands.
- **\[NOT NOW]** NG2: Agent cursor / selection rendering. Revisit if: product asks for "see where the agent is editing."
- **\[NOT NOW]** NG3: Follow-me UX. Revisit if: coordination story grows.
- **\[NEVER]** NG4: Per-agent Y.Doc isolation. Would fork CRDT state.
- **\[NEVER]** NG5: Rewriting the Y.Awareness wire protocol. Fix operates within it.

## 4) Personas / consumers

- **P1** — Human operator running multiple agents.
- **P2** — Developer debugging multi-agent scenarios.
- **P3** — Playwright E2E test authors.
- **P4** — Future agent-to-agent coordination consumer (NG1).

## 5) User journeys

### Happy path (P1)

1. User runs `claude-code` in terminal → MCP starts, connects to Hocuspocus keepalive.
2. User starts Cursor → its MCP starts, connects.
3. User opens browser preview.
4. User asks Claude to edit doc A; Cursor to edit doc B.
5. Presence bar shows **two agent icons** with distinct colors.
6. Claude starts a second session → bar grows to **three icons**: two Claude (distinct shades, tooltips "Claude Code (a1b2)" / "Claude Code (c3d4)") + Cursor.

### Failure / recovery

- **MCP process killed** → keepalive WS closes → slot cleared within Y.Awareness `outdatedTimeout` (\~30s).
- **Server restart** → agents reconnect with fresh `connectionId` → fresh slots.
- **Network hiccup** → Y.Awareness heartbeat keeps slot alive if <30s.

### Interaction state matrix

| Feature             | Loading                          | Empty           | Error                         | Success              | Partial                               |
| ------------------- | -------------------------------- | --------------- | ----------------------------- | -------------------- | ------------------------------------- |
| Agent presence slot | `applyAwarenessUpdate` in-flight | no MCP sessions | synthetic ID collision (rare) | N icons for N agents | stale slot awaiting `outdatedTimeout` |

## 6) Requirements

### Functional

| Priority | Requirement                                                                                                         | Acceptance criteria                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Must     | FR1: Each MCP agent session gets its own Y.Awareness slot with a synthetic clientID stable for connection lifetime. | Two MCPs on same doc → `awareness.getStates().size === 2` (plus humans).             |
| Must     | FR2: Two same-type instances are visually distinguishable.                                                          | Two Claude sessions → different colors; tooltip suffix when >1 of type.              |
| Must     | FR3: Slots auto-expire on MCP disconnect within \~30s.                                                              | Kill MCP → icon gone within 30s without user action.                                 |
| Must     | FR4: Synthetic clientIDs don't collide with browser Y.Doc clientIDs.                                                | Collision rate ≤1e-9/connection OR structural disjoint ID space.                     |
| Must     | FR5: Existing per-agent subsystems unaffected.                                                                      | Contributor tracker, activity map, agent-focus, shadow attribution — no regressions. |
| Should   | FR6: Presence propagates to browser within 100ms of first MCP write.                                                | Playwright assertion.                                                                |
| Could    | FR7: `/api/presence/:docName` debug endpoint.                                                                       | JSON of active slots.                                                                |

### Non-functional

- **Performance:** Linear fan-out; 10-agent scenario OK.
- **Reliability:** `outdatedTimeout` backstop; keepalive primary.
- **Security/privacy:** Only display-safe fields on wire.
- **Operability:** Slot lifecycle log events, `activeAgentSlots` counter.
- **Cost:** O(N) in-memory.

## 7) Success metrics

- **M1 — Multi-agent visibility.** Baseline: 1 icon regardless of count. Target: N icons for N agents. Instrumentation: Playwright + unit test.
- **M2 — Ghost rate.** Target: zero stale slots 60s after all MCPs terminate. Instrumentation: Playwright polls after kill.
- **Logs:** `[agent-presence]` namespaced bracket-prefixed events.

## 8) Current state

- `AgentSessionManager.getSession(docName, agentId)` multiplexes correctly on write.
- `dc.document.awareness.setLocalState(...)` writes shared Y.Awareness keyed by shared Y.Doc clientID — overwrites.
- `setLocalStateField('mode', ...)` has the same problem.
- Browser `PresenceBar` handles multi-agent correctly; bug is strictly server-side.
- `tabId: 'agent-${agentId}'` field is vestigial.
- Working per-agent subsystems: `activityMap`, `contributorTracker`, `AgentFocusBroadcaster`, shadow repo WIP refs.

### Known gap

`AGENT_ICON_COLORS[icon]` in `agent-sessions.ts:176` overrides `colorSeed` for known types — why two Claude instances currently share color even if seeds differ.

## 9) Proposed solution

### User experience

- **Presence bar:** one badge per active MCP agent. No UI rewrite.
- **Tooltip:** display name; suffix when >1 of same type.
- **Color:** per-instance, derived from `connectionId` hash. Known types retain hue but vary in shade.
- **Docs:** `packages/cli` README gets short `AGENT_LABEL` section.

### System design

```
MCP client          Hocuspocus                      Browser
─────────           ──────────                      ───────
                    Y.Doc (per docName, cached)
                    Y.Awareness (one per Y.Doc)
connectionId ──POST─> extractAgentIdentity
                        │
                        ▼
                      AgentSessionManager.getSession
                        │
                        ▼
                      synthesizeClientId(connectionId) → uint32
                        │
                        ▼
                      applyAwarenessUpdate(shared.awareness,
                        encodeAwarenessUpdate([synthId],
                        { [synthId]: {user, mode} }))
                                                     ◄── broadcast
                                                     awareness slot N
```

- `AgentSessionManager` gains `clientIdMap: Map<agentId, number>`.
- `synthesizeClientId(connectionId: string): number` — stable xxhash32 / FNV-1a → uint32.
- New `packages/server/src/awareness-publish.ts` encapsulates `applyAwarenessUpdate` machinery.
- External surface unchanged: `getSession`, `closeSession`, mode toggle route through new internal module.
- `[agent-presence]` log namespace (bracket-prefixed per AGENTS.md Debug Tooling conventions).

#### Shadow paths

- **nil/missing:** no `AGENT_LABEL`, no `clientInfo.name` → fallback "Agent" + connectionId-hash suffix.
- **empty:** `AGENT_LABEL=""` → treated as unset.
- **wrong type:** malformed `agentId` rejected by `AGENT_ID_RE` (existing behavior).
- **timeout:** keepalive WS dies → `outdatedTimeout` evicts (\~30s).
- **conflict:** hashed ID collision — last writer wins; \~1e-10/connection.
- **partial failure:** `applyAwarenessUpdate` throws → write path still proceeds; presence invisible; log warn.

#### Failure modes

| Component              | Failure                         | Detection                            | Recovery                      | User Impact                         |
| ---------------------- | ------------------------------- | ------------------------------------ | ----------------------------- | ----------------------------------- |
| Synthetic clientID     | Collision with browser clientID | Not reliably detectable              | Accept or use reserved-bit ID | Wrong icon flickers; auto-heals     |
| `applyAwarenessUpdate` | Throws                          | Caught, logged                       | Writes proceed                | Invisible agent; attribution intact |
| Keepalive WS           | Drops                           | Hocuspocus `onDisconnect` + backstop | Slot closed; 30s max          | Icon gone ≤30s                      |
| Server restart         | All slots lost                  | MCPs reconnect fresh                 | Fresh slots                   | Icons re-appear                     |

### Alternatives considered

- **A — Y.Doc per agent.** Rejected (NG4). Forks CRDT state.
- **B — Custom Y.Map presence channel.** Rejected. Duplicates Y.Awareness; breaks `awareness.getStates()` consumers.
- **C — Synthetic clientID + ****`applyAwarenessUpdate`****.** ←chosen. Minimum machinery.
- **D — Each MCP opens its own WebSocket** (not just keepalive) for a real HocuspocusProvider. Rejected in scaffold (pending audit re-look). Doubles WS count; changes Document-sharing model.

## 10) Decision log

| ID | Decision                                                                                                                 | Type      | Resolution    | 1-way door? | Rationale                                                   | Evidence                                             |
| -- | ------------------------------------------------------------------------------------------------------------------------ | --------- | ------------- | ----------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| D1 | Same-type instances: same icon + distinct per-instance colors + conditional name suffix when >1 of type connected.       | Product   | INVESTIGATING | Yes         | Matches mental model; clean fallback when no `AGENT_LABEL`. | Pending user confirmation                            |
| D2 | Agent slot persistent while MCP process connected; Y.Awareness `outdatedTimeout` handles idle.                           | Product   | INVESTIGATING | No          | "Who's here right now" matches human presence.              | Pending user confirmation                            |
| D3 | Synthetic clientID = stable hash of MCP `connectionId` masked to uint32.                                                 | Technical | INVESTIGATING | Yes         | Simple; \~1e-10 collision; stateless.                       | Pending user confirmation                            |
| D4 | No `AGENT_LABEL`: display = client name alone when unique; client name + short connectionId suffix when >1 of same type. | Product   | INVESTIGATING | No          | Clean default; disambiguation only when needed.             | Pending user confirmation                            |
| D5 | Server-only fix; no wire protocol changes.                                                                               | Technical | LOCKED        | Yes         | Scope discipline.                                           | `applyAwarenessUpdate` supports arbitrary clientIDs. |
| D6 | Remove `tabId` vestigial field from agent awareness user state.                                                          | Technical | DIRECTED      | No          | No current consumer; clutters wire.                         | `grep -rn tabId packages/`                           |

## 11) Open questions

| ID | Question                                                                                        | Type          | Priority | Blocking? | Plan                                                    |
| -- | ----------------------------------------------------------------------------------------------- | ------------- | -------- | --------- | ------------------------------------------------------- |
| Q1 | Does `applyAwarenessUpdate` with synthetic clientID broadcast correctly to browser clients?     | Technical     | P0       | Yes       | Trace Hocuspocus fan-out + focused integration test.    |
| Q2 | Is `/collab/keepalive` the right lifecycle anchor, or rely on `DirectConnection.disconnect()`?  | Technical     | P0       | Yes       | Trace `keepalive.ts` + api-extension keepalive handler. |
| Q3 | Browser clientID vs synthetic agent clientID collision — detectable? Recoverable?               | Technical     | P0       | Yes       | Read y-protocols awareness resolution on collision.     |
| Q4 | `AgentFocusBroadcaster` payload — should it include synthetic clientID for "who navigated you"? | Cross-cutting | P2       | No        | Deferred unless audit surfaces need.                    |
| Q5 | Existing Playwright E2E — multi-agent assumptions?                                              | Technical     | P0       | Yes       | Grep stress tests.                                      |
| Q6 | `setLocalStateField('mode', ...)` — same clientID path? Per-agent `setMode` helper needed?      | Technical     | P0       | Yes       | Read y-protocols source.                                |
| Q7 | CC1 / `__system__` interactions with per-agent slot logic?                                      | Technical     | P0       | Yes       | Check `isSystemDoc` entry points.                       |
| Q8 | Retire `AGENT_ICON_COLORS[icon]` override? Or hue-only?                                         | Product       | P0       | No        | D1 implicitly resolves.                                 |

## 12) Assumptions

| ID | Assumption                                                                      | Confidence | Verification                                                     |
| -- | ------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| A1 | `applyAwarenessUpdate` accepts arbitrary clientIDs + broadcasts via Hocuspocus. | HIGH       | y-protocols + Hocuspocus source (pending).                       |
| A2 | Two MCP processes get different `connectionId`s.                                | HIGH       | Confirmed `server.ts:290` (`randomUUID()` per process). Retired. |
| A3 | Browser `PresenceBar` handles multi-agent states correctly.                     | HIGH       | Confirmed initial investigation. Retired.                        |
| A4 | MCP keepalive WS is 1:1 with MCP process lifetime.                              | HIGH       | Pending read of `keepalive.ts`.                                  |
| A5 | No consumer depends on `tabId` field.                                           | MEDIUM     | Pending grep of awareness-shape consumers.                       |

## 13) In Scope

- **Goal:** G1-G5.
- **Requirements:** FR1-FR6 (Must/Should). FR7 optional.
- **Proposed solution:** §9.
- **Owner:** Andrew Mikofalvy
- **Next actions:**
  1. Dispatch `/worldmodel` for awareness / keepalive / presence topology.
  2. Resolve Q1-Q8.
  3. Author `packages/server/src/awareness-publish.ts`.
  4. Wire `AgentSessionManager` to new module.
  5. Drop `tabId`.
  6. Add multi-agent Playwright E2E.
  7. Update client name-suffix logic.

### Deployment

| Concern                              | Approach                                                                 | Verify                   |
| ------------------------------------ | ------------------------------------------------------------------------ | ------------------------ |
| MCPs in-flight during server upgrade | Restart drops sessions; reconnect with fresh connectionId. No migration. | Observe on deploy.       |
| Wire-format compat                   | No change; only new clientIDs in existing slots.                         | Playwright multi-client. |
| Rollback                             | Revert commit. No schema.                                                | Standard.                |

## 14) Risks

| Risk                                     | Likelihood | Impact                | Mitigation                                         |
| ---------------------------------------- | ---------- | --------------------- | -------------------------------------------------- |
| Synthetic ID collides with browser ID    | Very low   | Wrong icon flickers   | Accept; fallback to reserved-bit if audit demands. |
| MCP crash → ghost slot >30s              | Medium     | Minor UX confusion    | Keepalive TCP close + `outdatedTimeout`.           |
| `applyAwarenessUpdate` differs from read | Low        | Fix doesn't broadcast | Evidence-verify Q1 pre-implementation.             |
| Playwright assumes 0/1 agent icon        | Medium     | CI red                | Audit tests; update + add multi-agent test.        |
| Per-instance color palette ugly          | Low        | Aesthetic             | Hue-constrained seed derivation.                   |

## 15) Future Work

### Explored

- **Agent-to-agent coordination via awareness (NG1).**
  - Learned: `awareness.getStates()` exposes other agents' presence + mode to any agent. Fix provides data plane; consumers future work.
  - Approach: separate spec for coordination semantics.
  - Why not now: needs product framing; scope creep risk.
  - Triggers: second request involving agents-avoiding-agents.

### Identified

- **Agent cursor/selection rendering (NG2).** Follows `CollaborationCursor` pattern but needs per-write cursor publication.
- **Follow-me UX (NG3).** Client-side once presence exposes enough data.
- **Per-doc agent aggregation dashboard.** Different surface.

### Noted

- **Agent-to-agent chat/comments** — speculative.
- **Label persistence across MCP restarts** — `AGENT_LABEL` env already survives; no work.

## 16) Agent constraints

- **SCOPE:** `packages/server/src/agent-sessions.ts`, presence-mutation sites in `packages/server/src/api-extension.ts`, new `packages/server/src/awareness-publish.ts`. Client: `packages/app/src/presence/use-presence.ts`, `packages/app/src/presence/PresenceBar.tsx` for name-suffix. Tests: new `packages/app/tests/stress/multi-agent-presence.e2e.ts`.
- **EXCLUDE:** Y.Doc persistence, file watcher, shadow repo, contributor-tracker internals, `AgentFocusBroadcaster` payload, `__system__` broadcast, MCP tool registration.
- **STOP\_IF:** any `DirectConnection` lifecycle change requiring Hocuspocus upstream patch; any Y.Awareness wire format alteration; any schema change (precedent #9).
- **ASK\_FIRST:** renaming `AgentSessionManager` public methods; changing `colorSeed` for existing agents; removing `tabId` if a consumer surfaces.
