# SPEC: PRD-6516 Cmd+K workspace omnibar

**Status:** Ready for implementation
**Baseline commit:** `5cc3e75`
**Date opened:** 2026-04-22
**Worktree:** `/private/tmp/open-knowledge-prd-6516-cmd-k-omnibar` (branch `feat/prd-6516-cmd-k-omnibar`)

## 1. Problem statement (SCR)

**Situation.** The app already has the primitives needed for file navigation and launch actions: server-backed page lists via `/api/pages`, folder derivation in `PageListContext`, file creation via `POST /api/create-page`, global `Cmd/Ctrl+K` capture in `CommandPalette`, shared handoff dispatch for Claude/Cursor/Codex, and a graph tab inside `DocPanel`.

**Complication.** The existing `CommandPalette` is desktop-only and project-oriented. It switches projects and opens folders, but it does not help a writer jump to files or folders inside the current knowledge base. Users with large trees still have to scroll or expand folders manually. The current palette also does not expose create-file/create-folder or graph-opening commands in the same searchable surface.

**Resolution.** Turn `Cmd/Ctrl+K` into a workspace omnibar that works on all hosts, searches exact text over file and folder names from the existing server-backed page list, shows recently opened items, and exposes a small command set: create file, create folder, open graph, and open in agent.

## 2. Goals

- **G1.** `Cmd+K` / `Ctrl+K` opens a single omnibar surface for workspace navigation.
- **G2.** Search is lexical and exact-ish, not fuzzy: substring/prefix matching over file and folder names/paths only.
- **G3.** All documents and known folders are discoverable from the omnibar.
- **G4.** A "Recently opened" section appears at the top when the query is empty.
- **G5.** Keyboard-first flow works end to end: open, arrow, enter, escape.
- **G6.** Omnibar includes commands for create file, create folder, open graph, and open in agent.
- **G7.** Search stays comfortably fast at 5,000 docs without introducing a full-text index or server-side search endpoint.

## 3. Non-goals

- **NOT NOW — LOCKED.** Full-text content search. This surface is path/name navigation only.
- **NOT NOW — LOCKED.** Semantic/vector search or BM25 indexing for the omnibar.
- **NOT NOW — LOCKED.** New server routes for search. Existing `/api/pages` + derived folder paths are sufficient.
- **NOT NOW — LOCKED.** Empty-folder creation. Existing create-folder flow remains composite (`folder/index.md`) through `NewItemDialog`.
- **NOT NOW — LOCKED.** A separate global graph route. "Open graph" targets the existing doc-side graph tab.

## 4. Users & journeys

**Persona A — Writer with a large KB.** Presses `Cmd+K`, types `arch`, sees matching docs/folders immediately, arrows to the intended result, hits Enter, lands on that doc or folder.

**Persona B — Folder navigator.** Types a folder name, selects the folder result, and lands on `FolderOverview` for that path.

**Persona C — Fast creator.** Presses `Cmd+K`, types `new file`, hits Enter, gets the existing create dialog with the current directory preselected.

**Persona D — Agent-heavy user.** Presses `Cmd+K`, types `claude` or `cursor`, and launches the active document into the installed agent target without going through the header dropdown.

**Persona E — Visual explorer.** Presses `Cmd+K`, runs `Open graph`, and the current document’s side panel switches to the Graph tab.

## 5. Current state

| Surface | Current behavior | Relevance |
| --- | --- | --- |
| `App.tsx` | Mounts `CommandPalette` only when `window.okDesktop` exists | Too narrow; omnibar should exist on web and desktop |
| `CommandPalette.tsx` | Electron-only project switcher + open-in-agent | Reuse this surface and the shadcn `Command` wrapper |
| `PageListContext.tsx` | Fetches `/api/pages`, exposes `pages`, `folderPaths`, metadata, and `addPage()` | Canonical search source for omnibar entries |
| `NewItemDialog.tsx` | Existing create-file/create-folder dialog and path composition | Reuse for omnibar commands |
| `useHandoffDispatch.ts` + `KNOWN_TARGETS` | Shared open-in-agent dispatch and installed-state handling | Reuse for omnibar commands |
| `DocPanel.tsx` | Graph exists only as a local tab state | Needs a small external control seam |

## 6. Target-state architecture

```text
App
  └── <CommandPalette bridge={window.okDesktop ?? null} />
        ├── global Cmd/Ctrl+K listener
        ├── uses PageListContext.pages + folderPaths as search corpus
        ├── uses useDeferredValue(query) for filtering
        ├── renders groups:
        │    - Recently opened
        │    - Navigate (files + folders)
        │    - Create
        │    - Open in agent
        │    - Project (Electron only; existing commands preserved)
        ├── navigates via window.location.hash
        ├── opens NewItemDialog for create commands
        └── dispatches doc-panel tab event for Open graph
```

### Search source

- Reuse `PageListContext` rather than fetching a second list.
- Documents come from `pages: Set<string>`.
- Folders come from `folderPaths: Set<string>`.
- This preserves the existing server-backed source of truth and its live refresh behavior (`subscribeToDocumentsChanged`).

### Search semantics

- Matching is case-insensitive over normalized path strings.
- No fuzzy transpositions, acronym matching, or typo tolerance.
- A result matches when the query is found as a contiguous substring in:
  - the basename, or
  - the full relative path.
- Ranking priority:
  1. exact basename match
  2. exact full-path match
  3. basename prefix match
  4. path-segment prefix match
  5. basename substring match
  6. full-path substring match
- Ties break alphabetically by path.
- Empty query shows recents first, then commands, then an initial capped navigation list.

### `qmd` decision

The suggested `qmd` package is **not** adopted as a runtime dependency for this feature. Its published package is a Node-native local search engine (`better-sqlite3`, `node-llama-cpp`, `sqlite-vec`, Node `>=22`), which is not a browser-safe fit for `packages/app`. The omnibar borrows only the idea of strict lexical matching rather than its runtime.

### Recents

- Add a small localStorage-backed recent-entry list for omnibar navigation.
- Record successful file/folder openings only.
- Keep newest-first, dedupe by `{kind, path}`, cap at 10.
- Recents render only when the query is empty.

### Create commands

- `New file`
- `New folder`

Behavior:
- Reuse `NewItemDialog`.
- Initial directory is:
  - active folder path when the current target is a folder
  - current file’s parent directory when a doc is active
  - root otherwise

### Open graph command

- Add a small app-local event seam for `DocPanel` tab selection.
- `CommandPalette` dispatches `"open-knowledge:doc-panel-tab"` with `{ tab: 'graph' }`.
- `DocPanel` listens and switches `activeTab` when mounted.
- The command is disabled when there is no active document.

### Open-in-agent commands

- Reuse `useInstalledAgents`, `buildHandoffInput`, and `useHandoffDispatch`.
- Show the same target set already supported by the app-level handoff system.
- Commands disable when there is no active document or the target is unavailable.

### Host behavior

- Web + Electron: workspace omnibar is mounted and usable.
- Electron only: preserve existing project-switcher commands (`Open folder…`, `Start fresh…`, recent projects).
- Web: these project commands are omitted; workspace commands remain available.

## 7. API and state changes

### No server API changes

- No new route.
- No change to `/api/pages`, `/api/documents`, or create endpoints.

### New client-only helpers/state

- `omnibar-search.ts` (pure search corpus + ranking helpers)
- `omnibar-recents.ts` (localStorage read/write + dedupe)
- `doc-panel-events.ts` (event constant + helpers for opening tabs)

These can be named differently at implementation time, but the responsibilities should stay split this way.

## 8. Acceptance criteria

**G1 — Omnibar surface**
- [ ] `Cmd+K` / `Ctrl+K` opens the omnibar anywhere in the app.
- [ ] `Escape` closes it.
- [ ] Web builds mount the omnibar; it is no longer Electron-only.

**G2/G3 — Exact file/folder search**
- [ ] The omnibar searches files and folders from the existing server-backed page list.
- [ ] Results use lexical substring/prefix matching only; no fuzzy matching.
- [ ] Folder results are included and navigable.
- [ ] Enter on a file navigates to that document.
- [ ] Enter on a folder navigates to that folder target.

**G4 — Recents**
- [ ] Empty-query state shows a "Recently opened" group when there is history.
- [ ] Opening the same file/folder repeatedly does not duplicate entries.
- [ ] Entries persist across reloads via localStorage.

**G5 — Keyboard UX**
- [ ] Arrow keys change the active item.
- [ ] Enter runs the active item.
- [ ] Escape closes the omnibar without mutating navigation state.

**G6 — Commands**
- [ ] `New file` opens `NewItemDialog(kind='file')`.
- [ ] `New folder` opens `NewItemDialog(kind='folder')`.
- [ ] `Open graph` switches the current doc panel to the Graph tab.
- [ ] Open-in-agent items dispatch through the existing shared handoff path.

**G7 — Performance**
- [ ] Filtering 5,000 docs stays under the existing UX bar (<100 ms target) without a new index or network round-trip per keystroke.
- [ ] Filtering is done against in-memory app state, not by hitting the server on each keypress.

## 9. Decision log

| ID | Decision | Owner | Status |
| --- | --- | --- | --- |
| D1 | Reuse and expand `CommandPalette.tsx` instead of introducing a second palette component | Agent | DIRECTED |
| D2 | Search corpus comes from `PageListContext.pages` + `folderPaths`, not a new API route | Agent | DIRECTED |
| D3 | Matching is lexical substring/prefix only; fuzzy search is explicitly out | Agent | DIRECTED |
| D4 | `qmd` is not added as a frontend dependency; use it as search-semantics inspiration only | Agent | DIRECTED |
| D5 | Recents are client-side localStorage state, not persisted server-side | Agent | DIRECTED |
| D6 | "Open graph" targets the existing `DocPanel` graph tab via a small event seam | Agent | DIRECTED |
| D7 | Electron project-switcher commands stay in the omnibar, but only on Electron hosts | Agent | DIRECTED |

## 10. Risks & mitigations

| ID | Risk | Mitigation |
| --- | --- | --- |
| R1 | `cmdk` default filtering reintroduces fuzzy behavior | Disable built-in filtering and feed pre-ranked results |
| R2 | A second documents fetch drifts from existing page state | Reuse `PageListContext` instead of adding new fetch logic |
| R3 | Graph command adds brittle cross-component wiring | Use one explicit event helper with unit coverage rather than ad hoc DOM dispatch |
| R4 | Web host loses current desktop-only palette behavior | Keep Electron-only project commands behind `bridge != null` while making workspace commands host-agnostic |
| R5 | Recents become stale after rename/delete | Store by current opened path and best-effort prune entries whose path is no longer present from the active corpus on render |

## 11. Testing plan

- **Unit**
  - search normalization + ranking
  - folder/document corpus derivation
  - recent-entry dedupe/cap behavior
  - doc-panel event helper behavior
- **Component/unit**
  - omnibar host gating (web vs Electron project commands)
  - create commands open the correct dialog kind
  - graph command disables when no active doc
  - handoff commands disable when input/install state is missing
- **Verification gate**
  - `bun run check`

## 12. Rollout

- Single PR, no feature flag.
- No migration.
- No server coordination required.

