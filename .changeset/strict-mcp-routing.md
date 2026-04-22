---
"@inkeep/open-knowledge": minor
---

feat(cli): require explicit project routing for MCP tool calls

MCP tool calls now route by explicit `cwd` first, otherwise by the client's only advertised root, and fail clearly instead of guessing the startup project.
