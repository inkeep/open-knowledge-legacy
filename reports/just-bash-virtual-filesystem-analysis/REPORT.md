---
title: "just-bash Virtual Filesystem Analysis: Source-Code-Level Architecture and Agent-Native Knowledge Platform Implications"
description: "Source-code-level analysis of Vercel Labs' just-bash — a TypeScript virtual bash environment with pluggable IFileSystem interface — and its implications for building an agent-native knowledge platform. Covers the IFileSystem interface (21 async methods), four filesystem implementations, 100+ command implementations, Mintlify ChromaFs as production prior art, custom backend implementability, and MCP server integration. Includes deep analysis of wrapping just-bash as an MCP server: single exec() tool vs auto-generated multi-tool patterns, enrichment compatibility with Unix string output, prior art survey of 7+ shell MCP servers, YjsFileSystem implementation requirements, and side-by-side comparison of just-bash MCP vs custom semantic MCP tools."
createdAt: 2026-04-02
updatedAt: 2026-04-02
subjects:
  - just-bash
  - Vercel Labs
  - Mintlify ChromaFs
  - bash-tool
  - IFileSystem
  - just-bash-mcp
  - MCP structuredContent
topics:
  - virtual filesystem for agents
  - custom filesystem backends
  - shell environment TypeScript
  - agent-native knowledge platform
  - MCP server architecture
  - MCP tool count agent performance
  - exec tool vs semantic tools
  - CRDT filesystem implementation
---

# just-bash Virtual Filesystem Analysis

**Purpose:** Provide a source-code-level understanding of Vercel Labs' [just-bash](https://github.com/vercel-labs/just-bash) — a TypeScript virtual bash environment with an in-memory filesystem designed for AI agents — and evaluate how its architecture relates to building an agent-native knowledge platform backed by Yjs CRDT, git branches, and Orama search.

---

## Executive Summary

just-bash (v2.14.0, Apache-2.0, ~939 GitHub stars) is a from-scratch TypeScript reimplementation of a bash shell environment with a pluggable filesystem abstraction. After reading the source code in its entirety (125,000+ lines of non-test TypeScript across 376 source files), the central finding is:

**The `IFileSystem` interface is well-designed for custom backends and has been proven at production scale by Mintlify's ChromaFs (30,000+ daily conversations).** The interface requires 21 methods (all async except `resolvePath()` and `getAllPaths()`), covers full POSIX filesystem semantics including symlinks, permissions, and lazy file loading, and is the sole contract between the 100+ command implementations and the underlying storage. Commands never access `node:fs` directly — they receive `ctx.fs: IFileSystem` via a `CommandContext` object. A knowledge platform could implement IFileSystem backed by Yjs Y.Doc content, git branch-aware file access, and Orama search results, following the same pattern Mintlify used to back their implementation with Chroma.

However, **using just-bash as the MCP server implementation layer would be over-engineering for most tool operations.** Simple MCP tools like `read(path)` or `list(path)` would route through the full shell parsing pipeline (lexer, parser, AST, interpreter, command resolution) only to arrive at `fs.readFile(path)` — the same call you'd make directly. The value of just-bash is not as a function-call wrapper but as an **agent execution environment** where agents compose commands with pipes, redirections, and shell logic. The strongest use case is providing agents with a `bash` tool (as [bash-tool](https://github.com/vercel-labs/bash-tool) already does for Vercel AI SDK) alongside semantic MCP tools, not replacing semantic tools with bash commands.

The OverlayFs implementation is a copy-on-write layer over real directories using `Map<string, MemoryEntry>` for writes and `Set<string>` for deletes. It has no built-in commit/merge mechanism and is bound to `node:fs` for its base layer — making it suitable for ephemeral session sandboxing (as Mintlify uses it) but not for persistent draft isolation, where git branches remain the superior abstraction.

**Key Findings (D1-D8, initial research):**

- **IFileSystem is a 21-method async interface explicitly designed for custom backends.** The interface comment says "Custom implementations (e.g., remote storage, browser IndexedDB)." Mintlify's ChromaFs confirms this works at scale. A minimum viable read-only implementation requires ~12 methods; the remaining 9 can throw EROFS.
- **just-bash implements 100+ Unix commands with full flag support.** grep supports -i, -n, -v, -c, -l, -r, -w, -E, -P, -F, -o, -A/-B/-C context, --include/--exclude. rg adds --type, --multiline, --json, --smart-case. sed supports full stream editing with in-place (-i). All commands operate through IFileSystem.
- **Mintlify's ChromaFs proves the custom backend pattern at production scale.** P90 session creation ~100ms (down from ~46s with sandboxes), zero marginal compute per conversation, 30K+ daily conversations. Their grep optimization uses a two-stage coarse-filter (Chroma query) + fine-filter (in-memory regex) strategy.
- **A Yjs-backed IFileSystem is structurally viable but requires serialization.** readFile would need to serialize Y.XmlFragment (ProseMirror/TipTap schema) to markdown on every call. readdir/exists/stat would need a path-to-doc-key mapping layer. This is feasible but adds latency that Mintlify avoids by storing pre-rendered content in Chroma.
- **bash-tool already wraps just-bash as Vercel AI SDK tools** (bash, readFile, writeFile). An MCP server wrapper would follow the same pattern but is not the recommended architecture — semantic MCP tools (read, search, list, edit) with direct backend calls are simpler and better aligned with the MCP ecosystem convention of 2-6 tools per server.
- **OverlayFs is for ephemeral sandboxing, not persistent drafts.** No commit/merge API, bound to node:fs for base layer, state is in-memory only. Git branches remain superior for persistent, collaborative, multi-agent draft isolation.
- **Four existing reports need updates** based on these findings: `virtualized-mcp-filesystem-servers/` (HIGH priority — just-bash inverts the problem framing), `mcp-tool-interface-design-agent-performance/` (MEDIUM), `mintlify-karpathy-workflow-deep-dive/` (MEDIUM), and potentially `agent-knowledge-retrieval-paradigms-2025-2026/` (LOW).

**Key Findings (D9-D14, MCP server wrapping analysis):**

- **A just-bash MCP server already exists.** [just-bash-mcp](https://github.com/guillaumemaka/just-bash-mcp) by Guillaume Maka exposes a single `execute_bash(command)` tool over just-bash's InMemoryFs. It confirms the pattern is architecturally viable. However, no one has wrapped just-bash over a custom IFileSystem (Yjs/Chroma/Orama) as an MCP server — that would be novel.
- **Single exec() tool wins on composability; semantic tools win on enrichment. The hybrid architecture is optimal.** exec() enables multi-step pipelines in a single tool call (`grep | sort | head`) but cannot return enriched metadata. Semantic tools (read, search, list, edit) enable frontmatter, backlinks, and relevance scores via MCP's structuredContent. The recommended architecture: 5-6 semantic tools + 1 bash escape hatch = 6-7 tools total.
- **Tool count research confirms 6-7 tools is the sweet spot.** Agent performance degrades non-linearly: perfect at 10 tools, functional at 20, collapsed at 107 (Speakeasy). GitHub Copilot improved by cutting 40 to 13 tools. Block rebuilt Linear MCP from 30+ to 2. MCP servers average 4 or fewer tools. A 6-7 tool KB server is well within the safe zone.
- **MCP's structuredContent spec resolves the enrichment-vs-string tension.** Tools can return both `content` (text for the agent) and `structuredContent` (JSON metadata for the client) in the same response. This means custom semantic tools can return file content as text AND frontmatter/backlinks/relevance as structured data — no conflict with just-bash's string output at the MCP layer.
- **A YjsFileSystem needs 8 real method implementations.** cat, grep, ls, and find use only 6 IFileSystem methods intensively (readFile, readdir, stat, lstat, getAllPaths, readdirWithFileTypes). A materialized markdown cache (updated via Yjs change observers) is recommended over on-demand serialization for read-heavy agent workloads.
- **Search is the operation where custom tools provide 50-100x improvement over just-bash.** Orama index lookup is O(1) at ~5-15ms; grep scans every file at O(N) for 500ms-1s+ on a 500-document KB. For all other operations, the difference is 5-15ms of shell parse overhead — negligible relative to agent round-trip latency.

---

## Research Rubric

| # | Dimension | Priority | Depth | Status |
|---|-----------|----------|-------|--------|
| D1 | Source code architecture | P0 | Deep | CONFIRMED |
| D2 | IFileSystem custom backend implementability | P0 | Deep | CONFIRMED |
| D3 | How Mintlify ChromaFs uses just-bash | P0 | Deep | CONFIRMED |
| D4 | just-bash as MCP server backend | P0 | Synthesis | CONFIRMED |
| D5 | OverlayFs for draft isolation | P0 | Deep | CONFIRMED |
| D6 | Compatibility with Vite/Hocuspocus stack | P0 | Moderate | CONFIRMED |
| D7 | Unix commands relevance for KB agents | P0 | Moderate | CONFIRMED |
| D8 | Connection to existing reports | P0 | Synthesis | CONFIRMED |
| D9 | just-bash as a single MCP tool (exec) | P0 | Deep | CONFIRMED |
| D10 | just-bash as multiple MCP tools (auto-generated) | P0 | Deep | CONFIRMED |
| D11 | Additive enrichment compatibility | P0 | Deep | CONFIRMED |
| D12 | Prior art — MCP servers wrapping shell/exec | P0 | Deep | CONFIRMED |
| D13 | IFileSystem backend for CRDT (YjsFileSystem) | P0 | Deep | CONFIRMED |
| D14 | Comparison: just-bash MCP vs custom MCP tools | P0 | Synthesis | CONFIRMED |

**Stance:** Factual with conclusions.
**Non-goals:** Building an implementation, general MCP design patterns (covered in `mcp-tool-interface-design-agent-performance/`), Mintlify business analysis (covered in `mintlify-karpathy-workflow-deep-dive/`).

---

## Detailed Findings

### D1. Source Code Architecture

**Finding:** just-bash is a full AST-based bash interpreter (Input -> Lexer -> Parser -> AST -> Interpreter -> Output) with a pluggable filesystem abstraction, 100+ lazy-loaded commands, and comprehensive shell feature support.

**Evidence:** [evidence/d1-source-code-architecture.md](evidence/d1-source-code-architecture.md)

The project is substantial: 125,353 lines of non-test TypeScript across 376 source files, with 424 additional test files. The codebase was created on 2025-12-23 and has accumulated 314 commits and 86 npm versions in approximately four months, indicating intense active development.

**Architecture overview:**

```
┌─────────────────────────────────────────────────────────┐
│                    Bash class                            │
│  ┌──────┐  ┌────────┐  ┌─────┐  ┌───────────┐          │
│  │Lexer │→ │ Parser │→ │ AST │→ │Interpreter│→ Output  │
│  └──────┘  └────────┘  └─────┘  └─────┬─────┘          │
│                                        │                 │
│  ┌─────────────────────────────────────┘                 │
│  │                                                       │
│  ▼                                                       │
│  CommandRegistry (100+ commands, lazy-loaded)             │
│  │                                                       │
│  ▼                                                       │
│  CommandContext { fs: IFileSystem, cwd, env, stdin, ... } │
│  │                                                       │
│  ▼                                                       │
│  IFileSystem (21 methods)                                │
│  ├── InMemoryFs     (Map<string, FsEntry>)               │
│  ├── OverlayFs      (memory Map + deleted Set + node:fs) │
│  ├── ReadWriteFs    (direct node:fs with sandbox)        │
│  └── MountableFs    (path-prefix → IFileSystem routing)  │
└─────────────────────────────────────────────────────────┘
```

**The IFileSystem interface** is the critical abstraction layer. It defines 21 methods covering: file read/write (`readFile`, `readFileBuffer`, `writeFile`, `appendFile`), metadata (`exists`, `stat`, `lstat`, `chmod`, `utimes`), directory operations (`mkdir`, `readdir`, `readdirWithFileTypes`), file manipulation (`rm`, `cp`, `mv`), path operations (`resolvePath`, `getAllPaths`, `realpath`), and link operations (`symlink`, `link`, `readlink`). All methods return Promises except `resolvePath()` and `getAllPaths()`, which are synchronous.

**Four filesystem implementations** ship with just-bash:

| Implementation | Storage | Use case | Browser-compatible |
|---|---|---|---|
| **InMemoryFs** | `Map<string, FsEntry>` | Default, testing, ephemeral | Yes |
| **OverlayFs** | Memory layer + node:fs base | Copy-on-write over real directory | No |
| **ReadWriteFs** | Direct node:fs with sandbox | Direct disk access | No |
| **MountableFs** | Delegates to mounted IFileSystem instances | Multi-backend composition | Yes (base only) |

**Shell execution pipeline:** Each `exec(commandLine)` call processes through: script normalization (trim leading whitespace), lexer tokenization, parser generating a typed AST (ScriptNode -> StatementNode -> PipelineNode -> CommandNode), interpreter walking the AST, and command execution. Pipeline commands are connected via stdin/stdout chaining. Each exec() gets isolated shell state (env, cwd, functions reset); the filesystem is shared across calls.

**Command implementation pattern:** Commands receive a `CommandContext` with `fs`, `cwd`, `env`, `stdin`, `exec` (for subcommands), and return `{stdout, stderr, exitCode}`. Commands are lazy-loaded for bundle efficiency — only loaded when first invoked. The `commands` option on BashOptions allows restricting which commands are available: `new Bash({ commands: ["cat", "grep", "ls", "find"] })`.

**Security model:** Defense-in-depth via `AsyncLocalStorage` scoping, prototype pollution prevention (null-prototype objects, Map for env vars), symlink blocking by default on real-FS implementations, path traversal prevention via canonical path validation, O_NOFOLLOW for TOCTOU defense, and execution limits (max call depth, max command count, max loop iterations, max heredoc size).

**Implications:** The architecture cleanly separates shell interpretation from filesystem storage. Any code that touches files goes through the IFileSystem interface. This separation is what makes custom backends viable — the 100+ command implementations are entirely agnostic to how files are stored.

### D2. IFileSystem Custom Backend Implementability

**Finding:** A custom IFileSystem backed by Yjs, git, and Orama is structurally viable. A minimum viable read-only implementation requires approximately 12 of 21 methods. Mintlify's ChromaFs confirms the pattern works at production scale.

**Evidence:** [evidence/d2-ifilesystem-custom-backend.md](evidence/d2-ifilesystem-custom-backend.md)

The interface documentation explicitly lists custom backends as a design goal:

```typescript
/**
 * Abstract filesystem interface that can be implemented by different backends.
 * This allows BashEnv to work with:
 * - InMemoryFs (in-memory, default)
 * - Real filesystem (via node:fs)
 * - Custom implementations (e.g., remote storage, browser IndexedDB)
 */
export interface IFileSystem { ... }
```

**Mapping a KB backend to IFileSystem methods:**

| IFileSystem Method | KB Backend Implementation | Complexity |
|---|---|---|
| `readFile(path)` | Serialize Y.Doc content to markdown | Medium (serialization) |
| `readFileBuffer(path)` | Same as readFile, encode to Uint8Array | Low |
| `exists(path)` | Check path in doc key index | Low |
| `stat(path)` | Return metadata from doc index (size, mtime, isFile/isDir) | Low |
| `readdir(path)` | Return child keys under path prefix | Low |
| `readdirWithFileTypes(path)` | Return child keys with type info | Low |
| `resolvePath(base, path)` | Pure path math (can reuse just-bash's path-utils) | Trivial |
| `getAllPaths()` | Return full doc key inventory | Low |
| `realpath(path)` | Identity (no symlinks in KB) | Trivial |
| `lstat(path)` | Same as stat (no symlinks) | Trivial |
| `writeFile(path, content)` | Apply Y.Doc update / EROFS for read-only | Medium |
| `mkdir/rm/cp/mv` | EROFS for read-only; mutation ops for read-write | Medium |
| `chmod/symlink/link/readlink/utimes` | Stub (throw ENOTSUP or no-op) | Trivial |
| `appendFile(path, content)` | EROFS or Y.Doc append | Low |

**The `getAllPaths()` method is the key integration point for performance.** This synchronous method must return all known file paths for glob expansion and find optimization. Mintlify's ChromaFs builds this from a `__path_tree__` manifest loaded at initialization. A Yjs backend would build it from the Y.Doc key inventory at connection time and update it as documents change.

**The critical serialization challenge:** Yjs stores content in ProseMirror/TipTap schema format (Y.XmlFragment), not raw markdown. Every `readFile(path)` call would need to serialize the CRDT state to markdown. This serialization happens on every cat, grep line-scan, and sed read. ChromaFs avoids this by storing pre-rendered content in Chroma chunks — the readFile path is chunk reassembly, not format conversion.

**Two implementation strategies:**

1. **Yjs-direct:** readFile serializes Y.Doc to markdown on demand. Advantage: always current. Disadvantage: serialization overhead on every read, especially during grep scans of many files.

2. **Materialized view:** Maintain a pre-rendered markdown cache (like ChromaFs's chunk store) updated via Yjs change observers. readFile reads from cache. Advantage: fast reads, grep performance. Disadvantage: cache staleness window, additional storage.

Strategy 2 (materialized view) follows the ChromaFs pattern and is recommended for a knowledge platform where read-heavy agent workflows dominate.

**Decision triggers:**
- If agents primarily read and search (80%+ of operations), a read-only IFileSystem with materialized markdown is optimal.
- If agents need to write through the filesystem (edit, create files), the IFileSystem must route writes back to Yjs — adding bidirectional serialization complexity.
- If real-time CRDT updates must be immediately visible to agents mid-session, Strategy 1 (Yjs-direct) is required despite the serialization cost.

### D3. How Mintlify ChromaFs Uses just-bash

**Finding:** ChromaFs implements IFileSystem backed by Chroma vector database, bootstraps from a gzipped path tree for zero-network directory operations, uses a two-stage grep optimization (Chroma coarse filter + in-memory fine filter), and enforces read-only access via EROFS. This pattern achieves p90 session creation of ~100ms at 30,000+ daily conversations.

**Evidence:** [evidence/d3-mintlify-chromafs-implementation.md](evidence/d3-mintlify-chromafs-implementation.md)

**Bootstrap pattern:** At startup, ChromaFs fetches `__path_tree__` — a gzipped JSON document from the Chroma collection containing the entire file hierarchy. This creates two in-memory structures: a `Set<string>` of all file paths and a `Map<string, string[]>` mapping directories to children. Each entry includes `isPublic` (boolean) and `groups` (permission array for RBAC).

This means `readdir()`, `exists()`, `getAllPaths()`, `find`, and `ls` operate entirely in-memory with zero network calls after initialization. Only `readFile()` (cat) and the coarse grep filter hit the database.

**Cat implementation:** Pages in Chroma are split into chunks for embedding. When the agent runs `cat /auth/oauth.mdx`, ChromaFs fetches all chunks matching the page slug, sorts by `chunk_index`, and joins them into the full page. Results are cached for repeated reads.

**Grep optimization:** ChromaFs intercepts grep (likely at the command level, not the IFileSystem level), parses flags, and translates to a two-stage query:
1. **Coarse filter (Chroma):** Vector/keyword query identifies candidate files
2. **Fine filter (in-memory):** Actual regex execution against bulk-prefetched content cached in Redis

This hybrid approach means grep doesn't need to readFile every document — it uses search-indexed content for the first pass and only loads full content for candidates.

**RBAC enforcement:** Rather than Linux permissions, ChromaFs prunes the path tree using the user's session token before building the file tree. Unauthorized paths are entirely invisible — they cannot be accessed or even referenced.

**Lazy file pointers:** Large OpenAPI specifications in customer S3 buckets are registered as lazy file pointers matching just-bash's `LazyFileProvider` pattern, fetched only when cat reads the file.

**Implications for OpenKB:** The ChromaFs pattern is directly applicable:
- Bootstrap from document index (Orama) rather than discovering files
- Cache aggressively — agent workflows are read-heavy and repetitive
- Intercept grep at the command level for search-indexed optimization
- Use EROFS for read-only access unless agent editing is explicitly enabled
- Prune the file tree per-user for access control

### D4. just-bash as MCP Server Backend

**Finding:** just-bash is viable as an MCP backend but would over-engineer simple operations. The recommended architecture is: semantic MCP tools for direct operations (read, list, search, edit) + an optional bash tool for complex compound operations and agent composition.

**Evidence:** [evidence/d4-mcp-server-backend.md](evidence/d4-mcp-server-backend.md)

**The indirection cost of routing through just-bash:**

When an MCP tool receives `read(path="/docs/api.mdx")`, there are two implementation paths:

```
Path A (direct):
  MCP handler → fs.readFile(path) → return content
  ~1 function call

Path B (just-bash):
  MCP handler → bash.exec('cat /docs/api.mdx')
  → normalize script → lexer → parser → AST → interpreter
  → command resolution → cat command → ctx.fs.readFile(path)
  → return stdout
  ~12 function calls + AST allocation
```

For simple operations, Path A is superior: less code, less latency, no shell parsing edge cases, easier to debug. Path B's overhead is unnecessary.

**Where just-bash adds genuine value:**

1. **Complex compound operations:** `grep -r "TODO" /docs | sort | uniq -c | sort -rn | head -10` — this pipeline is natural in bash but would require multi-step MCP tool chains.
2. **Agent composition:** Agents that already think in bash (Claude Code, coding agents) can compose commands with pipes, redirections, and shell logic.
3. **Behavioral fidelity:** Agents trained on Unix tool output formats get exactly the format they expect.
4. **Command extensibility:** Custom commands via `defineCommand` integrate seamlessly with pipes, redirections, and all shell features.

**Recommended hybrid architecture:**

```
MCP Server
├── read(path)       → direct: fs.readFile(path)
├── list(path)       → direct: fs.readdir(path) + stat
├── search(query)    → direct: orama.search(query)
├── edit(path,o,n)   → direct: fs.readFile + replace + writeFile
├── grep(pattern,p)  → direct: search-engine + fs.readFile
└── bash(command)    → just-bash: bash.exec(command) on custom IFileSystem
```

The `bash` tool is additive — it provides a power-user escape hatch without replacing the simpler semantic tools. This matches the pattern observed in production: Mintlify's MCP server exposes 2 semantic tools (Search, Get Page) for external agents, while ChromaFs + just-bash powers the internal assistant. Both coexist.

[bash-tool](https://github.com/vercel-labs/bash-tool) already wraps just-bash as Vercel AI SDK tools. An MCP server wrapper would follow the same pattern:

```typescript
const bash = new Bash({ fs: kbFileSystem, cwd: "/kb" });
// MCP tool: bash
server.tool("bash", { command: z.string() }, async ({ command }) => {
  const result = await bash.exec(command);
  return { content: [{ type: "text", text: result.stdout + result.stderr }] };
});
```

**Decision triggers:**
- If your MCP server is consumed primarily by coding agents (Claude Code, Cursor) that already think in bash, the bash tool adds significant value.
- If your MCP server is consumed by general-purpose agents or chatbots, semantic tools are sufficient and the bash tool adds unnecessary complexity.
- If agents need to compose multi-step operations (grep + sed, find + xargs), the bash tool is the only way to avoid multi-round-trip MCP tool chains.

### D5. OverlayFs for Draft Isolation

**Finding:** OverlayFs is designed for ephemeral session sandboxing (reads from disk, writes to memory, discardable) and lacks commit/merge capabilities. It cannot compose with virtual backends (bound to node:fs). For persistent, collaborative draft isolation, git branches remain the superior abstraction.

**Evidence:** [evidence/d5-overlayfs-draft-isolation.md](evidence/d5-overlayfs-draft-isolation.md)

**OverlayFs data structures:**

```typescript
private readonly memory: Map<string, MemoryEntry> = new Map();  // writes
private readonly deleted: Set<string> = new Set();               // deletes
```

Resolution: check deleted → check memory → fall through to real filesystem (`node:fs`).

**What OverlayFs lacks for draft isolation:**

1. **No commit/merge API.** There is no method to flush the memory layer to the base filesystem. The `memory` Map and `deleted` Set are private — to "commit," you'd need to add public API surface to enumerate changes and write them back.

2. **No change enumeration.** There is no way to ask "what changed in this overlay?" — no diff, no changeset, no modified file list.

3. **Bound to node:fs.** The base layer must be a real directory. OverlayFs cannot overlay on top of an InMemoryFs or another IFileSystem implementation. A "VirtualOverlayFs" that composes two arbitrary IFileSystem instances does not exist in just-bash.

4. **In-memory only.** State is lost on process restart. There is no serialization/deserialization of the overlay layer.

5. **Single-writer.** No concurrency primitives for multiple agents writing to the same overlay.

**Comparison: OverlayFs layers vs git branches for drafts:**

| Aspect | OverlayFs | Git branches |
|--------|-----------|-------------|
| Persistence | In-memory, ephemeral | On-disk, permanent |
| Merge/commit | Not built-in | `git merge` with conflict resolution |
| History | None | Full commit history |
| Collaboration | Single-writer | Multi-writer (via CRDT or merge) |
| Nested drafts | Not supported | Branch from branch |
| Discard | Drop the reference | `git branch -D` |
| Base layer | Real directory only | Any committable state |
| Performance | Zero-copy reads | Branch checkout (fast in git) |

**Where OverlayFs IS appropriate:**
- Ephemeral agent sessions where changes are discarded (Mintlify's pattern)
- Read-only sandboxing with `readOnly: true` (blocks all writes via EROFS)
- Testing/development environments where you want to modify files without affecting disk

**MountableFs is the more flexible composition tool.** It delegates operations to different IFileSystem implementations based on path prefixes:

```typescript
const fs = new MountableFs({ base: new InMemoryFs() });
fs.mount("/mnt/knowledge", new OverlayFs({ root: "/knowledge", readOnly: true }));
fs.mount("/home/agent", new ReadWriteFs({ root: "/workspace" }));
```

For draft isolation in a knowledge platform: mount the main branch content at one path and draft branch content at another, switching the active mount based on agent context. This is a git-branch-switching operation at the mount level, not an overlay operation.

### D6. Compatibility with Vite/Hocuspocus Stack

**Finding:** just-bash is compatible with the target stack. It provides ESM + CJS + browser builds, has no global state or process-level side effects, and can coexist with Hocuspocus in the same Node.js process. The main considerations are package size (18.8MB unpacked) and the command subset configuration for minimizing bundle impact.

**Evidence:** [evidence/d6-stack-compatibility.md](evidence/d6-stack-compatibility.md)

**Build compatibility:**
- ESM (primary): `dist/bundle/index.js`
- CJS: `dist/bundle/index.cjs`
- Browser: `dist/bundle/browser.js` (excludes OverlayFs, ReadWriteFs)
- `"type": "module"` — ESM-first
- Built with esbuild, code-splitting enabled
- Vite resolves to browser entry for client, ESM entry for server

**Size considerations:**
- Unpacked npm: 18.8 MB (includes WASM for Python/JS runtimes)
- 15 runtime dependencies, some externalized in the bundle
- Command restriction via `commands` option: `new Bash({ commands: ["cat", "grep", "ls", "find", "sed"] })` reduces loaded code
- Tree-shaking via lazy command loading — unused commands are never imported

**Coexistence with Hocuspocus:**
- No global singletons or process-level mutations
- State is instance-scoped (each `new Bash()` is independent)
- `DefenseInDepthBox` uses `AsyncLocalStorage` for scoping (not global patching in the dangerous sense)
- Multiple Bash instances can run concurrently for different agent sessions

**TypeScript types:** Comprehensive — 50+ exported types covering IFileSystem, all entry types, command interfaces, execution results, and options.

**Maintenance signals:**
- 314 commits in ~4 months (2025-12-23 to 2026-03-19)
- 86 npm versions (roughly one every 1.5 days)
- Apache-2.0 license
- Heavy security focus in recent commits
- Vercel Labs org — backed by Vercel's resources
- Active issue tracker, PRs being merged

### D7. Unix Commands Relevance for KB Agents

**Finding:** Approximately 12 commands cover 90%+ of knowledge base agent operations. just-bash's grep supports most flags that Claude Code's Grep tool uses, with the notable exceptions of global offset pagination and file type filtering (available via rg instead of grep).

**Evidence:** [evidence/d7-unix-commands-for-kb-agents.md](evidence/d7-unix-commands-for-kb-agents.md)

**Command tier list for KB agents:**

| Tier | Commands | Why |
|------|----------|-----|
| Essential | cat, grep, ls, find, head, tail, wc | Core navigation and search |
| Important | sed, sort, uniq, jq, diff, tree, awk | Content manipulation |
| Occasional | cut, tr, paste, xargs, rg, yq | Specialized transforms |
| Rarely needed | gzip, tar, sqlite3, python3, js-exec, curl | Wrong tool for KB work |

**Grep compatibility with Claude Code's Grep tool:**

Claude Code's Grep tool exposes 13+ parameters. just-bash's grep covers most:

| Claude Code Parameter | just-bash | Notes |
|---|---|---|
| pattern (regex) | Yes | Basic, extended, Perl, fixed-string modes |
| path | Yes | |
| -i (case insensitive) | Yes | |
| -n (line numbers) | Yes | |
| -A/-B/-C (context) | Yes | |
| output_mode: content | Yes (default) | |
| output_mode: files_with_matches | Yes (-l) | |
| output_mode: count | Yes (-c) | |
| glob (file filter) | Yes (--include) | |
| type (file type filter) | No in grep, Yes in rg (--type) | |
| head_limit | Partial (-m, per-file) | No global result limit |
| offset (skip results) | No | |
| multiline | No in grep, Yes in rg (-U) | |

The rg (ripgrep) command fills the gaps: `--type` file filtering, `-U --multiline`, `--json` output, `--smart-case`, `--column`. Between grep and rg, just-bash covers the full search spectrum.

**Performance consideration:** grep and find process files in parallel batches (grep: 50, find: 500) using `Promise.all`. A custom IFileSystem backing would receive concurrent `readFile`/`stat` calls during these operations and needs to handle parallelism efficiently.

### D8. Connection to Existing Reports — Path C Updates Needed

**Finding:** Four existing reports need updates based on this analysis. The highest-priority update is to `virtualized-mcp-filesystem-servers/`, where just-bash fundamentally changes the architectural landscape from "build MCP tools that mimic filesystem commands" to "build a virtual filesystem and let agents use actual bash."

**Evidence:** [evidence/d8-existing-report-updates.md](evidence/d8-existing-report-updates.md)

| Report | Priority | What Changes |
|--------|----------|-------------|
| `virtualized-mcp-filesystem-servers/` | HIGH | just-bash inverts the problem: instead of building MCP tools that look like filesystem commands, build a virtual filesystem and let agents use bash. Needs new dimension covering just-bash + custom IFileSystem as alternative architecture. |
| `mcp-tool-interface-design-agent-performance/` | MEDIUM | Adds a third architectural option — "virtual shell" — alongside semantic and filesystem-mimicking MCP tools. bash-tool wraps this as a single tool, the extreme of tool consolidation. |
| `mintlify-karpathy-workflow-deep-dive/` | MEDIUM | Enriches ChromaFs coverage with IFileSystem interface details, grep optimization strategy, EROFS pattern, and `__path_tree__` bootstrap. |
| `agent-knowledge-retrieval-paradigms-2025-2026/` | LOW | Potential new dimension: "filesystem-mediated retrieval" where agents use shell commands against a virtual filesystem. |

**Specific updates per report (not yet executed):**

**virtualized-mcp-filesystem-servers/:**
1. New D7: "just-bash + custom IFileSystem as alternative architecture"
2. Update D5: Add "agents speak bash, filesystem is virtual" to tool surface design options
3. Update executive summary: just-bash inverts the problem framing
4. Add ChromaFs as confirmed production implementation (30K+ daily conversations)

**mcp-tool-interface-design-agent-performance/:**
1. New finding: "virtual shell" as third pattern (beyond semantic and filesystem-mimicking)
2. Note: bash-tool is a single-tool approach (extreme tool consolidation)
3. Nuance: ChromaFs + bash-tool blurs internal vs. external tool surface

**mintlify-karpathy-workflow-deep-dive/:**
1. Enrich D3: IFileSystem interface details (21 methods, all async)
2. Add grep optimization detail (two-stage coarse/fine filter)
3. Note EROFS pattern source (just-bash)
4. Add `__path_tree__` bootstrap as key architectural insight

### D9. just-bash as a Single MCP Tool (exec)

**Finding:** Wrapping just-bash as a single `exec(command)` MCP tool is architecturally viable and has already been built. The pattern excels for coding agents that think in bash, providing composability (multi-step pipelines in a single call) and minimal token overhead (one tool definition). It is a poor fit for general-purpose agents and cannot support enrichment.

**Evidence:** [evidence/d9-single-mcp-tool-exec.md](evidence/d9-single-mcp-tool-exec.md)

[just-bash-mcp](https://github.com/guillaumemaka/just-bash-mcp) by Guillaume Maka implements exactly this pattern: a single `execute_bash(command, timeout?)` tool backed by just-bash's InMemoryFs. It works with Claude Desktop and VS Code.

The single-tool approach has concrete advantages: the tool schema costs ~50-80 tokens (vs 600-900 for 6 specialized tools), eliminates tool selection ambiguity entirely, and enables compound operations in one call. A CLI-vs-MCP analysis found a 35x token efficiency advantage for CLI patterns in a real-world automation task (4,150 vs 145,000 tokens).

A well-crafted tool description teaches agents what commands are available and how to compose them. Claude and GPT models have strong Unix command knowledge from pre-training and compose commands naturally when given a bash tool.

**However, the single exec() tool cannot support enrichment.** When the command is arbitrary (`grep | sort | head`), the server cannot know what metadata to attach. This is the fundamental tension: **exec() is composable but not enrichable; semantic tools are enrichable but not composable.**

**Decision triggers:**
- If agents are coding agents (Claude Code, Cursor) and enrichment is not needed, a single exec() tool is sufficient and optimal.
- If agents are general-purpose (chatbots, RAG pipelines) or enrichment is critical, semantic tools are required.
- If both audiences exist, the hybrid architecture (semantic tools + bash escape hatch) covers both.

### D10. just-bash as Multiple MCP Tools (Auto-Generated)

**Finding:** Auto-generating MCP tools from just-bash's command registry would create 12-20+ tools for KB operations, approaching the degradation threshold. More critically, per-command MCP tools lose composability — the main advantage of shell semantics. Outcome-oriented semantic tools (5-8 total) outperform operation-oriented per-command tools.

**Evidence:** [evidence/d10-multiple-mcp-tools.md](evidence/d10-multiple-mcp-tools.md)

Tool count research establishes clear thresholds:

| Tool count | Agent performance | Source |
|---|---|---|
| 10 | Perfect (20/20) | [Speakeasy](https://www.speakeasy.com/mcp/release-notes) |
| 20 | Good (19/20 for large models) | Speakeasy |
| 50+ | 2-3x response time increase | Industry survey |
| 107 | Both large and small models failed | Speakeasy |

[GitHub Copilot](https://github.blog/) cut tools from 40 to 13 and saw 2-5 percentage point benchmark improvement plus 400ms latency reduction. [Microsoft Research](https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era-designing-for-agent-compatibility-at-scale/) found up to 85% effectiveness reduction at high tool counts.

Per-command tools also lose composability: `grep | sort | uniq -c | sort -rn | head` would require 5 sequential MCP tool calls with the agent manually threading output between them. A single `exec()` call does this in one round-trip.

The recommended pattern is outcome-oriented design: one tool per user goal, not one tool per Unix command. `search(query)` returns ranked results with metadata — it does not map to a single Unix command but to the agent's actual goal.

### D11. Additive Enrichment Compatibility

**Finding:** just-bash's string output model does not conflict with enrichment IF enrichment is applied at the MCP layer rather than the bash layer. The MCP spec's `structuredContent` field enables returning both text content (for the agent) and structured metadata (frontmatter, backlinks, relevance scores) in the same response.

**Evidence:** [evidence/d11-enrichment-compatibility.md](evidence/d11-enrichment-compatibility.md)

The [MCP spec (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) defines two response fields:
- `content`: unstructured text/image/audio blocks (what the LLM reads)
- `structuredContent`: typed JSON object (what clients/UIs consume programmatically)

A custom `read(path)` tool can return:
```json
{
  "content": [{ "type": "text", "text": "# API Auth\n\nOAuth 2.0 flow..." }],
  "structuredContent": {
    "frontmatter": { "title": "API Auth", "tags": ["auth"] },
    "backlinks": ["/docs/oauth.md"],
    "wordCount": 1247
  }
}
```

Two enrichment architectures were evaluated:
- **Command-level enrichment** (via defineCommand) breaks behavioral fidelity — if `cat` returns metadata, downstream pipes break.
- **MCP-level enrichment** (recommended) wraps exec() results and adds metadata in the MCP response layer. just-bash stays pure; the MCP server adds value.

just-bash's `BashExecResult` already includes a `metadata?: Record<string, unknown>` field — a sideband channel that could carry enrichment data from command to MCP layer. But the cleaner architecture is enrichment at the MCP handler level, not inside the bash pipeline.

**Key insight:** exec() is composable but not enrichable. Semantic tools are enrichable but not composable. The hybrid architecture provides both.

### D12. Prior Art — MCP Servers Wrapping Shell/Exec

**Finding:** At least 7 MCP servers expose shell/exec interfaces. Six of seven use a single-tool pattern. None wraps a virtual filesystem shell (just-bash over a custom IFileSystem) — all use the real operating system's shell. An MCP server exposing just-bash over a custom IFileSystem (Yjs, Chroma, Orama) would be novel.

**Evidence:** [evidence/d12-prior-art-mcp-shell-servers.md](evidence/d12-prior-art-mcp-shell-servers.md)

| Server | Tools | Security | Shell |
|---|---|---|---|
| [just-bash-mcp](https://github.com/guillaumemaka/just-bash-mcp) | 1 (`execute_bash`) | Sandboxed InMemoryFs | just-bash |
| [mcp-shell-server](https://github.com/tumf/mcp-shell-server) | 1 | Whitelist | Real shell |
| [MCPShell](https://github.com/inercia/MCPShell) | N (script-per-tool) | CEL validation | Real shell |
| [mcp-shell](https://github.com/sonirico/mcp-shell) | 1 | Allowlist | Real shell |
| [mcp-bash](https://github.com/patrickomatik/mcp-bash) | 1 | None | Real bash |
| [shell-command-mcp](https://github.com/egoist/shell-command-mcp) | 1 | Not specified | Real shell |
| [mcp-unix-shell](https://mcpservers.org/servers/gamunu/mcp-unix-shell) | 1 | Go allowlist | Real shell |

Mintlify's external MCP server exposes 2 semantic tools (`search_mintlify`, `get_page_mintlify`) with no connection to ChromaFs or just-bash. ChromaFs powers the internal assistant only. This confirms: Mintlify uses just-bash + custom IFileSystem internally but exposes semantic tools (not bash) externally.

### D13. IFileSystem Backend for CRDT (YjsFileSystem)

**Finding:** A YjsFileSystem needs 8 real method implementations to support the core commands (cat, grep, ls, find). The most intensive methods are readFile, readdir, stat, and getAllPaths. A materialized markdown cache is recommended over on-demand Y.XmlFragment serialization, matching the ChromaFs pattern.

**Evidence:** [evidence/d13-ifilesystem-for-crdt.md](evidence/d13-ifilesystem-for-crdt.md)

**IFileSystem method usage by core commands:**

| Command | Hot-path methods | Batch size |
|---|---|---|
| cat | readFile | 1 |
| grep | readFile, getAllPaths, stat, readdir | 50 concurrent |
| ls | readdir, stat | N entries |
| find | readdir, stat, getAllPaths | 500 concurrent |

**Implementation complexity tiers:**

| Tier | Methods | Complexity |
|---|---|---|
| Must implement (read-only) | readFile, readFileBuffer, exists, stat, lstat, readdir, readdirWithFileTypes, getAllPaths | 8 methods |
| Must implement (read-write) | writeFile, mkdir, rm | +3 methods |
| Stub with EROFS/ENOTSUP | appendFile, chmod, symlink, link, readlink, utimes, cp, mv | 8 stubs |
| Pure path math | resolvePath, realpath | Reuse just-bash utils |

`getAllPaths()` is synchronous — it must return all paths immediately. The solution: maintain an in-memory `Set<string>` updated via Yjs change observers, identical to ChromaFs's `__path_tree__` approach.

**Performance concern:** Each readFile on a Yjs backend requires Y.XmlFragment-to-markdown serialization (~5-20ms per document). During grep's 50-file batches, this means 50 concurrent serializations. A materialized markdown cache (serialize once on document change, read from cache) reduces per-read latency to ~1ms, matching ChromaFs's pre-rendered chunk approach.

**Hocuspocus DirectConnection note:** [Issue #832](https://github.com/ueberdosis/hocuspocus/issues/832) documents state corruption when DirectConnection closes during WebSocket debounce. For MCP server use: open a long-lived connection at session start, not per-request.

### D14. Comparison: just-bash MCP vs Custom MCP Tools

**Finding:** For each core KB operation, custom semantic tools provide better enrichment and safety, while just-bash exec provides better composability and power-user operations. The hybrid architecture (5-6 semantic tools + 1 bash escape hatch = 6-7 tools) captures the benefits of both.

**Evidence:** [evidence/d14-comparison-justbash-vs-custom-mcp.md](evidence/d14-comparison-justbash-vs-custom-mcp.md)

**Operation-level comparison:**

| Operation | just-bash exec | Custom semantic tool | Winner |
|---|---|---|---|
| **Read** | Raw content (no enrichment) | Content + frontmatter + backlinks | Custom (enrichment) |
| **Search** | grep: exhaustive, O(N files), 500ms+ | Orama: ranked, O(1), ~10ms | Custom (50-100x faster) |
| **List** | Standard ls output (size, date) | Entries + tags + descriptions | Custom (content-aware) |
| **Edit** | sed with regex escaping (fragile) | Validated replace with CRDT merge | Custom (safer) |
| **Compound** | `grep \| sort \| uniq -c \| head` in 1 call | 5 sequential tool calls | exec (composability) |

**Latency comparison:**

| Operation | exec overhead | Custom overhead | Delta |
|---|---|---|---|
| Read | +5-15ms (shell parse) | +2-5ms (enrichment) | Comparable |
| Search (500 docs) | 500-1000ms (full scan) | 5-15ms (index) | Custom 50-100x faster |
| List | +5-10ms (shell parse) | +2-5ms (enrichment) | Comparable |

The 5-15ms shell parsing overhead per exec call is negligible relative to agent round-trip latency (typically 1-3 seconds). The dramatic difference is search: grep is O(N files) while Orama is O(1 index lookup). This algorithmic gap cannot be closed by optimizing just-bash.

**Recommended hybrid architecture:**

```
MCP Server (openkb)
├── read(path)              → Direct: enriched read (frontmatter, backlinks)
├── search(query)           → Direct: Orama ranked search (relevance, snippets)
├── list(path)              → Direct: enriched listing (tags, descriptions)
├── edit(path, old, new)    → Direct: CRDT-aware validated edit
├── write(path, content)    → Direct: CRDT-aware create
├── grep(pattern, path)     → Direct or just-bash: exhaustive text search
└── bash(command)           → just-bash: power-user escape hatch
```

Total: 6-7 tools. Mintlify uses 2 for their external MCP. [Hugging Face](https://huggingface.co/) recommends 5-15. The MCP ecosystem averages 4 or fewer. This is well within the safe zone.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **ChromaFs source code:** ChromaFs is closed-source. Implementation details are from the Mintlify blog post only. We cannot verify exactly which IFileSystem methods ChromaFs implements or how it handles edge cases (stat metadata, symlink methods, readdirWithFileTypes).
- **Bundle size after tree-shaking:** The 18.8MB unpacked size includes WASM runtimes for Python and JavaScript. The actual bundle size for a KB-focused subset of commands (cat, grep, ls, find, sed, head, tail) after esbuild minification is not measured.
- **Performance benchmarks:** No benchmarks exist for grep/find performance over a custom IFileSystem with 1000+ documents. Mintlify reports ~100ms p90 session creation but does not publish per-command latency.
- **Yjs serialization overhead:** The cost of serializing Y.XmlFragment (ProseMirror schema) to markdown for every readFile call is not measured. This is the critical performance question for a Yjs-backed IFileSystem.
- **Head-to-head agent benchmark:** No benchmark exists comparing a single exec() tool vs 6 semantic tools for identical KB tasks with the same agent. The comparison in D14 is structural, not empirical.
- **structuredContent client adoption:** Whether Claude Code, Cursor, and other agent clients actually consume `structuredContent` from MCP tool responses is unclear. If clients ignore it, enrichment only benefits the text content block.
- **Non-coding agent performance with exec():** How well general-purpose agents (chatbots, RAG pipelines) perform with a single exec tool vs semantic tools has not been studied empirically.

### Out of Scope (per Rubric)

- Building an implementation of the custom IFileSystem
- General MCP design patterns (covered in `mcp-tool-interface-design-agent-performance/`)
- Mintlify business analysis (covered in `mintlify-karpathy-workflow-deep-dive/`)

---

## References

### Evidence Files
- [evidence/d1-source-code-architecture.md](evidence/d1-source-code-architecture.md) — IFileSystem interface, InMemoryFs, OverlayFs, MountableFs, command implementations, shell pipeline
- [evidence/d2-ifilesystem-custom-backend.md](evidence/d2-ifilesystem-custom-backend.md) — Custom backend implementability, method mapping, Yjs integration challenges
- [evidence/d3-mintlify-chromafs-implementation.md](evidence/d3-mintlify-chromafs-implementation.md) — ChromaFs architecture, bootstrap, grep optimization, performance
- [evidence/d4-mcp-server-backend.md](evidence/d4-mcp-server-backend.md) — MCP tool mapping, exec() overhead analysis, hybrid architecture recommendation
- [evidence/d5-overlayfs-draft-isolation.md](evidence/d5-overlayfs-draft-isolation.md) — OverlayFs data structures, commit gap, git branch comparison
- [evidence/d6-stack-compatibility.md](evidence/d6-stack-compatibility.md) — Build format, dependencies, coexistence, maintenance signals
- [evidence/d7-unix-commands-for-kb-agents.md](evidence/d7-unix-commands-for-kb-agents.md) — Command tiers, grep flag comparison, parallel processing
- [evidence/d8-existing-report-updates.md](evidence/d8-existing-report-updates.md) — Four reports needing updates with specific change descriptions
- [evidence/d9-single-mcp-tool-exec.md](evidence/d9-single-mcp-tool-exec.md) — Single exec() tool viability, just-bash-mcp prior art, token efficiency, agent compatibility
- [evidence/d10-multiple-mcp-tools.md](evidence/d10-multiple-mcp-tools.md) — Tool count research, auto-generation pitfalls, composability loss, outcome-oriented design
- [evidence/d11-enrichment-compatibility.md](evidence/d11-enrichment-compatibility.md) — MCP structuredContent spec, command-level vs MCP-level enrichment, exec-enrichment tension
- [evidence/d12-prior-art-mcp-shell-servers.md](evidence/d12-prior-art-mcp-shell-servers.md) — Survey of 7+ MCP shell servers, Mintlify external MCP, novelty assessment
- [evidence/d13-ifilesystem-for-crdt.md](evidence/d13-ifilesystem-for-crdt.md) — YjsFileSystem method requirements, command-to-method mapping, DirectConnection issues, materialized cache
- [evidence/d14-comparison-justbash-vs-custom-mcp.md](evidence/d14-comparison-justbash-vs-custom-mcp.md) — Side-by-side comparison for read/search/list/edit/compound operations, hybrid architecture

### External Sources
- [just-bash GitHub repository](https://github.com/vercel-labs/just-bash) — Source code (cloned at commit d6a5ff0, v2.14.0)
- [bash-tool GitHub repository](https://github.com/vercel-labs/bash-tool) — Vercel AI SDK wrapper for just-bash
- [Mintlify: How we built a virtual filesystem for our Assistant](https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant) — ChromaFs architecture blog post (2026-04-02)
- [just-bash npm registry](https://www.npmjs.com/package/just-bash) — Package metadata (v2.14.0, 18.8MB, 15 deps)
- [Introducing bash-tool for filesystem-based context retrieval](https://vercel.com/changelog/introducing-bash-tool-for-filesystem-based-context-retrieval) — Vercel changelog
- [InfoQ: Vercel Open-Sources Bash Tool for Context Retrieval](https://www.infoq.com/news/2026/01/vercel-bash-tool/) — Industry coverage
- [just-bash-mcp](https://github.com/guillaumemaka/just-bash-mcp) — MCP server wrapping just-bash with single execute_bash tool (MIT)
- [MCP Spec: Tools (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) — structuredContent and outputSchema specification
- [Microsoft Research: Tool-space interference](https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era-designing-for-agent-compatibility-at-scale/) — Tool count vs agent performance (1,470 server survey)
- [Why CLI Tools Are Beating MCP for AI Agents](https://jannikreinhard.com/2026/02/22/why-cli-tools-are-beating-mcp-for-ai-agents/) — Token efficiency analysis (35x CLI advantage)
- [MCP Tool Design: Why Your AI Agent Is Failing](https://dev.to/aws-heroes/mcp-tool-design-why-your-ai-agent-is-failing-and-how-to-fix-it-40fc) — Tool count best practices, outcome-oriented design
- [Hocuspocus DirectConnection issue #832](https://github.com/ueberdosis/hocuspocus/issues/832) — State corruption with DirectConnection + WebSocket debounce

### Related Research
- [virtualized-mcp-filesystem-servers/](../virtualized-mcp-filesystem-servers/) — Who has built virtualized MCP filesystem servers (needs update with just-bash findings)
- [mcp-tool-interface-design-agent-performance/](../mcp-tool-interface-design-agent-performance/) — Filesystem vs semantic MCP tools (needs update with "virtual shell" pattern)
- [mintlify-karpathy-workflow-deep-dive/](../mintlify-karpathy-workflow-deep-dive/) — Mintlify capability analysis (needs enrichment with ChromaFs implementation details)
