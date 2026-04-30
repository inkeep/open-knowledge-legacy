---
'@inkeep/open-knowledge': minor
'@inkeep/open-knowledge-core': minor
'@inkeep/open-knowledge-server': minor
'@inkeep/open-knowledge-app': minor
'@inkeep/open-knowledge-desktop': minor
---

Config Editing Paths — end-to-end UX for editing Open Knowledge configuration:

- **Settings pane** in the editor area (Cmd-, / App menu / HelpPopover / Command Palette) with `This project` and `User` scope tabs. Each field auto-saves; per-field reset; modified-at-scope indicator on cross-scope fields.
- **Real-time sync** — Settings pane is bound to two Y.Text-only synthetic Hocuspocus docs (`__config__/workspace`, `__user__/config.yml`). External edits via CLI, MCP, IDE hand-edit, or another `ok start` instance propagate via a chokidar file watcher into Y.Text and refresh any open pane within ~500ms.
- **Three-layer defense-in-depth validation** — client walker (L1) → fs writer (L2) → persistence-hook (L3). Invalid mutations revert to LKG and surface a toast + brief field flash.
- **MCP tools** — `set_config`, `get_config`, `set_folder_rule`. fs-direct (no running server required); auto-scope inference via the inspectConfig ladder; mixed-scope rejection.
- **CLI** — `ok config validate` (exits 0/1 with source-located errors) + `ok config migrate` (idempotent codemod that drops `sync.*`, `persistence.{debounceMs,maxDebounceMs}`, `server.port`).
- **`ok init`** scaffolds the workspace `config.yml` with a magic-comment `$schema` URL pinned to the schema major (`v0`) + `@latest` of the npm package — additive schema changes reach existing users automatically; breaking changes bump the path to `v1` and old majors stay published forever.
- **Per-scope JSON Schemas** — `dist/schemas/v0/config.workspace.schema.json` and `…/config.user.schema.json` so VS Code's Red Hat YAML LSP only suggests fields valid AT the file's scope.
- **Schema cleanup** — drops `sync.*` (7), `persistence.{debounceMs,maxDebounceMs}` (2), `server.port` (1); adds `appearance.theme` and `appearance.editorModeDefault` (user-scope, both UNSET by default; chrome `<ThemeToggle>` writes through `userBinding.patch` so localStorage stays a derived cache). `content.*` is workspace-scope-only.
- **OTel** — five new `config.*` spans (`config.bind`, `config.patch`, `config.validate`, `config.persist`, `config.revert`) trace the full edit chain.
