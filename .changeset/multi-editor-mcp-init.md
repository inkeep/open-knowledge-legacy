---
"@inkeep/open-knowledge": minor
---

feat: `open-knowledge init` now configures MCP for multiple editors

- Interactive multi-select prompt asks which tools you use (Claude Code, Cursor, VS Code, Windsurf)
- Writes each editor's MCP config to its expected location and format
- `--editor` flag for non-interactive use (e.g. `--editor cursor,vscode` or `--editor all`)
- Falls back to Claude Code only when stdin is not a TTY
