# SPEC: File sidebar — "+ New file" entry points

**Status:** Ready for implementation
**Baseline commit:** `100ae99`
**Date opened:** 2026-04-14
**Worktree:** `.claude/worktrees/examine-new-file-op` (branch `worktree-examine-new-file-op`)

## 1. Problem statement (SCR)

**Situation.** The editor has a file tree with rename/delete, a working `POST /api/create-page` endpoint, and a `CreatePageDialog` triggered today only by broken wiki-links.

**Complication.** There is no way to create a file directly from the sidebar. Users must author a wiki-link placeholder and click it, or create the file on disk outside the app — both bypass the app's UX.

**Resolution.** Add a "+" affordance in the sidebar header, "New file here" / "New folder here" context-menu entries on file and folder rows, a keyboard shortcut, and an empty-state CTA. Files are always created with a fully determined path; no auto-generated placeholders.

## 2. Goals

- **G1.** Discoverable sidebar action that creates a `.md` file at a known path.
- **G2.** Default path matches intent with zero input: active file's parent directory; else project root.
- **G3.** Folder-targeted creation via right-click "New file here" / "New folder here" on any row.
- **G4.** Support creating a new folder (composite flow — always contains an initial file).
- **G5.** `Cmd/Ctrl+Alt+N` keyboard shortcut for "new file".
- **G6.** First-run empty-state CTA.

## 3. Non-goals (with maturity tiers)

- **NOT NOW — Identified.** Inline rename-style create in the tree row. *Why:* collaborative-edit complexity. Revisit once the buttons are proven.
- **NOT NOW — Noted.** Template picker / pre-filled content.
- **NOT NOW — Noted.** Drag-and-drop import from OS.
- **NOT NOW — Noted.** New empty folder (folder with no initial file). *Why:* `/api/documents` enumerates files only, so empty folders would be invisible in the tree. Deferred to a future pass that surfaces empty folders end-to-end.
- **NEVER.** Auto-generated "Untitled-1.md" / "Untitled-2.md" placeholder filenames. *Why:* violates the "known path at creation" invariant (U1).

## 4. Users & journeys

**Persona A — New note from scratch.** Clicks "+" in header → dropdown → "New file" → dialog opens with `{active-dir}/` prefilled → types name → Enter → file opens.

**Persona B — New note in a subfolder.** Right-clicks a folder row → "New file here" → dialog opens with `{folder-path}/` prefilled → types name → Enter.

**Persona C — Fresh workspace.** Sees "No files yet. [Create your first file]" CTA → click → dialog opens at root.

**Persona D — Power user.** `Cmd/Ctrl+Alt+N` opens the dialog with active-dir default.

**Persona E — Existing wiki-link author.** Clicks a broken `[[Target]]` link → dialog opens with `{active-dir}/target-slug.md` prefilled (existing flow preserved).

## 5. Surfaces & consumer matrix

| Consumer                | Surface                                      | Change                                                                       |
| ----------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| UI — Sidebar header     | `FileSidebar.tsx`                            | Add `<SidebarMenuAction>` "+" button → dropdown menu ("New file"/"New folder") |
| UI — File tree row      | `FileTreeNode` in `FileTree.tsx`             | Prepend "New file here" and "New folder here" entries to the context menu    |
| UI — Empty state        | `FileTree.tsx` empty-state branch            | Add `<Button>Create your first file</Button>`                                |
| UI — Global keybind     | `App.tsx` (new `NewItemShortcut` handler)    | `Cmd/Ctrl+Alt+N` opens dialog with active-dir default                        |
| UI — Dialog             | `CreatePageDialog.tsx` → `NewItemDialog.tsx` | Refactor: add `kind: 'file' \| 'folder'`, `initialDir`, `suggestedName` props |
| UI — Wiki-link caller   | `WikiLinkView.tsx`                           | Pass `kind='file'`, derive `initialDir` from active doc, `suggestedName` from slug |
| Server                  | `POST /api/create-page`                      | **No change.** Existing validation handles all new callers.                  |

## 6. Target-state architecture

```
FileSidebar
  ├── Header
  │    ├── "Files" label
  │    └── <NewItemButton />                          ← new
  │         ↓ click
  │         <DropdownMenu>                            ← new
  │           ├── "New file"   → opens NewItemDialog(kind='file',   initialDir=activeDir)
  │           └── "New folder" → opens NewItemDialog(kind='folder', initialDir=activeDir)
  │
  └── FileTree
       ├── empty-state (no files, no error)
       │    └── "No files yet. [Create your first file]"  ← CTA opens NewItemDialog(kind='file', initialDir='')
       │
       └── FileTreeNode (per row; both kinds)
            └── ContextMenu
                 ├── "New file here"                  ← new: file rows → parent dir; folder rows → folder path
                 ├── "New folder here"                ← new: same targeting rule
                 ├── ── (separator) ──
                 ├── Rename    (existing)
                 └── Delete    (existing)

App
  └── DocumentProvider
       └── NewItemShortcutHandler                     ← new (must be inside DocumentProvider — uses useDocumentContext)
            └── window 'keydown' listener
                  - matches (Cmd/Ctrl)+Alt+N
                  - ignores when event.target is contenteditable / input / textarea
                  - opens NewItemDialog(kind='file', initialDir=dirname(activeDocName) || '')
```

### Dialog component — `NewItemDialog`

```ts
interface NewItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'file' | 'folder';
  initialDir: string;          // '' = project root
  suggestedName?: string;      // e.g., wiki-link slug — prefilled in the file-name input
  onCreated: (docName: string) => void;
}
```

**`kind === 'file'`**
- Two display elements: a non-editable directory prefix (`${initialDir}/` or `(root)`) and an editable filename input.
- Filename input is pre-filled with `suggestedName ?? 'untitled.md'`, with the basename selected on focus (so typing replaces "untitled" but keeps `.md`).
- Submit composes `${initialDir ? initialDir + '/' : ''}${filename}` and POSTs `{ path }` to `/api/create-page`.
- If the filename does not end with `.md`, append `.md` before submit.

**`kind === 'folder'`**
- Three display elements: directory prefix, editable folder-name input, editable first-file input.
- Folder-name input: blank, with placeholder `folder-name`.
- First-file input: pre-filled with `index.md` (basename selected on focus). Always required.
- Submit composes `${initialDir ? initialDir + '/' : ''}${folderName}/${fileName}` (with `.md` auto-append), POSTs to `/api/create-page`.
- The existing endpoint's `mkdirSync(dirname, { recursive: true })` creates the folder as a side effect (verified at `packages/server/src/api-extension.ts:1405`).

**Shared validation (client-side pre-check, fail-fast before network):**
- Non-empty.
- No `..` segments.
- No leading `/`.
- No `\`, no null byte.
- Server is the source of truth for: reserved names, EEXIST (409), content-dir containment.

**Success path (both kinds):**
1. Close dialog.
2. `window.location.hash = '#/' + docName` (existing NavigationHandler opens the editor).
3. `emitDocumentsChanged()` — force-refresh the tree.

**Subscription wiring (audit-derived addition).** `FileTree` does not currently subscribe to `documents-events`; only `PageListContext` does. We add `subscribeToDocumentsChanged(fetchDocs)` inside `FileTree`'s mount effect (and unsubscribe in cleanup) so the tree updates immediately on create/rename/delete. The 5-second poll remains as a fallback for missed events.

## 7. Default-target resolution (central policy)

```ts
function defaultInitialDir(activeDocName: string | null): string {
  if (!activeDocName) return '';
  const slash = activeDocName.lastIndexOf('/');
  return slash > 0 ? activeDocName.slice(0, slash) : '';
}
```

- Header "+" → `defaultInitialDir(activeDocName)`.
- Keyboard shortcut → `defaultInitialDir(activeDocName)`.
- Empty-state CTA → `''` (no active doc when tree is empty).
- Context menu on folder row → that folder's `path` (folder rows only — file rows keep today's Rename/Delete menu unchanged).
- Wiki-link flow → `defaultInitialDir(activeDocName)` + `suggestedName = toWikiLinkSlug(target) + '.md'`.

## 8. Acceptance criteria

**G1 — Sidebar header button.**
- [ ] `FileSidebar` header renders a `+` icon button with `aria-label="New file or folder"`.
- [ ] Clicking opens a dropdown with "New file" and "New folder".
- [ ] Selecting an item opens `NewItemDialog` with the correct `kind` and `initialDir`.
- [ ] Button is keyboard-focusable and menu is keyboard-navigable.

**G2 — Default target.**
- [ ] Header "+" and shortcut open the dialog with `initialDir = defaultInitialDir(activeDocName)`.
- [ ] When no file is active, `initialDir = ''` (root).

**G3 — Context menu.**
- [ ] Right-click on **folder** row shows "New file here" / "New folder here" above Rename.
- [ ] Right-click on **file** row shows only Rename / Delete (unchanged from today).
- [ ] Selecting a folder-row entry opens `NewItemDialog` with the correct `kind` and `initialDir`.

**G4 — Folder creation (composite).**
- [ ] "New folder" dialog renders two inputs: folder name (blank, placeholder `folder-name`) + first-file name (pre-filled `index.md`, basename selected on focus).
- [ ] Submit creates `{initialDir}/{folderName}/{fileName}.md` via the existing endpoint (one round trip).
- [ ] Success path opens the new file in the editor.
- [ ] Client-side validation rejects empty folder-name; Create button is disabled until folder-name is non-empty (file-name has a default and is always non-empty unless the user clears it).
- [ ] Server's `mkdirSync(dirname, { recursive: true })` is exercised by an integration test (one new test that confirms a not-yet-existing folder appears after composite create).

**G5 — Keyboard shortcut.**
- [ ] `Cmd+Alt+N` (macOS) / `Ctrl+Alt+N` (Linux/Windows) opens the new-file dialog with default target.
- [ ] Shortcut does **not** fire when focus is inside an `input`, `textarea`, or `[contenteditable="true"]` element (i.e., editor focus).
- [ ] Shortcut is `Cmd+Alt+N` (macOS) / `Ctrl+Alt+N` (other) — a deliberate trade-off to avoid the most common collisions (`Cmd/Ctrl+N` = new window; `Cmd/Ctrl+Shift+N` = incognito). May still collide with OS-level shortcuts (e.g., macOS Finder's Cmd+Opt+N for Smart Folders if Finder is foreground); accepted as v1 trade-off.

**G6 — Empty-state CTA.**
- [ ] When `/api/documents` returns `[]` and there is no error, the empty-state renders "No files yet." + a `Button` labelled "Create your first file".
- [ ] Clicking opens `NewItemDialog(kind='file', initialDir='')`.
- [ ] Error state (e.g., "Could not reach server") does **not** show the CTA (keeps current behavior).

**Regression invariants.**
- [ ] Wiki-link "missing page" flow still opens a dialog, still prefills `{active-dir}/{slug}.md`.
- [ ] After successful create, the tree updates **immediately** via `emitDocumentsChanged()` (FileTree subscribes in this PR); the 5-second poll remains a fallback.
- [ ] Existing Rename / Delete menu entries and their behavior are unchanged.
- [ ] Existing `POST /api/create-page` validation still runs (no client bypass).

**Accessibility.**
- [ ] All new interactive elements have keyboard equivalents and `aria-label`s.
- [ ] Dialog is focus-trapped (inherits from `radix-ui/Dialog`).
- [ ] The shortcut's handler tolerates missing `Cmd`/`Ctrl` matches silently (no side effects).

## 9. Decision Log

| ID  | Decision                                                                        | Status | Resolution |
| --- | ------------------------------------------------------------------------------- | ------ | ---------- |
| U1  | "Known path" is a firm invariant — no silent Untitled placeholders              | User   | LOCKED     |
| U2  | Directory context = active-file parent (header/shortcut) OR right-clicked row   | User   | LOCKED     |
| U3  | v1 scope = header "+", folder context menu, new folder, shortcut, empty CTA    | User   | LOCKED     |
| U4  | Defer inline rename-style create                                                | User   | LOCKED     |
| D1  | Header "+" = single icon + dropdown (file/folder). Minimal, conventional.       | Agent  | DIRECTED   |
| D2  | New folder = file-based composite (`{dir}/{folder}/{file}.md` via existing API). | Agent  | DIRECTED   |
| D3  | One `NewItemDialog` with `kind` prop; refactor `CreatePageDialog`.              | Agent  | DIRECTED   |
| D4  | Keybinding = `Cmd/Ctrl+Alt+N`. Safest cross-platform.                           | Agent  | DIRECTED   |
| D5  | Default filename = pre-filled `untitled.md` (file kind) / `index.md` (folder kind first-file), text auto-selected on open. U1 forbids silent disk writes; an editable, user-confirmed suggestion is a known path. | Agent | DIRECTED   |
| D6  | On success: close dialog → navigate to new file → focus editor.                 | Agent  | DIRECTED   |
| D7  | Validation UX = inline error + disable-while-busy + client-side pre-check.      | Agent  | DIRECTED   |
| D8  | Context menu reach = folder rows only. Aligns with user's original "any selected directory via context menu." | Agent | DIRECTED   |
| D9  | `.md` auto-append on file-name input if missing. Server rejects non-`.md`; client is polite. | Agent | DIRECTED |

## 10. Risks & mitigations

| ID  | Risk                                                             | Mitigation                                                                                                 |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| R1  | Global keydown steals keystrokes from the editor                 | Filter by `event.target` tag + `isContentEditable`; integration test confirming editor edits still work    |
| R2  | Context menu on file rows adds clutter                           | Separator above existing Rename/Delete; a11y test confirms keyboard reach                                  |
| R3  | `/api/documents` 5s poll = visible lag after create              | Call `emitDocumentsChanged()` immediately on success; the poll is a fallback                               |
| R4  | Wiki-link regression during dialog refactor                      | Keep the existing dialog path intact; add a regression test for `WikiLinkView` caller                      |
| R5  | Reserved name (`__system__`) returned as 400 — stale client error | Render server-returned error verbatim; no special client mapping                                           |
| R6  | Empty folder (composite) when user cancels mid-flow              | Composite sends one round trip; no intermediate state. No-op if cancelled.                                 |

## 11. Testing plan

- **Unit (bun test):**
  - `NewItemDialog` — renders both kinds, client-side validation, path composition for folder kind.
  - Default-target resolver — `defaultInitialDir` edge cases (null, root file, nested).
- **Integration (bridge-matrix pattern):**
  - Header "+" → new file appears in tree index after poll/emit.
  - Folder context-menu "New folder here" composite flow → `{dir}/{folder}/{file}.md` exists on disk.
- **E2E (Playwright):**
  - Empty workspace → CTA click → dialog → create → editor opens the new file.
  - Keyboard shortcut from app chrome opens dialog; from inside editor does nothing.
  - Wiki-link regression — broken link → dialog → create → file opens.
- **Gate:** `bun run check` passes (lint + typecheck + unit + integration + fidelity).

## 12. Rollout

- Single PR off `worktree-examine-new-file-op` → review → merge to `main`.
- No feature flag — UI addition only, no data-model or API change.
- No migration.

## 13. Future work

- **Identified.** Inline rename-style create in the tree row (collab-aware).
- **Identified.** Empty-folder support end-to-end (server endpoint + documents-API surfacing + tree rendering).
- **Noted.** Template picker.
- **Noted.** OS drag-and-drop file import.
- **Noted.** Per-directory quick-create keybinds.

## 14. Open Questions

*(None open — all P0 items resolved.)*

## 15. Agent Constraints

**SCOPE:**
- `packages/app/src/components/FileSidebar.tsx` — add "+" header action.
- `packages/app/src/components/FileTree.tsx` — context-menu entries (folder rows only), empty-state CTA, plumbing for opening the dialog, **subscribe to `documents-events`** for immediate refresh after create.
- `packages/app/src/components/CreatePageDialog.tsx` — rename to `NewItemDialog.tsx`, extend props.
- `packages/app/src/editor/extensions/WikiLinkView.tsx` — migrate caller.
- `packages/app/src/App.tsx` — add `NewItemShortcutHandler` (mounted inside `<DocumentProvider>`).
- `packages/app/src/components/ui/dropdown-menu.tsx` — reuse (already present in `components/ui/`).
- `packages/app/src/lib/documents-events.ts` — read-only reuse (`subscribeToDocumentsChanged`, `emitDocumentsChanged`).
- New test files co-located with source per conventions.

**EXCLUDE:**
- `packages/server/**` — no backend changes. The existing `/api/create-page` is sufficient.
- `packages/core/**` — no schema or pipeline changes.
- File-watcher / reconciliation / CRDT bridge — unaffected.

**STOP_IF:**
- Any implementation path requires a new server endpoint.
- Any change to `/api/documents` or file-index semantics is needed.
- A schema migration surfaces.
- The dialog refactor breaks an existing wiki-link E2E test that cannot be repaired by caller-site changes.

**ASK_FIRST:**
- Icon choice beyond `lucide-react` `Plus` (existing iconography).
- Visual design beyond shadcn defaults (colors, shadows).
- Any keybinding other than `Cmd/Ctrl+Alt+N`.

## 16. Changelog

See `meta/_changelog.md`.
