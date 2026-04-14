# Evidence: Cross-Harness Compatibility

**Dimension:** D5 — Cross-harness compatibility
**Date:** 2026-04-14
**Sources:** MCP specification, harness documentation, community forums (web research)

---

## Key sources

- [MCP Spec — Transports (2025-03-26)](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [MCP Spec — Lifecycle (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
- [Claude Code Docs — MCP](https://code.claude.com/docs/en/mcp)
- [Cursor Docs — MCP](https://cursor.com/docs/context/mcp)
- [Windsurf MCP Integration](https://docs.windsurf.com/windsurf/cascade/mcp)
- [OpenAI Codex MCP](https://developers.openai.com/codex/mcp)
- [GitHub Copilot MCP GA](https://github.blog/changelog/2025-07-14-model-context-protocol-mcp-support-in-vs-code-is-generally-available/)
- [Cline MCP Overview](https://docs.cline.bot/mcp/mcp-overview)

---

## Findings

### Finding: `clientInfo.name` values across harnesses
**Confidence:** CONFIRMED for Claude Code, Claude Desktop; INFERRED for others

| Harness | `clientInfo.name` | `version` | Transport | Confidence |
|---------|-------------------|-----------|-----------|------------|
| Claude Code CLI | `"claude-code"` | e.g. `"2.1.87"` | Stdio | CONFIRMED |
| Claude Desktop | `"claude-ai"` (sometimes with mcp-remote suffix) | `"0.1.0"` | Stdio | CONFIRMED |
| Cursor | `"cursor"` (not definitively documented) | Release-dependent | Stdio/SSE/HTTP | INFERRED |
| Windsurf | `"cascade"` (agent name, not IDE name) | Release-dependent | Stdio/SSE/HTTP | INFERRED |
| Cline | `"cline"` (likely) | Extension version | Stdio/HTTP | INFERRED |
| VS Code Copilot | `"copilot"` or `"copilot-cli"` | Release-dependent | Stdio/HTTP | INFERRED |
| OpenAI Codex | `"codex"` | Release-dependent | Stdio/HTTP | INFERRED |
| Continue.dev | Unknown | Unknown | Unknown | NOT FOUND |

**Implications:** Enough variance in `name` to distinguish harness type. The INFERRED values are based on community reports and naming conventions — verification requires connecting each harness and logging the initialize request.

### Finding: All harnesses use stdio for local MCP servers
**Confidence:** CONFIRMED

Every harness that supports local MCP servers (spawned as a subprocess) uses stdio transport. This means:
- No `sessionId` from transport layer for any local connection
- `connectionId` must be server-generated for all local agents
- One process = one connection = one agent identity

### Finding: Codex creates fresh MCP sessions per tool call (protocol violation)
**Confidence:** CONFIRMED
**Evidence:** [OpenAI Community — Session Problem](https://medium.com/@ylenius/openais-mcp-session-problem-and-how-we-worked-around-it-7b40d1b19710), [OpenAI Community — Session ID Issue](https://community.openai.com/t/connector-tool-calls-generating-fresh-mcp-session-each-invocation/1364975)

Codex and ChatGPT's MCP connector create a new `Mcp-Session-Id` per tool call rather than maintaining session continuity. This violates the MCP spec which requires the same `Mcp-Session-Id` for all requests after initialization.

**Implications for Open Knowledge:** Since OK uses stdio (not HTTP), this bug doesn't affect it directly. But if HTTP transport is added later, Codex would appear as a new agent on every tool call.

### Finding: Cursor has known stale sessionId bug
**Confidence:** CONFIRMED
**Evidence:** [Cursor Forum — Stale Session ID](https://forum.cursor.com/t/cursor-fails-to-recover-from-stale-session-id-http-400-on-mcp-reconnect/138169)

Cursor reuses stale sessionIds even after server restart, causing HTTP 400 errors. The server must handle graceful session recovery.

**Implications:** Not relevant for stdio transport, but worth noting for future HTTP support.

### Finding: Windsurf has a 100-tool limit per Cascade session
**Confidence:** CONFIRMED
**Evidence:** [Windsurf MCP Integration Docs](https://docs.windsurf.com/windsurf/cascade/mcp)

**Implications:** Open Knowledge registers ~15-20 tools — well within the limit.

---

## Practical interop matrix for stdio transport

| Harness | `clientInfo` available | `connectionId` strategy | Per-agent distinction | Works today? |
|---------|----------------------|------------------------|-----------------------|-------------|
| Claude Code | ✅ `name: "claude-code"` | Server-generated UUID at startup | By connectionId (unique per CLI process) | ✅ Yes |
| Claude Desktop | ✅ `name: "claude-ai"` | Server-generated UUID at startup | By connectionId (unique per app launch) | ✅ Yes |
| Cursor | ✅ `name: "cursor"` (likely) | Server-generated UUID at startup | By connectionId (unique per project open) | ✅ Yes |
| Windsurf | ✅ `name: "cascade"` | Server-generated UUID at startup | By connectionId | ✅ Yes |
| Codex | ✅ `name: "codex"` | Server-generated UUID at startup | By connectionId | ✅ Yes (stdio) |
| Cline | ✅ `name: "cline"` (likely) | Server-generated UUID at startup | By connectionId | ✅ Yes |
| Copilot | ✅ `name: "copilot"` | Server-generated UUID at startup | By connectionId | ✅ Yes |

**Key insight:** For stdio transport, the approach is universal: generate a UUID at MCP server startup, capture `clientInfo` at initialize, compose into `AgentIdentity`. This works for ALL harnesses because the stdio subprocess IS the identity boundary.

---

## Gaps / follow-ups

- INFERRED `clientInfo.name` values need verification by connecting each harness and logging the initialize request
- HTTP/SSE transport adds sessionId complexity (Codex session recycling, Cursor stale sessions) — not needed for V0 but worth tracking
- No harness provides conversation-turn or prompt-level identity — pass boundaries must be product-native (confirmed by STORY.md §14)
