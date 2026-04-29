# MCP Scope Selection for `ok init`

## Problem Statement

`ok init` currently installs MCP server configuration only at the **user (global) level** — e.g., `~/.claude.json`, `~/.cursor/mcp.json`. There is no way to install at the **project level** (e.g., `.mcp.json`, `.cursor/mcp.json` relative to the working directory), which is desirable when:

- Teams want to commit MCP config to source control for consistent developer experience
- A project-level override is preferred over a global one
- Both scopes are wanted simultaneously

## Goals

Allow users to choose whether `ok init` writes MCP config to the user level, project level, or both — via an interactive multi-select prompt (default) or a `--scope` flag (for scripting/CI).

## Non-Goals

- Supporting project-level config for editors that don't have a project config format (Windsurf, Claude Desktop)
- Renaming the `--no-mcp` flag

## Requirements

### Scope resolution — priority order

1. **`--scope <user|project|both>` flag** — bypasses all prompts, used as-is
2. **Non-interactive / no-TTY** (`!process.stdout.isTTY`) — default to `both`
3. **Interactive TTY** — show multi-select prompt with both options pre-checked; user can deselect either

### Interactive prompt

When running in a TTY without `--scope`, display a multi-select (checkbox) prompt:

```
? Where should the MCP server be configured?
❯ ◉ User-level  (~/.claude.json, ~/.cursor/mcp.json, …)
  ◉ Project-level  (.mcp.json, .cursor/mcp.json, …)
```

Both options pre-selected. User can deselect one or both. Selecting neither is valid (equivalent to `--no-mcp`).

The existing `--no-mcp` flag continues to skip all MCP config regardless of prompt/scope.

### Editor target changes — `projectConfigPath`

`legacyProjectConfigPath` is renamed to `projectConfigPath` throughout `editors.ts`. It was previously used only to warn about pre-existing project-local configs; now it is also the write target for project-scope installs. The rename reflects that project-local configs are now first-class, not legacy artifacts.

| Editor | projectConfigPath |
|---|---|
| Claude Code | `<cwd>/.mcp.json` |
| Cursor | `<cwd>/.cursor/mcp.json` |
| VS Code | `<cwd>/.vscode/mcp.json` |
| Codex | `<cwd>/.codex/config.toml` |
| Windsurf | n/a (no project-config form — silently skipped for project scope) |
| Claude Desktop | n/a (silently skipped for project scope) |

### Init behavior

In `runInit` (packages/cli/src/commands/init.ts):

- scope `user`: write only to `target.configPath(home)` — identical to today
- scope `project`: write only to `target.projectConfigPath(cwd)` — skip targets without `projectConfigPath`
- scope `both`: write to both paths for each target

When project-scope is written, suppress the "project config found" notice for any path we just wrote (no longer a conflict, we own it).

### Output / Summary

- `user` only: `MCP server configuration (user): <path>` (or keep existing unlabeled format — TBD during impl)
- `project` only: `MCP server configuration (project): <path>`
- `both`: show one line per scope per editor

## Acceptance Criteria

1. `ok init` in a TTY → shows multi-select with both pre-selected; selected scope is applied
2. `ok init` in a non-TTY / piped / script context (`!process.stdout.isTTY`) → defaults to `both` without prompting
3. `ok init --scope user` → writes user-level only, no prompt
4. `ok init --scope project` → writes project-level only for Claude Code (`.mcp.json`), Cursor (`.cursor/mcp.json`), VS Code (`.vscode/mcp.json`), Codex (`.codex/config.toml`); silently skips Windsurf and Claude Desktop; no prompt
5. `ok init --scope both` → writes both scopes for all supported editors; no prompt
6. `ok init --no-mcp` → no MCP config written regardless of prompt or `--scope`
7. When project-level config is written, no "project config found" warning is shown for that path
8. Summary output reflects which scope(s) were written and their paths
9. TypeScript compiles cleanly, existing tests pass

## Technical Design

### `editors.ts`

**Rename** `legacyProjectConfigPath` → `projectConfigPath` everywhere (field definition on `EditorMcpTarget` interface, all target objects, and `collectLegacyProjectConfig` / any callers). Add `projectConfigPath` to Codex (already had it as `legacyProjectConfigPath`).

### `init.ts`

#### Scope resolution

```ts
type McpScope = 'user' | 'project' | 'both'

async function resolveMcpScope(opts: { scope?: string, mcp?: boolean }): Promise<McpScope> {
  if (opts.mcp === false) return 'user'  // --no-mcp short-circuits; scope irrelevant
  if (opts.scope) return opts.scope as McpScope
  if (!process.stdout.isTTY) return 'both'
  return promptMcpScope()  // multi-select returning 'user' | 'project' | 'both'
}
```

#### Multi-select prompt

Use the existing prompt library already used in `init.ts` (likely `@inquirer/prompts` or `prompts` — verify during impl). Render two checkbox items, both checked by default.

#### Types

Add `scope?: McpScope` to `InitCommandOptions`.

#### Commander flag

```ts
.option('--scope <scope>', 'Write MCP config at user level, project level, or both')
```

No default value on the Commander flag — `resolveMcpScope` owns defaulting logic.

#### `runInit` loop

```ts
const writesUser = (s: McpScope) => s !== 'project'
const writesProject = (s: McpScope) => s !== 'user'

for (const target of targets) {
  if (writesUser(scope)) {
    results.push(writeEditorMcpConfig(target, cwd, installOptions, home))
  }
  if (writesProject(scope) && target.projectConfigPath) {
    results.push(writeEditorMcpConfig(target, cwd, installOptions, home, target.projectConfigPath(cwd)))
  }
}
```

#### `writeEditorMcpConfig` — configPathOverride

Add optional `configPathOverride?: string` parameter. When provided, use it instead of `target.configPath(cwd, home)`. Minimal change, no new abstraction.

#### Project-config notice suppression

After building `existingProjectConfigs` (renamed from `legacyProjectConfigs`), filter out any path that was just written by project-scope install.

### Prompt library

Check `packages/cli/package.json` and existing prompt usage in `init.ts` to determine which library is already in use. Do not add a new dependency — use whatever is already there.

## Open Questions

- [RESOLVED] Default scope: interactive multi-select (both pre-selected) in TTY; `both` in non-TTY; `--scope` overrides
- [RESOLVED] Editors without project-config form: silently skip
- [RESOLVED] Codex: has `.codex/config.toml` project config → supported
- [RESOLVED] "legacy" rename → `projectConfigPath` / "project config found" notice
