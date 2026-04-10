---
title: "Virtualized MCP Filesystem Servers: Who Has Built Them, What Patterns Exist, and How Agents Handle Tool Surface Overlap"
description: "Whether anyone has built MCP servers that mirror the native filesystem tool surface of coding agents (Read, Write, Edit, Glob, Grep) but route operations through non-filesystem backends (CRDT, database, vector DB, container). Covers the official MCP filesystem server gap analysis, Mintlify ChromaFs as prior art, container/sandbox MCP patterns, agent tool selection behavior with overlapping tools, and Grep-equivalent MCP implementations."
createdAt: 2026-04-02
updatedAt: 2026-04-02
subjects:
  - Model Context Protocol
  - Claude Code
  - Mintlify ChromaFs
  - E2B
  - Daytona
  - Desktop Commander MCP
  - mcp-ripgrep
  - GitHub MCP Server
  - Replit MCP
  - Obsidian MCP
  - CodeSandbox MCP
  - filesystem-mcp-rs
topics:
  - virtual filesystem MCP
  - agent tool surface overlap
  - filesystem abstraction backends
  - MCP tool design patterns
  - content search MCP tools
  - remote filesystem MCP tools
---

# Virtualized MCP Filesystem Servers: Who Has Built Them, What Patterns Exist, and How Agents Handle Tool Surface Overlap

**Purpose:** Determine whether anyone has built MCP servers that mirror the native filesystem tool surface coding agents expect (Read, Write, Edit, Glob, Grep) while routing operations through a non-filesystem backend, and identify the design patterns that would make such a server feel natural to agents.

---

## Executive Summary

After analyzing the official MCP filesystem server, 11 AI coding agent tool surfaces, 6+ container/sandbox MCP platforms, the Mintlify ChromaFs architecture, the mcp-ripgrep project, Claude Code's tool selection mechanics, and a broad survey of 30+ MCP servers across sandbox, vector DB, knowledge platform, and developer tool categories, the central finding is:

**Multiple MCP servers expose filesystem-named tools (`read_file`, `write_file`, `list_files`, etc.) backed by non-local-filesystem backends, but none target behavioral compatibility with a specific coding agent's native tool conventions.** The original version of this report overstated the gap. Servers like the Replit MCP (7 filesystem tools over GraphQL API), E2B MCP (`e2b_read_file`/`e2b_write_file` over cloud sandbox), GitHub MCP (`get_file_contents`/`create_or_update_file` over REST API), Daytona MCP (7 file tools over sandbox API), and Obsidian MCP servers (`get_file_contents`/`list_files_in_vault` over REST API) all provide filesystem-like operations where the "files" are not on the local disk.

What remains unbuilt is narrower than initially assessed: **one MCP server -- filesystem-mcp-rs -- comes within approximately 8 discrete code changes of full Claude Code behavioral parity.** Source-code analysis (2026-04-02) confirmed its `edit_file` achieves ~90% parity (regex, replaceAll, dryRun, batch edits), `grep_files` achieves ~75-80% (regex, 4 output modes, context lines), and `read_text_file` achieves ~80% (offset/limit pagination, optional line numbers). The remaining gaps are specific: `cat -n` tab separator (it uses pipe), multiline grep, grep offset pagination, grep type filter, glob mtime sorting, edit uniqueness check, and read-before-write enforcement. No other MCP server comes close -- Replit MCP achieves ~20% overall parity and the official MCP filesystem server achieves ~40%.

Mintlify's ChromaFs remains the strongest architectural prior art for the *behavioral fidelity* pattern -- its `IFileSystem` interface maps UNIX commands to Chroma queries while preserving command semantics (exhaustive grep, zero-network-call ls). But ChromaFs is not an MCP server.

The official MCP filesystem server (`@modelcontextprotocol/server-filesystem`) has significant gaps relative to Claude Code's native tools: no content search (grep), no glob-style path matching, different return formats, different edit semantics. Container/sandbox MCP servers use their own domain-specific tool vocabulary but DO provide file read/write operations over non-local backends.

Agent tool selection between native and MCP tools is governed by three factors: (1) tool description quality, (2) implicit priority from pre-loading vs ToolSearch deferral, and (3) CLAUDE.md instructions. There is no deterministic routing mechanism in Claude Code to say "for path X, use MCP tool Y instead of native tool Z."

**Key Findings:**

- **Multiple MCP servers expose filesystem-named tools over non-filesystem backends** (CORRECTED from original). The Replit MCP server uses `read_file`/`write_file`/`list_files` over Replit's GraphQL API. E2B uses `e2b_read_file`/`e2b_write_file` over cloud sandbox. GitHub uses `get_file_contents`/`create_or_update_file` over REST API. Daytona and Obsidian servers follow similar patterns.
- **filesystem-mcp-rs is the closest to Claude Code behavioral parity** (SOURCE-CODE VERIFIED). Its `edit_file` achieves ~90% parity (supports regex, replaceAll, dryRun, batch edits). Its `grep_files` achieves ~75-80% parity (regex, 4 output modes, context lines; missing multiline and offset pagination). Its `read_text_file` achieves ~80% parity (has offset/limit and line numbers; uses pipe separator instead of tab). Approximately 8 discrete code changes would close the remaining gap to full Claude Code behavioral compatibility.
- **Replit MCP is functionally minimal** (SOURCE-CODE VERIFIED). Its `read_file` returns raw content without line numbers (~20% parity). It has NO edit tool, NO regex search, NO glob matching. `search_files` is a plain-string content search via Replit's GraphQL `search` field. All 7 filesystem tools route through GraphQL mutations/queries; authentication is via `connect.sid` cookie.
- **The official MCP filesystem server has no content grep** (SOURCE-CODE VERIFIED). Its `search_files` tool uses `minimatch` glob patterns against file PATHS, not file CONTENTS. This remains the single largest gap. Its `edit_file` supports batch edits with whitespace-tolerant fallback but has NO regex and NO replaceAll option. Overall ~40% parity with Claude Code.
- **No MCP server returns `cat -n` format.** The official server and Replit MCP return raw content. filesystem-mcp-rs with `line_numbers: true` returns `N | content` (pipe separator), not `N\tcontent` (tab separator). This is a narrow but agent-visible difference.
- **Mintlify ChromaFs remains the strongest prior art for behavioral fidelity** -- it preserves command semantics (exhaustive grep, zero-network ls) over a non-filesystem backend, achieving production scale at 30,000+ daily conversations.
- **Claude Code's native tools have implicit priority** over MCP tools due to pre-loading in the system prompt (MCP tools require ToolSearch discovery).
- **Tool descriptions are the primary lever** for guiding agent tool selection. filesystem-mcp-rs goes furthest: its MCP `instructions` field says "ALWAYS use instead of built-in Read/cat" and "PREFERRED over built-in Grep/grep."
- **Grep is the hardest tool to virtualize** over a search index because grep semantics (exhaustive, line-level, regex) differ fundamentally from search index semantics (ranked, document-level, best-effort).
- **Vector DB MCP servers do NOT use filesystem vocabulary.** All major vector DB servers (Chroma, Qdrant, Pinecone, Weaviate, LanceDB) use their native domain vocabulary (collections, documents, embeddings, search).
- **filesystem-mcp-rs has no unified backend abstraction.** Despite supporting local FS, S3, HTTP, and SQLite, each backend has entirely separate tools with different prefixes. There is no common trait/interface. It is a multi-tool server, not a multi-backend filesystem.

---

## Research Rubric

| # | Dimension | Priority | Depth | Status |
|---|-----------|----------|-------|--------|
| D1 | Official MCP filesystem server vs Claude Code native tools | P0 | Deep (Comparative) | CONFIRMED |
| D2 | Virtualized/proxy MCP servers: non-filesystem backends | P0 | Deep (Primary source) | CONFIRMED |
| D3 | Agent behavior with overlapping native + MCP tools | P0 | Deep (Mechanical) | CONFIRMED |
| D4 | Container/sandbox MCP servers | P0 | Deep (Comparative) | CONFIRMED |
| D5 | Tool surface design for "native feel" | P0 | Deep (Practical) | CONFIRMED |
| D6 | Grep-equivalent MCP tools and search alternatives | P0 | Moderate (Comparative) | CONFIRMED |

**Stance:** Factual with conclusions.
**Non-goals:** Building the server, pricing/business models, model quality comparisons, visual editor UX.

---

## Detailed Findings

### D1. The Official MCP Filesystem Server vs Claude Code Native Tools

**Finding:** The official MCP filesystem server exposes 14 tools that partially overlap with Claude Code's native tools, but three critical capabilities are missing: content search (grep), path pattern matching (glob), and command execution (bash).

**Evidence:** [evidence/d1-official-mcp-filesystem-server.md](evidence/d1-official-mcp-filesystem-server.md), [evidence/replit-mcp-filesystem-rs-source-analysis.md](evidence/replit-mcp-filesystem-rs-source-analysis.md)

The [official MCP filesystem server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) (`@modelcontextprotocol/server-filesystem`) provides 14 tools (source-code verified): `read_file` (deprecated), `read_text_file`, `read_media_file`, `read_multiple_files`, `write_file`, `edit_file`, `create_directory`, `list_directory`, `list_directory_with_sizes`, `directory_tree`, `move_file`, `search_files`, `get_file_info`, `list_allowed_directories`. The gap analysis against Claude Code's native tools reveals:

| Capability | Claude Code Native | MCP Filesystem | Gap |
|-----------|-------------------|----------------|-----|
| Read file | `Read(file_path, offset?, limit?)` -- cat -n format | `read_text_file(path, head?, tail?)` -- raw content | Different return formats, pagination models |
| Write file | `Write(file_path, content)` -- requires prior Read | `write_file(path, content)` -- no prerequisite | Session tracking differs |
| Edit file | `Edit(file_path, old_string, new_string, replace_all?)` | `edit_file(path, edits[], dryRun?)` | Single vs batch, no dry run in CC |
| Content search | `Grep(pattern, ...)` -- 13+ params, ripgrep-based | **Not present** | No content grep at all |
| Path search | `Glob(pattern, path?)` -- mtime-sorted | `search_files(path, pattern)` -- path matching | Different semantics |
| Bash execution | `Bash(command, timeout?, ...)` | **Not present** | No equivalent |
| Directory listing | Via Bash `ls` | `list_directory`, `directory_tree` | MCP has more dedicated tools |

The `search_files` tool in the MCP server searches file *paths* by pattern, not file *contents*. This is equivalent to `find`, not `grep`. For coding agent workflows where content search is the most frequent navigation operation, this gap is critical.

The edit semantics also differ materially. Claude Code's `Edit` takes a single `old_string`/`new_string` pair with exact-match-only semantics and a `replace_all` boolean. The MCP `edit_file` takes an array of `{oldText, newText}` edits with optional `dryRun`. An agent trained on Claude Code's Edit conventions would need to adapt.

**Implications:** An MCP server targeting Claude Code agents cannot simply extend the official filesystem server -- it would need to add Grep, Glob, and Bash equivalents, and adjust return formats to match native conventions (especially `cat -n` line numbering).

---

### D2. Virtualized/Proxy MCP Servers: Has Anyone Built One?

**Finding (CORRECTED):** Multiple MCP servers expose filesystem-named tools (`read_file`, `write_file`, `list_files`, `get_file_contents`) while routing operations to non-filesystem backends (Replit API, GitHub API, cloud sandboxes, Obsidian REST API). However, none target behavioral compatibility with a specific coding agent's native tool conventions (Claude Code's cat -n format, exact-match edit semantics, grep richness). The closest prior art for *behavioral fidelity* remains Mintlify's ChromaFs.

**Evidence:** [evidence/d2-virtualized-proxy-mcp-servers.md](evidence/d2-virtualized-proxy-mcp-servers.md), [evidence/d2-virtualized-proxy-correction-2026-04-02.md](evidence/d2-virtualized-proxy-correction-2026-04-02.md), [evidence/replit-mcp-filesystem-rs-source-analysis.md](evidence/replit-mcp-filesystem-rs-source-analysis.md)

#### MCP Servers with Filesystem Tools Over Non-Local Backends

Contrary to the original report's claim, several MCP servers already expose filesystem-like tools backed by non-filesystem storage:

**Tier 1: Standard filesystem tool names over remote backends**

| Server | Tools | Backend | Notes |
|--------|-------|---------|-------|
| [Replit MCP](https://github.com/NOVA-3951/Replit-MCP) | `read_file`, `write_file`, `list_files`, `create_file`, `delete_file`, `create_directory`, `search_files` | Replit GraphQL API | 7 filesystem tools (24 total), standard names, remote backend. Community project (not official Replit). Source-code verified: read returns raw content (no line numbers), search is plain-string content search (not regex), no edit tool exists. ~20% behavioral parity with Claude Code Read. |
| [E2B MCP](https://github.com/e2b-dev/mcp-server) | `e2b_read_file`, `e2b_write_file`, `e2b_download_file`, `e2b_watch_directory` | E2B cloud sandbox | Vendor-prefixed (`e2b_`) but semantically filesystem operations. Files exist in ephemeral cloud sandbox. |

**Tier 2: Filesystem-adjacent tool names over remote backends**

| Server | Tools | Backend | Notes |
|--------|-------|---------|-------|
| [GitHub MCP](https://github.com/github/github-mcp-server) | `get_file_contents`, `create_or_update_file`, `push_files`, `search_code` | GitHub REST API | Official GitHub server. File CRUD over Git blobs. Known SHA issue (#595). |
| [Obsidian MCP](https://github.com/MarkusPfundstein/mcp-obsidian) | `get_file_contents`, `list_files_in_vault`, `list_files_in_dir`, `search`, `patch_content`, `append_content`, `delete_file` | Obsidian REST API | Routes through HTTP API, not direct FS. Multiple implementations exist (16+). |
| [Daytona MCP](https://github.com/daytonaio/daytona) | `list_files`, `delete_file`, `move_file`, `create_folder`, `get_file_info`, `upload_file`, `download_file` | Daytona Sandbox API | Uses transfer vocabulary (upload/download) for read/write. |

**Tier 3: Multi-backend with separate vocabularies**

| Server | Tools | Backend | Notes |
|--------|-------|---------|-------|
| [filesystem-mcp-rs](https://github.com/ssoj13/filesystem-mcp-rs) | `read_text_file`, `write_file`, `edit_file`, `grep_files`, `grep_context`, `search_files`, `edit_lines`, `bulk_edits` + 70 more | Local FS (primary), S3, HTTP, SQLite (feature-gated) | Source-code verified: 80+ tools. Each backend has own prefix; no unified FS interface. But the local FS tools achieve ~75-90% parity with Claude Code on individual tool capabilities. Closest to Claude Code of any MCP server analyzed. |

#### Source-Code-Verified Behavioral Parity (Updated 2026-04-02)

Deep source-code analysis of the Replit MCP, filesystem-mcp-rs, and the official MCP filesystem server reveals that **filesystem-mcp-rs comes significantly closer to Claude Code behavioral parity than initially assessed**, while Replit MCP and the official server remain far from parity:

**filesystem-mcp-rs achieves 75-90% parity per tool:**
- `read_text_file` has `offset`/`limit` pagination and an optional `line_numbers` mode, but uses pipe separator (`N | content`) instead of Claude Code's tab separator (`N\tcontent`). ~80% parity.
- `edit_file` supports `oldText`/`newText` with `replaceAll`, regex via `isRegex`, dry-run, batch edits, and whitespace-tolerant fallback. Actually exceeds Claude Code's Edit in some dimensions (regex, batch). ~90% parity.
- `grep_files` has regex, case-insensitive, context before/after, 4 output modes (content, count, files_with_matches, files_without_match), invert match, file glob filter. Missing: multiline, offset pagination, type filter. ~75-80% parity.
- `search_files` has glob patterns, exclude patterns, file type/size/time filters. Missing: mtime sorting. ~60% parity.
- The server's `instructions` field aggressively tells agents to prefer its tools over built-in Read/Write/Edit/Grep/Glob.

**What still differs from Claude Code behavioral conventions:**
- No MCP server returns content in `cat -n` format (tab-separated line numbers)
- No MCP server enforces read-before-write
- filesystem-mcp-rs's edit replaces the first occurrence by default (Claude Code requires uniqueness unless `replace_all`)
- filesystem-mcp-rs's grep lacks multiline mode and offset pagination
- filesystem-mcp-rs's search does not sort by modification time
- Replit MCP has zero edit capability and only plain-string content search (~20% overall parity)
- The official MCP filesystem server has no content grep at all (~40% overall parity)

The refined gap: **filesystem-mcp-rs closes most of the functional gap but not the behavioral-convention gap.** Approximately 8 discrete changes to filesystem-mcp-rs would achieve near-complete Claude Code behavioral parity (see evidence file for details).

#### Mintlify ChromaFs: Strongest Prior Art for Behavioral Fidelity

[Mintlify's ChromaFs](https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant), announced April 2, 2026, remains the clearest production example of preserving *command-level behavioral fidelity* over a non-filesystem backend:

```
cat /path/file.mdx  -->  Fetch chunks by page slug from Chroma, join by chunk_index
ls /path/            -->  Read from in-memory directory Map (zero network calls)
find ...             -->  Traverse in-memory file tree (zero network calls)
grep pattern         -->  Stage 1: Chroma query (coarse)
                          Stage 2: In-memory regex on cached chunks (fine)
```

Architecture highlights:
- Built on `just-bash` (TypeScript bash reimplementation) with a pluggable `IFileSystem` interface
- File tree stored as gzipped JSON with access control metadata
- In-memory structures: `Set<string>` for paths, `Map<string, string[]>` for directory children
- `ls`, `cd`, `find` resolve with zero network calls
- P90 boot: ~100ms (vs ~46s for sandbox approach, a 460x improvement)
- Supports 30,000+ daily conversations with per-user RBAC

ChromaFs is NOT an MCP server -- it is an internal abstraction. But it demonstrates that behavioral fidelity (exhaustive grep, instant ls, correct file content) can be achieved over a vector database backend.

#### CRDT-Backed MCP Filesystem (Designed, Not Implemented)

Our prior research ([crdt-mcp-filesystem-bridge](../crdt-mcp-filesystem-bridge/)) fully designed a CRDT-backed MCP filesystem server using Hocuspocus DirectConnection and Yjs:

- `read_file(path)` translates to `ytext.toString()` from in-memory CRDT document
- `write_file(path, content)` computes a minimal diff via `fast-diff` and applies as Yjs delta
- `edit_file(path, [{oldText, newText}])` translates to `indexOf` + `ytext.delete` + `ytext.insert`
- All 11 agent edit patterns resolve to the same YText operations
- Concurrent edits preserved (diff-based strategy preserves edits outside changed regions)

This design validates feasibility but no open-source implementation exists.

#### Vector DB MCP Servers: None Use Filesystem Vocabulary

All major vector DB MCP servers use their native domain vocabulary, not filesystem patterns:

| Server | Vocabulary Pattern | Filesystem-Like? |
|--------|-------------------|-----------------|
| [Chroma MCP](https://github.com/chroma-core/chroma-mcp) | `chroma_add_documents`, `chroma_query_documents` | No |
| [Qdrant MCP](https://github.com/qdrant/mcp-server-qdrant) | `qdrant-store`, `qdrant-find` | No |
| [Pinecone MCP](https://github.com/pinecone-io/pinecone-mcp) | `search-docs`, `describe-index-stats` | No |
| [Weaviate MCP](https://github.com/weaviate/mcp-server-weaviate) | `search`, `semantic_search`, `hybrid_search` | No |
| [LanceDB MCP](https://github.com/lancedb/lancedb-mcp-server) | `ingest`, `retrieve`, `search-memories` | No |

**Implications:** Building a filesystem-mimicking MCP server that targets *behavioral compatibility* with a coding agent's native tools would still be a novel contribution. The ChromaFs `IFileSystem` pattern and the CRDT translation layer design provide architectural blueprints. The key differentiator versus existing servers is not "filesystem tool names over a remote backend" (which exists) but "agent-native behavioral conventions over a non-filesystem backend" (which does not).

---

### D3. How Agents Handle Overlapping Native and MCP Filesystem Tools

**Finding:** Claude Code's MCP tools are namespaced as `mcp__<server>__<tool>`, preventing naming collisions with native tools. Native tools have implicit priority via pre-loading. No mechanism exists to deterministically route operations to MCP tools based on path or context -- tool descriptions and CLAUDE.md instructions are the available (but non-deterministic) levers.

**Evidence:** [evidence/d3-agent-tool-selection-overlap.md](evidence/d3-agent-tool-selection-overlap.md)

#### Naming: No Collision by Design

MCP tools use the naming pattern `mcp__<server-name>__<tool-name>`. A filesystem MCP server named "kb" with a `read_file` tool becomes `mcp__kb__read_file`. The agent sees this as fundamentally different from its native `Read` tool.

#### Implicit Priority: Pre-loaded vs Deferred

As of Claude Code v2.1.72+, native tools are pre-loaded (always in context):
- Agent, Bash, Edit, Glob, Grep, Read, Skill, ToolSearch, Write

MCP tools are deferred behind ToolSearch -- the agent must discover them before use. This creates an implicit priority: the native `Read` is always visible and ready; `mcp__kb__read_file` requires a discovery step first.

When `ENABLE_TOOL_SEARCH=false`, both native and MCP tools load upfront, but native tools appear first in the tool list. LLMs tend to prefer tools that appear earlier in context.

#### Available Routing Mechanisms

| Mechanism | Strength | Deterministic? |
|-----------|----------|---------------|
| Tool descriptions | Primary lever -- "Use this to read knowledge base files" | No |
| CLAUDE.md instructions | "For /knowledge/* paths, use mcp__kb__ tools" | No |
| Permission denial | `"deny": ["Read"]` forces MCP alternative | Yes, but global (not path-scoped) |
| MCP ToolAnnotations | Affect permission UX, not selection | No |

There is no path-based routing in Claude Code ("for paths matching /kb/*, use mcp__kb__read_file"). The closest approach is combining CLAUDE.md guidance with clear tool descriptions:

```
# CLAUDE.md
When accessing knowledge base content, use the mcp__kb__ tools (read_file, search, etc.)
instead of native Read/Grep. The knowledge base is not on the local filesystem.
```

Combined with MCP tool descriptions:

```
"Use this tool to read content from the knowledge base. This is NOT the local filesystem
-- content is served from an indexed database. Use this instead of the built-in Read tool
for any path under /knowledge/."
```

This provides a strong signal, but the agent may still reach for native tools when the path looks filesystem-like.

**Implications:** An MCP server competing with native tools should NOT try to mirror native tool names -- the namespacing prevents collision anyway. Instead, the server should clearly differentiate itself through descriptions that explain WHEN and WHY to use it instead of native tools.

---

### D4. Container/Sandbox MCP Servers

**Finding:** No container/sandbox MCP server mirrors the exact tool surface of Claude Code's native filesystem tools. All use domain-specific tool vocabularies. The pattern is "sandbox-management tools" (create sandbox, execute code, transfer files) rather than "transparent filesystem proxy."

**Evidence:** [evidence/d4-container-sandbox-mcp-servers.md](evidence/d4-container-sandbox-mcp-servers.md)

| Platform | Tool Pattern | Filesystem Mirroring? |
|----------|-------------|----------------------|
| [Replit MCP](https://github.com/NOVA-3951/Replit-MCP) | `read_file`, `write_file`, `list_files`, `create_file`, `delete_file`, `create_directory`, `search_files` (7 file tools, 24 total) | **Yes** -- standard filesystem names over Replit GraphQL API |
| [E2B](https://e2b.dev/docs/mcp) | `e2b_read_file`, `e2b_write_file`, `e2b_execute_code`, etc. (15 tools) | Partial -- `e2b_` prefix but filesystem semantics |
| [Daytona](https://www.daytona.io/docs/en/mcp/) | `list_files`, `delete_file`, `move_file`, `create_folder`, `get_file_info`, `upload_file`, `download_file` (7 file tools) | Partial -- some standard names (`list_files`, `delete_file`) but uses upload/download for read/write |
| [CodeSandbox MCP](https://github.com/blakegallagher1/codesandbox-mcp-server) | `write_files_to_sandbox`, `read_github_file`, `create_sandbox_for_project` (5 tools) | No -- sandbox-specific vocabulary |
| [AIO Sandbox](https://github.com/agent-infra/sandbox) | File CRUD + Shell + Browser + Markitdown (30 tools) | Partially -- has file read/write but with sandbox framing |
| Docker code-sandbox-mcp | Container lifecycle + code execution + file transfer | No -- container-management focused |
| SSH MCP servers | Remote command execution + file operations (37 tools) | No -- SSH-specific vocabulary |

The Replit MCP server (community-built, not official Replit) is the most notable finding here: it uses completely standard filesystem tool names (`read_file`, `write_file`, `list_files`) while routing all operations through Replit's GraphQL API to remote cloud environments. This is the closest any existing MCP server comes to "transparent filesystem proxy over a remote backend."

E2B provides complete file operations (`e2b_read_file` with encoding support, file transfer, directory watching), prefixed with `e2b_` and requiring sandbox lifecycle management. The agent must first create a sandbox, then use sandbox-scoped tools.

Daytona's MCP server now exposes 7 file tools including standard names like `list_files` and `delete_file`, but uses transfer vocabulary (`upload_file`/`download_file`) rather than direct access vocabulary (`read_file`/`write_file`) for content operations.

CodeSandbox now has a community MCP server (5 tools), but it uses sandbox-specific vocabulary (`write_files_to_sandbox`) rather than standard filesystem names.

**Platforms without MCP servers:** Gitpod and StackBlitz/WebContainers do not appear to have public MCP servers. GitLab's MCP server exists but does not include file tools.

**Implications:** The "sandbox as transparent filesystem" pattern now partially exists in MCP via the Replit MCP server, which uses standard filesystem tool names over a remote backend. However, none of these servers target behavioral compatibility with a specific coding agent's native tool conventions. The gap has narrowed from "nobody does this" to "nobody does this with agent-native behavioral fidelity."

---

### D5. What Tool Surface Would Make an MCP Server Feel "Native"

**Finding:** An MCP server cannot literally duplicate native tool names (the `mcp__` prefix prevents this), but it can match native tool *behavior* closely enough that the agent uses it naturally. The key is matching five specific conventions: cat -n return format, exact-match edit semantics, grep richness, absolute path conventions, and clear tool descriptions that state when to prefer the MCP tool over native alternatives.

**Evidence:** [evidence/d5-native-feel-tool-surface.md](evidence/d5-native-feel-tool-surface.md)

#### The Minimum Viable Tool Surface

Analysis of 11 AI coding agents confirms convergence around 5 core operations that every agent implements:

1. **Read file** (with line ranges)
2. **Write file** (full replacement)
3. **Edit file** (string replacement)
4. **Search content** (regex grep)
5. **Search paths** (glob/find)

An MCP server implementing these 5 operations with Claude Code-compatible behavior would cover the full interaction surface.

#### Five Conventions to Match

For an MCP server targeting Claude Code specifically:

1. **Return format:** Read should return content with line numbers in `cat -n` format (line number + tab + content, lines starting at 1). This is what Claude Code's native Read returns and what the agent expects for subsequent Edit operations.

2. **Edit semantics:** Accept `old_string`/`new_string` with exact-match-only semantics. Reject if `old_string` is not found. Reject if `old_string` matches multiple times (unless `replace_all` is true). This matches Claude Code's Edit behavior.

3. **Grep richness:** Support output modes (content, files_with_matches, count), context lines (-A, -B, -C), glob/type filters, and pagination (head_limit, offset). Basic pattern search is insufficient.

4. **Path conventions:** Accept and return absolute paths. Glob results sorted by modification time.

5. **Tool descriptions:** Explicitly state when to use this MCP tool instead of native alternatives. Research shows tool descriptions serve as "requirement-like specifications AND prompt-like instructions" that shape model reasoning (97.1% of MCP tool descriptions have quality issues -- this is an opportunity to differentiate).

#### Strategy: Differentiate, Don't Duplicate

Given that MCP tools are always namespaced (`mcp__kb__read_file` vs `Read`), the agent will always see them as different tools. Rather than trying to be identical to native tools (impossible), the server should:

1. **Match behavioral conventions** (return formats, edit semantics) so the agent can transfer learned patterns
2. **Clearly differentiate scope** in descriptions ("for knowledge base content, not local files")
3. **Provide capabilities native tools lack** (e.g., semantic search alongside regex grep, access-controlled content, pre-indexed search)

This turns the MCP server from "worse native tool" into "specialized tool for a specific domain."

---

### D6. Grep-Equivalent MCP Tools and Search-Backed Alternatives

**Finding:** [mcollina/mcp-ripgrep](https://github.com/mcollina/mcp-ripgrep) is the most complete Grep-equivalent MCP server, with 16+ parameters on its `advanced-search` tool. However, no MCP server implements grep over a search index. Grep-over-search-index faces a fundamental semantic mismatch between exhaustive regex matching and ranked document retrieval, addressable via a two-stage approach (ChromaFs-proven).

**Evidence:** [evidence/d6-grep-equivalent-mcp-tools.md](evidence/d6-grep-equivalent-mcp-tools.md)

#### Existing MCP Grep Tools

| MCP Server | Tools | Richness vs Claude Code Grep |
|-----------|-------|------------------------------|
| mcollina/mcp-ripgrep | search, advanced-search, count-matches, list-files, list-file-types | ~80% parity (missing multiline, pagination model) |
| Official MCP filesystem | search_files | 0% -- searches paths, not content |
| Desktop Commander | search_files | Low -- basic pattern matching |

The mcp-ripgrep `advanced-search` tool supports 16+ parameters including case sensitivity, file type filtering, fixed strings, word matching, invert matching, hidden files, symlinks, context lines, and line numbers. It is the closest MCP equivalent to Claude Code's native Grep.

Missing from mcp-ripgrep vs Claude Code's Grep:
- `multiline` mode (`.` matches newlines, patterns span lines)
- Pagination model (`head_limit` default 250, `offset` for windowing)
- Separate `-A`/`-B`/`-C` context line parameters (mcp-ripgrep uses single `context`)
- `glob` filter parameter name differs (`filePattern` vs `glob`)

#### The Search-Index Grep Tradeoff

| Aspect | Traditional Grep (ripgrep) | Search-Index Grep (Orama/Typesense) |
|--------|---------------------------|--------------------------------------|
| Match guarantee | Exhaustive -- finds ALL matches | Best-effort -- depends on index coverage |
| Result format | Line-by-line with context | Document/chunk-level with relevance score |
| Pattern support | Full regex | Limited (full-text + vector similarity) |
| Freshness | Always current (reads files directly) | Depends on index freshness |
| Performance | Linear scan | Sub-linear lookup |
| Ranking | No ranking (all matches equal) | Ranked by relevance |

For a knowledge platform where content is already indexed in Orama, a search-backed grep would be faster but semantically different from what agents expect from grep.

#### The Two-Stage Approach (ChromaFs-Proven)

ChromaFs solved this with two-stage filtering:
1. **Coarse filter (index):** Search index query identifies candidate documents matching the pattern
2. **Fine filter (regex):** Precise regex executed on fetched content for exact line-level results

This preserves grep semantics (exhaustive regex, line-level results with context) while leveraging the search index for performance. The approach is proven in production at 30,000+ daily conversations.

An MCP tool implementing this pattern would:
1. Accept the same parameters as Claude Code's Grep (pattern, path, output_mode, context, etc.)
2. Use the search index for coarse filtering (fast candidate identification)
3. Fetch full content for matching documents
4. Run actual regex matching for precise results
5. Return results in grep-compatible format (line numbers, context lines)

**Implications:** Implementing Grep over a search index is feasible with the two-stage approach. The MCP tool should present grep-compatible semantics to the agent (regex, line-level, exhaustive) while using the search index as an optimization layer rather than a replacement for regex.

---

## Landscape Summary

```
               Claude Code Behavioral Parity Spectrum
               =======================================
               (Source-code verified, 2026-04-02)

  0%           20%           40%           60%           80%          100%
  |-------------|-------------|-------------|-------------|-------------|
  ^             ^             ^                           ^
  Replit MCP    Official MCP  |                           filesystem-mcp-rs
  (24 tools,    Filesystem    |                           (80+ tools, Rust)
   7 FS tools,  (14 tools,    |                           Edit: ~90%
   GraphQL)     no grep)      |                           Grep: ~75-80%
  No edit,      No grep,      |                           Read: ~80%
  no regex,     no line nums, |                           Search: ~60%
  raw content   no regex edit |                           ~8 changes to 100%
                              |
                              Mintlify ChromaFs
                              (not MCP, but proven
                               behavioral fidelity
                               over Chroma DB)

  WHAT'S MISSING FROM THE BEST (filesystem-mcp-rs):
  +------------------------------------------------+
  | 1. cat -n tab separator (has pipe separator)   |
  | 2. Multiline grep mode                         |
  | 3. Grep offset pagination                      |
  | 4. Grep -C shorthand                           |
  | 5. Grep type filter (by language name)         |
  | 6. Glob mtime sorting                          |
  | 7. Edit uniqueness check                       |
  | 8. Read-before-write enforcement               |
  +------------------------------------------------+

  NON-FS BACKEND + FS NAMES         NON-FS BACKEND + OWN VOCAB
  +---------------------------+     +---------------------------+
  | Replit MCP (GraphQL)      |     | Daytona (upload/download) |
  | E2B (cloud sandbox)       |     | CodeSandbox (sandbox ops) |
  | GitHub (REST API)         |     | AIO Sandbox               |
  | Obsidian (HTTP API)       |     | Docker code-sandbox       |
  +---------------------------+     +---------------------------+

  VECTOR DB (OWN VOCABULARY)         AGENT TOOL SELECTION
  +---------------------------+     +---------------------------+
  | Chroma: add/query docs    |     | Native tools: pre-loaded  |
  | Qdrant: store/find        |     | MCP tools: deferred       |
  | Pinecone: search-docs     |     | No path-based routing     |
  | Weaviate: hybrid_search   |     | Description = main lever  |
  | LanceDB: ingest/retrieve  |     | filesystem-mcp-rs uses    |
  +---------------------------+     |  aggressive instructions  |
                                    +---------------------------+
```

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Agent behavior with exact tool surface mirrors:** No empirical testing exists on what happens when an MCP server precisely matches native tool behavior (return formats, edit semantics). The prediction that agents would use MCP tools naturally with good descriptions is inferred, not confirmed.
- **CLAUDE.md routing reliability:** Whether CLAUDE.md instructions like "use mcp__kb__ tools for knowledge content" are reliably followed has not been measured.
- **Replit MCP server reliability:** The Replit MCP server (NOVA-3951) is a community project, not official Replit. Source code confirms it uses GraphQL API only (not Crosis). The implementation is minimal (~814 lines in the client).
- **~~Behavioral convention matching:~~** (RESOLVED) Source-code analysis confirmed: Replit MCP's `read_file` returns raw content without line numbers (~20% parity). filesystem-mcp-rs's `read_text_file` with `line_numbers: true` returns pipe-separated format (~80% parity). Neither matches `cat -n`. See evidence file for exact response formats.
- **filesystem-mcp-rs backend abstraction:** Source code confirmed there is NO unified filesystem trait across backends. S3, HTTP, and memory tools are completely separate from local FS tools. This is a multi-tool server, not a multi-backend filesystem abstraction.
- **filesystem-mcp-rs tool preference signaling:** The server injects aggressive "ALWAYS use instead of built-in" instructions via the MCP `instructions` field. Whether this actually overrides Claude Code's native tool preference has not been tested empirically.

### Out of Scope (per Rubric)

- Building the MCP server implementation
- Pricing and business model analysis
- Model quality comparisons
- Visual editor UX design

---

## References

### Evidence Files
- [evidence/d1-official-mcp-filesystem-server.md](evidence/d1-official-mcp-filesystem-server.md) -- Official MCP filesystem server gap analysis vs Claude Code native tools
- [evidence/d2-virtualized-proxy-mcp-servers.md](evidence/d2-virtualized-proxy-mcp-servers.md) -- Mintlify ChromaFs, CRDT design, and negative search for virtualized MCP servers
- [evidence/d2-virtualized-proxy-correction-2026-04-02.md](evidence/d2-virtualized-proxy-correction-2026-04-02.md) -- **CORRECTIVE UPDATE:** MCP servers with filesystem-named tools over non-filesystem backends (Replit, GitHub, E2B, Daytona, Obsidian, CodeSandbox, vector DBs, and 15+ negative searches)
- [evidence/d3-agent-tool-selection-overlap.md](evidence/d3-agent-tool-selection-overlap.md) -- Agent behavior with overlapping native and MCP tools
- [evidence/d4-container-sandbox-mcp-servers.md](evidence/d4-container-sandbox-mcp-servers.md) -- E2B, Daytona, AIO Sandbox, Docker sandbox MCP servers
- [evidence/d5-native-feel-tool-surface.md](evidence/d5-native-feel-tool-surface.md) -- Tool surface design for native feel
- [evidence/d6-grep-equivalent-mcp-tools.md](evidence/d6-grep-equivalent-mcp-tools.md) -- Grep-equivalent MCP tools and search-backed alternatives
- [evidence/replit-mcp-filesystem-rs-source-analysis.md](evidence/replit-mcp-filesystem-rs-source-analysis.md) -- **SOURCE CODE ANALYSIS:** Deep tool-by-tool comparison of Replit MCP (24 tools, GraphQL), filesystem-mcp-rs (80+ tools, Rust), and official MCP filesystem server (14 tools, TypeScript) against Claude Code native tools

### External Sources
- [Official MCP Filesystem Server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) -- Anthropic's reference filesystem MCP implementation
- [Mintlify ChromaFs Blog Post](https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant) -- How Mintlify built a virtual filesystem over Chroma DB (April 2026)
- [mcollina/mcp-ripgrep](https://github.com/mcollina/mcp-ripgrep) -- Matteo Collina's ripgrep MCP wrapper
- [MCP Tool Description Quality (arxiv)](https://arxiv.org/html/2602.14878v1) -- Research on tool description impact on agent behavior (February 2026)
- [MCP Tool Annotations Blog](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/) -- How tool annotations affect agent behavior
- [Claude Code System Prompts](https://github.com/Piebald-AI/claude-code-system-prompts) -- Analysis of Claude Code's tool definitions
- [Claude Code ToolSearch Issue #31002](https://github.com/anthropics/claude-code/issues/31002) -- Built-in tools deferred behind ToolSearch
- [E2B MCP Server](https://github.com/e2b-dev/mcp-server) -- E2B sandbox MCP server (e2b_read_file, e2b_write_file over cloud sandbox)
- [Daytona MCP Server](https://github.com/daytonaio/daytona/tree/main/apps/cli/mcp) -- Daytona sandbox MCP server (list_files, upload_file, download_file over sandbox API)
- [filesystem-mcp-rs](https://github.com/ssoj13/filesystem-mcp-rs) -- Rust port of MCP filesystem server with 80+ tools including grep, edit with regex, search with extended filters, S3/HTTP/memory backends
- [Replit MCP](https://github.com/NOVA-3951/Replit-MCP) -- Community MCP server for Replit (24 tools, 7 filesystem tools over GraphQL API)
- [AIO Sandbox](https://github.com/agent-infra/sandbox) -- ByteDance-affiliated all-in-one agent sandbox
- [Desktop Commander MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP) -- Terminal + filesystem MCP server
- [cyanheads/filesystem-mcp-server](https://github.com/cyanheads/filesystem-mcp-server) -- Enhanced filesystem MCP with virtual path mapping
- [GitHub MCP Server](https://github.com/github/github-mcp-server) -- Official GitHub MCP with get_file_contents/create_or_update_file over GitHub REST API
- [Obsidian MCP Server](https://github.com/MarkusPfundstein/mcp-obsidian) -- get_file_contents/list_files_in_vault over Obsidian REST API
- [MCPVault](https://github.com/bitbonsai/mcpvault) -- Obsidian vault MCP with read_note/write_note/list_files (14 tools)
- [CodeSandbox MCP Server](https://github.com/blakegallagher1/codesandbox-mcp-server) -- write_files_to_sandbox/read_github_file over CodeSandbox + GitHub APIs
- [Chroma MCP Server](https://github.com/chroma-core/chroma-mcp) -- Official Chroma MCP (collection/document vocabulary, not filesystem)
- [Qdrant MCP Server](https://github.com/qdrant/mcp-server-qdrant) -- Official Qdrant MCP (store/find vocabulary)
- [Pinecone MCP Server](https://github.com/pinecone-io/pinecone-mcp) -- Official Pinecone MCP (search-docs, index operations)
- [Weaviate MCP Server](https://github.com/weaviate/mcp-server-weaviate) -- Official Weaviate MCP (semantic/hybrid search)
- [LanceDB MCP Server](https://github.com/lancedb/lancedb-mcp-server) -- Official LanceDB MCP (ingest/retrieve)

### Related Research
- [crdt-mcp-filesystem-bridge](../crdt-mcp-filesystem-bridge/) -- Complete design for CRDT-backed MCP filesystem translation layer (Hocuspocus + Yjs)
- [ai-coding-agent-tool-surfaces](../ai-coding-agent-tool-surfaces/) -- Exact tool surfaces of 11 AI coding agents (Read, Write, Edit, Grep, Glob parameters and behaviors)
- [mcp-tool-discovery-by-agents](../mcp-tool-discovery-by-agents/) -- How agent runtimes discover MCP tools via tools/list
- [mcp-consumption-dx-patterns](../mcp-consumption-dx-patterns/) -- DX patterns for MCP consumption across agent platforms
