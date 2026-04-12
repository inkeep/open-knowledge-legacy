---
title: "Codebase current state — files affected by zero-config packaging"
sources:
  - packages/cli/src/commands/start.ts
  - packages/cli/src/commands/init.ts
  - packages/cli/src/config/schema.ts
  - packages/cli/src/config/loader.ts
  - packages/cli/tsdown.config.ts
  - packages/cli/package.json
  - packages/server/src/file-watcher.ts
  - packages/app/package.json
---

# Codebase Current State

## Asset path resolution (start.ts:60-70)

```typescript
const cliDir = import.meta.dirname ?? new URL('.', import.meta.url).pathname;
const assetPaths = [
  resolve(cliDir, '../../app/dist'), // from src: packages/cli/src → packages/app/dist
  resolve(cliDir, '../../../app/dist'), // from dist: packages/cli/dist → packages/app/dist
];
const assetDir = assetPaths.find((p) => existsSync(p));
```

Both paths assume monorepo layout. `import.meta.dirname` in an npm-installed package points to the cache directory (e.g., `/var/folders/.../bunx-501-@inkeep+open-knowledge@0.1.0/node_modules/@inkeep/open-knowledge/dist/`). Neither `../../app/dist` nor `../../../app/dist` will exist there.

## Build pipeline (tsdown.config.ts)

```typescript
export default defineConfig({
  entry: { cli: 'src/cli.ts', index: 'src/index.ts' },
  format: 'esm',
  outputExtension: () => ({ js: '.js', dts: '.d.ts' }),
  dts: true, clean: true,
  deps: {
    alwaysBundle: ['@inkeep/open-knowledge-core', '@inkeep/open-knowledge-server'],
    neverBundle: ['@parcel/watcher', 'simple-git'],
  },
});
```

No step to copy React app assets. `alwaysBundle` correctly inlines workspace packages. `neverBundle` correctly externalizes native addons.

## Package metadata (cli/package.json)

- `"files": ["dist"]` — only dist/ is published
- `"bin": { "open-knowledge": "./dist/cli.mjs" }` — bin entry resolves correctly for bunx/npx
- `"engines": { "node": ">=22" }`
- Build script: `"build": "tsdown"` — no app build step

## File watcher (server/file-watcher.ts:21)

```typescript
import { type AsyncSubscription, subscribe } from '@parcel/watcher';
```

Hard import — no try/catch, no fallback. If @parcel/watcher fails to load, the entire server crashes.

## Config defaults (config/schema.ts)

- `server.port`: 3000
- `server.host`: 'localhost'
- `content.dir`: '.'
- `content.include`: ['**/*.md']
- `content.exclude`: []

## Init flow (init.ts)

- `runInit()` creates `.open-knowledge/` with AGENTS.md, .gitignore, config.yml
- Creates subdirs: articles/, external-sources/, research/
- Writes MCP entry to `.mcp.json` with `command: 'npx', args: ['@inkeep/open-knowledge', 'mcp']`
- Idempotent: skips existing files, `--force` to overwrite

## App build output (packages/app/dist/)

- `index.html` + `favicon.svg`
- `assets/index-*.js` (1.9MB — Vite-bundled React + TipTap + CodeMirror)
- `assets/index-*.css` (77KB — Tailwind CSS)
- Total: 2.0MB

## CLI build output (packages/cli/dist/)

- `cli.mjs` + chunk files (~6.1MB total — includes bundled core + server)
- Type declarations (`.d.mts`)
- Source maps (`.map`)
