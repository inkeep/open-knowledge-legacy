# Evidence: MCP Tool Delivery from CLI

**Dimension:** MCP tool delivery to AI clients
**Date:** 2026-04-08
**Sources:** @modelcontextprotocol/sdk v1.28 source, filesystem-server, episodic-memory, Claude Code MCP config docs, STORIES.md T2.1-T2.9

---

## Key files / pages referenced

- `@modelcontextprotocol/sdk/server/mcp.js` — McpServer high-level API (registerTool, registerResource)
- `@modelcontextprotocol/sdk/server/stdio.js` — StdioServerTransport
- `@modelcontextprotocol/server-filesystem` — reference MCP server (13 tools, Zod schemas, annotations)
- episodic-memory `.claude-plugin/plugin.json` — Claude Code plugin pattern
- STORIES.md T2.1-T2.9 — agent tool definitions for open-knowledge
- `init_spike/src/server/hocuspocus-plugin.ts` — existing agent session + DirectConnection pattern

---

## Findings

### Finding: stdio transport is the standard for local CLI MCP servers
**Confidence:** CONFIRMED
**Evidence:** filesystem-server, episodic-memory, all local MCP servers use stdio

`StdioServerTransport` reads from stdin, writes to stdout. All diagnostic logging goes to stderr. Zero network/port/auth setup. Claude Code config: `"command": "npx", "args": ["@inkeep/open-knowledge", "mcp"]`.

Streamable HTTP is for cloud/remote deployment (LATER phase). SSE is deprecated.

### Finding: MCP server should embed Hocuspocus directly — not proxy to HTTP API
**Confidence:** CONFIRMED
**Evidence:** Architecture analysis + DirectConnection API

The MCP server is a separate process that embeds its own Hocuspocus instance, accessing the same content directory and Y.Docs. It uses DirectConnection for CRDT operations — the same pattern as the existing agent write endpoints. Shared module extraction (`agent-sessions.ts`) enables code reuse between MCP server and Vite plugin.

### Finding: 8 tools + document resources cover the knowledge base surface
**Confidence:** CONFIRMED
**Evidence:** Mapping existing HTTP API + STORIES.md T2.1-T2.9

Tools: read_document, write_document, edit_document, list_documents, search_documents, undo_agent_edit, redo_agent_edit, update_frontmatter.

Resources: each .md file as `ok://docs/{path}` with subscription support via Hocuspocus `afterStoreDocument` hook for change notifications.

### Finding: `open-knowledge mcp install` can auto-configure Claude Code, Cursor, and Claude Desktop
**Confidence:** CONFIRMED
**Evidence:** Config file locations for each client

Claude Code: `.claude/settings.json` (`mcpServers` key)
Cursor: `.cursor/mcp.json` (`mcpServers` key)
Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json`

The install command reads existing config, merges the MCP server entry, writes back.

### Finding: Claude Code plugin distribution (`.claude-plugin/`) is the gold standard for Claude Code
**Confidence:** CONFIRMED
**Evidence:** episodic-memory ships as both npm binary and Claude Code plugin

Plugin auto-registers the MCP server. But only helps Claude Code — doesn't configure Cursor/Windsurf. Recommended: ship `mcp install` command for broad compatibility + plugin for Claude Code.

### Finding: SDK v1.28 McpServer API with Zod schemas is the current production API
**Confidence:** CONFIRMED
**Evidence:** filesystem-server, episodic-memory both use this API

```typescript
const server = new McpServer({ name: 'open-knowledge', version: '0.1.0' });
server.registerTool('read_document', {
  inputSchema: z.object({ path: z.string() }),
  annotations: { readOnlyHint: true },
}, async ({ path }) => { /* ... */ });
```

Tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) are standard practice.

---

## Gaps / follow-ups

* Streamable HTTP transport for cloud/remote deployment (LATER phase)
* Claude Code plugin packaging specifics (`.claude-plugin/plugin.json` schema)
