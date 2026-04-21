# Evidence D4: Cursor Multi-Project Lifecycle

**Dimension:** D4 (P0) — Cursor: multi-window behavior (VS Code fork)
**Date:** 2026-04-17
**Sources:** Cursor Community Forum (Cursor's main-process is not open source; forum captures observed behavior)

**Caveat:** Cursor is a VS Code fork (closed source, but distributed as Electron with visible bundled sources in `app.asar`). Behavior inherits from VS Code unless overridden.

---

## Key URLs

- [Opening multiple projects at the same time — Cursor Forum](https://forum.cursor.com/t/opening-multiple-projects-at-the-same-time/3136)
- [How to open a Cursor project in 2 different windows at the same time — Cursor Forum](https://forum.cursor.com/t/how-to-open-a-cursor-project-in-2-different-windows-at-the-same-time/73758)
- [Cursor multiple simultaneous instances (window) — Cursor Forum](https://forum.cursor.com/t/cursor-multiple-simultaneous-instances-window/67041)
- [Two Cursor IDEs for one project — Cursor Forum](https://forum.cursor.com/t/two-cursor-ides-for-one-project/64372)
- [Best Practices for Multi-Project Workspaces — Cursor Forum](https://forum.cursor.com/t/best-practices-for-multi-project-workspaces/133387)

---

## Findings

### Finding D4a: Cursor inherits VS Code's silent-focus-existing behavior for duplicate project opens

**Confidence:** CONFIRMED (consistent forum reports)
**Evidence:** [How to open a cursor project in 2 different windows](https://forum.cursor.com/t/how-to-open-a-cursor-project-in-2-different-windows-at-the-same-time/73758)

Community-observed: opening the same project in two windows currently "just loads the same window" — users are seeking workarounds, not discovering a feature. This is identical to VS Code behavior documented in D1.

**Implications:**
- Cursor has not diverged from the VS Code collision-handling model despite being forked.
- Users of agent-coding tools (the primary Cursor audience) actively ask for multi-window-same-project — suggesting our Open Knowledge use case (one collaborative editor window per project) has user-demand validation, but the incumbents haven't implemented it.

---

### Finding D4b: Cursor supports multiple projects via separate windows (opened via `cursor <path>` CLI), and via multi-root workspaces

**Confidence:** CONFIRMED
**Evidence:** Multiple forum threads

Users can open several projects in separate windows via CLI (`cursor <path/to/project>`), and Cursor supports VS Code-style multi-root workspaces via `.code-workspace` files. This is classic VS Code behavior.

**Implications:**
- The "one window = one project" model is the implicit default for Cursor/VS Code, and users accept it. Multi-root workspace is the escape hatch for multi-project.
- Our "one window = one project with isolated utility process" is consistent with the observable mental model but goes further on process isolation.

---

### Finding D4c: Cursor's AI-specific extensions are bundled — no visible fork-level changes to the extension host lifecycle

**Confidence:** INFERRED (no specific evidence of divergence from VS Code's ExtensionHostCrashTracker or utilityProcess usage)
**Evidence:** Negative finding — no Cursor-specific lifecycle documentation appears in forum or blog posts.

**Implications:**
- The VS Code extensionHost lifecycle (3-in-5min auto-restart + prompt) carries through to Cursor.
- Cursor's AI inference service likely runs as an additional utility process (or remote API call), but inspecting the bundled ASAR would be needed to confirm — outside this report's scope.

---

## Gaps / follow-ups

- Did not inspect Cursor's bundled `app.asar` to verify whether they've added per-project process isolation for the AI agent subsystem.
- Did not verify whether Cursor's "Agent mode" changes the lifecycle relative to vanilla VS Code.
