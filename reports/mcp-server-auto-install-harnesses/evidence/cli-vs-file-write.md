# Evidence: CLI vs Direct Config-File-Write — Deep Comparison

**Dimension:** Dim 2 (CLI install commands) + Dim 3 (direct config-write) — comparative analysis
**Date:** 2026-04-18 (follow-up pass)
**Sources:** Vendor docs + OpenAI Codex OSS Rust source (`codex-rs/cli/src/mcp_cmd.rs`) + Claude Code GitHub issue tracker + Cursor forum

**Vendor-bias flags:**
- Claude Code: closed-source binary; behavior claims depend on docs + GH issues
- Codex: OSS Rust source is primary truth; high-confidence claims
- Cursor: closed-source CLI; docs + forum only

---

## Summary matrix

| Aspect | Claude Code (`claude mcp add`) | Codex (`codex mcp add`) | Cursor CLI (no `add`) | Direct file-write |
|--------|-------------------------------|-------------------------|----------------------|-------------------|
| Schema validation | YES (flag-level) | YES — name `[A-Za-z0-9_-]+`; `--url` XOR `-- cmd` via clap `ArgGroup` (source) | N/A | Manual |
| Atomic write | UNCERTAIN — Windows corruption bugs suggest unsafe (#28842, #29036, #29153, #29217) | UNCERTAIN — typed `ConfigEditsBuilder` round-trip; impl not read | N/A | Caller's responsibility |
| Idempotency on duplicate `add` | **ERRORS** `already exists` at `--scope user` (#35144) | **Overwrites silently** — `servers.insert(name, new_entry)` (source) | N/A | Caller's responsibility |
| Exit codes documented | Only `claude auth status` (0/1) is documented | NOT documented; `anyhow::Result` → nonzero on any error | NOT documented | — |
| Handshake after add | UNCERTAIN — not documented | **YES for OAuth HTTP**: probes `oauth_login_support()`, may start OAuth flow (source) | N/A | NO |
| Auth side-effect | `add-from-claude-desktop` import only | OAuth browser flow + token storage via `mcp_oauth_credentials_store_mode` (source) | `cursor agent mcp login` separate verb | NO |
| Headless / CI suitable | YES (`-p` mode; `--mcp-config` + `--strict-mcp-config` for CI) | YES for stdio; OAuth HTTP `add --url` may hang in CI | **NO** — requires `.workspace-trusted` + `mcp-approvals.json` that CI lacks (forum #138036) | YES (fully offline) |
| Requires binary on PATH | YES | YES | YES | NO |
| Schema migration | UNCERTAIN | Typed serde round-trip implies forward-compat | N/A | NO |

---

## Claude Code (`claude mcp add`) — deep dive

**Intended use.** Docs frame it as the default install path for interactive users. For CI / headless, docs explicitly route to `--mcp-config <file> --strict-mcp-config` — but that's NOT install-persistence, it's runtime-scoped ("ignore ambient, load only this file"). Per CLI reference: *"Only use MCP servers from `--mcp-config`, ignoring all other MCP configurations."*

**Beyond file-write.**
- Flag-level validation (transport/scope/env/header)
- Scope routing: `local` → `~/.claude.json` projects-path key; `project` → `.mcp.json`; `user` → `~/.claude.json` top-level `mcpServers`
- `add-from-claude-desktop` imports from `claude_desktop_config.json` on macOS + WSL
- **Duplicate detection by command + args, NOT name or env** per v2.1.71 regression [issue #32549](https://github.com/anthropics/claude-code/issues/32549) — two servers with identical commands but distinct env are silently deduped

**Idempotency.** Second `add` of same name at `--scope user` errors with `"already exists in user config"` (confirmed in [#35144](https://github.com/anthropics/claude-code/issues/35144)). UNCERTAIN whether identical behavior at `--scope project` / `--scope local`.

**Exit codes.** UNCERTAIN. Only `claude auth status` documents 0/1. `claude mcp *` exit semantics are not in the CLI reference. Scripts that dispatch on exit code 1-vs-2-vs-N are relying on undocumented behavior.

**Concurrent-write corruption (critical finding).** Issues [#28842](https://github.com/anthropics/claude-code/issues/28842), [#28847](https://github.com/anthropics/claude-code/issues/28847), [#29036](https://github.com/anthropics/claude-code/issues/29036), [#29153](https://github.com/anthropics/claude-code/issues/29153), [#29217](https://github.com/anthropics/claude-code/issues/29217) all report `.claude.json` corruption under concurrent writes. Windows particularly affected (`rename()` returns `EPERM` when another process holds a handle). **An installer running `claude mcp add` concurrently with a live `claude` session risks corrupting config.** Empirical evidence suggests no OS-agnostic atomic-write guarantee.

**Implication:** For an installer that writes during a live session (e.g., hot-install via MCP tool call while agent is running), `claude mcp add` is actively risky. A self-owned file-write with known atomic-rename primitives can be SAFER.

**Prefer over file-write when:**
- You want scope-routing logic "just work"
- You want `add-from-claude-desktop` migration
- Interactive one-off from a terminal

**`--mcp-config` + `--strict-mcp-config` role.** Genuinely distinct third path — **runtime config, no install persistence.** CI scripts pinning exact MCP servers for one invocation should prefer it because (a) no race on `.claude.json`, (b) config is versioned alongside the workflow file, (c) reproducible.

---

## Codex (`codex mcp add`) — deep dive (source-backed)

**Direct source read from `codex-rs/cli/src/mcp_cmd.rs` at github.com/openai/codex:**

- **Name validation** (`validate_server_name`): accepts `[A-Za-z0-9_-]+`, rejects empty and anything else with `invalid server name '{name}' (use letters, numbers, '-', '_')`
- **Transport mutex** via clap `ArgGroup` — `--url` XOR trailing `-- cmd` enforced at parse time
- **Typed TOML round-trip**: loads existing servers as `BTreeMap<String, McpServerConfig>`, inserts new entry, rewrites via `ConfigEditsBuilder::new(&codex_home).replace_mcp_servers(&servers).apply()`. Typed round-trip preserves user comments/formatting better than naive `serde_toml::to_string` — the typed builder exists specifically for this.
- **OAuth post-add side-effect**: `oauth_login_support(&transport).await` probes the HTTP server; if supported, prints *"Detected OAuth support. Starting OAuth flow…"* and triggers `perform_oauth_login_retry_without_scopes(...)`. **Genuine post-write verification that file-write cannot replicate.**

**Idempotency.** Source is unambiguous:
```rust
servers.insert(name.clone(), new_entry);
```
`BTreeMap::insert` with same key **OVERWRITES silently, returns 0.** This is the **opposite of Claude Code's "already exists" error.** CI scripts that re-run `codex mcp add` on an existing name get idempotent overwrite, not failure.

**Exit codes.** Not documented. Impl uses `anyhow::Result` throughout; any `bail!` or `.context()` error bubbles to process exit with nonzero. No documented taxonomy of `1=already-exists`, `2=bad-flag`, etc.

**Atomic write.** UNCERTAIN — `ConfigEditsBuilder` is a second-order abstraction not directly read. Typed-round-trip pattern implies the team thought about it, but tmp+rename not confirmed without reading `codex-rs/config/src/edit.rs`.

**`--mcp-config` equivalent?** Codex has `--config key=value` overrides via `CliConfigOverrides`; docs mention `profiles` in `config.toml`; but no "strict/isolation" flag matching Claude Code's `--strict-mcp-config` surfaced in docs. UNCERTAIN — may exist but not documented on the MCP reference page.

**Prefer over file-write when:**
- You want typed-TOML round-trip preservation of comments / unrelated keys
- You want OAuth auto-flow for HTTP servers (significant — file-write cannot initiate OAuth)
- CI-friendly for stdio servers specifically (no hang)

---

## Cursor CLI (no `add` verb)

**Why missing?** Not documented. The MCP docs route install through:
1. **Marketplace "Add to Cursor"** one-click deep-link
2. **Edit `.cursor/mcp.json` or `~/.cursor/mcp.json`** directly
3. **`vscode.cursor.mcp.registerServer()`** via the Extension API — **a fourth install mechanism** aimed at "enterprise environments and automated setup workflows" per Cursor docs. Not CLI, not file, not marketplace.

No public GitHub issue was found requesting `cursor agent mcp add`. Cursor's CLI source is not OSS.

**What to use instead:** direct file write to `.cursor/mcp.json` + `cursor agent mcp enable <id>` (the `enable` verb operates on servers already in config).

**Headless/CI gap — important.** Forum [#138036](https://forum.cursor.com/t/138036) documents that `cursor-agent mcp list` in CI returns `"No MCP servers configured"` even with config present — because Cursor requires per-workspace-hash approval files (`.workspace-trusted`, `mcp-approvals.json`) that are missing on fresh CI runners. Workarounds involve reverse-engineering the approval-hash algorithm from the binary — fragile and unsupported. **Cursor CLI is effectively not installer-friendly for headless pipelines today.**

---

## Claude Desktop Chat/Cowork (no CLI — baseline context)

Install paths:
1. Edit `claude_desktop_config.json` directly
2. MCPB bundle (`.mcpb` archive, one-click via Settings → Extensions)
3. Connectors UI

**No CLI exists. No public plans for one.** MCPB is Anthropic's first-party response to the installer-friendly gap for desktop clients — explicitly modeled on Chrome `.crx` / VS Code `.vsix`.

---

## When to use CLI vs file-write — decision guide

### Choose CLI when:
1. You want auth/OAuth side effects (Codex HTTP servers — can't replicate via file-write)
2. You want schema migration safety for whatever the vendor deems the config format today (Codex's typed TOML round-trip is a clear win)
3. You want interactive duplicate-detection (Claude Code `--scope user`)
4. One-off install from a terminal session where the binary is already on PATH

### Choose file-write when:
1. **Cross-harness batch install** — one Node/Python installer writes `.mcp.json` + `.cursor/mcp.json` + `~/.codex/config.toml` + `claude_desktop_config.json` in one process; spawning 4 CLIs is slower and adds version-compat burden per harness
2. **Binary not yet installed** — `postinstall` in an npm package that configures MCP before the harness is itself installed; classic `git clone && make setup` flow
3. **Git-versioned config as code** — `.mcp.json` checked into project root; review-friendly diffs
4. **Sandbox / VM contexts** — Docker `ENTRYPOINT`, CI runner containers, Vercel Sandbox microVMs: CLI presence not guaranteed
5. **Surgical rewrites** — dev-mode replacing a single entry is harder via subcommand (requires `remove` then `add`); single file-write can diff-and-replace one key
6. **Concurrency-sensitive contexts** — Claude Code's `.claude.json` concurrent-write bugs mean a CLI call can corrupt config; file-write through your own `fs.writeFileSync` with known atomicity is sometimes safer

### Neither when:
- Target is Cursor CLI in CI → use file-write + accept the agent won't load MCP until approval file is also materialized (or switch harness)
- Target is Claude Desktop Chat → MCPB bundle is the installer-grade answer; CLI doesn't exist

---

## Cross-harness observations

1. **Typed config file is the dominant substrate.** Every harness has a canonical JSON/TOML file. The CLI is a thin writer; file-write is always supported. **Direct file-write remains the universal fallback** — works when binaries aren't installed, across OSes, for cross-harness batch installers.

2. **Closed-source vs OSS matters for installer design.** Codex source is public → idempotency + validation + OAuth side-effect are verifiable. Claude Code + Cursor are closed; behavior must be inferred from docs + bug tracker. For installer trust, Codex CLI is most CI-trustable; Claude Code + Cursor CLIs should be probed for regressions per release.

3. **Idempotency semantics diverge sharply.**
   - Codex: `BTreeMap::insert` → **overwrites silently**
   - Claude Code: `"already exists in user config"` → **errors**
   - An installer wrapping both CLIs cannot assume uniform duplicate behavior — must normalize in the wrapper.

4. **Third paths exist and matter:**
   - Claude Code's `--mcp-config` + `--strict-mcp-config` — runtime-scoped, not install-persistent
   - Cursor's `vscode.cursor.mcp.registerServer()` Extension API — programmatic IDE extension install

5. **Post-install verification is rare.** Only Codex does a handshake (OAuth HTTP probe). Claude Code and Cursor CLIs write-and-exit. File-write has no such step.

---

## Gaps / follow-ups

- **UNCERTAIN** Claude Code atomic-write guarantees per OS. Windows corruption bugs strongly suggest unsafe. Close with: empirical test of two concurrent `claude mcp add` processes on macOS/Linux/Windows OR reading the `@anthropic-ai/claude-code` npm package sourcemap (March 31, 2026 leak reported in websearch)
- **UNCERTAIN** Exit-code taxonomy for both CLIs. Close with: empirical test matrix — duplicate add, missing flag, invalid name, unwritable config dir, bad transport URL
- **UNCERTAIN** `ConfigEditsBuilder` atomicity in Codex. Close with: read `codex-rs/config/src/edit.rs`
- **UNCERTAIN** `--mcp-config` equivalent in Codex. Close with: `codex --help` full inspection
- **Cursor `add` verb roadmap:** no GitHub issue requesting it; unclear if Cursor considers this a gap or design decision (Extension API + Marketplace intended to substitute)

---

## Primary sources (all accessed 2026-04-18)

- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference)
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)
- Claude Code GH issues: [#28842](https://github.com/anthropics/claude-code/issues/28842), [#28847](https://github.com/anthropics/claude-code/issues/28847), [#29036](https://github.com/anthropics/claude-code/issues/29036), [#29153](https://github.com/anthropics/claude-code/issues/29153), [#29217](https://github.com/anthropics/claude-code/issues/29217) (concurrent-write corruption), [#32549](https://github.com/anthropics/claude-code/issues/32549) (dedup regression), [#35144](https://github.com/anthropics/claude-code/issues/35144) (user-scope load bug)
- **OpenAI Codex Rust source** (`codex-rs/cli/src/mcp_cmd.rs` at [github.com/openai/codex](https://github.com/openai/codex)) — primary for Codex behavior claims
- [Codex MCP docs](https://developers.openai.com/codex/mcp)
- [Codex CLI reference](https://developers.openai.com/codex/cli/reference)
- [Codex config reference](https://developers.openai.com/codex/config-reference)
- [Cursor CLI MCP docs](https://cursor.com/docs/cli/mcp)
- [Cursor MCP docs](https://cursor.com/docs/context/mcp)
- [Cursor forum #138036](https://forum.cursor.com/t/138036) (CI MCP approval gap)
- [modelcontextprotocol/mcpb README](https://github.com/modelcontextprotocol/mcpb)
