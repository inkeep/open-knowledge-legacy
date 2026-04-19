# Evidence: OpenAI Codex Harnesses (CLI + Desktop App)

**Dimension:** Codex terminal (CLI) + Codex desktop app — install surfaces
**Date:** 2026-04-18
**Sources:** developers.openai.com/codex, github.com/openai/codex, npmjs.com, Homebrew, Microsoft Store

**Vendor-bias flag:** All primary sources are OpenAI-operated or first-party package registries mirroring OpenAI's canonical release artifacts.

---

## Key sources

- [Codex MCP — developers.openai.com](https://developers.openai.com/codex/mcp)
- [Codex config reference — developers.openai.com](https://developers.openai.com/codex/config-reference)
- [Codex CLI reference — developers.openai.com](https://developers.openai.com/codex/cli/reference)
- [Codex app settings — developers.openai.com](https://developers.openai.com/codex/app/settings)
- [Codex app features — developers.openai.com](https://developers.openai.com/codex/app/features)
- [Codex changelog — developers.openai.com](https://developers.openai.com/codex/changelog)
- [Codex llms-full.txt — developers.openai.com](https://developers.openai.com/codex/llms-full.txt) — lists all `codex://` URI paths
- [@openai/codex — npm](https://www.npmjs.com/package/@openai/codex)
- [Codex Homebrew cask](https://formulae.brew.sh/cask/codex)
- [Codex Microsoft Store listing](https://apps.microsoft.com/detail/9plm9xgg6vks)
- [Codex introductory announcement — openai.com](https://openai.com/index/introducing-the-codex-app/)
- [Issue #13025 (project-scope desktop bug)](https://github.com/openai/codex/issues/13025)
- [GitHub Release binaries — openai/codex](https://github.com/openai/codex/releases)

---

## Finding 1: CLI + Desktop + IDE Extension share one config file
**Confidence:** CONFIRMED
**Evidence:** [developers.openai.com/codex/app/settings](https://developers.openai.com/codex/app/settings)

> "The Codex app, CLI, and IDE Extension share Model Context Protocol (MCP) settings. If you've already configured MCP servers in one, they're automatically adopted by the others."

**Implication:** Codex install surface is effectively **single-target** — one write to `~/.codex/config.toml` covers all three.

---

## Finding 2: Config-file schema (TOML)
**Confidence:** CONFIRMED
**Evidence:** [developers.openai.com/codex/config-reference](https://developers.openai.com/codex/config-reference), [developers.openai.com/codex/mcp](https://developers.openai.com/codex/mcp)

User-scope: `~/.codex/config.toml` (TOML). Project-scope: `.codex/config.toml` (only honored for "trusted projects"; NOT currently honored by the desktop app — [issue #13025](https://github.com/openai/codex/issues/13025)).

MCP entries live under `[mcp_servers.<name>]` tables. Stdio vs HTTP discriminated by presence of `command` vs `url`.

**Stdio example:**
```toml
[mcp_servers.foo]
command = "npx"
args = ["-y", "@scope/foo"]
env = { KEY = "value" }
startup_timeout_sec = 10
```

**HTTP example:**
```toml
[mcp_servers.github]
url = "https://api.githubcopilot.com/mcp/"
bearer_token_env_var = "GITHUB_PAT_TOKEN"
```

**Full field catalogue:**
- Stdio-only: `command`, `args`, `env`, `env_vars`, `cwd`
- HTTP-only: `url`, `bearer_token_env_var`, `http_headers`, `env_http_headers`
- Shared: `enabled`, `required`, `startup_timeout_sec`, `tool_timeout_sec`, `enabled_tools`, `disabled_tools`
- Top-level OAuth keys: `mcp_oauth_callback_port`, `mcp_oauth_callback_url`, `mcp_oauth_credentials_store`

**JSON Schema reference:** `codex-rs/core/config.schema.json` in the repo.

---

## Finding 3: `codex mcp add` CLI
**Confidence:** CONFIRMED (syntax); UNCERTAIN (exit-code/idempotency semantics)
**Evidence:** [developers.openai.com/codex/cli/reference](https://developers.openai.com/codex/cli/reference)

```bash
codex mcp add <name> [--env KEY=VALUE ...] [--url <URL>] \
  [--bearer-token-env-var <VAR>] -- <command> [args...]
codex mcp list [--json]
codex mcp get <name> [--json]
codex mcp remove <name>
codex mcp login <name> [--scopes ...]
codex mcp logout <name>
```

- **Non-interactive:** YES for `add`/`list`/`get`/`remove`. `login` triggers OAuth browser round-trip.
- **Exit codes, idempotency, duplicate-name handling:** NOT documented in primary sources. Need empirical test or `codex-rs` source read.

---

## Finding 4: Direct TOML writes are officially supported
**Confidence:** CONFIRMED
**Evidence:** [developers.openai.com/codex/mcp](https://developers.openai.com/codex/mcp), [openai/codex config.md](https://github.com/openai/codex/blob/main/docs/config.md)

> "You may edit `config.toml` directly."

No hot-reload documented — edits likely take effect on next `codex` launch or app restart. Schema validation surface for manual edits not documented.

---

## Finding 5: `codex://` URI scheme exists but has NO MCP-install path
**Confidence:** CONFIRMED NEGATIVE
**Evidence:** [developers.openai.com/codex/llms-full.txt](https://developers.openai.com/codex/llms-full.txt)

Registered `codex://` paths:
- `codex://settings`
- `codex://skills`
- `codex://automations`
- `codex://threads/<id>`
- `codex://new` (with `prompt` / `path` / `originUrl` query params)

**No `codex://mcp/install?...` or equivalent.** "Add to Codex" buttons do not exist in the vendor docs.

**Implication:** Cursor's one-click install-link model has no Codex analogue.

---

## Finding 6: All 3 transports supported (stdio, Streamable HTTP, no explicit SSE named)
**Confidence:** CONFIRMED
**Evidence:** [developers.openai.com/codex/config-reference](https://developers.openai.com/codex/config-reference)

HTTP transport is described as "Streamable HTTP" (not legacy SSE specifically named). A `url` field in a `[mcp_servers.<name>]` table switches transport to HTTP.

---

## Finding 7: No DXT/MCPB-equivalent packaged-extension manifest
**Confidence:** CONFIRMED (as absent)
**Evidence:** [developers.openai.com/codex/app/features](https://developers.openai.com/codex/app/features), [developers.openai.com/codex/changelog](https://developers.openai.com/codex/changelog)

Install = same `config.toml` write path as CLI. The Codex desktop app's Settings → "Integrations & MCP" section offers:

1. A curated "recommended servers" enable-toggle (one-click for pre-vetted servers)
2. An "add your own" form (GUI equivalent of `codex mcp add`)

**New (April 15, 2026):** `codex marketplace add` CLI supports "installing plugin marketplaces from GitHub, git URLs, local directories, and direct `marketplace.json` URLs." This is a **plugin marketplace** mechanism (collections of plugins), distinct from direct MCP-server install. Ambiguous whether individual MCP servers can be installed via a `marketplace.json` URL.

---

## Finding 8: No per-server stdio confirmation gate documented
**Confidence:** INFERRED (from absence in docs)
**Evidence:** [developers.openai.com/codex/mcp](https://developers.openai.com/codex/mcp), [developers.openai.com/codex/app/settings](https://developers.openai.com/codex/app/settings)

The only "trust" concept is at the project level — project-scoped `.codex/config.toml` is only loaded for "trusted projects." Stdio registration via `codex mcp add` or TOML write appears to take effect without an approval prompt.

**For OAuth HTTP servers only:** "If a server requires OAuth, the app starts the auth flow" — browser round-trip required.

---

## Finding 9: Detection heuristics
**Confidence:** CONFIRMED
**Evidence:** [npmjs.com/@openai/codex](https://www.npmjs.com/package/@openai/codex), [formulae.brew.sh/cask/codex](https://formulae.brew.sh/cask/codex), [Microsoft Store 9PLM9XGG6VKS](https://apps.microsoft.com/detail/9plm9xgg6vks)

- **CLI:** `codex` binary on PATH (installable via `npm install -g @openai/codex` or `brew install --cask codex`); `which codex`; presence of `~/.codex/`.
- **Desktop app:** `/Applications/Codex.app` (macOS); Windows via Microsoft Store package ID `9PLM9XGG6VKS`. Desktop app can also be launched via `codex app` CLI subcommand.

---

## Finding 10: Desktop-specific `codex app` CLI command
**Confidence:** CONFIRMED
**Evidence:** [developers.openai.com/codex/cli/reference](https://developers.openai.com/codex/cli/reference)

`codex app` subcommand installs/opens the desktop app on macOS (uses a DMG) with `--download-url` override. The desktop app does not expose a separate CLI install command for MCP — shared `codex mcp add` or TOML edit applies.

---

## Finding 11: Update / uninstall
**Confidence:** CONFIRMED
**Evidence:** [openai/codex releases](https://github.com/openai/codex/releases)

- **CLI updates:** `npm update -g @openai/codex`, `brew upgrade --cask codex`, or GitHub Release binaries.
- **Desktop app updates:** Standard macOS/Windows app update flow (auto-update on launch, not documented explicitly).
- **MCP server uninstall:** `codex mcp remove <name>` or edit `config.toml` or use Settings UI.
- **Per-server version pinning:** Not a first-party feature. Stdio pinned via `args`; HTTP versioning is external.

---

## Finding 12: Codex Desktop — known project-scope bug
**Confidence:** CONFIRMED
**Evidence:** [Issue #13025](https://github.com/openai/codex/issues/13025)

Project-scoped `.codex/config.toml` is loaded by the CLI for trusted projects but currently NOT honored by the desktop app. Installers targeting project scope should default to user scope (`~/.codex/config.toml`).

---

## Cross-harness observations

- **One config file covers CLI + Desktop + IDE Extension** — Codex has the cleanest single-target install surface of any vendor in the 7-harness set.
- **No Codex-native deep-link install URI** — `codex://` exists but covers only settings/threads/automations/new, not MCP install.
- **No DXT-analogue packaged-extension manifest** — all install paths reduce to a TOML write (direct or via `codex mcp add`).
- **"Recommended servers" toggle is click-driven** — but optional: TOML write bypasses it entirely.
- **Project-scope desktop bug #13025** — limits installer reliability for project-scope Codex installs until fixed.

---

## Negative searches / NOT FOUND

- Deep-link URI for MCP install (`codex://mcp/install?...`) — confirmed absent
- DXT/MCPB-equivalent bundle format — confirmed absent
- Per-server stdio trust prompt — no documentation of any such gate
- Per-server version pinning in config — not a first-party feature

---

## Gaps / follow-ups

- `codex mcp add` exit codes + duplicate-name semantics — UNCERTAIN, need empirical test
- Desktop app live-reload of `config.toml` edits made outside the Settings UI — not documented
- Whether April 2026 `codex marketplace add` flow can install individual MCP servers via a manifest URL
- `~/.codex/` auto-creation on first run vs. pre-existing for detection
- Current status of project-scope desktop bug #13025
