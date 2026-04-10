# Evidence: Developer Experience Comparison

**Dimension:** D5 — DX comparison (Turbopack vs Vite)
**Date:** 2026-04-08
**Sources:** HMR benchmarks, community comparisons

---

## Key sources referenced

- https://github.com/yyx990803/vite-vs-next-turbo-hmr — Evan You's HMR benchmark
- https://github.com/farm-fe/performance-compare — Farm performance comparison
- https://dev.to/hamzakhan/vite-vs-turbopack-in-2025-which-one-to-choose-13d3 — 2025 comparison

---

## Findings

### Finding: HMR speeds are comparable — Turbopack slightly faster for leaf components
**Confidence:** CONFIRMED
**Evidence:** Evan You's benchmark (M1 MacBook Pro, 1,000 components):

| Scenario | Vite (SWC) | Next + Turbopack |
|----------|-----------|-----------------|
| Root component | 338.2ms | 334.6ms |
| Leaf component | 141.8ms | 84.4ms |

Farm benchmark (different methodology): Turbopack root 7ms, Vite root 42ms; Turbopack leaf 11ms, Vite leaf 22ms.

**Implications:** For a single-page editor app, HMR performance is not a differentiator. Both are fast enough for productive development.

### Finding: Vercel's "10x faster" claim is disputed
**Confidence:** CONFIRMED
**Evidence:** Evan You (Vite creator): "turbopack is 10x faster than Vite appears significantly overstated." The 10x claim applied to very large projects (30k+ modules) with Babel, not SWC. With SWC, differences are modest.

**Implications:** The HMR speed advantage is not a compelling reason to switch.

### Finding: For pure client-side React SPAs, "Vite remains the king"
**Confidence:** CONFIRMED
**Evidence:** Multiple community comparisons (Dev.to, Strapi, talent500) consistently recommend Vite for pure client-side React apps and Turbopack for Next.js apps. "If you are building a pure client-side React app, Vite is the gold standard."

**Implications:** The community consensus directly addresses this use case — a client-side React editor app is Vite's sweet spot.

### Finding: Next.js adds configuration complexity for client-only apps
**Confidence:** INFERRED
**Evidence:** Next.js requires: `"use client"` directives, `next/dynamic` with `ssr: false`, `output: 'export'` config, custom server setup for WebSocket. Vite requires: zero special configuration for client-side React apps.

**Implications:** The development experience is simpler with Vite for this specific type of application.

---

## Gaps / follow-ups

* Dev server cold start time comparison (Turbopack vs Vite) for this specific project size
