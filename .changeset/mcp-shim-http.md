---
"@inkeep/open-knowledge": patch
---
refactor(mcp): route `ok mcp` through the shared HTTP server. The CLI now uses a thin stdio-to-HTTP shim, removes legacy `--pin` setup, and relies on the running `ok start` server for MCP tool execution.
