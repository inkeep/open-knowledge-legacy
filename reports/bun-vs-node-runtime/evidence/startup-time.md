# Evidence: Startup Time (D2)

**Dimension:** Cold start, install speed, native TS execution -- Bun vs Node.js
**Date:** 2026-04-03
**Sources:** Benchmarks, production reports, official documentation

---

## Key files / pages referenced

- [Bun vs Node.js production report](https://dev.to/synsun/bun-vs-nodejs-in-production-what-three-months-of-real-traffic-taught-me-3d96) -- Real-world cold start data
- [tsx vs ts-node vs Bun 2026](https://www.pkgpulse.com/blog/tsx-vs-ts-node-vs-bun-2026) -- TypeScript execution benchmarks
- [Node.js native TypeScript](https://nodejs.org/learn/typescript/run-natively) -- strip-types performance
- [Bun install behind the scenes](https://bun.com/blog/behind-the-scenes-of-bun-install) -- Install speed architecture
- [Bun vs Node.js performance 2025](https://strapi.io/blog/bun-vs-nodejs-performance-comparison-guide) -- Comprehensive benchmarks

---

## Findings

### Finding: Bun cold start is 3-4x faster than Node.js for bare runtime
**Confidence:** CONFIRMED
**Evidence:** Multiple benchmark sources

Bare runtime cold start:
- Bun: 8-15ms
- Node.js: 60-120ms

Lambda/serverless cold start (real production data):
- Node.js 22: averaged 940ms
- Bun: averaged 290ms (69% reduction)

Source: [Production report](https://dev.to/synsun/bun-vs-nodejs-in-production-what-three-months-of-real-traffic-taught-me-3d96)

**Implications:** For `npx openknowledge`, the bare runtime startup advantage compounds with TypeScript execution savings.

### Finding: Bun TypeScript execution is ~5ms vs ~120ms for Node.js + tsx
**Confidence:** CONFIRMED
**Evidence:** [tsx vs ts-node vs Bun comparison](https://www.pkgpulse.com/blog/tsx-vs-ts-node-vs-bun-2026)

Simple script (console.log):
- ts-node: ~520ms
- tsx: ~18ms
- Bun: ~5ms

Complex script (10+ imports):
- ts-node: ~1200ms
- tsx: ~35ms
- Bun: ~8ms

Node.js 22+ with --experimental-strip-types: ~120ms (simple), ~45ms improvement over ts-node

**Implications:** For a server with multiple imports (HTTP, WebSocket, git, search), Bun's startup advantage is meaningful. A 100-200ms improvement on TypeScript execution alone contributes to the "under 5 seconds" target.

### Finding: bun install is 7-30x faster than npm install
**Confidence:** CONFIRMED
**Evidence:** [Bun install architecture](https://bun.com/blog/behind-the-scenes-of-bun-install)

- bun install: ~7x faster than npm, ~4x faster than pnpm, ~17x faster than yarn
- System call reduction: 1M syscalls (npm) vs 165K syscalls (bun)
- Binary manifest caching, optimized tarball extraction, OS-native file copying

For `npx openknowledge` first-run scenario:
- npx downloads the package and its dependencies using npm
- bunx uses bun install internally, which is significantly faster

**Implications:** First-run experience with npx is npm-speed. If users can use bunx, first-run is dramatically faster. For npm users (the majority), install speed is unchanged.

### Finding: bunx is ~100x faster than npx for locally installed packages
**Confidence:** CONFIRMED
**Evidence:** [Bun docs](https://bun.com/docs/pm/bunx)

bunx is roughly 100x faster than npx for locally installed packages due to Bun's fast startup time. For remote packages (first run), the advantage is smaller because download time dominates.

**Implications:** After first install, subsequent `bunx openknowledge` would be near-instant. But `npx openknowledge` (what most users will use) benefits only from npm caching.

### Finding: Node.js 22.18+ supports native TypeScript without flags
**Confidence:** CONFIRMED
**Evidence:** [Node.js docs](https://nodejs.org/learn/typescript/run-natively)

Node.js 22.18.0+ runs TypeScript files without the --experimental-strip-types flag. However, type stripping is still "experimental" and not recommended for production. Startup is ~120ms for simple scripts -- better than ts-node but slower than Bun.

**Implications:** Node.js is closing the TypeScript execution gap. For production, tsx (18ms startup) or a build step is still more reliable than Node.js native TS.

---

## Startup time budget analysis for "under 5 seconds to editor ready"

| Phase | Bun estimate | Node.js + tsx estimate |
|-------|-------------|----------------------|
| Runtime cold start | ~10ms | ~60ms |
| TypeScript parse + execute entry | ~8ms | ~35ms (tsx) |
| Import resolution (deep dep tree) | ~50ms | ~200ms |
| Hocuspocus init | ~100ms | ~100ms |
| Orama index build | ~500ms (depends on content) | ~500ms |
| react-docgen-typescript | 10-15s (CPU-bound) | 10-15s (CPU-bound) |
| HTTP server listen | ~5ms | ~10ms |
| **Total (without react-docgen)** | **~673ms** | **~905ms** |

Note: react-docgen-typescript dominates startup and is CPU-bound (TypeScript Compiler API). Runtime choice has minimal impact on this phase. It should be run asynchronously/lazily.

**Implications:** Bun saves ~200-300ms on startup, which is meaningful but not transformative. The real bottleneck is react-docgen-typescript at 10-15s -- this must be deferred or cached regardless of runtime.

---

## Gaps / follow-ups

* No benchmarks for Bun vs Node.js with the specific dependency tree of this project
* react-docgen-typescript performance on Bun vs Node.js not benchmarked (both use the same TypeScript compiler)
