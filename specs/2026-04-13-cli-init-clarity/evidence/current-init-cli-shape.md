---
title: Current state — init/start CLI shape
sources:
  - packages/cli/src/commands/init.ts
  - packages/cli/src/commands/start.ts
  - packages/cli/src/content/init.ts
  - packages/cli/package.json
  - packages/server/src/content-filter.ts
  - packages/server/src/file-watcher.ts
date: 2026-04-13
---

# Current state — init/start CLI shape

## `runInit()` public surface (`init.ts:170`)

```ts
export function runInit(options: InitCommandOptions = {}): InitCommandResult
```

Returns:
```ts
interface InitCommandResult {
  contentCreated: string[];   // scaffold files created
  contentSkipped: string[];   // scaffold files already present
  editors: EditorMcpResult[]; // per-editor MCP write results
  mcpAction: 'written' | 'skipped-existing' | 'overwritten' | 'skipped-flag' | 'failed';
  mcpPath: string;
  mcpError?: string;
}
```

No content-preview field. No file enumeration ever happens.

## `formatInitResult()` output (`init.ts:231`)

Renders three sections:
1. Content scaffolding summary ("Content scaffolded at ...; Created: AGENTS.md, .gitignore, config.yml")
2. MCP server configuration table (per-editor)
3. Next steps (3 bulleted hints — "open editor", "approve MCP", "use workflow tools")

No mention of which content files exist or will be tracked.

## `start --open` is macOS-only (`start.ts:198-204`)

```ts
if (opts.open) {
  const { execFile } = await import('node:child_process');
  const url = `http://${config.server.host}:${config.server.port}`;
  execFile('open', [url], (err) => {
    if (err) console.error(`${error('Failed to open browser:')} ${err.message}`);
  });
}
```

`open` is the macOS launcher binary. On Linux this fails (`open` is a different unrelated command); on Windows it doesn't exist at all. Error is printed but no fallback is attempted.

## `start` already auto-scaffolds (`start.ts:33-47`)

```ts
const okDir = resolve(cwd, '.open-knowledge');
if (!existsSync(okDir) && opts.init !== false) {
  const { runInit } = await import('./init.ts');
  const result = runInit({ cwd, mcp: false });
  // ...
}
```

Implication: there are TWO paths a user can take to first-run init:
1. Explicit `open-knowledge init` (with MCP write)
2. Implicit via `open-knowledge start` (scaffold only, no MCP write)

A complete preview UX must cover both. Open Question Q1.

## `ContentFilter` is in server, not core (`packages/server/src/content-filter.ts`)

```ts
export function createContentFilter(opts: {
  projectDir: string;
  contentDir: string;
  includePatterns: string[];
  excludePatterns: string[];
}): ContentFilter
```

Returns `isExcluded(relPath)`, `isDirExcluded(relPath)`, `getWatcherIgnoreGlobs()`.

CLI `package.json` already declares `@inkeep/open-knowledge-server: workspace:*` as a dep, so importing is free — no architectural change.

## File watcher uses ContentFilter for the startup walk

`file-watcher.ts` walks `contentDir` recursively at startup, applying `isExcluded` per file and `isDirExcluded` per directory. Any preview helper that uses `createContentFilter()` and mirrors this walk will produce a count exactly matching what the watcher will index.

## Default scope (assumed — verify)

Per `CLAUDE.md`:
- `content.dir: '.'`
- `content.include: ['**/*.md']`
- `content.exclude: []`

So: every markdown file under the project root that isn't gitignored becomes content. For a project with vendored docs, archived markdown, or generated content, this is "everything," which is what Nick experienced.
