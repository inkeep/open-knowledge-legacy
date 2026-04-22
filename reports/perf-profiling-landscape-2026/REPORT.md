---
title: "Performance Profiling Tooling Landscape for a React 19 + Yjs/Hocuspocus + TipTap/CodeMirror Editor — Late 2025 / Early 2026"
description: "Evidence-driven survey of state-of-the-art performance profiling, observability, and CI-gating tooling across 10 dimensions of a React-19-with-Compiler + Vite/Rolldown + Yjs/Hocuspocus + TipTap/ProseMirror + CodeMirror 6 collaborative editor stack. Covers React render profiling, browser main-thread tracing, Web Vitals + INP, bundle analysis, CRDT/editor-specific benchmarks, editor OSS harness patterns (tldraw, excalidraw, blocksuite, silverbullet, zed, outline), Node.js server tracing (clinic.js dead, Bun native profilers, Pyroscope, Sentry, Datadog, OTel), memory profiling (Chrome DevTools + memlab + Activity semantics), CI-gated regression patterns (Playwright 1.57/1.58, size-limit, CodSpeed, tldraw's flake-driven removal), and OpenTelemetry production-readiness (traces stable, metrics stable, browser experimental, profiling alpha 2026-03-26)."
createdAt: 2026-04-19
updatedAt: 2026-04-19
subjects:
  - React 19
  - React Compiler
  - Vite
  - Rolldown
  - Yjs
  - Hocuspocus
  - TipTap
  - ProseMirror
  - CodeMirror 6
  - Chrome DevTools
  - Perfetto
  - Playwright
  - web-vitals
  - size-limit
  - CodSpeed
  - RelativeCI
  - tldraw
  - Excalidraw
  - BlockSuite
  - Silverbullet
  - zed
  - Outline
  - OpenTelemetry
  - Pyroscope
  - Sentry
  - Datadog
  - Bun
topics:
  - performance profiling
  - render profiling
  - main-thread tracing
  - CRDT benchmarking
  - Web Vitals INP
  - bundle analysis
  - CI perf regression gates
  - Node.js continuous profiling
  - memory leak detection
  - OpenTelemetry browser readiness
---

# Performance Profiling Tooling Landscape for a React 19 + Yjs/Hocuspocus + TipTap/CodeMirror Editor — Late 2025 / Early 2026

**Purpose:** Document the 2025/2026 state of performance profiling, observability, and CI-gating tooling across the surfaces a collaborative markdown editor cares about. 3P-factual — a downstream Open Knowledge spec will select tools from this landscape and wire them. This report stays portable across readers and projects.

**Stance:** Factual. No recommendations for any specific adoption; capabilities and gaps only. Vendor-incentive bias is flagged inline where relevant.

---

## Executive Summary

**The biggest shift since mid-2025 is React 19.2's Performance Tracks (October 2025), which ride on the Chrome DevTools Extensibility API that also landed through Chrome 128–134.** For the first time, React emits a Scheduler track directly into the browser Performance panel with no extension required; the Components track requires either `<Profiler>` boundaries or the React DevTools extension; Server Components / Server Requests tracks are dev-builds-only. This makes the DevTools Performance panel the default interactive surface for React-aware tracing, with the React DevTools extension Profiler and react-scan/bippy as complementary lenses (react-scan's OSS build is gated off in production by default; the commercial React Scan Monitoring is a separate product). why-did-you-render v10 added React 19 support but its maintainer states it is believed incompatible with React Compiler.

**Editor OSS perf observability is almost entirely application-rolled, not library-shipped.** TipTap, ProseMirror, CodeMirror 6, and Hocuspocus each ship zero performance benchmarks or harnesses; their respective maintainers either explicitly say "no benchmarks have been done" (CM6's Marijn Haverbeke) or point to architecture patterns instead (Hocuspocus: Redis + sharding). Shipped patterns across editor OSS span (a) bundle-size PR gates via `size-limit` (Excalidraw) or `@relative-ci/agent` (Outline); (b) dedicated external perf repos sharing Kleppmann's `automerge-perf` LaTeX-paper trace (332,702 total changes, of which the 259,778-op insert+delete subset drives the `dmonad/crdt-benchmarks` B4 scenario; used by Yjs, Loro, Automerge); (c) `vitest bench` micro-benches in a dedicated dir (Silverbullet); and (d) head-vs-base `hyperfine` CLI comparison via generated workflow (Zed). **Only tldraw shipped a full Playwright-orchestrated full-DOM FPS harness** (baseline-per-environment, 15% regression / 10% warning thresholds, PostHog reporting) — and they removed it in PR #7517 (Dec 30 2025) after persistent CI flake. Restoration is tracked in issue #7595; the team explicitly flags dev-mode React DevTools as a false-positive source. **Milkdown, BlockNote, Plate, Remirror, Logseq, Peritext, Automerge-ProseMirror ship nothing** — absence pattern is itself a finding.

**CI-gated perf regression without flake is now addressable for micro-benchmarks via CodSpeed's hardware-counter approach.** CodSpeed uses `valgrind`/`cachegrind` instruction counting rather than wall-clock time, bringing variance below 1% on shared GitHub Actions runners; it wraps `vitest bench` (tinybench-backed, the current OSS JS micro-bench mainstream) unchanged. **CodSpeed's technique applies to pure-JS micro-benchmarks only; full-DOM Playwright-orchestrated FPS gates (the tldraw surface) still require the dedicated-runner + production-build + serial-execution mitigations.** This keeps the dedicated-hardware workflow pattern that Zed uses (`cargo xtask`-generated `compare_perf.yml` with hyperfine on Namespace.so runners) relevant. p95 is the industry-recommended first guardrail; p99 is flake-prone at low sample counts unless paired with variance-aware thresholds.

**INP replaced FID as a Core Web Vital on 2024-03-12; FID support ended 2024-09-09.** INP is field-only — Lighthouse cannot produce it. TBT is the accepted lab proxy. The `web-vitals` library v5.2.0 (2026-03-25) is the canonical integration point; its attribution build now includes LoAF (Long Animation Frames, Chrome 123+) data. For editor-specific latency (the "keypress → perceived paint" question), Notion publicly documented that their internal "keypress → React render" was ~10× lower than perceived latency — the Palette-style hardware-keypress-timestamp → paint measurement is what actually matches INP.

**For Node.js server profiling of long-lived WebSocket services like Hocuspocus: clinic.js is dead** (README explicitly states "not being actively maintained"; last release 2023). 0x v6.0.0 is Node-only (V8-bound). Node's built-in `perf_hooks` (`monitorEventLoopDelay`, `timerify`) plus `v8.writeHeapSnapshot()` cover the diagnostic basics. **Grafana Pyroscope is the only OSS continuous profiler with active 2026 development** (v1.21.0, 2026-04-17); Sentry and Datadog Node profilers are both V8-only and will not run on Bun. **Bun 1.3.7+ ships native `--cpu-prof` / `--heap-prof` flags with Chrome DevTools-compatible output**, which is the bridge for Bun-runtime servers — the `.cpuprofile` / `.heapsnapshot` load directly in Chrome DevTools.

**OpenTelemetry status is stable on Node for traces and metrics, but officially "experimental and mostly unspecified" for browser** per OTel's own docs. OTel co-founder Ted Young (Grafana) stated in late 2025: "It's not really something that we consider, like, a professional product that stacks up against the other things that are out there." The Browser SIG is working on the session-across-page-loads model. Vendor divergence varies — OneUptime publishes browser-OTel recipes framed as ready-to-use; Elastic's own posts reproduce the upstream experimental caveat while still providing recipes; Sentry's browser SDK is a separate vendor layer (OTLP ingestion is open-beta for traces + logs, metrics not supported). Careful reading required. The OTel Profiling signal entered public Alpha on 2026-03-26 (eBPF + pprof server-side; no JS SDK support yet). W3C Trace Context / Baggage propagation is the stable standard for browser→backend correlation regardless of browser SDK maturity.

**Memory profiling tools have converged on a small stable set:** Chrome DevTools Memory panel (heap snapshot / allocation timeline / allocation sampling) for interactive work; **Meta's memlab** for automated Playwright-compatible three-snapshot leak detection — the only published wrapper of its kind. `v8.writeHeapSnapshot()` replaces legacy `heapdump` for Node 11+. **React 19.2 `<Activity mode="hidden">` preserves state + DOM but cleans up Effects; React docs are silent on eviction policy** — host applications must implement their own mount cap. Y.Doc in-memory cost per-document is roughly 2 MB for a 260k-edit document per maintainer statement; UndoManager and tombstone costs are not publicly benchmarked.

**Key Findings:**

- **React 19.2 Performance Tracks + DevTools Extensibility API** is the new first-party React profiling baseline (Oct 2025).
- **tldraw's Playwright FPS perf harness is the canonical public template** — and its removal is the canonical cautionary tale.
- **Editor and CRDT libraries ship near-zero perf tooling** — everything is application-rolled or delegated to external perf repos (Yjs + Automerge pattern).
- **CodSpeed + vitest bench + tinybench** is the 2026 mainstream path to sub-1%-variance CI perf gating on shared runners.
- **INP is the 2024+ responsiveness Core Web Vital**; `web-vitals` v5.2.0 is the canonical integration; Lighthouse cannot produce INP.
- **Bun has first-class perf tooling since 1.3.7** with Node-compatible flags and Chrome-DevTools-compatible output.
- **OpenTelemetry browser is not production-ready** per maintainers; profiling signal alpha landed 2026-03-26; Node traces + metrics stable.
- **clinic.js is dead; 0x is Node-only; Pyroscope is the active OSS continuous profiler.**

---

## Research Rubric

| # | Dimension | Priority | Depth | Evidence |
|---|-----------|----------|-------|----------|
| D1 | React 19 + React Compiler profiling | P0 | Deep | [react-compiler-profiling.md](evidence/react-compiler-profiling.md) |
| D2 | Browser main-thread tracing | P0 | Deep | [browser-main-thread-tracing.md](evidence/browser-main-thread-tracing.md) |
| D3 | Web Vitals + INP measurement | P0 | Moderate | [web-vitals-inp-measurement.md](evidence/web-vitals-inp-measurement.md) |
| D4 | Bundle analysis (Vite + Rolldown + React Compiler) | P0 | Deep | [bundle-analysis-vite-rolldown.md](evidence/bundle-analysis-vite-rolldown.md) |
| D5 | CRDT / Yjs / Hocuspocus profiling | P0 | Deep | [crdt-yjs-profiling.md](evidence/crdt-yjs-profiling.md) |
| D6 | Editor OSS perf harnesses | P0 | Deep | [editor-oss-perf-harnesses.md](evidence/editor-oss-perf-harnesses.md) |
| D7 | Node.js tracing for long-lived WebSocket servers | P1 | Moderate | [node-server-tracing.md](evidence/node-server-tracing.md) |
| D8 | CI-gated perf regression patterns | P0 | Deep | [ci-gated-perf-regression.md](evidence/ci-gated-perf-regression.md) |
| D9 | Memory profiling + leak detection | P1 | Moderate | [memory-profiling-leak-detection.md](evidence/memory-profiling-leak-detection.md) |
| D10 | OpenTelemetry readiness (frontend + Node) | P1 | Moderate | [opentelemetry-readiness.md](evidence/opentelemetry-readiness.md) |

---

## Detailed Findings

### D1 — React 19 + React Compiler profiling

**Finding:** The React-profiling surface changed structurally with React 19.2 (October 2025). Performance Tracks emit Scheduler (Blocking / Transition / Suspense / Idle), Components, and Server tracks directly into Chrome DevTools via the Extensibility API — no extension install required for the Scheduler track; `<Profiler>` boundaries gate the Components track in production-profiling builds (unless the React DevTools extension is installed). react-scan (v0.5.3, active) and bippy (v0.5.32, active) are the runtime fiber-level tools; why-did-you-render v10 added React 19 support but the maintainer states it is "believed to be completely incompatible with React Compiler." million is in soft-deprecation (1 substantive commit since mid-2024). Sentry's Browser Profiling is the dominant commercial in-production answer.

**Evidence:** [react-compiler-profiling.md](evidence/react-compiler-profiling.md)

**Implications:**
- The DevTools Performance panel is now the default React-aware surface; instrumentation is opt-in via `<Profiler>` or the Extensibility API, not a separate product.
- For apps running React Compiler, the "why did this render?" question has three viable answers: DevTools Profiler (Compiler-badge behavior in React DevTools v5+ is reported by secondary sources, flagged INFERRED in the evidence file; primary extension docs not retrieved), react-scan/bippy (OSS gated off in production by `dangerouslyForceRunInProduction=false`), or commercial APM like Sentry. wdyr is out.
- Production profiling via the `react-dom/profiling` build requires aliasing `react-dom/client` at build time; the instrumentation overhead is non-trivial.

**Decision triggers (when this matters):**
- Compiler-generated memoization means "why is this re-rendering?" investigation tools must be Compiler-aware or they misattribute.
- Teams wanting in-production React profiling without build-tooling changes typically route through commercial APM (Sentry/Datadog), not `react-dom/profiling`.

**Remaining uncertainty:**
- Exact React DevTools extension badge behavior for Compiler-memoized components (secondary sources only).
- React Scan Monitoring commercial product pricing / production-safety SLA.

---

### D2 — Browser main-thread tracing

**Finding:** Chrome DevTools Performance panel + Perfetto UI + CDP Tracing converge on the same JSON/protobuf trace formats. The Chrome DevTools Extensibility API (shipped Chrome 128-134) lets userland emit custom Performance-panel tracks via `performance.measure({detail:{devtools:...}})` or extended `console.timeStamp`. This is the primitive React 19.2 Performance Tracks build on; any editor library (ProseMirror, CodeMirror, Y.js) could ship first-party tracks the same way. The Long Animation Frames API (LoAF, Chrome 123+) is the INP-aware superset of the Long Tasks API; `web-vitals` v5.0+ attribution uses it. Playwright exposes two non-overlapping tracing surfaces: `browser.startTracing()` for CDP-JSON portable to DevTools/Perfetto, and `context.tracing.start()` for Playwright's own trace viewer.

**Evidence:** [browser-main-thread-tracing.md](evidence/browser-main-thread-tracing.md)

**Implications:**
- Custom DevTools tracks for editor internals (PM mutations, CM6 view updates, Y.js observer fires) require only `performance.measure` with the `devtools` detail shape — no browser extension, no agent.
- CDP trace JSON format is on a deprecation path per the protocol docs ("will be deprecated soon"). Protobuf is Chrome's native; JSON is the interchange.

**Decision triggers:**
- Any editor that wants first-party tracks appears in the Performance panel — instrumentation lives with the library, not the host app.
- Perfetto's SQL-queryable trace processor is the lever for scripted/automated analysis of large trace sets; DevTools is for interactive inspection.

**Remaining uncertainty:**
- No primary source for the exact CDP category string that DevTools' "Web developer" preset sends.
- Headed vs headless Chrome trace delta not primary-source confirmed.

---

### D3 — Web Vitals + INP measurement

**Finding:** INP replaced FID as a Core Web Vital on 2024-03-12; thresholds are Good ≤200 ms / NI 200-500 ms / Poor >500 ms, at p75 with high-interaction outlier reduction. INP is field-only — Lighthouse produces TBT (proxy, lab-measurable). The `web-vitals` npm package (v5.2.0, 2026-03-25) is the canonical integration; its attribution build adds LoAF data for "which script caused the 480 ms INP" surfacing. The underlying W3C Event Timing API (Working Draft 2026-03-19) has a default 104 ms threshold (minimum 16 ms) — custom RUM can skip the library by observing `type: 'event'` directly. Notion's publicly documented "Keydown to Paint" metric (via Palette) is the editor-specific gold standard for typing latency — they found their internal "keypress → React render" number was ~10× lower than actual perceived latency.

**Evidence:** [web-vitals-inp-measurement.md](evidence/web-vitals-inp-measurement.md)

**Implications:**
- A complete perf telemetry stack for an interactive editor needs lab (TBT via Lighthouse) for CI gating + field (INP via `web-vitals` or a RUM vendor) for reality.
- The `Metric` type shape (`name`, `value`, `id`, `delta`, `rating`, `navigationType`, `entries`) is effectively the industry contract — vendor RUMs (Vercel, Sentry) conform to it.

**Decision triggers:**
- If typing latency is a product metric, measuring "keypress timestamp → paint" (not "keypress → React render") is the number that matches user perception.
- Sentry's Performance Score weights INP at 30% on both desktop and mobile (vendor-specified, not web-standard).

**Remaining uncertainty:**
- CrUX 75th-percentile methodology page not retrieved in primary source in this pass.

---

### D4 — Bundle analysis for Vite + Rolldown + Babel/React Compiler

**Finding:** Four active visualizers cover Vite/Rolldown: `rollup-plugin-visualizer` (8 output formats including flamegraph), `vite-bundle-analyzer` (v1.3.7, 2026-04-06, explicit `rolldown-vite` adapter), `vite-bundle-explorer` (v1.0.0, 2025-11-28, with "Trace Import" for duplicate-dep debugging), `@relative-ci/rollup-plugin` (CI SaaS agent, 2026-03-07 release). `size-limit` v12.1.0 is the only tool in this group that measures wall-clock compile+execute time via Chrome headless + CPU throttling. Statoscope remains Webpack/Rspack-only. **React Compiler (Babel plugin) emits `react/compiler-runtime` imports and per-component cache-sentinel memoization scaffolding — visualizers attribute the runtime as a separate node_modules node but no tool surfaces "bytes added by Compiler" as a first-class breakdown.**

**Evidence:** [bundle-analysis-vite-rolldown.md](evidence/bundle-analysis-vite-rolldown.md)

**Implications:**
- For Rolldown migration (alpha, "powering Vite 8+"), analyzers that speak the Rollup plugin API largely work transparently; Rolldown-specific adapters are the visible seams.
- Bundle perf budgets and runtime perf budgets are different questions — size-limit's time plugin addresses the runtime-compile-cost question, which most visualizers don't.

**Decision triggers:**
- Monorepos with dep-dedup issues: vite-bundle-explorer's "Trace Import" is the differentiator.
- CI trend-over-time vs per-PR comparison: RelativeCI vs size-limit cover different needs.

**Remaining uncertainty:**
- No primary-source maintenance confirmation for `@next/bundle-analyzer`, `bundlesize`, `bundlewatch` (npm pages 403'd).
- No visualizer annotates Compiler-emitted bytes distinctly.

---

### D5 — CRDT / Yjs / Hocuspocus profiling

**Finding:** **The Y.js ecosystem externalizes perf tooling** — `dmonad/crdt-benchmarks` (4 scenarios: B1-B4, with B4 replaying the 259,778-op insert+delete subset of Kleppmann's `automerge-perf` LaTeX-paper trace; the full `automerge-perf` trace contains 332,702 changes including 102,049 cursor moves that B4 doesn't apply) is the canonical external suite. Yjs Inspector (hosted at inspector.yjs.dev) is an inspection playground, not a profiler. **Hocuspocus ships zero benchmark or load-testing infrastructure** — the scalability doc recommends only Redis + horizontal sharding and ends with a "TODO." **TipTap and CodeMirror 6 also ship no benchmarks** (CM6 maintainer: "No benchmarks have been done"). ProseMirror has a known non-linear paste-perf issue (#364). `Y.Doc.emit('afterAllTransactions')` is the documented hook for custom transaction-level instrumentation; `HocuspocusProvider.forceSyncInterval` is the only timing-sensitive public knob. CRDT comparison numbers (Loro vs Yjs vs Automerge) are version-conditional and published in library-specific forks.

**Evidence:** [crdt-yjs-profiling.md](evidence/crdt-yjs-profiling.md)

**Implications:**
- Any Hocuspocus-server load testing is custom-rolled (Artillery with `engine: ws` is the ecosystem standard load generator).
- Y.Doc transaction-level profiling requires `afterAllTransactions` + custom `performance.mark` instrumentation; no `yjs-profiler` package exists.

**Decision triggers:**
- Cross-CRDT comparisons are always version-conditional. Numbers from a blog post must be re-baselined against current library versions.
- `automerge-perf` LaTeX trace is the editor-perf lingua franca; subsets are small enough (~4.5 MB JS) to vendor into a test suite.

**Remaining uncertainty:**
- Loro docs page returned 403 during fetch; current numbers must be pulled from community thread summaries.

**Related Research:** `reports/crdt-observer-bridge-latency-analysis/` covers Open Knowledge's specific cross-CRDT sync latency (400ms-7s per cycle at scale) and is the 1P companion to this 3P tooling landscape.

---

### D6 — Editor OSS perf harnesses

**Finding:** **tldraw's `playwright-perf.yml` is the most complete publicly-readable template** for Playwright-orchestrated editor FPS perf testing — FPS tracker (100 ms requestAnimationFrame sampling), baseline-per-environment (`platform-viewport` key), 15% regression / 10% warning thresholds, S3 artifact upload, PostHog reporting, serial test execution on dedicated 16-core runners. PR #7517 (Dec 30 2025) removed it: "consistently failing in CI" with "failures would disappear on re-runs." Issue #7595 (open) tracks restoration; #8082 considers moving to closed-source. tldraw separately ships an in-process `PerformanceMeasurer` class (cold → warmup → iterations pattern) — the manual ancestor of `vitest bench()`. **Zed uses the opposite pattern**: `workflow_dispatch`-only head-vs-base hyperfine comparison on Namespace.so 16×32 runners, YAML generated from Rust (`cargo xtask workflows`). **Excalidraw ships bundle-size-gate only** (`size-limit-action`, `.size-limit.json`). **BlockSuite's `size-report.yml` is disabled** with comment "Fail for unknown reasons." **Silverbullet ships `vitest bench` micro-benches** in a dedicated `bench/` dir with workload-weighted annotations. **Outline uses `@relative-ci/agent`** for bundle stats. **Milkdown, BlockNote, Plate, Remirror, Logseq, Peritext, Automerge-ProseMirror ship NO runtime perf harnesses.** Absence pattern is itself a finding.

**Evidence:** [editor-oss-perf-harnesses.md](evidence/editor-oss-perf-harnesses.md)

**Implications:**
- Eight convergent patterns exist: FPS baseline comparison, `vitest bench` micro-benches, head-vs-base `hyperfine`, `size-limit` + action, `size-report.yml` (disabled — signals fragility), RelativeCI with webpack-stats, character-by-character edit trace as dataset, dedicated perf repo separate from main library, in-process micro-bench class with cold/warmup/iteration phases.
- Five of these are adoption-ready external libraries; two are reusable datasets; one (tldraw's harness) is a source-readable template whose removal tells you something about stability headroom.

**Decision triggers:**
- FPS-based runtime gating has NOT become the default for React editor OSS. Bundle-size gating has. The cost/benefit for runtime gates is contested.
- Rust-side zed's `cargo xtask` → generated YAML pattern is a methodology reference for any stack; the specific primitives (hyperfine) don't transfer to JS/TS.

**Remaining uncertainty:**
- tldraw harness restoration status (#7595) is open.
- Milkdown/Remirror/BlockNote absence could reflect private internal tooling not surfaced publicly.

---

### D7 — Node.js tracing for long-lived WebSocket servers

**Finding:** **clinic.js is dead** (README: "not being actively maintained"; last release 2023-06-28). **0x v6.0.0** (2025-07-07) supports Node 20+ only, not Bun. **Node's built-in `perf_hooks`** (`monitorEventLoopDelay`, `timerify`) + `v8.writeHeapSnapshot()` covers the diagnostic basics. **Grafana Pyroscope v1.21.0 (2026-04-17) is the only actively-developed OSS continuous profiler** for Node; Sentry profiling-node and Datadog dd-trace profiling are both V8-only (won't run on Bun). **Bun 1.3.7+ ships native `--cpu-prof` / `--heap-prof`** with Chrome DevTools-compatible output and Node-compatible flag names. **`node:inspector` Profiler API works in Bun** (`Profiler.enable|start|stop`, WebKit Inspector Protocol). For WebSocket load testing: **Artillery's `engine: ws`** is the ecosystem standard (autocannon is HTTP-only).

**Evidence:** [node-server-tracing.md](evidence/node-server-tracing.md)

**Implications:**
- For Bun-runtime servers (like Hocuspocus in a Bun stack), the profiling path is Bun's native flags → `.cpuprofile`/`.heapsnapshot` → Chrome DevTools. V8-ecosystem vendor profilers won't run.
- For Node-runtime servers, Pyroscope is the OSS continuous profiling answer; Sentry/Datadog cover commercial paths.

**Decision triggers:**
- Continuous profiling (always-on, low-overhead, 10-60s flush cadence) vs on-demand (`--cpu-prof` style) is an operational model choice, not a tool choice.
- WebSocket-specific perf questions (connection churn, broadcast fan-out) require Artillery `engine: ws` — HTTP load tools don't apply.

**Remaining uncertainty:**
- No Bun-runtime continuous-profiling SDK exists; open whether an unofficial Bun Pyroscope wrapper is being built.

---

### D8 — CI-gated perf regression patterns

**Finding:** **Playwright 1.57 switched default browser to Chrome for Testing** (late 2025; an open community issue reports 20 GB+ memory per instance in CI — [#38489](https://github.com/microsoft/playwright/issues/38489)). **Playwright 1.58 added a Timeline view** inside the Speedboard tab — reporting only, not a gating mechanism. **tldraw's removed harness is the canonical OSS cautionary tale**: three restoration levers are (a) production builds, (b) no dev-mode React DevTools, (c) dedicated runner class + serial execution. **CodSpeed is the dominant hosted-service answer** — `valgrind`/`cachegrind` instruction counting brings variance below 1% on shared runners; wraps `vitest bench` (tinybench-backed) unchanged. **p95 is the industry-recommended first guardrail; p99 is flake-prone** at low sample counts unless paired with variance-aware thresholds. Three-tier CI cadence (per-PR / nightly / weekly) is convergent across OSS but not formally standardized.

**Evidence:** [ci-gated-perf-regression.md](evidence/ci-gated-perf-regression.md)

**Implications:**
- CodSpeed's hardware-counter technique is the 2026 answer to "how do I gate PRs on perf regression without flake?" for most JS/TS codebases.
- Bundle-size gating (size-limit + action) is a solved problem; runtime gating is not.

**Decision triggers:**
- Shared-runner noise is the root cause of most flake. Mitigations from lowest to highest cost: CodSpeed (hardware counters) → dedicated runner class → micro-bench-only (no DOM) → head-vs-base instead of baseline-compare.
- Micro-bench via `vitest bench` vs Playwright-orchestrated FPS covers different questions — pure-JS perf vs full-DOM interaction perf.

**Remaining uncertainty:**
- Playwright 1.58 Speedboard Timeline: whether it emits machine-consumable perf data for gating (current: reporting only).
- Why tldraw didn't reinstate perf tests — #8082 suggests a pivot toward private testing.

---

### D9 — Memory profiling + leak detection

**Finding:** Chrome DevTools Memory panel exposes three modes (heap snapshot / allocations on timeline / allocation sampling). **Meta's memlab** is the only published Playwright-compatible automated leak-detection framework — three-snapshot protocol (`baseline`, `target`, `final`), detects class-set with net growth across `baseline→target` that doesn't shrink in `target→final`. `leakage` targets Mocha/Tape node unit-level leak assertions. `why-is-node-running` diagnoses handle-leak (process-won't-exit) cases. **`v8.writeHeapSnapshot()`** replaces legacy `heapdump` for Node 11+. **React 19.2 `<Activity mode="hidden">` preserves state + DOM; React docs are silent on eviction policy** — host applications must implement their own mount cap. **Y.Doc in-memory cost is ~2 MB per 260k-edit document** per Y.js maintainer (single data point); UndoManager and tombstone costs are not publicly benchmarked. Playwright heap-snapshot capture requires CDP session (`HeapProfiler.takeHeapSnapshot`) — no first-party API.

**Evidence:** [memory-profiling-leak-detection.md](evidence/memory-profiling-leak-detection.md)

**Implications:**
- The canonical React leak workflow is snapshot-before → exercise → snapshot-after → Comparison view → scan for "Detached" class growth.
- For automated regression gates: memlab + Playwright is the only documented published pipeline.
- Y.Doc server memory planning requires repo-local measurement — no canonical benchmark suite.

**Decision triggers:**
- Applications using `<Activity>` must implement their own mount cap; React won't.
- Large-doc editors should measure their own heap curve before committing to architectural decisions.

**Remaining uncertainty:**
- React 19.2 Activity memory policy: community sources cite "2× memory" and "LRU is being considered" — no primary-source confirmation.
- Y.Doc production-RAM curve over hours: not published.

---

### D10 — OpenTelemetry readiness (frontend + Node)

**Finding:** OTel JS SDK: **traces Stable, metrics Stable, logs Development** per the official status table. **Browser: "experimental and mostly unspecified"** per OTel docs; OTel co-founder Ted Young (Grafana, Nov 2025): "It's not really something that we consider, like, a professional product that stacks up against the other things that are out there." Session-across-page-loads model is the blocker. **Vendor divergence varies**: OneUptime publishes browser-OTel recipes framed as ready-to-use; Elastic's own posts reproduce the upstream experimental caveat verbatim while still providing recipes. **OTel Profiling signal alpha landed 2026-03-26** (eBPF + pprof receiver, server-side only, no JS SDK support yet). **Sentry OTLP ingestion is open-beta** for traces and logs; metrics not supported; Sentry Node/Java SDKs now use OTel under the hood (POTEL). **Datadog supports OTLP via three paths** (Agent receiver 4317/4318, direct API, DDOT Collector). **W3C Trace Context + Baggage propagation is the stable standard** for browser→backend correlation regardless of browser SDK maturity. **No editor-OSS / CRDT-OSS projects show visible OTel adoption**; WebSocket instrumentation requires community `opentelemetry-instrumentation-ws` or custom at the Hocuspocus extension layer.

**Evidence:** [opentelemetry-readiness.md](evidence/opentelemetry-readiness.md)

**Implications:**
- For a Node/Bun server, OTel is production-ready for traces and metrics; interop with Sentry, Datadog, and Jaeger via OTLP is established.
- For browser, the practical 2026 answer is vendor RUM (Sentry / Vercel / Datadog / Elastic), not upstream OTel browser SDK.
- Correlation browser→backend via `traceparent` is stable even when the browser SDK is experimental.

**Decision triggers:**
- Any browser OTel wiring in 2026 bets on an experimental SDK and a spec-in-motion session model.
- Server-side Node WebSocket instrumentation for Hocuspocus is custom work — the community `opentelemetry-instrumentation-ws` package traces `ws` socket lifecycle but not Hocuspocus message semantics.

**Remaining uncertainty:**
- OTel browser Session Model is the Browser SIG's active work; no shipping date.
- OTel agent overhead varies widely by configuration; no recent third-party Node benchmark.

---

## Limitations & Open Questions

### Dimensions not fully covered

- **D1:** Exact React DevTools extension behavior for Compiler-memoized components (secondary sources only; primary extension docs not retrieved).
- **D2:** Canonical Chromium-source category string for DevTools "Web developer" preset; primary-source headless vs headed trace delta.
- **D3:** CrUX 75th-percentile / 28-day methodology primary-source phrasing.
- **D4:** Maintenance status of `@next/bundle-analyzer`, `bundlesize`, `bundlewatch` (npm page fetches returned 403).
- **D5:** Loro primary docs page returned 403 during fetch.
- **D6:** Private internal perf infra at Milkdown/Remirror/BlockNote (absence in public repos could reflect private tooling).
- **D8:** Whether Playwright 1.58 Speedboard Timeline emits machine-consumable perf data for gating.
- **D9:** React 19.2 Activity eviction-policy RFC; Y.Doc production heap curves over time.
- **D10:** Rigorous 2026 Node OTel-agent overhead benchmark.

### Out of scope (per rubric)

- Open Knowledge-specific tool adoption recommendations (spec-owned)
- Benchmarking of tools against Open Knowledge's codebase
- Product analytics (Amplitude, PostHog beyond the perf-reporting pattern)
- CRDT latency analysis on Open Knowledge's observer bridge (covered in `reports/crdt-observer-bridge-latency-analysis/`)
- AI/LLM-specific profiling; SEO/crawler performance

---

## References

### Evidence Files (primary proof for each dimension)

- [evidence/react-compiler-profiling.md](evidence/react-compiler-profiling.md) — D1
- [evidence/browser-main-thread-tracing.md](evidence/browser-main-thread-tracing.md) — D2
- [evidence/web-vitals-inp-measurement.md](evidence/web-vitals-inp-measurement.md) — D3
- [evidence/bundle-analysis-vite-rolldown.md](evidence/bundle-analysis-vite-rolldown.md) — D4
- [evidence/crdt-yjs-profiling.md](evidence/crdt-yjs-profiling.md) — D5
- [evidence/editor-oss-perf-harnesses.md](evidence/editor-oss-perf-harnesses.md) — D6
- [evidence/node-server-tracing.md](evidence/node-server-tracing.md) — D7
- [evidence/ci-gated-perf-regression.md](evidence/ci-gated-perf-regression.md) — D8
- [evidence/memory-profiling-leak-detection.md](evidence/memory-profiling-leak-detection.md) — D9
- [evidence/opentelemetry-readiness.md](evidence/opentelemetry-readiness.md) — D10

### External Sources (headline landmarks)

- [React 19.2 release — Performance Tracks](https://react.dev/blog/2025/10/01/react-19-2)
- [Chrome DevTools Extensibility API](https://developer.chrome.com/docs/devtools/performance/extension)
- [Perfetto docs](https://perfetto.dev/docs/)
- [web.dev — INP definition](https://web.dev/articles/inp)
- [GoogleChrome/web-vitals](https://github.com/GoogleChrome/web-vitals)
- [dmonad/crdt-benchmarks](https://github.com/dmonad/crdt-benchmarks)
- [automerge/automerge-perf](https://github.com/automerge/automerge-perf)
- [tldraw playwright-perf removal (PR #7517)](https://github.com/tldraw/tldraw/pull/7517) + [restoration issue #7595](https://github.com/tldraw/tldraw/issues/7595)
- [zed compare_perf.yml](https://github.com/zed-industries/zed/blob/main/.github/workflows/compare_perf.yml)
- [CodSpeed](https://codspeed.io/)
- [Bun 1.3.7 — CPU + heap profilers](https://bun.com/blog/bun-v1.3.7)
- [Grafana Pyroscope Node SDK](https://grafana.com/docs/pyroscope/latest/configure-client/language-sdks/nodejs/)
- [clinic.js — not maintained](https://github.com/clinicjs/node-clinic)
- [OpenTelemetry status](https://opentelemetry.io/status/)
- [OTel Browser experimental docs](https://opentelemetry.io/docs/languages/js/getting-started/browser/)
- [OTel Profiling alpha (2026-03-26)](https://opentelemetry.io/blog/2026/profiles-alpha/)
- [Meta memlab — Playwright integration](https://facebook.github.io/memlab/docs/guides/integrate-with-e2e-frameworks/)
- [Playwright 1.57 Chrome for Testing](https://github.com/microsoft/playwright/releases/tag/v1.57.0) + [1.58 Speedboard Timeline](https://github.com/microsoft/playwright/releases/tag/v1.58.0)
- [size-limit](https://github.com/ai/size-limit) + [action](https://github.com/andresz1/size-limit-action)
- [RelativeCI Vite/Rollup/Rolldown plugin](https://relative-ci.com/releases/2026-03--vite-rollup-rolldown-plugin)

### Related Research (navigation aids — not evidence for this report)

- [reports/crdt-observer-bridge-latency-analysis/](../crdt-observer-bridge-latency-analysis/REPORT.md) — Open Knowledge's 1P observer-bridge latency analysis (the 1P companion to D5).
- [reports/collaborative-editor-timing-best-practices/](../collaborative-editor-timing-best-practices/REPORT.md) — timing constants (debounce, defer, sync intervals) for collaborative editors; adjacent to D5 + D8.
- [reports/playwright-e2e-observability-determinism-best-practices/](../playwright-e2e-observability-determinism-best-practices/REPORT.md) — Playwright E2E conventions; adjacent to D8 but different scope (test determinism, not perf gating).
