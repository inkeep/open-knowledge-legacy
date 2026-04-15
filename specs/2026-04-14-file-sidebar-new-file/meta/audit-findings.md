# Audit Findings

Scope: Read SPEC.md cold against the code at `worktree-examine-new-file-op` (baseline `100ae99`).

## Verified (no issue)

- `POST /api/create-page` handler — `packages/server/src/api-extension.ts:1352` (`handleCreatePage`) — OK.
- Validations match spec:
  - Must end with `.md` — line 1381.
  - Rejects `..` — line 1386.
  - Rejects leading `/` — line 1387.
  - Rejects backslash / null byte — lines 1388-1389.
  - Content-dir containment — lines 1394-1399 (via `resolve()` + prefix check).
  - Reserved-name guard via `isSystemDoc(candidateDocName)` — line 1401 (imported line 40).
  - 409 on EEXIST — lines 1407-1411 (uses `flag: 'wx'`).
  - `mkdirSync(dirname, { recursive: true })` — line 1405 (supports composite folder create).
  - Returns `{ ok: true, docName }` — line 1416.
- Route registration `/api/create-page → handleCreatePage` — `api-extension.ts:1773`.
- `GET /api/documents` enumerates files only (iterates watcher's in-memory file index, which tracks files; no empty-folder entries) — `api-extension.ts:700-758`.
- `FileTree` polls every 5 seconds — `FileTree.tsx:295` (`setInterval(fetchDocs, 5000)`).
- `emitDocumentsChanged()` exists — `packages/app/src/lib/documents-events.ts:3`.
- `CreatePageDialog` is today called only from `WikiLinkView` — `packages/app/src/editor/extensions/WikiLinkView.tsx:12` is the only importer (verified via grep: no other callers).
- `ui/dropdown-menu.tsx` exists — `packages/app/src/components/ui/dropdown-menu.tsx`.
- `ui/context-menu.tsx` exists and is already used by `FileTree` — `FileTree.tsx:21-26`.
- `SidebarMenuAction` primitive exists — `packages/app/src/components/ui/sidebar.tsx:518`.
- All referenced spec files exist: `FileSidebar.tsx`, `FileTree.tsx`, `CreatePageDialog.tsx`, `WikiLinkView.tsx`, `App.tsx`.
- Wiki-link dialog prefill matches spec claim (`{active-dir}/{slug}.md`) — `CreatePageDialog.tsx:7-15` (`getSuggestedPath`) + `.md` suffix via `${toWikiLinkSlug(target)}.md`.

## High severity — factual errors / missing evidence

- **Claim: `emitDocumentsChanged()` force-refreshes the file tree.**
  Appears in SPEC.md §6 success path step 3, §8 regression invariant ("tree updates within 5 seconds **or** immediately via `emitDocumentsChanged()`"), and §10 R3 mitigation.
  **Actually:** `FileTree` does NOT subscribe to the `open-knowledge:documents-changed` event. `FileTree.tsx:271-300` only reacts to the 5s poll and local optimistic `setDocuments` after rename/delete. The only subscriber to `subscribeToDocumentsChanged` is `PageListContext.tsx:57` (which powers a separate pages list, not the sidebar tree).
  Evidence: `packages/app/src/lib/documents-events.ts`, `FileTree.tsx:39` (imports `emitDocumentsChanged` but never calls `subscribeToDocumentsChanged`).
  **Recommended fix:** Either (a) add `subscribeToDocumentsChanged(fetchDocs)` inside `FileTree`'s effect (one-line addition, fits inside SCOPE since it's a `FileTree.tsx` change), or (b) adjust spec wording so the "immediate refresh" mechanism is clearly scoped to include adding the subscription. Also correct the evidence claim in `evidence/current-state.md` line 18 which states FileTree "also listens for `emitDocumentsChanged()` refresh events" — it does not.

## Medium severity — coherence / completeness

- **`isSystemDoc` rejection happens only on `'__system__'` as docName, not arbitrary reserved paths.**
  Spec §10 R5 labels reserved-name errors as 400 — correct (line 1402). Minor: `isSystemDoc()` only matches `__system__` (single-doc guard), so "reserved names" is a set of size 1. Not a bug, but the plural phrasing in the spec ("reserved names") overstates the surface area. Nit-level.

- **Goal G4 + AC "Submit creates `{initialDir}/{folderName}/{fileName}.md` via the existing endpoint (one round trip)" — feasibility OK but depends on undocumented behavior.**
  The `mkdirSync(dirname(fullPath), { recursive: true })` (api-extension.ts:1405) is what makes composite folder-create a single round trip. This is correctly identified in the spec's D2 ("via existing API") and in §6 ("`mkdirSync(dirname, {recursive: true})` creates the folder as a side effect"). Consider adding a server-side integration test to pin this behavior so a future refactor doesn't silently break composite create. The existing `api-create-page.test.ts` should be checked/extended. (Recommendation only.)

- **Keybinding claim: "Cmd+Alt+N has no reserved mapping in Chrome/Safari/Firefox."**
  - Chrome: no default binding for Cmd+Alt+N (macOS) or Ctrl+Alt+N (Win/Linux). New window is Cmd/Ctrl+N; Incognito is Shift+Cmd/Ctrl+N. OK.
  - Safari: Cmd+Alt+N not bound. OK.
  - Firefox: macOS Cmd+Alt+N was historically bound to "New Private Window" in some versions and to "Close Other Tabs" in others; current default in Firefox 120+ for New Private Window is Shift+Cmd+P. No reliable reserved use of plain Cmd+Alt+N, but it has been used in the past — the absolute claim "has no reserved mapping" is stronger than the web evidence supports.
  - Linux/Windows Ctrl+Alt+N: not a browser reservation, but note that on some Linux desktops (GNOME/KDE) `Ctrl+Alt+*` is reserved for compositor/window-manager actions. The GNOME default set does not include Ctrl+Alt+N, but some distros/extensions do bind it.
  - macOS system: Cmd+Option+N is not a reserved system shortcut, but Finder uses it for "New Smart Folder." Browsers running inside a window should still receive it because Finder's shortcut is scoped to the Finder app, but this is context worth noting.
  **Recommended fix:** Soften AC G5 wording to "does not collide with the default keymap of Chrome/Safari/Firefox as of 2026-04," or explicitly acknowledge that "Ctrl+Alt+*" on Linux can be compositor-owned and the handler should fail gracefully if the browser never sees the event (consistent with R1 behavior).

- **`useDocumentContext().activeDocName` accessed from a keydown handler mounted in `App.tsx`.**
  `App.tsx` is wrapped in `<DocumentProvider>` (line 32), so the new `NewItemShortcutHandler` must be a child of `<DocumentProvider>` to call `useDocumentContext()`. The spec diagram (§6) shows `NewItemShortcutHandler` as a child of `App`, which is fine, but implementers should be aware it must be inside the provider. Low risk; worth a sentence in the spec or left to implementation.

- **D5 (decision) vs. §6 (`kind === 'file'`) contradiction.**
  D5 says: "Default filename = blank input + `name.md` placeholder." §6 says: "One input: `path` — prefilled with `${initialDir ? initialDir + '/' : ''}${suggestedName ?? ''}`." When `suggestedName` is undefined (header "+", shortcut, empty-state CTA), the input is prefilled with just `${initialDir}/` (or empty) — not blank-with-placeholder. These are subtly different UX contracts (prefilled-with-dir-prefix vs. blank-with-placeholder). G4 AC also says "Create button is disabled until both inputs are non-empty" for folder; no equivalent "disabled when filename missing" AC for file kind, though D5 says "submit disabled when empty."
  **Recommended fix:** Reconcile — either D5 should say "prefilled with `initialDir + '/'` + optional suggested name; submit disabled if the filename portion is empty" or §6 should match the blank-input model.

- **Goal G2 + default resolver edge case: a file at project root.**
  The resolver uses `slash > 0` (`SPEC.md:130`). If `activeDocName` happens to start with `/` (shouldn't, docNames are relative) or has its only slash at index 0, `slash > 0` is false and returns `''`. For a root-level docName like `readme` (no slash) it returns `''` — correct. For `a/b`, `lastIndexOf('/') === 1`, returns `'a'` — correct. No actual bug. Nit: the `>` vs. `>=` choice should be called out (protects against pathological leading-slash docNames).

## Low severity — nits

- SPEC.md §15 SCOPE omits `packages/app/src/lib/documents-events.ts` even though the success path calls `emitDocumentsChanged()` from new call sites. Not strictly needed if it's only imported, but worth acknowledging the reuse.
- Decisions D3 ("rename `CreatePageDialog` to `NewItemDialog`") and Acceptance "regression invariant: Wiki-link flow still opens a dialog" imply the rename is load-bearing across `WikiLinkView.tsx`. The spec surface matrix row 6 handles this, but a "breadcrumb" test note would help reviewers.
- The `.md` auto-append (D9) is described in §6 for the file input only. For the folder-kind `fileName` input, §6 also mentions "`.md` auto-append on `fileName`" — good. Add an AC for the auto-append behavior so it's testable.
- `evidence/current-state.md:18` is inaccurate (see High severity above).

## Unverified (couldn't determine)

- Whether the existing `api-create-page.test.ts` covers composite/nested-path creation (mkdir recursive). Did not open the test file; spec's §11 testing plan calls for a new integration test, which is fine either way.
- Firefox/Chromium shortcut matrices on all active platform releases — browser defaults drift; recommend keeping the handler defensive (consume the event only if all modifiers match exactly, allow user to override via future settings).
