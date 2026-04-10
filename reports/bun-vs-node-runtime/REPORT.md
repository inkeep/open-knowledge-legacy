---
title: "Bun vs Node.js as Server Runtime for an Agent-Native Knowledge Platform"
description: "Evaluates Bun and Node.js as the server runtime for a local-first knowledge platform that serves a React web UI, runs Hocuspocus (Yjs CRDT collaboration), provides an MCP server, watches files, performs git operations, runs TypeScript component introspection, and indexes content for search. Covers dependency compatibility, startup time, WebSocket performance, file system operations, native addon support, developer experience, production stability, and a hybrid adoption strategy."
createdAt: 2026-04-03
updatedAt: 2026-04-03
subjects:
  - Bun
  - Node.js
  - Hocuspocus
  - Yjs
  - isomorphic-git
  - react-docgen-typescript
  - Orama
  - Model Context Protocol
topics:
  - JavaScript runtime selection
  - server-side WebSocket performance
  - local-first architecture
  - native addon compatibility
  - developer experience
---

# Bun vs Node.js as Server Runtime for an Agent-Native Knowledge Platform

**Purpose:** Determine whether Bun or Node.js is the right server runtime for an OSS, local-first knowledge platform installed via `npx`, where fast startup, broad compatibility, and reliable WebSocket/file-system operations all matter.

---

## Executive Summary

**Recommendation: Target Node.js as the production runtime, use Bun for development tooling, and design the codebase to run on both.**

Bun offers real advantages for this project -- 3-4x faster cold starts, native TypeScript execution, 7x faster package installation, and 2-7x better WebSocket throughput. These are meaningful numbers. But for a product distributed via `npx openknowledge` to a broad developer audience, Node.js remains the safer production target for three reasons:

First, **dependency compatibility is good but not perfect.** Eight of nine key dependencies work in Bun without issues. The exception -- `@parcel/watcher` (native C++ addon) -- requires manual workaround configuration. This matters for a product where friction during `npx` first-run is a dealbreaker. The Hocuspocus WebSocket bug was fixed in Bun v1.1.37, so current versions work, but it illustrates that Bun's ecosystem still encounters integration surprises.

Second, **the performance advantages don't move the needle for this use case.** WebSocket throughput differences (50,000 vs 19,000 roundtrips/sec) are irrelevant when the platform handles 5-10 concurrent connections. The startup time advantage (~200-300ms) is eclipsed by the react-docgen-typescript phase (10-15s), which is CPU-bound and runtime-agnostic. File I/O speed (2-3x) matters at scale but not for a local-first tool processing a single repository.

Third, **Bun's stability trajectory is positive but incomplete.** Anthropic's acquisition (December 2025) provides financial backing and a flagship deployment (Claude Code). However, 4.8k open GitHub issues, documented segmentation faults across platforms, weaker async stack traces, and a less mature debugging experience mean that choosing Bun as the sole runtime adds risk that isn't justified by the performance gains.

The hybrid approach captures the best of both: use `bun install` (7x faster) and `bun run dev` (native TypeScript, instant startup) during development, publish a single npm package that runs on Node.js via `npx` for most users, and let Bun users run `bunx --bun openknowledge` for the faster runtime. No Bun-specific APIs are needed -- the entire dependency tree runs on Node.js-compatible APIs.

**Key Findings:**
- **Dependency compatibility is 8/9:** All key dependencies except `@parcel/watcher` work in Bun without issues. Orama, Shiki, MDX, and Yjs explicitly support Bun. Hocuspocus works since Bun v1.1.37.
- **Startup advantage is real but not decisive:** Bun saves ~200-300ms on server startup, but the 10-15s react-docgen-typescript phase dominates regardless of runtime.
- **WebSocket performance is overkill for local-first:** Bun's 2-7x WebSocket throughput advantage is irrelevant at <10 concurrent connections.
- **The hybrid path is low-risk and high-reward:** Using Bun for development tooling while targeting Node.js for distribution requires zero Bun-specific APIs and captures the DX benefits.

---

## Research Rubric

| # | Dimension | Priority | Depth | Status |
|---|-----------|----------|-------|--------|
| D1 | Dependency compatibility | P0 | Deep | Covered |
| D2 | Startup time | P0 | Quantitative | Covered |
| D3 | WebSocket performance | P0 | Quantitative | Covered |
| D4 | File system operations | P0 | Mechanical | Covered |
| D5 | Native addon compatibility | P0 | Deep | Covered |
| D6 | Developer experience | P0 | Moderate | Covered |
| D7 | Production stability and adoption | P0 | Moderate | Covered |
| D8 | The hybrid option | P1 | Moderate | Covered |

**Primary question:** Should the platform target Bun, Node.js, or both as its server runtime?

**Stance:** Conclusions -- recommendations are tied to evidence and conditioned on the specific product context (OSS, local-first, installed via npx).

---

## Detailed Findings

### D1: Dependency Compatibility

**Finding:** Eight of nine critical dependencies are Bun-compatible. `@parcel/watcher` is the only dependency with known issues.

**Evidence:** [evidence/dependency-compatibility.md](evidence/dependency-compatibility.md)

| Dependency | Native addon? | Bun status | Notes |
|---|---|---|---|
| @hocuspocus/server | No | Works (since Bun v1.1.37) | WebSocket ping bug fixed upstream |
| yjs / y-prosemirror / y-codemirror | No | Works | Pure JS, standard WebSocket |
| isomorphic-git | No | Works | Pluggable fs, no Bun-specific issues |
| react-docgen-typescript | No | Expected to work | Uses TypeScript Compiler API (pure JS) |
| @orama/orama | No | Explicitly supported | Docs list Bun as supported runtime |
| @parcel/watcher | Yes (NAPI C++) | Requires workaround | Prebuild discovery fails; needs trustedDependencies config |
| @mdx-js/mdx | No | Works | Official Bun integration via @mdx-js/esbuild |
| shiki | No | Works | Runtime-agnostic, pure JS/WASM |
| simple-git | No | Works | Spawns git CLI via child_process |

The [Hocuspocus WebSocket bug](https://github.com/ueberdosis/hocuspocus/issues/878) is the most instructive data point. Prior to Bun v1.1.37, WebSocket ping messages weren't transmitted correctly, causing infinite reconnection loops. The fix was in Bun itself (oven-sh/bun#15247), not in Hocuspocus. This shows two things: Bun's WebSocket implementation had gaps that affected real-world libraries, and Bun is responsive to fixing them.

**Decision triggers:**
- If `@parcel/watcher` is required (not just preferred), Bun as sole runtime adds friction. Alternatives: Bun's built-in `fs.watch` or chokidar (pure JS).
- If the project adds dependencies with native addons (canvas, sharp, bcrypt), Bun compatibility becomes a larger concern.

**Remaining uncertainty:**
- react-docgen-typescript on Bun has no community test reports. The TypeScript Compiler API is pure JS, so compatibility is expected but not confirmed.

---

### D2: Startup Time

**Finding:** Bun starts 3-4x faster than Node.js, but the dominant startup cost (react-docgen-typescript at 10-15s) is runtime-agnostic.

**Evidence:** [evidence/startup-time.md](evidence/startup-time.md)

| Metric | Bun | Node.js (+ tsx) | Advantage |
|---|---|---|---|
| Runtime cold start | ~10ms | ~60ms | Bun 6x |
| TypeScript parse + execute | ~8ms | ~35ms | Bun 4x |
| Import resolution (deep deps) | ~50ms | ~200ms | Bun 4x |
| Package install (first run) | bun install: 7x faster than npm | npm install baseline | Bun 7x |
| bunx vs npx (local) | ~100x faster | npx baseline | Bun 100x |

**Estimated server startup budget (excluding react-docgen-typescript):**
- Bun: ~673ms
- Node.js + tsx: ~905ms
- Delta: ~230ms

The react-docgen-typescript phase (10-15s for 75 components) uses `ts.createProgram()` which is CPU-bound JavaScript execution. Neither Bun's JavaScriptCore nor Node.js's V8 provides a meaningful advantage for this workload. The solution is to defer or cache this phase regardless of runtime choice.

For the `npx openknowledge` first-run scenario, the bottleneck is `npm install` (downloading and extracting dependencies), not runtime startup. Users with Bun get faster installs, but most users will use npx with npm.

**Decision triggers:**
- If "under 5 seconds to editor ready" is a hard requirement, react-docgen-typescript must be deferred/cached -- runtime choice doesn't solve this.
- If most users install via npx (likely), Bun's install speed advantage doesn't help them directly.

---

### D3: WebSocket Performance

**Finding:** Bun's WebSocket is 2-7x faster than Node.js + ws, but this advantage is irrelevant for a local-first platform with <10 concurrent connections.

**Evidence:** [evidence/websocket-performance.md](evidence/websocket-performance.md)

Per [Daniel Lemire's benchmark](https://lemire.me/blog/2023/11/25/a-simple-websocket-benchmark-in-javascript-node-js-versus-bun/) (methodologically sound):
- Node.js 20 (ws): 19,000 roundtrips/sec
- Bun (ws module): 27,000 roundtrips/sec (40% faster)
- Bun (native API): 50,000 roundtrips/sec (2.6x faster)

Concurrent connection capacity (reported, not independently verified):
- Node.js + ws: ~25,000 connections, 12 KB/connection
- Bun native: ~62,000 connections, 4 KB/connection

For a local-first knowledge platform, the typical workload is:
- 1-5 browser tabs with Hocuspocus connections
- 1-3 MCP/agent connections
- CRDT update frequency: moderate (typing, batched syncs)

At this scale, both runtimes handle the workload trivially. The bottleneck is Yjs document encoding/decoding, not WebSocket I/O.

Note: Hocuspocus uses the `ws` package internally. Running Hocuspocus on Bun uses Bun's ws compatibility layer, not Bun's native WebSocket API. The performance gain is the "40% faster with ws module" figure, not the "2.6x with native API" figure. *Note: Bun benchmarks should be treated with vendor-incentive bias; Bun markets itself on performance.*

**Decision triggers:**
- If the platform ever becomes multi-user (SaaS, team collaboration), WebSocket performance becomes more relevant.
- For local-first single-user, this dimension is not a differentiator.

---

### D4: File System Operations

**Finding:** Bun offers 2-3x faster file I/O and built-in file watching, but the auto-persistence bottleneck is isomorphic-git's JS processing, not raw I/O.

**Evidence:** [evidence/filesystem-operations.md](evidence/filesystem-operations.md)

File watching options:
- **Bun:** Built-in `fs.watch` (Node-compatible), `bun --watch` / `bun --hot` for development
- **Node.js:** `fs.watch`, chokidar, @parcel/watcher (native, most reliable on macOS)
- **Issue:** @parcel/watcher's native prebuild has Bun compatibility issues

File I/O performance:
- Bun's `Bun.write()` and file reads are 2-3x faster than Node.js equivalents
- Caveat: `Bun.write()` has no append mode; must use `node:fs` for append operations

For the auto-persistence pipeline (write git objects, save document state), the workflow is:
1. Serialize Yjs document state (CPU-bound JS)
2. Call isomorphic-git operations (CPU-bound JS + file writes)
3. Write files to disk (I/O)

The I/O phase (step 3) benefits from Bun, but it's a small fraction of the total time.

**Decision triggers:**
- If @parcel/watcher is preferred for reliable macOS file watching, Bun adds friction. `chokidar` (pure JS) or Bun's `fs.watch` with `recursive: true` are alternatives.
- For development workflow, Bun's `--hot` mode preserves WebSocket connections across code changes -- a DX advantage over nodemon-style restart.

---

### D5: Native Addon Compatibility

**Finding:** Bun implements 95% of Node-API. Only 1 of 10 key dependencies (@parcel/watcher) is a native addon, and it has pure-JS alternatives.

**Evidence:** [evidence/native-addon-compatibility.md](evidence/native-addon-compatibility.md)

Bun's native addon support:
- 95% Node-API (NAPI) compatibility -- most addons work
- Packages using `node-gyp` with V8 headers are incompatible (bcrypt, canvas, argon2)
- NAPI-based addons generally work but may need `trustedDependencies` configuration
- Production reports confirm native addons "function through compatibility layers but lose some performance"

The project's dependency tree is overwhelmingly pure JavaScript:

| Category | Count | Examples |
|---|---|---|
| Pure JS/TS | 9 | Yjs, Orama, isomorphic-git, Shiki, MDX, simple-git, react-docgen-typescript, Hocuspocus, MCP SDK |
| Native addon (NAPI) | 1 | @parcel/watcher |
| V8-specific (incompatible) | 0 | -- |

Bun's built-in `bun:sqlite` replaces `better-sqlite3` if SQLite is ever needed, eliminating a common native addon dependency.

**Decision triggers:**
- If the dependency tree stays pure-JS (current trajectory), Bun compatibility is excellent.
- Adding image processing (sharp), crypto (argon2), or graphics (canvas) would complicate Bun adoption.

---

### D6: Developer Experience

**Finding:** Bun provides a superior development workflow (instant startup, native TS, fast tests) but has weaker debugging and async stack traces than Node.js.

**Evidence:** [evidence/developer-experience.md](evidence/developer-experience.md)

**Bun advantages:**
- Zero-config TypeScript execution
- Built-in test runner (`bun test`)
- `bun install` is 7x faster than npm
- `bun --hot` preserves server state across code changes
- Syntax-highlighted error previews

**Node.js advantages:**
- Mature Chrome DevTools integration
- Reliable breakpoint behavior in VS Code
- Superior async stack traces (critical for debugging server applications)
- Decades of documentation and community knowledge
- Broader APM/observability tooling

**Package publishing:** A single npm package with a standard `bin` field works with both `npx` (Node.js execution) and `bunx` (Bun execution). No conditional builds needed.

The most significant DX gap is **async stack traces.** A server handling WebSocket connections, file watchers, git operations, and search indexing runs almost entirely in async code paths. When something fails, the stack trace quality directly impacts debugging speed. Node.js (V8) has invested years in async stack trace ergonomics; Bun (JavaScriptCore) has not caught up.

**Decision triggers:**
- For active development (daily coding on the platform), Bun's startup speed and native TS matter.
- For debugging production issues, Node.js's async stack traces are meaningfully better.
- The hybrid approach (develop with Bun, debug with Node.js) captures both benefits.

---

### D7: Production Stability and Adoption

**Finding:** Bun is production-viable for this use case, with Anthropic's backing reducing abandonment risk, but Node.js LTS remains the more conservative choice.

**Evidence:** [evidence/production-stability.md](evidence/production-stability.md)

**Bun's position in 2026:**
- [Acquired by Anthropic](https://www.anthropic.com/news/anthropic-acquires-bun-as-claude-code-reaches-usd1b-milestone) (December 2025), powering Claude Code ($1B ARR)
- Remains open-source, MIT-licensed
- ~4.8k open GitHub issues -- active development but also active bugs
- Documented: segfaults across platforms, AVX CPU requirement, source map leak, async trace weakness

**Node.js LTS's position:**
- 30-month support lifecycle, rigorous release process
- Decades of production deployment at every scale
- Comprehensive ecosystem (APM, debugging, profiling)
- Zero questions about long-term viability

**Real-world production data** (from a [3-month deployment](https://dev.to/synsun/bun-vs-nodejs-in-production-what-three-months-of-real-traffic-taught-me-3d96)):
- 69% cold start reduction
- 43% throughput improvement
- P99 latency improvement: 48ms to 31ms
- Main friction: APM integration gaps, native addon shims

The production reporter's recommendation matches our profile: "Small team, TypeScript HTTP API, no heavy native addon dependencies -- migrate."

**Decision triggers:**
- For an OSS product used by diverse developers (various OS, hardware, environments), Node.js minimizes "it doesn't work on my machine" issues.
- If the team is comfortable debugging Bun-specific issues, Bun as the primary runtime is viable.
- Anthropic's backing makes Bun a safer long-term bet than it was pre-acquisition.

---

### D8: The Hybrid Option

**Finding:** The hybrid approach (Bun for development, Node.js for distribution) is the lowest-risk path and requires no Bun-specific APIs.

**Evidence:** [evidence/hybrid-option.md](evidence/hybrid-option.md)

**Architecture:**

```
Development (maintainers):
  bun install         # 7x faster dependency installation
  bun run dev         # Instant startup, native TypeScript
  bun test            # Fast test runner
  bun --hot src/...   # Hot reload preserving WebSocket connections

CI:
  bun test            # Fast test execution
  node dist/          # Verify Node.js compatibility (dual-runtime CI)

Distribution:
  npx openknowledge         # Most users: runs on Node.js
  bunx --bun openknowledge  # Bun users: faster runtime

Code constraints:
  - Use only Node.js-compatible APIs
  - Avoid Bun.serve(), bun:sqlite, Bun.file(), Bun.$
  - Use standard node:fs, node:http, ws package
  - Test on both runtimes in CI
```

Bun-specific APIs that exist but are **not needed** for this project:
- `Bun.serve()` -- Hocuspocus manages its own server
- `bun:sqlite` -- Not currently using SQLite
- `Bun.file()` / `Bun.write()` -- Marginal gains over node:fs
- `Bun.$` -- Shell scripting not needed in server code

The entire key dependency tree (Hocuspocus, Yjs, isomorphic-git, Orama, MDX, Shiki, react-docgen-typescript, MCP SDK) uses only Node.js-compatible APIs. No code changes are needed to support both runtimes.

**Decision triggers:**
- If Bun-specific APIs become compelling (e.g., bun:sqlite for search index persistence), the team can adopt them with a graceful fallback for Node.js users.
- If Node.js's native TypeScript support (v22.18+) matures beyond experimental, the startup gap narrows further.

---

## Recommendation Summary

| Aspect | Recommendation | Rationale |
|---|---|---|
| **Production runtime** | Node.js (primary target) | Broader compatibility, better debugging, stability |
| **Development runtime** | Bun | Faster startup, native TS, fast installs, hot reload |
| **Package manager** | bun install (dev) | 7x faster than npm for daily development |
| **Test runner** | bun test | Fast, built-in |
| **Distribution** | npm publish (single package) | Works with npx (Node) and bunx (Bun) |
| **File watching** | chokidar or fs.watch | Avoids @parcel/watcher native addon issues |
| **CI** | Dual-runtime (Bun + Node.js) | Ensures compatibility |
| **Bun-specific APIs** | Avoid for now | Maintain Node.js compatibility |
| **Future migration** | Keep door open | As Bun matures, full migration becomes lower risk |

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **react-docgen-typescript on Bun:** No community test reports found. Expected to work (pure JS) but not confirmed.
- **Long-running process stability:** No data on Bun memory behavior over hours/days for a server with WebSocket connections and file watchers.
- **Windows compatibility:** Bun has documented Windows issues (file reading crash in v1.3.5). Windows users of `npx openknowledge` need Node.js as fallback.
- **Transitive native addon audit:** Only direct dependencies were checked. Hidden native addons in transitive dependencies could surface.

### Out of Scope (per Rubric)
- Container/Docker deployment (not relevant for local-first tool)
- Serverless/edge deployment
- Bun's bundler capabilities (esbuild used instead)
- Detailed MCP protocol implementation differences between runtimes

---

## References

### Evidence Files
- [evidence/dependency-compatibility.md](evidence/dependency-compatibility.md) -- Compatibility status for 9 key dependencies
- [evidence/startup-time.md](evidence/startup-time.md) -- Cold start, install speed, TypeScript execution benchmarks
- [evidence/websocket-performance.md](evidence/websocket-performance.md) -- Throughput, latency, concurrent connection data
- [evidence/filesystem-operations.md](evidence/filesystem-operations.md) -- File watching, I/O performance, git operations
- [evidence/native-addon-compatibility.md](evidence/native-addon-compatibility.md) -- NAPI support, dependency tree audit
- [evidence/developer-experience.md](evidence/developer-experience.md) -- Debugging, error messages, publishing
- [evidence/production-stability.md](evidence/production-stability.md) -- Adoption, stability issues, Anthropic acquisition
- [evidence/hybrid-option.md](evidence/hybrid-option.md) -- Dual-runtime strategy, Bun-specific API assessment

### External Sources
- [Anthropic acquires Bun announcement](https://www.anthropic.com/news/anthropic-acquires-bun-as-claude-code-reaches-usd1b-milestone) -- Acquisition context and Claude Code deployment
- [Bun joins Anthropic blog post](https://bun.com/blog/bun-joins-anthropic) -- Bun's perspective on the acquisition
- [Hocuspocus GitHub Issue #878](https://github.com/ueberdosis/hocuspocus/issues/878) -- WebSocket ping bug with Bun, fixed in v1.1.37
- [Daniel Lemire WebSocket benchmark](https://lemire.me/blog/2023/11/25/a-simple-websocket-benchmark-in-javascript-node-js-versus-bun/) -- Methodologically sound WebSocket comparison
- [Bun vs Node.js in Production: 3 months](https://dev.to/synsun/bun-vs-nodejs-in-production-what-three-months-of-real-traffic-taught-me-3d96) -- Real-world production migration data
- [Bun Compatibility in 2026](https://dev.to/alexcloudstar/bun-compatibility-in-2026-what-actually-works-what-does-not-and-when-to-switch-23eb) -- Comprehensive compatibility assessment
- [Bun quality concerns (GitHub #27664)](https://github.com/oven-sh/bun/issues/27664) -- Community discussion on stability
- [Bun Node-API documentation](https://bun.com/docs/runtime/node-api) -- NAPI implementation status
- [tsx vs ts-node vs Bun 2026](https://www.pkgpulse.com/blog/tsx-vs-ts-node-vs-bun-2026) -- TypeScript execution benchmarks
- [Building MCP servers with Bun](https://dev.to/gorosun/building-high-performance-mcp-servers-with-bun-a-complete-guide-32nj) -- MCP SDK + Bun integration guide
- [@parcel/watcher Bun Issue #19282](https://github.com/oven-sh/bun/issues/19282) -- Native addon prebuild discovery failure
- [Orama JSR package](https://jsr.io/@orama/orama) -- Explicit Bun runtime support
