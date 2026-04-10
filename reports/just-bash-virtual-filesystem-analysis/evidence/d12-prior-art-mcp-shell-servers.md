# Evidence: Prior Art — MCP Servers That Wrap Shell/Exec Interfaces

**Dimension:** D12 — Has anyone actually wrapped just-bash (or similar) into an MCP server?
**Date:** 2026-04-02
**Sources:** GitHub repositories, MCP registries, npm, Mintlify MCP docs

---

## Key sources referenced

- https://github.com/guillaumemaka/just-bash-mcp — just-bash MCP server (confirmed)
- https://github.com/tumf/mcp-shell-server — Whitelisted shell MCP
- https://github.com/inercia/MCPShell — Shell scripts as MCP tools
- https://github.com/sonirico/mcp-shell — Secure/legacy mode shell MCP
- https://github.com/patrickomatik/mcp-bash — Claude Desktop bash MCP
- https://github.com/egoist/shell-command-mcp — Shell command executor
- https://mcpservers.org/servers/gamunu/mcp-unix-shell — Go-based Unix shell MCP
- https://mintlify.com/docs/mcp — Mintlify's external MCP (2 tools)

---

## Findings

### Finding: just-bash-mcp exists — Guillaume Maka built an MCP server wrapping just-bash with a single execute_bash tool
**Confidence:** CONFIRMED
**Evidence:** https://github.com/guillaumemaka/just-bash-mcp

Project details:
- Single tool: `execute_bash(command: string, timeout?: number)`
- Uses just-bash's InMemoryFs for sandboxing
- MIT license
- Bun runtime
- Supports Claude Desktop, VS Code
- Optional Laminar tracing

This is exactly the "single exec() tool" pattern from D9. It proves the architecture works but uses InMemoryFs (not a custom backend like ChromaFs).

### Finding: At least 7 MCP servers expose shell/exec interfaces — ALL use a single-tool pattern
**Confidence:** CONFIRMED
**Evidence:** GitHub survey, MCP registries

| Server | Tool(s) | Security Model | Shell |
|---|---|---|---|
| just-bash-mcp | `execute_bash` (1 tool) | Sandboxed via just-bash InMemoryFs | just-bash |
| mcp-shell-server (tumf) | Single exec (1 tool) | Whitelist via ALLOW_COMMANDS env var | Real shell, direct execution (no shell interpretation) |
| MCPShell (inercia) | Shell scripts as tools (N tools) | CEL expression validation per parameter | Real shell |
| mcp-shell (sonirico) | Single exec (1 tool) | Secure mode (no shell interpretation, allowlist) or legacy (allowlist/blocklist) | Real shell |
| mcp-bash (patrickomatik) | Single exec (1 tool) | None — "lethal security risk" per README | Real bash |
| shell-command-mcp (egoist) | Single exec (1 tool) | Not specified | Real shell |
| mcp-unix-shell (gamunu) | Single exec (1 tool) | Go-based, allowedCommands parameter | Real shell |

Pattern: 6 of 7 expose exactly ONE tool (execute/exec/run). MCPShell is the outlier — it converts individual shell scripts into individual MCP tools (one script = one tool).

### Finding: Mintlify's external MCP server exposes 2 semantic tools, NOT bash/exec
**Confidence:** CONFIRMED
**Evidence:** https://mintlify.com/docs/mcp

Mintlify's MCP server for external consumption:
1. `search_mintlify(query, language?)` — search across documentation
2. `get_page_mintlify(page)` — retrieve a specific page

There is NO connection between the external MCP server and ChromaFs/just-bash. ChromaFs powers the INTERNAL assistant (the chat widget inside Mintlify docs). The external MCP server is a separate system with semantic tools.

This confirms the pattern from D4: Mintlify uses just-bash + ChromaFs internally for their assistant, but exposes semantic tools (not bash) for external MCP consumption.

### Finding: No MCP server wraps a virtual filesystem shell (just-bash over custom IFileSystem) — all shell MCPs use real OS shells
**Confidence:** CONFIRMED
**Evidence:** Survey of all identified MCP shell servers

Every MCP shell server except just-bash-mcp executes commands on the real operating system. just-bash-mcp uses InMemoryFs (sandboxed) but not a custom backend like ChromaFs.

No one has built: "MCP server → just-bash → custom IFileSystem (Yjs/Chroma/Orama)." The ChromaFs pattern exists in Mintlify's internal assistant but is NOT exposed as an MCP server.

This would be novel if built.

### Finding: v0's MCP server does not expose exec/bash capabilities
**Confidence:** CONFIRMED
**Evidence:** Vercel MCP docs (https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel)

Vercel's MCP infrastructure supports deploying MCP servers on Vercel but does not include a bash/exec tool. The Vercel MCP server exposes project management and deployment tools, not shell execution.

bash-tool (vercel-labs) wraps just-bash as Vercel AI SDK tools (bash, readFile, writeFile) but this is an AI SDK integration, not an MCP server. There is no official just-bash MCP server from Vercel.

---

## Negative searches

* Searched npm for "just-bash mcp" — only guillaumemaka/just-bash-mcp found
* Searched MCP registries (mcpservers.org, pulsemcp.com, glama.ai) for "virtual filesystem" — no results matching custom-backend pattern
* Searched for "ChromaFs MCP" — no results (ChromaFs is internal only)

---

## Gaps / follow-ups

* Whether Vercel plans an official just-bash MCP server — no public roadmap
* Whether any MCP server wraps a WASM-based shell or container — not investigated
