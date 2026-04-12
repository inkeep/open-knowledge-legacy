# Changelog

## 2026-04-10 — Initial draft

- Created SPEC.md with full problem statement, user stories, requirements, architecture
- Created evidence/yjs-undomanager-api.md — Y.UndoManager capabilities, TipTap/CodeMirror integration points
- Created evidence/prior-scaffold-problems.md — R4-R8 root causes, scaffold code inventory
- Key decisions: D1 (per-editor UndoManagers), D2 (keep AGENT_WRITE_ORIGIN), D3 (Observer A char-level diff), D4 (event-driven undo state), D5 (remove scaffold first)
- Open questions: Q1 (unified vs per-mode history), Q2 (agent undo UX), Q3 (normalization contract), Q4 (diff algorithm), Q5 (observer modal approach)
- Scope: scaffold removal (In Scope), undo implementation (Future Work — Explored), Observer A refactor (Future Work — Explored)
