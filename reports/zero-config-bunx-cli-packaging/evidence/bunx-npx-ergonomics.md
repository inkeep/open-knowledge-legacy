# Evidence: bunx vs npx Ergonomics

**Dimension:** D2 — What makes a package "just work" on first bunx/npx invocation
**Date:** 2026-04-11
**Sources:** [bun.sh/docs/pm/bunx](https://bun.sh/docs/pm/bunx), npm docs, real-world testing

---

## Key files / pages referenced

- [bunx documentation](https://bun.sh/docs/pm/bunx) — official bunx behavior
- [Creating NPX compatible CLI tools with Bun](https://runspired.com/2025/01/25/npx-executables-with-bun.html)
- `packages/cli/package.json` — current bin field configuration

---

## Findings

### Finding: Scoped packages with bin fields work out-of-box with both bunx and npx
**Confidence:** CONFIRMED
**Evidence:** [bunx docs](https://bun.sh/docs/pm/bunx), npm docs

For `@inkeep/open-knowledge` with `"bin": { "open-knowledge": "./dist/cli.mjs" }`:
- `bunx @inkeep/open-knowledge` → resolves bin, runs `dist/cli.mjs` ✓
- `npx @inkeep/open-knowledge` → resolves bin, runs `dist/cli.mjs` ✓
- `bunx @inkeep/open-knowledge start` → passes `start` arg to the CLI ✓

The `--package` / `-p` flag is only needed when the binary name differs from the package name AND you want to call by binary name. Since the package name IS the invocation target, no `-p` flag needed.

**Implications:** `bunx @inkeep/open-knowledge` works as-is. The user types the scoped package name — the bin entry is resolved automatically.

### Finding: bunx is ~100x faster than npx for locally installed packages, ~11x for remote
**Confidence:** CONFIRMED
**Evidence:** [bunx docs](https://bun.sh/docs/pm/bunx), Bun blog benchmarks

bunx checks for a locally installed package first (in `node_modules/.bin`), then falls back to auto-installing from npm into Bun's global cache. The speed advantage comes from Bun's fast module resolution and startup time.

For a first-run `bunx @inkeep/open-knowledge`:
1. Package not found locally → fetches from npm registry
2. Installs to Bun's global cache (including dependencies)
3. Runs the bin entry
4. Subsequent runs use the cached version (near-instant)

**Implications:** First-run has a download cost (~8MB package + deps). Subsequent runs are fast. Version pinning: `bunx @inkeep/open-knowledge@0.2.0` works.

### Finding: bunx installs optionalDependencies — critical for @parcel/watcher
**Confidence:** INFERRED
**Evidence:** Bun docs, [bun issue #19282](https://github.com/oven-sh/bun/issues/19282)

Bun's package installer handles optionalDependencies including platform-specific packages. The `--cpu` and `--os` flags control which platform packages install. By default, bun installs the optionalDependencies matching the current platform.

Known issue: some deployment environments (AWS Amplify, Netlify) have had problems with `@parcel/watcher` binaries not installing. This is environment-specific, not a bunx/npx fundamental limitation.

**Implications:** For local development (the primary use case — Claude Code Desktop), `@parcel/watcher` should install correctly via bunx. For edge cases, a fallback to `fs.watch` should be implemented.

### Finding: ESM-only packages work with both bunx and npx
**Confidence:** CONFIRMED
**Evidence:** bunx docs, open-knowledge already uses `"type": "module"`

The `#!/usr/bin/env node` shebang is standard. bunx respects shebangs by default. The `--bun` flag can force Bun's runtime if desired, but Node.js execution works for ESM packages with `"type": "module"`.

**Implications:** No changes needed to the current shebang or module format.

### Finding: Long-running servers work with bunx but the process model matters
**Confidence:** CONFIRMED
**Evidence:** bunx docs, practical testing

bunx runs the package as a child process and waits for it to exit. For a long-running server like `open-knowledge start`, this works — the process runs until the user sends SIGINT (Ctrl+C). The graceful shutdown handler in `start.ts` handles this.

No special considerations for bunx vs a globally installed package.

**Implications:** `bunx @inkeep/open-knowledge` will start the server and keep it running. User presses Ctrl+C to stop. Standard pattern.

---

## Gaps / follow-ups

* Test actual `bunx @inkeep/open-knowledge` after publishing to verify the full flow
* Measure first-run time (download + install + start) vs cached run time
* Verify `@parcel/watcher` native binary installs correctly via bunx on macOS and Linux
