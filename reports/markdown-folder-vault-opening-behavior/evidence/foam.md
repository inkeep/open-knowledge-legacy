# Evidence: Foam

**Dimension:** Folder opening behavior for the Foam VS Code extension
**Date:** 2026-04-12
**Sources:** foamnotes.com, github.com/foambubble/foam, github.com/foambubble/foam-template

---

## Key sources referenced

- [foamnotes.com — Creating Your First Workspace](https://foamnotes.com/user/getting-started/first-workspace.html)
- [foamnotes.com — Using Foam with VS Code Features](https://foamnotes.com/user/getting-started/get-started-with-vscode.html)
- [foamnotes.com — What is Foam?](https://foamnotes.com/)
- [github.com/foambubble/foam](https://github.com/foambubble/foam)
- [github.com/foambubble/foam-template](https://github.com/foambubble/foam-template)

---

## Findings

### Finding: Foam is activated by opening any folder in VS Code; no tool-specific init
**Confidence:** CONFIRMED
**Evidence:** [Creating Your First Workspace](https://foamnotes.com/user/getting-started/first-workspace.html)

Foam is a VS Code extension, so "opening a folder" is VS Code's built-in `File > Open Folder`. The extension auto-activates. There is no separate "Initialize Foam" command. The recommended starting point is the `foam-template` repo, which ships pre-filled `.vscode/settings.json` and `.vscode/extensions.json`, but these are conveniences — an arbitrary folder of `.md` files also works.

---

### Finding: Foam writes no required sidecar directory in the workspace; it holds graph state in memory
**Confidence:** CONFIRMED
**Evidence:** [github.com/foambubble/foam](https://github.com/foambubble/foam), [foam-template](https://github.com/foambubble/foam-template)

No `.foam/` cache, no database, no index file. Graph analysis (parsing wikilinks for the backlinks panel) runs in memory using VS Code's file watcher. The template repo does include an optional `.foam/templates/` directory for user-authored note templates, but this is opt-in content, not tool-written state. The `.vscode/` directory is VS Code's — not Foam-specific — and is typically committed for team workspace settings.

**Implications:** Foam is the lowest-impact tool in this report. Pointing it at a folder creates nothing and modifies nothing unless the user explicitly adopts template conventions.

---

### Finding: Foam does not mutate existing `.md` files
**Confidence:** CONFIRMED
**Evidence:** [What is Foam?](https://foamnotes.com/), [github.com/foambubble/foam](https://github.com/foambubble/foam)

No frontmatter injection, no heading/link rewriting on open or on edit. The extension observes files and surfaces wikilinks/backlinks in VS Code's UI. File writes happen only when the user explicitly edits.

---

### Finding: Markdown on disk is authoritative; no parallel store
**Confidence:** CONFIRMED
**Evidence:** [Creating Your First Workspace](https://foamnotes.com/user/getting-started/first-workspace.html)

All content lives in `.md` files in the workspace. The graph is re-derived on workspace open. Users can delete Foam, reopen the folder in any editor, and lose nothing.

---

## Gaps / follow-ups

- `.gitignore` conventions for Foam are inferred from VS Code ecosystem norms, not from a Foam-specific doc — but since Foam creates no tool files, the question is moot.
