# Agent Identity & Attribution — Foundation

**Status:** Draft
**Owner:** Nick Gomez (CPO/CTO, taking over V0-14 / identity space)
**Last updated:** 2026-04-18
**Baseline commit:** `420f2b5e`
**Worldmodel:** [`reports/agent-identity-attribution-worldmodel/REPORT.md`](../../reports/agent-identity-attribution-worldmodel/REPORT.md)
**Evidence:** `./evidence/`

---

## 1) Problem statement

**Situation.** Open Knowledge is a CRDT markdown collaboration server where multiple AI agents — possibly different types, possibly multiple instances of the same type — co-edit with humans via MCP. Agent identity today is per-MCP-subprocess (`connectionId` = UUID at startup, optionally enriched with `clientInfo.name` + `AGENT_LABEL` env). Three attribution surfaces exist in-repo (activity Y.Map, contributor-tracker, AgentFocus on `__system__`) plus history-commit-body `ok-contributors:` JSON lines. PR #186 is proposing a fourth (live-attribution for graph halos). All agent writes share one frozen `AGENT_WRITE_ORIGIN` — per-agent distinction flows only via side-channels, not at the CRDT origin layer.

**Complication.** Accretion without foundation. The product vision (confirmed during intake) calls for: same-type agents distinct in real-time UX; aggregation by agent-type in long-term history; per-session distinctness in history repo; per-session undo with bucket/per-edit granularity; whole-stack disavowal as primary revoke operation. The existing plumbing doesn't support this cleanly:

- **V0-14 blocked.** Per-agent undo requires origin-layer filtering by `connectionId`; origin is a shared constant. Scaffold was removed in V0-16/PR #39 as "confidently broken."
- **Attribution gaps.** Rename, rollback, save-version, create-page, delete-path, suggest-links **skip** `extractAgentIdentity` entirely — anonymous to every tracker.
- **Opaque history ref topology.** Auto-save funnels all writers through `refs/wip/<branch>/server`; per-agent `git diff` requires parsing commit bodies, not walking refs.
- **Leaked session state.** `closeAllForAgent` has no production callers; ghost agents persist in awareness/activity/focus until server shutdown or 30-min idle-shutdown.
- **TQ13 cleanup incomplete at package boundaries.** CLI still probes `/api/agent-undo-status` (deleted route); MCP tools `undo_agent_edit` / `redo_agent_edit` POST to missing routes; test harness likewise.
- **Observer-layer origin-discard.** `persistence.ts:405` destructures only `{document, documentName}` — drops `lastTransactionOrigin` and `lastContext`, severing the chain that could carry per-agent identity from Y.Doc transaction to history commit.

Per-session distinctness + agent-type aggregation + principal-level responsibility is the product shape. Current code doesn't have a coherent identity model that spans all required consumers (undo, attribution, presence, timeline, history repo, main-git). The spec's job: define that model.

**Resolution.** Establish **F1** (actor identity representation at the CRDT origin layer, such that every downstream surface can derive its per-session view correctly) and **F2** (session lifecycle: start/end signals, cleanup hooks tied to subprocess-exit). From these, derive: per-session Agent UndoManagers (V0-14), attribution completeness sweep across all mutating endpoints, history ref topology with classified writers, transaction-effect capture for render-layer per-agent views, cleanup hooks wired to keepalive-WS lifecycle, main-git attribution using principal-author + `Co-Authored-By:` trailers, history repo structured body carrying the full actor tuple. UX aggregation rules let per-session storage project to agent-type views for long-term history without losing per-session fidelity.

## 2) Goals

- **G1 — Foundation:** One coherent actor identity model `(principal, agent_session)` is expressed at the CRDT origin layer and carried through to every downstream attribution surface without ad-hoc side-channels.
- **G2 — Undo correctness:** "Undo Claude-1's last edit" does not affect Claude-2's, Cursor's, or any human's edits. Per-session UM scoping is mechanical (Set-identity match), not heuristic.
- **G3 — Attribution completeness:** Every mutating operation (agent write, rename, rollback, save-version, file-ops) is attributed to an identifiable actor in both CRDT origin and history commit.
- **G4 — History ref semantic clarity:** `git log refs/wip/<branch>/<writer>` is a legible per-actor history. No opaque `server` writer for attributable actions. Classified writers (`file-system`, `git-upstream`, `git-branch-switch`) for non-attributable service actions.
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
7. Alice hits "Save Version." Main git commit: `Author: Alice <alice@...>`, `Co-Authored-By: Claude (a4f2) <agent-...@openknowledge.local>`. History checkpoint records same plus Cursor (since Cursor's reverted work is still in the checkpoint history as a reverted trail, not a live contribution).

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

1. Developer reports "some content disappeared." Looks at history repo: `git log --all --oneline refs/wip/main/`.
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
3. Edit history's `principal: <local-uuid>` entries resolve to the cloud user at query time (via translation layer).
4. New commits use cloud user's principal ID; display uses SSO display name.
5. Main-git commits continue to render natively with user's git config (SSO provider can sync this).

## 6) Requirements

### Functional requirements

- **FR-1 (F1 — actor identity at origin).** Every Y.Doc transaction originating from an identifiable actor passes a per-actor `LocalTransactionOrigin` object whose `context` includes `{session_id, agent_type?, principal, origin: 'agent-write' | 'agent-undo' | ..., paired: true}`. The origin object is frozen at creation time and object-identity-unique per session.
- **FR-2 (F2 — session lifecycle).** An agent session's resources (DirectConnection, per-session UndoManager, origin object, awareness local state, activity-log entries) are created on first `getSession(docName, agentId, identity)` call and torn down when the MCP subprocess's keepalive WebSocket closes or after a configurable idle timeout.
- **FR-3 (Per-session Agent UndoManager).** Each agent session has a dedicated `Y.UndoManager` scoped across `[Y.Text('source'), Y.Map('metadata'), Y.Map('activity')]` (per D25), with `trackedOrigins = new Set([session.origin])` (identity match; D21) + `captureTransaction: tr => tr.origin !== session.undoOrigin` defense-in-depth + `captureTimeout: 500` (D24). `session.um.undo()` reverts that session's last transaction (all 3 Y-types atomically); `session.um.clear()` reverts the whole stack.
- **FR-4 (XmlFragment-authoritative undo replay).** `applyAgentUndo(session, scope)` fires a new `LocalTransactionOrigin` (`AGENT_UNDO_ORIGIN`, per-session, paired:true, distinct from `AGENT_WRITE_ORIGIN`) that composes the post-undo state at the markdown level and applies via `updateYFragment` + `applyFastDiff`, matching the `applyAgentMarkdownWrite` template.
- **FR-5 (Attribution completeness sweep).** All mutating server endpoints thread the triggering actor identity. Already done: `handleAgentWriteMd`, `handleAgentWrite`, `handleAgentPatch`. To thread (per D42): `handleSaveVersion` (extends writers[] population + adds clientName/colorSeed), `handleRollback`, `handleCreatePage`, `handleRename`, `handleRenamePath`, `handleDeletePath`, `handleUploadImage`, `sync/resolve-conflict` handler, future `handleApplyLinks`. Explicitly excluded: GET-only handlers (`handleSuggestLinks`), `test-reset`, `local-op/*`. Meta-test scans route registry and asserts every POST handler calls `extractAgentIdentity` or is on the allowlist.
- **FR-6 (Classified writer IDs for non-attributable actions).** Writes with no identifiable triggering session use classified writer IDs: `file-system` (direct disk edits reconciled via file-watcher), `git-upstream` (HEAD-move commit imports), `git-branch-switch` (branch-switch parks), `openknowledge-service` (service-level operations, fallback). Each has a stable display name and email.
- **FR-7 (History ref fan-out).** `commitWip` emits per-session refs in the history repo `refs/wip/<branch>/<writer-id>`. Concurrent contributors in one L2 debounce window produce N commits sharing the same tree SHA, each with its own author/committer/body. `contributor-tracker` drains per-writer at commit time.
- **FR-8 (Structured `ok-actor:` commit body).** Every history commit produced by the persistence path includes in its commit message one or more `ok-actor:` JSON lines carrying the full actor tuple: `{v:1, principal, agent_session, agent_type, client_name?, client_version?, label?, display_name, color_seed, docs[]}`.
- **FR-9 (Main-git save-version attribution).** Project-repo save-version commits use `Author: <principal_display_name> <principal_display_email>` + `Co-Authored-By: <agent_display_name> <agent_email>` trailers for each contributing agent session since the last checkpoint.
- **FR-10 (Principal representation).** First server start synthesizes a stable UUID and persists to `<contentDir>/.open-knowledge/principal.json`. Display fields (name, email) are captured from git config when available and refreshed on each server start; the `id` field is immutable.
- **FR-11 (Transaction-effect capture / y-lite).** Each agent transaction's effect (inserted ranges + deleted ranges via `transaction.changed` + `stack-item-added` event payload) is captured and persisted to an activity-log side-channel, keyed by `(session_id, transact_index)`. Timestamp included.
- **FR-12 (Burst-grouping render utility).** `packages/core/src/burst-grouping.ts` exports a pure function `bucketIntoBursts(sessionStack, humanEdits): Burst[]` that groups a session's transactions into user-edit-bounded bursts. Shared between timeline, presence, graph halos.
- **FR-13 (Subject-prefix action classification).** Commit subject prefixes encode the action kind: `wip:`, `checkpoint:`, `reconcile:`, `import:`, `park:`, `rollback:`, `rename:`. Subject targets include the doc path and/or SHA for traceability.
- **FR-14 (Session cleanup on keepalive-WS drop).** Server-side keepalive-WS close handler resolves the MCP subprocess's `connectionId` and calls `sessionManager.closeAllForAgent(connectionId)` + `agentFocusBroadcaster.clearFocus(connectionId)`. No ghost sessions after 30-min idle.
- **FR-15 (TQ13 cleanup completion).** Remove dangling `/api/agent-undo*` callers in `mcp/server.ts:detectHocuspocus`, `mcp/tools.ts:undo_agent_edit|redo_agent_edit`, `packages/app/src/server/agent-sim.ts`, `packages/app/tests/integration/test-harness.ts`, `packages/app/tests/stress/stress-api.ts`. Repoint Hocuspocus liveness probe to an endpoint that isn't a deleted-attribution-era residue.
- **FR-16 (Observer-layer origin threading).** `persistence.ts` `onStoreDocument` handler extracts `lastTransactionOrigin.context` and routes the commit to the matching session's writer-ID at the L2 drain.
- **FR-17 (Fuzzer op extension).** The bridge convergence fuzzer (`bridge-convergence.fuzz.test.ts`) extends `ALL_OP_KINDS` with `agent-undo` and `WRITE_SURFACE_TO_OP_KIND` with the matching surface entry. D18 coverage gate passes with new origin.
- **FR-18 (Per-writer GC).** `history-branch-gc` extends per-branch GC to per-writer TTL: session-writer refs (`agent-<connectionId>`, `human-<principalId>`) GC'd after 30 days of inactivity on an active project branch. Classified writers (`file-system`, `git-upstream`, `git-branch-switch`) not GC'd.
- **FR-19 (Branch-switch park per-session).** On branch switch, each active session's ref advances with a park commit (subject `park: <old-branch> → <new-branch>`). Sessions resume on switch-back via restore from the parked ref.

### Non-functional requirements

- **NFR-1 (Precedent compliance).** All new origin objects use `LocalTransactionOrigin` / `PairedWriteOrigin` typed shape per precedent #1; session origins carry `paired: true` and pass the structural `isPairedWriteOrigin` check.
- **NFR-2 (Bridge invariant preservation).** All new write surfaces (`applyAgentUndo`, rollback-with-identity, etc.) preserve bridge invariants: XmlFragment-authoritative composition (precedent #10), server-authoritative cross-CRDT sync (precedent #14), paired-write observer short-circuit.
- **NFR-3 (Fuzzer coverage).** Any new bridge-mutating origin (`AGENT_UNDO_ORIGIN`, future) has a corresponding fuzzer op kind + surface entry. D18 gate enforces.
- **NFR-4 (Test harness migration).** Tests that imported `AGENT_WRITE_ORIGIN` for identity-based Set.has checks migrate to structural `isPairedWriteOrigin` checks OR to session-specific origin objects. No identity-check regressions.
- **NFR-5 (Cleanup correctness).** 30-minute soak test with repeated MCP subprocess spawn/exit cycles confirms no leak in `sessions` map, awareness state, `agentFocus` map, or `pendingContributors` map.
- **NFR-6 (Backward compatibility).** Greenfield directive waives wire/disk backward compat; however, history refs' `refs/wip/<branch>/server` legacy ref must be rewritten as `refs/wip/<branch>/openknowledge-service` or migrated-to-nothing on first run post-upgrade. No silent commit-history breakage.
- **NFR-7 (Performance).** Per-session UM overhead: measure memory + CPU at N=10 concurrent sessions, 100 transacts each, ensure no regression vs current single-writer path beyond expected per-session proportional cost.

### Acceptance criteria (per FR)

See §9 system design for implementation skeletons and §10 decision log for evidence-linked rationale. Acceptance criteria will be expanded per-FR during the iterative loop; each FR resolves into concrete test cases in the In Scope work before finalization.

## 7) Current state (code-verified, brief)

See [REPORT.md](../../reports/agent-identity-attribution-worldmodel/REPORT.md) for full topology. Highlights relevant to this spec:

- `AgentIdentity` shape in `packages/cli/src/mcp/agent-identity.ts:9-20` (connectionId, clientInfo, label, displayName, colorSeed) — works, flows through tool handlers, but discarded at `persistence.ts:405`.
- `AGENT_WRITE_ORIGIN` shared frozen constant at `agent-sessions.ts:57-61` — no per-session distinction.
- `AgentSessionManager.getSession(docName, agentId)` at `agent-sessions.ts:179-219` — per-`(docName, agentId)` DirectConnection, but `closeAllForAgent` has no production callers.
- `commitWip(history, writer, contentRoot, message, branch)` at `history-repo.ts:126-203` — already takes `WriterIdentity`, but auto-save hardcodes `defaultWriter = {id:'server', ...}`.
- Activity Y.Map, contributor-tracker, AgentFocus — three side-channels at the same write call sites (api-extension.ts:1097, 1182, 1715).
- Observer paired-write check at `server-observers.ts:124-128` is structural (`context.paired === true`), not identity-based — good for per-session origin migration.
- Save-version already per-writer: `history-repo.ts:847-951` iterates `writers[]` correctly; MCP tool at `save-version.ts:45-47` already passes `agent-<connectionId>` writer.
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

### 8.6 History ref topology

Per-session refs: `refs/wip/<branch>/<writer-id>`.

Writer-ID schema:

| Writer ID | Display name | Email | Source |
|---|---|---|---|
| `agent-<connectionId>` | `<agent_type_display> (<short-id>)` e.g. `Claude (a4f2)` | `agent-<connectionId>@openknowledge.local` | MCP subprocess session |
| `<principalId>` (= `principal-<UUID>`) | `<principal.display_name>` | `<principal.display_email>` | Browser principal (D34 — `human-` prefix dropped) |
| `file-system` | `File System` | `file-system@openknowledge.local` | Direct disk edit |
| `git-upstream` | `Git (upstream)` | `git@openknowledge.local` | Project repo HEAD-move import |
| `git-branch-switch` | `Git (branch switch)` | `git@openknowledge.local` | Branch-switch park |
| `openknowledge-service` | `Open Knowledge (service)` | `service@openknowledge.local` | Service-level fallback |

Subject prefixes: `wip:`, `checkpoint:`, `reconcile:`, `import:`, `park:`, `rollback:`, `rename:`. Subjects include target doc path / SHA.

Fan-out mechanics: L2 debounce fires, `swapContributors()` drains snapshot, loop distinct writers in snapshot, emit `commitWip(history, writer, contentRoot, `${subject}: ${target}`, branch)` per writer. All per-writer commits share same tree SHA for that drain.

### 8.7 Structured `ok-actor:` body

Each history commit's body includes one or more lines:

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

Storage location for the activity log is an Open Question (§11 Q1). Candidates: Y.Map on doc (replicates to clients, needs eviction), separate server-side store, history-body annotations. Resolution pending prototype/investigation.

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
                         │            commitWip(history, writer, ...)     │
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
| D6 | Per-session history WIP refs (Option A: doc-state-after-this-session's-write semantic). Not isolated-contributions (Option B), not baseline-diff (Option C). | Tech | LOCKED | Yes | Option A feasible + mostly pre-built (save-version path precedent); Option B infeasible on Y.js v13 without fork; Option C high cost, marginal gain. | `evidence/crdt-to-git-translation.md §4` | Each session's ref is an "activity trail" (when-this-session-wrote + doc-state-then), NOT a blame-by-agent view. UX language must reflect this. |
| D7 | Writer-ID schema: (γ) triggering session for human/agent-initiated actions; (β) classified for non-attributable service actions. | Cross-cutting | LOCKED | Yes | Staff-engineer answer under directive: most-informative attribution for each action. Attribution-completeness sweep already in-scope covers the threading. | Conversation 2026-04-18 + REPORT §12.3 | Rename, rollback, save-version, create-page etc. attribute to the triggering session. File-watcher, HEAD-moves, branch-switch-parks use classified writers. |
| D8 | Writer-ID naming + subject-prefix scheme (see §8.6 tables). | Cross-cutting | LOCKED | Partial — naming can evolve but semantic split (identity vs action) is locked. | Separating writer (identity) from subject-prefix (action) avoids the "external" fuzziness. Each ref is single-purpose. | Conversation 2026-04-18 | Git log is legible by writer AND by subject. Classified writers: `file-system`, `git-upstream`, `git-branch-switch`, `openknowledge-service`. |
| D9 | Principal = stable UUID + git-config display fields (option b2). Persisted to `<contentDir>/.open-knowledge/principal.json`. Display refreshed each server start; ID immutable. | Product/Tech | LOCKED | Yes (format of principal.json is a 1-way door on-disk schema) | Identity survives git config drift; cloud-migration clean; native-feeling git log from user's git config. | Conversation 2026-04-18 | New file `.open-knowledge/principal.json`. Likely gitignored by default. |
| D10 | Timeline primary unit: session as storage/UM boundary; burst as derived render view (grouped by user-edit interleaving via shared `bucketIntoBursts` utility). | Product/Tech | LOCKED | No | Storage is mechanical (session = UM lifetime). Burst matches how users think about "agent's recent chunk of work." Sharing the grouper in `core` prevents per-surface divergence. | Conversation 2026-04-18 + STORY §14 D9 | New `packages/core/src/burst-grouping.ts`. Timeline/presence/halos consume the utility. |
| D11 | Session lifecycle cleanup: wire server-side keepalive-WS close handler to call `sessionManager.closeAllForAgent(connectionId)` + `agentFocusBroadcaster.clearFocus(connectionId)`. 30-min idle-shutdown is fallback. | Tech | LOCKED | No | Fixes REPORT §12.3 ghost-agent leak. `pid` query param on keepalive URL + initial handshake message lets server correlate to `connectionId`. | REPORT §12.3 | Server now tracks `pid → connectionId` mapping. `/collab/keepalive` handler extends. |
| D12 | Main-git save-version: `Author = principal_display_name <principal_display_email>`, `Committer = same` (matches user's git config), `Co-Authored-By:` trailer per contributing agent session. | Product | LOCKED | Partial — the trailer format is a GitHub-rendering contract. | GitHub/GitLab natively render `Co-Authored-By:`; matches on-behalf-of framing; principal-author is what user expects to see in their git log. | Conversation 2026-04-18 | `save-version.ts` MCP tool threads writers[] AND generates co-author trailer list from session registry. |
| D13 | History repo: `Author = agent_display (session short-id)` for agent sessions; `Author = principal_display` for human sessions; classified for non-attributable. All commits carry structured `ok-actor:` body lines. | Tech | LOCKED | Yes | Every historical attribution query runs off git natively; no session-registry dependency for historical queries (session registry is ephemeral). | `evidence/crdt-to-git-translation.md §3` + conversation | History write path generates `ok-actor:` body line from session metadata at commit time. |
| D14 | Headless agents: data model supports `{principal: null, agent_session}` tuple. No UI affordances shipped in this spec. Future spec adds UX when a concrete headless-agent product case lands. | Product | LOCKED | No | "Best architecture without over-engineering" — honor the tuple shape, don't pre-build UI for unseen use case. | Conversation 2026-04-18 | Tests assert `null` principal case. UI assumes `principal != null` for rendering but doesn't reject `null` data. |
| D15 | Identity attestation deferred to Future Work (Explored tier). MCP has no attestation primitive today; `clientInfo.name` self-reported is accepted. | Cross-cutting | LOCKED | No | Prerequisite (MCP protocol evolution or in-repo trust substrate) doesn't exist. Not pragmatism-deferral — genuinely out of foundation scope. | `evidence/yjs-attribution-verification.md` + STORY §14 | Noted in §15 Future Work. Revisit triggers documented. |
| D16 | Attribution completeness sweep: thread identity through `handleRename`, `handleRollback`, `handleSaveVersion`, `handleCreatePage`, `handleDeletePath`, `handleSuggestLinks`, `handleApplyLinks`. MCP tools `rename-document.ts`, `rollback-to-version.ts` extended to pass `identityRef`. | Tech | LOCKED | No | Greenfield + no-deferred-debt directive: all mutating endpoints MUST attribute under the coherent model. | REPORT §12.3 | Each endpoint gains `extractAgentIdentity` call + writer-ID resolution. |
| D17 | TQ13 cleanup completion: remove dangling `/api/agent-undo*` callers across CLI, MCP tools, test harness. Repoint Hocuspocus liveness probe. | Tech | LOCKED | No | Greenfield + no-deferred-debt; current 404s are residue from V0-16 scaffold removal. | REPORT §12.2 | Multi-file cleanup across CLI and test harness. |
| D18 | `isPairedWriteOrigin` stays structural (`context.paired === true`), not identity-whitelisted. Per-session origins can't use identity-based paired check anyway (N origins, not one). | Tech | LOCKED | No | Structural check already in place; per-session origins naturally work with it. Identity whitelist would require an enumeration scheme that fights the per-session model. | `server-observers.ts:124-128` | No code change; decision is to keep current behavior and document it. |
| D19 | Branch-switch park is per-session: each active session's ref advances with a park commit (subject `park: <old-branch> → <new-branch>`). Park is not a collapse-to-single-ref. | Tech | LOCKED | Partial — park mechanics can evolve, but per-session preservation is load-bearing. | Greenfield directive favors semantic preservation of per-session history even through branch switches. | Conversation 2026-04-18 | `standalone.ts:parkBranch` refactors to iterate active sessions. `readParkedState` signature changes. |
| D20 | Burst boundary rule: a burst is a maximal contiguous sequence of a session's transactions such that no human edit timestamp falls strictly between consecutive transactions. Timestamps from history commit author-date + human-edit awareness events. | Product/Tech | DIRECTED | No | Simplest rule that matches user intuition. Can refine later if product research surfaces better rule. | STORY §14 D9 direction | `bucketIntoBursts` implements this rule. UX tests validate grouping against concrete scenarios. |
| D21 | Y.UndoManager internal undo transaction handling: rely on UM auto-adding itself to `trackedOrigins`. Per-session UM's `trackedOrigins = new Set([session.origin])` (writes only). | Tech | LOCKED | No | UM auto-adds self at `UndoManager.js:181`; required for redo stack. Adding `session.undoOrigin` would wipe redo on replay. | `evidence/um-mechanics.md` Q12/Q14 | Belt-and-suspenders: `captureTransaction: tr => tr.origin !== session.undoOrigin` as defense-in-depth. |
| D22 | Effect-diff derivation via `YTextEvent.delta` (Yjs-native observer event). NOT via `transaction.changed` (wrong shape) or pre/post snapshot diff (O(n·m)). | Tech | LOCKED | No | `transaction.changed` is `Map<Type, Set<String|null>>` — just keys, not content. `YTextEvent.delta` is Quill Delta ops computed free during observer fan-out. | `evidence/um-mechanics.md` Q13 | Capture delta inside `ytext.observe` bound to session write path. |
| D23 | Origin object deep-freeze: `Object.freeze(origin)` AND `Object.freeze(origin.context)` at session creation. | Tech | LOCKED | No | `Object.freeze` is shallow. Yjs doesn't mutate origins, but app-layer accidental mutation is a real risk; deep-freeze gives strict-mode throw on mutation. | `evidence/um-mechanics.md` Q15 | One-time cost at session init. |
| D24 | `captureTimeout = 500` (Y.UndoManager default) for per-session Agent UM. | Tech | LOCKED | No | Collapses agent reply-bursts (typical 100-400ms between tool calls) into one undo step — matches user mental model "undo the agent's last turn." Explicit `stopCapturing()` at reply boundaries if needed. | `evidence/um-mechanics.md` Q16 | Override via session-level `um.stopCapturing()` at explicit boundaries. |
| D25 | Per-session UM scope: `new UndoManager([ytext, metaMap, activityMap], { trackedOrigins, captureTimeout: 500, captureTransaction })`. All Y-types written in an agent transact become one undo step. | Tech | LOCKED | Yes | Agent writes touch Y.Text (source) + Y.Map('metadata') + Y.Map('activity') inside ONE transact (`agent-sessions.ts:93-163` + api-extension caller). UM must scope all three for one-undo-per-write semantics. | `evidence/history-and-sweep.md` Q38 | Updates FR-3: UM scope is the array, not just ytext. |
| D26 | Session UM destruction: explicitly destroy `session.um` on doc unload (`captureAndCloseDocuments`), doc delete (`handleDeletePath`), managed-rename (affecting session's doc). | Tech | LOCKED | No | Hocuspocus `unloadDocument` doesn't call `ydoc.destroy()`; UM would hold stack items pointing at orphaned Y.Items → silent undo-to-orphaned-doc data loss. | `evidence/um-mechanics.md` Q47/Q48 | Tear-down sites: rename path, delete path, doc unload path. |
| D27 | Keepalive → connectionId correlation: URL query param `?connectionId=<UUID>&pid=<pid>`. Server parses in upgrade handler, stashes on WS instance, reads in close handler for cleanup routing. | Tech | LOCKED | No | Simplest + same-channel-as-liveness (no desync). `pid` retained for idle-shutdown logging compat. | `evidence/session-lifecycle.md` Q17 | Refines FR-14. One-line client change at `keepalive.ts:137`. Server change at `start.ts:434-456`. |
| D28 | WS close cleanup grace: 30s cancellable timer. On `upgrade` with same `connectionId` during grace, cancel timer (session continuity preserved). After grace, fire `closeAllForAgent(connectionId)` + `clearFocus(connectionId)`. | Tech | LOCKED | No | Matches HocuspocusProvider `messageReconnectTimeout` default + y-protocols awareness-outdated default + typical laptop-sleep/TCP-retransmit windows. | `evidence/session-lifecycle.md` Q18 | Prevents false-positive cleanup on transient WS drops. |
| D29 | Subprocess reconnect = always new session. Fresh `connectionId`, fresh UM stack, fresh `refs/wip/<branch>/agent-<newUUID>`. No resume-by-label. | Product | LOCKED | No | Per-session distinctness (G2) locked. User-intent on restart = fresh context. History repo history retained via per-session refs + 30d GC. Resume-by-label deferred as opt-in flag only if user research surfaces pain. | Conversation 2026-04-18 + directive | Directly addresses Q19 from backlog triage. |
| D30 | `AgentSessionManager.getSession` gains in-flight promise dedup: `Map<sessionKey, Promise<DirectConnection>>`. Concurrent first-calls share one pending promise. | Tech | LOCKED | No | Current code has latent race: `sessions.has(key)` → `await openDirectConnection` → `sessions.set(key)` is not async-safe. Under F1, race produces double UM + orphaned DirectConnection. | `evidence/session-lifecycle.md` Q20 | Fix latent bug as part of F2 implementation. Test: concurrent `getSession` calls → one `openDirectConnection` invocation. |
| D31 | `persistence.ts:onStoreDocument` signature extension is a single-file change. Destructure `{document, documentName, lastTransactionOrigin, lastContext}`. No other consumer of `onStoreDocumentPayload` in this repo. | Tech | LOCKED | No | Grep-verified: `persistence.ts:405` is the only runtime consumer. Hocuspocus payload type additive. | `evidence/session-lifecycle.md` Q28 | Addresses FR-16. |
| D32 | Remote-arrived transaction origin dispatch: structured. `{source:'local'}` with `context.session_id` → `agent-<session_id>`. `{source:'connection'}` with `connection.context.principalId` → that principal's ref. Else → `openknowledge-service`. | Tech | LOCKED | No | Hocuspocus wraps remote WS transactions in `{source:'connection', connection}` (MessageReceiver.ts:188-220), NOT Yjs-internal sentinels. | `evidence/session-lifecycle.md` Q29 | Requires Q2 (human-principal hoisting into `connection.context`) to fully route human writes under `principal-<UUID>` writer. |
| D33 | GPG signing + user hook split preserved: history commits via `git commit-tree` (plumbing, bypasses both — internal refs); main-git save-version via `pg.commit()` (porcelain, honors `commit.gpgSign` + fires `pre-commit`/`commit-msg` hooks). | Tech | LOCKED | No | History repo is internal; signing/hooks would be ceremony. Main-git is user-facing; user expects their configured hooks/signing. | `evidence/history-and-sweep.md` Q23 | Document the split in §8.8. |
| D34 | Ref naming: drop `human-` prefix. Schema is `refs/wip/<branch>/{agent-<connId>|<principalId>|<classified>}` where `principalId` = `principal-<UUID>`. | Tech | LOCKED | Yes | Principal ID already starts with `principal-`; second prefix is stuttering. Three distinguishable visual classes. | `evidence/history-and-sweep.md` Q24 | Updates §8.6 ref table + §5 P4 journey. |
| D35 | Legacy `refs/wip/<branch>/server` refs deleted on first-run post-upgrade. No archive, no rename. Idempotent sweep in `initHistoryRepo` completion. | Tech | LOCKED | No | Greenfield waives backward compat. Archive serves no consumer; rename to `openknowledge-service` misrepresents past attribution (legacy bundled agent work). | `evidence/history-and-sweep.md` Q26 | Closes Q9. Metric + bracket-prefixed log on sweep. |
| D36 | Git identity sanitization: shared `sanitizeGitIdentity()` utility strips `<>`, CRLF, trim + slice(128). Applied at `extractAgentIdentity` + principal.json → WriterIdentity boundaries. | Tech | LOCKED | No | Git author format forbids `<>` and CRLF in name. User git-config names can contain special chars; agent emails (UUID-based) are safe. | `evidence/history-and-sweep.md` Q27 | New utility in `packages/server/src/git-identity-sanitize.ts`. |
| D37 | Effect-diff capture error handling: log structured JSON event + increment metric + dev-mode throw (fail-loud). Production swallow; transact commits regardless. | Tech | LOCKED | No | Effect-diff is a UX side-channel; losing one entry must not break agent writes. Dev-mode throw makes regressions loud during development. | `evidence/history-and-sweep.md` Q30 | Metric `effectDiffCaptureFailures` in `metrics.ts`; event `effect-diff-capture-failed`. |
| D38 | L2 drain per-writer partition: loop distinct writers in contributor snapshot, one `commitWip` per writer. Per-writer failure restores ONLY that writer's entries via new `restoreContributorEntry()`. Per-writer failure counters. | Tech | LOCKED | No | Matches per-writer tmp-index isolation (`history-repo.ts:133`). Global all-or-nothing creates head-of-line blocking and attribution corruption on partial failure. | `evidence/history-and-sweep.md` Q31 | New helper in `contributor-tracker.ts`. |
| D39 | Park mutex: move `setBatchInProgress(true)` BEFORE the park loop (currently after). | Tech | LOCKED | No | Yjs internal lock serializes transacts; during park, concurrent transacts land in Y.Doc but don't flush to L1 (batch-gate). Park captures at `serializeDoc` instant; reset-phase overwrite is known tolerated loss. | `evidence/history-and-sweep.md` Q33 | One-line reorder at `standalone.ts:1058`. |
| D40 | Park commits land on each active session's OWN ref (`refs/wip/<old-branch>/<session-writer-id>`) with subject `park: <old-branch> -> <new-branch>`. `git-branch-switch` classified writer NOT used for park. | Tech | LOCKED | Yes | Reconciles D19 (per-session park) with D8 (writer=identity, subject=action). Author is the session; action is park. Restore loop walks per-session refs on old branch, reads latest commit matching subject `park:`. | `evidence/history-and-sweep.md` Q34 | Resolves D19/D8 tension. |
| D41 | `applyExternalChange` calls `recordContributor` equivalent with writer-id `file-system` (display: `File System <file-system@openknowledge.local>`). | Tech | LOCKED | No | Fixes silent-fold-under-agent-commit bug under FR-6. Concurrent agent + file-watcher writes produce TWO commits (`agent-<connId>` and `file-system`) sharing the same tree SHA, distinct commit SHAs. | `evidence/history-and-sweep.md` Q35 | Extends `recordContributor` signature or adds `recordFileSystemChange(docName)`. |
| D42 | FR-5 attribution sweep covers 9 mutating handlers: `handleSaveVersion`, `handleRollback`, `handleCreatePage`, `handleRename`, `handleRenamePath`, `handleDeletePath`, `handleUploadImage`, `sync/resolve-conflict`, future `handleApplyLinks`. GET-only handlers + test-reset + local-op/* excluded. Meta-test scans route registry and asserts coverage. | Tech | LOCKED | No | Every mutating endpoint gets identity threading; meta-test enforces future endpoints inherit the pattern. | `evidence/history-and-sweep.md` Q36 | Expands FR-5 beyond the initial SPEC text. |
| D43 | AgentFocus push-nav fires on `agent-undo` origins AND `rollback-apply` origins. Does NOT fire on `managed-rename`. | Product | LOCKED | No | Agent-undo matches "Claude corrected itself" UX (user wants to see the correction). Rollback is a user-triggered action (user wants to see the restore result). Rename is structural — yanking the user on file moves is noise. | Directive + conversation | Closes backlog Q37. |
| D44 | Closed-session UI: on cleanup (post-D28 grace), remove from presence. Timeline retains historical activity rendered from edit history. | Product | LOCKED | No | Matches "best UX without over-engineering" — no ghost states, no persistent-until-doc-close noise. Grace window already covers transient reconnects invisibly. | Directive + conversation | Closes backlog Q42. |
| D45 | Save-version is graceful across project-repo availability. History checkpoint always lands (always, regardless of project git state — D56 unifies the location). Parent-git commit + `ok/v<N>` tag is best-effort: attempted when `projectDir` points to a git repo; silently skipped with non-fatal warning otherwise. Response returns `versionTag: undefined` when skipped. Transitions (user runs `git init` later) heal forward — next save-version tags normally. No retroactive backfill of past history-only checkpoints. No user-facing "run git init" prompt. | Product/Tech | LOCKED | No | Matches existing code's non-fatal wrap at `api-extension.ts:1877-1897`. Doesn't disable save-version in non-git dirs (reversing my earlier sloppy lock). Heals forward on state transitions. | Conversation 2026-04-18 + `api-extension.ts:1871-1897` | Closes backlog Q50. |
| D46 | Observability conventions per-path: bracket-prefix + Pino structured fields for operational events (agent-session create/destroy, keepalive-close cleanup, L2 drain fan-out, principal creation, legacy ref migration); structured JSON (`console.warn(JSON.stringify(...))`) for counted/tested events (effect-diff-capture-failed, attribution-gate failures). | Tech | LOCKED | No | Matches AGENTS.md §Logging conventions: Pino for human-readable operational; structured JSON for aggregator-consumable + test-asserted. | `evidence/history-and-sweep.md` Q44 | Per-path log-shape guidelines. |
| D47 | Testing strategy per FR: unit per new module, integration in `bridge-matrix.test.ts` + new `session-cleanup.test.ts` + `persistence-fan-out.test.ts`, fuzzer extension (FR-17 adds `agent-undo` op + `AGENT_UNDO_ORIGIN` surface to `WRITE_SURFACE_TO_OP_KIND`). Meta-test for FR-5 route coverage. NFR-5 30-min soak in tier 2. NFR-7 per-session UM perf test in tier 2. | Cross-cutting | LOCKED | No | Maintains tier-1 budget <2m30s warm; puts soak + perf in nightly tier; fuzzer extension satisfies D18 coverage gate. | `evidence/history-and-sweep.md` Q45 | Updates NFR-3/NFR-5/NFR-7 acceptance. |
| D48 | Documentation strategy: (1) add 2 AGENTS.md precedent entries — "Per-session actor identity at origin" and "Classified writer IDs + subject-prefix action encoding"; (2) update `docs/content/internals/agent-write-path.mdx`; (3) inline comments at F1 site, L2 drain fan-out, history-repo writer-ID table, `extractAgentIdentity`. No READMEs. | Cross-cutting | LOCKED | No | AGENTS.md is the canonical precedent list; docs/internals is user-facing reference; inline comments at load-bearing sites anchor the pattern. | `evidence/history-and-sweep.md` Q46 | Documentation landing scoped. |
| D49 | Activity log is a **server-side store** (file-based or embedded KV — matches existing `backlink-index` pattern). Keyed by `(docName, session_id, transact_index)`. Retention: rolling 30 days OR 500 entries per session, whichever is smaller (server-side eviction on write). CC1 broadcaster on `__system__` Y.Doc fires `{ch:'activity', docName}` on session writes; clients re-fetch `/api/activity-log?doc=<name>` on signal to update timeline/halo views. Y.Doc state is NOT bloated with per-transact metadata. | Tech | LOCKED | Yes | Y.Map-on-doc replication would bloat Y.Doc state over time (500 entries × 10 sessions × 30 days = MB-scale ambient per-doc; every connect pays the download cost). CC1 + REST + server-store matches established precedent (backlink-index, file-index). Activity log is metadata, not content. | Directive + conversation 2026-04-18 + CLAUDE.md CC1 section | Closes backlog Q1 + Q10 + Q11. Name distinction vs D55: "activity log" = short-term stream; "history" = durable record. |
| D50 | Human browser principal + tab-session hoisting: browser tabs set `ConnectionContext = { principalId, tabSessionId }` via `onAuthenticate` hook. Server uses `connection.context.principalId` to resolve human writes to `refs/wip/<branch>/<principalId>`. `tabSessionId` for per-tab distinction in real-time presence but NOT for separate history refs (all tabs share principal). | Tech | LOCKED | Yes | F1 symmetric for humans: per-tab-session origin objects on the browser side (TipTap/CodeMirror extension injects session context). Simpler history topology (one ref per principal) matches "per-principal activity trail" product intuition. | Directive + `evidence/session-lifecycle.md` Q29 | Closes backlog Q2. Requires browser-side code changes. |
| D51 | Principal `.open-knowledge/principal.json` gitignored by default. `ok init` adds `.open-knowledge/principal.json` to `.gitignore`. Users on shared dev machines can override. | Product | LOCKED | No | Principal file is machine-specific identity. Safer to not commit by default; power-users can opt in via project config. | Directive | Closes backlog Q5. |
| D52 | `openknowledge-service` writer is for truly unattributable writes only (startup fsync, migration scripts, test-reset if it ever commits). Current audit reveals no existing caller; reserve for future. | Tech | LOCKED | No | Narrow fallback definition avoids the "server" writer becoming a grab-bag again. | `evidence/history-and-sweep.md` Q36 | Closes backlog Q7. |
| D53 | Subject-prefix target format: `wip: <docName>`, `checkpoint: <user-message>`, `reconcile: <docName>`, `import: <N> commits from <remote/branch>`, `park: <old-branch> -> <new-branch>`, `rollback: <docName> to <short-sha>`, `rename: <old> -> <new>`. | Tech | LOCKED | No | Consistent "target after prefix" convention; short-SHA (7 chars) enough for grep; human-readable. | Directive + conversation | Closes backlog Q8. |
| D54 | Per-writer GC TTL: 30 days for session writers (`agent-<connId>`, `<principalId>`). Classified writers (`file-system`, `git-upstream`, `git-branch-switch`, `openknowledge-service`) never GC'd (their identity is stable). | Tech | LOCKED | No | 30 days accommodates typical vacation / mid-term project returns. Power-user override via config if needed. | Directive | Closes backlog Q3. |
| D55 | **Naming: history + activity (retires the "shadow" label).** Internal concept previously labeled "shadow repo" is renamed to "history repo" throughout code, spec, docs, log prefixes, evidence, and prose. Per-transact effect-diff store is named "activity log" (D49). Two semantic layers: **history** = complete, durable edit record (git-backed, authoritative; read by `/api/history`, History panel UI, save-version, rollback); **activity log** = short-term, high-granularity stream (server-side, CC1-broadcast invalidation; read by graph halos, presence "recently edited," timeline burst cards). Aligns with the existing `/api/history` endpoint + UI "History panel" + user mental model + three of four existing terms. File renames (old→new): the file currently named `packages/server/src/shadow-repo.ts` becomes `history-repo.ts`; `shadow-lock.ts` → `history-lock.ts`; `shadow-branch-gc.ts` → `history-branch-gc.ts`; `shadow-repo-layout.ts` → `history-repo-layout.ts`. Symbol renames: `ShadowHandle`→`HistoryHandle`, `initShadowRepo`→`initHistoryRepo`, `shadowGit`→`historyGit`, `shadowRef`→`historyRef`. Ref namespace (`refs/wip/*`, `refs/checkpoints/*`) unchanged — internal-git convention. Log prefix `[shadow]`→`[history]`. | Cross-cutting | LOCKED | Partial — on-disk paths + API + log-prefix strings are 1-way doors; internal symbol rename is mechanical. | "Shadow" is accidental drift; "history" maps to API + UI + user model. No-deferred-debt + clean-precedents directive: fix now. | Conversation 2026-04-18 | Add AGENTS.md precedent entry: "History = durable git-backed edit record; Activity log = short-term per-transact stream." |
| D56 | **Unified state directory: `.open-knowledge/`** for ALL Open Knowledge metadata. Subdirectories: `config.yml`, `principal.json`, `history/` (the git-backed history repo, formerly labeled "shadow"), `*.lock` files. No bifurcation between the two legacy locations (standalone `<root>/.openknowledge/` and integrated `<root>/.git/openknowledge/`); single unified location regardless of project git state. Auto-added to project `.gitignore` on first run (single entry `.open-knowledge/`). First-run migration on upgrade: if either legacy location exists, atomically move its contents to `<root>/.open-knowledge/history/` via `rename()`; log `[history-migration] relocated history from <old-path> to <new-path>`. | Tech | LOCKED | Yes (on-disk path contract) | Eliminates the `openknowledge` (no hyphen) vs `open-knowledge` (hyphenated) naming drift that existed between shadow dirs and config dirs. Eliminates integrated/standalone mode bifurcation. Transition scenarios (user runs `git init` later) become non-events — history location is state-independent. | Conversation 2026-04-18 + history-repo.ts current-code mode detection | Affects server + CLI + docs + `init` command. Migration is idempotent. |

## 11) Open questions

All initial Q1-Q11 resolved by D35-D54 during iterative loop. Residual uncertainties:

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1-Q11 | (Initial backlog) — all resolved | — | — | — | See Decision Log D35, D49-D54 | CLOSED |
| Q100 | Per-session-park conflict merge policy (narrow case): if two active sessions both parked state on the same doc on the old branch, on restore the target-branch doc has two `(markdown, diskSnapshot)` pairs. Which to prefer, or merge both via `reconcile()` sequentially? | Tech | P2 | No | Enumerate during implementation; typical active-session-per-doc is 1, so this is a rare edge. Likely simplest: iterate in session-age order, reconcile each against disk in turn. | OPEN |
| Q101 | `handleApplyLinks` existence + identity threading. FR-5 enumerates it as a candidate but it may not exist yet as a distinct endpoint. Audit + thread if present. | Tech | P2 | No | Grep `apply-links` during implementation; if absent, drop from FR-5 list; if present, thread identity. | OPEN |
| Q102 | Agent-type registry extensibility (backlog Q53). Closed hardcoded registry (`iconFromClientName`) vs config-driven extension via `.open-knowledge/config.yml`. Today any unrecognized `clientInfo.name` falls to `bot` icon. | Product | P2 | No | Monitor product-research signals on unknown-agent-client frequency; defer until concrete demand. | OPEN (deferred) |
| Q103 | Agents-of-agents nested sessions (backlog Q51). If Claude Code orchestrates Claude Haiku via tool calls, does Haiku get its own session or inherit Claude Code's? Tuple shape for nested agents? | Product/Tech | P2 | No | Deferred — no current product surface; data model supports nested-agent interpretation if future case demands. | OPEN (deferred) |
| Q104 | Cross-session UndoManager behavior: if agent session S1 writes, session S2 writes over S1's content, S1 calls `um.undo()` — S1's UM reverts S1's write, but S2's write may not cleanly reverse. What's the user-visible result? Stack-item validity under interleaved writes needs empirical validation via the existing bug-d-v0-14 fuzzer extension. | Tech | P0 | No (spec-level semantics covered; implementation edge) | Covered by FR-17 fuzzer op-set extension (D47). Investigate empirically during implementation; document expected behavior in a test. | OPEN |
| Q105 | ProvidedBy observability scope: should effect-diff Y.Map replication to clients include principal + connection metadata (enables clients to render "this edit was by Alice's Claude") or only the anonymous session_id (client resolves via separate presence registry read)? | Product/Tech | P2 | No | Default: include session_id + agent_type + color only; clients resolve principal via awareness + presence. Minimizes replicated data. Revisit if UX demands richer inline. | OPEN (default set) |

## 12) Assumptions

- **A1 — MCP `connectionId` stability.** The `identityRef.current.connectionId` is stable across all tool calls in one MCP subprocess lifetime. Verified today via `randomUUID()` at `mcp/server.ts:290` and closure capture in tool handlers. If MCP subprocess pattern changes (e.g., reconnecting clients in HTTP transport with new handshakes), this assumption must be re-verified.
- **A2 — `isPairedWriteOrigin` structural check remains load-bearing.** D2's per-session origins depend on this. If a future change forces identity-based paired checks, D2's mechanism breaks. Test case locks it in.
- **A3 — Y.js v13.6.30 item API is stable.** `Item.id.client/clock`, `transaction.origin`, `stack-item-added` event payload shape — all consumed by FR-11. If Y.js minor version bumps change these, spec-time test catches it.
- **A4 — Git config user.name/user.email are reasonably stable for same-machine usage.** Local identities don't drift rapidly. D9's "refresh display each server start" handles intentional updates. Rare edge case (user runs Open Knowledge + changes git config mid-session) produces display drift that's acceptable.
- **A5 — Per-session UM memory cost is bounded.** For typical workloads (1-3 concurrent agents, 100-1000 transacts per session), per-session UMs stay <1MB each. NFR-7 verifies.
- **A6 — Greenfield waives backward compat for history WIP refs.** Legacy `refs/wip/<branch>/server` refs produced pre-spec can be archived-and-fresh-started on upgrade; users are warned.

## 13) In scope / out of scope

### In scope (all P0)

1. **F1: Per-session origin objects.** (D2, FR-1)
2. **F2: Session lifecycle + cleanup hooks.** (D11, FR-2, FR-14)
3. **V0-14: Per-session Agent UndoManagers + `AGENT_UNDO_ORIGIN`.** (D3, D4, FR-3, FR-4)
4. **Attribution completeness sweep.** (D16, FR-5)
5. **History ref topology: per-session fan-out + classified writers.** (D6, D7, D8, D19, FR-6, FR-7, FR-18, FR-19)
6. **UX aggregation rules: per-session storage → agent-type render projection.** (D10, FR-12)
7. **TQ13 cleanup completion.** (D17, FR-15)
8. **Main-git save-version attribution schema.** (D12, FR-9)
9. **History repo `ok-actor:` body schema.** (D13, FR-8)
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
| Principal UUID leaks to history body + potentially git log → privacy concern | Low | Low | UUID is opaque; display fields (not UUID) appear in git author; structured body is history-only, not main git. Document. |
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
- `packages/server/src/agent-sessions.ts`, `api-extension.ts`, `persistence.ts`, `contributor-tracker.ts`, `history-repo.ts`, `server-observers.ts`, `agent-focus.ts`, `file-watcher.ts`, `external-change.ts`, `reconciliation.ts`, `head-watcher.ts`, `history-branch-gc.ts`, `standalone.ts`
- `packages/server/src/principal.ts` (NEW)
- `packages/server/src/activity-log.ts` (NEW)
- `packages/core/src/burst-grouping.ts` (NEW)
- `packages/core/src/types/{awareness,actor,link-graph,principal}.ts` (extend or add)
- `packages/core/src/history-repo-layout.ts` (extend `ok-actor:` parsing)
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
- Any destructive schema change to history repo refs beyond the D19 / Q9 archive-and-fresh-start migration.
- Any plan to emit a commit with an opaque `server` writer (pre-spec debt).

**ASK_FIRST** — Confirm before proceeding:
- (All original P0 questions Q1-Q11 resolved by D21-D54 during iterative loop. No outstanding blockers.)
- For residual open questions Q100-Q105 (see §11): implementer may proceed with the plan noted in each row; surface only if empirical findings contradict the stated approach (e.g., Q104 cross-session undo test reveals problems).

---

*Spec generated via `/spec` skill on 2026-04-18. Iterative loop substantially complete; 54+ decisions locked. Ready for Audit phase (Task 9).*
