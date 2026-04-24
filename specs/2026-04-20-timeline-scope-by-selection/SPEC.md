---
title: "Timeline Scope-by-Selection"
status: draft
created: 2026-04-20
updated: 2026-04-20
owner: miles@inkeep.com
research: reports/timeline-scope-filter-patterns/REPORT.md
---

# Timeline Scope-by-Selection

## 0. Tl;dr

Extend the existing TimelinePanel to show history at three scopes — **file**, **folder**, or **project** — with the panel's scope bound to what the user is currently looking at in the FileSidebar/FileTree, plus explicit overrides (context-menu entry points on folder rows; a scope selector inside the panel). Query-layer plumbing already supports all three scopes via git pathspec; the work is (a) relaxing the `docName`-is-required contract at the API/MCP/UI boundaries, (b) adding a scope model to TimelinePanel that binds to `activeTarget`, (c) handling click-an-entry semantics when entries touch multiple files, (d) preventing density from turning project scope into a wall of events.

## 1. Problem

### Situation (SCR)

Open Knowledge ships a TimelinePanel that displays version history for exactly one document — the active doc in the editor. The panel is a right-side Sheet opened via a header button. The underlying shadow-repo query (`getDocumentHistory` in `packages/server/src/timeline-query.ts`) uses git pathspec and already accepts an undefined path to walk the whole project, but the entire stack above it (HTTP endpoint, MCP tool, React prop) hard-requires `docName`.

### Complication

Users working across multiple docs have no way to browse edit history at anything other than a single-file grain. Concretely:

1. **No folder-scoped investigation.** "What changed under `specs/` today?" requires opening each doc in turn and assembling a mental union. The shadow repo already contains the data; there is no UI that exposes it.
2. **No project-scoped activity view.** Agent-driven workflows routinely produce multi-doc commits (a single agent WIP commit on a writer ref can touch 10+ docs). Viewing those by opening individual docs fragments the signal — the agent's "pass" disappears when sliced per-file.
3. **Scope coupling to editor state.** To see a file's history, the user must open it. Can't browse history of a file while staying parked on a different file.
4. **The FileSidebar already has a selection model.** `activeTarget: ResolvedNavigationTarget` already encodes "user is looking at this doc" vs. "user is looking at this folder" vs. "user is looking at a folder index." Yet the timeline ignores that signal — it uses only `activeDocName`.

### Resolution

Implement **context-bound scope-by-selection with explicit overrides** per [`reports/timeline-scope-filter-patterns/REPORT.md`](../../reports/timeline-scope-filter-patterns/REPORT.md) Synthesis §"three scope models." The panel's default scope follows `activeTarget`; explicit affordances (scope selector inside the panel, context-menu entries on folder rows, a project-scope header button) let users pin a scope independently of what they're editing.

### Problem stress-test

1. **Demand reality:** Real — confirmed by the user invoking /spec on this specific option after reviewing the research report. Signal triangulation: GitHub ships file/folder/repo scope for the same reason; agent-heavy workflows (Open Knowledge's core demographic) produce multi-doc commits that today's UI fragments.
2. **Status quo:** Not urgent; the product functions. But the capability gap widens as agent density grows, and there's no alternative mechanism to inspect cross-doc activity without opening each doc.
3. **Narrowest wedge:** Open Question — whether to ship file+folder first with project deferred, or all three in one pass (see Decisions §D1).
4. **Observation:** No direct user study cited. The design is backed by research-derived patterns and first-principles from the codebase's existing scope primitives.
5. **Future-fit:** Grows in importance. Agent throughput + workspace size both trend up; multi-scope history becomes load-bearing for investigative workflows.

## 2. Goals + non-goals

### Goals

- **G1.** Let users see timeline entries at file, folder, or project scope without leaving the panel.
- **G2.** Make scope default to whatever the user is currently looking at (no manual selection required in the common case).
- **G3.** Let users pin a scope explicitly (segmented control inside panel; context-menu entries on folder rows).
- **G4.** Keep the existing per-file UX identical when scope is file — no regression for the current dominant path.
- **G5.** Preserve the existing restore-from-entry flow for single-file scope; define defensible semantics for multi-file scope.
- **G6.** Avoid the "wall of events" failure mode at project scope — density must be managed.

### Non-goals

- **NG1.** Permission-scoped history (ACLs, per-user visibility). Deferred.
- **NG2.** Cross-workspace / cross-repo history. Open Knowledge is single-workspace per server by design.
- **NG3.** Changing the shadow-repo on-disk format or ref layout.
- **NG4.** Enabling changed-path Bloom filters on the shadow repo. Deferred per [research report D3](../../reports/timeline-scope-filter-patterns/REPORT.md).
- **NG5.** Replacing or restructuring the existing checkpoint/WIP/upstream entry-type model.
- **NG6.** Building a parallel event-log database (Postgres audit table, etc.). Shadow repo stays the source of truth.
- **NG7.** Project-wide or folder-wide restore ("revert the whole folder to 3 days ago"). Out of scope — restore stays single-doc.

## 3. Consumers + personas

Primary personas (derived from worldmodel + research):

- **P1 — Human author (individual):** writes docs; occasionally wants to see "what did I change in this folder last week" or "what did the agent do across my notes overnight."
- **P2 — Human reviewer (collaborator):** opens a shared workspace; wants to see recent activity across a specific area without knowing individual doc names.
- **P3 — Agent operator (CI / pipeline):** runs agents that produce multi-doc edits; wants to audit an agent's "pass" as a single unit — all docs touched, not per-doc fragments.

Consumer surfaces that change:

| Surface | Change shape | Priority |
|---|---|---|
| React TimelinePanel component | New scope prop + internal scope selector | P0 |
| `GET /api/history` HTTP endpoint | Accept optional scope descriptor; `docName` becomes optional | P0 |
| `get_history` MCP tool | Accept optional scope param; soften `docName: z.string()` | P0 |
| FileTree context menu | New "Show history for this folder" entry | P0 |
| EditorHeader | Option: project-scope entry point (button or menu item) | P1 → P0 pending D2 |
| CLI (if a history subcommand ships) | Same as MCP | P2 |

## 4. In Scope / Out of Scope

**In Scope (P0):**
- Three-scope model (file / folder / project) in TimelinePanel with internal scope selector
- Scope-by-selection binding via `activeTarget` in DocumentContext
- API contract change: `/api/history` accepts optional `scope=project` OR path-based descriptor (see D3)
- MCP tool contract change: `get_history` accepts optional scope params (see D4)
- FileTree context-menu entry for folder rows
- Click-entry semantics under multi-file scope (see D5)
- Basic density management at project scope (grouping; see D6)

**Out of Scope (P2 — Future Work):**
- Bloom-filter enablement (Identified — research report has the policy options)
- Run-consolidation at the data model level (Identified — would need TimelineEntry schema extension for time ranges)
- Date-range filter (Identified — would compose with scope; natural next filter dimension)
- Advanced filter composition (Linear-style AND/OR chip bar — Noted)
- Project-level "pinned scope" persisted across sessions (Noted)

## 5. System context

```
                ┌───────────────────────────────────────────────┐
                │ Browser                                       │
                │                                               │
                │  FileSidebar ───selects───> activeTarget      │
                │                                 │             │
                │                                 v             │
                │                         DocumentContext       │
                │                                 │             │
                │                                 v             │
                │  EditorHeader ──opens──> TimelinePanel        │
                │       │                   │    │              │
                │       │                   │    │ (scope)      │
                │  project-scope            │    v              │
                │  entry point          context-menu   scope    │
                │                       on folder      selector │
                │                       (FileTree)    (in panel)│
                │                                               │
                │  fetch(/api/history?scope=...)                │
                └──────────────────────┬────────────────────────┘
                                       │
                                       v
                ┌───────────────────────────────────────────────┐
                │ Hocuspocus server                             │
                │  /api/history handler (api-extension.ts)      │
                │       │                                       │
                │       v                                       │
                │  getDocumentHistory(shadow, { ...query })     │
                │       │                                       │
                │       v                                       │
                │  git log <refs> [-- <pathspec>]               │
                │    (pathspec: file | folder | absent)         │
                └───────────────────────────────────────────────┘
```

## 6. User journeys

### J1 — File scope (existing behavior, unchanged)
1. User opens `specs/foo.md` in editor.
2. Clicks Timeline in EditorHeader.
3. Panel opens; `activeTarget.kind === 'doc'` → panel defaults to **file scope** for `specs/foo.md`.
4. Sees checkpoints + WIP groups for that file only.
5. Clicks an entry → preview diff for `specs/foo.md`.

### J2 — Folder scope via selection
1. User navigates to `#/specs/` (clicks folder row in FileSidebar, or types hash). `activeTarget.kind === 'folder'`.
2. FolderOverview renders in main pane.
3. User clicks Timeline in EditorHeader.
4. Panel opens; scope defaults to **folder scope** `specs/`.
5. Sees entries touching any file under `specs/` — date-bucket grouped.
6. Clicks an entry → click-semantics decided per D5.

### J3 — Folder scope via explicit context menu
1. User has `specs/foo.md` open (editor focus doesn't move).
2. Right-clicks `specs/` folder row in FileSidebar → "Show history for this folder."
3. Panel opens with folder scope pinned to `specs/`. Editor remains on `specs/foo.md`.
4. Scope selector shows "Folder: specs/" with an X to revert to selection-bound mode.

### J4 — Project scope via explicit entry point
1. User clicks "Show project history" in EditorHeader overflow menu (or equivalent — pending D2).
2. Panel opens with project scope pinned.
3. Scope selector shows "Project" as the active pill.

### J5 — Selection-driven re-scope
1. User opens `specs/foo.md` → panel scope is file(`specs/foo.md`).
2. User navigates to `stories/bar.md` via sidebar click.
3. If scope is in selection-bound mode, panel re-scopes to file(`stories/bar.md`).
4. If scope was explicitly pinned (e.g. via context menu), panel stays pinned — does NOT auto-re-scope.

### J6 — Multi-file entry click (folder or project scope)
1. User is in project scope; sees an agent WIP entry whose `contributors[].docs` lists 5 files.
2. User clicks the entry.
3. Behavior per D5.

## 7. Proposed design

### 7.1 Scope model

Scope is a tagged union, derived from either `activeTarget` (selection-bound) or explicitly pinned:

```ts
type TimelineScope =
  | { kind: 'file';    docName: string }     // e.g. 'specs/foo.md' (extension-bearing form)
  | { kind: 'folder';  folderPath: string }  // e.g. 'specs/' (trailing slash optional)
  | { kind: 'project' };

type ScopeBinding =
  | { mode: 'selection'; scope: TimelineScope }   // derived from activeTarget
  | { mode: 'pinned';    scope: TimelineScope };  // explicit override
```

Mapping `activeTarget` → selection-bound scope:

| `activeTarget.kind` | TimelineScope |
|---|---|
| `'doc'` | `{ kind: 'file', docName: activeTarget.docName }` |
| `'folder-index'` | `{ kind: 'folder', folderPath: activeTarget.folderPath }` |
| `'folder'` | `{ kind: 'folder', folderPath: activeTarget.folderPath }` |
| `'missing'` | `{ kind: 'project' }` (fallback; see D7) |
| `null` | `{ kind: 'project' }` |

### 7.2 API contract change

`GET /api/history` today: `docName` is required. Proposal:

- Add optional `scope` query param: `scope=project` (no path needed), `scope=folder&path=specs/`, `scope=file&docName=specs/foo`.
- Keep the legacy shape: `docName=X` with no `scope` → interpret as `scope=file&docName=X` for backward compatibility.
- If both `scope` and `docName` are present with inconsistent meaning, return 400.
- See D3 for final shape decision.

### 7.3 Query-layer change

`getDocumentHistory(shadow, query, contentRoot)`:

- Add `scope?: TimelineScope` to `HistoryQuery`.
- When `scope.kind === 'folder'`: set pathspec to `<normalizedRoot>/<folderPath>/` (trailing slash; git treats with/without identically per research).
- When `scope.kind === 'project'`: pathspec is undefined (current behavior when `docName` is undefined).
- When `scope.kind === 'file'`: identical to today.
- Legacy param `docName` (no `scope`) continues to produce file-scope pathspec.

### 7.4 MCP tool contract change

- Relax `get_history`'s `docName: z.string()` → discriminated union on `scope`. See D4 for final shape.

### 7.5 TimelinePanel UI

```
┌─ Timeline ──────────────────────────── X ─┐
│ ┌──────────────┬──────────┬───────────┐   │  <-- scope selector (segmented)
│ │  File        │ Folder   │  Project  │   │
│ └──────────────┴──────────┴───────────┘   │
│ Context chip: specs/foo.md   (or [specs/])│  <-- shows current scope target
│ ────────────────────────────────────────  │
│ (entries)                                  │
│ ◆ Save Version          Alice  3 min ago  │
│   specs/foo.md                             │
│ ▸ Show 4 auto-saves                       │
│ ...                                        │
└───────────────────────────────────────────┘
```

- **Segmented control:** 3 pills — File / Folder / Project. Enabled/disabled state depends on `activeTarget` (File disabled when no `activeDocName`; Folder disabled when no folder context available).
- **Context chip:** shows the scope's path (file: doc name, folder: folder path, project: "Project"). Clicking the chip copies/navigates (deferred).
- **Mode indicator:** A subtle "· pinned" indicator when `binding.mode === 'pinned'`; clicking reverts to `'selection'` mode.

### 7.6 Entry-click semantics (multi-file scope)

See D5 for the decision.

### 7.7 Density management

At folder and project scope, entries are already Checkpoint-landmark + WipGroup-collapse per today's TimelinePanel structure. Additive changes (per D6):

- Date-bucket headers (Today / Yesterday / This week / Older) when scope ≠ file.
- WipGroup grouping key extends from "between checkpoints" to "between checkpoints within a date bucket."
- Lazy-load older entries via existing offset/limit plumbing (today `limit=100`; keep).

### 7.8 Polling

Today: `setInterval(fetchHistory, 10_000)` unconditionally while open. Proposal:

- Keep 10s at file + folder scope.
- At project scope, increase to 30s (justification: cost scales with commit count, and project-wide activity is less latency-sensitive than per-file). See D8.

## 8. Decisions

See §10 Decision Log. Decisions are tracked in-line in SPEC iteration and surfaced here after LOCKED.

## 9. Risks / unknowns

- **R1. Performance at project scope on large workspaces.** `git log` without pathspec walks everything; for workspaces with 100K+ shadow commits, 10s polling could be expensive. Mitigation: polling cadence per scope (D8); soft cap on commit walk via `--max-count` or `--since`; observe with existing `[timeline] query ... duration=Xms` log line.
- **R2. UX confusion from scope flipping on navigation.** If the panel is open and the user clicks a new file, scope auto-changes. Users may find this jarring. Mitigation: pinned mode is a first-class override; visual indicator when pinned vs. selection-bound.
- **R3. Restore ambiguity at multi-file scope.** Addressed via D5 but worth surfacing as ongoing attention — if the chosen semantic is "navigate-on-click," users must have a way to return to scope view.
- **R4. API compatibility.** `docName` as required → optional is a 1-way door on the HTTP/MCP contract. Once relaxed, cannot tighten without breaking agent consumers. Mitigation: design the optional form once (D3/D4) to avoid re-migration.
- **R5. Agent-undo / rollback remains single-doc.** Research report D5 noted the restore affordance targets `activeDocName`. If folder/project scope surfaces entries that span multiple docs, the restore flow must degrade gracefully. See D5.

## 10. Decision log

Tracked in §13 (Open Questions → Decision Batch). Entries move here after user confirmation.

## 11. Assumptions

- **A1.** `activeTarget` is reliably set by the existing navigation system (hash-based URLs + FileTree clicks). Confidence: HIGH — verified in codebase trace.
- **A2.** Shadow-repo git log at project scope is fast enough at typical workspace size (<10K commits) for 10-30s polling to be fine. Confidence: MEDIUM — not measured; informed by research D3. Verification plan: instrument with existing `[timeline] query duration` log; if p99 exceeds 1s at project scope on a real workspace, consider Bloom filter enablement (deferred per prior decision).
- **A3.** Existing `TimelineEntry.contributors[].docs` field is populated reliably for all entries touching multiple docs. Confidence: HIGH — parsed from commit-message body by `parseContributors`; already rendered in the UI.
- **A4.** `contentRoot` (from `config.yml`) is consistently resolved across all call sites. Confidence: HIGH — single source of truth (`packages/cli/src/config/paths.ts`).
- **A5.** No reserved system docs (`__system__`) appear in folder/project scope history — they're filtered at write time by ContentFilter + persistence. Confidence: HIGH per CLAUDE.md STOP rules.

## 12. Future work

**Explored (investigated in-spec, deferred):**
- Changed-path Bloom filters for shadow-repo commit-graph. Research report has three policy options; enabled when workspace-scale measurement justifies.
- Run-consolidation at the data model (TimelineEntry as `{timestamp}` OR `{startTimestamp, endTimestamp, count}`). Spec-time call: schema extension preferred but not blocking for V1.

**Identified (known to matter, not deeply investigated):**
- Date-range filter (e.g. "this week"). Composes cleanly with scope on top of existing `--since`/`--until` git log flags.
- Per-user-pinned scope persisted to localStorage (so panel re-opens with the user's preferred default).
- Project-scope performance benchmarking.

**Noted (surfaced but not examined):**
- Advanced filter composition (Linear-style chip bar with AND/OR).
- Scope-aware polling backoff when panel is open but user is idle.
- Project-wide restore / rollback (out of scope per NG7; noted for posterity).

## 13. Open questions → decision batch

(Active — resolved items move to §10.)

See "Items needing your input" section of the chat response.

## 14. Verification & acceptance

### Acceptance criteria (derived from requirements; sharpened during iterate phase)

- **AC1.** At file scope, TimelinePanel renders identically to current behavior for the same doc.
- **AC2.** With `activeTarget.kind === 'folder'`, opening TimelinePanel shows entries touching any file under that folder, sorted newest-first.
- **AC3.** With the project-scope entry point clicked, TimelinePanel shows entries across the whole workspace (no pathspec).
- **AC4.** `GET /api/history?scope=project` returns entries without requiring `docName`.
- **AC5.** `GET /api/history?scope=folder&path=specs/` returns entries touching `specs/**`.
- **AC6.** Legacy `GET /api/history?docName=X` (no scope) continues to work identically to today.
- **AC7.** MCP `get_history` can be called without `docName` when `scope=project`.
- **AC8.** FileTree folder-row context menu has a "Show history for this folder" entry; clicking it opens TimelinePanel with folder scope pinned.
- **AC9.** Scope selector in panel switches between file/folder/project; disabled pills reflect what's reachable from current state.
- **AC10.** Click-entry behavior under multi-file scope matches D5 semantics.
- **AC11.** Density-management grouping per D6 renders at folder + project scope without double-grouping at file scope.

### Observability

- Existing `[timeline] query docName=X entries=N duration=Ms` log line extends: replace `docName=X` with `scope=<kind> target=<path-or-project>`.
- Add a metric counter (per-scope) on the `/api/metrics/reconciliation`-style endpoint if deemed useful — P2.

## 15. Rollout

- Single-PR feature. No schema migration. No backfill.
- Gates: passes `bun run check`; passes E2E tests under new scope modes.
- No feature flag needed (additive, behind the existing TimelinePanel open state).
- Backward-compat surface: legacy `docName` HTTP + MCP shape continues to work for at least 2 releases before potential deprecation.

## 16. Agent constraints

To be finalized at Scope Freeze (§6). Draft:

- **SCOPE:** `packages/app/src/components/TimelinePanel.tsx`, `packages/app/src/components/EditorPane.tsx`, `packages/app/src/components/FileTree.tsx`, `packages/server/src/timeline-query.ts`, `packages/server/src/api-extension.ts`, `packages/cli/src/mcp/tools/get-history.ts`, plus new evidence/tests.
- **EXCLUDE:** Shadow-repo internals (ref layout, commit writing); persistence; observer bridge; reconciliation. Do not touch agent-undo flow.
- **STOP_IF:** A change requires modifying `TimelineEntry` shape or `shadow-repo-layout.ts`. A change requires adding a new Y.Doc subdocument. A change requires touching the bridge invariants.
- **ASK_FIRST:** Before any change that alters HTTP/MCP request/response shape beyond the documented optional params in D3/D4.
