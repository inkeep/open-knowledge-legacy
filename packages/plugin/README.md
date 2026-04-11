# Open Knowledge — Claude Code Plugin

Claude Code plugin that provides the Open Knowledge MCP server for AI agent tools.

## What this plugin provides

- **MCP server auto-start**: When you open a project in Claude Code, the `open-knowledge` MCP server starts automatically via stdio. Agent tools (init-content, ingest, research, write/edit documents) are available immediately.
- **Disk-only mode**: The MCP server works without the collaboration server running. All file operations use native Read/Edit/Grep tools.

## Installation

```bash
# From marketplace (when published):
claude plugin add open-knowledge

# For development:
claude --plugin-dir ./packages/plugin
```

## Usage

Once installed, open any project in Claude Code. The MCP tools are available in your conversation:

- `mcp__open-knowledge__init-content` — Bootstrap articles from the codebase
- `mcp__open-knowledge__ingest` — Capture an external source
- `mcp__open-knowledge__research` — Gather sources and write findings
- `mcp__open-knowledge__write_document` — Write a document via CRDT layer
- `mcp__open-knowledge__edit_document` — Edit a document via CRDT layer

## Browser editor

For the collaborative browser editor, run the server separately:

```bash
bunx @inkeep/open-knowledge
```

This starts the Hocuspocus collaboration server and serves the React editor UI at `http://localhost:3000`.

## Note

This plugin uses a separate `.mcp.json` file (not inline `mcpServers` in `plugin.json`) due to a [known issue](https://github.com/anthropics/claude-code/issues/16143) with inline MCP server definitions in plugins.
