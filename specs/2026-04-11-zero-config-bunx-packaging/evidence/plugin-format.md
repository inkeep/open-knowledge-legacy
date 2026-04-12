---
title: "Claude Code plugin format investigation"
sources:
  - https://code.claude.com/docs/en/plugins
  - https://code.claude.com/docs/en/plugins-reference
  - https://code.claude.com/docs/en/desktop
  - https://github.com/anthropics/claude-code/issues/16143
---

# Claude Code Plugin Format

## Plugin directory structure

```
open-knowledge-plugin/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest (required)
├── .mcp.json                # MCP server definitions (must be separate file, not inline)
├── hooks/
│   └── hooks.json           # SessionStart hook for starting collab server
├── skills/                  # Skills (optional)
├── README.md
```

## Key finding: launch.json is NOT a plugin feature

`.claude/launch.json` is a **project-level Desktop feature** for auto-starting preview servers.
It is NOT part of the plugin system. A plugin cannot ship a `launch.json`.

**Workaround:** Use a SessionStart hook to start the collaboration server:
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "npx @inkeep/open-knowledge start --quiet &"
      }]
    }]
  }
}
```

## Key finding: inline mcpServers in plugin.json are broken

[Issue #16143](https://github.com/anthropics/claude-code/issues/16143): Inline `mcpServers` in plugin.json
are silently dropped. Must use separate `.mcp.json` file at plugin root.

## plugin.json schema (relevant fields)

```json
{
  "name": "open-knowledge",
  "version": "0.1.0",
  "description": "CRDT knowledge base with real-time collaboration",
  "author": { "name": "Inkeep" },
  "repository": "https://github.com/inkeep/open-knowledge"
}
```

## .mcp.json format

```json
{
  "mcpServers": {
    "open-knowledge": {
      "command": "npx",
      "args": ["@inkeep/open-knowledge", "mcp"]
    }
  }
}
```

## Installation methods

1. Official marketplace: `/plugin install open-knowledge@marketplace-name`
2. Custom marketplace: `/plugin marketplace add inkeep/claude-plugins`
3. Local development: `claude --plugin-dir ./open-knowledge-plugin`

## Environment variables

- `${CLAUDE_PLUGIN_ROOT}` → absolute path to plugin installation directory
- `${CLAUDE_PLUGIN_DATA}` → persistent data directory (~/.claude/plugins/data/{id}/)

## SessionStart hook for server lifecycle

A plugin can start a background server via hook, but:
- The server process must be backgrounded (`&`)
- There's no built-in cleanup on session end
- The server would persist between sessions (which may be desirable for open-knowledge)
