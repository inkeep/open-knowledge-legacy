---
title: Agent Activity Panel — Spec
description: Click-on-avatar side pane showing per-burst diffs across every file an agent has touched, powered by per-session Y.UndoManager introspection. Two per-file undo buttons, filename click navigates, CC1 push for live updates.
tags: [spec, agent-ui, activity-panel, diff-viewer, undo, crdt]
status: draft
depends_on:
  - specs/2026-04-18-agent-identity-attribution-foundation/SPEC
  - specs/2026-04-23-agent-activity-ui/SPEC
informs:
  - reports/agent-follow-and-edit-visibility-ux/REPORT
---
# Agent Activity Panel — Spec (2026-04-23, revised)

> **2026-04-23 revision notes.**
>
> 1. Earlier drafts proposed reading diffs from shadow-repo `git diff` — **wrong under concurrent writers** because per-writer commits in the same L2 drain share a tree SHA. Fixed: panel reads directly from the per-session `Y.UndoManager.undoStack` (the CRDT's own origin-tagged record). Same source the foundation's `applyAgentUndo` uses; correct by construction via `trackedOrigins` identity matching.
> 2. Undo-scope shape simplified from three buttons to **two, both per-file**: *"Undo last edit on this file"* and *"Undo all edits on this file."* Rationale: `Y.UndoManager.undo()` is strictly LIFO — no native "undo StackItem at index N" — so a per-burst ↶ button would either (a) only work on the top StackItem (degenerate with "undo last on file") or (b) require a non-UM inverse-application path with real conflict risk. Also dropped the cross-file *"Undo last edit by this agent"* header button: since sessions are per-`(docName, agentId)`, each file has its own stack; the user's locus of control is the file they're viewing. Per-burst ↶ on individual burst rows is also dropped — bursts are display-only now.
>
> **This is the primary agent-review surface.** Parent [[specs/2026-04-23-agent-activity-ui/SPEC]] retains U1 presence bar and U3 inline margin bursts. This panel answers: *what has this agent done across their whole session, and how do I selectively roll it back?*
>
> **Design principle.** Watch an agent work live without surrendering control of the editor. Agents make quick edits across many files; any UI that auto-navigates or decorates the filetree creates attention churn.
>
> **Pattern reference.** Codex / ChatGPT Code-style side pane — task header on the left, stacked list of files the agent touched on the right, each file expandable to per-step diffs with per-file rollback. That pattern is the target.
>
> **Relation to identity foundation.** Every primitive this spec consumes — per-session origin, per-session UndoManager + `trackedOrigins`, `applyAgentUndo`, writer-ID taxonomy — ships in [[specs/2026-04-18-agent-identity-attribution-foundation/SPEC]]. This spec adds rendering, one REST endpoint, two undo scopes on the existing `/api/agent-undo` endpoint, and one CC1 push channel.

---

## 1. Problem

**Situation.** Agents already write to multiple files during a session via `applyAgentMarkdownWrite` + `applyAgentUndo`. The presence bar tells the user an agent exists; inline margin bursts show what changed on the doc currently open. Neither answers *"what has this agent done in its session across all files?"*

**Complication.** Agents make rapid, many-file edits. Any UI that tries to keep the user's editor synced to the agent hijacks attention. Users want to observe, not be dragged along. They want to review discrete actions the agent took — each as its own viewable unit — on their own schedule, with full diff context, across every file the agent has touched, and selectively roll back per file.

**Resolution.** A click-on-avatar → right-rail **Activity Panel** that renders, for the clicked agent, a scrollable list of every file that agent has edited this session. Each row's **filename is a click target** (navigates main editor). A **carrot (▸ / ▾)** expands the row to show a chronological list of **bursts** — one per `Y.UndoManager` StackItem. Each burst shows its timestamp, diff stat, and a mini unified-diff hunk (display-only — no per-burst button). At the bottom of each expanded file row, two undo buttons: *"Undo last edit on this file"* (pops one StackItem — LIFO) and *"Undo all edits on this file"* (pops the entire stack). Live updates via CC1 push (`ch:'session-activity'`).

## 2. Goals / Non-goals

### Goals

- **G-P1** — User can click any agent's avatar in the presence bar and see, within 300 ms, the list of files that agent has edited in their current session.
- **G-P2** — User can expand any file via carrot and see a chronological list of bursts, each with timestamp, diff stat, and an inline mini unified diff showing exactly that burst's insertions and deletions.
- **G-P3** — User can click a filename to navigate the main editor to that file without closing the panel.
- **G-P4** — User can **undo the agent's last edit on a specific file** — pops that file's top StackItem, reverting one agent burst's worth of change.
- **G-P5** — User can **undo all the agent's edits on a specific file** — pops the entire per-file UM stack.
- **G-P6** — Both undo scopes are safe under concurrent writers by construction. Each file has its own session UM with `trackedOrigins = new Set([session.origin])`; other agents' and humans' Items are never touched.
- **G-P7** — The panel surfaces live-write status (file currently being edited) without rendering unstable mid-keystroke state.
- **G-P8** — Opening the panel never moves the main editor's cursor, scroll, or doc.

### Non-goals

- **NG-P1** — **Automatic navigation / Follow.** The main editor never auto-follows the agent.
- **NG-P2** — **Filetree movement indicators.** No badges or decorations on the sidebar.
- **NG-P3** — **Cross-file undo button.** Sessions are per-(docName, agentId); each file's stack is independent; "undo last" across files is ambiguous once you have to pick which file. Dropped; the user's locus of control is the file they're viewing.
- **NG-P4** — **Per-burst ↶ button.** Y.UndoManager is LIFO-only; targeted undo of a middle StackItem has no clean native path. Bursts render as display-only diffs; undo is per-file.
- **NG-P5** — **Cumulative-per-file unified diff.** Each file row's collapsed header carries a `+N −M` cumulative stat at a glance; bursts are the unit of diff rendering. Cumulative single-blob diff rejected in this revision — can't be correctly computed from shadow repo under concurrent writers.
- **NG-P6** — **Post-session review.** Once an agent's MCP keepalive WS has been closed beyond the 30 s grace, the per-session UMs are GC'd. Panel degrades to *"Session ended"* state (read-only). Shadow-repo-backed history view for ended sessions is future work.
- **NG-P7** — **Multi-agent diff comparison.** One panel, one agent at a time.
- **NG-P8** — **Rendering live keystroke-level content.** Pre-capture-timeout (<500 ms) activity is signalled by a subtle *"writing…"* label; not rendered as an incomplete burst.
- **NG-P9** — **Mobile layouts.**
- **NG-P10** — **Non-markdown file activity.** CRDT-tracked markdown docs only.

## 3. Users and scenarios

**Persona.** Miles, solo dev, 1–3 concurrent agent sessions + his own WYSIWYG edits.

**Scenarios.**

- **S-P1 Quick glance.** Miles sees "Claude #a4f2" pulse-writing in the presence bar. He clicks the avatar. Panel slides in: *"3 files · writing…"* header, `notes.md` / `specs/foo/SPEC.md` / `reports/r1/r1.md` collapsed list with carrots + cumulative diff stats. He clicks the carrot on `notes.md` → file row expands showing 3 bursts (each with its own mini diff, display-only). His main editor is unchanged.
- **S-P2 Jump to a file.** While reviewing bursts in the panel, Miles wants to edit the file directly. He clicks the filename → his main editor navigates. The panel stays open; the file row stays expanded.
- **S-P3 Undo last on a file.** Claude just made a regrettable change in `specs/foo/SPEC.md`. Miles clicks the filename to view it, opens the panel, expands the file row, clicks *"Undo last edit on this file"* at the bottom. The top StackItem (most recent burst) is popped. The burst disappears from the list; cumulative stat updates; other files untouched.
- **S-P4 Undo entire file.** Miles sees Claude's work on `notes.md` is broadly off-track. He expands the file, scrolls through bursts to understand scope, clicks *"Undo all edits on this file"* → confirm dialog → that session's entire UM stack is popped. Other files + concurrent writers untouched; row disappears (no remaining bursts).
- **S-P5 Session ended.** Miles clicks a greyed-out avatar (TTL expired). Panel opens with *"Session ended 2 minutes ago"* + displayName (read-only, both undo buttons disabled).
- **S-P6 Miles is typing.** Miles has the panel open showing Claude's work. He starts typing in his own editor. The panel stays open; file-expanded state preserved. No focus steal.
- **S-P7 Swap.** With Claude's panel open, Miles clicks Codex's avatar. Panel content swaps to Codex. Expanded files re-collapse; scroll resets.
- **S-P8 Live arrival.** Miles has the panel open showing Claude's 2-file list. Claude writes to a third file. Within \~500 ms of the L2 drain, the panel adds the new file row via CC1 push.

## 4. Functional requirements

### Anchor + mount

- **FR-P1** — **Anchor is the presence-bar avatar.** Any agent avatar in [[packages/app/src/presence/PresenceBar.tsx]] is a click target. Clicking opens the panel keyed to that agent's `connectionId`.
- **FR-P2** — **Mount is a right-side slide-in** (shadcn `Sheet` with `side="right"`, width ≈ 480 px, non-modal). Overlays without reflowing the editor.<br>_[Corrected 2026-04-24 post-ship: mount moved inside `DocPanel` as the `'agent'` mode content; `react-resizable-panels` owns width now (default 25%, min 300 px, max 40%). Authoritative fix in [[specs/2026-04-24-activity-panel-to-docpanel-mode-toggle/SPEC]].]_
- **FR-P3** — **Click-to-toggle.** Clicking the same avatar closes. Clicking a different avatar swaps contents.<br>_[Corrected 2026-04-24 post-ship: "closes" = "flips DocPanel back to `'doc'` mode"; swap preserves new scoped agent in `'agent'` mode. Same pointer as FR-P2.]_
- **FR-P4** — **Explicit close affordances.** `×` button in header; `Esc` key; click-outside does NOT close.<br>_[Corrected 2026-04-24 post-ship: obsolete — `DocPanel` is a layout panel, not a modal. Close = collapse via the editor's existing panel-toggle button (top-right of editor area). No Esc / X / click-outside semantics. Same pointer as FR-P2.]_
- **FR-P5** — **Panel never moves the main editor automatically.** The ONLY panel affordance that navigates is explicit filename click.

### Data source

- **FR-P6** — **Canonical data source: per-session `Y.UndoManager.undoStack`.** AgentSessionManager keeps one session per `(docName, agentId)` pair; each session holds a `Y.UndoManager` scoped to `[Y.Text('source'), Y.Map('metadata'), Y.Map('agent-flash')]` with `trackedOrigins = new Set([session.origin])`. To render the panel for `connectionId=X`, the server walks all sessions with matching connectionId; for each, it reads `session.um.undoStack` and walks each StackItem's `insertions` / `deletions` DeleteSets.
- **FR-P7** — **Why not shadow repo.** Per-writer commits in the same L2 drain share a tree SHA; tree-level diff cannot isolate one writer's contribution. Shadow repo remains useful for post-session history (future work), not the panel's data source.
- **FR-P8** — **Why not `Y.Map('agent-effects')`.** Ephemeral 50-entry per-doc ring shared across agents; lacks deleted-text content.
- **FR-P9** — **Rendering.** Each burst renders as a mini unified-diff hunk via `react-diff-view`. Server synthesizes the unified diff text per burst by walking `StackItem.insertions` + `StackItem.deletions` and producing `+`/`−`/context lines.

### File list + burst list

- **FR-P10** — **File list.** `GET /api/agent-activity?agentId=<connId>` returns `{ sessionAlive, agent:{displayName,color,...}, files:[{docName, additionsTotal, deletionsTotal, lastTs, bursts:[{stackIndex, ts, additions, deletions}]}] }`. Files ordered by most-recent-burst descending; bursts within a file ordered by timestamp descending. Server enumerates via in-memory `AgentSessionManager` sessions filtered by connectionId — no git, no disk.
- **FR-P11** — **Per-burst diff.** `GET /api/agent-burst-diff?agentId=<connId>&docName=<path>&stackIndex=<n>` returns `{ diff: string, asOf: number }`. Computed server-side from the StackItem's insertions/deletions + surrounding context. Lazy-fetched per burst expand.
- **FR-P12** — **Capture-granularity.** Each MCP agent write = one `session.dc.document.transact(fn, session.origin)` = one Y transaction. Y.UndoManager captures with `captureTimeout: 500` (see [[packages/server/src/agent-sessions.ts]] line 441). **v1 accepts the 500 ms merge default** (Q-P2 RESOLVED): sequential tool calls spaced >500 ms apart (typical LLM/network latency) map 1:1 to bursts; batched parallel tool calls within 500 ms merge into one burst. No `stopCapturing()` call added in v1.

### Per-file row — collapsed state

- **FR-P13** — **Collapsed row elements (left to right):**
  - **Carrot** (▸) — click toggles expand/collapse.
  - **Filename** (clickable link) — click navigates main editor via `openDocumentTransition(docName)` + hash update. Styled as a link.
  - **Cumulative diff stat** (`+14 −2`) — sum across this file's bursts.
  - **Most-recent-burst timestamp** (*"42 s ago"*).
  - **Writing indicator** (*"writing…"* + pulse) when live (FR-P17).

### Per-file row — expanded state

- **FR-P14** — **Expanded row shows** (below the collapsed-row header, in order):
  - **Chronological burst list**, newest first. Each burst row:
    - Timestamp (absolute `HH:MM:SS` or relative *"42 s ago"* depending on age).
    - Diff stat (`+3 −1`).
    - Optional summary (best-effort — see Q-P3).
    - **Inline mini unified diff** (lazy-loaded on burst-row click; each burst row is independently expand/collapse within the file row).
    - **No action buttons.** Bursts are display-only.
  - **Action row at the bottom**, two buttons side-by-side:
    - **"Undo last edit on this file"** (FR-P18) — disabled if session dead or stack empty.
    - **"Undo all edits on this file"** (FR-P19) — disabled if session dead or stack empty; confirms via dialog.
- **FR-P15** — **Burst-row diff lazy-load.** Mini diff is fetched via `GET /api/agent-burst-diff` only when a burst row is clicked to expand. Avoids N round-trips on file-row expand.

### Navigation

- **FR-P16** — **Filename click navigates** (collapsed AND expanded row). Never closes the panel. Never collapses rows.

### Live indicator + staleness

- **FR-P17** — **Writing indicator.** When agent has `mode: 'writing'` in `agentPresence` AND `currentDoc === <this row's path>`, row header shows *"writing…"* + Notion pulse. Signal from existing `__system__` awareness.

### Undo affordances — two buttons, both per-file, both at bottom of expanded row

- **FR-P18 — Button 1: *"Undo last edit on this file"*** — in the per-file-row action area. Dispatches `POST /api/agent-undo` with `{ connectionId, scope: 'last', path }`. Server finds the target session by `(path, connectionId)` and calls `session.um.undo()` — pops exactly the top StackItem. Strictly LIFO, no stackIndex targeting. No confirmation (single-burst undo is low blast radius). Button disabled when session is dead OR `undoStack.length === 0`.
- **FR-P19 — Button 2: *"Undo all edits on this file"*** — in the per-file-row action area. Dispatches `POST /api/agent-undo` with `{ connectionId, scope: 'file', path }`. Server loops `session.um.undo()` until stack is empty. **Confirmation dialog** (shadcn `AlertDialog`) before posting — blast radius can be many bursts. Button disabled when session dead OR stack empty.
- **FR-P20** — **Optimistic UI.** After either undo, panel re-fetches `GET /api/agent-activity`. Per D-P17, rows with zero remaining bursts disappear.

### Lifecycle + state

- **FR-P21** — **Panel state is tab-scoped.** Open/closed, expanded-file set, expanded-burst set, scroll position live in React state — per-tab.
- **FR-P22** — **Swap behavior.** Clicking a different agent avatar swaps. Expanded rows re-collapse; scroll resets.
- **FR-P23** — **Live updates via CC1 push.** While panel is open for an active agent, client subscribes to `__system__` `ch:'session-activity'`. On signal, panel re-fetches `GET /api/agent-activity` (debounced 500 ms).
- **FR-P24** — **Nav does not close.** Panel stays open across doc navigation.

### CC1 channel

- **FR-P25** — **New CC1 channel `ch:'session-activity'`.** Fired from persistence L2 drain after every successful `commitWipFromTree` for any `agent-<connId>` writer-id. Payload: `{v:1, ch:'session-activity', seq:<monotonic>}`. Coalesced 100 ms. Emission site confirmed by 2026-04-23 audit: single-line add in the per-writer loop in [[packages/server/src/persistence.ts]] (around line 354–388), gated on `writerId.startsWith('agent-')`, calling `cc1Broadcaster.signal('session-activity')`. Broadcaster accepts arbitrary channel strings; no registration needed.

## 5. Data flow

```
User clicks avatar in PresenceBar
  ↓
setOpenPanel({connectionId})
  ↓
useActivityPanel(connectionId):
  GET /api/agent-activity?agentId=<connId>
    → server enumerates AgentSessionManager sessions filtered by connectionId
    → for each session: walk session.um.undoStack, extract {stackIndex, ts, +N, −M} per StackItem
    → response: { sessionAlive, files: [{docName, additionsTotal, deletionsTotal, bursts:[...]}] }
  subscribe to __system__ ch:'session-activity' → re-fetch on ping (debounced 500 ms)
  subscribe to __system__ agentPresence → writing indicator per file
  ↓
User expands file row (carrot):
  just displays burst list from already-fetched data — no round trip
  ↓
User expands a single burst row:
  GET /api/agent-burst-diff?agentId=<connId>&docName=<path>&stackIndex=<n>
    → render mini diff via react-diff-view
  ↓
User clicks filename → navigate main editor:
  openDocumentTransition(docName) + hash update
  panel stays open; expanded state preserved
  ↓
User clicks "Undo last edit on this file" (bottom of expanded row):
  POST /api/agent-undo { connectionId, scope: 'last', path }
    → server: applyAgentUndo(session, 'last') — pops top StackItem
  ↓
User clicks "Undo all edits on this file" (bottom of expanded row):
  AlertDialog confirm
    → POST /api/agent-undo { connectionId, scope: 'file', path }
    → server: applyAgentUndo(session, 'file') — pops entire stack
  ↓
Both undo paths:
  applyAgentUndo runs under session.undoOrigin (paired:true)
    → Observer A/B short-circuit
    → L2 drain → CC1 ch:'session-activity' → panel re-fetches
```

## 6. Technical surface

### New components

| Component                                                                                                        | Responsibility                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/app/src/components/AgentActivityPanel.tsx`](packages/app/src/components/AgentActivityPanel.tsx)       | Sheet container; header (avatar, displayName, status, close — **no undo button**); scrollable file list.                                                   |
| [`packages/app/src/components/ActivityPanelFileRow.tsx`](packages/app/src/components/ActivityPanelFileRow.tsx)   | One file entry; carrot, filename link, diff stat, timestamp, writing indicator; collapsed + expanded states; two undo buttons at bottom of expanded state. |
| [`packages/app/src/components/ActivityPanelBurstRow.tsx`](packages/app/src/components/ActivityPanelBurstRow.tsx) | One burst inside an expanded file row; timestamp, stat, optional summary, expand-to-diff. **No action button.**                                            |
| [`packages/app/src/components/ActivityPanelDiffView.tsx`](packages/app/src/components/ActivityPanelDiffView.tsx) | `react-diff-view` unified-diff renderer.                                                                                                                   |
| [`packages/app/src/lib/use-activity-panel.ts`](packages/app/src/lib/use-activity-panel.ts)                       | Hook — fetches agent-activity, subscribes to CC1 + presence.                                                                                               |
| [`packages/app/src/presence/PresenceBar.tsx`](packages/app/src/presence/PresenceBar.tsx) (extended)              | Avatar onClick dispatches `openActivityPanel({connectionId})`.                                                                                             |

### New / extended endpoints

| Method + path                                                              | Request                                         | Response                                                                                                                                                      | Notes                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/agent-activity?agentId=<connId>`                                 | —                                               | `{ sessionAlive, agent:{displayName,color,...}, files:[{docName, additionsTotal, deletionsTotal, lastTs, bursts:[{stackIndex, ts, additions, deletions}]}] }` | Walks in-memory `AgentSessionManager` sessions filtered by connectionId; reads each UM.undoStack.                                                                                                                                                |
| `GET /api/agent-burst-diff?agentId=<connId>&docName=<path>&stackIndex=<n>` | —                                               | `{ diff: string, asOf: number }`                                                                                                                              | Synthesizes unified diff for one StackItem. Display-only; not used to target undo (undo is LIFO).                                                                                                                                                |
| `POST /api/agent-undo` (extended)                                          | `{ connectionId, scope: 'last'\|'file', path }` | `{ undone: boolean }`                                                                                                                                         | Both new scopes require `path`. `'last'` pops top of that session's stack; `'file'` pops entire stack. Existing `scope: 'session'` remains as alias for `'file'` but is no longer used by this panel. No `'burst'` scope, no `stackIndex` param. |

### Extended handler

`applyAgentUndo(session, scope)` in [[packages/server/src/agent-sessions.ts]]:

- `'last'` (new) → `if (um.undoStack.length > 0) um.undo()` under `session.undoOrigin`. Already implemented by existing `scope: 'last'` in the current tree — verify the session is the `(path, connectionId)` session by the caller.
- `'file'` (new, alias of existing `'session'`) → `while (um.undoStack.length > 0) um.undo()` under `session.undoOrigin`.
- XmlFragment-authoritative composition pattern unchanged (precedent #10).

### New CC1 channel

| Channel                 | Fired from                                                                                                                       | Payload                               | Consumers                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------- |
| `ch:'session-activity'` | L2 drain in [[packages/server/src/persistence.ts]] after any successful `commitWipFromTree` with `writerId.startsWith('agent-')` | `{v:1, ch:'session-activity', seq:N}` | Open Activity Panels re-fetch |

### Reused primitives (from identity foundation)

- Per-session `PairedWriteOrigin` + per-session `Y.UndoManager` + `trackedOrigins` (precedent #24)
- `applyAgentUndo` — extended with `'last'` + `'file'` scopes (caller passes path to select session)
- `AgentSessionManager` — in-memory session registry queried by connectionId
- `__system__` awareness `agentPresence` — writing indicator

## 7. Decisions

**LOCKED** (1-way, confirmed), **DIRECTED** (chosen, reversible), **DELEGATED** (implementation-time latitude).

- **D-P1 — LOCKED. Data source is per-session `Y.UndoManager.undoStack`, not shadow-repo git diff and not `Y.Map('agent-effects')`.** Shadow trees are shared per drain; ring buffer is ephemeral + lacks deleted text. UM is the CRDT's own origin-tagged record; `trackedOrigins` guarantees per-session isolation.
- **D-P2 — LOCKED. Per-burst display, no per-burst undo.** Each StackItem renders as a mini diff hunk; cumulative `+N −M` on the file header. Per-burst ↶ button dropped because Y.UndoManager is LIFO-only and middle-of-stack undo has no clean native path.
- **D-P3 — LOCKED. Two undo buttons, both per-file, both at bottom of expanded row.** `'last'` (pop top) + `'file'` (pop stack). Cross-file undo dropped — ambiguous once you have to pick which file; user's locus of control is the file they're viewing.
- **D-P4 — LOCKED. Undo is strictly LIFO via `Y.UndoManager.undo()`.** No targeted-index undo, no non-UM inverse-application path. Simpler, no conflict surprises.
- **D-P5 — LOCKED. Undo uses per-session UM.** `trackedOrigins` means other writers' Items are untouched.
- **D-P6 — LOCKED. No post-session review.** UMs are GC'd with the session. Shadow-repo history is future work.
- **D-P7 — LOCKED. Panel is THE primary agent-review surface.** Parent SPEC's U2, U4, U6 are dropped.
- **D-P8 — LOCKED. Panel never auto-navigates.** Only explicit filename click navigates.
- **D-P9 — LOCKED. Click-on-avatar = open panel.**
- **D-P10 — LOCKED. Filename click = navigate; carrot = expand/collapse file row; burst-row click = expand that burst's diff.** Three distinct click zones, no overloading.
- **D-P11 — LOCKED. Live updates via CC1 push, not polling.** `ch:'session-activity'` fired from L2 drain on any `agent-<connId>` `commitWip`. Audit confirmed emission site and that both `applyAgentMarkdownWrite` and `applyAgentUndo` land in the same L2 drain.
- **D-P12 — DIRECTED. Right-side `Sheet`, non-modal, 480 px.**<br>_[Corrected 2026-04-24 post-ship: obsolete — the host is now `DocPanel` (already right-side, already resizable via `react-resizable-panels`). Authoritative fix in [[specs/2026-04-24-activity-panel-to-docpanel-mode-toggle/SPEC]].]_
- **D-P13 — DIRECTED. Single-panel, swap-on-avatar-click.**<br>_[Corrected 2026-04-24 post-ship: single-DocPanel-with-two-modes supersedes single-Sheet-with-one-agent. Swap semantics preserved mechanically. Same pointer as D-P12.]_
- **D-P14 — DIRECTED. Click-outside does NOT close.**<br>_[Corrected 2026-04-24 post-ship: obsolete — `DocPanel` is a layout panel; click-outside isn't a semantic that applies. Same pointer as D-P12.]_
- **D-P15 — DIRECTED. `react-diff-view` as renderer.**
- **D-P16 — DIRECTED. *"Undo all"* requires confirmation; *"Undo last"* inline.** Blast-radius asymmetry.
- **D-P17 — DIRECTED. Burst diff lazy-loaded on burst-row expand.** Avoids N round-trips on file-row open.
- **D-P18 — LOCKED. Empty rows disappear.** When an undo removes a file's last burst, the file row is removed.
- **D-P19 — DELEGATED. Exact writing-indicator visual.**

## 8. Open questions

- **Q-P1 (RESOLVED 2026-04-23)** — Y.UndoManager StackItem API is stable public. Verified from `node_modules/yjs/dist/src/utils/UndoManager.d.ts`: `StackItem` is an `export class` with public `insertions: DeleteSet` and `deletions: DeleteSet`. `undoStack` is a public array, already used in repo tests. `DeleteSet` iteration via `iterateDeletedStructs(transaction, ds, f)` is exported from `node_modules/yjs/dist/src/utils/DeleteSet.d.ts:29`. Server introspection wraps reads in a throwaway `doc.transact(tr => iterateDeletedStructs(tr, stackItem.insertions, item => ...))`.
- **Q-P2 (RESOLVED 2026-04-23)** — **Keep the 500 ms merge default; do NOT add `stopCapturing()` in v1.** Per user direction: rapid-fire tool calls within 500 ms merge into one StackItem, matching Y.UndoManager's default. Trade-off: batched parallel tool calls render as a single burst (fewer rows, user sees them as one action); sequential tool calls with normal LLM/network latency (>500 ms) still map 1:1. Revisit if users report losing granularity on batched edits. Strict-1:1 remains a one-line opt-in if the call changes.
- **Q-P3 (P2)** — **Burst summaries next to timestamps.** Agents pass a one-line summary via MCP write (foundation D23). To surface it per-burst we'd correlate StackItems to shadow commits by timestamp proximity. **Recommendation: defer to v1.1.**
- **Q-P4 (RESOLVED 2026-04-23)** — **Tombstone content is GC-immune while on the undoStack.** `Y.UndoManager` calls `keepItem(item, true)` at StackItem capture (`node_modules/yjs/src/utils/UndoManager.js:253`); `keepItem(item, false)` on stack drop (line 43). Content readable as long as StackItem is on undoStack.
- **Q-P5 (P1)** — **Diff synthesis algorithm.** Walk Y.Text Items in document order; mark each Item as `+inserted` / `−deleted` / context; emit hunks around changed regions. For a StackItem with scattered inserts, emit multiple small hunks with 3 lines of context each (git default). Implementation detail; not a design blocker.
- **Q-P6 (P2)** — **Session-ended state copy.** Interim banner text; acceptable.

## 9. Acceptance criteria

- **AC-P1 (G-P1):** Click any agent avatar → panel renders within 300 ms with the correct file list. Playwright.
- **AC-P2 (G-P2):** Expand a file → burst list shows correct count + timestamps + stats. Expand a burst row → mini unified diff renders with both `+` and `−` lines. Integration test.
- **AC-P3 (G-P3):** Click filename → main editor navigates; panel stays open; file + bursts remain expanded. Playwright.
- **AC-P4 (G-P4):** Click *"Undo last edit on this file"* → top StackItem of that session is popped; other files + other sessions' bursts preserved. Tier-1 integration test.
- **AC-P5 (G-P5):** Click *"Undo all edits on this file"* → confirm → target session's entire UM popped; other files + concurrent writers preserved. Tier-1 integration test.
- **AC-P6 (G-P6):** Under concurrent writers (agent A + agent B + human on same file), either undo scope on agent A leaves B's and human's Items intact. Tier-1 integration test.
- **AC-P7 (G-P7):** Panel open + expand + undo → main editor scroll, cursor, active doc unchanged. Only filename click navigates. Playwright.
- **AC-P8 (live updates):** Agent writes to a new file while panel open → within ≤700 ms of L2 drain, new row appears via CC1 push. Playwright.

Non-functional:

- **NF-P1:** `GET /api/agent-activity` p95 < 100 ms for agents with ≤ 10 sessions × ≤ 50 bursts each.
- **NF-P2:** Panel open → FCP < 150 ms after click. `<ProfilerBoundary>` + `mark('ok/activity-panel/open')`.
- **NF-P3:** Zero Y.Doc mutations from panel code except via `POST /api/agent-undo`.

## 10. Implementation sequence

1. ~~Verify Q-P1 + Q-P4 via spike.~~ **RESOLVED 2026-04-23 via source audit** (see §8). Impl starts at step 2.
2. `applyAgentUndo` in [[packages/server/src/agent-sessions.ts]] — existing `'last'` and `'session'` scopes; add `'file'` as alias of `'session'` for clarity (optional) OR keep as `'session'` and have the client pass `'session'`. Decision: keep `'session'` alias; client uses `'file'` in the request body for clarity — thin API layer normalizes.
3. `GET /api/agent-activity` + `GET /api/agent-burst-diff` endpoints (StackItem introspection + diff synthesis).
4. CC1 `ch:'session-activity'` channel — one-line add in persistence L2 drain gated on `agent-` writer prefix.
5. `use-activity-panel.ts` hook (fetch + CC1 subscribe + presence subscribe).
6. `AgentActivityPanel` + `ActivityPanelFileRow` + `ActivityPanelBurstRow` shells.
7. `ActivityPanelDiffView` via `react-diff-view`.
8. PresenceBar avatar click wire-up.
9. Playwright E2E (AC-P1, AC-P3, AC-P7, AC-P8); Tier-1 integration (AC-P4–AC-P6).

\{2, 3, 4} → one server PR.
\{5, 6, 7, 8} → one client PR (blocked on server).
\{9} follows.

## 11. Risks

- ~~R-P1 — UM StackItem API instability~~ **Retired 2026-04-23** (Q-P1 RESOLVED).
- ~~R-P2 — Tombstone GC~~ **Retired 2026-04-23** (Q-P4 RESOLVED).
- **R-P1** — **Diff synthesis complexity** (Q-P5). Walking Items + emitting hunks is nontrivial. Mitigation: ship with "one hunk per StackItem, +3 context lines" baseline.
- **R-P2** — **CC1 channel add correctness.** New emission site in L2 drain — must not break existing `'files'` / `'sync-status'` channels. Mitigation: CC1 broadcaster has independent per-channel debounce + seq; additions are additive.

## 12. Future work

- **FW-P1 — Identified.** Burst summaries next to timestamps (Q-P3). Correlate StackItems to shadow commits by ts proximity, read `ok-contributors:` summaries field.
- **FW-P2 — Identified.** Shadow-repo history view for ended sessions. Addresses NG-P6.
- **FW-P3 — Identified.** Multi-panel / side-by-side multi-agent comparison.
- **FW-P4 — Noted.** Per-word blame in the diff (hover `+` line → show StackItem that added it).
- **FW-P5 — Noted.** Workspace-wide cross-agent activity view (old parent SPEC U6).

## 13. Agent constraints for implementor

- **SCOPE:**
  - `packages/app/src/components/AgentActivityPanel.tsx` (new)
  - `packages/app/src/components/ActivityPanelFileRow.tsx` (new)
  - `packages/app/src/components/ActivityPanelBurstRow.tsx` (new)
  - `packages/app/src/components/ActivityPanelDiffView.tsx` (new)
  - `packages/app/src/lib/use-activity-panel.ts` (new)
  - `packages/app/src/presence/PresenceBar.tsx` (extend avatar onClick)
  - `packages/server/src/api-extension.ts` (add two GET endpoints + extend `agent-undo` body with `scope: 'file'` alias for `'session'`)
  - `packages/server/src/agent-sessions.ts` (add StackItem introspection helpers; no `stopCapturing()` change — v1 accepts 500 ms merge default per Q-P2 RESOLVED)
  - `packages/server/src/persistence.ts` (emit CC1 `ch:'session-activity'` on L2 drain for agent writers)
- **EXCLUDE:**
  - Any use of shadow-repo `git diff` for panel content (D-P1 LOCKED)
  - Any changes to `Y.Map('agent-effects')` shape or retention
  - Any changes to shadow-repo commit format or writer-ID taxonomy (locked by identity foundation)
  - Any Follow, filetree-badge, or auto-navigation logic
  - Any third undo button (D-P3 LOCKED at two: last + file, both per-file)
  - Any per-burst ↶ button (D-P2 LOCKED — bursts are display-only)
  - Any non-LIFO undo path (D-P4 LOCKED — strict `um.undo()` semantics)
  - Any cross-file undo scope (D-P3 LOCKED — panel's scope is per-file)
- **STOP\_IF:**
  - `trackedOrigins` identity matching fails under real concurrent writers (identity-foundation bug)
- **ASK\_FIRST:**
  - Any change to `POST /api/agent-undo` request/response shape beyond the two per-file scopes
  - Any code path that navigates the main editor from the panel without explicit filename click (D-P8)
  - A third undo button or any cross-file undo affordance (D-P3)
  - Reading panel data from shadow repo (D-P1)

---

## See also

- [[specs/2026-04-18-agent-identity-attribution-foundation/SPEC]] — primitive substrate
- [[specs/2026-04-23-agent-activity-ui/SPEC]] — parent UI spec
- [[reports/agent-follow-and-edit-visibility-ux/REPORT]] — UX research
- [[packages/server/src/cc1-broadcast.ts]] — CC1 channel contract
- [[packages/server/src/agent-sessions.ts]] — per-session UM + `applyAgentUndo`
- [[packages/server/src/persistence.ts]] — L2 drain where CC1 emission lands
