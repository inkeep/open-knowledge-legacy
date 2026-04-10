# Evidence: Virtualized/Proxy MCP Servers

**Dimension:** D2 — MCP servers that ACT like a filesystem but route to a different backend
**Date:** 2026-04-02
**Sources:** Mintlify ChromaFs blog post, prior report (crdt-mcp-filesystem-bridge), GitHub repos, web research

---

## Key files / pages referenced

- https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant — ChromaFs architecture
- Prior report: `crdt-mcp-filesystem-bridge/REPORT.md` — CRDT-backed MCP filesystem translation layer design
- https://github.com/txn2/mcp-s3 — S3-backed MCP server
- https://github.com/cyanheads/filesystem-mcp-server — Enhanced filesystem MCP with virtual path mapping
- https://github.com/agent-infra/sandbox — AIO Sandbox (ByteDance-affiliated)

---

## Findings

### Finding: Mintlify ChromaFs is the clearest production example of a virtual filesystem over a non-filesystem backend
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant (published April 2, 2026)

ChromaFs intercepts UNIX commands and translates them to Chroma vector DB queries:

| UNIX Command | ChromaFs Translation |
|-------------|---------------------|
| `cat /path/file.mdx` | Fetch all chunks with matching page slug, sort by chunk_index, join into full page |
| `ls /path/` | Read from in-memory directory→children Map (no network call) |
| `find ...` | Traverse in-memory file tree (no network call) |
| `cd /path/` | Change working directory pointer (in-memory) |
| `grep pattern` | Two-stage: (1) Chroma query for candidate files, (2) in-memory regex on cached chunks |

Architecture:
- Built on `just-bash` (TypeScript bash reimplementation) with pluggable `IFileSystem` interface
- File tree stored as gzipped JSON: `{"auth/oauth": {"isPublic": true, "groups": []}, ...}`
- In-memory: `Set<string>` for file paths, `Map<string, string[]>` for directory children
- `ls`, `cd`, `find` resolve in local memory with zero network calls
- `cat` fetches chunks from Chroma, joins by chunk_index
- `grep` uses two-stage coarse (Chroma) + fine (in-memory regex) filtering

Performance:
- P90 boot: ~100ms (vs ~46s for prior sandbox approach — 460x improvement)
- Marginal per-conversation cost: ~$0 (reuses existing DB)
- Supports 30,000+ daily conversations
- Per-user RBAC via file tree pruning before initialization

**Key insight:** ChromaFs is NOT an MCP server — it's a FUSE-like abstraction layer used by Mintlify's internal agent. However, the pattern (virtual filesystem interface over indexed database) maps directly to MCP tool design.

### Finding: No production MCP server with filesystem tool names routing to a non-filesystem backend was found
**Confidence:** CONFIRMED (negative search)
**Evidence:** Web searches across GitHub, MCP registries, npm, community forums

Searched:
- "MCP server virtual filesystem CRDT database backend proxy" — no results
- "MCP server" + "read_file write_file edit_file" + "virtual" + "database" — no results
- GitHub search for MCP servers implementing read_file/write_file over non-filesystem backends — no results
- MCP server registries (mcpservers.org, mcp.so, PulseMCP, Glama) — no virtual filesystem servers found

All existing MCP filesystem servers route to the actual local filesystem. The closest alternatives are:
1. S3 MCP servers — expose S3 object storage as tools, but with S3-specific tool names (not filesystem tool names)
2. Database MCP servers — expose SQL/NoSQL queries, not filesystem operations
3. ChromaFs — uses filesystem metaphor but is not MCP-based

### Finding: The CRDT-backed MCP filesystem server pattern has been designed but not implemented as open source
**Confidence:** CONFIRMED
**Evidence:** Prior report `crdt-mcp-filesystem-bridge/REPORT.md` (March 2026)

The prior research fully designed a CRDT-backed MCP filesystem server that:
- Translates `read_file(path)` → `ytext.toString()` from Hocuspocus DirectConnection
- Translates `write_file(path, content)` → diff-based minimal Yjs operations
- Translates `edit_file(path, [{oldText, newText}])` → indexOf + YText delete/insert
- Uses fast-diff for concurrent-edit-safe translation (Option C)
- Handles all 11 agent edit patterns

This is the most complete design for a virtualized MCP filesystem, but no open-source implementation exists yet.

### Finding: S3 MCP servers provide filesystem-like operations but with different tool names
**Confidence:** CONFIRMED
**Evidence:** https://github.com/txn2/mcp-s3, AWS S3 MCP servers

S3 MCP servers expose tools like:
- `list_buckets`, `list_objects` (not `list_directory`)
- `read_object`, `write_object` (not `read_file`, `write_file`)
- `generate_presigned_url` (no filesystem equivalent)

These are domain-specific tool names, not filesystem-mirroring names. The agent must learn S3-specific semantics rather than using familiar filesystem patterns.

### Finding: cyanheads/filesystem-mcp-server supports virtual path mapping (real→virtual directory remapping)
**Confidence:** CONFIRMED
**Evidence:** https://github.com/cyanheads/filesystem-mcp-server

This server maps real filesystem directories to virtual paths, obscuring true directory structure from clients. However, it still routes to the actual filesystem — the "virtual" aspect is path remapping, not backend replacement.

---

## Gaps / follow-ups

- No MCP server implementing filesystem tool names over a vector database backend exists (opportunity)
- The ChromaFs pattern (virtual FS over indexed content) has not been ported to MCP
- Replit's Crosis protocol (OT channels looking like files) has no MCP adaptation
- The CRDT-backed MCP server design exists but lacks implementation
