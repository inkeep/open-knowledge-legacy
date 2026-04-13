# DIFF TEST LINE

# DIFF TEST LINE

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

