---
"@inkeep/open-knowledge": minor
---

feat: `open-knowledge init` command and MCP workflow tools

- Add `open-knowledge init` CLI subcommand to scaffold `.open-knowledge/` and register the MCP server in `.mcp.json`
- Add three MCP workflow tools: `init-wiki`, `ingest`, and `research` with structured skill-style descriptions (Use when / Triggers on)
- MCP server auto-generates INDEX.md catalogs via file watcher on `.open-knowledge/`
