# Evidence: Container/Sandbox MCP Servers

**Dimension:** D4 — Container/sandbox MCP servers that mirror filesystem tools
**Date:** 2026-04-02
**Sources:** E2B docs, Daytona docs, AIO Sandbox, Docker MCP, code-sandbox-mcp repos

---

## Key files / pages referenced

- https://e2b.dev/docs/mcp — E2B MCP documentation
- https://github.com/e2b-dev/mcp-server — E2B official MCP server
- https://www.daytona.io/docs/en/mcp/ — Daytona MCP server
- https://github.com/agent-infra/sandbox — AIO Sandbox (ByteDance-affiliated)
- https://github.com/Automata-Labs-team/code-sandbox-mcp — Docker container sandbox MCP
- https://hub.docker.com/r/mcp/node-code-sandbox — Docker MCP catalog sandbox

---

## Findings

### Finding: E2B MCP server exposes sandbox file operations with E2B-specific tool names, not filesystem-mirroring names
**Confidence:** CONFIRMED
**Evidence:** E2B docs, GitHub repo

E2B MCP server tools (15 total):
- `e2b_create_sandbox` / `e2b_kill_sandbox` — lifecycle
- `e2b_execute_code` / `e2b_create_code_context` / `e2b_execute_in_context` — execution
- `e2b_read_file` — read from sandbox (with encoding support)
- `e2b_download_file` — download to local or return content
- `e2b_watch_directory` — monitor directory changes (polling)
- Plus write, upload, and management tools

Tool names are prefixed with `e2b_` — not `read_file`, `write_file`. The agent must learn E2B-specific semantics. These are "remote sandbox tools" not "virtual filesystem tools."

### Finding: Daytona MCP server provides file operations within sandboxes but uses its own tool vocabulary
**Confidence:** CONFIRMED
**Evidence:** https://www.daytona.io/docs/en/mcp/

Daytona MCP server capabilities:
- Sandbox management (create, destroy)
- Command execution in sandboxes
- File operations (upload, download, delete)
- Git operations
- Preview URL generation

After pivoting from development environments to AI agent infrastructure in early 2025, Daytona raised $24M Series A in February 2026. Sub-90ms sandbox creation for AI agents.

File operations are described as "upload, download, and delete" — not read_file/write_file/edit_file. The tool surface is sandbox-management-oriented, not filesystem-mirroring.

### Finding: AIO Sandbox (agent-infra) provides MCP tools for file CRUD but reduces tool count from 60 to 30
**Confidence:** CONFIRMED
**Evidence:** https://github.com/agent-infra/sandbox, MarkTechPost announcement (March 2026)

AIO Sandbox combines Browser, Shell, File, MCP, and VSCode Server in one Docker container. ByteDance-affiliated Agent Infra team.

File operations: "File CRUD operations encapsulate basic I/O for file read/write/list directory/create/upload/download, with path validation and permission control."

Shell: Uses OpenHands' CmdRunAction as execution engine combined with tmux.

The sandbox provides a unified environment but uses its own tool names, not filesystem-standard names.

### Finding: Docker code-sandbox-mcp servers provide file transfer but focus on code execution, not filesystem mirroring
**Confidence:** CONFIRMED
**Evidence:** Multiple code-sandbox-mcp repos

Common pattern across Docker sandbox MCP servers:
1. Spin up disposable Docker container
2. Execute code within container
3. Transfer files between host and container
4. Clean up container

File operations are secondary to code execution. Tool names center on execution: `execute_code`, `create_container`, `transfer_files`.

The node-code-sandbox pattern: "When reading and writing from the Node.js processes, you always need to read from and write to the './files' directory to ensure persistence on the mounted volume."

### Finding: No container/sandbox MCP server mirrors the exact tool surface of Claude Code's native filesystem tools
**Confidence:** CONFIRMED (negative search)
**Evidence:** Comprehensive review of E2B, Daytona, AIO, Docker sandbox, CodeSandbox MCP servers

Every sandbox MCP server examined uses its own domain-specific tool vocabulary:
- E2B: `e2b_read_file`, `e2b_execute_code`
- Daytona: sandbox-management tools
- AIO: file CRUD + shell + browser tools
- Docker sandbox: container lifecycle + code execution

None expose tools named `Read`, `Write`, `Edit`, `Glob`, `Grep` (Claude Code native names) or `read_file`, `write_file`, `edit_file` (MCP filesystem server names) that transparently route to a remote container.

The closest pattern is SSH MCP servers (bvisible/mcp-ssh-manager with 37 tools) that proxy filesystem operations to remote machines, but these expose SSH-specific tool names.

---

## Gaps / follow-ups

- No sandbox MCP server provides a transparent filesystem abstraction — all require the agent to learn sandbox-specific tool vocabulary
- The AIO Sandbox tool reduction (60→30) suggests awareness of tool surface bloat as a problem
- A sandbox MCP server that mirrors native filesystem tools would be a novel contribution
- CodeSandbox does not appear to have a public MCP server (not found in searches)
- Gitpod does not appear to have a public MCP server (not found in searches)
