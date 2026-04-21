# Open Knowledge

Local-first knowledge base with real-time CRDT collaboration. Includes a rich editor, markdown file-backed persistence, and an MCP server for AI agent integration.

## Prerequisites

- [Bun](https://bun.sh) >= 1.3.11
- Git

## Quick Start

```bash
cd your-project
bunx @inkeep/open-knowledge init      # Scaffold .open-knowledge/ + register MCP config for every detected editor
bunx @inkeep/open-knowledge start     # Start Hocuspocus collab; auto-spawns ok ui on http://localhost:3000
```

`init` writes user-scoped MCP configuration at the correct per-editor path for every detected editor on your machine:

| Editor         | Config written to                                                                                                | Scope       |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- |
| Claude Code    | `~/.claude.json`                                                                                                 | User-global |
| Cursor         | `~/.cursor/mcp.json`                                                                                             | User-global |
| VS Code        | `~/Library/Application Support/Code/User/mcp.json` (macOS) · `%APPDATA%\Code\User\mcp.json` (Windows) · `${XDG_CONFIG_HOME:-~/.config}/Code/User/mcp.json` (Linux) | User-global |
| Codex          | `~/.codex/config.toml` (`$CODEX_HOME/config.toml` if set)                                                        | User-global |
| Windsurf       | `~/.codeium/windsurf/mcp_config.json`                                                                            | User-global |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) · `%APPDATA%\Claude\…` (Windows)       | User-global |

Override with `--editor <name1,name2>` or `--editor all` (alias: `claude_desktop` → `claude-desktop`). AI agents work immediately — `start` is optional (the MCP server falls back to disk-only writes without a live collab server).

All supported editors now share a single global `open-knowledge` entry. The MCP server resolves the active project per tool call from explicit `cwd` values or client-reported workspace roots, so one user-scoped config works across projects. If you still have legacy project-local MCP files from older `init` runs, `init` leaves them in place and warns so you can remove them manually when you want fully user-scoped behavior. Claude Desktop requires a full **quit + relaunch** to pick up new MCP servers, and other editors may require a new session or editor restart if they are already open.

### Install globally (optional)

```bash
bun install -g @inkeep/open-knowledge
open-knowledge init
open-knowledge start
```

### Lifecycle commands

The CLI ships with a pair of long-lived processes and three utility commands so you can manage them without hunting for PIDs:

| Command                 | Role                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `open-knowledge start`  | Start Hocuspocus CRDT server (`/collab`, `/api/*`) on a kernel-allocated port; auto-spawns `ok ui`.    |
| `open-knowledge ui`     | Serve the React editor on port 3000 (respects `PORT` env); owns `.open-knowledge/ui.lock`.             |
| `open-knowledge stop`   | SIGTERM any live `ok start` + `ok ui` processes. Leaves stale locks alone.                             |
| `open-knowledge clean`  | Prune stale `.open-knowledge/{server,ui}.lock` files. Ignores live locks and foreign-host locks.       |
| `open-knowledge status` | Print the state of both locks (`{pid, port, alive, startedAt}`). `--json` for machine-readable output. |

Multi-project users can safely run `ok start` in multiple project directories simultaneously; each project has its own `.open-knowledge/{server,ui}.lock` with distinct ports.

### Windows support

macOS and Linux only (Node has long-standing bugs with detached spawn on Windows — [nodejs/node#5614](https://github.com/nodejs/node/issues/5614), [#51018](https://github.com/nodejs/node/issues/51018)). Windows demand will be revisited once the Electron desktop app lands.

## Development

```bash
git clone <repo-url>
cd open-knowledge
bun install
```

### Run the dev server

```bash
cd packages/app
bun run dev
```

Starts Vite + Hocuspocus on port 5173 with hot reload.

### Build the CLI

```bash
cd packages/cli
bun run build
```

### Run the CLI locally (after building)

```bash
bun packages/cli/dist/cli.mjs start    # Collab server — auto-spawns ok ui sibling
bun packages/cli/dist/cli.mjs ui       # React editor + /api/config (port 3000)
bun packages/cli/dist/cli.mjs init     # Scaffold .open-knowledge/ + MCP configs
bun packages/cli/dist/cli.mjs init --dev-mcp --force
                                 # Point editor MCP + Claude preview launcher at this local build
bun packages/cli/dist/cli.mjs preview  # Inspect content scope (read-only)
bun packages/cli/dist/cli.mjs mcp      # MCP stdio server
bun packages/cli/dist/cli.mjs status   # Inspect server.lock + ui.lock state
bun packages/cli/dist/cli.mjs stop     # SIGTERM live server + ui processes
bun packages/cli/dist/cli.mjs clean    # Prune stale lockfiles
```

### Quality checks

```bash
bun run lint          # Biome lint
bun run format        # Biome format
bun run typecheck     # TypeScript across all packages
bun run test          # Tests across all packages
bun run check         # All of the above
```

## Monorepo Structure

```
packages/
  core/    — Shared extensions, types, and utilities
  server/  — Hocuspocus CRDT collaboration server
  cli/     — Published CLI + MCP server (@inkeep/open-knowledge)
  app/     — React editor frontend
docs/      — Documentation site (Fumadocs)
```

## Prior Decision Revisited — detached sibling spawn (FR-1.10 / D-003)

`ok mcp` auto-spawns `ok start` as a **detached sibling process** when no live `server.lock` is present. Earlier research ([reports/zero-config-bunx-cli-packaging/REPORT.md §D4](reports/zero-config-bunx-cli-packaging/REPORT.md) Open Question #1) considered **embedding** Hocuspocus inside the MCP stdio process and rejected auto-start on the grounds that Claude Code's "kill child on session end" model would tear the server down with the MCP stdio. This spec does NOT embed: `ok start` runs in a different process group via `spawn(..., { detached: true, stdio: ['ignore', 'ignore', <fd>] }) + child.unref()`, so it has no parent-lifetime dependency on the MCP stdio. The architectural distinction — sibling, not embedded — is what supersedes §D4, not detachment alone. Detachment of an embedded child still shares the parent's process group; a sibling in its own group is independently alive when Claude Code signals the MCP stdio. See [specs/2026-04-16-zero-ceremony-resume/SPEC.md](specs/2026-04-16-zero-ceremony-resume/SPEC.md) §10 D-003.
