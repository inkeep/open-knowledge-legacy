# Evidence: MCP Tool Surface

**Dimension:** 9 (MCP tool surface)
**Date:** 2026-03-20
**Sources:** MCP specification (modelcontextprotocol.io), official docs, npm packages

---

## Key sources referenced

- https://modelcontextprotocol.io/specification/draft/server/tools — MCP Tools spec
- https://modelcontextprotocol.io/specification/2025-06-18/server/resources — MCP Resources spec
- https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/README.md — Filesystem server
- https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem — npm package

---

## Findings

### Finding: MCP tool definitions use JSON Schema with 3 fields: name, description, inputSchema
**Confidence:** CONFIRMED
**Evidence:** MCP specification at modelcontextprotocol.io/specification/draft/server/tools

```json
{
  "name": "tool_name",
  "description": "Human-readable description",
  "inputSchema": {
    "type": "object",
    "properties": { ... },
    "required": [...]
  }
}
```

Tool annotations (2025-03-26): readOnlyHint, destructiveHint, idempotentHint, openWorldHint.

### Finding: MCP uses JSON-RPC 2.0 with tools/list for discovery and tools/call for invocation
**Confidence:** CONFIRMED
**Evidence:** MCP specification

Discovery: `{"method": "tools/list"}` → returns array of tool definitions with pagination support.
Invocation: `{"method": "tools/call", "params": {"name": "...", "arguments": {...}}}` → returns `{content: [{type: "text"|"image"|"resource", ...}], isError: boolean}`.
Dynamic changes: `notifications/tools/list_changed` notification.

### Finding: MCP tools appear identical to native tools from the LLM's perspective
**Confidence:** CONFIRMED
**Evidence:** Architecture analysis — LLM sees tool name + schema + description, routing is client-side

The agent does not know whether a tool is native or MCP-provided. The client handles routing. Key differences are latency (IPC overhead) and dynamic availability.

### Finding: Official filesystem MCP server exposes 11 tools
**Confidence:** CONFIRMED
**Evidence:** @modelcontextprotocol/server-filesystem README

| Tool | Parameters | Description |
|------|-----------|-------------|
| read_file | path: string | Read complete file contents |
| read_multiple_files | paths: string[] | Read multiple files at once |
| write_file | path: string, content: string | Create/overwrite file |
| edit_file | path: string, edits: array, dryRun?: boolean | Search/replace edits |
| create_directory | path: string | Create directory (recursive) |
| list_directory | path: string | List files and subdirs |
| directory_tree | path: string | Recursive tree view |
| move_file | source: string, destination: string | Move/rename |
| search_files | path: string, pattern: string | Recursive file search |
| get_file_info | path: string | File metadata |
| list_allowed_directories | (none) | List allowed dirs |

Server restricted to explicitly allowed directories passed as args.

### Finding: MCP Resources differ from Tools — read-only, URI-addressed, user-controlled
**Confidence:** CONFIRMED
**Evidence:** MCP Resources spec

Resources: read-only context data, addressed by URI, user/application-controlled.
Tools: action-oriented, agent-controlled, can have side effects.
For virtual filesystem: Tools suit dynamic agent-driven operations; Resources suit explicit context loading.

### Finding: .mcp.json is the emerging universal project-level MCP config convention
**Confidence:** CONFIRMED
**Evidence:** Multiple agent docs (Claude Code, VS Code, Codex, Amazon Q)

Format: `{"mcpServers": {"name": {"command": "...", "args": [...], "env": {...}}}}`.
Supported by Claude Code, VS Code Copilot, Amazon Q, Codex CLI.

### Finding: A virtual filesystem MCP server is architecturally feasible
**Confidence:** INFERRED
**Evidence:** MCP architecture analysis

A virtual filesystem MCP would implement the same tool interface (read_file, write_file, etc.) but back it with non-disk storage. The agent calls identical tools without knowing the backend differs. Path resolution is server-side. This works because the tool contract is schema-based and server implementation is opaque.

---

## Implications for virtual filesystem adapter

1. Implementing an MCP server with the filesystem tool interface is the most portable approach — works with ALL MCP-compatible agents
2. The 11-tool surface of the official filesystem server is the baseline to implement
3. Claude Code's native tools (Read, Write, Edit, Glob, Grep) have richer features (offset/limit, regex, output modes) than the MCP filesystem server — a virtual FS adapter may need both
4. Tool annotations can signal that the virtual FS tools are non-destructive/idempotent

---

## Gaps / follow-ups

* edit_file in the MCP filesystem server — exact schema for the edits array
* Performance characteristics of MCP tool calls vs native tools
* Whether Claude Code prefers native tools over MCP tools when both are available
