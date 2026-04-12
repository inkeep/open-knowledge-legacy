# Evidence: Dendron

**Dimension:** Folder opening behavior for the Dendron VS Code extension
**Date:** 2026-04-12
**Sources:** wiki.dendron.so, github.com/dendronhq/dendron

---

## Key sources referenced

- [wiki.dendron.so — Workspace](https://wiki.dendron.so/notes/c4cf5519-f7c2-4a23-b93b-1c9a02880f6b/)
- [wiki.dendron.so — Getting Started](https://wiki.dendron.so/notes/678c77d9-ef2c-4537-97b5-64556d6337f1/)
- [wiki.dendron.so — Configuration](https://wiki.dendron.so/notes/f83c1d87-eac0-48f3-a5cf-8a69989d8ec1/)
- [wiki.dendron.so — Vaults](https://wiki.dendron.so/notes/6682fca0-65ed-402c-8634-94cd51463cc4/)
- [wiki.dendron.so — Frontmatter](https://wiki.dendron.so/notes/ffec2853-c0e0-4165-a368-339db12c8e4b/)
- [wiki.dendron.so — FAQ](https://wiki.dendron.so/notes/683740e3-70ce-4a47-a1f4-1f140e80b558/)

---

## Findings

### Finding: Dendron requires explicit initialization; it does not auto-activate on any folder
**Confidence:** CONFIRMED
**Evidence:** [Workspace docs](https://wiki.dendron.so/notes/c4cf5519-f7c2-4a23-b93b-1c9a02880f6b/), [FAQ](https://wiki.dendron.so/notes/683740e3-70ce-4a47-a1f4-1f140e80b558/)

Opening a folder in VS Code is not sufficient. The user runs `Dendron: Initialize Workspace` (Command Palette) to scaffold a Dendron workspace, or `Dendron: Change Workspace` to point at an existing folder. This is a more active "setup" step than Foam's zero-init model.

---

### Finding: Initialization writes `dendron.yml`, `dendron.code-workspace`, and a `root.md` seed
**Confidence:** CONFIRMED
**Evidence:** [Workspace docs](https://wiki.dendron.so/notes/c4cf5519-f7c2-4a23-b93b-1c9a02880f6b/), [Configuration](https://wiki.dendron.so/notes/f83c1d87-eac0-48f3-a5cf-8a69989d8ec1/), [Vaults](https://wiki.dendron.so/notes/6682fca0-65ed-402c-8634-94cd51463cc4/)

On initialization:
- `dendron.yml` — vault list, settings, workspace metadata (YAML)
- `dendron.code-workspace` — VS Code multi-root workspace file
- A default `vaults/` subdirectory with a `root.md` (hierarchy root) if not already present

No database or cache file is required. The `dendron.yml` is the authoritative declaration of where vaults live.

---

### Finding: Dendron injects YAML frontmatter (`id`, `title`) into notes — and warns/offers to fix notes that lack it
**Confidence:** CONFIRMED
**Evidence:** [Frontmatter docs](https://wiki.dendron.so/notes/ffec2853-c0e0-4165-a368-339db12c8e4b/), [Workspace docs](https://wiki.dendron.so/notes/c4cf5519-f7c2-4a23-b93b-1c9a02880f6b/)

This is the key mutation behavior distinguishing Dendron from other tools. New notes created through Dendron auto-get frontmatter with a globally-unique `id`, `title`, and default fields. Existing markdown files that lack frontmatter trigger editor warnings and surface a "lightbulb" quick-fix; the `Dendron: Doctor: fixFrontmatter` command will inject required frontmatter across the vault. Dendron does not rewrite content on initialization without the user acting on these fixes, but the pressure to adopt Dendron's frontmatter schema is structural — notes without it generate persistent warnings.

**Implications:** Dendron is more invasive than Obsidian/Foam — it wants every note to have Dendron-shaped frontmatter. Running `fixFrontmatter` on an existing vault will modify every pre-existing `.md` file.

---

### Finding: `.md` files on disk remain the authoritative store; there is no parallel DB
**Confidence:** CONFIRMED
**Evidence:** [Vaults docs](https://wiki.dendron.so/notes/6682fca0-65ed-402c-8634-94cd51463cc4/), [FAQ](https://wiki.dendron.so/notes/683740e3-70ce-4a47-a1f4-1f140e80b558/)

Hierarchy is encoded in file names (`root.parent.child.md`), and metadata lives in YAML frontmatter — all plain text on disk. No SQLite, no IndexedDB mirror. Remove Dendron and the notes are still normal markdown files (with Dendron-shaped frontmatter + dot-hierarchy naming).

---

### Finding: `dendron.yml` and `dendron.code-workspace` are meant to be committed; no documented read-only mode
**Confidence:** INFERRED
**Evidence:** [Cookbook](https://wiki.dendron.so/notes/401c5889-20ae-4b3a-8468-269def4b4865/), [Workspace docs](https://wiki.dendron.so/notes/c4cf5519-f7c2-4a23-b93b-1c9a02880f6b/)

Configuration is intended to travel with the repo (team-shared settings). No official `.gitignore` template enumerated in the docs I reviewed — these are small, stable config files rather than volatile state.

---

## Gaps / follow-ups

- Whether the `id` frontmatter field is strictly required for Dendron features to function, or only a warning, is not fully clear — appears to be "required for full functionality" based on the Doctor command's existence
- Project maintenance status (Dendron's active development has slowed since 2022-2023) not covered in this evidence capture
