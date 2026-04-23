---
"@inkeep/open-knowledge-app": patch
---

feat(app): persist the editor-mode choice (`wysiwyg` / `source`) as a user-global preference. Each tab/window is its own session for its lifetime: the persisted value is read at load (refresh, new tab, new Electron window) and the header toggle writes to localStorage immediately, so the next tab or refresh picks up the last toggle. Open tabs do not update each other live — the simpler per-tab-session model avoids the surprise of a tab flipping mode on focus. Applied on first paint via a synchronous inline FOUC script in `packages/app/index.html` so users whose persisted mode is `source` no longer see a flash of WYSIWYG before the switch. Diff mode remains ephemeral: exiting diff still restores the session pre-diff mode via `modeBeforeDiffRef`.

- New `src/editor/use-editor-mode.ts` hook owns the `localStorage` key `ok-editor-mode-v1` (matching the repo's `ok-theme-v1` / `ok-pin-v1` precedent). The hook reads localStorage once via its `useState` initializer; `setItem` failures are swallowed with a `[editor-mode]` bracket-prefix `console.warn` and the session continues in-memory.
- `EditorPane.tsx` seeds session-local `editorMode` from the read-once persisted value on mount.
- Only user-initiated header-toggle clicks persist. Tool-driven flips (`RAW_MDX_NAV_EVENT` forcing source mode to fix a broken MDX block) stay session-scoped.
- No new npm dependencies. Implementation is ~40 lines of TypeScript (hook + inline FOUC script).
- E2E coverage in `packages/app/tests/stress/editor-mode-persistence.e2e.ts` (seven tests: T1, T2, T3, T4, T6, T8, T9; wired into CI `test:e2e`).

Full spec + decision log (D1–D9, where D9 "cross-window sync rejected entirely" supersedes D7's focus-based sync per post-ship user UX feedback): [`specs/2026-04-21-editor-mode-persistence/SPEC.md`](specs/2026-04-21-editor-mode-persistence/SPEC.md).
