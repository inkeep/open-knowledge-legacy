---
"@inkeep/open-knowledge": minor
---

feat: `open-knowledge init` command and MCP workflow prompts

- Add `open-knowledge init` CLI subcommand to scaffold `.open-knowledge/` and register the MCP server in `.mcp.json`
- Add three MCP workflow prompts: `init-wiki`, `ingest`, and `research` for cross-client wiki workflows
- MCP server auto-generates INDEX.md catalogs via file watcher on `.open-knowledge/`
