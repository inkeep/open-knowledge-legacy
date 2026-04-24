---
title: EDITOR_TARGETS topology — all global, detection home-only
sources:
  - packages/cli/src/commands/editors.ts:258-327
  - packages/cli/src/commands/init.ts:802-817
date: 2026-04-21
---

# Editor target topology (packages/cli)

All six `EDITOR_TARGETS` entries declare `scope: 'global'`. Config paths resolve via `home` (defaulted to `os.homedir()`), never `cwd`. `cwd` is passed through the signatures but only used by `legacyProjectConfigPath` (migration-from-project-local) and `instructionsPath` (AGENTS.md / CLAUDE.md writes in the repo root).

| Editor id | scope | Primary configPath | detectPath (home-based) | Legacy project config |
|---|---|---|---|---|
| `claude` (Claude Code) | global | `resolveClaudeCodeConfigPath({ home })` (`~/.claude.json` or similar) | `~/.claude` | `<cwd>/.mcp.json` |
| `claude-desktop` | global | `resolveClaudeDesktopConfigPath({ home })` (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS) | dir of configPath | — |
| `cursor` | global | `resolveCursorConfigPath({ home })` (`~/.cursor/mcp.json`) | dir of configPath | `<cwd>/.cursor/mcp.json` |
| `vscode` | global | `resolveVsCodeConfigPath({ home })` | dir of configPath | `<cwd>/.vscode/mcp.json` |
| `windsurf` | global | `resolveWindsurfConfigPath({ home })` | dir of configPath | — |
| `codex` | global | `resolveCodexConfigPath({ home })` (`~/.codex/config.toml`) | dir of configPath | `<cwd>/.codex/config.toml` |

## Consequences for M6b (D-M6-R1 user-scoped consent)

- **`detectInstalledEditors(cwd, home?)` takes `cwd` but never uses it** for detection — every editor defines `detectPath` and the fallback branch (`dirname(configPath(cwd, home))`) is unreachable. Calling from Electron main with `cwd = ''` or `cwd = app.getPath('home')` works identically.
- **Primary writes already land at user-level paths.** M6b's "user-level MCP config" framing matches the current CLI default. No new write path needed; the existing `runInit` already writes to `home`-resolved paths.
- **`legacyProjectConfigPath` is a migration-source, not a write target.** Primary writes go to user-level `configPath`. The spec's claim that project-scoped consent would be the alternative would actually mean writing to `legacyProjectConfigPath` — which `runInit` does not do by default.

## `cliPath` vs existing `cliEntryPath`

Current shapes in `buildManagedServerEntry`:

- **Published (default):** `{ command: 'npx', args: ['@inkeep/open-knowledge', 'mcp'] }`
- **Dev (`--dev-mcp`):** `{ command: 'node', args: [<resolved cli.mjs>, 'mcp'], env: {...} }`

Existing `cliEntryPath?: string` is scoped to `--dev-mcp` resolution — it's a path to `packages/cli/dist/cli.mjs`, not a binary. `resolveDevCliDistPath` validates `basename === 'cli.mjs'`.

M6b's proposed `cliPath?: string` is a different concept — a path to a `ok` / `ok.sh` executable (bash wrapper or bin shim), invoked with `args: ['mcp']` and no env. Adding it as a NEW field is correct; repurposing `cliEntryPath` would conflate semantics.

**Implementation sketch for `buildManagedServerEntry`:**

```ts
function buildManagedServerEntry(options: McpInstallOptions = {}): Record<string, unknown> {
  if (options.cliPath) {
    return { command: options.cliPath, args: ['mcp'] };
  }
  if (options.mode === 'dev') {
    return {
      command: DEV_MCP_SERVER_COMMAND,
      args: [resolveDevCliDistPath(options.cliEntryPath), 'mcp'],
      env: { ...DEV_MCP_ENV },
    };
  }
  return { command: PUBLISHED_MCP_SERVER_COMMAND, args: [...PUBLISHED_MCP_SERVER_ARGS] };
}
```

`cliPath` takes precedence over `mode`. Backward-compatible: existing callers that don't set `cliPath` see no behavior change.
