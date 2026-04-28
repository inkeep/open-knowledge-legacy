---
"@inkeep/open-knowledge-app": minor
"@inkeep/open-knowledge-desktop": minor
---

feat(desktop): file-tree right-click → "Reveal in Finder" / "Reveal in File Explorer" / "Open Containing Folder".

A new entry on the file-tree row context menu (Electron host only) reveals the right-clicked file or folder in the OS file manager. Label adapts per platform — "Reveal in Finder" on macOS, "Reveal in File Explorer" on Windows, "Open Containing Folder" on Linux (matching VS Code's copy; the Linux verb asymmetry is intentional because no single Linux file manager has a stable brand to "Reveal in"). Hidden on the web variant where it would have no useful no-op.

Wired through a new `ok:shell:show-item-in-folder` IPC channel that wraps Electron's `shell.showItemInFolder`. Path validation reuses the same `validateSpawnPath` + `isPathWithinProject` lexical guard the Cursor handoff already enforces — out-of-project, non-absolute, or null-byte-bearing paths are silently refused at the wire, with a main-process `console.warn` capturing the refusal reason (`invalid-format` / `no-project-bound` / `out-of-project`) for debugging. Disabled-with-hint when the renderer hasn't yet resolved the workspace metadata, mirroring the `Open in Agent` submenu's pattern.
