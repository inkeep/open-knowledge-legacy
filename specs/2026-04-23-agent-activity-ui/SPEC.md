---
title: Agent Activity UI — Spec
description: Three UX surfaces that make concurrent-agent edits legible — presence bar, inline margin bursts, and the activity panel.
tags: [spec, agent-ui, presence, attribution]
status: draft
depends_on:
  - specs/2026-04-18-agent-identity-attribution-foundation/SPEC
informs:
  - reports/agent-follow-and-edit-visibility-ux/REPORT
---
# Agent Activity UI — Spec (2026-04-23, revised)

> **2026-04-23 revision note.** This SPEC originally proposed six surfaces (U1–U6). User feedback on the same day cut the scope to **three** surviving surfaces: **U1 presence bar**, **U3 inline margin bursts**, and **U5 activity panel** (which now has its own child spec [[specs/2026-04-23-agent-activity-panel/SPEC]]). Dropped: **U2 filetree presence badges**, **U4 Follow / multi-pin**, **U6 workspace activity feed**. Rationale: agents make rapid many-file edits — any UI that decorates the filetree or auto-navigates the editor creates attention churn. The activity panel replaces both passive-glance + auto-follow patterns with user-pull inspection. Dropped surfaces live in §12 Future Work.
>
> **Relation to identity foundation.** This spec is pure UX synthesis on top of [[specs/2026-04-18-agent-identity-attribution-foundation/SPEC]]. That spec ships the runtime primitives — per-session origins, agent-presence awareness, bounded agent-effects ring buffer, per-session UM, classified writer IDs, `bucketIntoBursts`, subject-prefix history.
>
> **Relation to research.** The surface inventory, terminology, and several *"don't"* decisions come from [[reports/agent-follow-and-edit-visibility-ux/REPORT]] — Notion-over-Figma pulse. Where the report lists options, this spec chooses one.
>
> **Precedence.** On conflict: identity foundation wins on primitives; this spec wins on UI semantics for U1 + U3; the panel spec wins on panel semantics.

## 1. Problem

Agents are already writing to this repo concurrently via `applyAgentMarkdownWrite`, `applyAgentUndo`, and the agent-effects ring buffer. Users cannot:

- See **who is editing right now** and **which doc each is in** (only the active doc's `PresenceBar` surfaces humans today).
- See **what changed** when they return to a doc an agent touched five minutes ago (the cold `Y.Map('agent-flash')` replay is per-transaction and fleeting).
- **Review** an agent's session-wide work across files, with per-file diffs and scoped revert.

The identity foundation gives every agent edit a classified writer ID, per-session origin, burst groupability, and bounded effects ring-buffer. Those primitives land unrendered; this spec (plus its child panel spec) renders them.

## 2. Goals / Non-goals

### Goals

- **G1** — User always knows which agents are active in the workspace right now, which doc each is working in, and whether they're currently writing.
- **G2** — User can see the most recent agent edits on the currently-open doc as a persistent, bucketed inline timeline (not just a fleeting flash).
- **G3** — User can click any agent's avatar in the presence bar to open an Activity Panel showing per-file diffs + scoped undo for that agent's session. *(Specified in *[[specs/2026-04-23-agent-activity-panel/SPEC]]*.)*

### Non-goals (this iteration)

- **NG1** — **Filetree presence badges.** Decorating the sidebar with per-doc "agent here" indicators creates visual noise proportional to tree size × agent count. Dropped; Activity Panel is the inspection surface.
- **NG2** — **Follow / auto-navigation.** Automatically moving the user's editor to wherever an agent writes hijacks attention. Users who want to see an agent's file open it explicitly via the Activity Panel.
- **NG3** — **Workspace-wide activity feed.** A flat cross-agent chronological list is deferred; the Activity Panel per-agent view covers the common case. Revisit if multi-session awareness becomes insufficient.
- **NG4** — Agent prompting / invocation UX. Covered by MCP host UX.
- **NG5** — Remote agents (agents on a different machine). Presence is scoped to local Hocuspocus + MCP.
- **NG6** — Trust / security / permission boundaries between agents. Every agent with a keepalive WS has full write access.
- **NG7** — "Agent chat" / conversational interface. The UI is a passive observer + intervention surface.
- **NG8** — Mobile layouts. Desktop editor only.
- **NG9** — Read-only public share view. Single-user workspace only.

## 3. Users and scenarios

**Persona.** Solo developer ("Miles") running 1–3 Claude / Codex / Cursor sessions concurrently against the same worktree while doing his own WYSIWYG edits. All agents share a single browser principal.

**Scenarios.**

- **S1 Triangulate.** Miles sees "Claude (#a4f2)" writing in `specs/foo/SPEC.md` in the bottom presence bar. He hovers, sees the doc name. He clicks the avatar → Activity Panel opens (see child spec).
- **S2 Cold trail.** Miles returns to `notes.md` — Claude touched it 10 minutes ago while Miles was in a meeting. Inline margin bursts show 3 bursts with per-burst expand/diff. He clicks one → sees the diff inline. He reverts that single burst via the "↶" button.
- **S3 Panel review.** Miles clicks "Codex (#b9c1)" in the presence bar. The Activity Panel (child spec) opens showing the files Codex has touched. He reviews diffs, undoes one file.

## 4. Functional requirements

Three surviving surfaces — **U1 Presence bar**, **U3 Inline margin bursts**, **U5 Activity Panel pointer**. Each requirement cites the foundation primitive it consumes.

### U1 — Presence bar (bottom-of-editor, sectioned)

*Extends the existing [`packages/app/src/presence/PresenceBar.tsx`](packages/app/src/presence/PresenceBar.tsx) + [`use-presence.ts`](packages/app/src/presence/use-presence.ts).*

- **FR-U1.1** — Render two sections: *current-doc participants* (humans + agents whose `currentDoc === activeDocName`) | vertical divider | *cross-doc agents* (agents whose `currentDoc !== null && !== activeDocName`). Same-doc humans first, then same-doc agents, then cross-doc agents right-aligned.
- **FR-U1.2** — Agents are surfaced from the `__system__` `HocuspocusProvider.awareness.agentPresence` map per [`packages/app/src/lib/agent-presence.ts:pickAgentsForDoc`](packages/app/src/lib/agent-presence.ts:92). Humans are surfaced from the per-doc `activeProvider.awareness.getStates()`. Agents NEVER appear in per-doc awareness — `AwarenessUser.type === 'human'` only (see [`packages/core/src/types/awareness.ts:9`](packages/core/src/types/awareness.ts:9)).
- **FR-U1.3** — Agent avatar carries `data-presence-mode={entry.mode}` where `entry.mode` is `'idle' | 'writing'` per [`AgentPresenceEntry`](packages/core/src/types/awareness.ts:94). During `'writing'` the avatar shows a Notion-style pulse (not a Figma-style cursor halo — D-U1 below). Pure CSS animation off the attr — no React render churn.
- **FR-U1.4** — Stale entries (`now - ts >= AGENT_PRESENCE_STALE_MS` = 5 s) filtered client-side. A 1 Hz `setInterval` tick ages them out when no awareness-change events arrive ([`use-presence.ts:51`](packages/app/src/presence/use-presence.ts:51) `TTL_TICK_MS`). `participantsEqual` elides setState when the only diff is `ts`.
- **FR-U1.5** — Overflow: each section's first 4 (current) / 3 (cross-doc) render inline; remainder go into a shadcn `Popover` chip with an avatar stack preview.
- **FR-U1.6** — Cross-doc agent tooltip shows `editing [[doc.md]]` (wiki-link style) + 1-line delta excerpt if available. Navigation from the tooltip is **removed** — users navigate via the Activity Panel's per-file filename click (see child spec). The tooltip is inspection-only.
- **FR-U1.7** — **Click on any agent avatar = open the Activity Panel** for that session. Panel behavior defined in [[specs/2026-04-23-agent-activity-panel/SPEC]]. *(Supersedes prior "click = toggle Follow" — Follow is dropped per 2026-04-23 revision.)*

### U3 — Inline-doc diff bursts (cold trail)

*New consumer of `Y.Map('agent-effects')`. Complements the existing `Y.Map('agent-flash')` flash (D57) — flash is per-transaction and fleeting; this is per-burst and persistent.*

- **FR-U3.1** — Client opens a read-observer on `Y.Map('agent-effects')` for the active doc. Each entry is `{sessionId, timestamp, delta, agent_type, color_seed}` (bounded at 50 per [`RING_BUFFER_LIMIT`](packages/server/src/activity-log.ts) — D49 in foundation).
- **FR-U3.2** — Client groups entries into bursts via [`bucketIntoBursts(sessionTransactions, humanEdits, agentTypeFilter?)`](packages/core/src/burst-grouping.ts) (FR-12 in foundation). Burst windowing is agent-only — interleaved human edits split bursts.
- **FR-U3.3** — Each burst renders as a collapsed strip in the right margin of the editor (both WYSIWYG and source mode). Strip color = `color_seed` hash (same palette as [`graph-colors.ts`](packages/app/src/components/graph-colors.ts)).
- **FR-U3.4** — Click strip → expands an inline diff in place. Shows per-transaction `delta` replayed as CM6 `Decoration.mark` (source) or PM node-attr decoration (WYSIWYG). **Additions** render with a soft bg + ▸ gutter; **removals** render strikethrough in a popover.
- **FR-U3.5** — Each burst strip carries a `↶` revert-this-burst button. Revert dispatches `POST /api/session-revert` with `{scope: 'burst', sessionId, firstTs, lastTs}` (FR-15 in foundation).
- **FR-U3.6** — Ring-buffer eviction: when server-side agent-effects drops an old entry, the client observer naturally drops its strip on next render. Bursts older than the oldest retained entry are silently omitted — a footer chip shows `"+N older bursts — open Activity Panel"` linking to U5. *(Activity Panel reads from shadow-repo git log, unbounded retention.)*
- **FR-U3.7** — Strips auto-collapse after `BURST_STRIP_QUIESCENCE_MS = 15_000ms` of neither expansion nor new burst activity. User can pin a strip open.

### U5 — Activity Panel (click-invoked right-rail inspection)

*Specified in *[[specs/2026-04-23-agent-activity-panel/SPEC]]*.* This section is a pointer; see the child spec for full requirements.

- **FR-U5.1** — **Anchor**: clicking any agent avatar in U1 opens the Activity Panel keyed to that session. (Supersedes this spec's prior U5 always-on right-rail timeline.)
- **FR-U5.2** — **Mount**: right-side shadcn `Sheet`, non-modal, 480 px, overlays without reflowing the editor.
- **FR-U5.3** — **Content**: scrollable list of files the agent edited in this session. Each row is collapsible (carrot expand/collapse); filename click navigates the main editor. Expanded row shows a **chronological list of bursts** (one per `Y.UndoManager` StackItem) — each burst renders its own mini unified diff via `react-diff-view`. Data source is the **per-session `Y.UndoManager.undoStack`**, NOT shadow-repo git diff (shadow commits share tree SHAs across writers per L2 drain, which would leak concurrent writers' content into per-agent diffs — see panel SPEC §1 revision note).
- **FR-U5.4** — **Two undo controls, both per-file, at bottom of each expanded file row**: *"Undo last edit on this file"* (`scope:'last'` + `path`) and *"Undo all edits on this file"* (`scope:'file'` + `path`). Both dispatch `POST /api/agent-undo`. LIFO-only via `Y.UndoManager.undo()` — no cross-file undo, no per-burst ↶ targeting (Y.js is LIFO-only by construction; targeted middle-of-stack undo has no clean native path). Bursts are display-only.
- **FR-U5.5** — **No main-editor hijack**. Panel never auto-navigates. The only navigation affordance is explicit filename click per row.

## 5. Data flow per surface

```
U1 Presence bar
  Server: agent-presence broadcaster (__system__ awareness setLocalState)
       └─> client: HocuspocusProvider.awareness.on('change')
           └─> use-presence hook: pickAgentsForDoc → {current, crossDoc}
               └─> PresenceBar render

U3 Inline bursts
  Server: agent-effects Y.Map ring buffer (captureEffect in applyAgentMarkdownWrite + applyAgentUndo)
       └─> client: Y.Map observer on doc.getMap('agent-effects')
           └─> bucketIntoBursts → BurstStrip[] per active doc
               └─> CM6 Decoration / PM NodeView

U5 Activity Panel (see child spec)
  Server: GET /api/session-activity?sessionId=<agent-connId>
          reads refs/wip/<branch>/agent-<connId> history via git log
       └─> client: AgentActivityPanel render
       └─> Undo: POST /api/agent-undo {scope:'last'|'file'}
```

## 6. Component inventory

### New components

- **`packages/app/src/components/InlineDiffBurstStrip.tsx`** — U3 right-margin strip.
- **`packages/app/src/editor/burst-decorations.ts`** — U3 CM6 `ViewPlugin` over `agent-effects` observer + `bucketIntoBursts`.
- **`packages/app/src/editor/burst-decoration-plugin.ts`** — U3 PM plugin mirror for WYSIWYG.
- *(Activity Panel components — see *[[specs/2026-04-23-agent-activity-panel/SPEC]]* §6.)*

### Extended components

- **`packages/app/src/presence/PresenceBar.tsx`** — add cross-doc section with overflow popover (FR-U1.5); avatar click dispatches `openActivityPanel({sessionId})` per FR-U1.7 (removed Follow-toggle behavior).
- **`packages/app/src/presence/use-presence.ts`** — no signature change; returns grow to include `sessionId` once D-U2 lands.

### New server endpoints

- **`POST /api/session-revert`** — body `{scope: 'burst', session_id, first_ts, last_ts}` → single `rollback:` commit authored by principal. Used by U3 burst revert only. *(Activity Panel uses `/api/agent-undo`, not this endpoint — see child spec.)*

### Identity-foundation consumption summary

| Primitive                                 | Surface(s) | File                                                                                     |
| ----------------------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| `AgentPresenceBroadcaster`                | U1         | [`packages/server/src/agent-presence.ts`](packages/server/src/agent-presence.ts)         |
| `pickAgentsForDoc`                        | U1         | [`packages/app/src/lib/agent-presence.ts:92`](packages/app/src/lib/agent-presence.ts:92) |
| `Y.Map('agent-effects')`                  | U3         | [`packages/server/src/activity-log.ts`](packages/server/src/activity-log.ts)             |
| `bucketIntoBursts`                        | U3         | [`packages/core/src/burst-grouping.ts`](packages/core/src/burst-grouping.ts)             |
| Per-session `session_id` (FR-1)           | U1, U5     | per-session `LocalTransactionOrigin`                                                     |
| Classified writer refs (FR-7)             | U5         | `refs/wip/<branch>/<writer-id>`                                                          |
| Subject-prefix encoding (FR-13)           | U5         | `wip:` / `checkpoint:` / `rollback:`                                                     |
| `ok-actor:` commit body (FR-8)            | U5         | `parseOkActor` in `shadow-repo-layout.ts`                                                |
| `/api/agent-undo` + session-revert (FR-4) | U3, U5     | `applyAgentUndo`                                                                         |

## 7. Decisions

Retained after 2026-04-23 revision. Dropped-surface decisions (follow semantics, filetree color, workspace feed transport) live in §12 Future Work.

### D-U1 — Pulse over cursor halo (RETAINED)

**Notion-style localized pulse (soft bg tint + marginal indicator)** over Figma-style cursor halos for all agent write indicators (U1 avatar, U3 strip fade-in). Rationale: agents write bursts of text, not single character positions — a cursor halo implies a cursor location, which is misleading for a markdown-level write. Pulses match the write-as-event model. From [[reports/agent-follow-and-edit-visibility-ux/REPORT]] §D4.

### D-U2 — Session-id must appear in `AgentPresenceEntry` (RETAINED)

`AgentPresenceEntry` as defined in foundation [`awareness.ts:94`](packages/core/src/types/awareness.ts:94) does NOT carry `session_id`. **Extension required**: add `session_id: string` to the entry. Rationale: U5 Activity Panel keys on `session_id`; displayName is not unique across re-spawned sessions. One-field extension in the broadcaster, counts as foundation-level change.

### D-U7 — Agent-effects retention = 50 entries, no extension (RETAINED)

Foundation D49 locks 50. This spec does NOT re-open that budget. When older bursts are needed, the Activity Panel reads from the shadow repo (unbounded retention via git refs). U3 is deliberately "recent trail", not "full history".

### D-U8 — Revert atomicity at the history-repo layer (RETAINED)

Burst revert with N docs = single `rollback:` commit in the history repo, authored by the browser principal (not the agent). Commit body's `ok-actor` lists affected docs + target shas. Audit trail: *"Miles (principal-6f3a) reverted Claude (a4f2)'s burst at 12:43"*. Surfaces in the Activity Panel (as rollback entry in agent's timeline). Client-side revert atomic via existing `ROLLBACK_ORIGIN` paired-write path.

### D-U10 — U3 uses a separate observer from U1 (RETAINED)

U3 subscribes to `Y.Map('agent-effects')` directly on the active doc's provider. U1 subscribes to the `__system__` provider's awareness. Two independent observers. Rationale: effects are per-content-doc (bounded per-doc ring buffer), presence is cross-doc (one `__system__` map). Co-location would force either unbounded presence or cross-doc effects broadcast that the foundation avoids.

### D-U14 — Color_seed derivation matches identity foundation (RETAINED)

Colors for avatars (U1) and strips (U3) derive from the same `color_seed` field in `ok-actor` bodies (FR-8 in foundation). Default seed: `agent_type` (so `claude` is always orange-ish `#D97757`, etc.). Deterministic hash via existing [`graph-colors.ts`](packages/app/src/components/graph-colors.ts). User override via `.open-knowledge/config.yml` `presence.color_overrides` (future).

### D-U15 — Surface cut to three surviving (NEW, LOCKED)

**Dropped per 2026-04-23 revision**: U2 filetree badges, U4 Follow / multi-pin, U6 workspace activity feed. Rationale: all three push agent movement into the user's attention, creating churn under the repo's typical rapid-many-file agent write pattern. Retained: U1 (who's here), U3 (what changed on the doc I'm reading), U5 (what's an agent done in its session — now the child panel SPEC). Dropped surfaces are recoverable as future work if multi-session awareness becomes insufficient.

## 8. Open questions

- **Q-U1 (P0)** — Does `agentPresence` currently carry `session_id`? If no, D-U2 must ship FIRST. Every surface that identifies a session depends on this. **Depends on**: audit of the write path; could be a same-PR change.
- **Q-U2 (P0)** — Is cross-session UM behavior verified empirically? If two sessions interleave writes and one reverts, does the other's writes stay intact? Activity Panel's undo UI assumes YES. If NO, panel must narrow scope. **Depends on**: fuzzer extension planned in FR-17 of foundation.
- **Q-U3** — `agent-effects` entries carry `delta` as YTextEvent delta format. Can this be losslessly replayed as CM6 `Decoration.mark`? Expected yes for insert/delete at known offsets; format-change deltas (marks applied) may need a secondary render strategy. **Depends on**: prototype in U3.
- **Q-U4** — Does the `BurstStrip` render interact correctly with the Activity mount limit (`ACTIVITY_MOUNT_LIMIT = 3`)? A hidden Activity still has a live provider → its `agent-effects` observer still fires → does it accumulate work for unmounted UI? If yes, audit render cost or gate the observer on `<Activity mode="visible">`.

## 9. Risks

- **R-U1** — **Over-notification fatigue (mitigated by scope cut)**: dropping U2/U4/U6 reduces the 6-surface × N-agent visual load to 3 surfaces. Pulse animation sharply bounded (Notion-like, not Figma); U3 strips auto-collapse after 15 s quiescence; panel is user-invoked (no automatic open).
- **R-U2** — **Revert anxiety**: user hits revert without realizing scope. Mitigate via the panel's confirm-dialog on session-wide revert (see child spec); U3 burst revert shows the delta before revert click. Principal-authored rollback commits are reversible (`git revert` of the rollback).
- **R-U3** — **Stale presence persists after agent crash**: keepalive WS close is the canonical cleanup. If it fails (proxy ate frame, process killed -9), the 5 s client TTL hides the avatar but the server-side 20 s eviction leaves the map entry briefly. Foundation mitigates via `BROADCASTER_EVICTION_MS`. Accepted.
- **R-U4** — **Cross-doc burst race**: U3 observer on doc A, agent writes to doc B, user switches to B — does B's burst strip render? Yes, because U3 observer is per-active-provider and re-mounts on provider swap. Miss brief writes during the swap window? Reconcile by re-reading the Y.Map on mount (it's persistent).

## 10. Implementation sequence

Ordered by dependency and demo value.

1. **D-U2 one-field extension** — Add `session_id` to `AgentPresenceEntry` + thread through `setPresence` in all three agent write handlers. **Unblocks Activity Panel session identification.**
2. **U1 cross-doc section + overflow** — Pure render extension; no server change. **Demo value: high.**
3. **U3 agent-effects observer + inline bursts** — New CM6 + PM plugins, wire to `Y.Map('agent-effects')`. **Demo value: very high; 80% of "what did the agent do" UX.**
4. **Activity Panel (child spec sequence)** — See [[specs/2026-04-23-agent-activity-panel/SPEC]] §10.

Parallelizable groups: \{2, 3} can land in the same PR; \{4} is the panel spec's own PR plan.

## 11. Acceptance criteria

Per surface — every criterion is a Playwright E2E unless marked otherwise.

- **AC-U1.1** — With 2 agents active (one on active doc, one on cross-doc), presence bar shows both sections with correct counts and the divider. ✅ E2E.
- **AC-U1.2** — Pulse animation fires on avatar during agent write, clears within 1 s after write finishes. ✅ E2E + visual diff.
- **AC-U1.3** — Click agent avatar opens Activity Panel (per child spec). ✅ E2E.
- **AC-U3.1** — Three agent writes produce three burst strips. Clicking a strip expands inline diff with correct add/remove lines. ✅ E2E.
- **AC-U3.2** — `↶ Revert this burst` reverts exactly that burst, leaving prior + subsequent bursts intact. ✅ E2E + integration.
- **AC-U3.3** — After 50 writes, 51st evicts oldest burst (ring-buffer); footer chip shows `"+1 older — open Activity Panel"`. ✅ Integration.
- *(Activity Panel acceptance criteria — see *[[specs/2026-04-23-agent-activity-panel/SPEC]]* §9.)*

Non-functional:

- **AC-NF1** — U1 re-render cost ≤ 2 ms on 1 Hz tick with 5 agents. ✅ Profiler scenario.
- **AC-NF2** — U3 burst strip render ≤ 16 ms per burst at 50 bursts. ✅ Profiler scenario.

## 12. Future work (deferred)

Surfaces dropped in the 2026-04-23 revision — all recoverable if multi-session awareness becomes insufficient.

- **FW-U2 — Filetree presence badges (dropped).** Pulsing dot per tree row whose doc has live agent presence; dominant-agent color; folder aggregation. Revisit if users report "I lose track of where agents are working." Risk to revisit: visual noise proportional to tree size. Design understood (see original spec §4 U2); promote to new spec when user need materializes.
- **FW-U4 — Follow / multi-pin (dropped).** Pin one or more agent sessions and auto-navigate the editor to their `currentDoc` on write. Typing-guard + nav cooldown designed but not shipped. Revisit if users explicitly ask to "keep up with" an agent. Risk to revisit: attention hijack. Design understood (see original spec §4 U4); promote to new spec when user need materializes.
- **FW-U6 — Workspace activity feed (dropped).** Cross-agent chronological feed in left sidebar, groupable by session / agent\_type / doc. Depends on new CC1 `ch:'activity'` channel. Revisit if per-agent panel view feels insufficient for 3+ concurrent sessions. Design understood (see original spec §4 U6); promote to new spec when user need materializes.
- **Agent prompt surface** — "Send a message to this agent" from the presence avatar. Requires MCP host integration.
- **Remote agents** — Presence federation across machines.
- **Presence color overrides via config** — D-U14 futureproofs the data path; override UI deferred.
- **Agent-authored proposals** — agent writes a doc, user accepts/rejects *before* the write lands. Requires staging CRDT; foundation does not support.
- **Doc-level presence lock** — exclusive access. Foundation expressly does not model this.
- **Per-doc burst retention override** — today 50 per-doc; future: per-doc config for high-churn docs.
- **Session replay mode** — scrub through a session's bursts in time. Needs frame-capture of editor state.
- **Native notifications** — OS-level "Claude just reverted your last 5 edits" via Electron.
- **Presence on the navigator window** — `NavigatorApp.tsx` shows which projects have active agents.

## 13. Agent constraints

Instructions to the implementing agent.

- **Do not** open new spec subdirectories (`evidence/`, `meta/`) until warranted.
- **Do not** reopen D49 (agent-effects = 50 entries). See D-U7.
- **Do not** try to co-locate presence and effects into one Y.Map. See D-U10.
- **Do not** resurrect U2, U4, or U6 in this spec's scope — they're future-work if ever. See D-U15.
- **Do** ship D-U2 (session\_id in presence entry) as the first PR. One-field extension that unblocks Activity Panel session identification.
- **Do** include a `presence.color_overrides` stub in `config.yml` schema with `TODO`, to futureproof D-U14.
- **Do** follow precedent #20 (E2E test conventions) and precedent #24 (per-session actor identity) when extending integration tests.

---

**See also**: [[specs/2026-04-23-agent-activity-panel/SPEC]], [[specs/2026-04-18-agent-identity-attribution-foundation/SPEC]], [[reports/agent-follow-and-edit-visibility-ux/REPORT]], [[packages/app/src/presence/PresenceBar]], [[packages/app/src/presence/use-presence]], [[packages/app/src/lib/agent-presence]], [[packages/server/src/agent-presence]], [[packages/core/src/types/awareness]], [[packages/server/src/activity-log]], [[packages/core/src/burst-grouping]].
