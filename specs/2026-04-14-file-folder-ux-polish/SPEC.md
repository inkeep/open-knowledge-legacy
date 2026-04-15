# SPEC: File / Folder Creation UX Polish

**Status:** Drafting — iterating with user
**Baseline commit:** `f17ad00`
**Date opened:** 2026-04-14

---

## 1. Problem statement (SCR)

**Situation.** The sidebar's file/folder creation landed in PR #127. It works but has three UX rough edges that reduce discoverability and flow.

**Complication.**
1. The header "+" buttons place new items in the *currently-active file's folder* — not in the root. This confuses users who expect the header action to be global (root-targeting), not contextual.
2. File and folder creation open a modal dialog, which is a context shift for what should be a lightweight, in-place action. The rename UX is already inline; creation is not, creating inconsistency.
3. Server-side errors ("Destination already exists") are surfaced as inline text in the dialog — but the dialog closes on success, so errors either get lost or the dialog lingers awkwardly.

**Resolution.** Three targeted changes:
1. Header buttons always target the root.
2. File and folder creation go inline — VS Code / rename-style input appears in the tree, in context.
3. Server-side errors (collision, etc.) go to toast. Inline input shows a red border.

---

## 2. Goals

- **G1.** Header "New file" / "New folder" always create at the root (not the active folder). *(trivial fix)*
- **G2.** Inline file creation: input appears in the tree where the file will land; dismiss with Escape or blur; commit with Enter. *(VS Code-style)*
- **G3.** Inline folder creation: same UX but with folder semantics — single input (folder name); initial `index.md` created automatically. *(VS Code-style)*
- **G4.** Server-side errors (collision, server error) go to toast with red border on the inline input. Inline client validation (empty name) stays inline.

---

## 3. Non-goals

- **NOT NOW.** Renaming the auto-created `index.md` inside a new folder at creation time. User can rename after.
- **NOT NOW.** "New file inside folder" showing the dialog for folders (two-step folder creation) in the inline flow. Single-step: type folder name → `{name}/index.md` created.
- **NOT NOW.** Empty folder support (folder with no initial file).
- **SCOPE PRESERVED.** Context-menu "New file here" / "New folder here" on folder rows retains current behavior: creates inside that folder.
- **SCOPE PRESERVED.** Broken wiki-link `NewItemDialog` flow unchanged.
- **SCOPE PRESERVED.** Keyboard shortcut `Cmd/Ctrl+Alt+N` behavior unchanged (continues to open the dialog for now, or can go inline — TBD in decision batch).

---

## 4. In scope (phased)

### Phase 1 — Header buttons → root (commit separately)
**Status:** Decision made, ready to implement.

**Change:** `FileSidebar.tsx:48` and `:58` — change `openNewItemDialog('file')` / `openNewItemDialog('folder')` to pass `''` explicitly as `initialDir`, bypassing `defaultInitialDir(activeDocName)`.

One-line change in `FileSidebar.tsx`.

### Phase 2 — Inline creation UX (items 2 & 3 + error toast)
**Status:** Design in progress — see Open Questions.

---

## 5. Architecture — Phase 1

No new components. One call-site change:

```tsx
// FileSidebar.tsx — BEFORE
<Button onClick={() => openNewItemDialog('file')}>
<Button onClick={() => openNewItemDialog('folder')}>

// AFTER — explicit root
<Button onClick={() => openNewItemDialog('file', '')}>
<Button onClick={() => openNewItemDialog('folder', '')}>
```

`defaultInitialDir` fallback is removed for these two call sites. Context menu on folders still passes `node.path` — unchanged.

---

## 6. Architecture — Phase 2 (draft, pending decisions)

### 6a. Inline creation state

Add to `FileTree` (or lift to `FileSidebar`):
```ts
type CreatingItem = { kind: 'file' | 'folder'; parentDir: string } | null;
const [creatingItem, setCreatingItem] = useState<CreatingItem>(null);
const [creatingValue, setCreatingValue] = useState('');
const [creatingError, setCreatingError] = useState<string | null>(null);
const [creatingBusy, setCreatingBusy] = useState(false);
```

### 6b. Inline row placement

- **Root:** render as the first row in `<SidebarMenu>` before the tree nodes
- **Inside folder:** render as the first child in the folder's `<SidebarMenuSub>` when the folder is expanded (auto-expand the folder if collapsed)

### 6c. Inline row UI

Mirrors the existing rename `editingContent` in `FileTreeNode`:
```tsx
<div className="flex h-8 items-center gap-2 rounded-md px-2 ml-2">
  <FolderIcon or FileIcon className="size-4 shrink-0" />
  <Input
    value={creatingValue}
    autoFocus
    className={cn("h-7 min-w-0 flex-1 bg-background text-sm", creatingError && "border-destructive")}
    onBlur={handleCancelCreating}
    onKeyDown={...}
    // Enter → commit, Escape → cancel
  />
  {kind === 'file' && <span className="text-xs text-sidebar-foreground/40">.md</span>}
</div>
```

### 6d. Folder creation semantics

Single slash-aware input. Path composition:
```ts
function composeFolderPath(parentDir: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes('/')) {
    // "myfolder/notes" → "{parentDir}/myfolder/notes.md"
    const file = ensureMdExtension(trimmed);
    return parentDir ? `${parentDir}/${file}` : file;
  }
  // "myfolder" → "{parentDir}/myfolder/index.md"
  return parentDir ? `${parentDir}/${trimmed}/index.md` : `${trimmed}/index.md`;
}
```
On commit: POST `/api/create-page` with the composed path. Success → navigate + expand. Error → `toast.error(msg)` + red border (keep input open).

### 6e. Error routing

| Error type | Treatment |
|---|---|
| Client validation (empty name) | Inline below input (no toast), same as today |
| Server error (collision, invalid) | `toast.error(message)` + red border on input, keep input open |
| Network error | `toast.error('Network error — please try again')` + red border |

### 6f. State ownership

**Option A — state in `FileTree`:** keeps creation alongside rename/delete state. More natural colocation; FileTree already owns `editingPath`/`editingValue`/`busyPath`.

**Option B — state in `FileSidebar`:** keeps FileTree as a pure renderer. Simpler FileTree prop interface.

Recommendation: **Option A** — creation is structurally identical to rename; owned alongside it in FileTree. FileSidebar passes a `onStartCreating` callback the header buttons can call (same as the existing `onNewItem` prop but with a rename-style outcome instead of opening a dialog).

---

## 7. Open Questions

| # | Question | Priority | Status |
|---|---|---|---|
| OQ1 | Where exactly should the inline row appear when triggered from the header? Top of root list? Or between folders and files? | P0 | **DECIDED** — top of root list |
| OQ2 | What happens if the target folder is collapsed when "New file in folder" is triggered from context menu? | P0 | **DECIDED** — auto-expand |
| OQ3 | Should `Cmd/Ctrl+Alt+N` open inline (root) or continue to open the dialog? | P2 | Deferred — keep dialog for now |
| OQ4 | Should blur-to-cancel on the inline input be immediate, or should it debounce to avoid cancel-on-focus-to-toast? | P0 | Needs decision — see §10 |
| OQ5 | Should the dialog (`NewItemDialog`) be kept for the keyboard shortcut and broken wiki-link flows, or fully removed? | P2 | Keep dialog for non-inline callers |

---

## 8. Decision Log

| # | Decision | Resolution | Rationale |
|---|---|---|---|
| D1 | Header buttons target root (not active folder's dir) | LOCKED | Consistent with other editors; header = global action |
| D2 | Inline UX preferred over dialog for tree-triggered creation | LOCKED | Matches rename UX, eliminates context shift, industry standard |
| D3 | Folder creation: slash-aware single input — `myfolder` → `{name}/index.md`; `myfolder/notes` → `{name}/notes.md` | LOCKED | More powerful, matches VS Code; `/api/create-page` already accepts slash paths |
| D4 | Server errors → toast + red border. Client validation → inline | LOCKED | Sonner already installed; keeps input open for correction on collision |
| D5 | Creation state lives in `FileTree` (collocated with rename/delete state) | DIRECTED | Precedent set by rename/delete ownership in FileTree |
| D6 | Blur cancel behavior: cancel immediately on blur (matches current rename UX) | LOCKED | Consistency with rename; keep UX surface uniform |

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Blur-to-cancel races with toast click (clicking an error toast dismisses the input before user sees it) | Use a short `setTimeout` delay before cancel on blur; cancel is a no-op if already committed |
| Inline row position confuses user when creating inside a nested folder | Test: auto-expand + scroll-into-view on the new row |
| `NewItemDialog` diverges from inline UX over time | Keep dialog for OQ5 callers only; don't add new call sites to it |

---

## 10. Pending decision

**OQ4 — Blur cancel timing:**

When the user blurs the inline creation input (clicks elsewhere), should the input cancel immediately?

**Problem:** If the server returns an error and `toast.error(...)` fires, the toast gains focus-like interactivity. The user might try to click the toast to dismiss it, which would blur the input and cancel the inline creation — preventing them from correcting the name.

**Options:**
- A) Cancel immediately on blur (simple; existing rename behavior)
- B) Short `setTimeout(cancel, 150ms)` on blur — if the user re-focuses the input (via tab or focus return) within that window, cancel is aborted
- C) Don't cancel on blur at all — only Escape cancels (like VS Code: blur does NOT cancel new file inline input)

VS Code behavior: blur does NOT auto-cancel. User must explicitly press Escape or Enter.

---

## 11. Future Work

- **Identified:** Keyboard shortcut `Cmd/Ctrl+Alt+N` → inline creation at root (currently opens dialog)
- **Noted:** Template picker / pre-filled content at creation
- **Noted:** Empty folder support (folder with no initial file)
- **Noted:** Drag-to-reorder creation placement hint

---

## 12. Acceptance criteria

### Phase 1
- [ ] AC1.1: Clicking "New file" in sidebar header opens dialog with `initialDir=''` (root), regardless of active file
- [ ] AC1.2: Clicking "New folder" in sidebar header opens dialog with `initialDir=''` (root)
- [ ] AC1.3: Context menu "New file here" on a folder still creates inside that folder (unchanged)

### Phase 2
- [ ] AC2.1: Clicking "New file" in sidebar header places inline input at top of the root-level file list
- [ ] AC2.2: Clicking "New folder" in sidebar header places inline input (folder creation) at top of root list
- [ ] AC2.3: Pressing Enter in inline input creates the file/folder and navigates to it
- [ ] AC2.4: Pressing Escape cancels creation and removes the inline row
- [ ] AC2.5: Server errors (collision, etc.) show as `toast.error(...)` and apply a red border to the input (row stays open)
- [ ] AC2.6: Empty name validation shows inline (no toast), same as today
- [ ] AC2.7: Folder creation is slash-aware: `myfolder` → `{parentDir}/myfolder/index.md`; `myfolder/notes` → `{parentDir}/myfolder/notes.md`
- [ ] AC2.8: Context menu "New file here" on a folder auto-expands that folder and places the inline row inside it

---

## 13. Agent constraints (implementation)

### Phase 1
**SCOPE:** `packages/app/src/components/FileSidebar.tsx` only.
**STOP_IF:** Any change beyond the two `openNewItemDialog` call sites.

### Phase 2
**SCOPE:** `packages/app/src/components/FileTree.tsx`, `FileSidebar.tsx`, `NewItemDialog.tsx` (audit callers). No server changes.
**EXCLUDE:** `packages/server/`, API endpoints, `packages/core/`.
**STOP_IF:** Need to modify the `/api/create-page` request shape.
**ASK_FIRST:** Any changes to the `NewItemDialog` props interface that affect wiki-link callers (`WikiLinkView.tsx`).
