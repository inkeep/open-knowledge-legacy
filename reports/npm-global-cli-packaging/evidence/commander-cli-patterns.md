# Evidence: Commander.js CLI Patterns

**Dimension:** CLI structure with Commander.js
**Date:** 2026-04-08
**Sources:** Commander.js v14 source + CHANGELOG, @inkeep/agents-cli, Vite, Next.js, Turbo, Wrangler CLIs, PROJECT.md, STORIES.md

---

## Key files / pages referenced

- @inkeep/agents-cli `src/index.ts` — Commander v14 setup pattern
- Commander.js v14 CHANGELOG — `optionsGroup()`, `commandsGroup()`, `configureHelp()` additions
- PROJECT.md lines 259-277 — CLI integration requirements
- STORIES.md lines 228-263 — Bucket 6 CLI stories (T6.1, T6.2)
- Hocuspocus Server source — `listen()`, `destroy()`, signal handling

---

## Findings

### Finding: Command structure should use `start` as default command with `{ isDefault: true }`
**Confidence:** CONFIRMED
**Evidence:** PROJECT.md + STORIES.md

U6.2 specifies `npx openknowledge` (no args) starts the server. Commander's `{ isDefault: true }` on the `start` command achieves this:

```typescript
program.command('start', { isDefault: true })
  .description('Start the collaboration server')
  .action(async (options) => { await startServer(options); });
```

Both `npx open-knowledge` and `npx open-knowledge start` invoke the server.

Additional commands: `init [path]`, `status`, `config` (future).

### Finding: Commander v14 preAction hooks enable config file loading before any command
**Confidence:** CONFIRMED
**Evidence:** Commander.js source

```typescript
program.hook('preAction', async (thisCommand, actionCommand) => {
  const config = await loadConfig(thisCommand.opts().cwd);
  // Apply config values where Commander doesn't have a higher-priority source
  for (const [key, value] of Object.entries(config)) {
    if (actionCommand.getOptionValueSource(key) === 'default') {
      actionCommand.setOptionValueWithSource(key, value, 'config');
    }
  }
});
```

Precedence tracking via `setOptionValueWithSource()` / `getOptionValueSource()`: cli > env > config > default.

### Finding: `parseAsync()` is mandatory for server CLIs with async action handlers
**Confidence:** CONFIRMED
**Evidence:** Commander.js README

"If you are using async actions, you should call `.parseAsync()` rather than `.parse()`."

### Finding: Hocuspocus `destroy()` provides graceful shutdown — CLI just needs signal handlers
**Confidence:** CONFIRMED
**Evidence:** Hocuspocus Server source

`destroy()` closes HTTP server, waits for documents to flush, fires `onDestroy` hooks. The CLI adds:

```typescript
process.on('SIGINT', () => { await server.destroy(); process.exit(0); });
process.on('SIGTERM', () => { await server.destroy(); process.exit(0); });
```

### Finding: Commander v14 adds `optionsGroup()` for organized help output
**Confidence:** CONFIRMED
**Evidence:** Commander.js v14 CHANGELOG

New in v14: `.optionsGroup('Server Options:')` visually groups related options in `--help` output.

### Finding: @commander-js/extra-typings provides inferred option types
**Confidence:** CONFIRMED
**Evidence:** Commander.js docs

Alternative to manual type assertions on `program.opts<T>()`. Import `Command` from `@commander-js/extra-typings` for automatic TypeScript inference from `.option()` calls.

---

## Gaps / follow-ups

* None — dimension fully covered
