# V0-2: Push-based real-time sidebar updates — Spec

**Status:** Draft (Intake)
**Owner(s):** Andrew (server-side push contract — CC1 infrastructure), Dima (client-side sidebar subscriber)
**Last updated:** 2026-04-13
**Baseline commit:** f8915cd
**Links:**
- Project: [`projects/v0-launch/PROJECT.md` §V0-2 (line 480)](../../projects/v0-launch/PROJECT.md), CC1 cross-cutting concern (line 991)
- Predecessor draft: [`specs/2026-04-11-sidebar-realtime-updates/SPEC.md`](../2026-04-11-sidebar-realtime-updates/SPEC.md) (6 OQs)
- Lateral consumers: V0-3 (BacklinksPanel push, `PROJECT.md:332`), V0-11 (graph panels, `:303`), V0-4 (file ops, `:632`)
- Evidence: [`./evidence/`](./evidence/)

---

## 1) Problem statement

**Situation.** `FileSidebar` polls `GET /api/documents` every 5 s (`packages/app/src/components/FileSidebar.tsx:144`). The Hocuspocus server already detects file-system changes in real time via `@parcel/watcher` and emits a typed `DiskEvent` union (`packages/server/src/file-watcher.ts:33-45`). Clients already hold a live WebSocket via `HocuspocusProvider`. The infrastructure to push exists; the bridge between server-side disk events and connected clients does not.

**Complication.** The 5 s polling produces two distinct pains, each load-bearing for v0:
1. **User-visible staleness.** Agent-created files (via MCP `write_document`) take up to 5 s to appear in the sidebar. In a real-time collaborative editor this reads as broken. V0-4 (file ops UX) cannot ship "instant" delete/rename feedback while built on a 5 s poll.
2. **Architectural fragmentation.** Without a push primitive, every future derived-view panel (backlinks, graph, tags) independently chooses a polling cadence. `BacklinksPanel.tsx:57` already does this at 2 s. The product is on a trajectory of accreting N uncoordinated pollers, each forcing its own re-fetch, none coordinated with others.

**Resolution.** Build the push-over-awareness primitive (CC1) once, wired from the file-watcher to connected clients via the existing Hocuspocus transport. Sidebar is the first consumer — replace its 5 s poll with signal-driven refresh. The signal contract (semantics + transport shape) becomes the reusable pattern that V0-3 and V0-11 inherit. Whichever ships first defines the contract; the second consumes it.

## 2) Goals

- **G1.** Sidebar reflects file-system changes (create/delete/rename of `.md` files within the content directory) within ~ws-RTT (target <500 ms p95) instead of up to 5 s.
- **G2.** Establish CC1 push-over-awareness contract reusable by V0-3 (BacklinksPanel) and V0-11 (graph panels) without redesigning the transport.
- **G3.** Remove the 5 s `setInterval` from `FileSidebar.tsx`. Polling fallback only on awareness disconnect (single re-fetch on reconnect, not silent background polling).

## 3) Non-goals

- **[NOT NOW] NG1.** Sidebar UX redesign (collapse-state persistence, sort, search-in-sidebar, drag-and-drop). PROJECT.md RH2 explicit guardrail. Revisit if: V0-19/V0-22/V0-23 promote.
- **[NOT NOW] NG2.** Optimistic UI for agent writes (sidebar speculatively renders before server confirms). Defer to V0-4 file-ops UX. Revisit if: V0-4 spec promotes the optimism question.
- **[NOT NOW] NG3.** Per-document "content modified" push (size/modified-time updates without create/delete). Sidebar doesn't render mtime today. Revisit if: V0-19 (sort by mtime) ships.
- **[NEVER] NG4.** New WebSocket endpoint or non-Hocuspocus transport. CC1 constraint.
- **[NEVER] NG5.** Pushing the full document list as the event payload. CC1 explicitly says "signal-then-fetch (not push-the-data)" or, if structured events win, small per-event payloads — never the full list.

## 4) Personas / consumers

- **P1. Writer using the editor while an agent runs in parallel.** Expects files the agent creates to appear without manual reload.
- **P2. Writer making local file ops (V0-4 future).** Expects delete/rename/move feedback to feel instant, even though V0-2 only delivers the underlying primitive.
- **P3. Other panel authors (Mike: V0-3 backlinks, V0-11 graph; future tag browser).** Consume the CC1 contract; need it stable enough to build against.
- **P4. Server operators (Andrew).** Need debuggable, bounded-cost broadcast that doesn't fan out poorly under burst (e.g., `git checkout` on a 3000-file vault).

## 5) User journeys

*(To be drafted in Iterate phase. Sketch:)*

- **Happy path (P1).** Agent runs `write_document new-page.md` → server persists → file-watcher emits `DiskEvent{kind:'create'}` → server broadcasts CC1 signal → all connected sidebars receive within ~RTT → re-fetch (or patch) → tree shows `new-page.md`.
- **Failure / recovery.** Client WebSocket disconnects → reconnects → single `GET /api/documents` re-fetch closes the gap. No background polling.
- **Burst.** `git checkout other-branch` triggers 200 DiskEvents → server coalesces (debounce) → single (or bounded) signal → clients re-fetch once.
- **Debug.** Server logs each broadcast with kind+path+subscriber-count. Client logs each signal received + action taken.

## 6) Requirements

*(Skeleton — fills during Iterate after judgment calls 1-5 resolve.)*

### Functional

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | Server broadcasts a CC1 signal to all connected clients on every relevant DiskEvent | New file appears in sidebar of every connected client within p95 <500 ms of disk write | Depends on judgment-call 2 (signal vs. event payload) |
| Must | Sidebar replaces 5 s polling with signal-driven refresh | `setInterval` removed from `FileSidebar.tsx`; manual file-system mutation reflects within p95 <500 ms | |
| Must | Reconnect closes any gap missed during disconnect | After ≥1 disk event during a forced disconnect, sidebar matches disk state within RTT of reconnect | |
| Should | Bursts (>10 events in 100 ms) coalesce | Server emits ≤N signals per coalescing window; client re-fetches ≤N times | |
| Could | Structured event payload enables tree-patch instead of full re-fetch | (Only if judgment-call 2 lands on B/C) | |

### Non-functional

- **Performance.** p95 sidebar update latency <500 ms post-disk-write under nominal load. Server broadcast O(connected clients), not O(files).
- **Reliability.** No silent dropped events: missed events during disconnect are recovered on reconnect via fallback re-fetch.
- **Security/privacy.** Same trust boundary as today (localhost). No new auth surface.
- **Operability.** Broadcast count + per-client deliver metric; reconnect-fallback metric. Reuse `metrics.ts` counters pattern.
- **Cost.** Bandwidth ≪ current polling under nominal load (1 small message per change vs. 12 list-fetches/min/client).

## 7) Success metrics & instrumentation

*(Drafted during Iterate.)*

- **Latency.** p95 (disk write → sidebar tree updated) under controlled E2E.
  - Baseline: ~2.5 s expected (mid-poll-interval).
  - Target: <500 ms p95.
- **Polling load.** `GET /api/documents` calls/min/client.
  - Baseline: 12 (5 s poll).
  - Target: ~0 steady state, ~1 per (re)connect.
- **Pattern reuse.** V0-3 lands consuming the same CC1 primitive without contract revision.

## 8) Current state (how it works today)

- `FileSidebar.tsx` calls `fetch('/api/documents')` on mount + every 5 s via `setInterval`. No event subscription.
- `GET /api/documents` is served from the in-memory file index maintained by the file-watcher (`CLAUDE.md` "File discovery"); no `readdirSync` per request. **Verifies OQ5 of predecessor spec is largely moot — to confirm in Iterate.**
- The Hocuspocus file-watcher emits `DiskEvent` (`create | update | delete | rename | conflict`) and is consumed today by reconciliation/persistence (`standalone.ts:322-368` for delete; rename path partial).
- `BacklinksPanel.tsx:57` runs an analogous 2 s poll — V0-3's target, will share the CC1 contract this spec defines.
- The provider pool's `onChange` fires for pool ops (open/close/setActive), not for new files appearing on disk — so today the sidebar and the pool are independent data sources with no coordination.

## 9) Proposed solution (vertical slice)

*(Sketch — narrows during Iterate based on judgment calls.)*

### User experience / surfaces

- **Sidebar.** No visible UX change beyond "files appear/disappear faster." Existing tree, existing icons, existing collapse state. RH2 guardrail.
- **No new UI surface.** All change is plumbing.

### System design (sketch — 3 candidate transports for judgment-call 3)

```
File Watcher (existing)
  └─ DiskEvent (create / delete / rename — update/conflict TBD)
       │
       ├─→ Persistence + Reconciliation (existing)
       │
       └─→ NEW: CC1 broadcast layer
                │
                ├─ 3a. System Y.Doc (`__system__`) — every client opens on connect
                ├─ 3b. Broadcast over every open Y.Doc's awareness — clients dedupe
                └─ 3c. Hocuspocus message-protocol extension (custom message type)
```

### Alternatives considered

*(Populated during Iterate. Initial inventory:)*
- **Signal vs. typed event vs. hybrid** (judgment-call 2)
- **Transport: system-doc / per-doc broadcast / protocol extension** (judgment-call 3)
- **SSE on a dedicated endpoint** — rejected by CC1 constraint NG4
- **Smarter polling (ETag / `?since=`)** — rejected by goal G2 (no architectural primitive emerges)

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Reuse Hocuspocus transport; no new endpoint | T | LOCKED | Yes | CC1 constraint; PROJECT.md:487 | `projects/v0-launch/PROJECT.md:991` | Forces transport-shape decision (D-pending) inside Hocuspocus protocol |
| D2 | This spec defines the CC1 contract; V0-3 and V0-11 consume | X | LOCKED | Yes | PROJECT.md:992, "first one defines" | `projects/v0-launch/PROJECT.md:922` | V0-2 must publish a stable contract artifact |
| D3 | No background polling fallback; only single re-fetch on reconnect | T | DIRECTED | No | PROJECT.md:489 | Seed | Reconnect handler must trigger one /api/documents call |
| D4 | Sidebar UX redesign out of scope | P | LOCKED | No | PROJECT.md RH2:1038 | | NG1 |
| D5 | Optimistic UI for agent writes deferred to V0-4 | P | DIRECTED | No | Predecessor OQ4 | | NG2 |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | SCR framing accuracy — does it capture the right pain emphasis? | P | P0 | No | User confirm in Intake | Awaiting user |
| Q2 | Signal-only vs. typed-event vs. hybrid contract semantics | T/X | P0 | Yes | Investigate Hocuspocus stateless message + awareness; recommend in Iterate | Awaiting user direction |
| Q3 | Transport shape for vault-scoped signal over per-doc Hocuspocus channel (system-doc / per-doc broadcast / protocol ext) | T | P0 | Yes | /worldmodel + /research on Hocuspocus extension API in Scaffold | Investigate next |
| Q4 | Which DiskEvent kinds should broadcast? (create/delete/rename obvious; update/conflict?) | T | P0 | No | Tied to Q2 — if signal-only, "any change" suffices; if typed, must enumerate | Open |
| Q5 | Coalescing/debounce window for bursty events (e.g., `git checkout`) | T | P0 | No | Measure under burst in Iterate | Open |
| Q6 | Inherit predecessor OQ5 (list endpoint scalability)? Likely moot — verify | T | P0 | No | Read api-extension to confirm in-memory index path | Investigate next |
| Q7 | Should V0-2 acceptance include E2E for "agent write → sidebar <500ms" or is that V0-4's? | P | P0 | No | User direction | Awaiting user |
| Q8 | Multi-client correctness: 5 connected clients all receive each event exactly once? | T | P0 | No | Iterate — derive from chosen transport | Open |
| Q9 | Behavior when no document is open in the editor (sidebar still needs signal) — does any transport choice fail this? | T | P0 | Yes | Iterate — derive from chosen transport | Open |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `GET /api/documents` is already O(1) from in-memory file index, not O(N) `readdirSync` | HIGH | Read `api-extension.ts` document handler | Before Q6 close | Active |
| A2 | Hocuspocus stateless messages can carry arbitrary JSON to all clients connected to a doc | MEDIUM | Read `@hocuspocus/server` source / docs | Before Q2/Q3 close | Active |
| A3 | Connected clients hold ≥1 open Y.Doc at any time the sidebar is mounted | MEDIUM | Trace `provider-pool.ts` lifecycle | Before Q9 close | Active — likely false on cold load before user opens a file |

## 13) In Scope (implement now)

*(Filled during Verify — must pass resolution-completeness gate.)*

- Goal: G1, G2, G3
- Owner: Andrew (server), Dima (client)
- Next actions: pending judgment-call resolution + Iterate phase
- Risks + mitigations: §14
- Instrumentation: §6 non-functional

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Chosen transport (Q3) doesn't carry vault-scoped events cleanly → forces ugly hack | M | H | Investigate all 3 candidates in Iterate before committing | Andrew |
| Burst events (`git checkout` 200 files) overwhelm clients | M | M | Coalesce server-side; bounded broadcast rate (Q5) | Andrew |
| Contract churn between V0-2 and V0-3 forces V0-3 to re-spec | L | H | Publish stable contract artifact in this spec; review with Mike before V0-3 starts | Andrew + Mike |
| Sidebar mounted with no open doc → no awareness channel to listen on | M | H | If Q3 = system-doc, every client opens it on connect; otherwise need fallback | Andrew |

## 15) Future Work

### Identified

- **V0-3 BacklinksPanel push** — same CC1 primitive applied to backlink-index updates. Spec lives in V0-3.
- **V0-11 graph panels live updates** — third consumer of CC1.
- **Optimistic sidebar UI on agent writes** — V0-4 file ops UX (NG2).

### Noted

- **Update/mtime push** — relevant once V0-19 surfaces sort-by-modified.
- **Tag browser live updates** — fourth CC1 consumer if tags ship.

## 16) Agent constraints

*(Derived during Verify. Sketch:)*

- **SCOPE:** `packages/server/src/{file-watcher,standalone,api-extension}.ts`, `packages/server/src/cc1-broadcast.ts` (new), `packages/app/src/components/FileSidebar.tsx`, client-side subscription module (new).
- **EXCLUDE:** Sidebar UX redesign (NG1); BacklinksPanel implementation (V0-3 owns); persistence/reconciliation flow (read-only).
- **STOP_IF:** Contract change after V0-3 starts consuming; introducing new WebSocket endpoint; modifying Hocuspocus message protocol in a non-additive way.
- **ASK_FIRST:** Adding a new server-side dependency; changing `DiskEvent` taxonomy.
