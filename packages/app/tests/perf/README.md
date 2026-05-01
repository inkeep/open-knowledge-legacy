# Perf scenario framework — authoring guide

How to add, run, and interpret full-browser perf scenarios for the Open Knowledge editor. This directory ships the local-dev diagnostic toolkit: emission layer (`packages/app/src/lib/perf/`) + scenario driver + 4 reproduction scenarios for the cold-load, warm-switch, mode-toggle, and outline-polling symptoms.

**Not a CI gate.** Baselines here are descriptive snapshots for diagnosis, not pass/fail thresholds. The tldraw `playwright-perf` harness lesson (removed upstream) is the cautionary case: gating before a scenario reliably reproduces locally produces false failures that erode trust. Turn perf scenarios into CI gates only once a follow-up spec establishes stability across runner classes.

Parallels the shape of `packages/core/tests/perf/` (the R4 markdown-bench gate) — different measurement need (full-browser scenarios vs. micro-bench), same ergonomic contract.

See also:
- `reports/perf-profiling-landscape-2026/` — 3P ecosystem survey + tool selection rationale
- `specs/2026-04-19-perf-diagnostic-toolkit/SPEC.md` — what we're building + why (post-fix baseline at `baselines/2026-04-19-postfix.json`)
- `CLAUDE.md` precedent #24 — "Perf instrumentation as first-class" (the authoring contract: wrap new perceived-perf surfaces in `<ProfilerBoundary>`, emit `mark('ok/<subsystem>/<event>', …)`, reproduction scripts go here, never in `/tmp`). This precedent was added in US-010 with the SPEC §F25 text, renumbered to #24 because precedents #20–#23 landed in parallel with this spec's execution.
- `CLAUDE.md` precedent #18 — hybrid Activity + Suspense + `use(promise)`; S2 / S3 are direct consequences of the pre-mount-both pattern, and #24's defer-mount STOP rule is the per-doc-size exception.

---

## Contents

1. [What's in this directory](#whats-in-this-directory)
2. [Running a scenario](#running-a-scenario)
3. [Authoring a new scenario](#authoring-a-new-scenario)
4. [Result JSON shape](#result-json-shape)
5. [Interpretation tips](#interpretation-tips)
6. [Troubleshooting](#troubleshooting)

---

## What's in this directory

| File | Role |
|---|---|
| `profile.ts` | CLI driver. `bun run tests/perf/profile.ts --scenario=<name>` launches Playwright + CDP tracing and runs the named scenario. Writes `results/<scenario>.<timestamp>.json`. Standalone Bun entry point; no `@playwright/test` runner. |
| `lib/scenario.ts` | `defineScenario({ name, run })` contract + shared types (`ScenarioCtx`, `ScenarioResult`, `PerfMarkRecord`, `WebVitalRecord`, `NetworkRequestRecord`). |
| `lib/cdp-tracer.ts` | CDP `Tracing.start/end` wrapper + pure `aggregateTrace(events)` aggregation. |
| `lib/cdp-tracer.test.ts` | Unit tests for the aggregation logic (no browser / CDP required). |
| `scenarios/*.ts` | Reproduction scenarios. Each module default-exports a `ScenarioDefinition`. |
| `baselines/<date>.json` | Dated descriptive snapshots. Read for diagnosis, NOT enforced as a CI gate. |
| `results/` (gitignored) | Per-run outputs. Filename pattern: `<scenario>.<iso-timestamp>.json`. |

---

## Running a scenario

**Pre-requisite.** A dev server must be reachable at the `--target` URL (default `http://localhost:5173`). `bun run dev` in a separate terminal works; so does `open-knowledge start` pointed at the same content directory.

```bash
# From packages/app:
bun run perf:profile -- --scenario=cold-load-big-doc
bun run perf:profile -- --scenario=warm-switch

# Equivalent direct invocation (skip the turbo wrapper):
bun run tests/perf/profile.ts --scenario=cold-load-big-doc
```

Flags:

| Flag | Default | Purpose |
|---|---|---|
| `--scenario=<name>` | *(required)* | Loads `./scenarios/<name>.ts` |
| `--target=<url>` | `http://localhost:5173` | Base URL for the dev server |
| `--out=<dir>` | `./results` | Results directory |
| `--headed` | (headless) | Launch with a visible browser window. Equivalent to `OK_PERF_HEADED=1` in the env. Use for paint/GPU diagnosis (S1/S3) where the headless browser drops some events. |
| `--headless` | (default) | Launch without a visible browser window. Default since multi-cell sweeps that lose foreground focus while headed get caught by Chromium's setTimeout/rAF throttle and turn into false-positive cold-load timeouts. |
| `--viewport=WxH` | `1440x900` | Viewport; use for reproducing resize-sensitive symptoms |

Exit codes:

- `0` — scenario completed; result JSON written
- `1` — usage error (bad flag, missing scenario file)
- `2` — scenario threw; result JSON written with `error` field for inspection

---

## Authoring a new scenario

A scenario is one file at `scenarios/<slug>.ts`. It default-exports `defineScenario(...)`.

Minimal template:

```typescript
import { defineScenario } from '../lib/scenario';

export default defineScenario({
  name: 'my-new-scenario',
  description: 'One sentence describing what this reproduces',

  async run(ctx) {
    const { page, opts, recordMetric, note } = ctx;

    // Drive the browser however you need:
    await page.goto(`${opts.target}/#/README`, { waitUntil: 'domcontentloaded' });
    const start = performance.now();
    await page.locator('.ProseMirror').waitFor({ state: 'visible', timeout: 30_000 });
    const elapsed = performance.now() - start;

    // Record scenario-specific metrics — these get merged under `result.metrics`:
    recordMetric('visibleMs', elapsed);

    // Free-form notes show up under `result.notes`:
    if (elapsed > 5000) note('warning: slow visible-time — investigate cold-load diagnosis');
  },
});
```

Rules of the road:

1. **One scenario file per symptom.** Scenarios are diagnostic probes, not test harnesses — each targets one user-facing symptom.
2. **No retries, no worker parallelism.** The driver is intentionally single-threaded. Variance is data, not noise to be averaged away.
3. **No hard-fail asserts inside `run()`.** If an assumption doesn't hold (PROJECT.md missing, dev server unreachable), `note()` it and return — the result JSON is still useful context. Throws get written to `result.error` so CI artifacts remain debuggable.
4. **Use the collector for semantic events, not ad-hoc `console.log`.** `mark('ok/<subsystem>/<event>', ...)` from `packages/app/src/lib/perf/` routes into both Chrome DevTools custom tracks and `globalThis.__ok_perf.marks`, which the driver drains into the result JSON.
5. **Use `recordMetric()` for symptom-specific numbers.** Standard numbers (wall-clock, long tasks, layout/style ms) are captured automatically from the CDP trace.
6. **Headless by default; opt into headed.** Multi-cell sweeps that lose foreground focus mid-run get throttled by Chromium (`setTimeout`/`rAF` ticks stretch past 1 s once the window is backgrounded), so headed runs produce false-positive cold-load timeouts during long sweeps. Use `--headed` (or `OK_PERF_HEADED=1`) for single-scenario paint/GPU diagnosis where you need a real display, but expect to sit in front of the window for the duration.

---

## Result JSON shape

```json
{
  "scenario": "cold-load-big-doc",
  "description": "S1: cold load of PROJECT.md",
  "metadata": {
    "bunVersion": "1.3.11",
    "nodeVersion": "22.9.0",
    "platform": "darwin-arm64 (host.local)",
    "commitSha": "e86a0505",
    "capturedAt": "2026-04-19T04:04:45.123Z",
    "targetUrl": "http://localhost:5173",
    "headed": true,
    "viewport": { "width": 1440, "height": 900 }
  },
  "wallClockMs": 20214.32,
  "trace": {
    "eventCount": 184521,
    "longTaskCount": 1,
    "longestTaskMs": 15840.11,
    "taskDurationMs": 17210.66,
    "styleMs": 98.44,
    "layoutMs": 220.13,
    "scriptMs": 14980.22,
    "paintEvents": 7,
    "userTimingMarkCount": 42,
    "lastLcpMs": 19820.4,
    "cumulativeLayoutShift": 0.0123
  },
  "marks": [
    { "name": "ok/nav/hash-change", "startTime": 12.3, "duration": 0, "track": "ok/nav", "properties": { "docName": "PROJECT" } },
    { "name": "ok/render/editor-area", "startTime": 340.1, "duration": 15812.5, "track": "ok/render", "properties": { "phase": "mount" } }
  ],
  "onRender": [
    { "id": "editor-area", "phase": "mount", "actualDuration": 15812.5, "baseDuration": 14200.0, "startTime": 340.1, "commitTime": 16152.6 }
  ],
  "vitals": [
    { "name": "LCP", "value": 19820.4, "rating": "poor", "delta": 19820.4, "id": "v5-..." }
  ],
  "networkRequests": [
    { "url": "http://localhost:5173/", "method": "GET", "status": 200, "resourceType": "document", "ms": 42.1 }
  ],
  "consoleErrors": [],
  "metrics": {
    "visibleMs": 20214.3
  },
  "notes": []
}
```

Field notes:

- `wallClockMs` — `performance.now()` delta around `scenario.run()`. Includes browser launch teardown if anything throws late.
- `trace.*` — aggregated from CDP `Tracing.dataCollected` over the run. The raw events are dropped; the summary is enough for symptom diagnosis.
- `trace.longTaskCount` — ≥ 50ms `RunTask` events (Web Perf Working Group threshold).
- `marks` — drained from `globalThis.__ok_perf.marks`. Each mark that started with `ok/render/*` is also reflected into `onRender` in the structured React-Profiler shape.
- `vitals` — `web-vitals` events; `onINP`, `onLCP`, `onCLS`, `onFCP` subscribed via `initWebVitals()` in `main.tsx`.
- `metrics` — scenario-specific numbers (`warmSwitchMs`, `apiCallCount`, etc.) captured via `ctx.recordMetric(...)`.

---

## Interpretation tips

**Long task dominates wall-clock?** The blocking is one synchronous task. Check `trace.longestTaskMs` and look at `onRender[]` — the highest-`actualDuration` render inside that window is the culprit. Reproduces across runs? Real architectural cost. Varies wildly? Measurement noise; repeat 3 runs before concluding.

**`trace.layoutMs + trace.styleMs` is most of wall-clock?** Browser is doing deferred layout / style recalc. Common cause: large DOM subtree transitioning from `display:none` to visible (precedent #18 hybrid render tree's mode-toggle flip). Fix by defer-mounting the hidden subtree, not flipping visibility.

**Every render on mount?** React's first commit post-hydration. `ok/render/*` marks should show `phase: 'mount'` once per wrapped boundary. If you see dozens of `update` phases during an idle period, something's thrashing state — diff the marks against the user action that should have triggered them.

**`networkRequests` shows polling?** Count `/api/page-headings` calls over an idle window. Polling = outline-panel or CC1-broadcaster not wired correctly. See S4 for the reference fix.

**`consoleErrors` populated?** Non-fatal browser errors. Worth reading — may be unrelated, may correlate with blocking (e.g. a failing observer throwing inside a hot path).

**`vitals.INP` reading poor?** Interaction to Next Paint — only meaningful if the scenario performed an interaction the user would feel. Diagnostic: check the `trace.longTaskCount` inside the interaction window.

---

## Troubleshooting

**Dev server not running.** `profile.ts` goes to `--target`; if nothing responds, Playwright throws `net::ERR_CONNECTION_REFUSED` inside `page.goto`. Start `bun run dev` (or `open-knowledge start`) in a separate terminal first.

**`CDPSession.send('Tracing.start')` fails with "already started".** A previous run left CDP in a dirty state — usually means a scenario threw mid-run before `traceEnd`. Close any stray Chromium windows and re-run. Playwright's Browser.close() in the driver's `finally` usually cleans this up.

**`cdp.send('Network.enable')` fails.** The test harness only enables this after `context.newCDPSession(page)` — if you see failures here, the page closed before the CDP session attached. Check `page.isClosed()` in your scenario.

**Scenario file exists but driver reports "did not default-export a valid ScenarioDefinition".** The module was imported but `default` was undefined or missing `.run`. Confirm the file:
```typescript
export default defineScenario({ ... });  // NOT `export const scenario = ...`
```

**Result JSON is missing `marks`/`vitals`.** The dev server must have the emission layer wired (US-004 / `initWebVitals()` called from `main.tsx`) AND the scenario must run against the dev build, not a production build. In production, `globalThis.__ok_perf` is intentionally absent (zero buffer overhead).

**Scenario passed but the symptom didn't reproduce.** Expected under varying load. Perf scenarios are diagnostic, not deterministic. Re-run with the same viewport + headed mode. If the symptom reproduces only sometimes, that IS the signal — log the ratio.

---

## Cross-references

- Emission layer (the `mark()` / `<ProfilerBoundary>` / `initWebVitals` APIs): `packages/app/src/lib/perf/`
- Structural precedent (micro-bench R4 gate): `packages/core/tests/perf/README.md`
- `CLAUDE.md` precedent #24 — "Perf instrumentation as first-class" (the authoring contract: surfaces that must be instrumented, `ok/<subsystem>/<event>` namespace, defer-mount STOP rule, no-CI-gating STOP rule)
- `reports/perf-profiling-landscape-2026/` — 3P landscape survey
