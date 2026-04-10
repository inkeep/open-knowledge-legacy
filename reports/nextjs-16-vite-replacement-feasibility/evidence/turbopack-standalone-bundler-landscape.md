# Evidence: Turbopack Standalone & Bundler Landscape

**Dimension:** Follow-up F1 — Turbopack as standalone build tool
**Date:** 2026-04-08
**Sources:** Vercel blog, GitHub discussions, Vite 8 release, Rspack/Rsbuild docs

---

## Key sources referenced

- https://github.com/vercel/next.js/discussions/86533 — "Is Turbopack still meant to be standalone?"
- https://vercel.com/blog/turbopack-moving-homes — Turbopack roadmap
- https://vite.dev/blog/announcing-vite8 — Vite 8 + Rolldown release
- https://www.theregister.com/2026/03/16/vite_8_rolldown/ — Vite 8 real-world benchmarks
- https://rsbuild.rs/guide/migration/vite — Rsbuild migration from Vite
- https://www.farmfe.org/ — Farm bundler

---

## Findings

### Finding: Turbopack standalone does not exist and the Q1 2026 target was missed
**Confidence:** CONFIRMED
**Evidence:** No `@vercel/turbopack` npm package exists. The `turbopack` package on npm is a v0.0.1 placeholder. GitHub Discussion #86533 asks directly if standalone is still planned — no Vercel team response. Vercel blog confirmed "the core remains framework-agnostic" but "immediate focus is on Next.js." Third-party sources cited a Q1 2026 target for standalone — it is now April 2026 with no release.

**Implications:** Turbopack cannot be used outside Next.js today. Waiting for it is not a viable strategy.

### Finding: Vite 8 shipped March 2026 with Rolldown — 10-30x faster builds
**Confidence:** CONFIRMED
**Evidence:** [Vite 8.0 announcement](https://vite.dev/blog/announcing-vite8): Rolldown replaces the dual Rollup + esbuild architecture with a single Rust-based engine. Official benchmarks: 19,000 modules in 1.61s vs Rollup's 40.10s. Real-world: [Linear: 46s → 6s](https://www.theregister.com/2026/03/16/vite_8_rolldown/), Beehiiv: 64% improvement, Mercedes-Benz.io: 38% improvement. Dev server: 3x faster startup, 40% faster full reloads, 10x fewer network requests. Unified dev/prod pipeline eliminates dev/prod inconsistency.

**Implications:** This closes the performance gap with Turbopack. Upgrading from Vite 6 to Vite 8 is the path of least resistance — same config, same plugins, Rust-speed builds.

### Finding: Rsbuild is production-ready and a viable alternative
**Confidence:** CONFIRMED
**Evidence:** Rsbuild 1.0 stable. Enterprise adoption at ByteDance, Microsoft, Amazon, Discord. Official Vite migration guide exists. Rspack delivers ~23x faster builds than Webpack. However, requires config rewrite and different plugin ecosystem.

**Implications:** Good alternative if Vite's ecosystem ever becomes a constraint, but Vite 8 + Rolldown makes this less compelling.

### Finding: Farm is viable but niche (~5,566 stars) and outpaced by Vite 8
**Confidence:** CONFIRMED
**Evidence:** Farm v1.0 stable, v2.0 beta. Vite-compatible plugin system. Unique "partial bundling" feature. But with ~5,566 GitHub stars vs Vite's ~72K, ecosystem risk is higher. Vite 8 + Rolldown delivers comparable performance with the full Vite ecosystem.

**Implications:** Not recommended given Vite 8's Rolldown migration.

---

## Recommendation

**Upgrade to Vite 8.** This is the highest-impact, lowest-risk change for `packages/app`. Same config format, same plugin ecosystem, Rust-speed builds, zero framework lock-in. Turbopack standalone is vaporware.
