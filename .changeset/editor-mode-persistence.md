---
"@inkeep/open-knowledge-app": patch
---

feat(app): persist the editor-mode choice (`wysiwyg` / `source`) as a user-global preference that survives page refreshes, new tabs, and new Electron windows on the same origin. Applied on first paint via a synchronous inline FOUC script in `packages/app/index.html` so users whose persisted mode is `source` no longer see a flash of WYSIWYG before the switch. Cross-window preference changes propagate via focus-based re-check (Excalidraw Pattern C) on `window.focus` — not a live `storage` event listener — so a flip in one window cannot interrupt mid-edit IME composition or in-flight drag-selection in another. Diff mode remains ephemeral: exiting diff still restores the session pre-diff mode via `modeBeforeDiffRef`, even when another window flipped the persisted preference while the current window was viewing a diff.

- New `src/editor/use-editor-mode.ts` hook owns the `localStorage` key `ok-editor-mode-v1` (matching the repo's `ok-theme-v1` / `ok-pin-v1` precedent). `localStorage.setItem` failures are swallowed with a `[editor-mode]` bracket-prefix `console.warn` — the session continues in-memory.
- `EditorPane.tsx` seeds its session-local `editorMode` state from the persisted value and re-applies cross-window changes via a `useEffect` guarded on `editorModeRef.current !== 'diff'`.
- Only user-initiated header-toggle clicks persist. Tool-driven flips (`RAW_MDX_NAV_EVENT` forcing source mode to fix a broken MDX block) stay session-scoped.
- No new npm dependencies. Implementation is ~50 lines of TypeScript (hook + inline FOUC script).
- E2E coverage in `packages/app/tests/stress/editor-mode-persistence.e2e.ts` (T1-T9, wired into CI `test:e2e`).

Full spec + decision log (D1–D8): [`specs/2026-04-21-editor-mode-persistence/SPEC.md`](specs/2026-04-21-editor-mode-persistence/SPEC.md).
