# Evidence: Compatibility with Vite/Hocuspocus Stack

**Dimension:** D6 — Does just-bash work with Vite, Hocuspocus, our stack?
**Date:** 2026-04-02
**Sources:** just-bash package.json, browser.ts, npm registry

---

## Key files referenced

- `package.json` — exports, dependencies, build configuration
- `src/browser.ts` — browser-compatible entry point
- `README.md` — configuration documentation

---

## Findings

### Finding: just-bash provides both ESM and CJS builds with browser entry point
**Confidence:** CONFIRMED
**Evidence:** `package.json` lines 16-31

```json
"exports": {
  ".": {
    "browser": "./dist/bundle/browser.js",
    "require": { "default": "./dist/bundle/index.cjs" },
    "import": { "default": "./dist/bundle/index.js" }
  },
  "./browser": { "import": "./dist/bundle/browser.js" }
}
```

Vite would resolve to the browser entry point for client-side code and the ESM entry for server-side code. The `"type": "module"` field confirms ESM-first.

### Finding: Browser bundle excludes OverlayFs, ReadWriteFs, and Sandbox (node:fs dependent)
**Confidence:** CONFIRMED
**Evidence:** `src/browser.ts` lines 1-11

```typescript
/**
 * Browser-compatible entry point for just-bash.
 * Excludes Node.js-specific modules:
 * - OverlayFs (requires node:fs)
 * - ReadWriteFs (requires node:fs)
 * - Sandbox (uses OverlayFs)
 */
```

For a Vite app: browser side gets InMemoryFs + MountableFs + all commands. Server side (Hocuspocus extensions, MCP server) gets all four filesystem implementations.

### Finding: npm package is 18.8MB unpacked with 15 runtime dependencies
**Confidence:** CONFIRMED
**Evidence:** `npm view just-bash` output

Unpacked size: 18.8 MB (includes CPython Emscripten WASM for python command, QuickJS WASM for js-exec). The esbuild-minified bundle is significantly smaller — the build scripts use `--minify` and code splitting.

Dependencies: diff, minimatch, sprintf-js, turndown, sql.js, quickjs-emscripten, re2js, fast-xml-parser, file-type, ini, modern-tar, papaparse, yaml, smol-toml, compressjs.

Several of these are externalized in the bundle build (`--external:diff --external:minimatch --external:sprintf-js ...`), meaning they're loaded on demand via node_modules, not bundled inline.

### Finding: can coexist with Hocuspocus in the same Node.js process
**Confidence:** INFERRED
**Evidence:** Structural analysis — no global state, no process-level side effects

just-bash instances are self-contained objects. The Bash class stores all state internally (filesystem, commands, interpreter state). No global singletons, no process.env mutations, no global event listeners. Multiple Bash instances can run concurrently.

The one exception is `DefenseInDepthBox` which patches global JavaScript prototypes during execution — but only when `defenseInDepth: true` is configured, and it uses `AsyncLocalStorage` to scope patches to the execution context. For an MCP server, defense-in-depth would be recommended.

### Finding: Actively maintained — 314 commits in ~4 months
**Confidence:** CONFIRMED
**Evidence:** git log

- First commit: 2025-12-23
- Latest commit: 2026-03-19
- 86 npm versions published
- Apache-2.0 license
- ~939 GitHub stars

Release cadence: roughly one new version every 1.5 days on average over the project's lifetime. Heavy security focus — recent commits include defense-in-depth, DNS rebinding protection, prototype pollution defense, sandbox escape hardening.

### Finding: TypeScript types are comprehensive and exported
**Confidence:** CONFIRMED
**Evidence:** `src/index.ts` — 50+ exported types

IFileSystem, all filesystem entry types, BashOptions, ExecOptions, Command, CommandContext, ExecResult, BashExecResult, InitialFiles, LazyFileProvider, and more are all exported with full TypeScript declarations.

### Finding: Tree-shakeable command loading via lazy imports
**Confidence:** CONFIRMED
**Evidence:** `src/commands/registry.ts` lines 1-10

Commands are registered as lazy loaders:
```typescript
interface LazyCommandDef<T extends string = string> {
  name: T;
  load: CommandLoader;
}
```

The `commands` option on BashOptions lets you restrict which commands are loaded: `new Bash({ commands: ["cat", "grep", "ls", "find", "sed"] })`. This would reduce the import surface for a KB-focused use case.

---

## Gaps / follow-ups

* Actual minified bundle size for a KB-subset of commands not measured
* Whether Vite dev server handles the WASM dependencies (sql.js, quickjs-emscripten) without configuration
