# Deprecated

This directory has been superseded by the `packages/` monorepo structure:

- `packages/core/` — shared extensions, types, constants, utils
- `packages/server/` — Hocuspocus server, persistence, file-watcher, agent sessions
- `packages/app/` — React editor, presence, design system, Vite dev plugin
- `packages/cli/` — CLI entry point, config system, MCP adapter (coming soon)

All new development should happen in `packages/`. This directory is kept for reference during migration and will be removed once all packages are verified end-to-end.
