---
title: Agent Activity Panel — move from standalone Sheet to DocPanel mode toggle
description: Embed the Agent Activity Panel into the existing DocPanel via a top-level mode toggle (Document ↔ Activity), preserving presence-bar avatars as the control plane for agent selection.
tags: [spec, agent-ui, activity-panel, docpanel, refactor]
status: accepted
depends_on:
  - specs/2026-04-23-agent-activity-panel/SPEC
  - specs/2026-04-20-timeline-to-docpanel/SPEC
---
# Agent Activity Panel → DocPanel mode toggle (2026-04-24)

> This spec is an **amendment** to [[specs/2026-04-23-agent-activity-panel/SPEC]]. The v1 Activity Panel shipped as a separate right-side `Sheet` mounted at `EditorPane` root. This spec moves it inside `DocPanel` as one of two top-level modes (Document / Activity), and retires the Sheet-specific mount/resize/close-affordance machinery.
>
> **Why amend rather than a fresh feature spec.** The SPEC-23 decisions (data source, undo semantics, live updates, per-session isolation) all carry forward unchanged. Only the **host surface** changes. Breadcrumb corrigenda on the affected LOCKED/DIRECTED items in SPEC-23 follow this spec's implementation commit, per the repo's post-ship annotation convention.

## 1. Problem

The v1 Activity Panel ships as a standalone `Sheet` overlaid on the editor. It works, but it creates two architectural tensions:

1. **Two parallel right-rail surfaces.** `DocPanel` is already the canonical right-rail info surface — tabbed per-doc content (Outline / Backlinks / Outgoing / Graph / Timeline). The Activity Panel lives in a second, independently-mounted right-rail container with its own width, its own resize handle, its own collapse semantics. Users now have two places to look for "info about my workspace" with no clear reason why.
2. **Duplicated primitives.** The Activity Panel built its own resize machinery (`ActivityPanelResizeHandle`, `useActivityPanelWidth`, `localStorage('ok-activity-panel-width-v1')`) because the Sheet primitive doesn't resize. `DocPanel` already resizes via `react-resizable-panels`, collapses on a toggle, and adapts to mobile via a Sheet — all for free.

The canonical fix: embed the Activity Panel into `DocPanel` as one of two top-level modes.

## 2. Goals / Non-goals

### Goals

- **G-T1** — `DocPanel` gains a top-level **mode toggle** with two values: `doc` (existing — renders the 5-tab info bar) and `agent` (new — renders the Activity Panel content, keyed to a `connectionId`).
- **G-T2** — The **presence bar remains the control plane** for agent mode. Clicking any agent avatar flips `DocPanel` to `agent` mode, scopes it to that agent, and — if the panel is collapsed (desktop) or closed (mobile Sheet) — auto-expands/opens the panel.
- **G-T3** — Per-session data, per-burst diffs, per-file undo, CC1 `session-activity` live updates — all preserved unchanged from SPEC-23. Only the host surface changes.
- **G-T4** — Mode selection is ephemeral (tab-scoped, not persisted across reloads). Default on first load is `doc`.
- **G-T5** — Delete the Sheet-specific mount, resize handle, width hook, width storage key, and their tests. `react-resizable-panels` drives width now.

### Non-goals

- **NG-T1** — Changing any server-side primitive. `GET /api/agent-activity`, `GET /api/agent-burst-diff`, `POST /api/agent-undo` scopes, CC1 `session-activity` channel: all unchanged.
- **NG-T2** — Changing the per-burst / per-file / per-session data shape from SPEC-23.
- **NG-T3** — Embedding Activity as a 6th tab inside the existing tab bar. The 6th-tab shape was considered and rejected (see §7 D-T1 below): per-file tabs and a per-agent tab violate the "each tab is doc-scoped" invariant that governs tabs 1–5.
- **NG-T4** — Persisting mode across reloads (`localStorage('ok-docpanel-mode-v1')` etc.). Matches `FR-P21` intent: panel state is tab-scoped.
- **NG-T5** — Adding an in-panel agent-chip row for multi-agent swap. The presence bar is already visible and clicking there swaps the scoped agent. A second selection UI would duplicate that behavior.

## 3. Users and scenarios

**Persona.** Miles, same as SPEC-23 §3.

- **S-T1 Open an agent's activity.** Miles clicks "Claude" in the presence bar. If the DocPanel is visible, it flips from `doc` mode (showing outline of his current file) to `agent` mode (showing Claude's session files). If the DocPanel is collapsed, it auto-expands first. His main editor stays untouched.
- **S-T2 Flip back to doc info.** Miles clicks the "Document" mode-toggle pill. The panel flips back to `doc` mode, sub-tabs reappear, content reflects his current file's info. His agent selection (the scoped `connectionId`) is retained in memory — clicking "Activity" flips back to Claude's session without re-clicking the avatar.
- **S-T3 Swap agents.** From Claude's activity view, Miles clicks Cursor's avatar. The panel stays in `agent` mode, swapping the scoped agent to Cursor. Expanded file rows from Claude's view are cleared (the hook re-fetches on `connectionId` change).
- **S-T4 Doc navigation while in agent mode.** Miles is in `agent` mode reviewing Claude's edits to `specs/foo.md`. He clicks a filename in Claude's list → main editor navigates. The DocPanel stays in `agent` mode showing Claude's session (nothing refetches; agent mode is doc-agnostic, preserving SPEC-23 FR-P24). When he manually flips to `doc` mode later, the info tabs refetch against the now-current file.
- **S-T5 No agents present.** Miles's session has no live agents. The "Activity" mode pill is **disabled with a tooltip** (`"No active agents"`). The panel stays in `doc` mode; the toggle itself is still visible so the affordance is discoverable.
- **S-T6 Agent session ends while in agent mode.** Miles is watching Claude's activity; Claude's MCP keep-alive closes past the grace window, server GC's the session. The panel's `sessionAlive: false` branch renders the banner + disables undo buttons (SPEC-23 S-P5). The mode-toggle button for `agent` stays ENABLED as long as there's any displayable residual activity — the user should still be able to review; they lose undo only.
- **S-T7 User manually collapses DocPanel.** Miles hits the collapse toggle. Panel collapses. He then clicks "Cursor" in the presence bar. Per G-T2, the panel auto-expands + flips to `agent` mode + scopes to Cursor.

## 4. Functional requirements

### Mode toggle

- **FR-T1** — `DocPanel` renders a two-value mode toggle above the existing sub-tab bar. Values: `doc` (default) and `agent`.
- **FR-T2** — In `doc` mode: the existing 5-tab bar + tab content are rendered (unchanged from SPEC-20 timeline-to-docpanel).
- **FR-T3** — In `agent` mode: the 5-tab bar is **not rendered**. Activity content is rendered directly below the mode toggle. No sub-tabs.
- **FR-T4** — `agent` mode toggle button is **disabled** (`aria-disabled="true"`, `disabled` on the underlying button, tooltip `"No active agents"`) when `hasActiveAgents === false`. `hasActiveAgents` is derived from `systemProvider.awareness.agentPresence` (any entry whose `ts` is within the stale TTL window).
- **FR-T5** — Clicking the `doc` mode pill when already in `doc` mode is a no-op. Clicking `agent` when disabled is a no-op.

### Presence-bar control plane

- **FR-T6** — Clicking any agent avatar in `PresenceBar` dispatches `openActivityPanel(connectionId)` (method name preserved from SPEC-23 for continuity). The method now updates `docPanelMode = 'agent'` + `docPanelAgentId = connectionId`, then increments `docPanelExpandSignal`. `EditorArea` observes the signal and expands the panel (or opens the mobile Sheet) if not already visible.
- **FR-T7** — Clicking the same avatar that is currently scoped (`docPanelMode === 'agent'` AND `docPanelAgentId === connectionId`) flips mode back to `doc` (toggle semantics preserved from SPEC-23 FR-P3).
- **FR-T8** — Clicking a different avatar swaps the scoped agent (stays in `agent` mode).
- **FR-T9** — Clicking an avatar while in `doc` mode or while panel is collapsed flips to `agent` mode + expands (does not toggle off).

### Expand-on-click

- **FR-T10** — `DocumentContext` exposes `docPanelExpandSignal: number` (monotonic counter). `openActivityPanel` increments this counter BEFORE updating mode/agentId in the same setState pass. `EditorArea` watches the counter via `useEffect`; on change, calls `panelRef.current?.expand()` (desktop) or `setSheetOpen(true)` (mobile). Effect is idempotent — if panel is already visible, the expand call is a no-op.

### State lifecycle

- **FR-T11** — Mode selection is held in `DocumentContext` (not `EditorArea` local state) so `openActivityPanel` from `PresenceBar` can mutate it. State is tab-scoped — no localStorage persistence.
- **FR-T12** — `docPanelAgentId` survives mode flips (if user flips `agent → doc → agent`, the previously-scoped agent is still selected). It is cleared only by: (a) `closeActivityPanel()` explicitly called, or (b) swap to a different agent via `openActivityPanel(newId)`.
- **FR-T13** — `docPanelAgentId` survives doc navigation (preserves SPEC-23 FR-P24 intent).

### Content continuity

- **FR-T14** — Activity content mounts when `docPanelMode === 'agent'` and `docPanelAgentId !== null`. When the user flips to `doc` mode, activity content unmounts. On flip back to `agent`, content re-mounts with the same scoped agent and re-fetches via `useActivityPanel(connectionId)` (cache is empty after the unmount cycle — acceptable cost).
- **FR-T15** — When `docPanelMode === 'agent'` but `docPanelAgentId === null` (edge case: user flipped to agent mode via the toggle without ever clicking an avatar), render a subtle empty-mode hint: *"Click an agent's avatar in the presence bar to view their session."*

## 5. Technical surface

### Changes in existing files

| File | Change |
|---|---|
| `packages/app/src/editor/DocumentContext.tsx` | Replace `activityPanelAgentId: string \| null` with (a) `docPanelMode: 'doc' \| 'agent'`, (b) `docPanelAgentId: string \| null`, (c) `docPanelExpandSignal: number`. Rework `openActivityPanel` per FR-T6/T7/T8; rework `closeActivityPanel` → sets mode='doc' (does not clear agentId, per FR-T12). |
| `packages/app/src/components/DocPanel.tsx` | Accept `mode`, `onModeChange`, `agentId`, `hasActiveAgents` props. Render mode-toggle ToggleGroup at top; conditional sub-tab + content rendering per FR-T2/T3. |
| `packages/app/src/components/EditorArea.tsx` | Read `docPanelMode`, `docPanelAgentId`, `docPanelExpandSignal` from DocumentContext. Compute `hasActiveAgents` from `systemProvider` awareness. Pass all to DocPanel. Wire expand-on-signal effect per FR-T10. |
| `packages/app/src/components/EditorPane.tsx` | Remove `<AgentActivityPanel />` mount (line 304) + its import. |
| `packages/app/src/presence/PresenceBar.tsx` | No change — `onClickAgent: (id) => openActivityPanel(id)` still works; context method now does mode-flip + expand instead of Sheet-open. |

### New file

| File | Responsibility |
|---|---|
| `packages/app/src/components/ActivityModeContent.tsx` | Replaces `AgentActivityPanel.tsx`. Owns `useActivityPanel(connectionId)` + postAgentUndo + navigateToDoc helpers + all sub-views (LoadingState / ErrorState / EmptyState / SessionEndedBanner / AgentAvatar / formatAgo). Renders activity content directly (no Sheet wrapper). Callable by `DocPanel` with `{ connectionId }` prop. |

### Deleted files

- `packages/app/src/components/AgentActivityPanel.tsx` (Sheet wrapper + body — content migrates to `ActivityModeContent.tsx`).
- `packages/app/src/components/ActivityPanelResizeHandle.tsx` (resize now via react-resizable-panels).
- `packages/app/src/lib/use-activity-panel-width.ts` (`DocPanel` handles width).
- `packages/app/src/lib/use-activity-panel-width.test.ts` (tests targeting deleted hook).
- `packages/app/src/components/AgentActivityPanel.test.tsx` (body tests migrate to `ActivityModeContent.test.tsx`).

### New helper

- `useHasActiveAgents(systemProvider)` in `packages/app/src/lib/use-activity-panel.ts` — subscribes to `systemProvider.awareness`, returns boolean derived from `agentPresence` + TTL staleness filter. Implemented identically to `computeWritingDocs` — pure `getStates()` walk + fresh-entry filter.

## 6. Decisions

**D-T1 — LOCKED. Mode-toggle, NOT 6th-tab.** A 6th tab inside the existing 5-tab bar was considered. Rejected because the existing tabs share an invariant (each is keyed to `activeDocName`; refetches on nav), and a 6th tab keyed to `connectionId` violates that invariant silently. The mode toggle makes the scope switch explicit in the UI, not a mental-model quirk the user has to learn.

**D-T2 — DIRECTED. Presence bar remains the control plane for agent selection.** The in-panel `agent` mode toggle flips the *mode*; the scoped *agent* is set by presence-bar clicks only. No in-panel dropdown, no chip row. Users already understand the presence bar; adding a second selection UI would duplicate it.

**D-T3 — DIRECTED. Ephemeral mode state (no localStorage).** Default `doc` on every reload. Reasoning: (a) matches SPEC-23 FR-P21 intent; (b) agent mode requires a live session, and there's no guarantee the scoped agent is still alive on reload.

**D-T4 — DIRECTED. Auto-expand on avatar click when collapsed.** Preserves SPEC-23 S-P1 discovery flow — clicking an avatar always produces a visible response, regardless of panel collapse state.

**D-T5 — DIRECTED. Disable `agent` mode toggle when zero agents.** Alternative considered: hide entirely. Rejected because a disabled toggle is a discoverable affordance ("oh, there's an Activity mode — I'd need to start an agent to see it"), whereas hiding is silent.

**D-T6 — DELEGATED. Exact visual treatment of the mode toggle.** Implementation may use `ToggleGroup` variant='outline' inline at the panel top, or a more prominent segmented control. The FR-T1/T2/T3 shape is locked; the chrome is flexible.

**D-T7 — LOCKED. No Esc / X close affordance for agent mode.** `DocPanel` is a layout panel, not a modal. Close = collapse via the existing toggle button (top-right of editor). SPEC-23 FR-P4 (Esc / X close) is obsolete.

**D-T8 — LOCKED. `react-resizable-panels` owns width.** The SPEC-23 `useActivityPanelWidth` + `ActivityPanelResizeHandle` primitives are deleted. `DocPanel` already has `defaultSize="25%"` / `minSize="300px"` / `maxSize="40%"` bounds via its ResizablePanel wrapper; activity mode inherits these.

## 7. Acceptance criteria

- **AC-T1 (G-T1, G-T2):** Click any agent avatar → if DocPanel is collapsed, it expands. Mode toggle flips to `agent`. Panel content is the activity list for that agent. Main editor unchanged. Playwright.
- **AC-T2 (FR-T7):** Click the same avatar a second time → mode toggles back to `doc`. Playwright.
- **AC-T3 (FR-T8):** Click a different avatar while in `agent` mode → swaps scoped agent, stays in `agent` mode. Playwright.
- **AC-T4 (FR-T9):** Click avatar A, flip to `doc` mode via mode toggle, then flip back to `agent` via mode toggle → still shows agent A's session (agentId survives mode flip). Unit + Playwright.
- **AC-T5 (FR-T4):** With zero agents in session, `agent` mode toggle button is disabled with aria-disabled="true" and a tooltip `"No active agents"`. Unit.
- **AC-T6 (FR-T13):** In `agent` mode, click a filename in the activity list → main editor navigates; panel stays in `agent` mode; scoped agent preserved. Playwright.
- **AC-T7 (FR-T11, FR-T12):** Mode + agentId are not persisted across tab reloads — first load is always `doc` mode with `docPanelAgentId = null`. Unit.
- **AC-T8 (FR-T14):** Activity content calls `GET /api/agent-activity?agentId=<id>` within 300 ms of entering `agent` mode with a scoped id. Playwright.
- **AC-T9:** `packages/app/src/components/AgentActivityPanel.tsx`, `ActivityPanelResizeHandle.tsx`, `src/lib/use-activity-panel-width.ts` + its test file do not exist. Typecheck + lint clean without them. Grep.

## 8. SPEC-23 corrigenda

The following SPEC-23 items are amended by this spec. Per the repo's post-ship annotation convention, breadcrumbs are appended in-line in SPEC-23 pointing to this file.

- **D-P9 LOCKED** → still LOCKED in spirit ("click-on-avatar = open panel") — the *mechanism* changes from "open Sheet" to "flip DocPanel mode + expand". Semantic intent preserved.
- **D-P12 / D-P13 / D-P14 DIRECTED** (right-side Sheet, single-panel swap, click-outside does NOT close) — **obsolete**. DocPanel host replaces all three.
- **D-P15 DIRECTED** (`react-diff-view` as renderer) — **preserved**. ActivityModeContent uses the same component.
- **FR-P1 through FR-P5** (anchor, mount, toggle, close, no-auto-nav) — reshaped by this spec; anchor + control plane preserved, mount shifts to DocPanel, close affordances change shape, no-auto-nav preserved.
- **FR-P21 through FR-P24** (tab-scoped state, swap behavior, live updates via CC1, nav-doesn't-close) — all preserved mechanically; wording updates to reflect the new host.
- **FR-P25** (CC1 `session-activity` channel) — **preserved** unchanged.

## 9. Implementation order

1. Follow-up spec (this file) committed first so the breadcrumbs in SPEC-23 have a pointer.
2. `DocumentContext` shape change — replace `activityPanelAgentId` with new trio. Incremental: existing callers still import via the same `openActivityPanel` method name.
3. Create `ActivityModeContent.tsx` — move body + helpers out of `AgentActivityPanel.tsx`.
4. Modify `DocPanel` — add mode toggle + conditional render.
5. Modify `EditorArea` — wire context mode, expand effect, hasActiveAgents.
6. Remove `<AgentActivityPanel />` mount from `EditorPane`.
7. Delete old files (AgentActivityPanel, ResizeHandle, width hook, width test, old body test).
8. Update user-facing docs + SPEC-23 breadcrumbs.
9. Rewrite Playwright E2E (`agent-activity-panel.e2e.ts`) to test mode toggle + expand behavior instead of Sheet open/close.

## 10. Risks

- **R-T1 — Auto-expand miss.** If the `docPanelExpandSignal` wiring drops a signal (e.g., `useEffect` dependency list wrong), the panel won't expand on avatar click — user gets no visible feedback. Mitigation: Playwright AC-T1 asserts expand-on-click with collapsed pre-state.
- **R-T2 — Mobile Sheet mode.** In mobile (width <960px), `DocPanel` lives inside a `Sheet` controlled by `sheetOpen`. The expand signal must ALSO open the Sheet in this layout. The effect needs to branch on `docPanelLayout`.

## 11. See also

- [[specs/2026-04-23-agent-activity-panel/SPEC]] — v1 Activity Panel (this spec amends).
- [[specs/2026-04-20-timeline-to-docpanel/SPEC]] — canonical host (DocPanel) + tab pattern.
- [[packages/app/src/components/DocPanel.tsx]] — host implementation.
- [[packages/app/src/editor/DocumentContext.tsx]] — shared state surface.
