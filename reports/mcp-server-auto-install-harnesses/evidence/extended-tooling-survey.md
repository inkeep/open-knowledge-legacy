# Evidence: Extended Cross-Harness Installer Tooling Survey

**Dimension:** Dim 10 (cross-harness install tooling / registries) — follow-up pass
**Date:** 2026-04-18
**Sources:** GitHub, npm, PyPI, Homebrew, blog posts, official MCP server READMEs

**Vendor-bias flags:** Per tool — commercial maintainers flagged individually.

---

## New tools discovered (not in initial pass)

### `install-mcp` (supermemoryai) — leading candidate
**Confidence:** CONFIRMED
**Evidence:** [github.com/supermemoryai/install-mcp](https://github.com/supermemoryai/install-mcp), [README](https://github.com/supermemoryai/install-mcp/blob/main/README.md)

- **What:** Cross-client CLI that installs MCP servers (including remote URLs with OAuth auto-flow) into 18 client harnesses
- **Harness coverage (of our 7):** **ALL 7 COVERED** — Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Codex, Gemini CLI. Plus 11 others (Cline, Roo-Cline, Zed, Warp, Goose, OpenCode, Witsy, Enconvo, Aider, Aider-Desk, Droid).
- **Headless:** PARTIAL — `--client`, `--project`, `--header`, `--oauth yes/no` flags skip most prompts; interactive OAuth prompt still appears without `--oauth=yes`
- **Install mechanism:** Config-write per-client (JSON/TOML). Supports bare package names, scoped packages, full commands, and remote URLs (auto-wraps with `mcp-remote`)
- **Maturity:** 183 stars; v1.10.0 (Sep 2025); 113 commits; **MIT license**
- **Maintainer bias:** Supermemory is a commercial memory-MCP vendor; core CLI is generic and reusable but maintenance bus-factor tied to Supermemory

### `mcpm.sh` (pathintegral-institute) — best automation story
**Confidence:** CONFIRMED (headless flags); UNCERTAIN (full Claude Code / Codex coverage)
**Evidence:** [github.com/pathintegral-institute/mcpm.sh](https://github.com/pathintegral-institute/mcpm.sh), [pypi.org/project/mcpm](https://pypi.org/project/mcpm/)

- **What:** Python CLI package manager + registry for MCP servers across clients; profiles, router, client detection (`mcpm client ls`)
- **Harness coverage:** Claude Desktop, Cursor, Windsurf, VS Code, plus Gemini CLI and Codex "in development." Claude Code and Codex status unclear in public docs as of 2026-04-18
- **Headless:** **YES** — `MCPM_NON_INTERACTIVE=true`, `MCPM_FORCE=true`, `MCPM_JSON_OUTPUT=true`, per-command `--force`, and an **`llm.txt` for agent consumption**. Purpose-built for automation.
- **Install mechanism:** Config-write plus profile-based routing (proxies multiple servers through one endpoint)
- **Maturity:** 928 stars; v2.14.0 (Mar 2026); 55 releases; **MIT license**; vendor-neutral (`pathintegral.institute`)

### ToolHive (stacklok) — enterprise-grade, probably overkill
**Confidence:** CONFIRMED existence; UNCERTAIN harness coverage
**Evidence:** [github.com/stacklok/toolhive](https://github.com/stacklok/toolhive)

- **What:** Enterprise MCP platform (desktop app + CLI `thv` + Kubernetes operator) that **containerizes MCP servers** and writes client configs
- **Harness coverage:** "Claude Code, Cursor, GitHub Copilot" explicitly; CLI `thv client` subcommand
- **Headless:** YES (CLI-driven)
- **Maturity:** 1.7k stars; 321 releases (v0.21.0, Apr 2026); **Apache-2.0**
- **Overkill unless containerization is in scope.** Stacklok has a commercial angle.

### Docker MCP Toolkit (`docker mcp` plugin)
**Confidence:** CONFIRMED existence; UNCERTAIN harness coverage
**Evidence:** [github.com/docker/mcp-gateway](https://github.com/docker/mcp-gateway), [docs.docker.com/ai/mcp-catalog-and-toolkit](https://docs.docker.com/ai/mcp-catalog-and-toolkit/toolkit/)

- Docker CLI plugin that registers a gateway and writes client config via `docker mcp client connect <name>`
- Claude Desktop, Cursor, VS Code confirmed; Claude Code, Codex, Windsurf not explicitly listed
- Part of Docker Desktop 4.59+; **Apache-2.0**
- Ties install story to Docker Desktop

### MCPBar (mcp.bar) — UNCERTAIN
**Confidence:** UNCERTAIN — blog-level signal only
**Evidence:** [mcp.bar/blog/introducing-mcpbar](https://www.mcp.bar/blog/introducing-mcpbar)

- Open registry with standardized `mcp.json` manifest, claims one-command install across clients
- Coverage: Claude, Cline, Cursor, Windsurf, Witsy "and more"
- No verified OSS repo / license / maintenance signal located. **Do not rely on.**

### Anti-recommendations
- **`mcpm` (ascii27) — NOT `mcpm.sh`.** [github.com/ascii27/mcpm](https://github.com/ascii27/mcpm), [pypi.org/project/mcp-manager](https://pypi.org/project/mcp-manager/). 1 star; GPLv3; last release Apr 2025. **License contagion risk + bus-factor-of-1.**
- **`@aurracloud/mcp-cli`, `@mcp-installer/cli`, `@mcp-use/cli`** — npm pages returned 403 on 2026-04-18; existence indicated but unverifiable. UNCERTAIN.

### Aggregators (not installers, different category)
- **`yamcp` (hamidra)** — groups MCPs into one unified server; aggregator, not installer
- **`@modelcontextprotocol/inspector`** — debugging tool

---

## Updated top-3 reuse candidates (revised from initial pass)

The initial pass's top-3 was `add-mcp`, Smithery, MCPB. SA-F3 significantly expands the field.

| Rank | Tool | Harness coverage (of 7) | Headless | License | Bus factor | Best-for |
|------|------|-------------------------|----------|---------|------------|----------|
| 1 | **`install-mcp` (supermemoryai)** | 7 of 7 | PARTIAL (OAuth gate) | MIT | Commercial vendor (Supermemory) | Single cross-harness dependency; broadest coverage |
| 2 | **`add-mcp` (Neon)** | 7 of 7 (inferred for Cowork/Codex desktop) | YES (`-y`) | Apache-2.0 | Commercial vendor (Neon) | Scripted multi-write; sync + conflict warnings |
| 3 | **`mcpm.sh` (pathintegral-institute)** | 5+ of 7 (CC/Codex in progress) | YES (env vars) | MIT | Vendor-neutral | Agent-driven install (`llm.txt`, JSON output) |

---

## Implementation patterns worth borrowing

### 1. JSONC parsing for comment preservation
**Source:** [emdash PR #1623](https://github.com/generalaction/emdash/pull/1623) "preserves config when updating MCP servers"

Parsing as JSONC (not strict JSON) preserves user comments and trailing commas when regenerating config. Important for user-edited `.mcp.json` files that may contain non-standard JSON.

### 2. Multi-agent partial-failure reporting
**Source:** emdash read-then-write pattern

Distinguishes read vs write failures and reports per-agent status. **The only published multi-agent partial-failure pattern found.** Borrow: track which harnesses succeeded vs failed, print per-harness status; leave unwritten configs untouched on crash.

### 3. Conflict-warning on merge
**Source:** `add-mcp` `sync` command

Surfaces "conflicting headers/env/args across agents are skipped with a warning." Good UX for cross-harness batch install — user understands why a harness was skipped without having to read diffs.

### 4. Harness detection by config-path probe
**Source:** `mcpm client ls`

Probe known-config-paths for each client (e.g. `~/.cursor/mcp.json`, `~/.codeium/windsurf/mcp_config.json`, `~/.codex/config.toml`, platform-specific `claude_desktop_config.json`). No tool surveyed uses OS-level application registration — filesystem probe is the pattern.

### 5. OAuth kickoff as post-install side-effect
**Source:** `install-mcp` `--oauth=yes` flag; Codex `codex mcp add --url` auto-flow

For HTTP MCP servers, CLI tools can auto-initiate OAuth browser flow right after writing config. A file-write installer cannot replicate this — users must run a separate login command.

### 6. Environment variable automation flags
**Source:** `mcpm.sh` — `MCPM_NON_INTERACTIVE=true`, `MCPM_FORCE=true`, `MCPM_JSON_OUTPUT=true`

Clean pattern for "script-ability" — env vars toggle non-interactive behavior, machine-readable output, and force overrides. Easier to set globally in CI than passing flags on every invocation.

---

## DIY vs reuse picture

### What's already solved in OSS
1. **Config-file write location mapping** per harness (`install-mcp` + `add-mcp` + `mcpm.sh` each encode this)
2. **Remote MCP wrapping** via `mcp-remote` for stdio-only clients
3. **Cursor + VS Code deep-link install URIs** (vendor-supplied)
4. **OAuth flow kickoff** on install (`install-mcp`'s `--oauth=yes`)
5. **Harness detection** by config-path probe (`mcpm.sh`)
6. **Claude-ecosystem bundle format** (`.mcpb`, Claude-centric)

### What a DIY installer must still build
1. **Atomic writes + crash-safe rollback** — no surveyed MCP installer publishes a robust pattern; assume naive `fs.writeFile` everywhere. Borrow from `atomicwrites`-style libraries.
2. **JSONC/TOML/JSON round-trip preserving user comments and formatting** — only emdash's PR hints at it
3. **Post-install activation / trust flows** (Cursor toggle, Claude Code project-scope trust) — nobody automates these
4. **Registry of installers**: no cross-harness manifest standard exists. MCPB (Claude-centric) and MCP Registry's `server.json` (discovery-only) are both partial. A hypothetical "installs-like-X-on-Claude-Code, Y-on-Cursor, Z-on-Codex" manifest is unclaimed.
5. **First-party CLI delegation** (prefer calling `claude mcp add` / `codex mcp add` over hand-writing their configs when available) — nobody unifies this.

### Gaps in the ecosystem
- No cross-harness installer manifest (MCPB is Claude-ecosystem; MCP Registry is discovery-only)
- No rollback-on-partial-failure published pattern
- No tool delegates to first-party CLIs where available
- No tool handles Cursor's post-install enable-toggle automatically

---

## How do established MCP servers tell users to install?

| Server | Install pattern | Notes |
|--------|-----------------|-------|
| **GitHub MCP** | 11-app `installation-guides/` directory of per-harness READMEs ([link](https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/README.md)) | No own installer; no deep-link; per-IDE docs |
| **Notion MCP** | One-liner `npx -y mcp-remote https://mcp.notion.com/mcp` + per-client JSON snippets | OAuth via `/.well-known/oauth-protected-resource` |
| **Linear MCP** | Remote-only — `npx -y mcp-remote https://mcp.linear.app/mcp` | Documented for Claude Code via `--transport http` |
| **Stripe MCP** | `@stripe/mcp` on npm — `npx -y @stripe/mcp --api-key=...` OR hosted at `https://mcp.stripe.com` with OAuth | |

**Prevailing UX pattern:** "one `npx` / `uvx` command, paste JSON per IDE." **No popular server bundles its own cross-harness installer.**

---

## References (all accessed 2026-04-18)

- [github.com/supermemoryai/install-mcp](https://github.com/supermemoryai/install-mcp)
- [github.com/neondatabase/add-mcp](https://github.com/neondatabase/add-mcp)
- [github.com/pathintegral-institute/mcpm.sh](https://github.com/pathintegral-institute/mcpm.sh)
- [pypi.org/project/mcpm](https://pypi.org/project/mcpm/)
- [pypi.org/project/mcp-manager](https://pypi.org/project/mcp-manager/)
- [github.com/ascii27/mcpm](https://github.com/ascii27/mcpm)
- [github.com/stacklok/toolhive](https://github.com/stacklok/toolhive)
- [github.com/docker/mcp-gateway](https://github.com/docker/mcp-gateway)
- [github.com/hamidra/yamcp](https://github.com/hamidra/yamcp)
- [github.com/modelcontextprotocol/mcpb](https://github.com/modelcontextprotocol/mcpb)
- [github.com/modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry)
- [github.com/generalaction/emdash/pull/1623](https://github.com/generalaction/emdash/pull/1623)
- [github.com/github/github-mcp-server/blob/main/docs/installation-guides/README.md](https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/README.md)
- [developers.notion.com/guides/mcp/get-started-with-mcp](https://developers.notion.com/guides/mcp/get-started-with-mcp)
- [linear.app/docs/mcp](https://linear.app/docs/mcp)
- [docs.stripe.com/mcp](https://docs.stripe.com/mcp)
- [mcp.bar/blog/introducing-mcpbar](https://www.mcp.bar/blog/introducing-mcpbar)
