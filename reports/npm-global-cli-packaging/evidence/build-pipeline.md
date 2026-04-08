# Evidence: TypeScript Build Pipeline for CLI Distribution

**Dimension:** TypeScript build pipeline for CLI distribution
**Date:** 2026-04-08
**Sources:** tsup, tsdown, unbuild, pkgroll, esbuild source + docs; wrangler, create-t3-app, tsx, nuxi, taze, eslint, prettier build configs

---

## Key files / pages referenced

- tsup `src/options.ts` — complete option interface
- tsup README — declares itself unmaintained, recommends tsdown
- tsdown source — Rolldown engine, ShebangPlugin, deps.neverBundle
- wrangler `tsup.config.ts` — production CLI build example
- create-t3-app build config — tsup ESM output
- tsx package.json — pkgroll zero-config
- nuxi, taze — tsdown adopters

---

## Findings

### Finding: tsup declares itself unmaintained — recommends tsdown as successor
**Confidence:** CONFIRMED
**Evidence:** tsup README

tsup still works but will not receive new features. Starting a new project on tsup means a future migration.

### Finding: tsdown (Rolldown-powered) is the recommended build tool for new CLI projects
**Confidence:** CONFIRMED
**Evidence:** tsdown source, nuxi + taze adoption

Advantages over tsup:
- Rolldown engine (faster, better tree-shaking than esbuild)
- Automatic shebang detection and chmod 755
- Smart dependency externalization via `deps.neverBundle`
- dts via oxc (extremely fast with isolatedDeclarations)
- Node 20.19+ required (aligns with Node 22+ target)
- nuxi and taze ship with tsdown in production

```typescript
// tsdown.config.ts
import { defineConfig } from 'tsdown'
export default defineConfig({
  entry: { cli: 'src/cli.ts', index: 'src/index.ts' },
  format: 'esm',
  dts: true,
  deps: { neverBundle: ['@parcel/watcher', 'simple-git'] },
})
```

### Finding: Partial bundling is the right strategy — bundle pure JS, externalize native addons
**Confidence:** CONFIRMED
**Evidence:** Wrangler (tsup + external list), Drizzle-Kit (esbuild + external drivers)

`@parcel/watcher` has native C++ binaries — MUST be externalized. `simple-git` spawns subprocesses — simpler to externalize. Yjs, Hocuspocus, ws are pure JS — safe to bundle.

### Finding: Multiple entry points (CLI + library) work via array config or named entries
**Confidence:** CONFIRMED
**Evidence:** tsdown, tsup, pkgroll configs

CLI entry gets shebang, no dts. Library entry gets dts, no shebang. Both produce ESM output in `dist/`.

### Finding: Shebang handling varies by tool — tsdown auto-detects, tsup uses banner option
**Confidence:** CONFIRMED
**Evidence:** Tool source code comparison

| Tool | Method | Auto-chmod? |
|------|--------|-------------|
| tsdown | Auto-detect from source | Yes |
| tsup | `banner: { js: '#!/usr/bin/env node' }` | Yes |
| pkgroll | Auto-patches bin entries | Yes |
| unbuild | No built-in support | No |

### Finding: unbuild is not recommended — no shebang support, migrating to obuild
**Confidence:** CONFIRMED
**Evidence:** unbuild source, UnJS ecosystem direction

unbuild requires manual post-build shebang insertion. The ecosystem is moving to obuild/tsdown.

---

## Gaps / follow-ups

* tsdown is beta — if stability is a concern, tsup is the fallback
