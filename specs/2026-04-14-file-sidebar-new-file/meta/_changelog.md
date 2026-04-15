# Changelog

## 2026-04-14 — Spec opened

- Baseline commit: `100ae99` (branch `worktree-examine-new-file-op`).
- Intake completed: SCR framed, 5-probe stress test passed.
- User-locked decisions:
  - U1: "Known path" is a firm invariant (no Untitled placeholders).
  - U2: Directory context = (a) active file's parent, (b) right-clicked folder — no new selection state.
  - U3: Scope includes header "+" button, folder context menu, new folder, keyboard shortcut, empty-state CTA.
  - U4: Skip inline rename-style create (collab complexity).
- Scaffolded SPEC.md, `evidence/current-state.md`, `evidence/folder-creation-gap.md`.
- Key gap surfaced: no `/api/create-folder` endpoint; tree derives folders from files. Cascades to D2.

## 2026-04-14 — Decisions locked (autonomous mode)

User delegated full authority for remaining decisions and /ship. Agent locked:
- D1 = dropdown menu in header (single "+").
- D2 = file-based composite folder creation (no backend change).
- D3 = single `NewItemDialog` with `kind` prop; migrate `CreatePageDialog`.
- D4 = `Cmd/Ctrl+Alt+N` keybinding (no browser collision).
- D5 = blank input + placeholder; button disabled until name typed.
- D6 = close → navigate → focus-editor on success.
- D7 = inline errors + client pre-check + disable-while-busy.
- D8 = context menu reach on both file and folder rows.
- D9 = `.md` auto-append on file-name input.

Acceptance criteria and agent constraints derived. Spec ready for audit.

## 2026-04-14 — Audit + design challenge complete (autonomous)

**Audit findings (1 high, 4 medium):**
- HIGH — `FileTree` does not subscribe to `documents-events` (only `PageListContext` does). Spec's "immediate refresh" claim was wrong. Fix: add subscription in `FileTree`'s mount effect; expand SCOPE; correct evidence/current-state.md. Applied.
- MED — D5 vs §6 contradiction on default filename UX. Resolved by D5 reversal (see below).
- MED — keybinding absolutism softened in AC.
- MED — added integration-test note for `mkdirSync(..., { recursive: true })` composite folder behavior.
- MED — clarified `NewItemShortcutHandler` placement inside `<DocumentProvider>`.

**Design challenges accepted:**
- #2 (D5) — REVERSED to pre-filled `untitled.md` (file) / `index.md` (folder first-file), basename selected on focus. U1 forbids silent disk writes, not editable suggestions; matches Finder/VSCode UX.
- #1 (D2) — KEPT composite, but default first-file to `index.md`. Eliminates "must I name a file to make a folder" friction without expanding scope to server.
- #4 (D8) — REVERSED to folder-rows-only context menu (aligns with user's original "any selected directory via context menu").

**Design challenges dismissed with reasoning:**
- #3 (dropdown) — two-item dropdown is fine; refactoring to two buttons is cosmetic.
- #5 (keybinding) — Cmd/Ctrl+Alt+N stays. Cmd+N collides with browser new-window; Cmd+Shift+N collides with incognito. No shortcut is also a valid alternative but locked in scope by user.
- #6 (vocabulary) — codebase already mixes "page" / "file"; deferred to a vocabulary pass.
- #7 (single dialog with kind prop) — engineering preference; the chosen design is clear enough.
- #8 (mobile) — app's collaborative editor is desktop-targeted; no mobile design exists for adjacent surfaces.
- #9 (focus-restore) — `radix-ui/Dialog` handles focus return on close.
- #10 (command palette) — added to Future Work.
- #11 (inline-create rationale) — user-locked; trust user judgment.

Spec ready for finalization gate.
