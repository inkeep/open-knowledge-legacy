# Inline Filename Rename in Editor Header

## Problem Statement

The editor header displays the active document's filename as static text. Users who want to rename a file must right-click it in the sidebar file tree and use the context menu. This is indirect — the filename is right there in the header, and clicking it should let you edit it in place.

## Goal

Make the filename in the editor header clickable. On click, it becomes an inline text input pre-filled with the current name. The user edits the name and presses Enter to commit (calling the existing `/api/rename` endpoint) or Escape to cancel. The same rename infrastructure used by `FileTree.handleRename` is reused — no new API work needed.

## Scope

**In scope:**
- Click-to-edit the filename text in `EditorHeader.tsx`
- Inline input with Enter to commit, Escape/blur to cancel
- Call `POST /api/rename` with `{ docName, newDocName }`
- After successful rename: navigate to the new docName via hash, close old provider, update sidebar
- Validation: reject empty names, names with `/` or `\`, `.`, `..`
- Error display: inline error message below or beside the input on server errors
- Loading state: disable input while rename is in flight

**Out of scope:**
- Folder rename from header (folder targets show a folder icon + path, not an editable name)
- Renaming when no document is active
- New API endpoints — the existing `/api/rename` is sufficient
- Keyboard shortcut to trigger rename mode (potential follow-up)

## Design

### Interaction flow

1. User sees `filename.md` in the header (current behavior — static `<span>`)
2. User clicks the filename text
3. The span is replaced by an `<input>` pre-filled with the filename (without `.md` suffix)
4. The `.md` suffix is shown as static text after the input (same pattern as FileTree's inline rename)
5. Input is auto-focused with text selected
6. **Commit:** Enter key OR blur → validate → call `/api/rename` → on success, navigate to new name
7. **Cancel:** Escape key → revert to static display, no API call
8. **Error:** Server returns error → show inline error text, keep input active
9. **No-op:** If the name hasn't changed, treat as cancel (no API call)

### Technical approach

- Add `isRenaming` state to `EditorHeader`
- Reuse `normalizeRenameValue`, `isValidNodeName`, `buildRenamedNodePath`, `remapActiveDocName` from `file-tree-operations.ts`
- Reuse the `emitDocumentsChanged` pattern from FileTree to refresh the sidebar after rename
- Use `closeDocument` from `DocumentContext` to close the old provider, then navigate via `window.location.hash`
- The input follows the same pattern as FileTree's `editingContent`: `<Input>` with `.md` suffix, Enter/Escape key handlers, blur-to-cancel

### Constraints

- Folder targets (`activeTarget?.kind === 'folder'`) are NOT editable — the folder path display remains static
- The "New file" badge and "Folder overview" badge behavior are unchanged
- The pin button position/behavior is unchanged
- When no doc is active (`!activeDocName`), nothing is clickable

## Acceptance Criteria

1. **AC-1: Click activates rename mode.** Clicking the filename text in the header replaces the static text with an input field pre-filled with the current filename (without `.md`). The `.md` suffix appears as static text after the input.

2. **AC-2: Auto-focus and select.** When rename mode activates, the input is focused and the text is selected.

3. **AC-3: Enter commits rename.** Pressing Enter in the input validates the name, calls `POST /api/rename`, and on success navigates to the renamed document.

4. **AC-4: Escape cancels.** Pressing Escape returns to the static filename display without making any API call.

5. **AC-5: Blur commits.** Clicking outside the input (blur) commits the rename (same as pressing Enter). This matches the Finder/Jira/Notion/Cursor pattern where blur = "I'm done editing."

6. **AC-6: No-op on unchanged name.** If the user presses Enter without changing the name, treat as cancel — no API call.

7. **AC-7: Validation.** Names that are empty, `.`, `..`, or contain `/` or `\` are rejected with an inline error message. The API is not called.

8. **AC-8: Server error display.** If the API returns an error, the error message is shown inline and the input remains active so the user can correct and retry.

9. **AC-9: Loading state.** While the rename API call is in flight, the input is disabled.

10. **AC-10: Post-rename navigation.** After successful rename, the old document provider is closed, the sidebar refreshes, and the browser navigates to the new document name.

11. **AC-11: Folder targets not editable.** When viewing a folder overview, the folder path display is not clickable/editable.

12. **AC-12: No doc not editable.** When no document is active, no clickable filename is shown (existing behavior preserved).

## Test Cases

1. Click filename → input appears with current name, focused, text selected
2. Type new name → Enter → API called with correct old/new names → navigated to new doc
3. Type new name → Escape → reverts to original name, no API call
4. Type new name → click elsewhere (blur) → commits rename (same as Enter)
5. Don't change name → Enter → no API call, exits rename mode
6. Enter invalid name (empty, `.`, `..`, contains `/`) → inline error, no API call
7. API returns error → error shown, input stays active
8. During API call → input is disabled
9. Folder target → filename area is not clickable
10. No active doc → no filename shown (existing behavior)
