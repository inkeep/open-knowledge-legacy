# Evidence: Codex MCP Roots Capability — Source-Level Audit

**Dimension:** Does Codex (CLI + IDE extension) advertise the MCP `roots` capability? What does it return on `roots/list`? Does it emit `notifications/roots/list_changed`?
**Date:** 2026-04-18
**Commit audited:** `e3f44ca3b30f85c139f717d271fa6f0e5aa64560` (openai/codex main branch HEAD)
**Sources:** Direct Rust source read of `codex-rs/` modules

---

## Bottom-line verdict

**Codex does NOT advertise the `roots` MCP capability. At all. Anywhere.**

| Aspect | Finding |
|---|---|
| `roots` capability declared at `initialize` | **NO** (field is `None`, serialized out of the JSON) |
| `listChanged` advertised | N/A (capability omitted entirely) |
| Handler for `roots/list` request | **NO** (`list_roots` method not implemented in `ClientHandler`) |
| Sends `notifications/roots/list_changed` | **NEVER** (zero emit-side code paths) |
| `--add-dir` paths → MCP roots | **NO** (Codex's internal "roots" vocabulary is orthogonal to MCP roots) |

**Servers that call `roots/list` against Codex receive a framework-level "method not supported" error.** Codex's `cwd` on the stdio child-spawn is the only signal of "which project" — same situation as pre-PR-#207 baseline.

---

## Findings

### Finding 1: `ClientCapabilities.roots = None` — single production call site
**Confidence:** CONFIRMED
**Evidence:** [`codex-rs/codex-mcp/src/mcp_connection_manager.rs:1400-1419`](https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/mcp_connection_manager.rs)

```rust
let params = InitializeRequestParams {
    meta: None,
    capabilities: ClientCapabilities {
        experimental: None,
        extensions: None,
        roots: None,          // ← capability omitted; serde drops the field
        sampling: None,
        elicitation,
        tasks: None,
    },
    client_info: Implementation {
        name: "codex-mcp-client".to_owned(),
        version: env!("CARGO_PKG_VERSION").to_owned(),
        title: Some("Codex".into()),
        description: None,
        icons: None,
        website_url: None,
    },
    protocol_version: ProtocolVersion::V_2025_06_18,
};
```

**Exhaustiveness confirmed:** `grep -rn RootsCapability codex-rs/` returns zero matches. The type is never imported or constructed anywhere in the Codex workspace.

This single call site is the production path for CLI, TUI, exec, app-server, and IDE-extension hosts. No second branch.

### Finding 2: `list_roots` is not implemented in Codex's ClientHandler
**Confidence:** CONFIRMED
**Evidence:** [`codex-rs/rmcp-client/src/logging_client_handler.rs:37-136`](https://github.com/openai/codex/blob/main/codex-rs/rmcp-client/src/logging_client_handler.rs)

Codex's `LoggingClientHandler` implements the following rmcp `ClientHandler` methods:
- `create_elicitation`
- `on_cancelled`, `on_progress`
- `on_resource_updated`, `on_resource_list_changed`
- `on_tool_list_changed`, `on_prompt_list_changed`
- `on_logging_message`
- `get_info`

**`list_roots` is NOT overridden.** The rmcp framework default handles it — since `roots` capability was never declared, a spec-compliant server won't call `roots/list`, and if one does, it gets the framework's "method not supported" error.

### Finding 3: `notifications/roots/list_changed` is never emitted
**Confidence:** CONFIRMED (by exhaustive grep)
**Evidence:** `grep -rn "RootsListChanged\|roots/list_changed" codex-rs/rmcp-client/` returns zero matches. The only hit for `RootsListChangedNotification` is in `codex-rs/mcp-server/src/message_processor.rs:177-178` — which is Codex acting as an MCP **server** receiving the notification FROM its clients (reverse direction; irrelevant here).

**Implication:** Even if Codex's `--add-dir` were wired to MCP roots (it isn't), no notification channel exists to tell downstream MCP servers about changes.

### Finding 4: Codex's internal "roots" vocabulary is orthogonal to MCP roots
**Confidence:** CONFIRMED
**Evidence:** `codex-rs/app-server/src/fuzzy_file_search.rs:23`, `sandbox_workspace_write.writable_roots` config, `per_cwd_extra_user_roots` for skills

Codex has several internal "roots" concepts:
- `sandbox_workspace_write.writable_roots` — seatbelt/bubblewrap write permissions
- `per_cwd_extra_user_roots` — skills-related paths
- `fuzzy_file_search.roots` — file search scope

**None of these are piped into `ClientCapabilities.roots`.** The two systems share a word, not a wire.

`--add-dir` at Codex startup affects sandbox permissions + search scope, not MCP client capabilities. The MCP child-process `cwd` is the startup cwd (or `--cd` override), not the expanded `--add-dir` set.

### Finding 5: stdio child `cwd` is set correctly — the only "project" signal
**Confidence:** CONFIRMED
**Evidence:** `codex-rs/codex-mcp/src/mcp_connection_manager.rs:1506` calls `RmcpClient::new_stdio_client` which sets `cwd` on the spawned child process

The OS-level working directory of the MCP subprocess is Codex's startup cwd / `--cd` path. MCP servers can read `process.cwd()` and get a reliable signal — same as pre-PR-#207 baseline behavior.

---

## Critical implication for our spec

**PR #207's strict-routing contract breaks entirely against Codex.**

PR #207's `resolveCwd` logic:
```typescript
if (explicit) return ...;
if (bypassProjectSelection) return startupCwdPromise;
try { roots = await loadRoots(); } catch { throw ROOTS_UNAVAILABLE_ERROR; }
if (roots.length === 0) throw NO_CLIENT_ROOTS_ERROR;
if (roots.length > 1) throw MULTIPLE_ROOTS_ERROR;
return roots[0];
```

Against Codex:
- Client never declared `roots` capability → `loadRoots()` fails or returns empty
- Falls through to `ROOTS_UNAVAILABLE_ERROR` or `NO_CLIENT_ROOTS_ERROR`
- **Every single tool call from Codex fails** with "Client roots unavailable; pass cwd explicitly."

The agent would see this error and have to pass `cwd` on every subsequent tool call. Agents generally don't do this unprompted — they'd surface the error to the user as "tool failed."

**Three possible resolutions:**

1. **PR #207 adds a `processCwdFallback` option** that activates when roots are unavailable. Restores current (pre-#207) behavior for Codex-class clients. Loses the "strict routing" promise for those clients — but unavoidable given the source evidence.
2. **We ship `--project <abs-path>` arg in Codex config.toml entries.** `init` bakes the project path into the `codex mcp add` output. MCP picks it up, passes to `bypassProjectSelection` path. Works without PR #207 changes.
3. **We document Codex as "needs explicit `cwd` on every tool call"** and let it be a known UX issue until Codex ships `roots` capability support. Least work, worst UX.

Option 2 extends my earlier `--project` recommendation from "Claude Desktop Chat only" to "Claude Desktop Chat + Codex (both CLI and IDE ext)."

---

## Cross-reference to the spec's Decision 2 / D-5

The earlier analysis concluded `--project` arg was needed ONLY for Claude Desktop Chat (no workspace concept). This new finding **extends it to Codex** — same mechanism, different reason:
- Claude Desktop Chat: has no workspace concept, no way to advertise roots
- Codex: has workspaces but doesn't implement the `roots` capability

The arg-baking approach is the same for both.

**Updated count of harnesses needing `--project` arg at install:**
- Claude Desktop Chat ✓
- Codex CLI ✓ (new)
- Codex Desktop / IDE extension ✓ (new, shares config)
- Claude Cowork — UNCERTAIN pending in-VM Claude Code findings (SA-2)
- Claude Code CLI — UNCERTAIN pending SA-2 findings (likely works via roots)
- Cursor CLI + Desktop — UNCERTAIN pending SA-2 (Cursor declares roots.listChanged=false per prior evidence, but does declare capability)

---

## Gaps / still UNCERTAIN

- **Exact error code/shape** returned by rmcp framework for unsupported methods — framework-level behavior inferred, not quoted. The rmcp crate is a vendored git dependency in Codex's `Cargo.toml`; would need to open that separately to confirm the exact JSON-RPC error response.
- **Future direction:** `grep` for TODO/FIXME on roots in codex-rs returns nothing. Not pending, not planned. Stable "not implemented" — fixing requires an upstream change in OpenAI's Codex priorities.

---

## References

- Modules read (all in `codex-rs/`):
  - `rmcp-client/src/{rmcp_client.rs, logging_client_handler.rs, elicitation_client_service.rs, lib.rs}`
  - `codex-mcp/src/mcp_connection_manager.rs`
  - `mcp-server/src/message_processor.rs` (inverse direction)
  - `rmcp-client/tests/{resources.rs, streamable_http_recovery.rs}` (exhaustiveness check)
  - `app-server/src/fuzzy_file_search.rs`
- Commit audited: `e3f44ca3b30f85c139f717d271fa6f0e5aa64560` (main HEAD on 2026-04-18)
- Cross-file searches run: `ClientCapabilities`, `RootsCapability`, `roots`, `list_changed`, `list_roots`, `ListRootsResult`, `roots/list`, `notifications/roots`, `RootsListChanged`, `new_stdio_client`, `new_streamable_http_client`
