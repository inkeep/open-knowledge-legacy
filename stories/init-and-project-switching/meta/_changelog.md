# Changelog — init-and-project-switching

## 2026-04-12

- **Created** story seed from user request. Input is rich — grounded in `reports/onboarding-multiproject-ux/REPORT.md` (all 6 dimensions).
- Verified codebase state: CLI `init` command exists (`packages/cli/src/commands/init.ts`), scaffolds `.open-knowledge/` + `AGENTS.md` + content subdirs. No UI equivalent. Web editor shows "No files yet." with no onboarding guidance.
- Verified: zero multi-project code exists. No registry, no `list`/`open` commands, no project history. System is single-project-per-invocation.
- Discovered Electron desktop app spec (`specs/2026-04-11-electron-desktop-app/SPEC.md`) covers native-app onboarding with Project Navigator and multi-window switching. Differentiated this story as the **CLI + web editor (localhost) path**.
- **Critical correction:** Server-side content detection ALREADY EXISTS via `file-watcher.ts:seedLastKnownHashes()` + `ContentFilter` + `picomatch`. The file watcher recursively scans, applies gitignore + glob patterns, and populates `fileIndex` at startup. `/api/documents` and `/api/pages` expose this. The story's init section is about the **web editor UX** that surfaces this existing detection — not about building detection from scratch.
- Content config uses glob-based `include`/`exclude` patterns per `specs/2026-04-11-content-config-unification/SPEC.md`.
- Completed all 7 completeness criteria for both parts. Merged into single story folder per user preference.
- Items: 8 Decided, 5 Open (TQ1, TQ4, PQ7, TQ7, TQ8), 2 Parked (XQ1, XQ2, XQ4), 5 Assumed (PQ6, TQ3, TQ5, TQ6, TQ9).

## 2026-04-12 (rationalization)

- **Split:** Part A (onboarding) is now owned by `projects/day-0-editor-completeness/PROJECT.md` as story **ED-4**. Part B (project switching) remains here as standalone sibling bet. Content preserved intact for traceability.
- Rationale: Part A is "within-project day-0 completeness" (the editor's first-run experience). Part B is "cross-project navigation" (a different concern). The new project decomposes day-0 editor completeness; Part B is explicitly scoped out of it.
