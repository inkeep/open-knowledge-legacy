---
title: Agent Identity & Attribution — Consolidated Worldmodel
description: Topology map of how AI agent identity is derived, propagated, and attributed across MCP, CRDT, and shadow repo — inventory of existing system + prior explorations + open questions as pre-spec input.
tags: [worldmodel, agent-identity, attribution, mcp, crdt, shadow-repo, pre-spec]
---

# Agent Identity & Attribution — Consolidated Worldmodel

**Status:** Worldmodel (non-prescriptive, pre-spec).
**Baseline:** `main` @ `18dccfde` (2026-04-18).
**Purpose:** Collate what exists, what's been considered, and what's unresolved so a fresh spec process can frame the decisions cleanly without re-deriving prior context.

Every PR / spec / story referenced below is prior exploration — not the chosen direction. This document is scoped to observation, not evaluation or recommendation.

---

## 1) Topic scope

**The problem:** when multiple AI agents — possibly of different types, possibly multiple of the same type, possibly spanning multiple projects — co-edit markdown through MCP alongside humans, how does the system identify each agent, attribute their actions, and expose that attribution to UX surfaces and version control?

Sub-questions that recur across prior work:

- What counts as one agent (process? connection? conversation? type?)
- What state persists across subprocess restarts vs what's ephemeral?
- How is identity represented in CRDT transactions, in awareness, in git?
- How does identity interact with undo stacks, presence, timeline, and historical attribution?
- What's cross-project vs per-project?

---

## 2) Existing system (code-verified)

### 2.1 Identity shape

`packages/cli/src/mcp/agent-identity.ts:9-20` —

```ts
interface AgentIdentity {
  connectionId: string;              // UUID, generated per MCP process
  clientInfo?: { name, version };    // from MCP initialize handshake
  label?: string;                    // from env AGENT_LABEL in .mcp.json
  displayName: string;               // label ?? clientInfo.name ?? "Agent"
  colorSeed: string;                 // label ?? clientInfo.name ?? connectionId
}
```

- `connectionId = randomUUID()` at subprocess start — `packages/cli/src/mcp/server.ts:290`
- `clientInfo` from `server.server.getClientVersion()` on `oninitialized` — `server.ts:302-303`
- `label` sourced from `AGENT_LABEL` env (settable in `.mcp.json`)
- `identityRef` is a singleton for the subprocess; tool handlers read `.current` at call time

### 2.2 Process topology

- **Hocuspocus server: exactly one per `contentDir`** — enforced by `server.lock` (`packages/server/src/server-lock.ts:35-49`).
- **MCP subprocess: N per project** — one spawned per MCP client (Claude Code, Cursor, Codex, …). Each gets its own `connectionId`.
- **Auto-spawn**: first MCP subprocess to find no live lock detach-spawns `ok start` as a sibling (`mcp.ts:decideAutoStart`). Subsequent MCP subprocesses on the same project find the live lock and connect.
- **Vite dev server embeds Hocuspocus** and participates in the same `server.lock` — `bun run dev` and `ok start` are mutually exclusive per `contentDir`.
- **Keepalive WS** per MCP subprocess holds `/collab/keepalive` open (`server.ts:333-349`). Its drop is how the server learns the agent exited.
- **docs site** (`cd docs && bun run dev`) is a separate Next.js process — not part of the identity system.

### 2.3 Identity propagation chain

```
MCP handshake (clientInfo)
  ↓
mcp/server.ts identityRef (singleton per subprocess)
  ↓
Tool call HTTP body { agentId: connectionId, clientName, agentName, colorSeed }
  ↓
api-extension.ts extractAgentIdentity
  ↓
AgentSessionManager.getSession(docName, agentId)  — keyed by (docName, agentId)
  ↓
awareness.setLocalState({ user: { name, color, type: 'agent', icon, tabId: 'agent-<connectionId>' } })
  ↓
dc.document.transact(fn, AGENT_WRITE_ORIGIN)      — origin is SHARED across all agents
  ↓
activity Y.Map + contributor-tracker updated at same call site
  ↓
(L2 debounce) persistence.ts commitWip(shadow, defaultWriter='server', ...)
  ↓
Shadow commit: fixed author, per-agent ok-contributors: JSON-lines in body
```

### 2.4 Attribution surfaces (all simultaneously active)

| Surface | File | Keyed by | Scope/TTL | Consumer |
|---|---|---|---|---|
| Awareness | `agent-sessions.ts:202-211` | `tabId: agent-<connectionId>` | Session | PresenceBar avatars |
| `Y.Map('activity')` | `core/constants/activity.ts:14` | `agentId` | 30s TTL | Editor flash CSS, TimelinePanel |
| `AgentFocus` on `__system__` | `agent-focus.ts`, `awareness.ts:32-41` | `agentId` | 5s staleness | Push-nav ("jump to what agent just wrote") |
| Contributor tracker | `contributor-tracker.ts` | `agentId` | Per-commit, drained on commit | `ok-contributors:` JSON in commit body |
| Shadow commit author | `persistence.ts:191` | **NOT keyed** (auto-save) / `agent-<connectionId>` (save-version) | Permanent | Git log, timeline-query |
| Shadow WIP ref | `refs/wip/<branch>/<writer.id>` | `'server'` (auto-save) / `agent-<connectionId>` (save-version) | Persistent (GC grace period) | shadow-branch-gc, rollback |
| CRDT transaction origin | `agent-sessions.ts:57-61` | **NOT per-agent** — shared `AGENT_WRITE_ORIGIN` constant | Per-transaction | Observer guards (undo scoping not yet wired) |

### 2.5 Icon / color mapping

`iconFromClientName` (`agent-sessions.ts:63-76`):

- `claude-code`, `claude-ai` → `claude`
- `cursor`, `cursor-vscode` → `cursor`
- `cascade` → `windsurf`
- `codex` → `openai`
- `copilot` → `github`
- `cline` → `cline`
- fallback → `bot`

`AGENT_ICON_COLORS` keyed by icon (`core/utils/identity.ts:16-24`) — fixed per-agent-type brand color.

### 2.6 Granularity summary

Identity is **per MCP subprocess** — per-process, not per-operation / per-conversation / per-agent-type.

| Scenario | Agent identities | Hocuspocus servers | Aggregation |
|---|---|---|---|
| 1 Claude Code, 1 project | 1 | 1 (auto-spawned) | — |
| 2 Claude Codes, 1 project | **2 distinct UUIDs**, both icon=`claude` | 1 (shared via server.lock) | Yes — aggregated on the Hocuspocus |
| Claude Code + Cursor, 1 project | 2, different icons/colors | 1 | Yes |
| 1 Claude Code, 2 projects (multi-root) | **1** (same connectionId) | 2 (one per contentDir) | **No** — each server sees the identity independently |
| 2 Claude Codes, 2 projects (one per) | 2 | 2 | No — isolated universes |
| MCP with `OK_MCP_AUTOSTART=0`, no server | 1 (identityRef exists) | 0 — disk-only mode | No awareness, no activity, no CRDT |

### 2.7 Restart semantics

- **Hocuspocus restart**: in-memory state (sessions, awareness, activity Y.Map, pending contributors) lost. Shadow repo on disk survives. MCP subprocesses keep `identityRef`; next write re-seeds server state under the same `connectionId`.
- **MCP subprocess restart**: new `connectionId` (fresh UUID). Old keepalive drops; new identity appears as a distinct agent. No on-disk identity registry to restore from.

---

## 3) User stories / scenarios

### 3.1 From `stories/collaboration-capabilities-audit/STORY.md` §14

- **US-3a–e**: Human Cmd+Z works in WYSIWYG, Source, and across mode switches, and does NOT undo agent content.
- **US-4a–c**: "Undo Claude's edit" as a distinct, multi-agent-safe operation. `AgentIdentity.connectionId` is the scoping key.
- **US-5a**: Presence avatars render multi-agent correctly (multiple Claudes ≠ one Claude avatar).
- **US-5d**: Agent-write flash animations per-agent.
- **US-5e–f**: File-level presence and agent-pass summary per file (partial / parked).
- **US-2a**: Cross-doc activity feed — what are all agents doing right now across the project.

### 3.2 From `specs/2026-04-10-undo-architecture/SPEC.md`

- **P1 (Human editor)**: expects Cmd+Z to feel like every other editor.
- **P2 (AI agent via MCP/API)**: needs to self-correct own writes without user intervention.
- **P3 (CRDT developer)**: needs clear architecture to avoid rebuilding the broken scaffold.
- **P4 (Product engineer)**: needs reactive undo state, not polling.

### 3.3 Scenarios that have surfaced in code / conversation

- **Scenario A** — Two Claude Codes on one project. Distinct connectionIds → distinct awareness. Any UX that dedups by colorSeed collapses them visually.
- **Scenario B** — Claude Code + Cursor on one project. Different icons/colors.
- **Scenario C** — One Claude Code, multiple project roots via MCP `roots/list`. Same `connectionId` participates in N Hocuspocus servers. No cross-project aggregator.
- **Scenario D** — MCP subprocess restart → fresh `connectionId`. Server sees new agent.
- **Scenario E** — Hocuspocus restart while MCP subprocess still alive → in-memory identity state lost; subprocess keeps `connectionId`; next write re-seeds.
- **Scenario F** — Burst of agent writes within one L2 debounce → single shadow commit with multi-agent `ok-contributors:` lines, fixed author.
- **Scenario G** — User saves a version while agent mid-write → save-version writes under per-agent ref `refs/wip/<branch>/agent-<connectionId>`.
- **Scenario H (not yet served)** — "Undo Claude's last edit but not Cursor's last edit" — V0-14 territory.
- **Scenario I (not yet served)** — Historical cross-agent activity feed at checkpoint T — would require parsing `ok-contributors:` bodies.

---

## 4) Options considered (prior explorations)

### 4.1 Origin model for agent writes

From `specs/2026-04-10-undo-architecture/SPEC.md` §10 D1 and STORY §14 D12:

- **Option A (rejected)** — Single shared UndoManager spanning Y.XmlFragment and Y.Text. Observer sync transactions pollute tracking.
- **Option B (recommended in SPEC, extended in STORY §14)** — Per-editor UMs for users (WYSIWYG UM on XmlFragment, Source UM on Y.Text) + **N server-side Agent UMs** keyed by `AgentIdentity.connectionId`.
- **Option C (rejected)** — No agent undo; rely on Cmd+Z only. Rejected because MCP tool-surface value + P2 self-correct use case.

**Per-agent scoping mechanism is open** in the SPEC. Three sub-options, none committed:

- **(a) N distinct origin object-refs** — each agent-session literal carries its own frozen `{..., context: { origin: 'agent-write', paired: true, agentId: connectionId }}`. Each Agent UM's `trackedOrigins` is a Set containing just that one ref. Matches precedent #1's identity-based Set.has.
- **(b) Predicate-based `trackedOrigins`** — Y.UndoManager supports a filter function; filter by `origin.context.agentId === thisAgentConnectionId`. Breaks from the pure-identity precedent #1 style.
- **(c) Shared ref + UM-external filter** — one `AGENT_WRITE_ORIGIN`, per-agent UM wraps a filter layer. Probably worst: adds a custom layer between UM and Y.Doc.

### 4.2 Attribution-tracker topology

- **Current** — two trackers (activity Y.Map + contributor-tracker) at same write call sites, different lifetimes/consumers.
- **PR #186 proposes** — add a third (live-attribution module, server-lifetime, in-memory singleton, consumed by `/api/link-graph` enrichment for halo UX). Explicitly non-consolidation; file header justifies this as "orthogonal UX needs."
- **Not explored yet** — unify the three under one "agent activity log" with per-consumer views/filters. Would cut duplication at all three write-path call sites.

### 4.3 Commit-body attribution format

- **Current** — `ok-contributors: {"v":1,"id":"agent-X","name":"Claude","colorSeed":"...","docs":[...]}` JSON lines, one per agent in the batch. Fixed author.
- **Alternative explored in web landscape research** — `Co-Authored-By: Claude <noreply@...>` trailer (GitHub-parsed, shows in PR UI).
- **Alternative possible** — per-agent WIP refs for auto-save (already used by save-version). Would fan out refs per agent-connection rather than funnel through `writer.id='server'`.

### 4.4 MCP routing / multi-project

- **Current** — startupCwd fallback if no root specified (silent).
- **PR #207 proposes** — explicit tool `cwd` > exactly one advertised root > fail with named error. Caches `roots/list`, invalidates on `roots/list_changed`. Per-cwd server discovery + auto-spawn.
- **Alternative** — one MCP subprocess = one project (spawn N subprocesses for N projects). Would simplify identity-to-server mapping (1:1) at cost of subprocess count.

### 4.5 Dev-mode MCP config

- **PR #191 proposes** — rewrite `.mcp.json` / `~/.cursor/mcp.json` / `.cursor/mcp.json` to point at local worktree `cli.ts`. Hardcodes `--port 5173`.
- **Alternative explored and rejected in PR #191** — a `--dev` flag on `ok start` that spawns Vite itself. Rejected in favor of Vite-plugin-as-server pattern.

### 4.6 Pass-boundary model

From STORY §14 D9. The undo SPEC flagged "what counts as one pass / one burst" as central for both undo and timeline grouping.

- **Conversation-bounded** — fails because no MCP harness has turn signals in its client.
- **Session-id-param on write tools** — rejected; contract breaks on day one across harnesses.
- **Product-native user-action-bounded grouping** — contiguous `'agent-write'`-origin WIP commits between user edits, grouped by `AgentIdentity.connectionId`. Decided direction in STORY §14, but implementation isn't done.
- **Optional enrichment** (TQ16) — `session_id?`, `parent_session_id?`, `agent_label?` as optional write-tool params. Clients with turn semantics pass them; others rely on product-native grouping.

### 4.7 Identity attestation

- **Current** — none. MCP `clientInfo.name` is self-reported. A malicious client could claim any name.
- **Industry landscape** — no MCP protocol layer for identity attestation today.
- No prior in-repo exploration beyond noting the gap.

### 4.8 The three in-flight PRs

| PR | Relevance to identity/attribution |
|---|---|
| **#186** (graph demo S6+S7) | **Direct consumer.** Adds live-attribution server module + graph halo UX keyed by `agentId`. Reads time-travel attribution from existing `ok-contributors:` commit bodies. |
| **#191** (`bun dev` MCP auto-config) | **Tangential.** Changes WHERE the MCP subprocess binary lives (local worktree vs npm). Zero identity-semantics change. |
| **#207** (strict MCP routing) | **Reinforces a V0-14 prerequisite.** Makes "one subprocess, N projects, same `connectionId`" load-bearing and explicit. Replaces silent startupCwd fallback with named-error contract. |

None of the three IS V0-14 or frozen policy; all operate on the same broader theme from adjacent angles.

---

## 5) V0-14 framing (per-agent undo)

V0-14 is the **payoff** of the identity work — it converts per-agent identity from an observability concern to a state-machine concern (undo stacks). Owned by Miles (per `progress/v0-launch-audit-2026-04-14/per-owner/miles.md`).

### 5.1 What it proposes (per SPEC + STORY §14)

Three UndoManagers (SPEC §9 D1):

1. **WYSIWYG UM** — client, Y.XmlFragment, tracks `ySyncPluginKey` (TipTap's `yUndoPlugin`).
2. **Source UM** — client, Y.Text, tracks local origin (y-codemirror native).
3. **Agent UM(s)** — server, Y.Text, tracks `'agent-write'` origin.

STORY §14 extends (3) to **N server-side Agent UMs** keyed by `AgentIdentity.connectionId` (D12/TQ18) — "undo Claude's last edit" becomes a different stack from "undo Cursor's last edit."

### 5.2 Dependency chain

```
TQ13 scaffold removal      ──┐
  (shipped V0-16 / PR #39)   │
                             │
TQ17 AgentIdentity          ─┼── V0-14 unblocked 2026-04-14
  from MCP primitives        │
  (shipped PR #134)          │
                             │
TQ18 remove DEFAULT_AGENT_ID ─┘   (partial — agent-sessions.ts still defaults to 'claude-1')
```

Observer A char-level diff work (Nick's TQ5/TQ6) was originally a V0-14 prerequisite; a 2026-04-13 decoupling (commit `5194320`) removed the dependency so V0-14 could start independently.

### 5.3 STOP rules for V0-14 (from `AGENTS.md:731-740`)

V0-14's `applyAgentUndo` handler MUST simultaneously:

1. Use XmlFragment-authoritative composition (precedent #10, #12).
2. Fire under a new `LocalTransactionOrigin` object-ref (e.g. `AGENT_UNDO_ORIGIN`) distinct from `OBSERVER_SYNC_ORIGIN` and `AGENT_WRITE_ORIGIN`.
3. Extend the FR-17 fuzzer op set — D18 coverage gate enforces.
4. NOT re-add client-side cross-CRDT write paths (Mutation G).
5. Depend on the event-loop serialization guarantee (synchronous `doc.transact()`).
6. Unskip `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts`.

Notably absent: whether per-agent scoping uses N object-refs, a predicate, or a filter layer. That's a design decision left to the V0-14 implementer.

### 5.4 Gap V0-14 closes in the attribution surface table

| Surface | Today | After V0-14 |
|---|---|---|
| Awareness | Multi-agent correct | unchanged |
| Activity Y.Map | Multi-agent correct | unchanged |
| CRDT transaction origin | **Shared `AGENT_WRITE_ORIGIN`** (not per-agent) | Additional `AGENT_UNDO_ORIGIN`; per-agent UM has its own `trackedOrigins` keyed by `connectionId` (mechanism TBD) |
| AgentFocus | Multi-agent correct | unchanged |
| Contributor tracker | Multi-agent correct | unchanged |
| `ok-contributors:` body | Multi-agent correct | unchanged |
| Live-attribution (PR #186) | Dedups same-type agents by colorSeed | unchanged (UX choice) |
| **Undo stack** | **Does not exist** (V0-16 removed scaffold) | **Per-agent, keyed by `connectionId`** |

---

## 6) Open questions / tensions

Seams between prior explorations where a future spec likely has to pick a side.

### 6.1 UI dedup granularity vs state-model granularity

PR #186's graph legend dedups by `colorSeed` (two Claude Codes → one pill). V0-14's per-agent UMs must NOT collapse (each has its own stack). Compatible but represent divergent UX contracts — other surfaces (presence bar, timeline, activity feed) haven't had the same decision made explicitly.

### 6.2 Per-agent vs shared shadow auto-save writer

Auto-save funnels all agents through `writer.id='server'`, with per-agent data in the message body. Save-version uses `agent-<connectionId>` refs. Asymmetry is intentional or temporary? Affects shadow-branch-gc (more refs = more cleanup), historical queries (parse commit body vs walk per-agent ref), multi-agent concurrent auto-save semantics.

### 6.3 Origin-ref mechanism for per-agent scoping

See §4.1 (a/b/c). Not committed. Choice affects precedent #1 (typed object-refs), V0-14 STOP rules, fuzzer op set shape.

### 6.4 Cross-project identity aggregation

Scenario C (one subprocess, N projects) creates cross-project identity that no server knows about. Product gap ("show me everything Claude is doing across my projects") or deliberate scoping? No prior exploration.

### 6.5 Three-tracker consolidation

PR #186 adds a third attribution tracker at the same write call sites. Is three the right number, or does this warrant unifying? Trade-off: duplication today vs coupling tomorrow.

### 6.6 Pass-boundary definition

STORY §14 D9 picks "product-native user-action-bounded grouping" but implementation isn't there. Open: where exactly is the grouper computed (persistence? activity-map consumer? timeline-query?), and what's the output shape.

### 6.7 Identity reset semantics

Subprocess restart → new `connectionId`. Right UX? If a user relaunches Claude Code mid-task, is it a "new agent" or "same agent, fresh session"? `AGENT_LABEL` env can stabilize identity across restarts but isn't the default.

---

## 7) Invariants / constraints (any future spec must satisfy)

From precedents in `AGENTS.md` and SPEC-LOCKED decisions:

- **Precedent #1** — Typed `LocalTransactionOrigin` objects, never strings. Identity-based matching via Set.has / ref equality.
- **Precedent #8** — Long-lived identity (from MCP primitives) vs short-lived session concerns (from edit history). Do not conflate.
- **Precedent #10** — XmlFragment-authoritative agent writes. No rebuild-from-Y.Text.
- **Precedent #14** — Cross-CRDT sync is single-writer, server-side. No client-side cross-CRDT write paths.
- **Undo SPEC D2 LOCKED** — Keep `AGENT_WRITE_ORIGIN` and origin tracking. Load-bearing for observer guards + agent undo isolation + activity attribution.
- **Undo SPEC D5 LOCKED** — Remove broken scaffold before implementing (done in V0-16 / PR #39).
- **AGENTS.md V0-14 STOP (6 clauses)** — see §5.3.
- **Precedent #7** — Remove broken capabilities rather than shipping them. Confidently-broken UI > absence.

---

## 8) Research references already in-repo

Prior artifacts that would inform the next spec's "we already studied X" sections:

| Path | Relevance |
|---|---|
| `specs/2026-04-10-undo-architecture/SPEC.md` | Three-UndoManager architecture, D1 per-editor vs shared, R5–R8 root causes |
| `specs/2026-04-14-mcp-agent-attribution/` | The 8 hardcoded identity points + threading work (PR #134) |
| `specs/2026-04-14-agent-nav-and-cadence/` | AgentFocus, push-nav, cross-doc behavior |
| `specs/2026-04-07-agent-markdown-writes/` | Original agent-write path |
| `specs/2026-04-16-graph-demo-iteration-loop/SPEC.md` | Stage 6 (live attribution) + Stage 7 (time-travel) |
| `stories/collaboration-capabilities-audit/STORY.md` §14 | AgentIdentity contract, three-UM architecture, D9/D12/TQ17/TQ18 |
| `reports/mcp-agent-attribution-implementation/REPORT.md` | Cross-harness `clientInfo.name` table, threading pipeline |
| `reports/crdt-mcp-filesystem-bridge/` | DirectConnection-per-agent prior art |
| `reports/git-directory-nesting-shadow-repo/` | `refs/wip/<branch>/<writer-id>` namespace supports per-agent |

---

## 9) Candidate spec-worthy framings

If a fresh spec starts, the prior work suggests it could scope any of these axes (or a combo) — all currently un-frozen:

1. **Per-agent origin mechanism + Agent UM implementation** (V0-14 territory; prior SPEC is Draft status with Q1–Q4 open)
2. **Pass-boundary model** (STORY §14 D9 direction but no implementation spec)
3. **Unified vs fanned attribution surfaces** (consolidate the 3+ trackers or formalize their separateness)
4. **Auto-save writer topology** (single `'server'` writer vs per-agent refs)
5. **Multi-project identity UX** (whether cross-project aggregation is a product goal)
6. **Identity attestation / trust boundary** (if MCP clientInfo lies, what breaks)

Not recommending any — these are the axes where prior work stops short of a frozen answer.

---

## 10) Landscape observations (3P context)

From web + OSS scan (non-prescriptive):

- **MCP protocol** exposes `clientInfo: { name, version }` on `initialize`; stdio transport has no native sessionId (subprocess IS the session). HTTP/SSE has `Mcp-Session-Id` header.
- **Y.js** has a two-layer model: structural `clientID` per Y.Doc (32-bit random, ephemeral) vs awareness payload (application-defined). Not conflatable.
- **Hocuspocus** lifecycle hooks carry a generic `context` where extensions stash per-connection identity on the WS path. Open Knowledge's HTTP `/api/agent-*` path doesn't use this today.
- **Git `Co-Authored-By:` trailer** is the de facto standard for AI-commit attribution, but per-agent-type (Claude as one entity), not per-process. Divergent tool behaviors: Claude Code auto-adds, Copilot doesn't, Cursor does but community complaints about consent.
- **No industry convention surfaced** for (a) per-process vs per-agent-type granularity, (b) agent/human distinction in awareness payload, (c) identity chain unifying MCP + awareness + git.

---

## 11) Meta — how this worldmodel was built

- **Codebase channel** — `Explore` subagent + direct reads of `agent-sessions.ts`, `awareness.ts`, `identity.ts`, `activity.ts`, `server-lock.ts`, `mcp/server.ts`, `mcp/tools/*.ts`.
- **Web channel** — 3 parallel probes on MCP client identity, Y.js awareness agent-attribution, git AI commit attribution.
- **Reports channel** — `reports/CATALOGUE.md` scan + top-3 matches read.
- **OSS channel** — `~/.claude/oss-repos/` scan of `hocuspocus`, `yjs`, `y-prosemirror`, `y-tiptap`, `claude-code`, `claude-agent-sdk`, `codex`, `mcp-client-gen`.
- **PR-as-exploration channel** — PRs #186, #191, #207 fetched via `gh api` from head branches, not treated as direction.
- **Spec/story channel** — `specs/2026-04-10-undo-architecture/`, `stories/collaboration-capabilities-audit/STORY.md` §14, `progress/v0-launch-audit-2026-04-14/`.

Non-prescriptive throughout per the worldmodel skill's stance: topology mapping, not evaluation. Consumer builds their own analytical framework from this.

---

## 12) Deep verification addendum (2026-04-18)

Three parallel Opus-model Explore passes re-read the shadow/persistence stack, the observer/origin system, and the MCP/identity bindings against main @ `18dccfde` and the open-PR branches. This section catalogs findings that were NOT in §1–§11 — mostly edge cases, residue, and attribution gaps that only surface when tracing every call site.

### 12.1 Shadow repo / persistence / attribution

- **`commitWip` tmp index is NOT UUID-isolated** — `shadow-repo.ts:133` uses `resolve(shadow.gitDir, 'index-wip-${writer.id}')`. Two concurrent `commitWip(shadow, {id:'server'}, ...)` calls would corrupt the shared `index-wip-server` file. Protected only by the single-flight `commitInFlight` gate in `persistence.ts:290-301`. By contrast, `saveInMemoryCheckpoint` uses a UUID-suffixed tmp (`shadow-repo.ts:328`). If per-agent auto-save writers are ever introduced, this isolation needs extending.
- **Committer is hardcoded `openknowledge`** even when `writer.name` / `writer.email` vary (`shadow-repo.ts:186-189`). Git-log filtering by committer always returns `openknowledge` regardless of author. Timeline queries filtering by "agent name" work only against the author field (which itself is `openknowledge-server` for auto-save — i.e., agent name is NEVER in author or committer for L2 commits; only in `ok-contributors:` body).
- **Branch park collapses per-agent state to `human-server`**. `standalone.ts:1044` calls `parkBranch(shadow, currentBranch, 'server', docs)`; `shadow-repo.ts:722` constructs `refs/wip/${branch}/human-${sessionId}` → `human-server`, classified as `'human'` by `parseWriterId`. On a branch switch, all open docs' in-memory state is parked under one `human-server` ref — per-agent identity is lost.
- **`parkBranch` blob uses a SHARED tmp file** `tmp-park-blob` (`shadow-repo.ts:724`), no UUID suffix. Protected only by the batch state machine in `head-watcher.ts`.
- **Contributor tracker state survives cross-branch switches**. `pendingContributors` is NOT swapped/cleared at `BatchBegin`. If `flushPendingGitCommit` at `standalone.ts:1029` drained them, contributors attribute to pre-batch branch. A contributor recorded between `flushPendingGitCommit` return and `setBatchInProgress(true)` ends up on the NEW branch's next commit.
- **Checkpoint commits hardcode `GIT_AUTHOR_NAME='openknowledge'`** (`shadow-repo.ts:915-919`) even when `writers[]` was passed. `writers[]` only drive ref deletion (lines 929-935). Per-agent identity is absent from the checkpoint commit author/committer; only trace is which writer's prior WIP ref got deleted.
- **Rollback produces zero agent metadata**. `safetyCheckpoint` uses `SAFETY_WRITER = {id:'openknowledge-server'}` (`shadow-repo.ts:254-258`); post-rollback L2 commit uses `defaultWriter.id='server'`. Body is `safety-checkpoint: pre-rollback` — no `ok-contributors:`. Rollbacks are invisible to per-agent attribution queries.
- **Managed-rename & rollback do NOT call `recordContributor`**. Only the three explicit agent-write endpoints (`api-extension.ts:1097`, `:1182`, `:1715`) record. `handleRename` (line 878 uses `MANAGED_RENAME_ORIGIN`) and `handleRollback` (line 2222-2237 uses `ROLLBACK_ORIGIN`) produce commits with no body-level attribution. Agent-initiated renames/rollbacks are anonymous on the timeline.
- **`recordContributor` is called OUTSIDE the `transact` block** (`api-extension.ts:1086-1097`). A structurally-possible race where `onStoreDocument` fires between `transact` return and `recordContributor` call would mis-attribute the commit. Hocuspocus's debounce makes the race narrow but real.
- **`colorSeed` defaults to `displayName` in contributor-tracker** (`contributor-tracker.ts:34`: `colorSeed: colorSeed ?? displayName`). If an agent sends only `agentName`, UI color derives from displayName — changes if the agent renames itself across sessions.
- **L2 debounce default is 15s, not 30s**. `persistence.ts:164`: `commitDebounceMs ?? 15_000`. File header comment still says "30s" — stale docstring.
- **Cross-doc batching is default behavior**. `persistence.ts:284-302` uses a single module-level `gitCommitTimer`. One commit covers all docs in the debounce window, with ALL contributors in the body. Timeline views per-doc filter via pathspec, but a multi-doc commit appears in every touched doc's view with the FULL contributors list — UI must intersect `docs: []` within each `ok-contributors:` line to disambiguate.
- **GC cannot target per-agent refs on a live branch**. `shadow-branch-gc.ts:168-234` operates at branch-prefix granularity with a 24h grace period; if ANY ref under a branch is younger than 24h, the entire branch is retained. A leaked `refs/wip/main/agent-<connectionId>` (from a transient MCP session that ran `save_version` once and exited) persists indefinitely as long as `refs/heads/main` exists. No per-writer TTL.
- **Contributor snapshot is restored on commit failure via union semantics** — `contributor-tracker.ts:57-71` `restoreContributors` merges pre-commit snapshot back with current map using `live.docs.add(doc)`. Never drops — at worst delays one L2 cycle.

### 12.2 Observer architecture / origin system

- **Seven origin literals exist, not four.** The two client origins (`ORIGIN_TREE_TO_TEXT`, `ORIGIN_TEXT_TO_TREE` in `packages/app/src/editor/observers.ts:54-68`) are **zombie constants** — their callback bodies are empty (`observers.ts:134-166`, "Intentionally empty under server-authoritative bridge"). They're retained only for identity-stable membership in `BRIDGE_ENFORCING_ORIGINS` (`test-harness.ts:572-580`). Enforcing set has all seven.
- **`OBSERVER_SYNC_ORIGIN` is NOT paired** — lacks `context.paired: true` (`server-observers.ts:67-71`). Uses `===` object-identity compare at `server-observers.ts:423, 621`, not `isPairedWriteOrigin`. It's the only origin that uses identity-compare in the observer gates.
- **`isPairedWriteOrigin` is structural-only** (`server-observers.ts:124-128`): `ctx?.paired === true`. No identity-based whitelist. A remote transaction whose origin deserializes to `{context:{paired:true}}` triggers the paired-write fast path. `PairedWriteOrigin` type brand is compile-only; runtime has no defense. Documented on line 85-88 as intentional (Yjs reconstructs origin from wire).
- **Zero per-agent decoration anywhere in origin objects**. Every `AGENT_WRITE_ORIGIN` transact passes the same frozen `as const` reference (`api-extension.ts:1096, 1181, 1714`). Identity flows via side-channels only: `activityMap.set(agentId, …)` inside the transact, `agentFocusBroadcaster.setFocus()` post-transact, `recordContributor(agentId, …)` after.
- **No server-side UndoManager exists anywhere in production code** — grep `new Y.UndoManager` / `new UndoManager` returns zero hits across `packages/server/src/`. All instances are in tests. V0-16 TQ13 scaffold removal was thorough.
- **No `/api/agent-undo*` routes on the server** (zero matches in `packages/server/src/`), BUT dangling callers exist: `mcp/server.ts:154` uses `/api/agent-undo-status` as Hocuspocus liveness probe (now 404s); `mcp/tools.ts:228, :244` still register `undo_agent_edit` / `redo_agent_edit` MCP tools that POST to missing routes; `agent-sim.ts:120` and `stress-api.ts:57, :66, :243` + `test-harness.ts:465, :475` have residue. TQ13 cleanup incomplete at package boundaries.
- **WYSIWYG UM is implicit via `@tiptap/extension-collaboration`** (`TiptapEditor.tsx:145-147`): `Collaboration.configure({ document: provider.document })`. No explicit `yUndoPlugin` or `history: false` StarterKit override — the extension v3 internally instantiates `Y.UndoManager` on XmlFragment via `ySyncPlugin`. Not configurable externally.
- **Source UM is implicit via `y-codemirror.next` `yCollab`** (`SourceEditor.tsx:31, 89`): `yCollab(ytext, provider.awareness)`. Bundles its own `Y.UndoManager` over ytext.
- **V0-14 skip-guarded test uses STRING origin `'agent-write'`**, not the object ref (`bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts:172, 187`). Per precedent #1 this would silently fail to match in production where origins are object refs. Unskip must also migrate string → object.
- **Fuzzer `ALL_OP_KINDS` has 9 ops** (`bridge-convergence.fuzz.test.ts:449-459`): `wysiwyg-type`, `source-type`, `agent-write`, `agent-patch`, `external-change`, `chunked-source-paste`, `sync-pause`, `sync-resume`, `wait`. **`agent-undo` is MISSING from both `ALL_OP_KINDS` and `WRITE_SURFACE_TO_OP_KIND`.** D18 coverage gate is currently satisfied only because no `agent-undo` surface is declared. V0-14 must add both or CI fails.
- **`createItemOriginProbe` (`test-harness.ts:694-713`) listens on `'stack-item-added'` events** to collect tx.origin values — this is the only public Y.UndoManager API exposing origin at capture. `StackItem` has no public `.origin` field. Per-agent UM scoping will need this capture machinery.
- **Only paired origins use `as const`** (`AGENT_WRITE_ORIGIN`, `FILE_WATCHER_ORIGIN`, `ROLLBACK_ORIGIN`, `MANAGED_RENAME_ORIGIN`). `OBSERVER_SYNC_ORIGIN` and the two client origins use just `satisfies` without `as const`. The `as const` makes readonly-ness match the `readonly context` in the `PairedWriteOrigin` brand.

### 12.3 MCP / server / identity bindings

- **`rename_document` MCP tool does NOT thread identity** (`rename-document.ts:104-107` POSTs `{docName, newDocName}`; `RenameDocumentDeps` at `:82-86` has no `identityRef`). Server `handleRename` (`api-extension.ts:2654`) never calls `extractAgentIdentity`. **All MCP-initiated renames are unattributed** — including backlink rewrites across N documents.
- **`rollback_to_version` MCP tool does NOT thread identity** (`rollback-to-version.ts:69-72` POSTs `{docName, commitSha}`). `handleRollback` (`api-extension.ts:2127`) never calls `extractAgentIdentity`. **All MCP-initiated rollbacks are unattributed.**
- **`save-version` threads `writers[]` but NOT `clientName`/`colorSeed`** (`save-version.ts:45-47`). Checkpoint shadow ref gets per-agent data but the client-visible presence/color bucket is disconnected from what `/api/agent-write-md` just set. Two-channel asymmetry.
- **Default identity bucket is `claude-1`** for any missing agentId (`api-extension.ts:1022`). `agentId = rawAgentId ? 'agent-' + rawAgentId : 'claude-1'`. Any non-MCP-threaded caller (curl, test harness, anonymous rename/rollback — though those don't even call `extractAgentIdentity`) collides into one bucket.
- **`closeAllForAgent` is never called in production code** — only in `agent-sessions.test.ts:149`. MCP subprocess exit triggers only the idle-shutdown counter decrement via the `/collab/keepalive` WS close; no per-agent session cleanup fires. Stale DirectConnections accumulate, awareness local state is not cleared, **ghost agents linger in `PresenceBar` until server shutdown or 30-minute idle-shutdown**.
- **Keepalive WS carries `pid` query param** (`mcp/keepalive.ts:137`: `/collab/keepalive?pid=${process.pid}`) **but the server ignores it** (`start.ts:434-456`). Only used for `ws.ping()` every 30s and idle-shutdown counting. No per-pid cleanup hook, no correlation to any `agentId`.
- **No agent-identity config schema fields** (`packages/cli/src/config/schema.ts`). No `agent.defaultLabel`, `agent.allowedClients`, etc. Only `AGENT_LABEL` env — consumable only via per-project `.mcp.json` env block. No `ok start` passthrough, no `config.yml` knob, no CLI flag.
- **Current main already supports lazy roots resolution** — `mcp/server.ts:230-249`'s `resolveCwd` picks `cachedRoots[0]` silently when multi-root. PR #207 tightens this to **throw** with named errors. The "silently pick first root" behavior is a real footgun on current main, not a PR #207 regression.
- **Identity is per-subprocess, not per-project, on BOTH main and PR #207**. PR #207's diff of `write-document.ts`, `edit-document.ts`, and `save-version.ts` is byte-identical for identity threading. Only cwd resolution changes. A single MCP subprocess switching between legal-root projects keeps the same `connectionId` regardless.
- **`agentFocus` is set on write/patch but never cleared** (`agent-focus.ts:17-18` comment: "No Path A caller uses it today; Path B session-end logic will"). `clearFocus` has zero production callers. Orphaned focus entries on `__system__` accumulate for every MCP subprocess that ever wrote, until server restart.
- **`/api/agent-undo-status` is the Hocuspocus liveness probe** (`mcp/server.ts:154`) — surviving endpoint name from V0-16's TQ13 scaffold removal. The route now 404s; `detectHocuspocus()` treats 404 as "Hocuspocus not running" — misleadingly accurate in the new regime. Dead attribution-era residue serving an orthogonal purpose.
- **Only 3 endpoints call `extractAgentIdentity`**: `handleAgentWrite` (1074), `handleAgentWriteMd` (1159), `handleAgentPatch` (1651). All other mutating endpoints (rename, rollback, save-version, create-page, delete-path, suggest-links) skip it. File-level operations and restructuring ops slip through without attribution.
- **`save-version` synthesizes `email: agent-<connId>@openknowledge.local`** CLI-side (`save-version.ts:47`). The "email" is never a real address — purely a git-commit-metadata field. Matters only for git-log author-email filtering in timeline queries.

### 12.4 Findings that reshape §6 tensions

Several addendum findings sharpen or add to the open questions in §6:

- **§6.2 (per-agent vs shared auto-save writer)** — extends to a broader question: `recordContributor` is called in exactly 3 mutation endpoints, while 6+ other mutating endpoints (rename, rollback, save-version-as-write, create-page, delete-path, suggest-links) skip attribution entirely. "Who made this edit?" is not just per-agent vs shared-writer — it's also "which endpoints even track the question."
- **§6.3 (origin-ref mechanism)** — PairedWriteOrigin runtime check is structural-only (§12.2 finding). Any per-agent origin mechanism that declares `context.paired: true` + per-agent extension field must also decide whether to harden `isPairedWriteOrigin` with an identity whitelist or stay structural.
- **§6.4 (cross-project identity aggregation)** — confirmed both main and PR #207 keep `connectionId` constant across projects. Any cross-project view would have to aggregate at the operator / harness level, since no server has the full picture.
- **§6.5 (three-tracker consolidation)** — really four-surface problem on current main: contributor-tracker + activity Y.Map + agentFocus on `__system__` + `AgentSessionManager` awareness. Each has its own lifecycle; `agentFocus` and `AgentSessionManager` sessions both leak without cleanup hooks.
- **§6.7 (identity reset)** — sharpens: even without a subprocess restart, the server accumulates per-subprocess state (sessions, awareness, agentFocus) that only clears at server shutdown / 30-min idle-shutdown. From the Hocuspocus's perspective, subprocess lifetime is inferred solely from keepalive-WS liveness, and that inference triggers no cleanup.

### 12.5 New candidate framings for §9

The addendum surfaces potential spec-worthy scopes that weren't visible in the first synthesis:

7. **Attribution completeness** — bring rename, rollback, save-version, and file-ops into the contributor/activity-map/agentFocus pipelines. Fixes the "anonymous mutating endpoint" class.
8. **Cleanup hooks on MCP subprocess exit** — wire the keepalive-WS close to call `sessionManager.closeAllForAgent(connectionId)` + `agentFocusBroadcaster.clearFocus(connectionId)`. Fixes ghost agents and orphaned focus entries.
9. **TQ13 cleanup completion** — remove dangling `/api/agent-undo*` callers in CLI/MCP-tools/agent-sim/test-harness; repoint Hocuspocus liveness probe to a non-deprecated endpoint.
10. **Git author/committer schema for per-agent attribution** — decide whether author, committer, or both should carry per-agent data. Currently committer is hardcoded, author varies but only in save-version path; body-level `ok-contributors:` is the canonical per-agent trail.
11. **Origin-object runtime hardening** — decide if `isPairedWriteOrigin` needs an identity whitelist to prevent a malicious remote client from triggering the paired-write fast path.

Not recommending any — surfacing axes where the current code diverges from any coherent "one rule" by accretion.
