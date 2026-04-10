# Evidence: Native Addon Compatibility (D5)

**Dimension:** NAPI support, @parcel/watcher, SQLite, and native addon ecosystem in Bun
**Date:** 2026-04-03
**Sources:** Bun documentation, GitHub issues, community reports

---

## Key files / pages referenced

- [Bun Node-API docs](https://bun.com/docs/runtime/node-api) -- Official NAPI implementation status
- [Bun NAPI tracking issue](https://github.com/oven-sh/bun/issues/158) -- Implementation progress
- [bun:sqlite docs](https://bun.com/docs/runtime/sqlite) -- Built-in SQLite
- [Bun compatibility 2026 article](https://dev.to/alexcloudstar/bun-compatibility-in-2026-what-actually-works-what-does-not-and-when-to-switch-23eb) -- Compatibility assessment

---

## Findings

### Finding: Bun implements 95% of Node-API (NAPI)
**Confidence:** CONFIRMED
**Evidence:** [Bun Node-API docs](https://bun.com/docs/runtime/node-api)

"Bun implements 95% of the Node-API interface from scratch, so most existing Node-API extensions will work with Bun out of the box."

Remaining 5% includes edge cases around:
- Thread-safe function lifecycle
- Some buffer allocation patterns
- Specific error handling paths

**Implications:** Most native addons work. The 5% gap requires testing with specific dependencies.

### Finding: Native addons using node-gyp/V8 internals DO NOT work in Bun
**Confidence:** CONFIRMED
**Evidence:** [Bun compatibility article](https://dev.to/alexcloudstar/bun-compatibility-in-2026-what-actually-works-what-does-not-and-when-to-switch-23eb)

Packages using node-gyp that compile against V8 headers are incompatible because "Bun uses JavaScriptCore, not V8, so these binaries are incompatible."

Specifically broken:
- bcrypt (use bcryptjs or Bun.password instead)
- canvas (no clean workaround)
- argon2 (native addon, no practical alternative)
- better-sqlite3 (use bun:sqlite instead)

**Implications:** For this project, none of these broken packages are in the dependency tree. The main risk is @parcel/watcher.

### Finding: @parcel/watcher requires workaround but can function
**Confidence:** CONFIRMED
**Evidence:** [Bun Issue #19282](https://github.com/oven-sh/bun/issues/19282)

@parcel/watcher uses NAPI (not node-gyp/V8), so it's theoretically compatible. The issue is with prebuild discovery and detect-libc behavior in Bun. Adding to trustedDependencies forces Bun to run the postinstall script.

**Implications:** Workable but not seamless. For a product installed via npx, this adds a configuration step that degrades DX.

### Finding: Bun has built-in SQLite (bun:sqlite)
**Confidence:** CONFIRMED
**Evidence:** [Bun SQLite docs](https://bun.com/docs/runtime/sqlite)

bun:sqlite provides a synchronous SQLite API inspired by better-sqlite3. Claims 3-6x faster for read queries, though this has been disputed -- real-world queries show comparable performance.

No separate installation needed. Available via `import { Database } from "bun:sqlite"`.

**Implications:** If the project ever needs SQLite (e.g., for search indexing persistence or metadata), Bun has a zero-dependency built-in option. On Node.js, better-sqlite3 requires compilation.

### Finding: Production report found native addons work through compatibility layers with some performance loss
**Confidence:** CONFIRMED
**Evidence:** [Production report](https://dev.to/synsun/bun-vs-nodejs-in-production-what-three-months-of-real-traffic-taught-me-3d96)

"Native addons function through compatibility layers but lose some performance compared to Node.js. This isn't a blocker unless the application heavily relies on them."

The report also noted the `sharp` image processing library required compatibility shims.

**Implications:** For our dependency tree, the only native addon is @parcel/watcher (optional). The rest of the stack is pure JavaScript/TypeScript. This makes Bun a good fit.

---

## Dependency tree native addon audit

| Package | Native addon? | Bun status |
|---------|--------------|------------|
| @hocuspocus/server | No (pure JS + ws) | Compatible |
| yjs | No (pure JS) | Compatible |
| isomorphic-git | No (pure JS) | Compatible |
| react-docgen-typescript | No (uses TS compiler, pure JS) | Compatible |
| @orama/orama | No (pure TS) | Explicitly supported |
| @parcel/watcher | Yes (NAPI C++) | Requires workaround |
| @mdx-js/mdx | No (pure JS) | Compatible via esbuild plugin |
| shiki | No (pure JS/WASM) | Compatible |
| simple-git | No (spawns git CLI) | Compatible |
| typescript | No (pure JS) | Compatible |

**Net assessment:** Only 1 of 10 key dependencies has native addon issues, and it has alternatives (fs.watch, chokidar).

---

## Gaps / follow-ups

* @parcel/watcher prebuild issue resolution status on latest Bun needs verification
* No audit of transitive dependencies for hidden native addons
