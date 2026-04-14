---
"@inkeep/open-knowledge": minor
---

feat: add `get_history` and `save_version` MCP tools, fix IPv6 MCP connectivity

- Add `get_history` MCP tool wrapping GET /api/history for querying document version history with filtering and pagination
- Add `save_version` MCP tool wrapping POST /api/save-version for creating checkpoint commits
- Update `rollback_to_version` description to reference `get_history` instead of raw API endpoint
- Fix MCP server discovery using `localhost` instead of `127.0.0.1` to support IPv6-only server bindings
