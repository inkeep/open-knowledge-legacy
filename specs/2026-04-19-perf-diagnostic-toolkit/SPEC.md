# Perf Diagnostic Toolkit

**Status:** Approved (headless /ship, auto-confirmed)
**Baseline commit:** `f46d2b59`
**Branch:** `perf/investigation`
**Author:** Claude Opus 4.7 (autonomous engineer, headless mode)

---

## §1 Problem Statement (SCR)

### Situation

Open Knowledge's editor has **four user-facing latency symptoms** that block the core product UX:

| Symptom | Measured (pre-fix) | User perception |
|---|---|---|
| **S1 — Cold load** of `PROJECT.md` (9.7 MB, 25,090 lines) | **20.2 s to ProseMirror-visible**, **15.8 s single main-thread task**, LCP 19.8 s | ~20 second blank screen |
| **S2 — Warm switch back** to a previously-loaded small doc after visiting a big doc | **1.1 s main-thread block** | Click a sidebar entry → noticeable hitch |
| **S3 — Mode toggle** on `PROJECT.md` Source → Visual | **1.4 s blocking**, split 474 ms layout + 457 ms style | Click Visual → 1.5 s hang before content appears |
| **S4 — Idle `/api/page-headings` polling** | **14 requests in 60 s** (polls every 2 s while OutlinePanel is mounted) | Wasted bandwidth + server CPU; traces get noisy |

Full diagnostic details in `/tmp/ok-perf/FINDINGS.md` (three Playwright CDP trace passes against the user's live dev server).

### Complication

The repo has **zero in-band instrumentation for diagnosing these issues**:

- No `performance.mark` / `performance.measure` in runtime code (only in NavigationPendingBar's `performance.now()` for tier computation, and `syncPromise`'s `Date.now()` for wall-clock).
- No React `<Profiler>` component usage — component-level render attribution is invisible.
- No `web-vitals` library — INP / LCP / CLS not measured.
- No Chrome DevTools Extensibility API custom tracks — app transitions don't appear in the Performance panel alongside React 19.2's Scheduler track.
- No scenario-runner infrastructure for reproducing symptoms repeatably. The ad-hoc `/tmp/ok-perf-*.js` scripts that produced this evidence are local-only, not committed, not documented, and will be lost to `/tmp` cleanup.

As a result, **every future perf regression becomes a custom investigation** — spin up Playwright ad-hoc, write a new script, re-derive what "good" looks like. This is a recurring tax, not a one-off.

### Resolution

Build a **repeatable performance diagnostic toolkit** that:

1. Lays down the **durable instrumentation pattern** (emission helpers + React Profiler boundaries + web-vitals) for every future perf-relevant surface in the app.
2. Ships a **scenario framework** at `packages/app/tests/perf/` that mirrors the existing `packages/core/tests/perf/` precedent — versioned, runnable via `bun run perf:profile --scenario=<name>`, producing per-run JSON artifacts.
3. Sets a **CLAUDE.md architectural precedent #20** so future agents/engineers know where to instrument + how to reproduce.
4. **Actually diagnoses and fixes the four real symptoms** via the new toolkit — evidence-based root-cause identification, then the fix, then re-run the scenarios to verify improvement.

The toolkit generalizes beyond the current symptoms: any future perceived-perf regression reduces to "run the scenario, read the trace, identify the component, apply the fix." It is the foundation, not a one-off.

---

## §2 Personas & Audiences

| ID | Persona | Primary need |
|---|---|---|
| P1 | **Engineer / agent diagnosing a perf regression** on any perceived-perf surface | Reproduce the symptom in one command, see which component is at fault, apply a fix, re-verify. Should not require inventing tooling per investigation. |
| P2 | **Reviewer** checking a PR touching an async-suspending, mode-transitioning, or Activity-pool-lifecycle surface | Know that the PR author followed the precedent (marks + Profiler boundary), can run the related scenario, and can see the before/after numbers. |
| P3 | **Future developer / agent adding a new perceived-perf critical surface** | Know exactly which helpers to import and where to wrap — precedent in CLAUDE.md tells them. |
| P4 | **End user** of Open Knowledge | Experiences post-fix improvements to the four symptoms. Not affected by the toolkit itself (dev-only instrumentation). |

---

## §3 In Scope

Organized by layer. Numbers are artifact IDs used throughout the SPEC.

### F1-F6 — Emission layer (`packages/app/src/lib/perf/`)

| ID | Artifact | Purpose |
|---|---|---|
| F1 | `packages/app/src/lib/perf/mark.ts` | `mark(name, props?)` helper that wraps `performance.measure` with the Chrome DevTools Extensibility API detail shape. Always-on, prod-safe (one `performance.measure` call). Naming convention: `ok/<subsystem>/<event>` |
| F2 | `packages/app/src/lib/perf/profiler-boundary.tsx` | `<ProfilerBoundary name="...">` wraps React's `<Profiler>` and routes `onRender(id, phase, actualDuration, baseDuration)` through `mark()` so render times appear in the same DevTools track as other marks. Zero prod cost (React Profiler is no-op in prod build). |
| F3 | `packages/app/src/lib/perf/web-vitals.ts` | `initWebVitals()` — one-call integration of the `web-vitals` npm package. Emits `onINP`, `onLCP`, `onCLS`, `onFCP` via `mark()` and into `window.__ok_perf` collector. Dev-only init (gated on `import.meta.env.DEV`). |
| F4 | `packages/app/src/lib/perf/collector.ts` | `window.__ok_perf` dev-only global — buffer for marks + onRender + web-vitals events. Read by scenarios via CDP `evaluate`. Zero cost in production (guarded by `import.meta.env.DEV`). |
| F5 | `packages/app/src/lib/perf/types.ts` | Shared TypeScript types: `PerfMark`, `ProfilerRenderEvent`, `WebVitalsMark`, `PerfCollector`. |
| F6 | `packages/app/src/lib/perf/index.ts` | Barrel re-export of the public surface: `mark`, `ProfilerBoundary`, `initWebVitals`, `getCollector`. |

Plus co-located tests: `mark.test.ts`, `profiler-boundary.test.tsx`, `web-vitals.test.ts`, `collector.test.ts`.

### F7-F14 — Target-surface instrumentation (modifications to existing)

| ID | File | Change |
|---|---|---|
| F7 | `packages/app/src/main.tsx` | Call `initWebVitals()` on bootstrap (dev-only gate). |
| F8 | `packages/app/src/App.tsx` | Wrap `<App>` tree in outer `<ProfilerBoundary name="app">`. Emit `mark('ok/nav/hash-change', {docName})` in `NavigationHandler`. |
| F9 | `packages/app/src/components/EditorArea.tsx` (or the appropriate inner wrapper) | Wrap in `<ProfilerBoundary name="editor-area">`. |
| F10 | `packages/app/src/components/EditorActivityPool.tsx` | Wrap in `<ProfilerBoundary name="activity-pool">`. `mark('ok/activity/mount-list-change', {active, mounted})` when the mount list updates. `mark('ok/activity/mode-flip', {from, to})` in the Activity subtree. |
| F11 | `packages/app/src/components/FileSidebar.tsx` + `FileTree.tsx` | Wrap `<FileSidebar>` in `<ProfilerBoundary name="file-sidebar">`. |
| F12 | `packages/app/src/components/OutlinePanel.tsx` | **Delete** `refetchInterval: 2000`. Replace with CC1-driven invalidation: subscribe to `provider.on('update')` via active-doc's HocuspocusProvider (debounced 300ms), call `queryClient.invalidateQueries(['page-headings', docName])`. Wrap in `<ProfilerBoundary name="outline-panel">`. |
| F13 | `packages/app/src/editor/sync-promise.ts` | `mark('ok/sync/create', {docName, warm})`, `mark('ok/sync/resolve', {docName, elapsedMs})`, `mark('ok/sync/reject', {docName, reason})`. |
| F14 | `packages/app/src/editor/DocumentContext.tsx` | `mark('ok/nav/open-document', {docName, transition})` in `openDocument` / `openDocumentTransition`. `mark('ok/nav/transition-pending', {docName})` + `mark('ok/nav/transition-settled', {docName})` around the transition. |

### F15-F23 — Scenario framework (`packages/app/tests/perf/`)

| ID | Artifact | Purpose |
|---|---|---|
| F15 | `packages/app/tests/perf/README.md` | Authoring guide — how to write a scenario, how to run, how to interpret. Mirrors shape of `packages/core/tests/perf/README.md`. |
| F16 | `packages/app/tests/perf/profile.ts` | CLI driver: `bun run perf:profile --scenario=<name> [--target=http://…] [--out=…]`. Loads scenario module, launches Playwright, runs it, writes results. Standalone Bun entry point following `packages/core/tests/perf/run-regression-gate.ts` pattern. |
| F17 | `packages/app/tests/perf/lib/cdp-tracer.ts` | CDP `Tracing.start/end` + aggregation helper. Captures categories `cc,gpu,blink,loading,v8,blink.user_timing,devtools.timeline,disabled-by-default-devtools.timeline`. Returns structured summary, not raw events (to avoid 10-MB JSON output per run). |
| F18 | `packages/app/tests/perf/lib/scenario.ts` | Scenario contract: exports `defineScenario(opts)` with signature `(ctx: ScenarioCtx) => Promise<ScenarioResult>`. Shared collector-drainage, longtask observer injection, Performance.getMetrics delta bag. |
| F19 | `packages/app/tests/perf/scenarios/cold-load-big-doc.ts` | S1 reproduction. Fresh context → goto `#/PROJECT` → wait for ProseMirror content. Assertions: captures cold-load total, LCP, long-task count, top long-task duration. |
| F20 | `packages/app/tests/perf/scenarios/warm-switch.ts` | S2 reproduction. Cold-load README → switch to PROJECT → switch back README. Assertions: warm-switch-back blocking time. |
| F21 | `packages/app/tests/perf/scenarios/mode-toggle.ts` | S3 reproduction. Load PROJECT → toggle Source → toggle Visual. Assertions: toggle wall-clock + layout+style ms. |
| F22 | `packages/app/tests/perf/scenarios/outline-polling.ts` | S4 reproduction. Load README, sit idle 30 s, count `/api/page-headings` requests. Post-fix assertion: 0 requests in 30 s idle. |
| F23 | `packages/app/tests/perf/baselines/2026-04-19.json` + `baselines/CHANGELOG.md` | First baseline captured post-instrumentation (the "pre-fix" numbers). Descriptive reference, not a CI gate. CHANGELOG documents when / why baselines shift. |

Plus `packages/app/tests/perf/.gitignore` (ignores `results/`).

### F24 — Turbo task + package wiring

| ID | File | Change |
|---|---|---|
| F24a | `packages/app/package.json` | Add `"perf:profile": "bun run tests/perf/profile.ts"` script. Add `web-vitals: ^5.0.0` to `devDependencies`. |
| F24b | `turbo.json` | Add `perf:profile` task: `cache: false`, not in CI tiers (only runs on explicit invocation). |

### F25 — CLAUDE.md precedent #20

Append architectural precedent #20 to CLAUDE.md:

> 20. **Perf instrumentation as first-class.** Every new React surface that (a) suspends on async data, (b) spans a mode/state transition, (c) is on a perceived-perf critical path, or (d) runs in an Activity-mount subtree, MUST wrap in `<ProfilerBoundary name="...">` and emit `mark('ok/<subsystem>/<event>', ...)` at its transition boundaries using the helpers at `packages/app/src/lib/perf/`. Chrome DevTools Extensibility-API tracks use the `ok/<subsystem>/<event>` namespace. Reproduction scripts for user-facing perf symptoms live in `packages/app/tests/perf/scenarios/`, never in `/tmp`. **STOP:** no CI perf-gating until a scenario reliably reproduces a symptom locally (tldraw's removed-harness — see `reports/perf-profiling-landscape-2026/evidence/editor-oss-perf-harnesses.md` — is the canonical lesson). Cross-references: precedent #18 (hybrid Activity + Suspense), `reports/perf-profiling-landscape-2026/`.

### F26-F29 — Fixes for the four symptoms (evidence-driven)

Phase 3 Step 3 captures the pre-fix baseline with the new instrumentation, Phase 3 Step 4 diagnoses root causes, Phase 3 Step 5 applies fixes below (exact fix determined by the diagnosis):

| ID | Symptom | Fix approach (subject to diagnosis) |
|---|---|---|
| F26 | S1 (cold load) | **Hypothesis:** Either (a) ProseMirror DOM construction for 25K nodes blocks during TipTap mount, or (b) initial Y.Doc update-application cost, or (c) React commits the whole app shell + editor tree in one pass. Likely fix: deferred WYSIWYG mount — Source mode first, WYSIWYG on explicit activation. Or: progressive enhancement — first 100 lines render synchronously, rest via `startTransition`. |
| F27 | S2 (warm switch) | **Hypothesis:** `EditorActivityPool`'s mount-list re-render walks all mounted editors on every Activity mode flip. Likely fix: either reduce `ACTIVITY_MOUNT_LIMIT` to 1 and rely on fast Suspense-gated remount (per precedent #18 Rationale: warm-provider remount is instant), or memoize per-entry Activity subtrees so mode flips don't cascade. |
| F28 | S3 (mode toggle) | **Hypothesis:** Browser's lazy style/layout recalc on `display:none → visible` for 25K-node DOM. Inherent to the pre-mount-both-editors pattern (precedent #18 §10-D1 hybrid). Likely fix: for docs above a size threshold, defer-mount the non-active editor until toggle instead of pre-mounting. |
| F29 | S4 (outline polling) | **Confirmed fix:** Replace `refetchInterval: 2000` with provider `update`-event subscription + debounced invalidation. No hypothesis needed — OutlinePanel.tsx:104 is the exact line. |

### §3 summary — total artifacts created/modified

- **New files:** 17 (6 emission-layer + 4 scenario framework + 4 scenario files + 3 baseline/README)
- **Modified files:** 8-12 (target-surface instrumentation + main.tsx + package.json + turbo.json + CLAUDE.md + OutlinePanel fix + others from diagnosis)

---

## §4 Out of Scope (explicitly declared)

| ID | What | Why out of scope |
|---|---|---|
| OOS1 | CI perf regression gating | Premature per `reports/perf-profiling-landscape-2026/` D8 finding — tldraw's removed harness is the cautionary case. First we need scenarios that reliably reproduce locally; CI gating is the natural follow-on once stability is proven. |
| OOS2 | OpenTelemetry browser or Node wiring | Not production-observed; local-dev diagnosis doesn't require it. OTel browser SDK is officially "experimental and mostly unspecified" per opentelemetry.io; adding would buy us nothing. |
| OOS3 | Bundle visualizer (rollup-plugin-visualizer, etc.) | Prod bundle is 2.4 MB / 760 KB gzipped — acceptable, not the bottleneck. Current symptoms are post-load React work, not bundle fetch. |
| OOS4 | Memory profiling (memlab / heap-snapshot harness) | No confirmed memory issues. If the Activity-mount fix changes memory behavior we'll revisit. |
| OOS5 | Server-side (Hocuspocus / Bun) `--cpu-prof` wiring | The 4 symptoms all show 0 API calls during their blocking phases. Server work is not on the critical path for these symptoms. A `bun --cpu-prof` one-liner is already available when we need it. |
| OOS6 | react-scan as a devDependency install | Can be invoked via `npx react-scan@latest init` on demand. Adding it as a dep couples us to its production-gate caveats (maintainer flags `dangerouslyForceRunInProduction`) with no offsetting benefit. Documented in README instead. |
| OOS7 | CLAUDE.md precedent #20 expansion beyond the stated surfaces | The precedent covers perceived-perf critical surfaces. Pure data-processing code (markdown pipeline, CRDT bridge) has its own perf infrastructure in `packages/core/tests/perf/` and `packages/core/tests/health/`. |
| OOS8 | Refactoring `NavigationPendingBar` off `performance.now()` to use the new `mark()` helper | While consistent with precedent #20, it's cosmetic — NavigationPendingBar's tier computation is a product feature, not perf instrumentation. Tracking as deferred scope. |

---

## §5 Reference Pattern

`packages/core/tests/perf/` — the existing R4 gate directory — is the structural precedent.

| `packages/core/tests/perf/` | `packages/app/tests/perf/` (this spec) |
|---|---|
| `markdown-bench.test.ts` — harness (Bun test runner) | `scenarios/*.ts` — scenarios (standalone Playwright scripts) |
| `regression-gate.ts` — comparator | **not in scope** (OOS1 — no CI gate yet) |
| `run-regression-gate.ts` — orchestrator (CLI) | `profile.ts` — driver (CLI) |
| `baseline.json` — single committed baseline | `baselines/<date>.json` — dated snapshots |
| `README.md` — authoring guide | `README.md` — authoring guide (mirror shape) |
| `turbo.json: test:perf:regression` | `turbo.json: perf:profile` |

The two subtrees are parallel — different measurement needs (micro-bench vs full-browser scenarios), parallel shape. Downstream agents can reason about either by reading its README.

---

## §6 Architectural Decisions (D1–D12)

Each decision has: intent, alternatives considered, evidence, resolution status.

### D1 — Emit semantically, capture separately (two-layer split) [LOCKED]

**Decision:** App code emits semantic events via `mark()` and `<ProfilerBoundary>`. Separate tooling (`profile.ts` + CDP) captures the emissions. No direct coupling between app and profiler.

**Why:** Prevents tool lock-in (Sentry → Datadog → OTel transitions are Layer-2 concerns; Layer-1 is stable). Prevents production-cost creep — Layer 1 is `performance.measure` + React Profiler, both production-safe.

**Alternatives:** Direct Sentry SDK calls (ties app to Sentry). Agent-side auto-instrumentation (black-box — can't reason about what's captured).

**Evidence:** `reports/perf-profiling-landscape-2026/evidence/react-compiler-profiling.md` (React 19.2 Performance Tracks use exactly this pattern — app code writes `performance.measure`, DevTools captures).

### D2 — Scenarios are standalone `bun run` entry points, not `@playwright/test` [LOCKED]

**Decision:** Each scenario is a single `.ts` file invoked via `bun run tests/perf/profile.ts --scenario=<name>`. No test-runner ceremony (no `test.describe`, no fixtures, no retries).

**Why:** Perf scenarios are diagnostic, not pass/fail tests. Retries mask variance; test-runner parallel workers pollute measurement. Standalone scripts match the existing precedent (`src/server/agent-sim.ts`, `packages/core/tests/perf/run-regression-gate.ts`) and decouple scenarios from the Playwright E2E suite's worker-isolation machinery.

**Alternatives:**
- **`@playwright/test` with custom reporter.** Richer fixture ecosystem but adds test-runner discovery/parallelism that fight perf measurement stability.
- **Bun `test` harness.** Cannot drive a browser; disqualified.

**Evidence:** `packages/core/tests/perf/run-regression-gate.ts` uses `import.meta.main` CLI pattern — same shape here. tldraw's `playwright-perf.yml` used `@playwright/test` and the overhead made flake mitigation harder (per `reports/perf-profiling-landscape-2026/evidence/ci-gated-perf-regression.md`).

### D3 — Baselines are descriptive, not CI gates [LOCKED]

**Decision:** Baseline JSON files document "this is where perf was on this date" — not enforced in CI. `perf:profile` is a local-dev + on-demand command.

**Why:** Flaky gates are worse than no gates (tldraw #7595 lesson). Without stable reproduction across hardware, gating produces false failures. Once scenarios reliably reproduce across engineer machines + CI runners, a follow-up spec wires a `perf:gate` task.

**Alternatives:** Gate on first-baseline (premature). Gate only on variance-aware thresholds (the core `regression-gate.ts` already does this for markdown; we'd be replicating machinery without the stability).

**Evidence:** `reports/perf-profiling-landscape-2026/evidence/ci-gated-perf-regression.md` — "no CI gating until a scenario reliably reproduces a symptom locally."

### D4 — `mark()` naming convention: `ok/<subsystem>/<event>` [LOCKED]

**Decision:** All perf marks in the app use the namespace `ok/` + subsystem (e.g. `nav`, `sync`, `activity`, `editor`, `sidebar`, `outline`) + event name. No free-form names.

**Why:** DevTools Extensibility API surfaces each track group by name prefix. Namespaces give us grep-ability in traces + collector, and they cluster in DevTools visualization.

**Evidence:** Chrome DevTools Extensibility API docs — `trackGroup` is the explicit mechanism.

### D5 — `<ProfilerBoundary>` routes `onRender` via `mark()` (unified collector) [LOCKED]

**Decision:** Rather than a separate React Profiler collector, the `<ProfilerBoundary>` component's `onRender` callback emits a `mark('ok/render/<name>', {phase, actualDuration, baseDuration})` call. Render data flows through the same pipeline as transition marks.

**Why:** Unified read-path. One JSON shape in scenarios. No separate "profiler data" vs "marks data" distinction to reason about.

**Alternatives:** Separate `window.__ok_profiler` array. Rejected because scenarios would need two reads.

### D6 — Dev-only `window.__ok_perf` collector [LOCKED]

**Decision:** The collector is a `window.__ok_perf` global, initialized only when `import.meta.env.DEV`. In production builds, the collector is `undefined` and `mark()` still calls `performance.measure` (production-safe) but skips buffering.

**Why:** Production builds get zero buffering overhead. Dev builds get the read surface that CDP-based scenarios need. No runtime feature flag — Vite's build-time `import.meta.env.DEV` is deterministic.

### D7 — CLAUDE.md precedent #20 (not a separate RULES or PERF.md file) [LOCKED]

**Decision:** The "wrap your perf-relevant surface" rule goes into CLAUDE.md's existing numbered-precedents list as item #20. No separate `PERF.md` or `CONTRIBUTING-perf.md`.

**Why:** CLAUDE.md is already the single index of architectural precedents the repo auto-loads for every agent + every PR. A separate file creates two sources of truth and loses agent-auto-load coverage.

**Evidence:** Repo convention — 19 existing numbered precedents all live there.

### D8 — Instrumentation on production-safe primitives only [LOCKED]

**Decision:** `mark()` uses `performance.measure` (always-on, cheap, prod-safe). `<ProfilerBoundary>` uses React's `<Profiler>` (no-op in prod React builds; has a measurable cost in dev and profiling builds). `initWebVitals` is dev-only gated.

**Why:** No production bundle overhead. No production runtime cost. No user-observable change when instrumentation is shipped.

**Alternatives:** Custom sampling (reinvents `web-vitals`). Post-hoc DOM diffing (fragile). Rejected.

### D9 — OutlinePanel uses HocuspocusProvider `update` event, not CC1 channel [LOCKED]

**Decision:** For F12, OutlinePanel subscribes to the active doc's HocuspocusProvider `update` event (debounced 300 ms, matching the precedent #11 / typing-defer convention), then calls `queryClient.invalidateQueries(['page-headings', docName])`.

**Why:** Precise trigger — headings change only when the active doc's content changes. Extending the CC1 channel set (`'headings'`) would require a server-side emitter for every content-mutation path, which is both more work and broader blast-radius than needed. The provider `update` event is the purest local signal.

**Alternatives:**
- Reuse `'backlinks'` CC1 channel. Overshoots — fires on any doc's link change, not just active doc's content.
- New `'headings'` CC1 channel. Requires server-side work without benefit; provider `update` is local and precise.

**Evidence:** `packages/app/src/editor/observers.ts` already wires provider events (`synced`, `update`) via `setupObservers`. Same pattern.

### D10 — web-vitals v5+ (attribution build) for INP measurement [LOCKED]

**Decision:** Use `web-vitals` v5.x, with imports from `web-vitals/attribution` for INP attribution. Install as devDependency (not production) — the dev-only gate means web-vitals code never enters the production bundle, but TypeScript still needs the types.

**Why:** v5.0 removed `onFID` (deprecated in 2024-09-09) and includes LoAF attribution for INP — matches current Web Vitals best practices. Primary-source via `reports/perf-profiling-landscape-2026/evidence/web-vitals-inp-measurement.md`.

**Alternatives:** Custom PerformanceObserver on `type: 'event'` with `durationThreshold: 40` (replicates web-vitals without the library; rejected — library is 1.5 KB brotli'd and handles edge cases like BFCache, page-prerender lifecycle correctly).

### D11 — Activity mount-limit diagnosis-driven fix (may include reducing to 1) [DIRECTED]

**Decision:** Phase 3 diagnosis will determine whether to reduce `ACTIVITY_MOUNT_LIMIT` from 3 to 1 or implement finer-grained Activity mount destruction. The instrumentation added in F10 will produce the evidence.

**Status:** DIRECTED — the team's intent is "fix S2 per evidence from the new toolkit," the specific lever is determined by what the instrumentation reveals.

### D12 — Deferred WYSIWYG mount for large docs (may be the S1 + S3 fix) [DIRECTED]

**Decision:** Per precedent #18, both TipTap and CodeMirror editors are pre-mounted in each Activity entry with `display:none` toggle. Diagnosis will determine if this pre-mount is the cold-load + mode-toggle bottleneck. If so, the fix is to defer-mount the non-active editor (cold mount on first mode toggle, not at Activity mount).

**Status:** DIRECTED — team intent is "apply the architecturally-correct fix based on what the instrumentation reveals, without regressing precedent #18's content-continuity promise."

**STOP rule to include in CLAUDE.md precedent #20 if this fix lands:** _"Pre-mounting both editors concurrently (precedent #18(b)) is the default for small-to-medium docs. For docs above N-MB threshold, the non-active editor defer-mounts to avoid the S1 cold-load and S3 toggle-layout costs. The threshold and trigger live in `<EditorActivityPool>`."_

---

## §7 Acceptance Criteria

### AC — Infrastructure (F1–F25)

- [ ] **AC1** All emission-layer files (F1-F6) exist at `packages/app/src/lib/perf/` with passing unit tests.
- [ ] **AC2** `mark()` calls produce Chrome DevTools Performance panel custom tracks under the `ok/` namespace, verified by opening a live recording in DevTools after running a scenario.
- [ ] **AC3** `<ProfilerBoundary>` emits `ok/render/<name>` marks with non-null `actualDuration` / `baseDuration` in dev mode; no-op behavior in production build (verified by build output inspection).
- [ ] **AC4** `initWebVitals()` emits `ok/vitals/inp`, `ok/vitals/lcp`, `ok/vitals/cls`, `ok/vitals/fcp` marks after corresponding events during a scenario run.
- [ ] **AC5** `window.__ok_perf` collector is present in dev, `undefined` in production (verified by `import.meta.env` inspection in built artifact).

### AC — Target-surface instrumentation (F7–F14)

- [ ] **AC6** `main.tsx` calls `initWebVitals()` conditional on `import.meta.env.DEV`.
- [ ] **AC7** Top-level `<ProfilerBoundary name="app">` wraps `<App />` in `App.tsx`.
- [ ] **AC8** `<ProfilerBoundary>` wraps `EditorArea`, `EditorActivityPool`, `FileSidebar`, `OutlinePanel`.
- [ ] **AC9** `sync-promise.ts` emits marks at create / resolve / reject / timeout.
- [ ] **AC10** `DocumentContext.tsx` emits marks on `openDocument` / `openDocumentTransition` / transition-settled.
- [ ] **AC11** `OutlinePanel.tsx` has no `refetchInterval` — replaced with provider-update-event invalidation.

### AC — Scenario framework (F15–F23)

- [ ] **AC12** `bun run perf:profile --scenario=cold-load-big-doc` reproduces S1 — outputs JSON with `coldLoadMs >= 10000` on the pre-fix baseline (asserts the symptom exists before the fix).
- [ ] **AC13** `bun run perf:profile --scenario=warm-switch` reproduces S2 — outputs JSON with `warmSwitchMs >= 500` on pre-fix baseline.
- [ ] **AC14** `bun run perf:profile --scenario=mode-toggle` reproduces S3 — outputs JSON with `modeToggleLayoutMs >= 300` on pre-fix baseline.
- [ ] **AC15** `bun run perf:profile --scenario=outline-polling` measures S4 — outputs JSON with `apiCallCount >= 10` over 30s idle on pre-fix baseline.
- [ ] **AC16** Each scenario produces `packages/app/tests/perf/results/<scenario>.<timestamp>.json` with shape documented in the README.
- [ ] **AC17** `packages/app/tests/perf/baselines/2026-04-19.json` captures pre-fix numbers.
- [ ] **AC18** `packages/app/tests/perf/README.md` documents authoring, running, interpreting.

### AC — Fixes

- [ ] **AC19** S4 fix — `outline-polling` scenario post-fix: `apiCallCount === 0` over 30s idle. Invalidation fires on content mutation.
- [ ] **AC20** S1 fix — `cold-load-big-doc` scenario post-fix: either (a) `coldLoadMs < 5000`, OR (b) documented as architecturally-bounded with evidence.
- [ ] **AC21** S2 fix — `warm-switch` scenario post-fix: `warmSwitchMs < 100`.
- [ ] **AC22** S3 fix — `mode-toggle` scenario post-fix: either (a) `modeToggleLayoutMs < 300`, OR (b) documented as architecturally-bounded.
- [ ] **AC23** Post-fix baselines captured at `packages/app/tests/perf/baselines/<date>.json`; CHANGELOG entry explains what changed.

### AC — Quality gates + docs

- [ ] **AC24** `bun run check` green (lint + typecheck + unit + integration + fidelity).
- [ ] **AC25** `bun run check:full:parallel` green (adds stress, fuzz, e2e).
- [ ] **AC26** CLAUDE.md precedent #20 appended with the text from F25.
- [ ] **AC27** `packages/app/tests/perf/README.md` cross-references `reports/perf-profiling-landscape-2026/` + precedent #20.
- [ ] **AC28** No regressions in existing Playwright E2E suite (`packages/app/tests/stress/*.e2e.ts`).

---

## §8 Test Plan

| Layer | What | Where |
|---|---|---|
| **Unit** | `mark()` produces correct `detail.devtools` shape; namespace validation | `packages/app/src/lib/perf/mark.test.ts` |
| **Unit** | `<ProfilerBoundary>` calls `onRender`; routes through `mark()` with correct name | `packages/app/src/lib/perf/profiler-boundary.test.tsx` |
| **Unit** | `initWebVitals()` subscribes to all four vitals; collector captures events | `packages/app/src/lib/perf/web-vitals.test.ts` |
| **Unit** | Collector dev-only gate; production build excludes | `packages/app/src/lib/perf/collector.test.ts` |
| **Integration** | Scenario shape: `profile.ts --scenario=<name>` produces valid JSON | `packages/app/tests/perf/scenarios/*.ts` runs against dev server |
| **E2E** | Full scenario run against dev server reproduces symptoms | Scenarios produce repro data matching §1 symptom table |
| **Regression** | OutlinePanel invalidation: simulate CC1/update event → query re-fetches | `packages/app/src/components/OutlinePanel.test.tsx` (new or extended) |
| **Manual/QA** | Run each scenario pre-fix + post-fix → verify AC12-15 + AC19-22 | Phase 7 QA |

---

## §9 Failure Modes

| ID | Mode | Mitigation |
|---|---|---|
| FM1 | Scenario flakes on different hardware | Baselines are descriptive not gated (D3). CHANGELOG notes hardware class. |
| FM2 | Post-fix regression in other editor area | AC24 `bun run check` + AC25 `check:full:parallel` must be green. Playwright E2E suite covers other UX. |
| FM3 | Production build accidentally includes dev-only collector | AC5 asserts it's not present; CI lint can grep for `__ok_perf` outside `import.meta.env.DEV` guards. |
| FM4 | `<ProfilerBoundary>` overhead impacts dev UX | React Profiler is meant for dev; only wrap top-level surfaces (4-6 places), not every component. |
| FM5 | `web-vitals` package upgrade breaks INP semantics | Pin to exact v5.x version; document upgrade re-test in README. |
| FM6 | `OutlinePanel` invalidation fires too aggressively during typing | Debounce 300 ms (matches TYPING_DEFER_MS precedent). Scenario asserts quiet behavior during active typing. |

---

## §10 Non-Goals

Per §4 but summarized:

1. **No CI gating.** The scenarios are local-dev only. CI gate is a future spec.
2. **No OTel, Pyroscope, Sentry, Datadog wiring.** Not needed for local diagnosis.
3. **No memory profiling.** No confirmed memory issue.
4. **No bundle analyzer.** Bundle size is acceptable.
5. **No backend Bun profiling wiring.** On-demand via one-liner flags; not a durable tooling gap.
6. **No `react-scan` / `bippy` / `million` dep.** Use via `npx` on-demand per React DevTools Profiler gap.

---

## §11 Dependencies to add

- `web-vitals@^5.0.0` as devDependency in `packages/app/package.json`.
- No other new deps.

---

## §12 Implementation phases (Phase 3 breakdown)

| Step | Work |
|---|---|
| 3.1 | Build emission layer (F1–F6) + tests |
| 3.2 | Build scenario framework (F15–F18) |
| 3.3 | Write 4 scenarios (F19–F22) |
| 3.4 | Wire instrumentation into target surfaces (F7–F14, minus OutlinePanel fix) |
| 3.5 | Run all 4 scenarios → capture **pre-fix baseline** (F23 `2026-04-19.json`) |
| 3.6 | Diagnose S1 + S2 + S3 via traces → identify root causes with evidence |
| 3.7 | Apply F26–F28 fixes based on diagnosis |
| 3.8 | Apply F29 fix (OutlinePanel → provider-update) |
| 3.9 | Re-run all 4 scenarios → capture **post-fix baseline** |
| 3.10 | Verify `bun run check` + `bun run check:full:parallel` green |
| 3.11 | Add turbo task (F24), package.json script, web-vitals dep |
| 3.12 | Add CLAUDE.md precedent #20 (F25) |

---

## §13 Changelog

- **2026-04-19** — Initial draft. Scoped from prior research (`reports/perf-profiling-landscape-2026/`), prior plan file (`.claude/plans/enchanted-greeting-russell.md`), and Playwright CDP trace findings (`/tmp/ok-perf/FINDINGS.md`). Headless /ship auto-confirmed as approved.

---

## §14 References

- **Research landscape:** `reports/perf-profiling-landscape-2026/REPORT.md` (10-dimension 3P factual survey)
- **Prior findings:** `/tmp/ok-perf/FINDINGS.md` (4 latency symptoms with measurements)
- **Structural precedent:** `packages/core/tests/perf/README.md` (R4 gate directory — mirrored shape)
- **Related precedents (CLAUDE.md):** #9 (schema-add-only), #11 (CRDT minimal mutation), #13 (bridge invariants auto-enforced), #18 (hybrid Activity + Suspense — directly implicated by S2/S3)
- **External:**
  - React 19.2 Performance Tracks — https://react.dev/reference/dev-tools/react-performance-tracks
  - Chrome DevTools Extensibility API — https://developer.chrome.com/docs/devtools/performance/extension
  - `web-vitals` library — https://github.com/GoogleChrome/web-vitals
  - tldraw playwright-perf lessons — GH #7595
