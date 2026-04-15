---
title: MCP SDK Identity Extraction
date: 2026-04-14
sources:
  - node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js
  - node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts
  - packages/cli/scripts/probe-mcp-identity.ts
  - packages/cli/scripts/probe-mcp-identity-test.ts
---

# Evidence: MCP SDK Identity Extraction

## Proven by probe script (live verification)

Claude Code v2.1.101 connected and sent:

```json
{
  "clientInfo": {
    "name": "claude-code",
    "version": "2.1.101",
    "title": "Claude Code",
    "description": "Anthropic's agentic coding tool",
    "websiteUrl": "https://claude.com/claude-code"
  }
}
```

Probe scripts: `packages/cli/scripts/probe-mcp-identity.ts` (server), `probe-mcp-identity-test.ts` (test harness).

## SDK access path

```
McpServer (readonly .server: Server)
  └── .getClientVersion(): Implementation | undefined
  └── .oninitialized: () => void  (fires after handshake)
```

- `Implementation` type: required `name` + `version`, optional `title`, `description`, `websiteUrl`, `icons`
- For stdio: `extra.sessionId` = undefined (no transport sessionId)
- `connectionId` must be server-generated UUID

## Cross-harness clientInfo.name values

| Harness | name | Confidence |
|---------|------|------------|
| Claude Code | `"claude-code"` | CONFIRMED (probe) |
| Claude Desktop | `"claude-ai"` | CONFIRMED (research) |
| Cursor | `"cursor"` | INFERRED |
| Windsurf | `"cascade"` | INFERRED |
| Cline | `"cline"` | INFERRED |
| VS Code Copilot | `"copilot"` | INFERRED |
| OpenAI Codex | `"codex"` | INFERRED |
