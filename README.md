# Open Knowledge

Local-first knowledge base with real-time CRDT collaboration. Includes a rich editor, markdown file-backed persistence, and an MCP server for AI agent integration.

## Prerequisites

- [Bun](https://bun.sh) >= 1.3.11
- [Node.js](https://nodejs.org) >= 22
- Git

## Quick Start

### Install the CLI

```bash
bun install -g @inkeep/open-knowledge
```

Or run directly with bunx:

```bash
bunx @inkeep/open-knowledge
```

### Initialize a project wiki

```bash
cd your-project
open-knowledge init
```

This scaffolds a `.open-knowledge/` directory and registers the MCP server in `.mcp.json`.

### Start the editor

```bash
open-knowledge start
```

Opens the collaborative editor at `http://localhost:5173`. Edits are persisted as markdown files in `.open-knowledge/`.

### Start the MCP server

```bash
open-knowledge mcp
```

Starts the MCP stdio server for AI agent integration.

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
node packages/cli/dist/cli.mjs start
node packages/cli/dist/cli.mjs init
node packages/cli/dist/cli.mjs mcp
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

## License

See [LICENSE](LICENSE).
