# Evidence: D4 — Bundle analysis for Vite + Rolldown + React Compiler

**Dimension:** D4 — Current best-in-class bundle-analysis tools for a Vite-based React 19 app in late 2025 / early 2026, particularly as Vite migrates to Rolldown and with Babel/React-Compiler in the build pipeline.
**Date:** 2026-04-19
**Sources:** rollup-plugin-visualizer (btd), vite-bundle-analyzer (nonzzz), vite-bundle-explorer (Solant), @relative-ci/rollup-plugin, size-limit (ai/), statoscope.tech, rolldown.rs, react.dev/learn/react-compiler/installation

---

## Key pages / files referenced

- https://github.com/btd/rollup-plugin-visualizer
- https://github.com/nonzzz/vite-bundle-analyzer
- https://github.com/Solant/vite-bundle-explorer
- https://relative-ci.com/releases/2026-03--vite-rollup-rolldown-plugin
- https://github.com/ai/size-limit
- https://statoscope.tech/
- https://rolldown.rs/
- https://react.dev/learn/react-compiler/installation

---

## Findings

### Finding: `rollup-plugin-visualizer` works across Rollup, Vite, and Rolldown; 8 output formats

**Confidence:** CONFIRMED

**Evidence:**
- https://github.com/btd/rollup-plugin-visualizer — `"Report type: sunburst, treemap, treemap-3d, network, raw-data, list, markdown, flamegraph."`; requires `"Node.js >= 22"`; Rolldown usage: `"import { visualizer } from 'rollup-plugin-visualizer';"` with `"RolldownPlugin type casting"`; Vite usage: `"export default { plugins: [visualizer()] };"`

**Implications:** This is the tool with the broadest output surface (including `flamegraph` and `network` which rivals don't offer) and officially claims Rolldown compat today.

---

### Finding: `vite-bundle-analyzer` v1.3.7 (2026-04-06) supports Vite + Rollup + Rolldown with experimental Rolldown adapter

**Confidence:** CONFIRMED

**Evidence:**
- https://github.com/nonzzz/vite-bundle-analyzer — `"A bundle analyzer for Vite, Rollup, and Rolldown that visualizes bundle size with an interactive treemap."`; `"Rolldown support is experimental"`; CLI for rolldown-vite: `"npx vite-bundle-analyzer -e=rolldown-vite"`; config exposes `"unstableRolldownAdapter"`; latest release `"v1.3.7 (dated April 6, 2026)"`

**Implications:** Explicit rolldown-vite CLI flag and `unstable*` adapter naming mark this as the most actively tracking-Rolldown tool in the category.

---

### Finding: `vite-bundle-explorer` v1.0.0 (2025-11-28) adds duplicate-dependency detection and import tracing

**Confidence:** CONFIRMED

**Evidence:**
- https://github.com/Solant/vite-bundle-explorer — `"A powerful bundle analyzer and visualizer tool for Vite and any other Rollup-compatible bundler."`; `"Detect duplicate dependencies"`; `"Deep Dependency Tracing: use 'Trace Import' to backtrack the full chain of imports."`; `"Latest release is v1.0.0, published November 28, 2025"`; usage `"npm install -D vite-bundle-explorer; npx vite-bundle-explorer bundle-report"`

**Implications:** For a monorepo with dep dedup concerns, "Trace Import" is the differentiator this tool ships that the treemap-only analyzers don't.

---

### Finding: `@relative-ci/rollup-plugin` shipped 2026-03-07, supports Vite + Rollup + Rolldown; sends stats to RelativeCI SaaS

**Confidence:** CONFIRMED

**Evidence:**
- https://relative-ci.com/releases/2026-03--vite-rollup-rolldown-plugin — `"[collects bundle stats during the build and sends them together with CI metadata to RelativeCI]"`; `"should run last so it can collect the final build output"`; install `"npm install --save-dev @relative-ci/rollup-plugin"`; usage `"import relativeCiAgent from '@relative-ci/rollup-plugin'; plugins: [relativeCiAgent()]"`
- Vendor-incentive bias: RelativeCI is a paid SaaS; the plugin is a data-collection agent, not a standalone visualizer.

**Implications:** This is a CI/field tool (trend over time, PR deltas) rather than a local visualizer. Comparable to bundlesize/bundlewatch for PR-comment deltas, with Rolldown as a listed supported bundler from day one.

---

### Finding: `size-limit` v12.1.0 (2026-04-13) is actively maintained; three presets separate apps vs libs; time plugin simulates low-end Android via Chrome headless

**Confidence:** CONFIRMED

**Evidence:**
- https://github.com/ai/size-limit — `"latest release is 12.1.0 (April 13, 2026)"`; `@size-limit/preset-app`: `"contains file and time plugins"` for apps with their own bundler; `@size-limit/preset-big-lib`: `"contains webpack, file, and time plugins"` for libraries >10 kB; `@size-limit/preset-small-lib`: `"contains esbuild and file plugins"` for libraries <10 kB; time plugin: `"compares the current machine performance with that of a low-priced Android devices to calculate the CPU throttling rate"` and `"runs headless Chrome (or desktop Chrome if it's available) to track the time a browser takes to compile and execute your JS."`
- CI: `"checks every commit on CI, calculates the real cost of your JS for end-users and throws an error if the cost exceeds the limit"`; GitHub Action `andresz1/size-limit-action` `"comments and rejects pull requests based on Size Limit output"`

**Implications:** Size-limit is the only tool in this set that measures wall-clock JS compile+execute time (via Chrome headless + CPU throttling), not just bytes — a stronger perf-budget gate than byte count alone.

---

### Finding: Statoscope is Webpack/Rspack-focused; no Rolldown or Vite support surfaced in its homepage

**Confidence:** CONFIRMED

**Evidence:**
- https://statoscope.tech/ — Webpack: `"webpack --json stats.json"`; Rspack: `"rspack --json stats.json"`; `"Web UI (Sandbox): Drop or upload stats.json files directly"`; no Rollup/Rolldown/Vite mentions

**Implications:** For a Vite + Rolldown stack, Statoscope is effectively unavailable unless a stats-file converter is interposed. This is the primary gap between Webpack-world and Rollup-world bundle analysis tooling.

---

### Finding: Rolldown is "alpha" and positioned as the bundler powering Vite 8+; Rollup-API-compatible

**Confidence:** CONFIRMED

**Evidence:**
- https://rolldown.rs/ — `"Blazing Fast Rust-based bundler for JavaScript"`; `"Rollup-compatible API and esbuild feature parity"`; `"Vite+ Alpha: Open source. Unified. Next-gen"`; positioned as `"The unified bundler powering Vite 8+"`

**Implications:** Analyzer tools that speak the Rollup plugin API (the majority in this category) gain Rolldown support largely for free; Rolldown-specific adapter APIs (`unstableRolldownAdapter` in vite-bundle-analyzer, RolldownPlugin cast in rollup-plugin-visualizer) are the visible seams where compat isn't fully transparent yet.

---

### Finding: React Compiler ships as a Babel plugin and emits `react/compiler-runtime` imports with cache-sentinel memoization code; no SWC integration documented

**Confidence:** CONFIRMED

**Evidence:**
- https://react.dev/learn/react-compiler/installation — `"plugins: ['babel-plugin-react-compiler', // must run first!]"`; `"React Compiler must run first in your Babel plugin pipeline. The compiler needs the original source information for proper analysis"`; sample emitted output:

```js
import { c as _c } from 'react/compiler-runtime';
// ...
const $ = _c(1);
let t0;
if ($[0] === Symbol.for('react.memo_cache_sentinel')) {
  t0 = <div>Hello World</div>;
  $[0] = t0;
} else {
  t0 = $[0];
}
return t0;
```

- Documentation `"only covers Babel integration, not SWC"` — no mention

**Implications for bundle analysis:** Compiled output contains additional `react/compiler-runtime` imports and per-component inline memoization scaffolding. This inflates per-component JS size; treemap/sunburst visualizers correctly attribute `react/compiler-runtime` as a separate node_modules entry, but per-component size growth appears inside the component's own chunk — no visualizer surfaces "bytes added by React Compiler" as a first-class breakdown.

---

### Finding: Next.js's `@next/bundle-analyzer`, `bundlesize`, `bundlewatch` npm pages are 403-blocked to WebFetch; maintenance status cannot be confirmed via primary source in this pass

**Confidence:** NOT FOUND

**Evidence:**
- https://www.npmjs.com/package/@next/bundle-analyzer — `Request failed with status code 403`
- https://www.npmjs.com/package/bundlesize — 403
- https://www.npmjs.com/package/bundlewatch — 403

**Implications:** Non-load-bearing for a Vite-based stack anyway; gap documented rather than fabricated.

---

## Terminology (D4)

- **RelativeCI agent:** Plugin mode (`@relative-ci/rollup-plugin`) that sends stats to the SaaS; distinct from the CI-hosted product itself.
- **rolldown-vite:** Rolldown-powered variant of Vite; detected by analyzers via `unstableRolldownAdapter` or CLI engine flag `-e=rolldown-vite`.
- **`react/compiler-runtime`:** Runtime shim imported by React Compiler's emitted code; contains the `_c(n)` cache allocator and `react.memo_cache_sentinel` symbol.
- **Cache sentinel:** Sentinel symbol used by React Compiler's per-component memoization to detect first-render vs cached-value path.

## Gaps / follow-ups

- No visualizer surveyed surfaces a first-class "React Compiler bytes added" breakdown. Open question: does any tool annotate spans produced by `babel-plugin-react-compiler` vs pre-compile bytes?
- `@next/bundle-analyzer`, `bundlesize`, `bundlewatch` primary npm pages returned 403 for WebFetch; maintenance status could not be confirmed without shelling out to `npm view`.

## Sources (de-duped)

- https://github.com/btd/rollup-plugin-visualizer — Vite/Rollup/Rolldown; 8 output formats (treemap/sunburst/network/flamegraph/list/markdown/raw-data/treemap-3d)
- https://github.com/nonzzz/vite-bundle-analyzer — v1.3.7 (2026-04-06); experimental Rolldown; rolldown-vite CLI
- https://github.com/Solant/vite-bundle-explorer — v1.0.0 (2025-11-28); duplicate detection + import tracing
- https://relative-ci.com/releases/2026-03--vite-rollup-rolldown-plugin — `@relative-ci/rollup-plugin` shipped 2026-03-07; SaaS agent
- https://github.com/ai/size-limit — v12.1.0 (2026-04-13); preset-app/big-lib/small-lib; Chrome headless + Android CPU throttling
- https://statoscope.tech/ — Webpack/Rspack-focused; no Rollup/Rolldown/Vite mention
- https://rolldown.rs/ — alpha; Rollup-compatible API; powering Vite 8+
- https://react.dev/learn/react-compiler/installation — Babel plugin only; emits `react/compiler-runtime` imports with cache-sentinel memoization
