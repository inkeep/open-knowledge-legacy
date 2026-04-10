# Evidence: Corrective — MCP Servers with Filesystem-Like Tools Over Non-Filesystem Backends

**Dimension:** D2 (Virtualized/Proxy MCP Servers)
**Date:** 2026-04-02
**Update type:** Corrective
**Sources:** GitHub repos, official docs, MCP registries, web research

---

## Summary of Correction

The original report claimed: "No MCP server exists that exposes filesystem tool names while routing operations to a non-filesystem backend."

This claim requires significant qualification. Multiple MCP servers expose filesystem-like tool names (`read_file`, `write_file`, `list_files`, `get_file_contents`, `create_file`, `delete_file`) where the backend is NOT the local filesystem. The corrected finding is: **No one has built an MCP server that mirrors the EXACT tool surface of a specific coding agent (Claude Code's Read/Write/Edit/Grep/Glob) over a non-filesystem backend. However, many MCP servers expose filesystem-named tools backed by remote/non-local storage.**

The distinction matters: the original claim was overly broad ("no MCP server exists that exposes filesystem tool names while routing to a non-filesystem backend"). The accurate claim is narrower: no one has built a server targeting *agent-native tool behavioral compatibility* (cat -n format, exact-match edit semantics, grep richness).

---

## Key files / pages referenced

- https://github.com/NOVA-3951/Replit-MCP — Replit MCP server with `read_file`, `write_file`, `list_files`, etc. over Replit API
- https://github.com/github/github-mcp-server — GitHub MCP server with `get_file_contents`, `create_or_update_file`, `push_files` over GitHub API
- https://github.com/daytonaio/daytona/tree/main/apps/cli/mcp — Daytona MCP with `upload_file`, `download_file`, `list_files`, `create_folder`, etc. over sandbox API
- https://github.com/e2b-dev/mcp-server — E2B MCP with `e2b_read_file`, `e2b_write_file` over sandbox runtime
- https://github.com/MarkusPfundstein/mcp-obsidian — Obsidian MCP with `get_file_contents`, `list_files_in_vault`, `list_files_in_dir` over Obsidian REST API
- https://github.com/bitbonsai/mcpvault — MCPVault with `read_note`, `write_note`, `delete_note`, `move_file` over Obsidian REST API
- https://github.com/ssoj13/filesystem-mcp-rs — Rust filesystem MCP with S3, HTTP, and memory backends
- https://github.com/blakegallagher1/codesandbox-mcp-server — CodeSandbox MCP with `write_files_to_sandbox`, `read_github_file`
- https://github.com/chroma-core/chroma-mcp — Chroma MCP (uses collection/document vocabulary, NOT filesystem)
- https://github.com/qdrant/mcp-server-qdrant — Qdrant MCP (uses store/find vocabulary, NOT filesystem)

---

## Findings

### Finding 1: Replit MCP Server — Full Filesystem Tool Surface Over Remote API

**Confidence:** CONFIRMED
**Evidence:** https://github.com/NOVA-3951/Replit-MCP (README, tool list)

The Replit MCP server (NOVA-3951/Replit-MCP) exposes 7 filesystem tools that use standard filesystem vocabulary:

| Tool | Description | Backend |
|------|-------------|---------|
| `read_file` | Read file content | Replit GraphQL API (remote) |
| `write_file` | Write file content | Replit GraphQL API (remote) |
| `list_files` | List directory contents | Replit GraphQL API (remote) |
| `create_file` | Create new file | Replit GraphQL API (remote) |
| `delete_file` | Delete a file | Replit GraphQL API (remote) |
| `create_directory` | Create directory | Replit GraphQL API (remote) |
| `search_files` | Search for files | Replit GraphQL API (remote) |

This is a direct counterexample to the original claim. The tool names are standard filesystem operations (`read_file`, `write_file`, etc.), and the backend is Replit's remote environment accessed via GraphQL API — not the local filesystem. The files live in Replit's cloud infrastructure.

Authentication is via `REPLIT_TOKEN` (connect.sid cookie). The server provides 24 total tools spanning user management, repl management, file operations, environment variables, and deployments.

**Implications:** This is the most complete example of an MCP server using standard filesystem tool names while routing to a non-filesystem backend. However, it does NOT match Claude Code's specific tool conventions (no cat -n format, no Edit with old_string/new_string semantics, no Grep-style content search).


### Finding 2: GitHub MCP Server — File CRUD Over GitHub API

**Confidence:** CONFIRMED
**Evidence:** https://github.com/github/github-mcp-server (README, issues)

GitHub's official MCP server exposes file content tools that mirror filesystem operations:

| Tool | Description | Backend |
|------|-------------|---------|
| `get_file_contents` | Get contents of a file or directory | GitHub REST API |
| `create_or_update_file` | Create or update a single file | GitHub REST API |
| `push_files` | Push multiple files | GitHub REST API |
| `search_code` | Search within code | GitHub REST API |

These tools use filesystem-adjacent vocabulary (`get_file_contents`, `create_or_update_file`) while operating entirely over GitHub's REST API. There is no local filesystem involved — the "files" are blobs in Git repositories stored on GitHub's servers.

Known issue: `get_file_contents` does not return the SHA hash needed by `create_or_update_file`, creating a friction point (GitHub issue #595).

The server has additional tools across issues, PRs, repos, and users (total tool count varies by enabled toolsets). Tool-specific configuration allows enabling/disabling individual tools.

**Implications:** This is a widely-used MCP server (GitHub's official) that presents file read/write capabilities over a non-filesystem backend. The vocabulary is filesystem-adjacent but not filesystem-identical (e.g., `get_file_contents` not `read_file`).


### Finding 3: Daytona MCP Server — Filesystem Operations Over Sandbox API

**Confidence:** CONFIRMED
**Evidence:** https://github.com/daytonaio/daytona/tree/main/apps/cli/mcp (README)

Daytona's MCP server exposes these file tools over its sandbox API:

| Tool | Description | Backend |
|------|-------------|---------|
| `upload_file` | Transfer files into sandbox | Daytona Sandbox API |
| `download_file` | Retrieve files from sandbox | Daytona Sandbox API |
| `create_folder` | Create directories | Daytona Sandbox API |
| `get_file_info` | Retrieve file metadata | Daytona Sandbox API |
| `list_files` | Enumerate directory contents | Daytona Sandbox API |
| `move_file` | Rename/relocate files | Daytona Sandbox API |
| `delete_file` | Remove files/directories | Daytona Sandbox API |

The vocabulary is partially filesystem-standard (`list_files`, `delete_file`, `move_file`) but uses upload/download terminology for read/write rather than `read_file`/`write_file`. The backend is Daytona's sandboxed environment accessed via API, not local disk.

**Implications:** Filesystem-like but uses transfer vocabulary (upload/download) rather than direct access vocabulary (read/write). This is a "file management over remote environment" pattern.


### Finding 4: E2B MCP Server — Prefixed Filesystem Tools Over Sandbox Runtime

**Confidence:** CONFIRMED
**Evidence:** https://e2b.dev/docs/mcp, https://github.com/e2b-dev/mcp-server

E2B MCP server exposes ~15 tools including:

| Tool | Description | Backend |
|------|-------------|---------|
| `e2b_read_file` | Read file from sandbox | E2B Sandbox Runtime |
| `e2b_write_file` | Write file to sandbox | E2B Sandbox Runtime |
| `e2b_download_file` | Download file locally | E2B Sandbox Runtime |
| `e2b_watch_directory` | Monitor directory events | E2B Sandbox Runtime |
| `e2b_execute_code` | Execute code in sandbox | E2B Sandbox Runtime |
| `e2b_create_sandbox` | Create new sandbox | E2B Sandbox Runtime |

The tool names use the `e2b_` prefix followed by standard filesystem operations (`read_file`, `write_file`). Files exist inside E2B's ephemeral cloud sandbox — NOT on the local filesystem. The naming convention follows `<vendor>_<operation>`.

**Implications:** This IS an MCP server with read_file/write_file backed by a non-filesystem backend (cloud sandbox). The `e2b_` prefix differentiates it from local filesystem tools but the operation semantics are filesystem-standard.


### Finding 5: Obsidian MCP Servers — File Tools Over REST API

**Confidence:** CONFIRMED
**Evidence:** https://github.com/MarkusPfundstein/mcp-obsidian, https://github.com/bitbonsai/mcpvault

Multiple Obsidian MCP servers expose filesystem-vocabulary tools where the actual backend is the Obsidian Local REST API (HTTP), not direct filesystem access:

MarkusPfundstein/mcp-obsidian:
| Tool | Description | Backend |
|------|-------------|---------|
| `get_file_contents` | Get file content | Obsidian REST API |
| `list_files_in_vault` | List all vault files | Obsidian REST API |
| `list_files_in_dir` | List directory contents | Obsidian REST API |
| `search` | Search across all files | Obsidian REST API |
| `patch_content` | Insert/modify content | Obsidian REST API |
| `append_content` | Append to file | Obsidian REST API |
| `delete_file` | Delete file/directory | Obsidian REST API |

bitbonsai/mcpvault (14 tools):
- `read_note`, `write_note`, `patch_note`, `delete_note`, `move_note`, `move_file`
- `search_vault`, `list_files`, `get_tags`, `get_frontmatter`

While the Obsidian vault IS ultimately stored on the local filesystem, the MCP server does NOT access it directly — it routes through the Obsidian REST API plugin (HTTP). The API provides access control, format conversion, and abstraction that makes it a non-trivial middleware layer.

**Implications:** Partially matches the virtualized pattern — the backend IS a filesystem underneath, but the MCP tools route through an HTTP API layer, not direct FS access.


### Finding 6: filesystem-mcp-rs — Multi-Backend MCP Filesystem Including S3

**Confidence:** CONFIRMED
**Evidence:** https://github.com/ssoj13/filesystem-mcp-rs (README)

This Rust-based MCP filesystem server supports multiple backends:

| Backend | Tool Prefix | Operations |
|---------|-------------|------------|
| Local FS | (standard) | read_file, write_file, etc. |
| S3/Compatible | `s3_` | s3_list_buckets, s3_list, s3_stat, s3_get, s3_put, s3_delete, s3_copy, s3_presign |
| HTTP/HTTPS | `http_` | http_request, http_download, etc. |
| Memory (SQLite) | `mem_` | mem_put, mem_update, mem_search, mem_get |

This IS an MCP server that provides filesystem-like operations over non-filesystem backends (S3, HTTP, SQLite memory). However, the S3 tools use S3-specific vocabulary (s3_get, s3_put) rather than mapping to standard filesystem names (read_file, write_file).

Each backend has its own tool prefix and vocabulary rather than presenting a unified filesystem interface.

**Implications:** Demonstrates multi-backend MCP servers exist. However, each backend uses its own tool vocabulary rather than presenting a unified "virtual filesystem" interface. This is "multiple backends exposed separately" not "filesystem abstraction over backends."


### Finding 7: CodeSandbox MCP Server — File Operations Over Sandbox API

**Confidence:** CONFIRMED
**Evidence:** https://github.com/blakegallagher1/codesandbox-mcp-server (README)

The CodeSandbox MCP server exposes 5 tools:

| Tool | Description | Backend |
|------|-------------|---------|
| `create_sandbox_for_project` | Create sandbox with template | CodeSandbox API |
| `write_files_to_sandbox` | Write/update files in sandbox | CodeSandbox API |
| `get_sandbox_output` | Retrieve console/build output | CodeSandbox API |
| `commit_and_push_to_github` | Push files to GitHub | GitHub API |
| `read_github_file` | Read file from repo | GitHub API |

Uses sandbox-specific vocabulary (`write_files_to_sandbox`) rather than standard filesystem names.


### Finding 8: Vector DB MCP Servers — Do NOT Use Filesystem Vocabulary

**Confidence:** CONFIRMED
**Evidence:** https://github.com/chroma-core/chroma-mcp, https://github.com/qdrant/mcp-server-qdrant, Pinecone/Weaviate/LanceDB docs

None of the major vector DB MCP servers use filesystem vocabulary:

| Server | Vocabulary | Pattern |
|--------|-----------|---------|
| Chroma MCP | `chroma_add_documents`, `chroma_query_documents`, `chroma_get_documents` | Collection/document |
| Qdrant MCP | `qdrant-store`, `qdrant-find` | Store/find |
| Pinecone MCP | `search-docs`, `describe-index-stats` | Index/search |
| Weaviate MCP | `search`, `semantic_search`, `hybrid_search`, `get_collection_objects` | Collection/search |
| LanceDB MCP | `ingest`, `retrieve`, `search-memories` | Ingest/retrieve |

All use their native domain vocabulary. None present a filesystem-like interface.


### Finding 9: Other Platforms — Negative Searches

**Confidence:** NOT FOUND (for filesystem-like MCP)

| Platform | MCP Server Exists? | Filesystem-Like Tools? | Notes |
|----------|-------------------|------------------------|-------|
| v0 (Vercel) | Yes (mcp.v0.dev) | No | Chat management tools only (generate, list_chats, get_chat, delete_chat, deploy) |
| Vercel MCP | Yes (mcp.vercel.com) | No | Docs search, project metadata. Read-only. No file ops. |
| GitLab MCP | Yes (official) | No | Issues, MRs, pipelines, search. No file tools. |
| Fly.io MCP | Yes (experimental) | No | App/machine/volume management. No file ops. |
| Modal MCP | Yes (community) | No | Deploy/execute functions. No file ops. |
| Gitpod | No public MCP | N/A | No MCP server found. |
| StackBlitz/WebContainers | No public MCP | N/A | No MCP server found. |
| Perplexity MCP | Yes (official) | No | Web search tools only. |
| Browserbase MCP | Yes (official) | No | Browser automation (navigate, act, observe). |
| Kubernetes MCP | Yes (multiple) | Partial | `pods_exec` can run filesystem commands inside pods, but no dedicated read_file/write_file tools. |
| Docker MCP Toolkit | Yes | Via filesystem MCP | Runs standard filesystem MCP inside containers. Still routes to local FS inside container. |

---

## Negative searches

* Searched: "virtual filesystem MCP server" across Smithery.ai, mcp.so, npm — all results were local filesystem servers
* Searched: "database as filesystem MCP" — no results
* Searched: "vector DB filesystem interface MCP" — no results
* Searched: S3 MCP servers for filesystem-named tools — S3 servers use their own vocabulary (s3_get, s3_put)

---

## Classification of Non-Local-FS MCP Servers Found

### Tier 1: Standard filesystem tool names over non-local backend (STRONGEST counterexamples)

1. **Replit MCP** — `read_file`, `write_file`, `list_files`, `create_file`, `delete_file`, `create_directory`, `search_files` over Replit GraphQL API
2. **E2B MCP** — `e2b_read_file`, `e2b_write_file` over cloud sandbox (prefixed but semantically filesystem)

### Tier 2: Filesystem-adjacent tool names over non-local backend

3. **GitHub MCP** — `get_file_contents`, `create_or_update_file`, `push_files` over GitHub REST API
4. **Obsidian MCP servers** — `get_file_contents`, `list_files_in_vault`, `list_files_in_dir`, `delete_file` over Obsidian REST API
5. **Daytona MCP** — `list_files`, `delete_file`, `move_file`, `create_folder` (plus `upload_file`/`download_file`) over sandbox API

### Tier 3: Multi-backend but separate vocabularies per backend

6. **filesystem-mcp-rs** — Local FS + S3 + HTTP + Memory, each with own prefixed tools

### Not filesystem-like

7. All vector DB MCP servers (Chroma, Qdrant, Pinecone, Weaviate, LanceDB)
8. v0, Vercel, GitLab, Fly.io, Modal, Perplexity, Browserbase

---

## Gaps / follow-ups

* The Replit MCP server (NOVA-3951) is a community project, not an official Replit server. Its reliability and completeness should be verified against Replit's API capabilities.
* E2B's tool list may have additional file tools not surfaced in web searches — the SDK docs reference `files.read()` and `files.write()` which may have additional MCP tool wrappers.
* Whether any of these servers match Claude Code's specific behavioral conventions (cat -n format, exact-match edit, grep richness) has not been verified.
