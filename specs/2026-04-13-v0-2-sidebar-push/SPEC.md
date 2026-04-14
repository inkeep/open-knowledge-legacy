# V0-2: Push-based real-time sidebar updates — Spec

**Status:** Server-side shipped (PR #106, commit range `2d49759..4ea9adb`: US-001/002/003/004/005/006/008). Client-side consumer (ProviderPool pin, `main.tsx` mount, `FileSidebar` subscriber, Playwright L2) deferred to follow-up PR (owner: Dima).
**Owner(s):** Andrew (server-side push contract — CC1 infrastructure), Dima (client-side sidebar subscriber)
**Last updated:** 2026-04-13
**Baseline commit:** 02be9f3 (spec finalized); subsequent commits on this branch are the server implementation landed via `/ship` — see PR #106 commit log
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
| Must | Server broadcasts `{v:1, ch, seq}` pure signals on `create\|delete\|rename` DiskEvents via `__system__` doc `broadcastStateless` | Integration test: disk write → connected client's `onStateless` receives a `{v:1, ch:'files', seq:<N>}` payload within p95 <500 ms | D7, D8, D9 |
| Must | Every client opens `__system__` Y.Doc on app mount via `ProviderPool` | Smoke: spawn app, no user action, WebSocket connection for `__system__` is established | D8 |
| Must | Sidebar removes 5 s `setInterval` and subscribes to `__system__.onStateless`; every `ch:'files'` signal triggers one `GET /api/documents` and rebuilds the tree | `setInterval` gone from `FileSidebar.tsx:144`; each signal triggers one refetch; no background polling; no delta patching | D3, D7 |
| Must | At-most-one refetch per channel in flight; pending refetches suppress redundant calls until they return; duplicate `seq` is dropped silently | Fuzz: 10 rapid signals → client performs ≤2 fetches (one in flight + one queued trailing) | D7 |
| Must | WebSocket reconnect triggers single unconditional `GET /api/documents` refetch | Forced disconnect + disk write during disconnect + reconnect → sidebar reflects disk within RTT of reconnect | D3, D7 |
| Must | Server assigns monotonic per-channel `seq` starting at 1 per process lifetime (for observability + client dedup, not refetch gating) | Metric `cc1LastSeq['files']` observable; dedup test passes | D7 |
| Must | Every subsystem that keys off `documentName` short-circuits on `__system__` via the single `isSystemDoc()` helper: persistence, file-watcher, content-filter, reconciliation, backlink-index, agent-sessions, external-change, frontmatter cache | Integration test after 10 CC1 broadcasts: zero state for `__system__` anywhere (no `.__system__.md`, no backlink index entries, no reconciledBase entry, no frontmatter cache entry) | D8 |
| Must | `ContentFilter` rejects user-created `__system__.md` (reserved name); `POST /api/create-page` returns 400 on that name | Attempting to create `__system__.md` via API returns 400; writing one directly to disk does not enter the file index | D8, D13 |
| Must | Server calls `hocuspocus.openDirectConnection('__system__')` on startup before enabling CC1 broadcaster | DiskEvents arriving before first browser connect no-op gracefully; Document exists in `hocuspocus.documents` after startup | D8 |
| Must | Server coalesces bursts via **100 ms trailing-edge debounce** per channel; any event restarts the timer; emit one signal per quiet period (no threshold, no sentinel) | `git checkout` of branch changing 200 files over 800 ms → exactly 1 signal 100 ms after the last event; client refetches once | D10 |
| Must | Broadcast excludes `update` and `conflict` DiskEvents from `ch:'files'` (they do not change the file list) | Integration test: trigger `update` (file content change on open doc) → no `ch:'files'` signal emitted | D9 |
| Should | Server emits structured log + metric for every broadcast (channel, seq, subscriber count; drop counter for no-document case) | `metrics.ts` exposes `cc1BroadcastCount`, `cc1SubscriberCount`, `cc1LastSeq`, `cc1BroadcastDrop` | §6 NFR operability |
| Should | Playwright E2E: agent `write_document` → sidebar row appears within p95 <2 s in CI (manual smoke targets <500 ms) | `packages/app/tests/stress/cc1-sidebar.e2e.ts` passes on CI | D11 |
| Could | Client dedupes if same `seq` received twice (defensive) | No double-fetch on accidental redelivery | D7 |

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

### System design

```
File Watcher (existing — packages/server/src/file-watcher.ts)
  └─ DiskEvent {kind: 'create'|'delete'|'rename'|'update'|'conflict', ...}
       │
       ├─→ Persistence + Reconciliation (existing — unchanged)
       │
       └─→ NEW: CC1 broadcaster (packages/server/src/cc1-broadcast.ts)
                │
                ├─ Filter: 'files' channel signals only on create|delete|rename
                │  (update/conflict do not change the file list)
                │
                ├─ 100 ms trailing-edge debounce — any event within the
                │  window restarts the timer; emit one signal per quiet period
                │
                └─ hocuspocus.documents.get('__system__').broadcastStateless(JSON)
                           │
                           ▼
                  All HocuspocusProvider clients subscribed to '__system__'
                           │
                           ├─ onStateless({payload}) — parse, check seq
                           └─ GET /api/documents → rebuild tree
                                (every signal causes a refetch; no delta patching)
```

**Transport.** Dedicated `__system__` Y.Doc. Every client opens a second `HocuspocusProvider({name: '__system__'})` on app mount via the existing `ProviderPool`. Server-side, the broadcaster uses `Document.broadcastStateless(payload)` (Hocuspocus public API: `Document#broadcastStateless(payload, filter?)`) — per-doc primitive already in Hocuspocus.

**Server-side bootstrap (required).** Hocuspocus populates `this.documents` lazily — entries are inserted only when a client connects or when the server calls `openDirectConnection()`. A DiskEvent arriving before the first browser connects would have no Document to broadcast on. Therefore on server startup the CC1 broadcaster MUST call `hocuspocus.openDirectConnection('__system__')` to pre-materialize the Document. Persistence + file-watcher + related extensions short-circuit for this docName via a single `isSystemDoc(documentName)` helper (see cross-cutting skip surface below).

**Cross-cutting skip surface (load-bearing).** Introducing a non-file Y.Doc crosses every subsystem that assumes docs are files. All skips MUST be centralized behind one helper `isSystemDoc(documentName)` defined in `packages/server/src/cc1-broadcast.ts`. Every extension that keys off `documentName` calls this helper at its entry point. Audited subsystems:
- `persistence.ts` — `onLoadDocument`, `onStoreDocument`, `afterStoreDocument` return early
- `file-watcher.ts` — `__system__` never appears in the in-memory file index (filename cannot exist on disk for it; defense in depth via ContentFilter)
- `content-filter.ts` — `isSystemDoc` tripwire; rejects user-created `__system__.md` at index admit time and in `POST /api/create-page`
- `reconciliation.ts` — no entry in `reconciledBase` for `__system__`
- `backlink-index.ts` — no index entries for `__system__`
- `agent-sessions.ts` — no agent session state for `__system__`
- `external-change.ts` — skipped at dispatch
- `frontmatter-cache` (inside persistence) — no cache entry for `__system__`
Integration test asserts: after 10 CC1 broadcasts, no entries for `__system__` in any of the above.

**Payload shape (CC1 contract v1 — pure signal).**

```ts
// Every broadcast is a pure signal — an opaque "something changed on this
// channel" notice. No event kind, no path, no docName. The client responds
// by re-fetching the channel's canonical REST endpoint.
type CC1Signal = {
  v: 1;
  ch: string;   // e.g. 'files', 'backlinks', 'graph'
  seq: number;  // per-channel monotonic from server startup
};

// V0-2 emits on 'files' when the file list changes (create|delete|rename).
// V0-3 will emit on 'backlinks' when the backlink index changes.
// V0-11 will emit on 'graph' when graph-derived data changes.
// Every subscriber fetches its channel's REST endpoint to resolve the signal.
```

**Why pure signal (not typed events).** Measured `/api/documents` response: 237 KB uncompressed / **26 KB gzipped for 1,807 files** (this repo itself); ~7-15 KB gzipped for typical vaults. The cost argument against pure signal in the original design assumed 100 KB × 10 clients; the real number is an order of magnitude smaller. Meanwhile, typed events would have forced all three client paths (gap, reconnect, resync) to re-fetch anyway — they'd save a fetch only in the pure-happy-path single-event case, at the cost of per-kind payload schema discipline every future consumer inherits. Pure signal matches CC1 charter text literally (*"signal-then-fetch (not push-the-data)"*) and gives V0-3/V0-11 the smallest possible inheritance surface. If V0-4's optimistic UI ever needs per-event info, we extend to `CC1SignalV2` in a backward-compatible way via the `v` field.

**Sequence discipline.** Under pure signal, `seq` is primarily a debug/observability aid and a duplicate detector — it does not gate re-fetch behavior because every signal causes a re-fetch anyway. Server issues per-channel monotonic `seq` starting at 1 per process lifetime. Client tracks `lastSeq` for logging and for de-duping immediate redelivery. At-most-one re-fetch is in flight per channel (a pending re-fetch cancels redundant ones until it returns). On WebSocket reconnect: re-fetch once unconditionally.

**Event kinds → signal mapping.** Under pure signal, the `ch:'files'` channel fires **only** on DiskEvents that change the file list: `create | delete | rename`. `update` and `conflict` do not change the list so they do not fire `ch:'files'`. V0-3's `ch:'backlinks'` channel will fire from `persistence.ts`'s backlink-index update path — that path naturally triggers on content-update, so V0-3 gets update-equivalent notification on its own channel without `ch:'files'` carrying it. This resolves Design-challenge M4 without `update` on `ch:'files'`: each channel's semantics are owned by its emitter.

**Contract addendum (from challenge Finding 6).** Beyond the payload shape, the CC1 contract v1 also declares:
- **`v` field.** Every payload carries `v: 1` for forward-compat; unknown `v` → skip + log.
- **Channel namespacing.** `ch` is a flat kebab-case string. Reserved prefix `_` for internal / debug channels. Adding a new `ch` value counts as a contract change (D2 signoff required).
- **Malformed-payload policy.** Unknown `ch` or unparseable payload: log at WARN + skip. Never disconnect.
- **Auth.** Today there is no per-channel auth; all subscribers on `__system__` see all channels. Trust boundary is localhost (§6 NFR). If a future channel needs per-doc filtering, it ships its own mechanism — CC1 v1 does not support that.

**Coalescing.** Server-side **100 ms trailing-edge debounce** per channel. Every incoming DiskEvent restarts the timer; when the timer fires (i.e., no events for 100 ms), emit one signal. No threshold, no sentinel, no dual code paths. Works uniformly on macOS FSEvents (kernel-coalesced) and Linux inotify (spread-out bursts) — a 200-file `git checkout` spanning 800 ms produces exactly one signal 100 ms after the last event. Clients re-fetch once.

### Alternatives considered

- **A. Pure signal** (`{v:1, ch, seq}` → client refetches canonical REST endpoint on every signal). **Chosen** after measurement (`evidence/api-documents-size.md`): gzipped `/api/documents` response is 26 KB for 1,807 files — the bandwidth argument against pure signal doesn't hold. Smallest possible inheritance surface for V0-3/V0-11. Matches CC1 charter text literally ("signal-then-fetch").
- **B. Typed event** (payload carries `kind`, `path`, `docName`). Rejected: saves a fetch only in the pure-happy-path single-event case; other three client paths (reconnect, gap, resync) already refetch. Forces per-kind payload schema on every future CC1 consumer. The 100 KB × 10 clients cost estimate that motivated this design was measured and found to be ~4× too conservative. Can be re-adopted via backward-compatible `v: 2` if V0-4 optimistic UI ever needs it.
- **C. Hybrid (typed events + resync sentinel + gap recovery)** — the original D7. Rejected: strictly more complexity than pure signal for measurably-negligible bandwidth savings.
- **3b. Broadcast on every open Y.Doc.** Rejected: fails when sidebar mounts before any content doc is open (cold-load path); O(openDocs × clients) fan-out.
- **3c. Hocuspocus server-wide broadcast primitive.** Rejected for v0: a ~15-line bespoke extension would avoid the `__system__` pseudo-doc entirely, but requires maintaining a Hocuspocus-boundary touch-point. `isSystemDoc()` helper (§9) makes the skip surface mechanical for now. Reopen if CC1 hits ≥5 channels or if the skip helper starts being forgotten in new extensions.
- **SSE on a dedicated endpoint.** Rejected by CC1 constraint NG4 (no new transport).
- **Smarter polling (ETag / `?since=`).** Rejected primarily because CC1 mandates push-over-awareness at the project level (PROJECT.md:991); on pure engineering merits ETag-poll at ~1 s would also meet G1 for the sidebar in isolation, but wouldn't establish the architectural primitive (G2) that V0-3/V0-11/future panels inherit.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Reuse Hocuspocus transport; no new endpoint | T | LOCKED | Yes | CC1 constraint; PROJECT.md:487 | `projects/v0-launch/PROJECT.md:991` | Forces transport-shape decision (D-pending) inside Hocuspocus protocol |
| D2 | This spec defines the CC1 contract; V0-3 and V0-11 consume | X | LOCKED | Yes | PROJECT.md:992, "first one defines" | `projects/v0-launch/PROJECT.md:922` | V0-2 must publish a stable contract artifact |
| D3 | No background polling fallback; only single re-fetch on reconnect | T | DIRECTED | No | PROJECT.md:489 | Seed | Reconnect handler must trigger one /api/documents call |
| D4 | Sidebar UX redesign out of scope | P | LOCKED | No | PROJECT.md RH2:1038 | | NG1 |
| D5 | Optimistic UI for agent writes deferred to V0-4 | P | DIRECTED | No | Predecessor OQ4 | | NG2 |
| D6 | SCR framing keeps dual emphasis (staleness + architectural fragmentation, equal weight) | P | LOCKED | No | Matches PROJECT.md:484 + :38 framing; single-lens alternatives (β/γ/δ/ε) each misrepresent the bet | `projects/v0-launch/PROJECT.md:38,484` | §1 kept as-is; preempts "just ship faster polling" counter-proposals |
| D7 | Contract semantics: **pure signal** — every broadcast is `{v:1, ch, seq}`; client re-fetches channel's canonical REST endpoint on every signal | T/X | LOCKED | Yes | Measured `/api/documents` = 26 KB gzipped on 1,807 files — bandwidth argument for typed events doesn't hold. Matches CC1 charter text literally ("signal-then-fetch"). Smallest possible inheritance surface for V0-3/V0-11. Extensible via `v: 2` if V0-4 ever needs per-event info | Measurement in `evidence/api-documents-size.md`; audit H2 + design challenge H2 | Seq is for dedup + observability, not gating. No sentinel, no typed-event schema, no per-kind branching |
| D8 | Transport: dedicated **`__system__` Y.Doc**. Every client opens it on app mount via `ProviderPool`. Server pre-materializes via `openDirectConnection('__system__')` at startup, then broadcasts via `Document#broadcastStateless()` | T | LOCKED | Yes | Works with sidebar-mounted-before-any-doc-open (Q9); O(clients) fan-out not O(docs × clients); skip surface centralized in single `isSystemDoc()` helper audited across 8 subsystems. Alternative 3c (server-wide primitive) deferred — `isSystemDoc()` makes the leak mechanical | `provider-pool.ts:42-54`; Hocuspocus public API `Document#broadcastStateless`, `Hocuspocus#openDirectConnection` | Every new extension that keys off `documentName` must call `isSystemDoc()` at entry. If forgotten, integration test fails |
| D9 | `ch:'files'` channel fires **only** on DiskEvents that change the file list: `create \| delete \| rename`. `update` and `conflict` do not change the list. V0-3's `ch:'backlinks'` channel fires from backlink-index update path (content-update naturally triggers it there) — so the primitive serves all consumers without `ch:'files'` carrying `update` | T | LOCKED | No | Resolves design-challenge M4: channel semantics owned by emitter, not by shared enumeration. Each channel's canonical refetch endpoint interprets the signal | `file-watcher.ts:33-45`; V0-3 PROJECT.md:332-346 | V0-3 wires its own emission inside `persistence.ts` backlink-index path; contract stays flat |
| D10 | Coalescing: **100 ms trailing-edge debounce** per channel. Any event restarts the timer; emit one signal per quiet period. No threshold, no sentinel | T | LOCKED | No | Works uniformly on macOS FSEvents and Linux inotify. A `git checkout` of 200 files over 800 ms produces exactly one signal. Simpler than tumbling-window + threshold; eliminates the audit H2 / challenge M3 failure mode entirely | Audit H2 + Design-challenge M3; pure-signal D7 removes the need for a sentinel kind | Server keeps one `NodeJS.Timeout` per channel. Tests verify single-signal on burst |
| D11 | Test ownership: V0-2 owns **Layer 1** integration test (disk→broadcast→`onStateless`) **and** one narrow **Layer-2 Playwright** test (`packages/app/tests/stress/cc1-sidebar.e2e.ts`) — agent write → sidebar row appears within p95 <2 s in CI. V0-4 owns the full L2 matrix for file-ops UX | T/P | LOCKED | No | Closes design-challenge M5 regression window: sidebar DOM patch path gains CI coverage from V0-2 day one. ~30 LOC added. V0-4 inherits responsibility only for its added surface (delete/rename context menu, multi-selection, etc.) | CLAUDE.md "Playwright policy"; Tier-1 harness already exists for L1 | V0-2 PR includes one Playwright fixture; not a full matrix |
| D12 | OQ5 (list endpoint scalability) dropped → Future Work → **Noted** | T | LOCKED | No | `handleDocumentList` reads in-memory file index (no filesystem scan); iteration is O(N) but JSON-serialization dominates, ~1-2 ms for 1k files | `packages/server/src/api-extension.ts:425-426,436-456`, `packages/server/src/document-list.test.ts` | Re-open if refetch rate × client count × list size hurts, or vault exceeds ~10k files |
| D13 | `__system__` (and any future `cc1:*` reserved doc) is a reserved docName. `ContentFilter` rejects at admit-time; `POST /api/create-page` returns 400 | T | LOCKED | Yes | Defense-in-depth: `isSystemDoc()` skip is necessary but not sufficient; a user-created `__system__.md` on disk would otherwise collide | §9 cross-cutting skip surface | Naming collision is a 1-way-door — lock before V0-3 adopts the pattern |
| D14 | `__system__` is pinned in ProviderPool — does **not** count toward `maxSize`. Pool eviction skips pinned entries. User content docs retain full 10 slots | T | DIRECTED | No | Avoids surprise eviction cost; cleanest API | `provider-pool.ts:42-55,87-88,233-242` | Add `pinned: boolean` to `PoolEntry`; unit test for eviction-skip |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| ~~Q1~~ | ~~SCR framing accuracy~~ | P | — | — | Resolved → D6 | **Closed 2026-04-13** |
| ~~Q2~~ | ~~Signal vs. typed vs. hybrid~~ | T/X | — | — | Resolved → D7 (hybrid) | **Closed 2026-04-13** |
| ~~Q3~~ | ~~Transport shape~~ | T | — | — | Resolved → D8 (`__system__` Y.Doc) | **Closed 2026-04-13** |
| ~~Q4~~ | ~~Which DiskEvent kinds broadcast~~ | T | — | — | Resolved → D9 (create/delete/rename) | **Closed 2026-04-13** |
| ~~Q5~~ | ~~Coalescing window~~ | T | — | — | Resolved → D10 (100 ms trailing-edge debounce; no sentinel) | **Closed 2026-04-13** |
| ~~Q6~~ | ~~OQ5 list endpoint scalability~~ | T | — | — | Resolved → D12 (dropped → Future Work Noted) | **Closed 2026-04-13** |
| ~~Q7~~ | ~~E2E ownership~~ | P | — | — | Resolved → D11 (L1 V0-2, L2 V0-4) | **Closed 2026-04-13** |
| ~~Q8~~ | ~~Multi-client correctness~~ | T | — | — | Resolved by D8: `broadcastStateless` delivers to every connection exactly once | **Closed 2026-04-13** |
| ~~Q9~~ | ~~No-open-doc behavior~~ | T | — | — | Resolved by D8: `__system__` opens independently of content docs | **Closed 2026-04-13** |

**All open questions closed. Audit + design-challenge complete. 11 findings applied, 5 reopens resolved → D7 pivoted to pure signal, D8/D9/D10/D11 tightened. Ready for finalization.**

### Reopens resolved (post-audit, 2026-04-13)

| ID | Reopen source | Resolution |
|---|---|---|
| R1 | Design H2 — hybrid vs pure signal | **D7 pivoted → pure signal.** Measurement: `/api/documents` = 26 KB gzipped for 1,807 files. Bandwidth argument for hybrid didn't hold. |
| R2 | Design M4 — `update` exclusion | **D9 rewritten.** Channel semantics owned by emitter, not by shared enumeration. V0-3 wires `ch:'backlinks'` from backlink-index update path; `ch:'files'` stays create/delete/rename. Contract stays flat. |
| R3 | Audit H2 + Design M3 — coalesce window | **D10 simplified → 100 ms trailing-edge debounce.** No threshold, no sentinel. Works on macOS + Linux uniformly. |
| R4 | Design H1 — `__system__` leak | **D8 kept (4a).** `isSystemDoc()` helper makes skip mechanical across 8 subsystems. 3c (server-wide primitive) deferred — reopen if CC1 hits ≥5 channels. |
| R5 | Design M5 — V0-2 Playwright | **D11 expanded.** V0-2 owns one narrow Playwright test (~30 LOC); V0-4 inherits full L2 matrix for its added surface. |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | ~~`GET /api/documents` reads from in-memory file index~~ | HIGH | Verified `api-extension.ts:405-426` | — | **Verified 2026-04-13** |
| A2 | ~~Hocuspocus stateless messages carry arbitrary JSON to all connections on a doc~~ | HIGH | Verified Hocuspocus `Document#broadcastStateless` public API | — | **Verified 2026-04-13** |
| A3 | ~~Clients may mount sidebar before any content doc is open~~ | HIGH | Trivially true; killed 3b | — | **Verified — resolved by D8** |
| A4 | ~~ProviderPool can accommodate pinned `__system__` via new `pinned` flag~~ | HIGH | Resolved by D14 (pin does not count toward maxSize) | — | **Verified — resolved by D14** |
| A5 | ~~Persistence/reconciliation/backlink-index/agent-sessions gate on `documentName`~~ | HIGH | All hooks take `documentName`; `isSystemDoc()` short-circuit is O(1) string compare | — | **Verified 2026-04-13 — resolved by D8 cross-cutting skip surface** |
| A6 | ~~100 ms coalescing window sufficient for bursts~~ | HIGH | Resolved by D10 pivot to trailing-edge debounce — works uniformly on macOS FSEvents and Linux inotify regardless of inter-event spacing | — | **Verified — resolved by D10 rework** |

## 13) In Scope (implement now)

- **Goal:** G1, G2, G3.
- **Owner:** Andrew (server push — CC1 broadcaster, `__system__` doc wiring, persistence skip, coalescer, seq assignment, metrics). Dima (client subscriber — `ProviderPool` entry for `__system__`, `onStateless` handler, seq tracker, reconnect handler, tree patcher, 5s interval removal).
- **Contract artifact:** §9 "Payload shape (CC1 contract v1)" is the published contract. V0-3 must submit any proposed shape change as a PR that both Andrew and Mike sign off on before V0-3 merges.
- **Next actions:**
  1. Andrew: implement `packages/server/src/cc1-broadcast.ts` — coalescer + seq + `broadcastStateless` wiring. Wire into `standalone.ts` DiskEvent dispatch.
  2. Andrew: gate persistence extension on `docName === '__system__'`.
  3. Andrew: Layer 1 integration test in existing Tier-1 harness at `packages/app/tests/integration/cc1-broadcast.test.ts` (reuses `createTestServer` / `createTestClient` per `CLAUDE.md` "Tier 1 integration harness"). Asserts: disk write → broadcast → `onStateless` fires within budget; zero `__system__` state in any subsystem after 10 broadcasts; 200-event burst debounces to 1 signal.
  4. Dima: extend `ProviderPool` — add `pinned: boolean` to `PoolEntry`, skip pinned in `evictLru`, exclude pinned from `maxSize` count. Open `__system__` with `pinned=true` from `packages/app/src/main.tsx` at app mount.
  5. Dima: subscribe module (`packages/app/src/cc1/subscribe.ts`) — signal handler, seq dedup, reconnect handler, at-most-one-in-flight re-fetch coalescing per channel.
  6. Dima: remove `setInterval` from `FileSidebar.tsx:144`; trigger `GET /api/documents` on every `ch:'files'` signal.
  7. Andrew: add `isSystemDoc()` helper in `cc1-broadcast.ts`; integrate into all audited subsystems (see §9 cross-cutting skip surface).
  8. Dima: Layer 2 Playwright test at `packages/app/tests/stress/cc1-sidebar.e2e.ts` — agent write → sidebar row appears within CI budget (<2 s).
- **Risks + mitigations:** §14.
- **Instrumentation:** `cc1BroadcastCount`, `cc1SubscriberCount`, `cc1LastSeq`, `cc1BroadcastDrop` in `metrics.ts`; client logs `[CC1] signal received ch=... seq=...` and `[CC1] reconnect refetch`.
- **Acceptance:** Layer 1 integration passes (disk→broadcast→onStateless + skip-surface assertions + debounce-burst assertion); Layer 2 Playwright (`cc1-sidebar.e2e.ts`) passes under CI budget; manual smoke (run `agent-sim.ts --rapid 5`) shows sidebar updates <500 ms p95; `git checkout` between 2 branches with 200+ file delta produces exactly 1 client re-fetch.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Existing connected clients without `__system__` subscription | Client code opens `__system__` on app mount; all users get it on next page load | Smoke after deploy |
| Server older than client (server lacks broadcaster) | Client continues via reconnect fallback fetch; no crash | Staged rollout order: server-first |
| Client older than server (client lacks `__system__` provider) | Server broadcasts; old client simply doesn't subscribe. 5s polling remains until client update | Staged rollout tolerant |
| `__system__` doc shows up unexpectedly in sidebar | Exclude `__system__` from file-index walk and from `ContentFilter` | Assertion in `document-list.test.ts` |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| `__system__` accidentally persisted as `__system__.md` or walked by file-watcher | M | H | Explicit skip in persistence extension + file-watcher + ContentFilter; dedicated assertion in integration test | Andrew |
| Burst events (`git checkout` 200 files) overwhelm clients | M | M | 100 ms trailing-edge debounce per channel — any event restarts timer, emit one signal per quiet period (D10) | Andrew |
| Contract churn between V0-2 and V0-3 forces V0-3 to re-spec | L | H | §9 CC1 contract v1 is the published artifact; Mike reviews before V0-3 merges | Andrew + Mike |
| Server restart mid-session → client seq tracker out of sync | H | L | Server starts seq=1; client treats seq regression as gap → re-fetches. Free via D7 | Andrew |
| `__system__` evicted by LRU when user opens many docs | M | H | Pin `__system__` in ProviderPool (never-evict) | Dima |
| Hocuspocus upgrade changes `broadcastStateless` semantics | L | M | Pin `@hocuspocus/*` to current minor; note in `bun.lock` upgrade protocol | Andrew |
| Layer 1 integration test flakes on CI due to timing windows | M | M | Budget loose bound (e.g., <2 s) in CI; tighter bound (<500 ms) only in local smoke | Andrew |

## 15) Future Work

### Identified

- **V0-3 BacklinksPanel push** — same CC1 primitive; channel `'backlinks'`. Emitted from `persistence.ts`'s backlink-index update path (per V0-3 PROJECT.md:334). Spec lives in V0-3.
- **V0-11 graph panels live updates** — third consumer; channel likely `'graph'` or reuses `'files'` + `'backlinks'` composition.
- **Optimistic sidebar UI on agent writes** — V0-4 file-ops UX (NG2).
- **Layer 2 Playwright E2E** (agent write → sidebar row appears p95 <500 ms) — V0-4 owns (D11).

### Noted

- **`update`/mtime push** — re-open if V0-19 (sort-by-modified) promotes. Would extend §9 CC1 contract with `{kind:'update', ...}` variant.
- **Tag browser live updates** — fourth CC1 consumer if tags ship.
- **List endpoint scalability (OQ5)** — already O(1) in-memory; re-open only if vault exceeds ~10k files.
- **Hocuspocus protocol extension (3c)** — if CC1 grows to many channels with different auth needs, evaluate a server-wide broadcast primitive. Defer until ≥5 consumers.

## 16) Agent constraints

- **SCOPE:**
  - `packages/server/src/cc1-broadcast.ts` (new — coalescer, seq, broadcast, `isSystemDoc` helper, startup bootstrap)
  - `packages/server/src/standalone.ts` (wire DiskEvent → CC1 broadcaster + `openDirectConnection('__system__')` bootstrap)
  - `packages/server/src/persistence.ts` (short-circuit via `isSystemDoc`: onLoadDocument, onStoreDocument, afterStoreDocument, frontmatter cache)
  - `packages/server/src/reconciliation.ts` (skip `__system__` in `reconciledBase`)
  - `packages/server/src/backlink-index.ts` (skip indexing `__system__`)
  - `packages/server/src/agent-sessions.ts` (skip agent session for `__system__`)
  - `packages/server/src/external-change.ts` (skip at dispatch)
  - `packages/server/src/file-watcher.ts` (defense in depth — refuse `__system__` entry to index)
  - `packages/server/src/content-filter.ts` (reject `__system__.md`; reserved-name policy)
  - `packages/server/src/api-extension.ts` (`POST /api/create-page` returns 400 on `__system__`)
  - `packages/server/src/metrics.ts` (add CC1 counters: broadcast, subscriber, lastSeq, drop)
  - `packages/app/tests/integration/cc1-broadcast.test.ts` (new — Layer 1 in existing Tier-1 harness)
  - `packages/app/src/cc1/subscribe.ts` (new — seq tracker, reconnect, channel router)
  - `packages/app/src/editor/provider-pool.ts` (add `pinned: boolean`; skip pinned in eviction + maxSize count)
  - `packages/app/src/main.tsx` (open `__system__` with `pinned=true` at app mount)
  - `packages/app/src/components/FileSidebar.tsx` (remove 5s poll, subscribe to CC1, filter `__system__` defensively)
- **EXCLUDE:**
  - `packages/app/src/components/BacklinksPanel.tsx` (V0-3 consumes; no changes here)
  - Sidebar UX — sort, drag-drop, collapse persistence (NG1)
  - Persistence / reconciliation flow beyond the `__system__` skip
  - `packages/core` markdown pipeline (irrelevant)
  - `packages/app/src/editor/TiptapEditor.tsx`, `packages/app/src/editor/observers.ts` (unrelated)
  - `packages/cli/`, `docs/` (unrelated)
- **STOP_IF:**
  - Any change to §9 "Payload shape (CC1 contract v1)" after V0-3 implementation begins → require Andrew + Mike approval
  - A new WebSocket endpoint is needed (violates D1/NG4)
  - `DiskEvent` taxonomy needs to change
  - `__system__` doc needs to persist to disk
  - Layer 1 integration test cannot converge below 2 s p95 in CI
- **ASK_FIRST:**
  - Adding a new server-side or client-side dependency
  - Changing `broadcastStateless` to a custom Hocuspocus protocol extension
  - Emitting CC1 broadcasts from anywhere other than the file-watcher DiskEvent path (e.g., agent-write direct broadcast)
  - Changing the `ch` namespace strings (`'files'`, future `'backlinks'`, `'graph'`)
