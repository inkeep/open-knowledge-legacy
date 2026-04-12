# Evidence: Claude Code Desktop MCP Integration

**Dimension:** D4 — How MCP servers integrate with Claude Code Desktop, auto-registration, lifecycle
**Date:** 2026-04-11
**Sources:** [Claude Code MCP docs](https://code.claude.com/docs/en/mcp), open-knowledge init.ts

---

## Key files / pages referenced

- [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) — official MCP integration guide
- `packages/cli/src/commands/init.ts` — current MCP registration code
- `packages/cli/src/commands/mcp.ts` — MCP stdio server command
- `packages/cli/src/mcp/server.ts` — MCP server implementation

---

## Findings

### Finding: Claude Code has three MCP scopes — project (.mcp.json) is the team-shared one
**Confidence:** CONFIRMED
**Evidence:** [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)

| Scope | Loads in | Shared with team | Stored in |
|-------|----------|-----------------|-----------|
| Local | Current project only | No | `~/.claude.json` |
| Project | Current project only | Yes, via VCS | `.mcp.json` in project root |
| User | All projects | No | `~/.claude.json` |

Precedence: Local > Project > User > Plugin > claude.ai connectors.

**Implications:** `open-knowledge init` correctly writes to `.mcp.json` (project scope) — this is the right default for team-shared configuration. Users who want it globally can add it via `claude mcp add --scope user`.

### Finding: The init command already registers MCP correctly for Claude Code
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/commands/init.ts` (lines 27-28)

```typescript
const MCP_SERVER_COMMAND = 'npx';
const MCP_SERVER_ARGS = ['@inkeep/open-knowledge', 'mcp'];
```

This writes to `.mcp.json`:
```json
{
  "mcpServers": {
    "open-knowledge": {
      "command": "npx",
      "args": ["@inkeep/open-knowledge", "mcp"]
    }
  }
}
```

Claude Code launches this as a stdio MCP server. When a user opens the project in Claude Code (CLI or Desktop), the MCP server starts automatically.

**Implications:** The MCP registration is already correct. One consideration: should the command be `bunx` instead of `npx`? `npx` is more universal (works without Bun installed), so `npx` is the safer default.

### Finding: MCP server lifecycle is managed by Claude Code — auto-start on session, auto-stop on close
**Confidence:** CONFIRMED
**Evidence:** [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)

"At session startup, servers for enabled plugins connect automatically." Claude Code manages the MCP server process lifecycle:
- Starts the MCP server when a session begins in the project directory
- Stops the MCP server when the session ends
- Supports dynamic tool updates via `list_changed` notifications

**Implications:** The user doesn't need to manually start the MCP server. `open-knowledge init` → commit `.mcp.json` → open Claude Code → MCP tools available. Zero manual steps.

### Finding: The `start` and `mcp` commands serve different purposes and should remain separate
**Confidence:** CONFIRMED
**Evidence:** Architecture analysis

- `open-knowledge start` → human-facing: HTTP server + WebSocket + React UI + file watcher. The user opens a browser to collaborate.
- `open-knowledge mcp` → agent-facing: stdio MCP server for AI agent access to the knowledge base. Launched automatically by Claude Code.

These serve different consumers:
- **Humans** use `start` (browser-based editor)
- **AI agents** use `mcp` (tool calls via MCP protocol)

The MCP server currently connects to Hocuspocus if it's running (checks WebSocket health), but works independently for disk-only operations.

**Implications:** Keep them separate. The MCP command should NOT auto-start the collaboration server — that would create an HTTP server the user didn't ask for. If the user wants both, they run `start` separately.

### Finding: Claude Code supports HTTP transport — potential to consolidate start + mcp
**Confidence:** CONFIRMED
**Evidence:** [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)

```bash
claude mcp add --transport http <name> <url>
```

Claude Code supports `http` (streamable HTTP) transport in addition to stdio. This means the `start` command could potentially serve MCP over HTTP on the same port as the React app.

The `.mcp.json` would become:
```json
{
  "mcpServers": {
    "open-knowledge": {
      "type": "http",
      "url": "http://localhost:1773/mcp"
    }
  }
}
```

**Implications:** This is an advanced optimization, not a requirement. Tradeoffs:
- **Pro:** Single process for everything (server, UI, MCP). No need for a separate stdio process.
- **Con:** Requires the server to be running first. Stdio is zero-config (Claude Code launches it). HTTP requires the user to start the server manually.
- **Recommendation:** Keep stdio as the default MCP transport. Consider HTTP as an optional mode for when `start` is already running.

### Finding: Environment variable expansion in .mcp.json enables flexible configuration
**Confidence:** CONFIRMED
**Evidence:** [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)

`.mcp.json` supports `${VAR}` and `${VAR:-default}` expansion in command, args, env, url, and headers fields.

**Implications:** Could use env vars for port configuration: `"args": ["@inkeep/open-knowledge", "mcp", "--port", "${OPEN_KNOWLEDGE_PORT:-1773}"]`

### Finding: The "zero config dream" is achievable today with two commands
**Confidence:** CONFIRMED
**Evidence:** End-to-end analysis

The minimal path from zero to working:
1. `npx @inkeep/open-knowledge init` — scaffolds `.open-knowledge/`, writes `.mcp.json`
2. Open Claude Code Desktop in the project → MCP server auto-starts → tools available

For the full collaborative experience (browser UI):
1. `npx @inkeep/open-knowledge init` — one-time setup
2. `npx @inkeep/open-knowledge` — starts server + UI (or `bunx @inkeep/open-knowledge`)
3. Open `http://localhost:1773` in browser

**Implications:** This is already close to the ideal. The remaining gap is: (a) the React app must be bundled in the npm package, and (b) the init command could be auto-run on first start if `.open-knowledge/` doesn't exist.

---

## Gaps / follow-ups

* Should `start` auto-run `init` if `.open-knowledge/` doesn't exist? Would reduce the flow to a single command.
* Investigate MCP HTTP transport as an optional mode for the `start` command
* Consider a Claude Code plugin that wraps both `start` and `mcp` for an even more integrated experience
