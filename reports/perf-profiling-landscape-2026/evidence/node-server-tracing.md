# Evidence: D7 — Node.js tracing for long-lived WebSocket servers

**Dimension:** D7 — Tools and techniques best-in-class for profiling a Node.js 22/24 long-lived WebSocket server (like Hocuspocus) in late 2025 / early 2026.
**Date:** 2026-04-19
**Sources:** clinic.js repo, 0x repo, Node.js docs, Grafana Pyroscope, Sentry profiling docs, Datadog profiling docs, OpenTelemetry JS status, Bun release notes 1.3.7 / 1.3.9, autocannon, Artillery ws engine docs

---

## Key pages referenced

- https://github.com/clinicjs/node-clinic
- https://github.com/davidmarkclements/0x
- https://nodejs.org/api/perf_hooks.html
- https://nodejs.org/learn/diagnostics/memory/using-heap-snapshot
- https://grafana.com/docs/pyroscope/latest/configure-client/language-sdks/nodejs/
- https://docs.sentry.io/platforms/javascript/guides/node/profiling/
- https://docs.datadoghq.com/profiler/enabling/nodejs/
- https://opentelemetry.io/docs/languages/js/
- https://bun.com/blog/bun-v1.3.7
- https://bun.com/blog/bun-v1.3.9
- https://bun.sh/docs/runtime/debugger
- https://www.artillery.io/docs/reference/engines/websocket
- https://github.com/mcollina/autocannon

---

## Findings

### Finding: clinic.js is officially not actively maintained as of 2025/2026

**Confidence:** CONFIRMED

**Evidence:**
- https://github.com/clinicjs/node-clinic (README, fetched 2026-04-19) — README prominently states: *"Clinic.js is not being actively maintained. Due to its strong ties to Node.js internals, it may not work or the results you get may not be accurate."*
- Last release: v13.0.0, 2023-06-28 (~3 years stale as of the 2026 fetch).
- Supported Node range (stated): `>= 16`. No claimed support for Node 22/24.
- Sub-tools listed in README: Doctor (heuristic diagnosis), Bubbleprof (async I/O latency), Flame (flamegraph), Heap Profiler (memory).
- Repo moved from `nearform/clinic` to `clinicjs/node-clinic`. The old URL 404s; the new one hosts the deprecation notice.

**Implications:** clinic.js is effectively archived. Any new Node.js profiling toolchain for 2026 should not depend on it.

---

### Finding: 0x is maintained, targets Node only (no Bun support)

**Confidence:** CONFIRMED

**Evidence:**
- https://github.com/davidmarkclements/0x — v6.0.0 released 2025-07-07; stated support `Node v20.x and above`.
- No mention of Bun in the README. 0x uses the V8 tick processor under the hood and shells out to `node --perf-basic-prof` / `node --prof`, so it is intrinsically V8-bound.
- Produces a `<pid>.0x` directory containing `flamegraph.html`.

**Implications:** Viable for Node-only profiling runs; unusable against Bun.

---

### Finding: Node.js built-in `perf_hooks` exposes first-class event-loop and user-timing APIs

**Confidence:** CONFIRMED

**Evidence:**
- https://nodejs.org/api/perf_hooks.html — `PerformanceObserver`, `performance.timerify(fn)`, `monitorEventLoopDelay({ resolution })`.
- `monitorEventLoopDelay` returns an `IntervalHistogram` with `min/max/mean/stddev/percentile(n)` in nanoseconds:
  ```javascript
  import { monitorEventLoopDelay } from 'node:perf_hooks';
  const h = monitorEventLoopDelay({ resolution: 20 });
  h.enable();
  // ...
  h.disable();
  console.log(h.percentile(99));
  ```
- `performance.timerify(fn)` wraps sync or async functions and emits a `PerformanceEntry` of type `'function'` with `duration` on the Performance Timeline.

**Implications:** Built-in, zero-dependency; sufficient for event-loop delay SLOs and surgical function-level timing. Works regardless of external tool maintenance status.

---

### Finding: `v8.writeHeapSnapshot()` is the canonical Node.js API for programmatic heap dumps

**Confidence:** CONFIRMED

**Evidence:**
- https://nodejs.org/learn/diagnostics/memory/using-heap-snapshot — minimal API: `require('node:v8').writeHeapSnapshot();`
- Available since Node v11.13.0. A heap snapshot is per-V8 isolate (worker threads require separate invocations).
- Snapshot-time cost: *"Taking snapshots stops all main thread work (can take over a minute). Snapshots can double heap size."*
- Alternative: `--heapsnapshot-signal=SIGUSR2` (v12.0.0+) for external-signal-triggered dumps.

**Implications:** Correct default choice over the old `heapdump` npm package for Node 11+.

---

### Finding: Grafana Pyroscope is the actively-developed OSS continuous-profiling platform for Node; SDK publishes pprof to a server

**Confidence:** CONFIRMED

**Evidence:**
- https://grafana.com/docs/pyroscope/latest/configure-client/language-sdks/nodejs/ — install: `npm install @pyroscope/nodejs`; init:
  ```javascript
  const Pyroscope = require('@pyroscope/nodejs');
  Pyroscope.init({ serverAddress: 'http://pyroscope:4040', appName: 'myNodeService' });
  Pyroscope.start();
  ```
- https://github.com/grafana/pyroscope — latest release v1.21.0 on 2026-04-17 (active).
- Default `flushIntervalMs`: 60 seconds; heap sampling interval default: 524288 bytes between samples; max stack depth: 64.
- General continuous-profiling overhead claim (from Grafana intro docs): *"~2-5% depending on a few factors"* — flag as vendor-promoted.

**Implications:** Only open-source continuous profiler with active 2026 development and pprof interop.

---

### Finding: Sentry profiling-node is V8-only; will not run on Bun

**Confidence:** CONFIRMED

**Evidence:**
- https://docs.sentry.io/platforms/javascript/guides/node/profiling/ — *"The Sentry profiler uses V8's CpuProfiler to collect stack samples."*
- https://github.com/getsentry/sentry-javascript/issues/19726 — open feature request: profiling support in Bun.
- `@sentry/profiling-node` is a native Node add-on: *"won't run in environments like Deno or Bun"*.
- Sentry profiling is transaction-lifecycle, not always-on continuous; requires `profileSessionSampleRate` plus `profileLifecycle: 'trace'` or `'manual'`.
- Vendor-promoted about own product.

**Implications:** Not applicable to a Bun-runtime WebSocket server. Would require switching Hocuspocus to Node to use it.

---

### Finding: Datadog Node profiler is integrated in `dd-trace`, requires Node 18+, exports pprof

**Confidence:** CONFIRMED

**Evidence:**
- https://docs.datadoghq.com/profiler/enabling/nodejs/ — install: `npm install --save dd-trace@latest`; enable via `DD_PROFILING_ENABLED=true` or `require('dd-trace').init({ profiling: true })`.
- Requires Node.js 18+ and Datadog Agent v6+ (v7+ recommended).
- Collects CPU time, heap allocations, timeline events (via dd-trace-js docs); default profile cadence 65 seconds; pprof export to agent.
- Vendor-promoted about own product.

**Implications:** Commercial option if the stack is already on Datadog. Locks profiling into the Datadog pipeline.

---

### Finding: OpenTelemetry JS tracing + metrics are stable; logs are development; browser client remains experimental

**Confidence:** CONFIRMED

**Evidence:**
- https://opentelemetry.io/docs/languages/js/ — stability table: *traces — stable; metrics — stable; logs — development*. Also: *"Client instrumentation for the browser is experimental and mostly unspecified."*
- `@opentelemetry/auto-instrumentations-node` is the meta-package bundling Express/HTTP/MySQL/Postgres/Redis instrumentations and is 2.0-compatible (per npm listing).
- No first-party WebSocket auto-instrumentation in the default bundle — confirmed by web search; WebSocket instrumentation would need a contrib package or custom span emitter.
- Historical churn: `@opentelemetry/instrumentation-fastify` deprecated 2025-01, removed 2026-03 in favor of `@fastify/otel`.

**Implications:** OTel is a tracing/metrics layer (not a CPU profiler); stable on the backend for HTTP but not WebSocket out-of-box.

---

### Finding: Bun 1.3.7+ ships first-class CPU and heap profilers with Node-compatible output and flags

**Confidence:** CONFIRMED

**Evidence:**
- https://bun.com/blog/bun-v1.3.7 — flags: `--cpu-prof`, `--cpu-prof-md`, `--cpu-prof-name`, `--cpu-prof-dir`, `--heap-prof`, `--heap-prof-md`, `--heap-prof-dir`, `--heap-prof-name`. Output: Chrome DevTools-compatible `.cpuprofile` and `.heapsnapshot` (loadable in Chrome DevTools Performance / Memory tab).
- https://bun.com/blog/bun-v1.3.9 (2026-02-08) — added `--cpu-prof-interval` (microseconds, default 1000μs / 1ms) to match Node.js flag semantics. *"If used without `--cpu-prof` or `--cpu-prof-md`, Bun will emit a warning."*
- `node:inspector` Profiler API (promise form) works in Bun:
  ```javascript
  import inspector from "node:inspector/promises";
  const session = new inspector.Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.start");
  // ...
  const { profile } = await session.post("Profiler.stop");
  ```
- Supported methods: `Profiler.enable|disable|start|stop|setSamplingInterval`.
- https://bun.sh/docs/runtime/debugger — `bun --inspect script.ts` opens a WebKit Inspector Protocol WebSocket; debug at `https://debug.bun.sh`.

**Implications:** Bun can be profiled natively with Chrome DevTools without depending on V8-only ecosystem tooling. CPU profile interop with Node's `.cpuprofile` format is explicit.

---

### Finding: Artillery with `engine: ws` is the canonical WebSocket load-test tool; autocannon does not cover WebSocket

**Confidence:** CONFIRMED

**Evidence:**
- https://github.com/mcollina/autocannon — HTTP/1.1 (+ HTTP/2) benchmarking only; no WebSocket primitive.
- https://www.artillery.io/docs/reference/engines/websocket — `engine: ws` with five primitives: `connect`, `send`, `think`, `loop`, `function`. Example config (yaml): phases with `arrivalRate`, subprotocols, headers, flow with connect/send/loop. Metrics reported: `websocket.messages_sent`, `websocket.messages_received`, `websocket.send_rate`, `websocket.receive_rate`.

**Implications:** For a Hocuspocus-style server, Artillery is the in-class Node-ecosystem WebSocket load generator. A bespoke `ws`-based harness is the only alternative for CRDT-protocol-aware load.

---

## Terminology (D7)

- **pprof format:** Google protobuf profile format; interop standard for Datadog, Pyroscope, Go profiling toolchain.
- **WebKit Inspector Protocol (Bun):** JSC equivalent of Chrome DevTools Protocol; same on-wire debugger contract but different stack-sample internals, hence Sentry/V8-native add-ons do not cross over.
- **Continuous profiling:** Always-on, low-overhead sampling profiler that uploads profiles to a server on a regular cadence (typically 10–60s).

## Gaps / follow-ups

- No Bun-runtime continuous-profiling SDK exists (Pyroscope, Sentry, Datadog all V8-native). Open: is there an unofficial Bun Pyroscope wrapper?
- WebSocket auto-instrumentation in OpenTelemetry: no instrumentation in the default `@opentelemetry/auto-instrumentations-node` bundle.

## Sources (de-duped)

- https://github.com/clinicjs/node-clinic — clinic.js deprecation notice + Node >= 16 claim
- https://github.com/davidmarkclements/0x — 0x v6.0.0, Node 20+, no Bun
- https://nodejs.org/api/perf_hooks.html — PerformanceObserver, timerify, monitorEventLoopDelay
- https://nodejs.org/learn/diagnostics/memory/using-heap-snapshot — `v8.writeHeapSnapshot` flow + warnings
- https://grafana.com/docs/pyroscope/latest/configure-client/language-sdks/nodejs/ — Pyroscope Node SDK install + init
- https://github.com/grafana/pyroscope — v1.21.0 (2026-04-17), OSS activity
- https://docs.sentry.io/platforms/javascript/guides/node/profiling/ — V8 CpuProfiler dependence, trace vs manual lifecycle
- https://github.com/getsentry/sentry-javascript/issues/19726 — open Bun profiling request
- https://docs.datadoghq.com/profiler/enabling/nodejs/ — dd-trace profiling env vars, Node 18+
- https://opentelemetry.io/docs/languages/js/ — traces stable, metrics stable, logs development, browser experimental
- https://bun.com/blog/bun-v1.3.7 — `--cpu-prof`, `--heap-prof`, node:inspector Profiler API
- https://bun.com/blog/bun-v1.3.9 — `--cpu-prof-interval` (default 1000μs)
- https://bun.sh/docs/runtime/debugger — `bun --inspect`, WebKit Inspector Protocol
- https://github.com/mcollina/autocannon — HTTP-only benchmarking
- https://www.artillery.io/docs/reference/engines/websocket — Artillery `engine: ws` primitives
