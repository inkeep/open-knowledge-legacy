# Evidence: D1 — React 19 + React Compiler profiling

**Dimension:** D1 — React 19 + React Compiler profiling tools, how they interact with Compiler-generated memoization, and their ergonomics across dev / CI / prod.
**Date:** 2026-04-19
**Sources:** react.dev (19.2 release + Performance Tracks reference + `<Profiler>` reference), `~/.claude/oss-repos/react-scan`, `~/.claude/oss-repos/bippy`, `~/.claude/oss-repos/million`, welldone-software/why-did-you-render v10.0.0 release, Sentry Browser Profiling docs

---

## Key pages / files referenced

- https://react.dev/blog/2025/10/01/react-19-2 — React 19.2 release blog (Oct 1, 2025)
- https://react.dev/reference/dev-tools/react-performance-tracks — Performance Tracks reference
- https://react.dev/reference/react/Profiler — `<Profiler>` component
- https://github.com/welldone-software/why-did-you-render/releases/tag/v10.0.0 — wdyr v10 (Jan 18, 2025)
- `~/.claude/oss-repos/react-scan/packages/scan/package.json` — v0.5.3, last commit 2026-03-06
- `~/.claude/oss-repos/react-scan/packages/scan/src/core/index.ts:437-443` — production gate
- `~/.claude/oss-repos/bippy/packages/bippy/package.json` — v0.5.32, last commit 2026-03-17
- `~/.claude/oss-repos/million/package.json` — v3.1.10; 1 commit since mid-2024

---

## Findings

### Finding: React 19.2 (Oct 1 2025) introduced React Performance Tracks — custom Chrome DevTools tracks emitting Scheduler + Components + Server information

**Confidence:** CONFIRMED

**Evidence:**
- https://react.dev/blog/2025/10/01/react-19-2 — "React 19.2 adds a new set of custom tracks to Chrome DevTools performance profiles to provide more information about the performance of your React app"
- https://react.dev/reference/dev-tools/react-performance-tracks — Scheduler track has four priority subtracks: **Blocking** ("synchronous updates, which could've been initiated by user interactions"), **Transition** ("Non-blocking work that happens in the background, usually initiated via `startTransition`"), **Suspense** ("Work related to Suspense boundaries, such as displaying fallbacks or revealing content"), **Idle** ("The lowest priority work that is done when there are no other tasks with higher priority"). Per-render phases inside each pass: **Update → Render → Commit → Remaining Effects**.
- Components track: "shows the tree of components that React is working on either to render or run effects. Inside you'll see labels such as 'Mount' for when children mount or effects are mounted, or 'Blocked' for when rendering is blocked due to yielding to work outside React."
- Server-only tracks (dev builds only): **Server Requests** and **Server Components**.
- "If enabled, tracks should appear automatically in the traces you record with the Performance panel of browsers that provide extensibility APIs."

**Implications:** Out-of-the-box surface for React-aware timeline in Chrome/Edge DevTools without external instrumentation.

---

### Finding: Performance Tracks are instrumentation-heavy and dev-only by default; production requires switching to the `react-dom/profiling` profiling build

**Confidence:** CONFIRMED

**Evidence:**
- https://react.dev/reference/dev-tools/react-performance-tracks — "The profiling instrumentation that powers React Performance tracks adds some additional overhead, so it is disabled in production builds by default."
- "In addition to production and development builds, React also includes a special profiling build. To use profiling builds, you have to use `react-dom/profiling` instead of `react-dom/client`. We recommend that you alias `react-dom/client` to `react-dom/profiling` at build time via bundler aliases instead of manually updating each `react-dom/client` import."
- "Only Scheduler tracks are enabled by default. The Components track only lists Components that are in subtrees wrapped with `<Profiler>`. If you have [React Developer Tools extension] enabled, all Components are included in the Components track even if they're not wrapped in `<Profiler>`."
- "Server Components and Server Requests tracks are only available in development builds."

**Implications:** In prod profiling builds, `<Profiler>` doubles as the opt-in marker that enables Components-track visibility for a subtree (unless the React DevTools extension is installed).

---

### Finding: `<Profiler>` component exposes per-commit render timings via `onRender(id, phase, actualDuration, baseDuration, startTime, commitTime)`

**Confidence:** CONFIRMED

**Evidence:**
- https://react.dev/reference/react/Profiler — signature `function onRender(id, phase, actualDuration, baseDuration, startTime, commitTime)`. `phase` is `"mount" | "update" | "nested-update"`. `actualDuration` is "The number of milliseconds spent rendering the `<Profiler>` and its descendants for the current update." `baseDuration` is "The number of milliseconds estimating how much time it would take to re-render the entire `<Profiler>` subtree without any optimizations."
- "Profiling is disabled in the production build by default. To opt into production profiling, you need to enable a special production build with profiling enabled."
- React docs do not mention React Compiler caveats on the `<Profiler>` page.

**Implications:** The programmatic, non-DevTools path for ad-hoc and CI-shaped per-commit timings. Works with the profiling build for prod.

---

### Finding: React DevTools extension (≥ v5) surfaces React Compiler optimizations via badges in the Components and Profiler tabs

**Confidence:** INFERRED (secondary sources only; no react.dev page quoted in this pass)

**Evidence:**
- DebugBear and dev.to secondary coverage describe: compiled components annotated with "Compiler" / "Memo" badges in React DevTools v5+; the Profiler flamegraph marks components that were skipped/partially compiled/memo-slotted.
- Primary `<Profiler>` docs and Performance Tracks docs don't describe the badges directly — pattern comes from React DevTools extension docs (not retrieved as a primary source in this pass).

**Implications:** The React Compiler effect on component renders is visible in the existing React DevTools Profiler UI; the DevTools extension is still canonical for "why did this render?"-style investigation, even with Compiler on.

---

### Finding: react-scan (OSS) is MIT, v0.5.3, active in 2026 — drop-in render-highlight overlay, NOT a profiler

**Confidence:** CONFIRMED

**Evidence:**
- `~/.claude/oss-repos/react-scan/packages/scan/package.json` — `"version": "0.5.3"`; last commit 2026-03-06.
- `~/.claude/oss-repos/react-scan/README.md` — "React Scan automatically detects performance issues in your React app … Highlights exactly the components you need to optimize. Always accessible through a toolbar on page." Install via `npx react-scan@latest init`, or `<script src="//unpkg.com/react-scan/dist/auto.global.js">` tag.
- Options shape includes `dangerouslyForceRunInProduction?: boolean` (default `false`) and `onRender?: (fiber: Fiber, renders: Array<Render>) => void`.

**Implications:** Dev-ergonomics sweet spot — install and see which components re-rendered. Not a frame-level profiler.

---

### Finding: react-scan OSS is gated off in production by default; the commercial "React Scan Monitoring" product is a separate offering (vendor divergence)

**Confidence:** CONFIRMED for the gate; INFERRED for product separation

**Evidence:**
- `~/.claude/oss-repos/react-scan/packages/scan/src/core/index.ts:437-443`:

```typescript
if (
  !ReactScanInternals.runInAllEnvironments &&
  getIsProduction() &&
  !ReactScanInternals.options.value.dangerouslyForceRunInProduction
) {
  return;
}
```

- Option doc (index.ts:67-71): "Force React Scan to run in production (not recommended)"
- Bippy README disclaimer (same author): "⚠️ **this project may break production apps and cause unexpected behavior** … this project uses react internals, which can change at any time. it is not recommended to depend on internals unless you really, _really_ have to."
- Secondary (not primary-source captured): react-scan.com pages mention a Monitoring commercial product; the OSS disclaimer is explicit that internals-based approaches are not prod-safe.

**Implications:** Using OSS react-scan in prod is an explicit opt-in against the author's recommendation; a commercial variant exists for production monitoring.

---

### Finding: bippy (v0.5.32, active 2026) is react-scan's underlying library — a fiber-tree toolkit that impersonates React DevTools

**Confidence:** CONFIRMED

**Evidence:**
- `~/.claude/oss-repos/bippy/packages/bippy/package.json` — `"version": "0.5.32"`; `"description": "hack into react internals"`. Pinned React dependency: `"react": "^19.2.4"` in workspace overrides. Last commit 2026-03-17.
- `~/.claude/oss-repos/bippy/README.md` — "bippy allows you to **access** and **use** react fibers **outside** of react components. … bippy works by monkey-patching `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` with our own custom handlers."
- Public APIs (partial): `instrument`, `secure`, `traverseFiber`, `traverseRenderedFibers`, `traverseProps`, `traverseState`, `traverseContexts`, `getDisplayName`, `getFiberSource`, `getTimings`, `getFiberFromHostInstance`, `overrideProps`, `overrideHookState`, `overrideContext`. Package is ~4kb gzipped; the README includes a complete toy re-implementation of react-scan (~30 LOC).
- Same prod disclaimer as react-scan.

**Implications:** Primary-source toolkit when you need fine-grained fiber-level instrumentation without reimplementing the DevTools-hook dance. Works across React v17-19.

---

### Finding: million — last real commit June 2024, now in soft-deprecation; author focus moved to "React Grab"

**Confidence:** CONFIRMED

**Evidence:**
- `~/.claude/oss-repos/million/package.json` — `"version": "3.1.10"`, description "Make React Faster. Automatically."
- `git log --pretty='%ci %s' -5` on `main`: **1 commit in 2025** (2025-12-03, "Update README with React Grab details"), previous commit 2024-06-06. `git log --since=2025-01-01 --oneline | wc -l` returns `1`.
- README top-banner: "I'm working on something new (still free + open source!) React Grab allows you to select an element and copy its context (like HTML, React component, and file source)"

**Implications:** Million is a compile-time virtual-DOM replacement for React reconciliation (separate concern from profiling). Not maintained in a way that suggests active 2026 React 19 / Compiler co-evolution. React Compiler's automatic memoization also reduces the addressable surface Million was optimizing.

---

### Finding: why-did-you-render v10 (Jan 18 2025) supports React 19, but maintainer states it is "believed to be completely incompatible with" React Compiler

**Confidence:** CONFIRMED

**Evidence:**
- https://github.com/welldone-software/why-did-you-render/releases/tag/v10.0.0 (released 2025-01-18) — "Now supports React 19 🎉🍾"; "Older versions are not supported" (v8 branch for React 18, v7 for React 17/16).
- Breaking changes: notifier prop rename (`prevHook`/`nextHook` → `prevHookResult`/`nextHookResult`), `wdyrStore.hooksPerRender` → `wdyrStore.hooksInfoForCurrentRender`.
- Maintainer compatibility note: **"The library was not tested with React Compiler at all. I believe it's completely incompatible with it."**

**Implications:** For a codebase running React Compiler, wdyr is not a safe choice; react-scan / bippy-style runtime fiber observation and the React DevTools Profiler are the remaining viable "why did this render?" paths.

---

### Finding: Sentry Browser Profiling is positioned as the primary commercial option for in-production React profiling

**Confidence:** INFERRED

**Evidence:**
- https://docs.sentry.io/platforms/javascript/guides/react/profiling/ — "Continuous Profiling" product covers "Browser JavaScript" including React/React Native. Sentry product page: profiling "gives code-level insight into your application performance in a variety of environments, including in production."
- No primary docs retrieved on exact integration shape with React Compiler in this pass — secondary sources only.

**Implications:** Teams wanting prod profiling without maintaining a `react-dom/profiling` alias typically route through Sentry / DataDog RUM / Vercel's observability — external APM rather than React-native tooling.

---

## Terminology (D1)

- **Fiber**: React's internal unit of execution; represents a component or DOM element.
- **Render** vs **commit**: render = building the fiber tree by calling component functions; commit = applying changes to the host tree (DOM).
- **Profiling build**: a third React build (alongside dev + prod) exposing instrumentation that dev enables by default but prod strips.
- **React DevTools hook**: `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` — the global React writes to for renderer registration; the surface bippy (and react-scan, and React DevTools itself) monkey-patches.

## Gaps / follow-ups

- Primary-source confirmation of React DevTools "Compiler" / "Memo" badge behavior (React DevTools extension docs not retrieved in this pass — DebugBear & dev.to are secondary).
- No primary source retrieved on how Compiler-memoized components visually annotate on the Performance Tracks Components track (vs the DevTools extension Profiler UI).
- React Scan Monitoring commercial product pricing / production-safety SLA — only circumstantial signals.

## Sources (de-duped)

- https://react.dev/blog/2025/10/01/react-19-2 — React 19.2 release blog
- https://react.dev/reference/dev-tools/react-performance-tracks — Scheduler/Components/Server tracks + `react-dom/profiling`
- https://react.dev/reference/react/Profiler — `<Profiler>` onRender signature + production-profiling caveat
- https://github.com/welldone-software/why-did-you-render/releases/tag/v10.0.0 — wdyr v10 React 19 support + React Compiler incompatibility statement
- https://github.com/aidenybai/react-scan — react-scan repo (local at `~/.claude/oss-repos/react-scan/`, v0.5.3, last commit 2026-03-06)
- https://github.com/aidenybai/bippy — bippy repo (local at `~/.claude/oss-repos/bippy/`, v0.5.32, last commit 2026-03-17)
- https://github.com/aidenybai/million — million repo (local at `~/.claude/oss-repos/million/`, v3.1.10, only 1 substantive commit since mid-2024)
- https://docs.sentry.io/platforms/javascript/guides/react/profiling/ — Sentry Browser Profiling (vendor-promoted)
