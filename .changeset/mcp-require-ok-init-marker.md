---
'@inkeep/open-knowledge': patch
---

Refuse to run `ok mcp` in directories that haven't been `ok init`'d. Closes a regression where invoking `npx @inkeep/open-knowledge mcp` from a non-OK directory eagerly scaffolded `.ok/`, `.openknowledge/` (legacy bare shadow), and `.gitignore` as a side effect of MCP startup — observed when the OK MCP was registered globally (e.g. `~/.claude.json` top-level `mcpServers`) and the user opened claude in any directory.

`ok mcp` now exits cleanly at startup if `<cwd>/.ok/` doesn't exist, before registering tools or discovering servers. `--port` bypasses the gate (explicit user intent). The skill description already says "Skip if no .ok/ — not an Open Knowledge project"; this enforces the same contract at the server level.
