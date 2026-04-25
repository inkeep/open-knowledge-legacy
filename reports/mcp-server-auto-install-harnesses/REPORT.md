---
title: "Auto-Installing an MCP Server + Agent Skill Across AI Coding Harnesses: What's Programmatic, What's Not"
description: "Landscape of programmatic MCP server registration AND Agent Skills installation across 7 AI coding harnesses (Claude Code CLI + Desktop, Claude Cowork, Codex CLI + Desktop, Cursor CLI + Desktop). Covers config-file surfaces, vendor CLI install commands, deep-link URIs, stdio vs HTTP/SSE install shape, OAuth headless friction, DXT/MCPB bundles, cross-harness registries (Smithery, install-mcp, add-mcp, mcpm.sh, MCP Registry), CLI-vs-file-write trade-offs, and the Agent Skills install surface per harness (`npx skills` agent-ID registry, `~/.claude/skills/` reading surfaces, Cowork VM synthetic-filesystem isolation)."
createdAt: 2026-04-18
updatedAt: 2026-04-24
subjects:
  - Model Context Protocol
  - Agent Skills
  - Claude Code
  - Claude Desktop
  - Claude Cowork
  - Codex
  - Cursor
  - Smithery
  - install-mcp
  - add-mcp
  - mcpm.sh
  - npx skills
  - ToolHive
  - MCPB
  - DXT
topics:
  - MCP server installation
  - agent skills installation
  - non-interactive install
  - harness config surfaces
  - deep-link URI schemes
  - OAuth 2.1 headless friction
  - cross-harness installers
  - CLI vs file-write trade-offs
  - enable-by-default behavior
  - cowork vm skill isolation
---

# Auto-Installing an MCP Server + Agent Skill Across AI Coding Harnesses

**Purpose:** For each of 7 AI coding harnesses (Claude Code terminal, Claude Code Desktop, Claude Cowork desktop, Codex terminal, Codex desktop, Cursor CLI, Cursor desktop), characterize the lowest-friction programmatic path to register an MCP server AND an Agent Skill — with emphasis on what's fully non-interactive, what requires one click, and what's an outright wall. Primary-source, factual, with conclusions limited to "what's feasible today."

> **Updates (2026-04-24 Path C pass).** Added a new dimension — **Dim 12: Agent Skills install surface per harness** — driven by a question about whether `npx skills@~1.5.0 add --agent '*'` transitively covers Claude Cowork. Headline finding: **programmatic Agent Skills install for Cowork is NOT supported today** (HIGH confidence). Cowork's VM runs its own per-session synthetic filesystem that does NOT mount the host's `~/.claude/skills/`; `npx skills`'s ~45-agent registry has no `cowork` / `claude-desktop` / `claude-cowork` entry; Anthropic's only sanctioned paths are manual ZIP upload via the Desktop UI or org-admin upload/GitHub-sync for Team+ plans. Also: 6-day refresh against 2026-04-18 findings — bug #26259 (stdio bridge) still open, bug #24433 (per-tool re-approval) confirmed CLOSED "not planned" (framing carries forward from the 2026-04-18 cowork-escape-paths evidence), bug #26952 (`claude://` MCP install) still closed "not planned"; no new Cowork fixes in Claude Code v2.1.116–v2.1.119 (Apr 20–23). See [meta/_changelog.md](meta/_changelog.md) for full details.

> **Updates (2026-04-18 follow-up pass).** The report was extended with three dimensions of additional depth — see [meta/_changelog.md](meta/_changelog.md). Key corrections: (1) Claude Code project-scope trust prompt **is** scriptable-bypassable via pre-staged `.claude/settings.local.json`; (2) Claude Cowork has a per-tool re-approval bug (#24433) worse than the stdio-bridge bug — "Always allow" is never persisted across sessions; (3) Claude Code has 5 documented concurrent-write corruption bugs making direct file-write sometimes SAFER than `claude mcp add`; (4) expanded OSS tool landscape — `install-mcp` (supermemoryai, MIT, covers all 7) and `mcpm.sh` (pathintegral-institute, MIT, best automation story) are stronger reuse candidates than originally surfaced.

---

## Executive Summary

**The seven harnesses collapse to five install surfaces.** Claude Code Desktop is a tab inside the same Electron app as Chat/Cowork but reads a different config file, sharing a schema with Claude Code CLI. Claude Cowork inherits the Chat tab's config via an SDK bridge — no independent install target. Codex CLI + Desktop + IDE extension share one `~/.codex/config.toml`. Cursor CLI and Desktop share `~/.cursor/mcp.json` (user) + `.cursor/mcp.json` (project). Net effect: five distinct config files, three distinct schemas (JSON with `type` discriminator, TOML with `[mcp_servers.*]` tables, JSON with `url`/`command` duck-typing), and one packaged-bundle format (MCPB, Claude Desktop only).

**Fully non-interactive stdio install is solved for all five surfaces via direct config-file write.** Three harness families also ship vendor CLIs (`claude mcp add`, `codex mcp add`, Cursor has no `add`) that provide cleaner ergonomics with idempotency and env-var flags, but the config files are schema-stable and direct writes are officially supported. The OSS tool [`add-mcp`](https://github.com/neondatabase/add-mcp) from Neon is the closest thing to a universal "install to all my AI tools" installer (`-y` for full non-interactive) — it covers all seven harnesses via config-file write. [Smithery](https://github.com/smithery-ai/cli) is the leading registry-backed alternative but with gaps on Claude Cowork and ambiguity on Claude Code terminal vs. Desktop.

**One-click install via URI scheme is Cursor-only among our seven.** `cursor://anysphere.cursor-deeplink/mcp/install?name=...&config=<base64>` writes to the global `~/.cursor/mcp.json` after a user confirmation dialog. A May-2026 security advisory ([GHSA-r22h-5wp2-2wfv](https://github.com/cursor/cursor/security/advisories/GHSA-r22h-5wp2-2wfv)) explicitly hardened the dialog to prevent silent install — so the "one click" is architectural, not incidental. Anthropic has not shipped a `claude://` MCP URI and has explicitly closed that feature request ([#26952](https://github.com/anthropics/claude-code/issues/26952), "not planned"); Codex's `codex://` scheme has no `install` path; VS Code's `vscode:mcp/install` uses the same consent-gated shape but VS Code is out of our scope.

**OAuth HTTP install is a browser wall everywhere.** All seven harnesses follow MCP spec 2025-06-18's authorization-code + PKCE + DCR flow. None implement device-code (RFC 8628) or pre-provisioned refresh-token paths. For headless HTTP MCP install, pre-provisioned bearer tokens in env vars are the only path, and not every harness surfaces a clean injection point: Claude Code terminal and Codex terminal are cleanest (`--header` flag + TOML `env_http_headers` respectively); Claude Desktop/Cowork require the Connectors UI for OAuth and `mcp-remote` bridge args for bearer; Cursor CLI has a confirmed bug ([forum #143045](https://forum.cursor.com/t/cursor-cli-mcp-the-non-interactive-mode-cannot-be-used/143045)) where MCP doesn't activate in `--print` non-interactive mode at all.

**Agent Skills install covers Claude Code cleanly, Cowork not at all.** `npx skills@~1.5.0 add <path> --agent '*' -g -y --copy` writes to `~/.claude/skills/` and Claude Code picks it up on next session — this is the path Open Knowledge and other third-party tools use to ship a SKILL.md today. But the `npx skills` agent-ID registry (~45 targets including `claude-code`, `cursor-agent`, `codex`, `gemini-cli`, `amp`, `opencode`) has no `cowork`, `claude-cowork`, or `claude-desktop` entry — and even transitively via "Claude Code runs inside the Cowork VM," it fails: the Cowork VM does NOT mount the host's `~/.claude/skills/`, it instantiates its own per-session synthetic filesystem that only resolves the 6 built-in Anthropic skills plus ephemeral `local_<uuid>/.claude/skills/` directories that get wiped on session cleanup ([claude-code#31422](https://github.com/anthropics/claude-code/issues/31422)). Anthropic's only sanctioned install paths for Cowork are manual ZIP upload via `Customize > Skills > +` (personal) or org-admin upload/GitHub-sync (Team+ plans) — both human-UI-only, neither scriptable, and both affected by an open "metadata registered but SKILL.md not mounted" bug class (#26254, #31542, #39400) with zero Anthropic-staff engagement. Cursor has no Skills spec; Codex's skill-equivalent (AGENTS.md) is scoped to project files only. **Programmatic skills install today: Claude Code YES, everything else NO.**

**Key Findings:**

- **The 7 harnesses = 5 config-file install surfaces + 1 bundle format (MCPB)** — see "Install Surface Topology" below
- **Stdio install is fully non-interactive via config-file-write for all harnesses**, with caveats:
  - Claude Code project-scope has a TTY trust prompt **but it's scriptable-bypassable** by pre-staging `.claude/settings.local.json` with `enabledMcpjsonServers: ["<name>"]` (per issue #9189)
  - Cursor Desktop is enabled-by-default on fresh workspaces; state lives in `state.vscdb` SQLite (not `mcp.json`) with known bugs
  - Cursor CLI requires explicit `agent mcp enable <id>` post-write
  - Claude Cowork has a per-tool re-approval bug (#24433) that makes it effectively unusable for headless install even when the config writes cleanly
  - MCPB bundles require a double-click confirmation (Claude Desktop Chat only)
- **Cross-harness installer landscape is richer than first thought.** Three credible MIT/Apache-licensed OSS candidates cover all or most of our 7: [`install-mcp`](https://github.com/supermemoryai/install-mcp) (MIT, 7 of 7), [`add-mcp`](https://github.com/neondatabase/add-mcp) (Apache-2.0, 7 of 7 via shared configs), [`mcpm.sh`](https://github.com/pathintegral-institute/mcpm.sh) (MIT, 5+ of 7, best automation story). Smithery is feature-rich but has Cowork + Claude Code terminal gaps. MCPB remains Claude-Desktop-only.
- **Claude Code CLI has documented concurrent-write corruption bugs.** Issues #28842, #28847, #29036, #29153, #29217 all report `.claude.json` corruption under concurrent writes. For installers running during a live session, direct file-write with known atomic-rename can be SAFER than `claude mcp add`.
- **Codex CLI vs Claude Code CLI idempotency diverges** (source-confirmed): Codex `BTreeMap::insert` overwrites silently; Claude Code errors `"already exists"`. Wrappers must normalize.
- **Deep-link install is Cursor-only** among our 7, and intentionally cannot be silent (security advisory). Cursor has a documented **fourth install mechanism** — `vscode.cursor.mcp.registerServer()` Extension API — for "enterprise/automated setup workflows."
- **OAuth HTTP install is a hard wall** — no harness implements a headless OAuth path; bearer-token-in-env is the workaround. Codex `codex mcp add --url` uniquely auto-initiates OAuth browser flow as a post-write side-effect (verified from Rust source).
- **Agent Skills install is Claude Code only** (added 2026-04-24). `npx skills@~1.5.0 add --agent '*' -g` writes `~/.claude/skills/<name>/SKILL.md` and Claude Code resolves it on next session — fully non-interactive. Cowork's VM isolation means this does NOT transitively cover it, and the `npx skills` agent-ID registry has no cowork/desktop entry. For Cowork: manual ZIP upload via the Desktop UI is the only path; ship a download artifact, not an auto-installer. Cursor has no Skills spec equivalent. Codex project-scope AGENTS.md is in-repo, not user-global — a different concept.

---

## Research Rubric

| # | Dimension | Priority | Depth |
|---|-----------|----------|-------|
| 1 | Config-file surface per harness | P0 | Deep |
| 2 | Official CLI install commands | P0 | Deep |
| 3 | Direct config-write + idempotency | P0 | Deep |
| 4 | Deep-link / one-click install URIs | P0 | Moderate |
| 5 | Stdio vs HTTP/SSE install-shape differences | P0 | Deep |
| 6 | Desktop-app install surfaces (DXT/MCPB/packaged ext) | P0 | Deep |
| 7 | OAuth headless-install friction for HTTP/SSE | P0 | Deep |
| 8 | Trust / confirmation gates for stdio | P0 | Moderate |
| 9 | Harness detection | P1 | Moderate |
| 10 | Cross-harness install tooling / registries | P1 | Moderate |
| 11 | Versioning / updates / uninstall | P1 | Light |
| 12 | Agent Skills install surface per harness *(added 2026-04-24)* | P0 | Deep |

**Stance:** Factual-with-conclusions. **Non-goals:** MCP server implementation; agent-framework SDK consumption; Windsurf/Zed/VS Code/Cline; full OAuth server implementation.

---

## Install Surface Topology

The 7 named harnesses collapse to 5 install surfaces:

```
Surface 1: Claude Code (CLI + Desktop "Code" tab)
  ├── ~/.claude.json              (user + local scope, JSON)
  └── <project>/.mcp.json         (project scope, JSON)
  Schema: {"mcpServers":{"<n>":{"type":"stdio|http|sse", ...}}}
  CLI: claude mcp add / add-json / list / remove

Surface 2: Claude Desktop Chat + Cowork
  ├── ~/Library/Application Support/Claude/claude_desktop_config.json  (macOS)
  ├── %APPDATA%\Claude\claude_desktop_config.json                       (Windows)
  └── ~/.config/Claude/claude_desktop_config.json                       (Linux: N/A — no Linux app)
  Schema: {"mcpServers":{"<n>":{"command":"...","args":[],"env":{}}}}
  No dedicated CLI; UI Connectors for remote HTTP; MCPB bundle install (file-open)
  Cowork: auto-bridges this config into a sandboxed VM via SDK layer
         (known stdio bridge bug: anthropics/claude-code#26259)

Surface 3: Codex (CLI + Desktop + IDE Extension)
  ├── ~/.codex/config.toml            (user scope)
  └── <project>/.codex/config.toml    (project scope, trusted-projects only;
                                        NOT honored by Desktop — openai/codex#13025)
  Schema: [mcp_servers.<n>] command=/url= + args/env/http_headers/...
  CLI: codex mcp add / list / remove / login / logout

Surface 4: Cursor (Desktop + CLI cursor-agent)
  ├── ~/.cursor/mcp.json              (user/global)
  └── <project>/.cursor/mcp.json      (project)
  Schema: {"mcpServers":{"<n>":{command|url, args|headers, env, ...}}}
  CLI: cursor agent mcp list / list-tools / enable / disable / login
       (NO add/install verb — file-write is the only add path)
  Deep-link: cursor://anysphere.cursor-deeplink/mcp/install?name=...&config=<base64>

Surface 5: MCPB bundles (Claude Desktop only, excluding Code tab)
  .mcpb = ZIP(manifest.json + server bundle)
  Install: double-click or Settings → Extensions (both require confirmation)
  No CLI / URI-triggered install path documented
```

**Claude Cowork is not an independent surface.** Per [issue #26259](https://github.com/anthropics/claude-code/issues/26259), Cowork runs the agent in a sandboxed VM and auto-bridges local stdio servers from the host `claude_desktop_config.json` as `"type":"sdk"` servers — with a known bug that stdio Desktop Extensions are not always reliably bridged.

---

## The Matrix: 7 Harnesses × 3 Install Mechanisms

For each harness, ranked from least-friction to most-friction path. "Non-interactive" = fully scriptable with no TTY/GUI interaction after install starts.

| Harness | Preferred install | Non-interactive? | Fallback | Notes |
|---------|-------------------|------------------|----------|-------|
| **Claude Code terminal** | `claude mcp add --transport stdio --scope user <n> -- <cmd>` | YES | Direct write to `~/.claude.json` | Project-scope `.mcp.json` has a one-time TTY trust prompt on first session |
| **Claude Code Desktop** (Code tab) | Write `~/.claude.json` directly | YES | Use `claude` CLI if installed (not bundled) | Shares config with CLI; desktop app does not ship `claude` binary on PATH |
| **Claude Cowork desktop** | Write host `claude_desktop_config.json` | PARTIAL | MCPB bundle (double-click) | Stdio bridge bug (#26259) may block; prefer MCPB on Chat, test in Cowork |
| **Codex terminal** | `codex mcp add <n> [--env K=V] [--url URL] [--bearer-token-env-var VAR] -- <cmd>` | YES | Direct TOML write to `~/.codex/config.toml` | Single config covers Desktop + IDE too |
| **Codex desktop** | Same as Codex terminal (shared config) | YES | GUI "Settings → Integrations & MCP" | Project-scope `.codex/config.toml` NOT honored by Desktop (#13025) |
| **Cursor CLI** (`cursor-agent`) | Write `~/.cursor/mcp.json` | PARTIAL | `cursor agent mcp enable <id>` (activate post-write) | No `mcp add` CLI verb; forum bug #143045: MCP inactive in `--print` mode |
| **Cursor desktop** | Write `~/.cursor/mcp.json` | PARTIAL | Deep-link URI (requires click) | Settings toggle + per-tool approval UI unless `~/.cursor/permissions.json` pre-staged |

**Deep-link availability:** Cursor only (`cursor://anysphere.cursor-deeplink/mcp/install`). No Claude / Codex equivalents.

**Packaged-bundle availability:** MCPB (`.mcpb` ZIP) for Claude Desktop Chat/Cowork only — Claude Code Desktop "Code tab" does NOT load MCPB bundles per Anthropic's own carve-out in [the desktop docs](https://code.claude.com/docs/en/desktop). No other harness implements a `.mcpb` loader.

---

## Detailed Findings

### Dim 1 — Config-file surface per harness

**Finding:** Five config-file schemas across the five surfaces, with three distinct formats.

**Evidence:** [evidence/anthropic-harnesses.md](evidence/anthropic-harnesses.md), [evidence/codex-harnesses.md](evidence/codex-harnesses.md), [evidence/cursor-harnesses.md](evidence/cursor-harnesses.md)

Key shape differences:
- **Claude Code** uses an explicit `"type"` discriminator (`"stdio" | "http" | "sse"`). Supports `${VAR}` + `${VAR:-default}` interpolation in command/args/env/url/headers.
- **Claude Desktop Chat/Cowork** stores only stdio entries natively in `claude_desktop_config.json`; remote HTTP goes through Settings → Connectors UI or the `mcp-remote` stdio bridge (`{"command":"npx","args":["mcp-remote","<URL>"]}`).
- **Codex** uses TOML tables `[mcp_servers.<n>]`, discriminating via `command` (stdio) vs. `url` (HTTP). Uniquely separates `env_vars` (allowlist-forwarded to server process) from `env_http_headers` (references env-var name — avoids secrets landing in the config file).
- **Cursor** uses JSON with `url`/`command` duck-typing (no `type` field). Supports `${env:VAR}`, `${userHome}`, `${workspaceFolder}` interpolation.

**Implications:**
- An installer targeting all 5 surfaces must handle 3 format families (JSON-with-type, JSON-duck-typed, TOML) — not just different keys within one format
- Env-var interpolation syntax differs across three harnesses (`${VAR}` / `${env:VAR}` / TOML env references) — per-harness adapters needed for secret injection

### Dim 2 — Official CLI install commands

**Finding:** Two of three vendors ship non-interactive install CLIs; Cursor lacks an `add` verb. Source-level inspection of Codex reveals idempotency, OAuth side-effects, and validation behavior that aren't documented publicly. Claude Code has 5 documented concurrent-write corruption bugs making CLI-based install risky under contention.

**Evidence:** [evidence/cli-vs-file-write.md](evidence/cli-vs-file-write.md), [evidence/anthropic-harnesses.md](evidence/anthropic-harnesses.md), [evidence/codex-harnesses.md](evidence/codex-harnesses.md), [evidence/cursor-harnesses.md](evidence/cursor-harnesses.md)

**Per-CLI comparison:**

| Aspect | Claude Code (`claude mcp add`) | Codex (`codex mcp add`) — source-verified | Cursor (no `add`) |
|---|---|---|---|
| Duplicate-name semantics | **ERRORS** `"already exists"` at `--scope user` (#35144) | **Overwrites silently** — `BTreeMap::insert` (source) | N/A |
| Schema validation | Flag-level (`--transport`, `--scope`) | Name regex `[A-Za-z0-9_-]+`; clap `ArgGroup` enforces `--url` XOR `-- cmd` (source) | N/A |
| Post-write side-effect | None documented | **YES for OAuth HTTP**: probes `oauth_login_support()`, may start OAuth browser flow (source) | N/A |
| Concurrent-write safety | **Bad on Windows** (5 documented bugs: #28842, #28847, #29036, #29153, #29217) | UNCERTAIN — typed-TOML round-trip via `ConfigEditsBuilder` implies care, but impl unread | N/A |
| Typed round-trip preserving comments | UNCERTAIN | YES (typed `McpServerConfig` + `ConfigEditsBuilder`) | N/A |
| Documented exit codes | Only `claude auth status` | NOT documented — `anyhow::Result` → nonzero on error | NOT documented |
| Runtime-scoped alternative | **YES — `--mcp-config <file>` + `--strict-mcp-config`** (CI-friendly; no install persistence) | UNCERTAIN — has `--config key=value` but no "strict" flag documented | — |

**Cursor's missing `add` — fourth install mechanism found:** Cursor docs route programmatic install through (a) Marketplace deep-link, (b) direct `.cursor/mcp.json` edit, (c) **`vscode.cursor.mcp.registerServer()` Extension API** — described as aimed at "enterprise environments and automated setup workflows." The Extension API is a distinct install path not CLI, not file, not marketplace.

**Decision triggers:**
- Want OAuth auto-flow for HTTP servers → Codex CLI (unique)
- Want typed round-trip preserving user comments → Codex CLI
- Want scope-routing + schema migration "just work" → Claude Code CLI
- Concurrent writes possible → prefer own file-write over `claude mcp add` (Windows corruption risk)
- Cursor is a target → file-write + `agent mcp enable <id>` OR Extension API

**Remaining uncertainty:**
- Exit-code taxonomy for both `claude mcp add` and `codex mcp add` — empirical test would close
- Codex `ConfigEditsBuilder` atomicity — would close by reading `codex-rs/config/src/edit.rs`
- Claude Code atomic-write guarantees per OS — empirical test or sourcemap audit of the leaked `@anthropic-ai/claude-code` npm package would close

### Dim 3 — Direct config-write + idempotent-merge semantics

**Finding:** Direct config-file writes are officially supported for all five surfaces. Idempotency is the caller's responsibility.

**Evidence:** [evidence/anthropic-harnesses.md](evidence/anthropic-harnesses.md), [evidence/codex-harnesses.md](evidence/codex-harnesses.md), [evidence/cursor-harnesses.md](evidence/cursor-harnesses.md)

- **Schema stability:** Every vendor publishes a stable schema for their config file. Claude Code references a JSON schema at `~/.claude.json`; Codex references `codex-rs/core/config.schema.json`; Cursor publishes `.cursor/mcp.json` reference docs.
- **Hot-reload behavior:** Generally NOT documented to hot-reload mid-session. Claude Code re-reads on new session; Cursor desktop community reports require restart; Codex desktop behavior undocumented.
- **Idempotency pattern:** Parse → merge → write (preserve other `mcpServers` entries). Every published installer (`add-mcp`, Smithery) does this. Cursor specifically stores enable/disable state in a per-workspace database (community report) — a file-write can add the server but cannot reliably pre-set enabled state on first Cursor Desktop launch.

**Implications:**
- A greenfield cross-harness installer can safely parse + merge + write JSON/TOML files; this is the cross-vendor baseline
- Post-write activation is only an issue for Cursor Desktop (Settings toggle) and Claude Code project-scope (trust prompt)

### Dim 4 — Deep-link / one-click install URI schemes

**Finding:** Only Cursor ships a deep-link install URI among our 7 harnesses. All deep-links require user confirmation by design.

**Evidence:** [evidence/deeplinks-and-registries.md Part A](evidence/deeplinks-and-registries.md)

| Harness | Deep-link? | Notes |
|---------|------------|-------|
| Claude Code terminal | NO | [Issue #26952](https://github.com/anthropics/claude-code/issues/26952) closed "not planned" |
| Claude Code Desktop | NO | Same — Electron app doesn't forward custom schemes |
| Claude Cowork | NO | — |
| Codex terminal | NO | `codex://` exists but has no `install` path |
| Codex desktop | NO | Same |
| Cursor CLI | NO | CLI has no scheme handler |
| Cursor desktop | **YES** | `cursor://anysphere.cursor-deeplink/mcp/install?name=$N&config=$BASE64` |

Cursor's URI security posture: [GHSA-r22h-5wp2-2wfv](https://github.com/cursor/cursor/security/advisories/GHSA-r22h-5wp2-2wfv) (May 2026) hardened the install dialog to always show full args. The "one click" is explicitly designed to prevent silent install.

**Implications:**
- Deep-links are a UX affordance, not a non-interactive install path
- For cross-harness auto-install, deep-links do not meaningfully change the programmatic story beyond Cursor

### Dim 5 — Stdio vs HTTP/SSE install-shape differences

**Finding:** All 7 harnesses support stdio; all 7 support Streamable HTTP; SSE is deprecated in the MCP spec and officially-or-informally discouraged everywhere except Cursor and Claude Code (which accept it with warnings).

**Evidence:** [evidence/transport-and-oauth-friction.md Part A](evidence/transport-and-oauth-friction.md)

| Harness | stdio | SSE | Streamable HTTP |
|---------|-------|-----|-----------------|
| Claude Code terminal | ✓ | ✓ deprecated | ✓ |
| Claude Code Desktop | ✓ | ✓ | ✓ (via Connectors UI) |
| Claude Cowork | ✓ (inherited) | partial | ✓ |
| Codex terminal | ✓ | — | ✓ |
| Codex desktop | ✓ | — | ✓ |
| Cursor CLI | ✓ | ✓ | ✓ |
| Cursor desktop | ✓ | ✓ | ✓ |

Config-shape differences (stdio → HTTP):
- **Claude Code:** `"type":"stdio"` → `"type":"http"`; `command`+`args`+`env` → `url`+`headers`+optional `oauth`
- **Codex:** `command`+`args` → `url`+`bearer_token_env_var`+`http_headers`+`env_http_headers`
- **Cursor:** `command`+`args`+`env` → `url`+`headers` (no type field; duck-typed)

**Install-mechanics differences beyond config shape:**
- Stdio requires a binary on disk or reachable via PATH (`npx` / absolute path / shell wrapper on Windows)
- HTTP requires URL reachability check (not enforced by any harness at config-write time; deferred to first tool call)

**Implications:**
- SSE is a liability for forward-looking installers. Target stdio + Streamable HTTP
- Stdio install needs a binary-resolution strategy (npm package vs. standalone binary vs. `npx -y` lazy-fetch)

### Dim 6 — Desktop-app install surfaces

**Finding:** MCPB/DXT is Claude Desktop Chat/Cowork only. Every other harness's desktop app install path is identical to its CLI path (same config file).

**Evidence:** [evidence/anthropic-harnesses.md §Finding 6](evidence/anthropic-harnesses.md), [evidence/deeplinks-and-registries.md §DXT/MCPB](evidence/deeplinks-and-registries.md)

- **MCPB format:** `.mcpb` ZIP with `manifest.json` (`manifest_version: "0.3"`, server types `node`/`python`/`uv`/`binary`, `user_config` schema for first-run prompts). Build: `npm install -g @anthropic-ai/mcpb` → `mcpb pack`. Install: double-click or Settings → Extensions → "Browse extensions."
- **No MCPB silent-install path** is documented. No CLI install flag, no URI handler, no pre-staging directory confirmed.
- **Codex Desktop** shares `~/.codex/config.toml` with CLI — no separate install surface.
- **Cursor Desktop** shares `~/.cursor/mcp.json` with CLI. Deep-link URI is the only desktop-specific affordance (still requires confirmation).
- **Claude Code Desktop "Code tab"** uses `~/.claude.json` and `.mcp.json`, same as CLI. MCPB bundles explicitly do NOT load in the Code tab per [desktop docs](https://code.claude.com/docs/en/desktop).

**Decision triggers:**
- MCPB is the right format if the install target is Claude Desktop Chat only
- For any cross-harness goal, MCPB doesn't generalize — stick with config-file-write
- April 2026 move of DXT repo from `anthropics/dxt` to `modelcontextprotocol/mcpb` signals intent to standardize, but no other harness has adopted it as of 2026-04-18

### Dim 7 — OAuth / auth headless friction for HTTP/SSE install

**Finding:** OAuth browser round-trip is an absolute wall for all 7 harnesses. Pre-provisioned bearer tokens in env vars are the only headless path for HTTP MCP. Per-harness injection ergonomics vary widely.

**Evidence:** [evidence/transport-and-oauth-friction.md Part B + C](evidence/transport-and-oauth-friction.md)

| Harness | Best headless path for HTTP MCP | Blocker for OAuth |
|---------|--------------------------------|-------------------|
| Claude Code terminal | `claude mcp add --transport http --header "Authorization: Bearer ${TOKEN}" ...` | Browser callback via `/mcp` slash command |
| Claude Code Desktop | Edit `~/.claude.json` with header + `${VAR}` interpolation | Connectors UI; no scriptable path |
| Claude Cowork | Inherit host config with bearer-in-header | Same as Desktop Chat |
| Codex terminal | `[mcp_servers.X]` with `bearer_token_env_var = "TOKEN_VAR"` | `codex mcp login` browser callback |
| Codex desktop | Same as Codex terminal | Same |
| Cursor CLI | Write `~/.cursor/mcp.json` with `headers:{"Authorization":"Bearer ${env:TOKEN}"}` | `agent mcp login` + `--print` mode bug #143045 |
| Cursor desktop | Same file-write + env var | Browser popup on first connection |

**Observations:**
- MCP spec 2025-06-18 provides DCR (Dynamic Client Registration) eliminating pre-registered `client_id` friction, but user consent is inherently browser-bound. No harness implements RFC 8628 device-code flow.
- **Secret-injection divergence:** Claude Code uniquely supports `${VAR:-default}` shell-style defaults. Codex uniquely separates `env_vars` (forward to server) from `env_http_headers` (reference env-var name — no secret in config). Cursor uses `${env:VAR}`.
- **Claude Code is the most headless-friendly** for bearer-token HTTP: single CLI command writes the full config atomically including the auth header.

**Remaining uncertainty:**
- Cursor's Client ID Metadata Documents (CIMD, Nov 2025 MCP spec revision) support is marketed but not doc-confirmed
- Whether `claude_desktop_config.json` accepts `"type":"http"` natively (bypassing Connectors UI) asserted by community sources, not confirmed by Anthropic docs

### Dim 8 — Trust / confirmation gates + enable-by-default

**Finding:** "Config-file-write = server live" for 5 of 9 harness/scope combinations. The exceptions all have scriptable bypasses except one (Cowork per-tool approval).

**Evidence:** [evidence/enable-by-default.md](evidence/enable-by-default.md), [evidence/anthropic-harnesses.md](evidence/anthropic-harnesses.md), [evidence/cursor-harnesses.md](evidence/cursor-harnesses.md)

**Enable-by-default matrix:**

| Harness / scope | File-write → live? | CLI-add → live? | Bypass for NOT-live case |
|---|---|---|---|
| Claude Code terminal — user scope | YES | YES | — |
| Claude Code terminal — local scope | YES | YES | — |
| Claude Code terminal — project (`.mcp.json`) | NO — trust prompt | NO — same | **Scriptable:** pre-stage `.claude/settings.local.json` with `enabledMcpjsonServers: ["<name>"]` (issue #9189) |
| Claude Code Desktop ("Code tab") | Same as CLI | Same | Same |
| Claude Cowork | YES (server connects) | N/A | **NOT SCRIPTABLE** — per-tool approvals re-prompt every session (#24433); `alwaysAllow` proposed but unimplemented |
| Codex terminal | YES (`enabled` defaults true) | YES (`BTreeMap::insert`) | — |
| Codex desktop | Same as CLI (shared TOML) | Same | — |
| Cursor CLI (`cursor-agent`) | NO — state stored separately | NO — same | **Scriptable:** `cursor-agent mcp enable <id>` |
| Cursor Desktop | YES on fresh workspace | Same | User toggle in Settings if disabled |

**Key nuances:**
- **Two distinct friction axes matter:** *server-connect gating* (is the server in the tool catalog?) vs *per-tool approval* (does the user click for each tool call?). Cowork's problem is the latter, which no current mechanism can pre-authorize.
- **Storage divergence:** Codex stores enable in-config (scriptable); Claude Code user/local in-config; Claude Code project in `.claude/settings.local.json` (scriptable via file-write); Cowork in `~/Library/Application Support/Claude/local-agent-mode-sessions/` (per-session, not pre-stageable per #24433); Cursor in `state.vscdb` SQLite (CLI verb required; DB writes brittle).
- **Cursor Desktop has an intent-persistence bug:** community reports (#141009, #129256) say disabled servers re-enable after restart, especially on fresh workspace open. "Once-disabled-stays-disabled" is not reliable.
- **Claude Code has a workspace-trust-not-persisting bug** (#12227) — users accept the project-scope trust prompt but see "workspace trust not accepted" in debug logs.
- **Runtime override flags:** Cursor CLI has `agent --approve-mcps` (per-run auto-approve). Cursor Desktop can pre-stage `~/.cursor/permissions.json` for auto-run.

### Dim 9 — Harness detection

**Finding:** Filesystem + PATH probes are sufficient to detect all 7 harnesses with high confidence.

**Evidence:** [evidence/anthropic-harnesses.md §Finding 10](evidence/anthropic-harnesses.md), [evidence/codex-harnesses.md §Finding 9](evidence/codex-harnesses.md), [evidence/cursor-harnesses.md §Finding 10](evidence/cursor-harnesses.md)

| Harness | Binary on PATH | Config dir / app path |
|---------|----------------|------------------------|
| Claude Code terminal | `claude` | `~/.claude.json` or `~/.claude/settings.json` |
| Claude Code Desktop | `claude` if CLI installed separately | `/Applications/Claude.app`, `%LOCALAPPDATA%\Programs\Claude\`, `~/Library/Application Support/Claude/`, `%APPDATA%\Claude\` (no Linux support) |
| Claude Cowork | (same as Desktop) | (same as Desktop) |
| Codex terminal | `codex` | `~/.codex/` |
| Codex desktop | `codex` (same binary can launch via `codex app`) | `/Applications/Codex.app`, Windows Microsoft Store package `9PLM9XGG6VKS` |
| Cursor CLI | `cursor-agent` (default `~/.local/bin/`) | `~/.cursor/` |
| Cursor desktop | `cursor` shim optional | `/Applications/Cursor.app`, `%LOCALAPPDATA%\Programs\Cursor\Cursor.exe` |

**Implications:**
- Any cross-harness installer can reliably enumerate present harnesses before writing config
- Detection is cheap (filesystem stat + `which`/`where`) — no subprocess spawning needed

### Dim 10 — Cross-harness install tooling / registries

**Finding:** Three credible OSS candidates cover most of our 7 harnesses with MIT/Apache licensing. The initial-pass assessment underestimated the tooling landscape.

**Evidence:** [evidence/extended-tooling-survey.md](evidence/extended-tooling-survey.md), [evidence/deeplinks-and-registries.md Part B](evidence/deeplinks-and-registries.md)

**Revised installer ranking:**

| Tool | Headless? | Harness coverage (of 7) | License | Bus factor | Status |
|------|-----------|-------------------------|---------|------------|--------|
| [**`install-mcp` (supermemoryai)**](https://github.com/supermemoryai/install-mcp) | PARTIAL (`--oauth=yes` gate) | **7 of 7** explicit (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Codex, Gemini CLI) | MIT | Commercial vendor | Active, 183 stars, v1.10.0 |
| [**`add-mcp` (Neon)**](https://github.com/neondatabase/add-mcp) | **YES** (`-y` flag) | 7 of 7 (Cowork + Codex desktop INFERRED via shared configs) | Apache-2.0 | Commercial vendor | Active, 156 stars |
| [**`mcpm.sh` (pathintegral-institute)**](https://github.com/pathintegral-institute/mcpm.sh) | **YES** (env vars: `MCPM_NON_INTERACTIVE`, `MCPM_FORCE`, `MCPM_JSON_OUTPUT`, `llm.txt` for agents) | 5+ of 7 (Claude Code + Codex "in development") | MIT | Vendor-neutral | Very active, 928 stars, 55 releases |
| [Smithery CLI](https://github.com/smithery-ai/cli) | YES (`--config '<json>'`) | 5 of 7 (Cowork: no; Claude Code terminal: PARTIAL — `claude` target writes Desktop config) | — | Commercial | Active, 675 stars |
| [ToolHive (stacklok)](https://github.com/stacklok/toolhive) | YES | 3+ of 7 confirmed (Claude Code, Cursor, VS Code); containerizes MCP servers | Apache-2.0 | Commercial | Active, 1.7k stars |
| [Docker MCP Toolkit](https://github.com/docker/mcp-gateway) | YES (`docker mcp client connect`) | 3 of 7 confirmed | Apache-2.0 | Docker Inc. | Active, part of Docker Desktop 4.59+ |
| [MCPB (Claude Desktop extensions)](https://github.com/modelcontextprotocol/mcpb) | NO (UI install only) | 1 of 7 (Claude Desktop Chat) | — | Active, 1.8k stars |
| [Cursor MCP Directory](https://cursor.com/docs/context/model-context-protocol) | NO (deep-link) | 1 of 7 (Cursor Desktop) | — | Active |
| [MCP Registry (v0.1)](https://registry.modelcontextprotocol.io) | N/A (metadata only) | 0 of 7 for install | — | Preview |
| [mcp-get](https://github.com/michaellatman/mcp-get) | partial | 1 of 7 | — | **Archived** (recommends Smithery) |
| [MCPBar](https://www.mcp.bar/blog/introducing-mcpbar) | UNCERTAIN | UNCERTAIN | UNCERTAIN | Blog-only, no verified repo |

**Anti-recommendation:** **`mcpm` (ascii27)** at [github.com/ascii27/mcpm](https://github.com/ascii27/mcpm) — NOT the same as `mcpm.sh`. GPLv3, 1 star, bus-factor-of-1, last release Apr 2025. License contagion risk for commercial reuse.

**Registries (index-only, not installers):**
- Anthropic in-product directory (Claude Desktop Settings → Extensions)
- Cursor's docs MCP directory + community `cursormcp.com`
- [Glama](https://glama.ai/mcp/servers) — 21,740+ server index
- [PulseMCP](https://pulsemcp.com) — 12,860+ index

**Implementation patterns worth borrowing** (from surveyed tools):
1. **JSONC parsing** for comment preservation (only `emdash` PR #1623 does this)
2. **Multi-agent partial-failure reporting** (read-then-write; per-harness status)
3. **Conflict-warning on merge** (`add-mcp` sync) — good UX
4. **Harness detection by config-path probe** (`mcpm client ls` pattern)
5. **OAuth kickoff as post-install side-effect** (`install-mcp` `--oauth=yes`; Codex auto-flow)
6. **Environment variable automation flags** (`MCPM_NON_INTERACTIVE` — cleaner than per-invocation CLI flags in CI)

**What no tool has solved yet:**
- Atomic writes + crash-safe rollback (assume naive `fs.writeFile` in all surveyed tools)
- Cross-harness installer manifest standard (MCPB is Claude-only; MCP Registry is discovery-only)
- First-party CLI delegation (everybody hand-writes configs instead of calling `claude mcp add` / `codex mcp add`)
- Cursor post-install enable-toggle automation

**Decision triggers:**
- Want a single OSS dependency covering all 7: **`install-mcp`** (MIT, broadest coverage) or **`add-mcp`** (Apache-2.0, cleaner `-y` non-interactive)
- Want the strongest agent-automation story: **`mcpm.sh`** (env-var-driven, `llm.txt` for agents)
- Want enterprise / containerized install: **ToolHive**
- Want registry discovery + install: **Smithery** (with Cowork/Claude-Code-terminal gaps acknowledged)
- Writing your own: **minimum DIY surface** is atomic-writes + JSONC preservation + partial-failure reporting; everything else is solved in OSS

### Dim 11 — Versioning / updates / uninstall

**Finding:** No first-party per-server version pinning across any harness. Stdio version pinning happens in `args` (e.g. `npx -y @pkg@1.2.3`); HTTP versioning is external. Uninstall is always "remove entry from config" or equivalent CLI call.

**Evidence:** [evidence/anthropic-harnesses.md §Finding 11](evidence/anthropic-harnesses.md), [evidence/codex-harnesses.md §Finding 11](evidence/codex-harnesses.md), [evidence/cursor-harnesses.md §Finding 11](evidence/cursor-harnesses.md)

| Harness | Remove command | Server version pinning |
|---------|----------------|------------------------|
| Claude Code CLI + Desktop Code tab | `claude mcp remove <n>` | Via `args` e.g. `@pkg@1.2.3` |
| Claude Desktop Chat/Cowork | Edit `claude_desktop_config.json` | Same |
| MCPB bundles | Settings → Extensions | Per bundle `manifest.json` |
| Codex (all) | `codex mcp remove <n>` | Same args-based |
| Cursor (all) | Edit `mcp.json` or `agent mcp disable <id>` | Same |

### Dim 12 — Agent Skills install surface per harness *(added 2026-04-24)*

**Finding:** **Programmatic Agent Skills install is Claude Code only.** `npx skills@~1.5.0 add <bundled-path> --agent '*' -g -y --copy` writes to `~/.claude/skills/<name>/SKILL.md`, which Claude Code resolves on next session. Cowork's VM does not mount that directory; Cursor has no Skills spec; Codex's AGENTS.md is per-project, not user-global. The `npx skills` agent-ID registry covers ~45 targets but lists neither `cowork` / `claude-cowork` / `claude-desktop` nor any synthetic alias that reaches Cowork transitively.

**Evidence:** [evidence/cowork-skills-surface-update-2026-04-24.md](evidence/cowork-skills-surface-update-2026-04-24.md)

| Harness | Skills install shape | Programmatic? | Recommended path today |
|---------|---------------------|---------------|------------------------|
| Claude Code CLI | `~/.claude/skills/<name>/SKILL.md` user-global; project `.claude/skills/` optional | **YES** | `npx skills@~1.5.0 add <path> --agent claude-code -g -y --copy` (or `--agent '*'`) |
| Claude Code Desktop ("Code tab") | Inherits `~/.claude/skills/` | **YES** (transitively) | Same as CLI |
| Claude Desktop Chat | Per-user ZIP upload via `Customize > Skills > +`; Team+ org-admin upload/GitHub-sync | **NO** | Ship a ZIP release artifact + manual upload instructions |
| **Claude Cowork desktop** | VM per-session synthetic filesystem; 6 built-in Anthropic skills + ephemeral `local_<uuid>/.claude/skills/` wiped on cleanup (#31422) | **NO** | Ship a ZIP; instruct user to upload via Desktop UI; accept re-upload per session until Anthropic fixes VM mount |
| Codex CLI + Desktop + IDE | AGENTS.md in-repo (project-scoped, different concept) | **NO** (no user-global equivalent) | N/A — Codex doesn't implement Skills spec |
| Cursor CLI + Desktop | No Skills spec; `.cursor/rules/` exists but is a separate rules-file convention | **NO** | N/A — Cursor doesn't implement Skills spec |

**Open Anthropic bug class** — "metadata registered but SKILL.md not mounted in Cowork VM" affects #26254, #31542, #39400. Zero Anthropic-staff engagement on any of the three as of 2026-04-24. Community workarounds (symlinking host `~/.claude/skills/` into the VM) break on every session restart.

**Implications for a third-party installer (e.g. the Open Knowledge host app):**
- `installUserSkill()` that calls `npx skills add --agent '*'` **does not reach Cowork** — the wildcard resolves to 45 non-Cowork targets. No change to this command can fix that without Anthropic adding a Cowork agent ID to the registry.
- Attempting to bridge via Claude-Code-in-the-Cowork-VM fails because the VM boots with its own synthetic filesystem. The host-installed skill is simply not present.
- The Anthropic-sanctioned Cowork path is a ZIP upload in the Desktop UI. Third-party tools should ship a downloadable `<skill-name>.zip` release artifact, link the user to `https://claude.ai/directory` or the Desktop `Customize > Skills > +` UI, and surface a "Re-upload if session restarts" hint given the known bugs.
- **If you only care about Claude Code** (terminal + Desktop Code tab), the existing `npx skills` flow is sufficient. Skip Cowork until cross-surface skill sharing ships (monitor #31422, #25278, #26254, #31542).

**Decision triggers:**
- Building a host-managed skill for developer/agent workflows primarily: Claude Code CLI is the right surface → `npx skills` is fine.
- Wanting Cowork reach today: no programmatic path. Ship a ZIP + manual instructions.
- Wanting Cursor / Codex reach: neither implements Skills. Use MCP server + per-tool descriptions instead (which was the pre-Skills pattern and still works).

---

## Harness Ranking: Headless-Install Feasibility Today

From most to least headless-friendly for a stdio MCP server install (revised with follow-up findings):

1. **Codex terminal + desktop + IDE extension** — single TOML write covers all three surfaces; `codex mcp add` overwrites silently (idempotent); `enabled` defaults true; no trust gates for stdio; OAuth auto-flow for HTTP is a unique bonus
2. **Claude Code terminal** — `claude mcp add` is mature; user/local scope auto-live; **project scope scriptable-bypass via pre-staged `.claude/settings.local.json`** (issue #9189). Concurrent-write corruption bugs (#28842, #29036, #29153, #29217) mean direct file-write can be SAFER than CLI when a live session is running.
3. **Claude Code Desktop ("Code tab")** — shared config with CLI; same properties
4. **Cursor Desktop** — write `.cursor/mcp.json`; fresh-workspace default is enabled; **caveat:** enable state in `state.vscdb` SQLite has known re-enable bugs (#141009). Can pre-stage `~/.cursor/permissions.json` for tool auto-approval.
5. **Cursor CLI** — same file-write + `agent mcp enable <id>` post-step. **Forum #138036:** effectively not usable for CI pipelines due to missing `.workspace-trusted` / `mcp-approvals.json` files
6. **Claude Desktop Chat** — `claude_desktop_config.json` write is non-interactive; MCPB bundle install requires double-click + confirmation; remote HTTP requires Connectors UI
7. **Claude Cowork desktop** — WORSE than initial ranking. Inherits Claude Desktop Chat config, BUT per-tool approvals re-prompt every new Cowork session (#24433, not #26259 alone). `"Always allow"` is never persisted. Effectively unusable for true headless install until Anthropic ships the proposed `alwaysAllow` field.

For HTTP MCP with bearer auth, the ranking flips — Claude Code terminal and Codex terminal are tied at #1 (clean headless bearer-token paths); Cursor CLI's CI approval gap drops it lower; Claude Desktop/Cowork remain last due to mandatory Connectors UI for OAuth.

---

## Conclusions & Implications

Four patterns emerge from the landscape:

**1. Direct config-file write is the universal install primitive.** Every vendor CLI (`claude mcp add`, `codex mcp add`) is effectively a wrapper around a JSON/TOML write + validation. Every cross-harness tool (`add-mcp`, Smithery) reduces to the same. For a greenfield installer targeting multiple harnesses, don't fight this — parse, merge, write — it's the format the ecosystem has converged on.

**2. Deep-links don't meaningfully help headless install.** Cursor is the only harness with a `*://mcp/install` URI; its May 2026 security advisory intentionally removed every path to silent install. VS Code's consent prompt is equivalent. For programmatic auto-install, deep-links offer nothing over direct config-write and add OS-level URI-handler dependencies.

**3. MCPB/DXT is a Claude Desktop story, not an ecosystem standard.** The format's move from `anthropics/dxt` to `modelcontextprotocol/mcpb` in Dec 2025 signals standardization intent, but no other harness ships a loader as of 2026-04-18. For cross-harness reach, MCPB doesn't generalize.

**4. OAuth is the one wall no programmatic install can scale.** Every harness follows MCP spec 2025-06-18 authorization-code + PKCE + DCR. None ship device-code flow. Pre-provisioned bearer tokens in env vars are the only headless path, and secret-injection syntax diverges across three harness families (`${VAR}` / `${env:VAR}` / TOML env references). An installer must either target bearer-auth-only servers or accept a browser round-trip per OAuth server per user.

**For a new installer building on this landscape today:**
- **First decision: DIY or reuse.** With `install-mcp` (MIT, 7 of 7), `add-mcp` (Apache-2.0, 7 of 7), and `mcpm.sh` (MIT, 5+ of 7) all production-ready, starting with reuse is reasonable unless you need specific behavior none of them offer (atomic writes with crash-safe rollback, JSONC round-trip, first-party CLI delegation).
- Target the 5 install surfaces via direct file-write as the universal fallback; treat vendor CLIs as optional ergonomic wrappers for the Claude/Codex families (with idempotency normalization — Codex overwrites, Claude Code errors).
- **Claude Code specifically:** under concurrent contention prefer your own file-write (atomic tmp+rename) over `claude mcp add` — the CLI has 5 documented Windows corruption bugs.
- **Claude Code project-scope:** pre-stage `.claude/settings.local.json` with `enabledMcpjsonServers: ["<name>"]` alongside the `.mcp.json` write. Skips the trust prompt cleanly.
- **Codex unique behavior to preserve:** OAuth auto-flow for HTTP servers. If you bypass `codex mcp add` for a batch file-write, users lose this. Consider calling the CLI just for HTTP entries.
- **Cursor CLI is the weak link in CI.** Forum #138036 means file-write in a CI runner will not surface the server until `.workspace-trusted` + `mcp-approvals.json` are also materialized. Either accept this caveat or switch harnesses.
- **Cowork:** flag to users as currently not headless-viable until #24433 ships; direct them to file-write `claude_desktop_config.json` and accept per-tool re-approval.
- Ship bearer-token-via-env-var as the "works everywhere headless" path; OAuth as a follow-up best-effort.
- Don't ship a `.mcpb` bundle unless Claude Desktop Chat is a primary target.
- Don't build a custom deep-link URI scheme — no harness would honor it; rely on direct file-write instead.
- **If you also ship an Agent Skill** (added 2026-04-24): use `npx skills@~1.5.0 add <path> --agent '*' -g -y --copy` for Claude Code (CLI + Desktop Code tab) — it covers ~45 agent IDs. Do NOT expect it to reach Cowork; ship a separate ZIP release artifact with manual-upload instructions and surface that path in your installer's UX. Cursor and Codex don't implement the Skills spec; if your guidance needs to reach them, encode it in MCP tool descriptions / AGENTS.md respectively instead of a standalone skill.

---

## Limitations & Open Questions

### Dimensions covered with residual UNCERTAIN findings

- **Claude Cowork stdio bridge status** — bug #26259 is canonical; current fix status needs periodic re-check against Anthropic's public issue tracker
- **Exit codes + duplicate-name handling** for `claude mcp add` / `codex mcp add` — not in primary docs; empirical test needed
- **Hot-reload behavior** when config files are edited mid-session on any harness — almost none of it is documented; safe assumption is "restart required"
- **Cursor CIMD support** (Nov 2025 MCP spec revision replacement for DCR) — marketed but not doc-confirmed
- **Claude Desktop native `"type":"http"` in `claude_desktop_config.json`** (bypassing Connectors UI) — one community source asserts it; Anthropic docs do not confirm
- **Smithery's 20-client runtime matrix** — CHANGELOG confirms core set; direct `npx @smithery/cli list clients` verification would close the gap

### Items explicitly out of scope (non-goals)

- Windsurf, Zed, VS Code Copilot, Cline, Roo Code — AI coding harnesses excluded per user scoping
- MCP server implementation (covered in `mcp-consumption-dx-patterns/`)
- Agent-framework SDK consumption (LangChain, CrewAI, etc.)
- Full OAuth server implementation — scope limited to headless-install friction

### Vendor-bias disclosure

Most primary sources are vendor-authored (docs.anthropic.com, developers.openai.com, docs.cursor.com). Third-party corroboration used where available (TrueFoundry, Den Delimarsky, aiengineerguide, dev.to community posts, GitHub security advisories). No finding rests solely on a vendor source when a third-party confirmation was obtainable.

---

## References

### Evidence Files

**Initial pass (2026-04-18):**
- [evidence/anthropic-harnesses.md](evidence/anthropic-harnesses.md) — Claude Code terminal + Desktop + Cowork install surfaces
- [evidence/codex-harnesses.md](evidence/codex-harnesses.md) — Codex CLI + Desktop install surfaces
- [evidence/cursor-harnesses.md](evidence/cursor-harnesses.md) — Cursor CLI + Desktop install surfaces
- [evidence/deeplinks-and-registries.md](evidence/deeplinks-and-registries.md) — Deep-link schemes + Smithery/add-mcp/MCPB/MCP Registry
- [evidence/transport-and-oauth-friction.md](evidence/transport-and-oauth-friction.md) — Stdio vs HTTP/SSE + OAuth headless friction across all 7 harnesses

**Follow-up pass (2026-04-18):**
- [evidence/enable-by-default.md](evidence/enable-by-default.md) — across all 7 harnesses, is an MCP server live immediately after config-write / CLI add?
- [evidence/cli-vs-file-write.md](evidence/cli-vs-file-write.md) — deep CLI-vs-file comparison with Codex Rust source-level findings
- [evidence/extended-tooling-survey.md](evidence/extended-tooling-survey.md) — `install-mcp`, `mcpm.sh`, ToolHive, Docker MCP Toolkit, MCPBar + implementation patterns + DIY-vs-reuse ranking

**Gap-closure pass (2026-04-18):**
- [evidence/cowork-deep-dive.md](evidence/cowork-deep-dive.md) — Cowork status, 12 tracking issues, VM architecture, workaround analysis, verdict: NO headless stdio install achievable today
- [evidence/cursor-first-run-reliability.md](evidence/cursor-first-run-reliability.md) — Cursor `state.vscdb` schema, staff-confirmed default-enabled behavior, `permissions.json` docs, Extension API, recommended two-file install pattern

**Localhost HTTP pass (2026-04-18):**
- [evidence/localhost-http-per-harness.md](evidence/localhost-http-per-harness.md) — does localhost HTTP/SSE change the friction picture? Per-harness URL acceptance, auth relaxation, Cowork VM sandbox (#28018), net friction diff
- [evidence/localhost-http-oss-patterns.md](evidence/localhost-http-oss-patterns.md) — OSS companion-app servers (Playwright MCP, Chrome DevTools, Supergateway, mcp-proxy, mcpm router, mcp-remote), port strategies, bootstrap UX, best-practice sidecar shape

**Runtime install + Cowork escape pass (2026-04-18):**
- [evidence/cowork-escape-paths.md](evidence/cowork-escape-paths.md) — verification of 6 Cowork workarounds; skill/project-bootstrap behavior; per-tool approval #24433 now CLOSED as NOT PLANNED
- [evidence/runtime-self-install.md](evidence/runtime-self-install.md) — per-harness runtime-register capability matrix; only Cursor Desktop has a genuine API (`vscode.cursor.mcp.registerServer()`); two-conversation flow as baseline UX

**Path C update (2026-04-24):**
- [evidence/cowork-skills-surface-update-2026-04-24.md](evidence/cowork-skills-surface-update-2026-04-24.md) — Agent Skills install surface per harness; `npx skills` agent-ID registry enumeration; Cowork VM synthetic-filesystem isolation; feasibility verdict NO for programmatic Cowork skills install
- [evidence/refresh-check-2026-04-24.md](evidence/refresh-check-2026-04-24.md) — 6-day spot-check on bugs #26259 / #24433 / #26952 + Claude Code v2.1.116–v2.1.119 release notes — parent report claims still accurate

**Changelog:** [meta/_changelog.md](meta/_changelog.md)

### Primary external sources
- [MCP Spec 2025-06-18 Transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) — SSE deprecation, Streamable HTTP
- [MCP Spec 2025-06-18 Authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) — OAuth 2.1 + DCR + PRM + PKCE
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)
- [Claude Code Desktop docs](https://code.claude.com/docs/en/desktop)
- [Claude Desktop local MCP (support.claude.com)](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)
- [Claude remote MCP Connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [modelcontextprotocol/mcpb (formerly anthropics/dxt)](https://github.com/modelcontextprotocol/mcpb)
- [MCPB manifest spec](https://github.com/anthropics/mcpb/blob/main/MANIFEST.md)
- [Codex MCP docs](https://developers.openai.com/codex/mcp)
- [Codex config reference](https://developers.openai.com/codex/config-reference)
- [Cursor MCP docs](https://cursor.com/docs/context/mcp)
- [Cursor MCP for CLI](https://cursor.com/docs/cli/mcp)
- [Cursor MCP Install Links](https://cursor.com/docs/context/mcp/install-links)
- [Smithery CLI](https://github.com/smithery-ai/cli)
- [add-mcp (Neon)](https://github.com/neondatabase/add-mcp)
- [MCP Registry](https://registry.modelcontextprotocol.io/)
- [Cursor install-link security advisory GHSA-r22h-5wp2-2wfv](https://github.com/cursor/cursor/security/advisories/GHSA-r22h-5wp2-2wfv)
- [Anthropic claude-code issue #26952 (`claude://` not planned)](https://github.com/anthropics/claude-code/issues/26952)
- [Anthropic claude-code issue #26259 (Cowork stdio bridge)](https://github.com/anthropics/claude-code/issues/26259)
- [OpenAI codex issue #13025 (Desktop project-scope bug)](https://github.com/openai/codex/issues/13025)
- [Cursor forum #143045 (CLI `--print` mode MCP bug)](https://forum.cursor.com/t/cursor-cli-mcp-the-non-interactive-mode-cannot-be-used/143045)

### Related Research (for adjacent depth)
- `~/.claude/reports/mcp-consumption-dx-patterns/` — DX of consuming MCP as agent framework developer (LangChain, CrewAI, Vercel AI SDK, Agents SDK perspective); partial overlap on Claude Code + Codex CLI install shapes but from a consumption rather than install angle
- `~/.claude/reports/mcp-host-layer-patterns/` — Multi-server orchestration inside a Host (namespacing, aggregation)
- `~/.claude/reports/claude-mcp-env-vars/` — Env-var interpolation mechanics in Claude Code MCP specifically
