# Evidence: Build Tool Interaction

**Dimension:** Build tool interaction (tsdown/esbuild)
**Date:** 2026-04-08
**Sources:** packages/cli/tsdown.config.ts (project source)

---

## Key files referenced
- `packages/cli/tsdown.config.ts` — tsdown build configuration
- `packages/cli/src/cli.ts` — uses `.ts` extensions in imports
- `packages/cli/src/commands/mcp.ts` — uses extensionless imports

---

## Findings

### Finding: tsdown bundles all relative imports — source extension style doesn't affect output
**Confidence:** CONFIRMED
**Evidence:** packages/cli/tsdown.config.ts

```typescript
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    index: 'src/index.ts',
  },
  format: 'esm',
  outputExtension: () => ({ js: '.js', dts: '.d.ts' }),
  dts: true,
  clean: true,
  deps: {
    neverBundle: ['@parcel/watcher', 'simple-git'],
  },
});
```

tsdown resolves all relative imports at build time and produces bundled output. The source code's import specifiers (with or without extensions) are resolved during the build and do not appear in the published output. Only `neverBundle` dependencies remain as external import specifiers.

**Implications:** Import extension style is purely a source-code convention when using a bundler like tsdown.

### Finding: Project currently mixes both extension styles
**Confidence:** CONFIRMED
**Evidence:** grep of packages/cli/src and packages/server/src

Files using `.ts` extensions:
- `cli.ts`: `from './commands/mcp.ts'`, `from './commands/start.ts'`, `from './index.ts'`
- `index.ts`: `from './config/loader.ts'`, `from './config/schema.ts'`
- `server/standalone.ts`: `from './agent-sessions.ts'`, `from './api-extension.ts'`

Files using extensionless imports:
- `commands/mcp.ts`: `from '../config/schema'`, `from '../mcp/server'`
- `commands/start.ts`: `from '../config/schema'`
- Test files: `from './loader'`, `from './schema'`, `from './file-watcher'`

Both styles resolve identically in Bun and at build time.

---

## Negative searches
None.

---

## Gaps / follow-ups
None.
