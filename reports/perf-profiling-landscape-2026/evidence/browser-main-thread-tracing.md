# Evidence: D2 — Browser main-thread tracing

**Dimension:** D2 — Current best-in-class options for browser main-thread tracing of a React + editor workload in late 2025 / early 2026.
**Date:** 2026-04-19
**Sources:** Chrome Developer docs (Performance panel reference + Extensibility API), Perfetto docs, Chrome DevTools Protocol, Playwright docs, MDN Long Tasks / LoAF

---

## Key pages / files referenced

- https://developer.chrome.com/docs/devtools/performance
- https://developer.chrome.com/docs/devtools/performance/reference
- https://developer.chrome.com/docs/devtools/performance/extension
- https://chromedevtools.github.io/devtools-protocol/tot/Tracing/
- https://perfetto.dev/docs/
- https://perfetto.dev/docs/getting-started/other-formats
- https://playwright.dev/docs/api/class-browser
- https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming
- https://developer.chrome.com/docs/web-platform/long-animation-frames

---

## Findings

### Finding: Chrome DevTools Performance panel has eight default tracks plus a Custom Tracks slot gated by the Extensibility API

**Confidence:** CONFIRMED

**Evidence:**
- https://developer.chrome.com/docs/devtools/performance/reference — Default tracks: **Main**, **Network**, **Frames**, **Interactions**, **Layout shifts**, **Animations**, **GPU**, **Thread Pool**, **Timings**. The "Show Custom Tracks" setting "Enables custom tracks which can be customized further using the DevTools Extensibility API."
- Long tasks surface: "Long tasks are also highlighted with a red triangle, and with the part over 50 milliseconds shaded in red." Interactions >200 ms flagged with red triangle.
- FPS chart: red bars flag drop-to-harmful levels; 4× CPU throttling is a first-class toolbar control.

**Implications:** The Performance panel is the default interactive interface; React Performance Tracks surface as a custom track in this panel via the extensibility hook.

---

### Finding: Chrome DevTools Extensibility API (Chrome 134+ GA for `console.timeStamp`) is the canonical primitive that React 19.2 Performance Tracks build on

**Confidence:** CONFIRMED

**Evidence:**
- https://developer.chrome.com/docs/devtools/performance/extension — Two surfaces: **extended `console.timeStamp`** ("high-performance method for instrumenting applications and surfacing timing data exclusively to the Performance panel") and **User Timings API** (`performance.mark` / `performance.measure` with a `devtools` object in `detail`).
- `ExtensionTrackEntryPayload` shape: `{ dataType?: "track-entry", color?: DevToolsColor, track: string, trackGroup?: string, properties?: [string, string][], tooltipText?: string }`. `ExtensionMarkerPayload` for single-point markers: `{ dataType: "marker", color?, properties?, tooltipText? }`.
- Secondary: CSS Wizardry's 2025-07 primer and DebugBear's DevTools coverage describe the API as Chrome 128+/134+ shipping waves; framework uptake includes Angular.

**Implications:** Any editor-specific tracing (ProseMirror commit phases, CodeMirror view updates, Y.js observer fires) can ship as a native custom DevTools track by wrapping calls in `performance.measure` with the `devtools` detail shape, no extension install required.

---

### Finding: Perfetto is Chromium's canonical tracing backend; `chrome://tracing` is deprecated and `ui.perfetto.dev` opens the same JSON traces DevTools records

**Confidence:** CONFIRMED

**Evidence:**
- https://perfetto.dev/docs/ — "Perfetto is an open-source suite of SDKs, daemons and tools which use **tracing** to help developers understand the behaviour of the complex systems." Chrome browser traces are an officially supported use case; "_Chrome JSON format_" is an accepted input at `ui.perfetto.dev`.
- https://perfetto.dev/docs/getting-started/other-formats — "The Chrome JSON trace format consists of a JSON array of event objects." "The 'Performance' panel in modern Chrome DevTools can still export profiles in this JSON format." Caveat: Perfetto "aims to adhere to the Trace Event Format specification" but "does not attempt to replicate specific rendering quirks or undocumented behaviors of the legacy chrome://tracing tool."
- Perfetto includes a "Powerful, SQL-based analysis library for programmatically analyzing large amounts of complex, interconnected data on a timeline."
- CDP stream format defaults to JSON but the protocol notes "the JSON format will be deprecated soon" (see next finding); native format is protobuf.

**Implications:** A single trace recording can be viewed interactively in DevTools Performance panel and SQL-queried in Perfetto trace processor — same artifact, different analysis lens. Protobuf is Chrome's internal format; JSON is the interchange path (and is on a deprecation track per the CDP spec).

---

### Finding: Chrome DevTools Protocol `Tracing.start` takes a categories filter string; the "web perf baseline" category set is convention, not a protocol default

**Confidence:** CONFIRMED (API shape), UNCERTAIN (canonical category string)

**Evidence:**
- https://chromedevtools.github.io/devtools-protocol/tot/Tracing/ — `Tracing.start` parameters: `categories` (string, "Category/tag filter"), `options`, `bufferUsageReportingInterval`, `transferMode` (default `ReportEvents`, alt `ReturnAsStream`), `streamFormat` (default `json`, alt `proto`), `streamCompression`, `traceConfig`, `perfettoConfig` (base64 protobuf), `tracingBackend` (default `auto`). "the JSON format will be deprecated soon."
- The protocol documentation explicitly **does not specify a recommended default category set**.
- Convention (secondary): `"Web developer"` preset in DevTools maps to the `devtools.timeline,blink.user_timing,loading,v8,cc,gpu,disabled-by-default-devtools.timeline` family. Wikimedia's phab ticket and Puppeteer's defaults use similar composites. No authoritative Chromium-sourced mapping retrieved in this pass.

**Implications:** Downstream tools (Playwright's `browser.startTracing`, Puppeteer's `tracing.start`) each carry their own default category set; the CDP itself does not prescribe one.

---

### Finding: Playwright ships two parallel tracing surfaces — `browser.startTracing()` (CDP Tracing, Chromium-only, Chrome-DevTools-compatible JSON) and `context.tracing.start()` (Playwright harness)

**Confidence:** CONFIRMED

**Evidence:**
- https://playwright.dev/docs/api/class-browser — "This API controls Chromium Tracing which is a low-level chromium-specific debugging tool." Signature `browser.startTracing(page, { categories?, path?, screenshots? })`; `browser.stopTracing()` returns `Promise<Buffer>` with trace data. Output "can be opened in Chrome DevTools performance panel." Docs do **not** specify the default category list.
- Playwright tracing (`context.tracing.start({ screenshots, snapshots })`) is a higher-level harness for Playwright's own trace viewer, not Chrome-compatible.
- Playwright 1.37+ auto-starts the harness trace when connecting over CDP (secondary).

**Implications:** Two non-overlapping concerns: CI reproduction artifacts (Playwright harness) vs. raw main-thread traces for perf analysis (CDP path). Same process can produce both.

---

### Finding: Long Task API (`'longtask'`) with TaskAttributionTiming is the shipped standard for 50 ms+ task detection; Long Animation Frames API (`'long-animation-frame'`) is the superset update targeting INP

**Confidence:** CONFIRMED

**Evidence:**
- https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming — `PerformanceObserver` with `{ entryTypes: ['longtask'] }` (or `type: 'longtask'` + `buffered: true`); 50 ms threshold with 1 ms granularity. `TaskAttributionTiming.containerType` values: `"iframe" | "embed" | "object" | "window"`.
- https://developer.chrome.com/docs/web-platform/long-animation-frames — "The Long Animation Frames API (LoAF — pronounced Lo-Af) is an update to the Long Tasks API to provide a better understanding of slow user interface (UI) updates."
- Observe: `observer.observe({ type: 'long-animation-frame', buffered: true })`; feature-detect via `PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')`.
- "The most obvious use case for the Long Animation Frames API is to help diagnose and fix Interaction to Next Paint (INP) issues."
- Shipped in Chrome/Edge 123 (2024); not in Firefox or Safari as of this pass's sources.

**Implications:** For editor workloads, LoAF captures the cumulative cost of many sub-50 ms tasks inside a single animation frame (a common ProseMirror/CodeMirror pattern) that `longtask` misses. Chromium-only; web.dev framing positions it alongside INP measurement.

---

### Finding: Headless Chrome drops compositor/GPU/paint surfaces that appear in headed mode, affecting trace interpretation

**Confidence:** UNCERTAIN — NOT FOUND (primary-source)

**Evidence:**
- No primary source retrieved in this pass on exact headless vs. headed trace-category delta. Nolan Lawson's guide does not address the distinction. Playwright docs describe `browser.startTracing` without headed/headless caveat.

**Implications:** Flagged as a gap for follow-up; Chrome's `new-headless` (since Chrome 128) is widely reported (secondary) to close most of the historical GPU/paint delta, but this was not primary-source verified.

---

### Finding: For editor-specific workload categories (ProseMirror DOM mutations, CodeMirror view updates, Y.js observer fires) there is no canonical CDP category string — they fall under `devtools.timeline` + user-timing marks

**Confidence:** UNCERTAIN — NOT FOUND (primary-source)

**Evidence:**
- CDP protocol docs do not enumerate categories that specifically tag DOM-mutation-heavy or editor-workload events.
- `blink.user_timing` carries `performance.measure`/`performance.mark` entries, which is the conventional instrumentation point for editor internals. React 19.2 Performance Tracks are emitted via the same extensibility-API path, meaning ProseMirror/CodeMirror/Y.js could instrument the same way.

**Implications:** No off-the-shelf single category captures editor internals — instrumentation is on the application.

---

## Terminology (D2)

- **CDP** (Chrome DevTools Protocol): the JSON-RPC-ish protocol Chrome DevTools, Playwright, Puppeteer, and Chrome Recorder all speak.
- **Perfetto**: Chromium's tracing SDK + trace processor + UI at ui.perfetto.dev; SQL-queryable analysis backend for trace files.
- **Extensibility API** (Chrome DevTools): the `performance.measure({detail:{devtools:{track: "MyTrack"}}})` + extended `console.timeStamp` surface that lets userland emit custom Performance-panel tracks.
- **LoAF** (Long Animation Frames API): Chrome 123+ update to Long Tasks that measures entire frames ≥50 ms with richer script attribution, purpose-built for INP diagnosis.
- **Trace Event Format**: the JSON array-of-event-objects format originally from `chrome://tracing`; spec Perfetto aims to adhere to for interop. CDP streamFormat `json` emits it. CDP spec notes JSON "will be deprecated soon."

## Gaps / follow-ups

- What exact category string does Chrome DevTools' own "Web developer" preset send? (Not primary-source confirmed — conventional wisdom is `devtools.timeline,blink.user_timing,loading,v8,cc,gpu,disabled-by-default-devtools.timeline` but no Chromium source page retrieved.)
- Primary-source headed vs. headless trace delta.
- Whether the CDP JSON deprecation path has a concrete sunset version announced.
- Whether any editor framework (ProseMirror, CodeMirror, Y.js) ships first-party DevTools custom tracks; first-pass search found only Angular cited as a framework using the extensibility API.

## Sources (de-duped)

- https://developer.chrome.com/docs/devtools/performance — Performance panel overview
- https://developer.chrome.com/docs/devtools/performance/reference — Default track list, long-task/interaction thresholds, Custom Tracks setting
- https://developer.chrome.com/docs/devtools/performance/extension — Extensibility API: `console.timeStamp` + `performance.measure` devtools-detail shape
- https://chromedevtools.github.io/devtools-protocol/tot/Tracing/ — CDP `Tracing.start` parameters, JSON-deprecation note
- https://perfetto.dev/docs/ — Perfetto overview; SQL trace processor; Chrome-tracing relationship
- https://perfetto.dev/docs/getting-started/other-formats — Chrome JSON trace format compatibility
- https://playwright.dev/docs/api/class-browser — `browser.startTracing`/`stopTracing` signatures, Chromium-only scope
- https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming — `'longtask'` + `TaskAttributionTiming`
- https://developer.chrome.com/docs/web-platform/long-animation-frames — LoAF API, INP diagnosis positioning, Chrome 123 shipped
