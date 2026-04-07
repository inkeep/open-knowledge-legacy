---
title: "Runtime decision: Node.js for distribution, Bun for development"
type: synthesis
created: 2026-04-04
---

## TLDR
Hybrid approach. Node.js for production distribution (`npx openknowledge`). Bun for development tooling (`bun install`, `bun run dev`, `bun test`). Single npm package, zero Bun-specific APIs, both runtimes from same code.

## The decision

| Concern | Node.js | Bun | Decision |
|---|---|---|---|
| Distribution (`npx openknowledge`) | Stable, universal, LTS | ~4.8K open issues, Windows flaky | Node.js |
| Dev tooling (`install`, `dev`, `test`) | Slower install, needs tsx for TS | 7x faster install, native TS | Bun |
| Long-running server stability | Battle-tested, async stack traces | Improving but not Node-grade | Node.js |
| Dependency compatibility | All 9 deps work | 8 of 9 (@parcel/watcher needs workaround) | Both viable |

## Dependency compatibility (8 of 9 confirmed)

| Dependency | Bun compatible? |
|---|---|
| Hocuspocus | Yes |
| Yjs / y-prosemirror / y-codemirror | Yes |
| isomorphic-git / simple-git | Yes |
| Orama | Yes |
| @mdx-js/mdx | Yes |
| Shiki (DynamicCodeBlock) | Yes |
| MCP SDK | Yes |
| react-docgen-typescript | Expected (pure JS, unconfirmed) |
| @parcel/watcher | Needs trustedDependencies workaround |

## Why performance doesn't matter here

Bun's advantages (2-7x WebSocket throughput, 3-4x startup, 2-3x file I/O) matter for high-traffic servers. Our product is a local tool with <10 connections. The startup bottleneck is react-docgen-typescript (10-15s, CPU-bound) — same in both runtimes.

## File watcher confirmation

@parcel/watcher remains the right choice for external write detection (1-5ms latency, native C++, used by Tailwind/Nx/VS Code). Since we distribute via Node.js, native prebuilds work. Bun dev workaround: add to trustedDependencies. chokidar is the fallback (50ms throttle, pure JS).

## Source
/reports/bun-vs-node-runtime/ (8 dimensions, 8 evidence files)
