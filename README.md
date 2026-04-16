# Open Knowledge

Local-first knowledge base with real-time CRDT collaboration. Includes a rich editor, markdown file-backed persistence, and an MCP server for AI agent integration.

## Prerequisites

- [Bun](https://bun.sh) >= 1.3.11
- Git

## Quick Start

```bash
cd your-project
bunx @inkeep/open-knowledge init      # Scaffold .open-knowledge/ + register MCP server
bunx @inkeep/open-knowledge start     # Start the editor at http://localhost:3000
```

After `init`, open your project in an MCP-compatible editor (Claude Code, Cursor, Windsurf) and approve the `open-knowledge` server. AI agents work immediately -- `start` is optional (the MCP server operates in disk-only mode without it).

### Install globally (optional)

```bash
bun install -g @inkeep/open-knowledge
open-knowledge init
open-knowledge start
```

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
bun packages/cli/dist/cli.mjs start
bun packages/cli/dist/cli.mjs init
bun packages/cli/dist/cli.mjs preview
bun packages/cli/dist/cli.mjs mcp
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
