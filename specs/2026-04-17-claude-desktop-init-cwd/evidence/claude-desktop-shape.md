---
name: Claude Desktop MCP config shape (observed)
description: Direct read of owner's working claude_desktop_config.json on macOS — canonical shape the spec must produce.
sources:
  - /Users/timothycardona/Library/Application Support/Claude/claude_desktop_config.json
  - packages/cli/src/commands/editors.ts
  - packages/cli/dist/cli.mjs
date: 2026-04-17
---

# Claude Desktop MCP config shape (observed)

## Raw observed config (macOS, 2026-04-17)

File path: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "open-knowledge-bim-tools": {
      "command": "npx",
      "args": [
        "@inkeep/open-knowledge",
        "mcp",
         "--cwd", "/Users/timothycardona/inkeep/bim-tools"
      ]
    }
  },
    "preferences": {
    "coworkScheduledTasksEnabled": true,
    "ccdScheduledTasksEnabled": true,
    "sidebarMode": "epitaxy",
    "coworkWebSearchEnabled": true
  }
}
```

## Findings

1. **Top-level key is `mcpServers`** — identical to `.mcp.json` (project-scoped Claude Code config). Same top-level key as Cursor / Windsurf; different from VS Code's `servers`.
2. **Server entry shape is `{ command, args }`** — no `type: 'stdio'` needed. Claude Desktop infers stdio transport from the presence of `command`.
3. **Project-qualified key** — owner naturally chose `open-knowledge-bim-tools` (not `open-knowledge`). This is the evidence for D1 (server-key convention): a global, shared config across projects motivated project-qualification organically.
4. **`--cwd` is already supported** at `packages/cli/dist/cli.mjs:33` — the preAction hook calls `process.chdir(cwd)` before the `mcp` subcommand runs. No CLI work needed.
5. **Other top-level keys (`preferences`) are preserved by Claude Desktop** and must be preserved by init's write logic. The existing `readMcpConfig` / `writeMcpConfig` spread-and-merge pattern already honors this.

## Observed failure modes in MCP logs (user, 2026-04-17)

Two distinct failures reproduced in owner's Claude.ai MCP log when registration was not done correctly:

**Failure 1** — `--cwd` present but points at nonexistent directory:
```
Error: ENOENT: no such file or directory, chdir '/' -> '/Users/timothycardona/inkeep/karpathy-test'
  at process.chdir (node:internal/worker:111:5)
  at Object.callback (file:///.../cli.mjs:33:30)
```

**Failure 2** — `--cwd` absent, client spawned from `/`:
```
MCP server failed to start: ENOENT: no such file or directory, mkdir '/.open-knowledge'
```

Both confirm: Claude Desktop / Claude.ai spawn MCP with cwd `/`, so `--cwd <abs-path>` is load-bearing.

## Client identifier

The MCP initialize handshake from the Claude.ai web app arrives with:

```json
{"clientInfo":{"name":"claude-ai","version":"0.1.0"}}
```

This suggests `claude_desktop_config.json` is shared between the Claude Desktop app and the claude.ai web-app connector (pending confirmation — tracked as Q2 in SPEC.md §11).

## Windows path (unverified — secondary source)

Per Anthropic's documented MCP setup path, on Windows the config lives at:

```
%APPDATA%\Claude\claude_desktop_config.json
```

i.e. typically `C:\Users\<name>\AppData\Roaming\Claude\claude_desktop_config.json`.

Not directly verified on hardware; no Windows test machine in this session. Implementer should use `process.env.APPDATA` with `os.homedir() + '\\AppData\\Roaming'` fallback.

## No Linux support

Anthropic does not ship a Claude Desktop Linux build as of 2026-04-17. NG4 / D9 in SPEC.md.
