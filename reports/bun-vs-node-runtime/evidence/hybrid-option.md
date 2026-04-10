# Evidence: The Hybrid Option (D8)

**Dimension:** Developing with Bun, deploying on Node.js compatibility, and hybrid strategies
**Date:** 2026-04-03
**Sources:** Bun documentation, migration guides, community patterns

---

## Key files / pages referenced

- [Bun Node.js compatibility](https://bun.com/docs/runtime/nodejs-compat) -- Compatibility guide
- [Migration strategy article](https://devtechinsights.com/bun-vs-nodejs-production-2025/) -- Hybrid approach
- [Strapi guide](https://strapi.io/blog/bun-vs-nodejs-performance-comparison-guide) -- Incremental adoption

---

## Findings

### Finding: Bun aims for 100% Node.js API compatibility; the practical gap is ~5%
**Confidence:** CONFIRMED
**Evidence:** [Bun docs](https://bun.com/docs/runtime/nodejs-compat)

Bun implements most Node.js built-in modules: fs, path, http, https, crypto, stream, buffer, child_process, worker_threads, url, os, events, etc. The remaining gaps are in edge cases, not core APIs.

Compatibility is one-directional: code written for Node.js runs in Bun, but code using Bun-specific APIs (Bun.serve, bun:sqlite, Bun.file) does not run in Node.js.

**Implications:** If we avoid Bun-specific APIs, the same codebase runs on both runtimes. This is the key enabler for the hybrid approach.

### Finding: The recommended hybrid strategy is "develop with Bun, test on Node.js"
**Confidence:** INFERRED
**Evidence:** Multiple strategy articles

The lowest risk approach:
1. Use Bun for development (fast startup, native TS, fast tests)
2. CI tests run on both Bun and Node.js
3. Deploy/publish targeting Node.js (broader user base)
4. Optionally support Bun execution for users who have it

For our `npx openknowledge` case:
- Published package runs on Node.js (npx users)
- `bunx --bun openknowledge` gives Bun runtime to Bun users
- Development uses Bun for speed

**Implications:** This approach captures most of Bun's DX benefits while keeping Node.js as the stable production runtime.

### Finding: Bun-specific APIs that would lock in to Bun
**Confidence:** CONFIRMED
**Evidence:** [Bun docs](https://bun.com/)

Bun-specific APIs we might want:
- `Bun.serve()` -- HTTP + WebSocket server (faster than http.createServer + ws)
- `bun:sqlite` -- Built-in SQLite (no native addon compilation)
- `Bun.file()` -- Lazy file handles
- `Bun.write()` -- Optimized file writes
- `Bun.password` -- Password hashing
- `Bun.$` -- Shell scripting
- `Bun.Glob` -- Fast glob matching

For our stack:
- Hocuspocus creates its own HTTP/WebSocket server, so Bun.serve() isn't directly usable
- bun:sqlite is a nice-to-have for future features
- Bun.file()/Bun.write() offer marginal gains over node:fs for our use case

**Implications:** There are no Bun-specific APIs that are must-haves for our use case. The Node.js-compatible API surface is sufficient for all requirements.

### Finding: Incremental adoption path: use bun install + bun test while running on Node.js
**Confidence:** CONFIRMED
**Evidence:** [Strapi guide](https://strapi.io/blog/bun-vs-nodejs-performance-comparison-guide)

Bun's tools can be used independently:
- `bun install` instead of `npm install` (7x faster)
- `bun test` instead of jest/vitest (faster test runner)
- `bun run` instead of `npm run` (faster script execution)

These work even while the production runtime is Node.js.

**Implications:** The team can adopt Bun incrementally without committing to it as the production runtime. Install speed and test speed improvements are available immediately.

---

## Hybrid architecture for openknowledge

```
Development:
  bun install    (fast deps)
  bun run dev    (fast startup, native TS)
  bun test       (fast tests)

CI:
  bun test       (fast CI)
  node dist/     (verify Node.js compatibility)

Distribution:
  npx openknowledge     -> runs on Node.js (most users)
  bunx --bun openknowledge -> runs on Bun (Bun users, faster)
  
Code:
  - Use only Node.js-compatible APIs
  - Avoid Bun.serve(), bun:sqlite, Bun.file()
  - Use standard node:fs, node:http, ws package
```

**Implications:** This hybrid approach provides the best of both worlds: fast development with Bun, broad compatibility with Node.js.

---

## Gaps / follow-ups

* CI configuration for dual-runtime testing (Bun + Node.js) not explored
* Performance delta between Bun and Node.js for the specific server workload not measured
