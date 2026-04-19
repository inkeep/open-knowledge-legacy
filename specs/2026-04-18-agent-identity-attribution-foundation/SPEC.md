# Agent Identity & Attribution — Foundation

**Status:** Draft
**Owner:** Nick Gomez (CPO/CTO, taking over V0-14 / identity space)
**Last updated:** 2026-04-18
**Baseline commit:** `420f2b5e`
**Worldmodel:** [`reports/agent-identity-attribution-worldmodel/REPORT.md`](../../reports/agent-identity-attribution-worldmodel/REPORT.md)
**Evidence:** `./evidence/`

---

## 1) Problem statement

**Situation.** Open Knowledge is a CRDT markdown collaboration server where multiple AI agents — possibly different types, possibly multiple instances of the same type — co-edit with humans via MCP. Agent identity today is per-MCP-subprocess (`connectionId` = UUID at startup, optionally enriched with `clientInfo.name` + `AGENT_LABEL` env). Three attribution surfaces exist in-repo (activity Y.Map, contributor-tracker, AgentFocus on `__system__`) plus shadow-commit-body `ok-contributors:` JSON lines. PR #186 is proposing a fourth (live-attribution for graph halos). All agent writes share one frozen `AGENT_WRITE_ORIGIN` — per-agent distinction flows only via side-channels, not at the CRDT origin layer.

**Complication.** Accretion without foundation. The product vision (confirmed during intake) calls for: same-type agents distinct in real-time UX; aggregation by agent-type in long-term history; per-session distinctness in shadow-git; per-session undo with bucket/per-edit granularity; whole-stack disavowal as primary revoke operation. The existing plumbing doesn't support this cleanly:

- **V0-14 blocked.** Per-agent undo requires origin-layer filtering by `connectionId`; origin is a shared constant. Scaffold was removed in V0-16/PR #39 as "confidently broken."
- **Attribution gaps.** Rename, rollback, save-version, create-page, delete-path, suggest-links **skip** `extractAgentIdentity` entirely — anonymous to every tracker.
- **Opaque shadow ref topology.** Auto-save funnels all writers through `refs/wip/<branch>/server`; per-agent `git diff` requires parsing commit bodies, not walking refs.
- **Leaked session state.** `closeAllForAgent` has no production callers; ghost agents persist in awareness/activity/focus until server shutdown or 30-min idle-shutdown.
- **TQ13 cleanup incomplete at package boundaries.** CLI still probes `/api/agent-undo-status` (deleted route); MCP tools `undo_agent_edit` / `redo_agent_edit` POST to missing routes; test harness likewise.
- **Observer-layer origin-discard.** `persistence.ts:405` destructures only `{document, documentName}` — drops `lastTransactionOrigin` and `lastContext`, severing the chain that could carry per-agent identity from Y.Doc transaction to shadow commit.

Per-session distinctness + agent-type aggregation + principal-level responsibility is the product shape. Current code doesn't have a coherent identity model that spans all required consumers (undo, attribution, presence, timeline, shadow-git, main-git). The spec's job: define that model.

**Resolution.** Establish **F1** (actor identity representation at the CRDT origin layer, such that every downstream surface can derive its per-session view correctly) and **F2** (session lifecycle: start/end signals, cleanup hooks tied to subprocess-exit). From these, derive: per-session Agent UndoManagers (V0-14), attribution completeness sweep across all mutating endpoints, shadow ref topology with classified writers, transaction-effect capture for render-layer per-agent views, cleanup hooks wired to keepalive-WS lifecycle, main-git attribution using principal-author + `Co-Authored-By:` trailers, shadow-git structured body carrying the full actor tuple. UX aggregation rules let per-session storage project to agent-type views for long-term history without losing per-session fidelity.

## 2) Goals

- **G1 — Foundation:** One coherent actor identity model `(principal, agent_session)` is expressed at the CRDT origin layer and carried through to every downstream attribution surface without ad-hoc side-channels.
- **G2 — Undo correctness:** "Undo Claude-1's last edit" does not affect Claude-2's, Cursor's, or any human's edits. Per-session UM scoping is mechanical (Set-identity match), not heuristic.
- **G3 — Attribution completeness:** Every mutating operation (agent write, rename, rollback, save-version, file-ops) is attributed to an identifiable actor in both CRDT origin and shadow commit.
- **G4 — Shadow ref semantic clarity:** `git log refs/wip/<branch>/<writer>` is a legible per-actor history. No opaque `server` writer for attributable actions. Classified writers (`file-system`, `git-upstream`, `git-branch-switch`) for non-attributable service actions.
- **G5 — Main-git native:** Save-version commits in the user's project repo use `Author: <principal>` + `Co-Authored-By: <agent>` trailers, renderable by GitHub/GitLab natively.
- **G6 — Session lifecycle integrity:** MCP subprocess exit triggers cleanup across all per-session state (UM, awareness, activity-map, AgentFocus, contributor-tracker pending entries).
- **G7 — Render-layer attribution:** Transaction-effect capture (y-lite) lets the timeline render "Claude wrote this effect at 14:05" with per-transact diffs, without committing to a full character-level attribution side-channel.
- **G8 — Greenfield precedent-setting:** The identity model sets the right precedent (one origin-layer contract) for all future work in this space. No new ad-hoc trackers; no new string origins; no new silent defaults.

## 3) Non-goals

- **[NOT UNLESS]** NG1: **Character-level per-agent attribution** (pure Option B — "blame per character by agent"). Infeasible on Y.js v13.6.30 without a fork; native support requires Y.js v14's `AttributionManager` + `IdMap` (RC only as of 2026-04-18). — Revisit if: Y.js v14 stable lands + ecosystem (TipTap/Hocuspocus) upgrades, OR strong product signal that character-level-per-agent UX is required.
- **[NOT NOW]** NG2: **Identity attestation (cryptographic verification of claimed agent identity).** MCP has no attestation primitive today; `clientInfo.name` is self-reported and spoofable. Future Work (Explored tier, §15). — Revisit if: MCP protocol extends with signed clientInfo, OR cloud product ships and impersonation risk materializes.
- **[NOT NOW]** NG3: **Full headless-agent UX affordances** (dedicated timeline rows for `{null, agent_session}`, webhook/cron trigger plumbing, autonomous-agent lifecycle handling). Data model supports the tuple shape; specific UX is deferred. Future Work (Identified tier). — Revisit if: concrete headless-agent product case is shipped.
- **[NOT UNLESS]** NG4: **Cross-project identity aggregation** ("show all of Claude's activity across my projects"). Out-of-scope because there's no server that sees multiple projects. Future Work (Identified). — Revisit if: cloud product aggregates across workspaces at the product tier.
- **[NOT NOW]** NG5: **Project-repo (main git) attribution schema changes beyond save-version.** We're locking the save-version commit shape (principal-author + co-authored-by trailers). Other main-git commit flows (if any emerge) are their own spec.
- **[NEVER]** NG6: **Forking Y.js to persist origin on items.** Out of scope; architectural direction is to either use y-lite today or adopt v14 when stable.

## 4) Personas / consumers

- **P1 — Human user (knowledge base owner).** Sees presence bar, timeline, graph halos, save-version history. Wants to undo specific agent work. Needs a clear mental model for multi-agent co-work on their machine. Represents the principal for all local sessions.
- **P2 — AI agent (MCP subprocess, e.g., Claude Code).** Writes via MCP tools. Needs stable enough identity to self-correct own edits (undo) and accumulate coherent work in history, without being conflated with other agents.
- **P3 — Concurrent same-type agent (e.g., second Claude Code instance).** Same as P2 but must be distinct from its sibling in real-time presence and per-session undo.
- **P4 — CRDT/bridge developer.** Needs precedent-compliant origin model, testable UM scoping, fuzzer coverage extension. Reads observers.ts, server-observers.ts, agent-sessions.ts.
- **P5 — Product UI engineer.** Needs stable "who is editing this" contract across presence bar, timeline, graph halos, file tree. Wants aggregation rules (per-session → agent-type) encoded in one place.
- **P6 — Future spec author.** Needs foundation that doesn't block later specs on pass-boundary refinement, multi-project identity, cloud-auth integration, or attestation.
- **P7 — Cloud future: Multi-human collaborator.** (Forward-looking persona.) Alice + Bob on the same workspace, both with agents. On-behalf-of attribution preserves "Alice's Claude" vs "Bob's Claude." Data model must support this today (tuple shape); UI is future work.

## 5) User journeys

### P1 journey — Alice runs Claude Code + Cursor on her notes

1. Alice launches her Open Knowledge editor (`bun run dev`) and opens `notes.md`.
2. Claude Code and Cursor both have MCP configured. Each spawns a subprocess.
3. Claude writes Section A at 14:00; Cursor writes Section B at 14:02.
4. Alice sees two distinct agent avatars in the presence bar: "Claude (a4f2)" and "Cursor (9d2e)" — different colors per type, short session IDs to disambiguate.
5. Timeline renders two bursts: "Claude-1 added Section A" and "Cursor added Section B," each expandable to show transaction-effect diffs.
6. Alice decides Cursor's Section B is wrong. Clicks "Undo Cursor's session." Cursor's three transactions revert cleanly; Claude's work untouched.
7. Alice hits "Save Version." Main git commit: `Author: Alice <alice@...>`, `Co-Authored-By: Claude (a4f2) <agent-...@openknowledge.local>`. Shadow checkpoint records same plus Cursor (since Cursor's reverted work is still in the checkpoint history as a reverted trail, not a live contribution).

### P2 journey — Claude self-corrects a bad edit

1. Claude writes a section with a factual error.
2. In a follow-up conversation, user tells Claude to fix it.
3. Claude calls MCP `undo_agent_edit` with `scope: 'last'`. Server calls Claude's per-session UM `.undo()`. The errored transaction reverts.
4. Claude then writes the corrected section. New transaction lands on Claude's UM stack.
5. All of this happens without affecting Alice's own edits or Cursor's parallel work.

### P3 journey — Two Claude Code instances co-writing

1. Alice has two Claude Code windows open (perhaps one per project area).
2. Claude-1 writes `## Architecture`; Claude-2 writes `## Implementation`.
3. Presence bar shows two Claude avatars: "Claude (a4f2)" and "Claude (9d2e)."
4. Graph halos pulse on recently-touched nodes per session.
5. Alice wants to revert just Claude-2's work. UI "Undo Claude (9d2e) session" reverts Claude-2's stack; Claude-1's work stays.

### P4 journey — Developer investigating a bug

1. Developer reports "some content disappeared." Looks at shadow git: `git log --all --oneline refs/wip/main/`.
2. Per-session refs let them see each actor's trail: `refs/wip/main/agent-<Claude-1>`, `refs/wip/main/agent-<Cursor>`, `refs/wip/main/human-<Alice>`, `refs/wip/main/file-system`, `refs/wip/main/git-upstream`, `refs/wip/main/git-branch-switch`.
3. `git log refs/wip/main/file-system` shows a `reconcile: notes.md` commit at 14:03 that deleted the section.
4. Alice had run a format-on-save in VS Code that overwrote the file; file-watcher reconciled it; the section was lost because the reconciler didn't preserve it.
5. Developer has a clean reproduction path and an assigned root cause, without parsing commit-body JSON.

### P5 journey — Building a "Claude's recent activity" panel

1. UI engineer consumes the session registry + activity-log per session.
2. Renders a panel showing each agent session with: display name ("Claude (a4f2)"), color, recent bursts (from `bucketIntoBursts` shared utility in `core`), effect-diffs on expand.
3. Clicks "show all Claude activity" (agent-type aggregation) — UI calls a different API that returns all agents with `agent_type === 'claude'` grouped together.

### P6 journey — Cloud product landing

1. Product ships cloud auth. Users sign in with SSO.
2. On first cloud-auth login, the user's local `principal.json` is linked to their cloud identity in a server-side mapping.
3. Shadow history's `principal: <local-uuid>` entries resolve to the cloud user at query time (via translation layer).
4. New commits use cloud user's principal ID; display uses SSO display name.
5. Main-git commits continue to render natively with user's git config (SSO provider can sync this).

## 6) Requirements

### Functional requirements

- **FR-1 (F1 — actor identity at origin).** Every Y.Doc transaction originating from an identifiable actor passes a per-actor `LocalTransactionOrigin` object whose `context` includes `{session_id, agent_type?, principal, origin: 'agent-write' | 'agent-undo' | ..., paired: true}`. The origin object is frozen at creation time and object-identity-unique per session.
- **FR-2 (F2 — session lifecycle).** An agent session's resources (DirectConnection, per-session UndoManager, origin object, awareness local state, activity-log entries) are created on first `getSession(docName, agentId, identity)` call and torn down when the MCP subprocess's keepalive WebSocket closes or after a configurable idle timeout.
- **FR-3 (Per-session Agent UndoManager).** Each agent session has a dedicated `Y.UndoManager` on the document's `Y.Text('source')`, with `trackedOrigins = new Set([session.origin])` (identity match). `session.um.undo()` reverts that session's last transaction; `session.um.clear()` reverts the whole stack.
- **FR-4 (XmlFragment-authoritative undo replay).** `applyAgentUndo(session, scope)` fires a new `LocalTransactionOrigin` (`AGENT_UNDO_ORIGIN`, per-session, paired:true, distinct from `AGENT_WRITE_ORIGIN`) that composes the post-undo state at the markdown level and applies via `updateYFragment` + `applyFastDiff`, matching the `applyAgentMarkdownWrite` template.
- **FR-5 (Attribution completeness sweep).** All mutating server endpoints thread the triggering actor identity: `handleAgentWriteMd`, `handleAgentWrite`, `handleAgentPatch` (already done), plus **`handleRename`, `handleRollback`, `handleSaveVersion` (writers[] populated correctly), `handleCreatePage`, `handleDeletePath`, `handleSuggestLinks`, `handleApplyLinks`**, and any future mutating endpoints.
- **FR-6 (Classified writer IDs for non-attributable actions).** Writes with no identifiable triggering session use classified writer IDs: `file-system` (direct disk edits reconciled via file-watcher), `git-upstream` (HEAD-move commit imports), `git-branch-switch` (branch-switch parks), `openknowledge-service` (service-level operations, fallback). Each has a stable display name and email.
- **FR-7 (Shadow ref fan-out).** Shadow `commitWip` emits per-session refs `refs/wip/<branch>/<writer-id>`. Concurrent contributors in one L2 debounce window produce N commits sharing the same tree SHA, each with its own author/committer/body. `contributor-tracker` drains per-writer at commit time.
- **FR-8 (Structured `ok-actor:` commit body).** Every shadow commit produced by the persistence path includes in its commit message one or more `ok-actor:` JSON lines carrying the full actor tuple: `{v:1, principal, agent_session, agent_type, client_name?, client_version?, label?, display_name, color_seed, docs[]}`.
- **FR-9 (Main-git save-version attribution).** Project-repo save-version commits use `Author: <principal_display_name> <principal_display_email>` + `Co-Authored-By: <agent_display_name> <agent_email>` trailers for each contributing agent session since the last checkpoint.
- **FR-10 (Principal representation).** First server start synthesizes a stable UUID and persists to `<contentDir>/.open-knowledge/principal.json`. Display fields (name, email) are captured from git config when available and refreshed on each server start; the `id` field is immutable.
- **FR-11 (Transaction-effect capture / y-lite).** Each agent transaction's effect (inserted ranges + deleted ranges via `transaction.changed` + `stack-item-added` event payload) is captured and persisted to an activity-log side-channel, keyed by `(session_id, transact_index)`. Timestamp included.
- **FR-12 (Burst-grouping render utility).** `packages/core/src/burst-grouping.ts` exports a pure function `bucketIntoBursts(sessionStack, humanEdits): Burst[]` that groups a session's transactions into user-edit-bounded bursts. Shared between timeline, presence, graph halos.
- **FR-13 (Subject-prefix action classification).** Commit subject prefixes encode the action kind: `wip:`, `checkpoint:`, `reconcile:`, `import:`, `park:`, `rollback:`, `rename:`. Subject targets include the doc path and/or SHA for traceability.
- **FR-14 (Session cleanup on keepalive-WS drop).** Server-side keepalive-WS close handler resolves the MCP subprocess's `connectionId` and calls `sessionManager.closeAllForAgent(connectionId)` + `agentFocusBroadcaster.clearFocus(connectionId)`. No ghost sessions after 30-min idle.
- **FR-15 (TQ13 cleanup completion).** Remove dangling `/api/agent-undo*` callers in `mcp/server.ts:detectHocuspocus`, `mcp/tools.ts:undo_agent_edit|redo_agent_edit`, `packages/app/src/server/agent-sim.ts`, `packages/app/tests/integration/test-harness.ts`, `packages/app/tests/stress/stress-api.ts`. Repoint Hocuspocus liveness probe to an endpoint that isn't a deleted-attribution-era residue.
- **FR-16 (Observer-layer origin threading).** `persistence.ts` `onStoreDocument` handler extracts `lastTransactionOrigin.context` and routes the commit to the matching session's writer-ID at the L2 drain.
- **FR-17 (Fuzzer op extension).** The bridge convergence fuzzer (`bridge-convergence.fuzz.test.ts`) extends `ALL_OP_KINDS` with `agent-undo` and `WRITE_SURFACE_TO_OP_KIND` with the matching surface entry. D18 coverage gate passes with new origin.
- **FR-18 (Per-writer GC).** `shadow-branch-gc` extends per-branch GC to per-writer TTL: session-writer refs (`agent-<connectionId>`, `human-<principalId>`) GC'd after 30 days of inactivity on an active project branch. Classified writers (`file-system`, `git-upstream`, `git-branch-switch`) not GC'd.
- **FR-19 (Branch-switch park per-session).** On branch switch, each active session's ref advances with a park commit (subject `park: <old-branch> → <new-branch>`). Sessions resume on switch-back via restore from the parked ref.

### Non-functional requirements

- **NFR-1 (Precedent compliance).** All new origin objects use `LocalTransactionOrigin` / `PairedWriteOrigin` typed shape per precedent #1; session origins carry `paired: true` and pass the structural `isPairedWriteOrigin` check.
- **NFR-2 (Bridge invariant preservation).** All new write surfaces (`applyAgentUndo`, rollback-with-identity, etc.) preserve bridge invariants: XmlFragment-authoritative composition (precedent #10), server-authoritative cross-CRDT sync (precedent #14), paired-write observer short-circuit.
- **NFR-3 (Fuzzer coverage).** Any new bridge-mutating origin (`AGENT_UNDO_ORIGIN`, future) has a corresponding fuzzer op kind + surface entry. D18 gate enforces.
- **NFR-4 (Test harness migration).** Tests that imported `AGENT_WRITE_ORIGIN` for identity-based Set.has checks migrate to structural `isPairedWriteOrigin` checks OR to session-specific origin objects. No identity-check regressions.
- **NFR-5 (Cleanup correctness).** 30-minute soak test with repeated MCP subprocess spawn/exit cycles confirms no leak in `sessions` map, awareness state, `agentFocus` map, or `pendingContributors` map.
- **NFR-6 (Backward compatibility).** Greenfield directive waives wire/disk backward compat; however, shadow refs' `refs/wip/<branch>/server` legacy ref must be rewritten as `refs/wip/<branch>/openknowledge-service` or migrated-to-nothing on first run post-upgrade. No silent commit-history breakage.
- **NFR-7 (Performance).** Per-session UM overhead: measure memory + CPU at N=10 concurrent sessions, 100 transacts each, ensure no regression vs current single-writer path beyond expected per-session proportional cost.

### Acceptance criteria (per FR)

See §9 system design for implementation skeletons and §10 decision log for evidence-linked rationale. Acceptance criteria will be expanded per-FR during the iterative loop; each FR resolves into concrete test cases in the In Scope work before finalization.

## 7) Current state (code-verified, brief)

See [REPORT.md](../../reports/agent-identity-attribution-worldmodel/REPORT.md) for full topology. Highlights relevant to this spec:

- `AgentIdentity` shape in `packages/cli/src/mcp/agent-identity.ts:9-20` (connectionId, clientInfo, label, displayName, colorSeed) — works, flows through tool handlers, but discarded at `persistence.ts:405`.
- `AGENT_WRITE_ORIGIN` shared frozen constant at `agent-sessions.ts:57-61` — no per-session distinction.
- `AgentSessionManager.getSession(docName, agentId)` at `agent-sessions.ts:179-219` — per-`(docName, agentId)` DirectConnection, but `closeAllForAgent` has no production callers.
- `commitWip(shadow, writer, contentRoot, message, branch)` at `shadow-repo.ts:126-203` — already takes `WriterIdentity`, but auto-save hardcodes `defaultWriter = {id:'server', ...}`.
- Activity Y.Map, contributor-tracker, AgentFocus — three side-channels at the same write call sites (api-extension.ts:1097, 1182, 1715).
- Observer paired-write check at `server-observers.ts:124-128` is structural (`context.paired === true`), not identity-based — good for per-session origin migration.
- Save-version already per-writer: `shadow-repo.ts:847-951` iterates `writers[]` correctly; MCP tool at `save-version.ts:45-47` already passes `agent-<connectionId>` writer.
- Y.js v13.6.30 pinned; v14-rc.x (with `AttributionManager` + `IdMap`) not adopted (see `evidence/yjs-attribution-verification.md`).

## 8) Proposed solution

### 8.1 Actor model

```
Actor = {
  principal: PrincipalId | null     // null only for service-level writes
  agent_session: SessionId | null   // null for direct human edits
  kind: 'human' | 'agent' | 'system' // derived
}

Principal = {
  id: UUID                          // stable, persisted to principal.json
  display_name: string              // refreshed from git config each start
  display_email: string             // refreshed from git config each start
  source: 'git-config' | 'synthesized'
  created_at: ISO8601
}

SessionRecord = {
  id: SessionId                      // connectionId for agents, tabId+principalId for humans
  principal: PrincipalId
  kind: 'agent' | 'human'
  agent_type?: 'claude' | 'cursor' | 'codex' | 'cline' | 'bot'
  client_name?: string
  client_version?: string
  label?: string
  display_name: string               // e.g., 'Claude (a4f2)'
  color: string
  icon: string
  connected_at: timestamp
  origin: LocalTransactionOrigin     // frozen object, per-session
  um: Y.UndoManager                  // per-session UM on Y.Text
}
```

### 8.2 F1: Per-session origin objects

Each agent session (or human browser session, when hoisted) creates its own `LocalTransactionOrigin` at session birth:

```ts
const session.origin = Object.freeze({
  source: 'local' as const,
  skipStoreHooks: false,
  context: {
    origin: 'agent-write',  // or 'human-write'
    paired: true,
    session_id: connectionId,
    agent_type: resolvedAgentType,  // undefined for human
    principal: principalId,
  },
} as const satisfies PairedWriteOrigin);
```

All writes from this session pass this object into `document.transact()`. Per-session UM's `trackedOrigins` is `new Set([session.origin])` — identity match.

### 8.3 F2: Session lifecycle

- **Birth.** On first `getSession` call: create DirectConnection, awareness local state, session origin, per-session UM.
- **Activity.** Writes pass session.origin; contributor-tracker, activity-map, AgentFocus all key on `session_id`; persistence routes commits to `refs/wip/<branch>/<writer-id>` based on `session_id`.
- **Death.** Keepalive WebSocket close handler on the server matches the WS's `?pid=` query parameter to the MCP subprocess's `connectionId` (hoisted into the keepalive via an initial handshake message or derivable mapping), then fires `sessionManager.closeAllForAgent(connectionId)` + `agentFocusBroadcaster.clearFocus(connectionId)`. Per-session UM is destroyed. Outstanding contributor-tracker entries for the session either drain at next L2 (if still live) or are abandoned (if none pending).
- **Idle timeout fallback.** If keepalive never signals (process crash, network partition), 30-minute idle-shutdown runs full server-cleanup that includes session teardown.

### 8.4 V0-14: Per-session Agent UM + `AGENT_UNDO_ORIGIN`

- `AGENT_UNDO_ORIGIN` — NEW typed origin template:
  ```ts
  const session.undoOrigin = Object.freeze({
    source: 'local' as const,
    skipStoreHooks: false,
    context: {
      origin: 'agent-undo',
      paired: true,
      session_id: connectionId,
      principal: principalId,
    },
  });
  ```
- `applyAgentUndo(session, scope)` handler in `agent-sessions.ts`:
  1. Call `session.um.undo()` (or loop for `scope: 'session'`) to compute target Y.Text state.
  2. Re-serialize to markdown via `mdManager.serialize(yXmlFragmentToProsemirrorJSON(xmlFragment))` — wait, this is wrong direction. Actually: after `um.undo()`, Y.Text is in the desired post-undo state; we apply the XmlFragment-authoritative composition pattern (precedent #10): parse Y.Text markdown, apply to XmlFragment via `updateYFragment`, mirror via `applyFastDiff`.
  3. All wrapped in `dc.document.transact(fn, session.undoOrigin)`.
- Observer guards: `session.undoOrigin` is paired (`paired: true`), so `isPairedWriteOrigin` short-circuits observer baseline refresh as with agent writes. No observer fanout.

### 8.5 Attribution completeness sweep

All mutating endpoints thread `AgentIdentity` from `identityRef` (MCP side) and call `extractAgentIdentity` (server side). Endpoints to retrofit: `/api/rename`, `/api/rollback`, `/api/save-version` (partial — writers[] yes, clientName/colorSeed no), `/api/create-page`, `/api/delete-path`, `/api/suggest-links`, `/api/apply-links`. MCP tools `rename-document.ts`, `rollback-to-version.ts` extended to include `identityRef` in `Deps` and thread `agentId/agentName/clientName/colorSeed` into request body.

### 8.6 Shadow ref topology

Per-session refs: `refs/wip/<branch>/<writer-id>`.

Writer-ID schema:

| Writer ID | Display name | Email | Source |
|---|---|---|---|
| `agent-<connectionId>` | `<agent_type_display> (<short-id>)` e.g. `Claude (a4f2)` | `agent-<connectionId>@openknowledge.local` | MCP subprocess session |
| `human-<principalId>` | `<principal.display_name>` | `<principal.display_email>` | Browser principal |
| `file-system` | `File System` | `file-system@openknowledge.local` | Direct disk edit |
| `git-upstream` | `Git (upstream)` | `git@openknowledge.local` | Project repo HEAD-move import |
| `git-branch-switch` | `Git (branch switch)` | `git@openknowledge.local` | Branch-switch park |
| `openknowledge-service` | `Open Knowledge (service)` | `service@openknowledge.local` | Service-level fallback |

Subject prefixes: `wip:`, `checkpoint:`, `reconcile:`, `import:`, `park:`, `rollback:`, `rename:`. Subjects include target doc path / SHA.

Fan-out mechanics: L2 debounce fires, `swapContributors()` drains snapshot, loop distinct writers in snapshot, emit `commitWip(shadow, writer, contentRoot, `${subject}: ${target}`, branch)` per writer. All per-writer commits share same tree SHA for that drain.

### 8.7 Structured `ok-actor:` body

Each shadow commit's body includes one or more lines:

```
ok-actor: {"v":1,"principal":"principal-6f3a...","agent_session":"conn-abc","agent_type":"claude","client_name":"claude-code","client_version":"1.5.2","label":null,"display_name":"Claude (a4f2)","color_seed":"claude-code","docs":["notes.md","plan.md"]}
```

Multi-contributor drain (rare, since each contributor gets their own commit) would produce one `ok-actor:` per writer in that commit's body. The write loop at L2 drain uses contributor-snapshot entries as the body source of truth.

### 8.8 Main-git save-version attribution

```
Author: Nick Gomez <nick@inkeep.com>
Committer: Nick Gomez <nick@inkeep.com>   # matches user's git config

checkpoint: <user-supplied message>

Co-Authored-By: Claude (a4f2) <agent-conn-abc@openknowledge.local>
Co-Authored-By: Cursor (9d2e) <agent-conn-xyz@openknowledge.local>
```

`Author` uses the principal's display fields. `Committer` also uses principal (native git feel). Agent `Co-Authored-By` trailers are generated from the contributor-tracker's drained snapshot for the save-version window.

### 8.9 Transaction-effect capture (y-lite)

On each agent transaction, capture `{session_id, transact_index, timestamp, inserted_ranges, deleted_ranges, text_effect_diff}` into an activity-log store. Effect-diff is derived from `transaction.changed` + `stack-item-added` event payload (which includes the transaction reference) — no external diff library needed; Y.js exposes enough.

Storage location for the activity log is an Open Question (§11 Q1). Candidates: Y.Map on doc (replicates to clients, needs eviction), separate server-side store, shadow-body annotations. Resolution pending prototype/investigation.

### 8.10 Burst-grouping utility

`packages/core/src/burst-grouping.ts`:

```ts
export function bucketIntoBursts(
  sessionTransactions: Array<{ session_id: SessionId; timestamp: number; effect: EffectDiff }>,
  humanEdits: Array<{ timestamp: number }>,
): Burst[] {
  // A burst is a maximal contiguous sequence of session_transactions such that
  // no human edit falls strictly between consecutive transactions in the burst.
  // ...
}
```

Shared across timeline, presence, graph-halos so burst semantics don't diverge per-surface.

### 8.11 Principal file: `.open-knowledge/principal.json`

```json
{
  "id": "principal-6f3a9c8b-4e2d-49f1-ac3a-7e8d12c9a0b3",
  "display_name": "Nick Gomez",
  "display_email": "nick@inkeep.com",
  "source": "git-config",
  "created_at": "2026-04-18T14:22:00.000Z"
}
```

`id` immutable. `display_name` / `display_email` refreshed from git config (`user.name`, `user.email`) on each server start. `source: 'synthesized'` fallback when no git config available with display defaults `"Local User"` / `"principal-<short>@openknowledge.local"`.

## 9) System design — component view

```
                         ┌──────────────────────────────────────────────┐
                         │           MCP Subprocess (agent)              │
                         │  connectionId (UUID), clientInfo, AGENT_LABEL │
                         │  identityRef = AgentIdentity                  │
                         └──────────────┬───────────────────────────────┘
                                        │ HTTP: POST /api/agent-write-md
                                        │   body: {agentId, agentName, clientName, colorSeed}
                                        ▼
                         ┌──────────────────────────────────────────────┐
                         │              api-extension.ts                 │
                         │  extractAgentIdentity(body)                   │
                         │  sessionManager.getSession(docName, agentId)  │
                         │     → SessionRecord{origin, um, ...}          │
                         └──────────────┬───────────────────────────────┘
                                        │ dc.document.transact(fn, session.origin)
                                        ▼
                         ┌──────────────────────────────────────────────┐
                         │                  Y.Doc                        │
                         │  Y.XmlFragment ←→ Y.Text (paired-write)       │
                         │  session.origin in transaction.origin         │
                         └──────────────┬───────────────────────────────┘
                                        │ afterAllTransactions
                                        ▼
                         ┌──────────────────────────────────────────────┐
                         │          Server Observers (A/B)               │
                         │  isPairedWriteOrigin(origin) → short-circuit  │
                         │    (paired:true on session.origin → skip)     │
                         └──────────────┬───────────────────────────────┘
                                        │ (no observer fanout)
                                        ▼
                         ┌──────────────────────────────────────────────┐
                         │          Per-Session UM (Y.UndoManager)       │
                         │  trackedOrigins = Set([session.origin])       │
                         │  stack-item-added event → effect-diff capture │
                         └──────────────┬───────────────────────────────┘
                                        │ effect-diff
                                        ▼
                         ┌──────────────────────────────────────────────┐
                         │            activity-log store                 │
                         │  keyed by (session_id, transact_index)        │
                         └──────────────────────────────────────────────┘

                                        │ onStoreDocument
                                        ▼
                         ┌──────────────────────────────────────────────┐
                         │               persistence.ts                  │
                         │  extract session_id from lastTransactionOrigin│
                         │  route to writer-ID at L2 drain               │
                         └──────────────┬───────────────────────────────┘
                                        │ L2 drain (15s debounce)
                                        ▼
                         ┌──────────────────────────────────────────────┐
                         │            commitWip(shadow, writer, ...)     │
                         │  for each distinct writer in contributor snap │
                         │    commitWip(writer, subject, tree, body)     │
                         └──────────────┬───────────────────────────────┘
                                        │
                                        ▼
                         ┌──────────────────────────────────────────────┐
                         │  refs/wip/<branch>/agent-<connectionId>       │
                         │  refs/wip/<branch>/human-<principalId>        │
                         │  refs/wip/<branch>/file-system                │
                         │  refs/wip/<branch>/git-upstream               │
                         │  refs/wip/<branch>/git-branch-switch          │
                         └──────────────────────────────────────────────┘
```

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Actor model is `(principal, agent_session)` tuple, with `{null, agent_session}` valid for headless and `{principal, null}` valid for direct human edits. | Cross-cutting | LOCKED | Yes | Nick's Q2 + on-behalf-of vision. Forward-compatible with cloud (principal = cloud user ID) and headless (webhook agents). | Conversation 2026-04-18 + REPORT §6 | All origin shapes, commit bodies, awareness states carry or reference this tuple. |
| D2 | F1: Per-session origin objects (option ii). Each session creates its own frozen `LocalTransactionOrigin` at `getSession` time. | Tech | LOCKED | Yes | Precedent #1 compliance (typed origin refs, identity-based matching); fixes `persistence.ts:405` origin-discard gap; blast radius minimal because `isPairedWriteOrigin` already structural. Greenfield directive favors architecturally best over expediency. | Conversation + REPORT §12.2 + `evidence/crdt-to-git-translation.md §6` | `AGENT_WRITE_ORIGIN` shared constant deprecated. Per-session UMs use Set-identity match. Tests migrate to structural `isPairedWriteOrigin` check where they did `===`. |
| D3 | Per-session `Y.UndoManager` on `Y.Text`, scoped via `trackedOrigins = new Set([session.origin])`. | Tech | LOCKED | No | D1 product requires per-session undo; D2 enables it mechanically. | Undo SPEC §9 D1 + STORY §14 TQ18 | Y.Text is the mirror (precedent #10); undo replay uses XmlFragment-authoritative composition via `applyAgentUndo`. |
| D4 | `AGENT_UNDO_ORIGIN` is a new typed `PairedWriteOrigin` distinct from `AGENT_WRITE_ORIGIN`, per-session. Observer short-circuits same as agent-write. | Tech | LOCKED | Yes | Precedent #1 (typed origins); V0-14 STOP rules (`AGENTS.md:731-740`); D5 fuzzer op set gets extended accordingly. | AGENTS.md V0-14 STOP + bridge-convergence fuzz op invariant | `packages/server/src/agent-sessions.ts` adds `AGENT_UNDO_ORIGIN` template + per-session instantiation. Origin-guard truth table extends. |
| D5 | Transaction-effect capture via y-lite (per-transact pre/post effect from `transaction.changed` + `stack-item-added`). No v14 AttributionManager adoption now; no app-side IdMap clone. | Tech | LOCKED | No | Product UX value (per-transact effect rendering) achievable with Y.js v13 primitives. Character-level attribution is over-engineering without demonstrated user demand. v14 migration path stays open when stable. | `evidence/yjs-attribution-verification.md` + conversation 2026-04-18 | Activity-log store persists effect-diffs keyed by `(session_id, transact_index)`. Storage location TBD (Q1). |
| D6 | Per-session shadow WIP refs (Option A: doc-state-after-this-session's-write semantic). Not isolated-contributions (Option B), not baseline-diff (Option C). | Tech | LOCKED | Yes | Option A feasible + mostly pre-built (save-version path precedent); Option B infeasible on Y.js v13 without fork; Option C high cost, marginal gain. | `evidence/crdt-to-git-translation.md §4` | Each session's ref is an "activity trail" (when-this-session-wrote + doc-state-then), NOT a blame-by-agent view. UX language must reflect this. |
| D7 | Writer-ID schema: (γ) triggering session for human/agent-initiated actions; (β) classified for non-attributable service actions. | Cross-cutting | LOCKED | Yes | Staff-engineer answer under directive: most-informative attribution for each action. Attribution-completeness sweep already in-scope covers the threading. | Conversation 2026-04-18 + REPORT §12.3 | Rename, rollback, save-version, create-page etc. attribute to the triggering session. File-watcher, HEAD-moves, branch-switch-parks use classified writers. |
| D8 | Writer-ID naming + subject-prefix scheme (see §8.6 tables). | Cross-cutting | LOCKED | Partial — naming can evolve but semantic split (identity vs action) is locked. | Separating writer (identity) from subject-prefix (action) avoids the "external" fuzziness. Each ref is single-purpose. | Conversation 2026-04-18 | Git log is legible by writer AND by subject. Classified writers: `file-system`, `git-upstream`, `git-branch-switch`, `openknowledge-service`. |
| D9 | Principal = stable UUID + git-config display fields (option b2). Persisted to `<contentDir>/.open-knowledge/principal.json`. Display refreshed each server start; ID immutable. | Product/Tech | LOCKED | Yes (format of principal.json is a 1-way door on-disk schema) | Identity survives git config drift; cloud-migration clean; native-feeling git log from user's git config. | Conversation 2026-04-18 | New file `.open-knowledge/principal.json`. Likely gitignored by default. |
| D10 | Timeline primary unit: session as storage/UM boundary; burst as derived render view (grouped by user-edit interleaving via shared `bucketIntoBursts` utility). | Product/Tech | LOCKED | No | Storage is mechanical (session = UM lifetime). Burst matches how users think about "agent's recent chunk of work." Sharing the grouper in `core` prevents per-surface divergence. | Conversation 2026-04-18 + STORY §14 D9 | New `packages/core/src/burst-grouping.ts`. Timeline/presence/halos consume the utility. |
| D11 | Session lifecycle cleanup: wire server-side keepalive-WS close handler to call `sessionManager.closeAllForAgent(connectionId)` + `agentFocusBroadcaster.clearFocus(connectionId)`. 30-min idle-shutdown is fallback. | Tech | LOCKED | No | Fixes REPORT §12.3 ghost-agent leak. `pid` query param on keepalive URL + initial handshake message lets server correlate to `connectionId`. | REPORT §12.3 | Server now tracks `pid → connectionId` mapping. `/collab/keepalive` handler extends. |
| D12 | Main-git save-version: `Author = principal_display_name <principal_display_email>`, `Committer = same` (matches user's git config), `Co-Authored-By:` trailer per contributing agent session. | Product | LOCKED | Partial — the trailer format is a GitHub-rendering contract. | GitHub/GitLab natively render `Co-Authored-By:`; matches on-behalf-of framing; principal-author is what user expects to see in their git log. | Conversation 2026-04-18 | `save-version.ts` MCP tool threads writers[] AND generates co-author trailer list from session registry. |
| D13 | Shadow-git: `Author = agent_display (session short-id)` for agent sessions; `Author = principal_display` for human sessions; classified for non-attributable. All commits carry structured `ok-actor:` body lines. | Tech | LOCKED | Yes | Every historical attribution query runs off git natively; no session-registry dependency for historical queries (session registry is ephemeral). | `evidence/crdt-to-git-translation.md §3` + conversation | Shadow write path generates `ok-actor:` body line from session metadata at commit time. |
| D14 | Headless agents: data model supports `{principal: null, agent_session}` tuple. No UI affordances shipped in this spec. Future spec adds UX when a concrete headless-agent product case lands. | Product | LOCKED | No | "Best architecture without over-engineering" — honor the tuple shape, don't pre-build UI for unseen use case. | Conversation 2026-04-18 | Tests assert `null` principal case. UI assumes `principal != null` for rendering but doesn't reject `null` data. |
| D15 | Identity attestation deferred to Future Work (Explored tier). MCP has no attestation primitive today; `clientInfo.name` self-reported is accepted. | Cross-cutting | LOCKED | No | Prerequisite (MCP protocol evolution or in-repo trust substrate) doesn't exist. Not pragmatism-deferral — genuinely out of foundation scope. | `evidence/yjs-attribution-verification.md` + STORY §14 | Noted in §15 Future Work. Revisit triggers documented. |
| D16 | Attribution completeness sweep: thread identity through `handleRename`, `handleRollback`, `handleSaveVersion`, `handleCreatePage`, `handleDeletePath`, `handleSuggestLinks`, `handleApplyLinks`. MCP tools `rename-document.ts`, `rollback-to-version.ts` extended to pass `identityRef`. | Tech | LOCKED | No | Greenfield + no-deferred-debt directive: all mutating endpoints MUST attribute under the coherent model. | REPORT §12.3 | Each endpoint gains `extractAgentIdentity` call + writer-ID resolution. |
| D17 | TQ13 cleanup completion: remove dangling `/api/agent-undo*` callers across CLI, MCP tools, test harness. Repoint Hocuspocus liveness probe. | Tech | LOCKED | No | Greenfield + no-deferred-debt; current 404s are residue from V0-16 scaffold removal. | REPORT §12.2 | Multi-file cleanup across CLI and test harness. |
| D18 | `isPairedWriteOrigin` stays structural (`context.paired === true`), not identity-whitelisted. Per-session origins can't use identity-based paired check anyway (N origins, not one). | Tech | LOCKED | No | Structural check already in place; per-session origins naturally work with it. Identity whitelist would require an enumeration scheme that fights the per-session model. | `server-observers.ts:124-128` | No code change; decision is to keep current behavior and document it. |
| D19 | Branch-switch park is per-session: each active session's ref advances with a park commit (subject `park: <old-branch> → <new-branch>`). Park is not a collapse-to-single-ref. | Tech | LOCKED | Partial — park mechanics can evolve, but per-session preservation is load-bearing. | Greenfield directive favors semantic preservation of per-session history even through branch switches. | Conversation 2026-04-18 | `standalone.ts:parkBranch` refactors to iterate active sessions. `readParkedState` signature changes. |
| D20 | Burst boundary rule: a burst is a maximal contiguous sequence of a session's transactions such that no human edit timestamp falls strictly between consecutive transactions. Timestamps from shadow commit author-date + human-edit awareness events. | Product/Tech | DIRECTED | No | Simplest rule that matches user intuition. Can refine later if product research surfaces better rule. | STORY §14 D9 direction | `bucketIntoBursts` implements this rule. UX tests validate grouping against concrete scenarios. |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | Activity-log storage location for transaction-effect capture. Y.Map on doc (replicates, needs eviction), separate server-side store (custom sync), or shadow-body annotations (historical only, not live)? | Tech | P0 | Yes | Prototype trade-offs: storage cost, replication cost, live vs historical access patterns. Evaluate against D5 + FR-11. | OPEN |
| Q2 | Human browser-session origin representation. Today human writes have `origin: undefined`. Under F1, should browser edits also have per-tab origins for symmetric F1 treatment? If yes, how is the tab-session identity hoisted to the server? | Tech | P0 | No (foundation holds) | Investigate TipTap / y-codemirror.next plugin origin-setting; prototype server-side tab-session registry via awareness. | OPEN |
| Q3 | Per-writer GC TTL value. 30 days is a starting default; justify or tune based on realistic session lifetimes. | Tech | P2 | No | Product research on typical session/agent activity patterns. Default 30d, revisit. | OPEN |
| Q4 | Effect-diff compact encoding. Y.js `transaction.changed` vs pre/post snapshots — which gives smaller persistence? Test with typical agent write sizes. | Tech | P0 | No | Prototype both encodings; measure storage delta on representative workload. | OPEN |
| Q5 | Principal file gitignore default. `.open-knowledge/principal.json` should probably not be committed (personal UUID, identifies the local machine). But users on shared dev machines might want it committed. | Product | P0 | No | Default gitignore entry in `ok init`; users can override via project config. | PROPOSED: default-gitignore |
| Q6 | Keepalive → connectionId correlation mechanism. Options: (a) initial handshake message over keepalive WS carries connectionId; (b) HTTP API call after subprocess start registers `pid → connectionId` mapping; (c) derive from MCP transport state. | Tech | P0 | Yes | Prototype (a) as preferred (simplest); spec fallback. | OPEN |
| Q7 | `openknowledge-service` fallback — when exactly is it used? Enumerate concrete cases vs forcing every commit into an attributable or classified writer. | Tech | P0 | No | Audit all existing write paths; confirm `openknowledge-service` is true-fallback only or eliminate. | OPEN |
| Q8 | Subject-prefix target format. `rollback: notes.md to <sha>` — include full SHA, short SHA, timestamp-descriptor, or human-readable "3pm version"? | Product/Tech | P2 | No | UX input on history-readability; defer to first implementation. | OPEN |
| Q9 | Migration from legacy `refs/wip/<branch>/server` — rename to `refs/wip/<branch>/openknowledge-service` on first run post-upgrade, or archive and start fresh under the new scheme? | Tech | P0 | No (greenfield directive allows breaking) | Greenfield waives compat; recommend archive-and-fresh-start. Document in rollout notes. | PROPOSED: archive + fresh |
| Q10 | Does the activity-log replicate to clients (affects Q1)? Timeline UI rendering needs it; affects privacy/size trade-offs. | Product/Tech | P0 | Yes | Product decision — timeline live? then replicate. Timeline async-loaded? then server-only. | OPEN |
| Q11 | Effect-diff retention. Activity-log grows unbounded without eviction. TTL? Per-session-only? Evict on session close? Keep durably in shadow body? | Tech | P0 | No | Combine with Q1 storage decision; eviction strategy depends on storage choice. | OPEN |

## 12) Assumptions

- **A1 — MCP `connectionId` stability.** The `identityRef.current.connectionId` is stable across all tool calls in one MCP subprocess lifetime. Verified today via `randomUUID()` at `mcp/server.ts:290` and closure capture in tool handlers. If MCP subprocess pattern changes (e.g., reconnecting clients in HTTP transport with new handshakes), this assumption must be re-verified.
- **A2 — `isPairedWriteOrigin` structural check remains load-bearing.** D2's per-session origins depend on this. If a future change forces identity-based paired checks, D2's mechanism breaks. Test case locks it in.
- **A3 — Y.js v13.6.30 item API is stable.** `Item.id.client/clock`, `transaction.origin`, `stack-item-added` event payload shape — all consumed by FR-11. If Y.js minor version bumps change these, spec-time test catches it.
- **A4 — Git config user.name/user.email are reasonably stable for same-machine usage.** Local identities don't drift rapidly. D9's "refresh display each server start" handles intentional updates. Rare edge case (user runs Open Knowledge + changes git config mid-session) produces display drift that's acceptable.
- **A5 — Per-session UM memory cost is bounded.** For typical workloads (1-3 concurrent agents, 100-1000 transacts per session), per-session UMs stay <1MB each. NFR-7 verifies.
- **A6 — Greenfield waives backward compat for shadow WIP refs.** Legacy `refs/wip/<branch>/server` refs produced pre-spec can be archived-and-fresh-started on upgrade; users are warned.

## 13) In scope / out of scope

### In scope (all P0)

1. **F1: Per-session origin objects.** (D2, FR-1)
2. **F2: Session lifecycle + cleanup hooks.** (D11, FR-2, FR-14)
3. **V0-14: Per-session Agent UndoManagers + `AGENT_UNDO_ORIGIN`.** (D3, D4, FR-3, FR-4)
4. **Attribution completeness sweep.** (D16, FR-5)
5. **Shadow ref topology: per-session fan-out + classified writers.** (D6, D7, D8, D19, FR-6, FR-7, FR-18, FR-19)
6. **UX aggregation rules: per-session storage → agent-type render projection.** (D10, FR-12)
7. **TQ13 cleanup completion.** (D17, FR-15)
8. **Main-git save-version attribution schema.** (D12, FR-9)
9. **Shadow-git `ok-actor:` body schema.** (D13, FR-8)
10. **Transaction-effect capture (y-lite).** (D5, FR-11)
11. **Principal representation.** (D9, FR-10)
12. **Observer-layer origin threading in `persistence.ts:onStoreDocument`.** (FR-16)
13. **Fuzzer op-set extension for `agent-undo`.** (FR-17, NFR-3)
14. **`isPairedWriteOrigin` documentation as structural-invariant.** (D18)
15. **Subject-prefix + writer-ID naming scheme.** (D8, FR-13)

### Out of scope (Future Work)

Per §15 maturity tiers. Attestation (Explored), Headless UX (Identified), Cross-project aggregation (Identified), v14 AttributionManager (Identified), Burst-boundary refinement (Explored), Character-level attribution / Option B (Explored).

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Per-session UM memory/CPU overhead at scale | Low | Medium | NFR-7 perf-test gate; if measured, evict inactive session UMs (retain commit history, lose live undo). |
| Observer-layer origin threading regresses bridge invariants | Medium | High | Extend bridge-convergence fuzzer (FR-17); mutation-validation gates preserved per AGENTS.md. |
| Ecosystem compat (TipTap/Hocuspocus on v13) | Low | Low | Y.js v13 primitives only; v14 migration is future. |
| Branch-switch park refactor destabilizes HEAD-move handling | Medium | High | Tier 1 integration tests cover cross-branch scenarios; regression tests pin current behavior before refactor, then update per D19. |
| Cleanup-on-keepalive-close fires on transient WS drops (false-positive session close) | Medium | Medium | Grace period before cleanup (e.g., 5s); session reconnect via MCP subprocess's own retry logic reuses existing session rather than creating new one. |
| Activity-log storage growth unbounded | High | Low-Medium | Q11 addresses — eviction strategy decided during iterative loop. |
| Principal UUID leaks to shadow body + potentially git log → privacy concern | Low | Low | UUID is opaque; display fields (not UUID) appear in git author; structured body is shadow-only, not main git. Document. |
| `isPairedWriteOrigin` accepting forged remote origin (structural check) | Low | Low-Medium | Remote transactions can't reach paired-write short-circuit path because they arrive via WebSocket with a Yjs-internal origin sentinel, not our structural marker. Tests assert. |

## 15) Future work

### Explored (investigated + clear next spec)

- **Identity attestation.** Prerequisites: MCP protocol evolution (signed clientInfo) OR in-repo trust substrate (project-registered agent keys). Triggers: cloud product ships and impersonation surfaces as a real concern, OR MCP spec lands signing. Scope of follow-up: design trust primitives, rework `clientInfo.name` acceptance, permission gates. Evidence: REPORT §4.7 + conversation 2026-04-18.
- **Character-level attribution / Option B.** Prerequisites: Y.js v14 stable + TipTap/Hocuspocus ecosystem upgrades OR clear product demand justifying app-side IdMap side-channel investment. Triggers: v14 lands stable, OR product research shows sub-line per-agent attribution is load-bearing UX. Evidence: `evidence/yjs-attribution-verification.md`.
- **Burst-boundary rule refinement.** D20's simple "any human edit interrupts burst" may produce edge-case bursts (single-keystroke human edits interrupting a coherent agent pass). Alternatives: minimum-burst-gap threshold, content-based interruption detection. Trigger: user feedback that bursts feel misgrouped.

### Identified (known matters, not yet specced)

- **Cross-project identity aggregation.** One `connectionId` spans N projects (multi-root MCP case, per PR #207). Aggregating "Alice's Claude across all her workspaces" requires a roll-up layer that doesn't exist today. Spec-pending when cloud / multi-project product shapes materialize.
- **Headless agent UX affordances.** `{null, agent_session}` tuple supported by data model (D14); UX (timeline rows for autonomous agents, webhook-triggered lifecycle, cron-like scheduling) is its own spec.
- **v14 AttributionManager adoption.** When v14 stable + ecosystem ready, migrate our y-lite capture to native `DiffAttributionManager` + `IdMap`. Data model shape is compatible; implementation swap only.
- **Multi-human cloud attribution.** P7 persona. On-behalf-of model's full UX (Alice's Claude vs Bob's Claude rendered correctly in shared workspace) depends on cloud-auth substrate.
- **Project-repo attribution beyond save-version.** Other main-git-writing flows (if any ship) need analogous attribution shape.

### Noted (surfaced, not examined)

- **Compliance/audit views.** Beyond per-commit attribution, enterprise features might require audit trails, signed attestations, immutable logs. Pre-feature.
- **Rich effect-diff rendering.** Beyond timeline cards, effect-diffs could render inline in the editor (Google-Docs-style "this was added by Claude" hover). UX pre-feature.
- **Agent capability policies per session.** "Claude can edit notes/, Cursor can edit code/." Requires attestation or out-of-band registration. Tied to NG2.

## 16) Agent constraints

**SCOPE** — Implementation of this spec will touch:
- `packages/cli/src/mcp/server.ts`, `agent-identity.ts`, `keepalive.ts`
- `packages/cli/src/mcp/tools/{write-document,edit-document,save-version,rename-document,rollback-to-version}.ts` and any other mutating tool
- `packages/server/src/agent-sessions.ts`, `api-extension.ts`, `persistence.ts`, `contributor-tracker.ts`, `shadow-repo.ts`, `server-observers.ts`, `agent-focus.ts`, `file-watcher.ts`, `external-change.ts`, `reconciliation.ts`, `head-watcher.ts`, `shadow-branch-gc.ts`, `standalone.ts`
- `packages/server/src/principal.ts` (NEW)
- `packages/server/src/activity-log.ts` (NEW)
- `packages/core/src/burst-grouping.ts` (NEW)
- `packages/core/src/types/{awareness,actor,link-graph,principal}.ts` (extend or add)
- `packages/core/src/shadow-repo-layout.ts` (extend `ok-actor:` parsing)
- `packages/app/src/presence/PresenceBar.tsx`, `use-presence.ts`; `packages/app/src/components/Timeline.tsx`, `GraphView.tsx` (consume new burst-grouping utility)
- `packages/app/tests/integration/test-harness.ts` and related test files (migrate to session-origin pattern)
- `packages/app/tests/stress/bridge-convergence.fuzz.test.ts` (add `agent-undo` op + `AGENT_UNDO_ORIGIN` surface)

**EXCLUDE** — Do not modify:
- Y.js core (`node_modules/yjs/`)
- `@tiptap/y-tiptap`, `y-prosemirror`, `y-codemirror.next`, `@hocuspocus/*` packages (patches already maintained; don't bump versions)
- `docs/` site content beyond what's needed for user-visible contracts
- Main git project repo's pre-existing history (save-version creates new commits under new schema; existing commits untouched)

**STOP_IF** — Pause for review:
- Any change that would require a Y.js version bump (v13 → v14 is OUT of scope per D5).
- Any change to the paired-write observer short-circuit logic (bridge invariant).
- Any re-introduction of the `AGENT_WRITE_ORIGIN` module-level constant as a shared object for agent writes (D2 LOCKED against this).
- Any client-side cross-CRDT write path (precedent #14 LOCKED against).
- Any destructive schema change to shadow git refs beyond the D19 / Q9 archive-and-fresh-start migration.
- Any plan to emit a commit with an opaque `server` writer (pre-spec debt).

**ASK_FIRST** — Confirm before proceeding:
- Activity-log storage location decision (Q1, Q10, Q11 interlinked).
- Human browser-session origin hoisting strategy (Q2).
- `openknowledge-service` fallback-writer scope (Q7).
- `principal.json` gitignore default (Q5).
- Legacy shadow ref migration plan execution (Q9).
- Keepalive → connectionId correlation mechanism (Q6).

---

*Spec generated via `/spec` skill on 2026-04-18. Iterative loop pending on Open Questions Q1-Q11.*
