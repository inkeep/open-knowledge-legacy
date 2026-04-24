---
name: Current state — init's editor-target abstraction
description: Read of editors.ts + init.ts + init.test.ts at baseline ee1fc3af — the extension points this spec touches.
sources:
  - packages/cli/src/commands/editors.ts
  - packages/cli/src/commands/init.ts
  - packages/cli/src/commands/init.test.ts
  - packages/cli/src/cli.ts
baseline: ee1fc3af
date: 2026-04-17
---

# Current state — init's editor-target abstraction

## `EditorMcpTarget` shape (editors.ts:18-37)

```ts
export interface EditorMcpTarget {
  id: EditorId;
  label: string;
  configPath: (cwd: string, home?: string) => string;
  topLevelKey: 'mcpServers' | 'servers';
  buildEntry: () => Record<string, unknown>;
  scope: 'project' | 'global';
  instructionsPath?: (cwd: string) => string;
}
```

`buildEntry` takes no arguments today. Widening to `(cwd: string) => Record<string, unknown>` is a non-breaking change because all four existing implementations ignore any args anyway.

## Fixed server key (init.ts:274-278)

```ts
const servers = (config[target.topLevelKey] as Record<string, unknown> | undefined) ?? {};
const existing = servers[MCP_SERVER_NAME]; // 'open-knowledge'
```

`MCP_SERVER_NAME` is hard-coded to `'open-knowledge'` for all four targets. For Claude Desktop we need a per-target key resolution that can (a) match an existing entry by `--cwd` arg, (b) derive the default key from `basename(cwd)`, (c) auto-disambiguate with a suffix.

## `detectInstalledEditors` heuristic (init.ts:580-590)

```ts
for (const id of ALL_EDITOR_IDS) {
  const target = EDITOR_TARGETS[id];
  const configPath = target.configPath(cwd, home);
  if (existsSync(dirname(configPath))) detected.push(id);
}
```

Claude Desktop's config dir: `~/Library/Application Support/Claude/` on macOS (always exists when Claude Desktop is installed, even before the user has opened it — installer creates the dir).

## Per-editor write logic (init.ts:253-312)

`writeEditorMcpConfig(target, cwd, force, home)` reads the config, finds `existing = servers[MCP_SERVER_NAME]`, honors `--force`, writes `{ ...servers, [MCP_SERVER_NAME]: target.buildEntry() }`. The touchpoints for this spec:

1. **Call signature for `buildEntry`** → `target.buildEntry(cwd)`.
2. **Key resolution** → new optional target method `resolveServerKey(existingServers, cwd) → { key, existingEntry }`; default when absent preserves current behavior.

## Windsurf home-override pattern (editors.ts:65-72, init.test.ts:244-262)

Windsurf's `configPath` accepts an optional `home` parameter so tests can point at a fake HOME:

```ts
configPath: (_cwd, home) => join(home ?? homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
```

Tests pass `home: fakeHome` to `runInit`. Same mechanism works for Claude Desktop's macOS path. For Windows testing, the `home` override combined with a platform-mocked `process.platform` is sufficient.

## CLI `--cwd` flow (cli.ts:30-34)

```ts
.option("--cwd <path>", "Working directory")
...
.hook("preAction", (thisCommand) => {
  const opts = thisCommand.opts();
  const cwd = opts.cwd;
  if (cwd !== void 0) process.chdir(cwd);
  ...
});
```

`process.chdir()` throws `ENOENT` when the path doesn't exist — which is exactly what produced Failure 1 in the user's log. The fix is making init populate a valid `--cwd` from the start.

## Changeset convention

`bun run changeset` → adds a markdown file under `.changeset/` describing the change for npm publish. Required for any change to a published package (`@inkeep/open-knowledge`).
