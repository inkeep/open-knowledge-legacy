---
"@inkeep/open-knowledge": minor
---

feat(init): scope selection for MCP config — user, project, or both

`ok init` now supports writing MCP server config at the user level, the project level, or both.

- **Interactive (TTY):** checkbox prompt, both scopes pre-selected
- **Non-interactive (piped/CI):** defaults to `both`
- **`--scope <user|project|both>`:** bypasses the prompt

Project-level paths: `.mcp.json` (Claude Code), `.cursor/mcp.json` (Cursor), `.vscode/mcp.json` (VS Code), `.codex/config.toml` (Codex). Windsurf and Claude Desktop are skipped (no project-local config format).
