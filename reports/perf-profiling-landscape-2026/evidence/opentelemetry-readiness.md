# Evidence: D10 — OpenTelemetry readiness (frontend + Node)

**Dimension:** D10 — Production-readiness and tooling landscape for OpenTelemetry in a Node.js server + browser frontend stack in late 2025 / early 2026.
**Date:** 2026-04-19
**Sources:** opentelemetry.io status + docs, OTel profiling alpha announcement, The New Stack interview with OTel Browser SIG, Sentry OTLP docs, Datadog OTel docs, Elastic APM browser blog, opentelemetry-instrumentation-ws package

---

## Key pages referenced

- https://opentelemetry.io/status/
- https://opentelemetry.io/docs/languages/js/
- https://opentelemetry.io/docs/languages/js/getting-started/browser/
- https://opentelemetry.io/blog/2026/profiles-alpha/
- https://www.polarsignals.com/blog/posts/2026/03/26/opentelemetry-profiling-goes-alpha
- https://github.com/open-telemetry/opentelemetry-js/issues/6500
- https://thenewstack.io/opentelemetry-experts-share-the-future-of-browser-support/
- https://opentelemetry.io/docs/concepts/context-propagation/
- https://docs.sentry.io/concepts/otlp/
- https://develop.sentry.dev/sdk/telemetry/traces/opentelemetry/
- https://docs.datadoghq.com/opentelemetry/setup/otlp_ingest_in_the_agent/
- https://www.elastic.co/observability-labs/blog/web-frontend-instrumentation-with-opentelemetry
- https://www.npmjs.com/package/opentelemetry-instrumentation-ws

---

## Findings

### Finding: OpenTelemetry JS SDK — traces and metrics are Stable; logs are Development; profiles are not listed for JS

**Confidence:** CONFIRMED

**Evidence:**
- https://opentelemetry.io/status/ — JavaScript row: Traces Stable, Metrics Stable, Logs Development.
- https://opentelemetry.io/docs/languages/js/ — same status table.
- https://github.com/open-telemetry/opentelemetry-js/issues/6500 — open issue: "Add support for profiling signal in sdk" — no JS profiling SDK support yet.

**Implications:** Node.js trace + metric collection is production-ready. Logs still require caveats about breaking changes. Profiling is not yet a JS SDK concern in 2026.

---

### Finding: OpenTelemetry browser instrumentation is officially "experimental and mostly unspecified" as of late 2025 / early 2026; the Browser SIG is actively working on it

**Confidence:** CONFIRMED

**Evidence:**
- https://opentelemetry.io/docs/languages/js/getting-started/browser/ — "Client instrumentation for the browser is **experimental** and mostly **unspecified**."
- https://thenewstack.io/opentelemetry-experts-share-the-future-of-browser-support/ (published 2025-11-14) — Ted Young (Grafana, OTel co-founder): "It's not really something that we consider, like, a professional product that stacks up against the other things that are out there."
- Martin Kuba (Grafana): "The session is something that ties many different events and many different traces or spans together... sessions span page loads" — indicating the session model remains unresolved.
- Purvi Kanal (Honeycomb): "Users are creating hundreds and hundreds of events, even like hundreds of events per second."

**Implications:** Maintainer guidance in 2026 is to not use OTel browser for primary production observability. Vendor-provided browser RUM (Sentry, Elastic, Datadog, Honeycomb) is the 2026 practical answer. The Browser SIG is the upstream work to watch. The session-model work is the blocker.

---

### Finding: Vendor divergence — Elastic, OneUptime and others publish "browser OTel" recipes that implicitly treat browser SDK as usable, while the OTel docs and the co-founder (Ted Young) explicitly contradict

**Confidence:** CONFIRMED

**Evidence:**
- Elastic: https://www.elastic.co/observability-labs/blog/web-frontend-instrumentation-with-opentelemetry — demonstrates "Document load, HTTP requests (fetch/XHR), user interactions" and Core Web Vitals metrics, notes proxy required for CORS. Acknowledges: "client instrumentation for the browser is experimental and mostly unspecified. It is subject to breaking change."
- OneUptime (2026-02): posts on "Monitor WebSocket Connections from the Browser with OpenTelemetry" and "Instrument Socket.io WebSockets" that frame browser OTel as ready-to-use.
- Maintainer contradiction: https://opentelemetry.io/docs/languages/js/getting-started/browser/ — "experimental and mostly unspecified."

**Implications:** Vendor incentive bias — vendors extend/fork OTel browser SDKs into their products (Elastic APM, Sentry Browser SDK, Honeycomb Browser SDK) and present them as OTel-compatible. Correct read: these are vendor-proprietary layers atop OTel's protocol, not the upstream SDK. Vendor-promoted blog posts should be read accordingly.

---

### Finding: Sentry OTLP ingestion is open-beta for traces and logs; metrics NOT supported; Sentry Node/Java SDKs now use OTel under the hood (POTEL = Performance Over OTel)

**Confidence:** CONFIRMED

**Evidence:**
- https://docs.sentry.io/concepts/otlp/ — "This feature is currently in open beta." "Sentry does not support OTLP metrics at this time."
- https://develop.sentry.dev/sdk/telemetry/traces/opentelemetry/ — "Some of Sentry's SDKs (Node, Java) already shipped a complete Performance powered by OpenTelemetry (POTEL) system."
- https://blog.sentry.io/send-your-existing-opentelemetry-traces/ — two environment variables, no code changes required.

**Implications:** Sentry is an OTel-compatible trace backend (open-beta). For Node servers using the Sentry SDK already, OTel instrumentation is automatically captured via POTEL. Metrics require a different sink.

---

### Finding: Datadog supports OTLP ingestion via three paths: Agent OTLP receiver (ports 4317/4318), direct OTLP Intake API, and DDOT (Datadog Distribution of OTel) Collector

**Confidence:** CONFIRMED

**Evidence:**
- https://docs.datadoghq.com/opentelemetry/setup/otlp_ingest_in_the_agent/ — "The Datadog Agent supports OTLP/gRPC on port 4317 and OTLP/HTTP on port 4318."
- https://docs.datadoghq.com/opentelemetry/setup/otlp_ingest/ — direct-to-Datadog OTLP API.
- https://www.datadoghq.com/blog/otlp-metrics-api/ — "Modern serverless and AI platforms—including Azure Functions, Google Cloud Functions, Cloudflare Workers, Vercel, and Anthropic's Claude Code—export metrics in OTLP format by default."

**Implications:** OTel is interop-compatible with both Datadog and Sentry in 2026. It is reasonable to treat OTel as the emission API and use either Sentry (OTLP/traces+logs) or Datadog (OTLP/traces+metrics+logs) as the sink.

---

### Finding: The OTel Profiling signal entered public Alpha on 2026-03-26; "should not be used for critical production workloads"; targeting GA by Q3 2026; no JS SDK support in alpha

**Confidence:** CONFIRMED

**Evidence:**
- https://opentelemetry.io/blog/2026/profiles-alpha/ — "Profiles signal has officially entered public Alpha, and we are ready for broader community use and feedback." "With the Alpha status of the release, the signal should not be used for critical production workloads."
- Supported components: OTel Collector (v0.148.0+), eBPF Profiler, pprof receiver, k8sattributesprocessor.
- https://www.polarsignals.com/blog/posts/2026/03/26/opentelemetry-profiling-goes-alpha — Polar Signals confirmation of alpha date.
- JS SDK: https://github.com/open-telemetry/opentelemetry-js/issues/6500 — open issue, no JS implementation yet.

**Implications:** OTel profiling is server-side only (eBPF / language runtimes like Go/.NET/Ruby/Node V8 native), not browser-side. For a Node server, alpha-status profiles could complement Node --cpu-prof. For the browser, OTel profiling is not on the roadmap.

---

### Finding: `opentelemetry-instrumentation-ws` is a community npm package that patches the `ws` library for trace-socket-lifecycle events; no official OTel `instrumentation-ws` exists in contrib

**Confidence:** CONFIRMED

**Evidence:**
- https://www.npmjs.com/package/opentelemetry-instrumentation-ws — "adds OpenTelemetry tracing instrumentation for the ws library, tracing socket opens, closes, sends, and optionally messages."
- Not in `open-telemetry/opentelemetry-js-contrib` (confirmed by package name not being `@opentelemetry/instrumentation-ws`).

**Implications:** WebSocket-layer tracing for Hocuspocus would require either (a) the community `opentelemetry-instrumentation-ws` package, which traces the underlying `ws` calls but doesn't know about Hocuspocus message semantics, or (b) custom instrumentation at the Hocuspocus extension layer (e.g. onLoadDocument/afterLoadDocument hooks).

---

### Finding: W3C Trace Context + Baggage propagation is the canonical browser→backend correlation path; browser OTel SDK supports registering `W3CTraceContextPropagator` and `W3CBaggagePropagator`

**Confidence:** CONFIRMED

**Evidence:**
- https://opentelemetry.io/docs/concepts/context-propagation/ — "OpenTelemetry's default propagator uses the headers specified by the W3C TraceContext specification."
- https://opentelemetry.io/docs/concepts/signals/baggage/ — key-value propagation via HTTP headers.
- https://tracetest.io/blog/propagating-the-opentelemetry-context-from-the-browser-to-the-backend — registering `W3CBaggagePropagator` and `W3CTraceContextPropagator` produces the `traceparent` header.

**Implications:** The propagation primitive is stable and standardized. Browser-emitted edit events can carry a `traceparent` to correlate with server-side CRDT traces, even if the browser SDK itself is experimental.

---

### Finding: No editor-OSS / CRDT-OSS projects have visible OTel adoption as of early 2026; `@hocuspocus/server`, `y-prosemirror`, Tiptap Collab have no OTel instrumentation in their shipped code

**Confidence:** INFERRED

**Evidence:**
- Web search returned no OTel adoption signals for Hocuspocus, y-prosemirror, or related editor CRDT libraries.
- No `@opentelemetry/*` dependencies in the Hocuspocus server npm listing.

**Implications:** Any OTel wiring in an editor/CRDT stack in 2026 is application-side custom work, not library-provided. Server-side extensions (Hocuspocus `onLoadDocument`, `afterLoadDocument`) are the natural instrumentation surface.

---

### Finding: OTel agent overhead varies widely by configuration; community-quoted figures ("under 3% CPU") come from non-independent sources; no rigorous third-party benchmark applies to Node.js in 2026

**Confidence:** UNCERTAIN

**Evidence:**
- Community claims (OneUptime, techbytes.app) cite "3% CPU" without per-language breakdown.
- https://opentelemetry.io/docs/zero-code/java/agent/performance/ — Java-specific; acknowledges: "it is impossible to come up with a single agent overhead estimate, and to find the overhead of any instrumentation agent in a given deployment, you have to conduct experiments and collect measurements directly."
- https://opentelemetry.io/blog/2023/perf-testing/ — dates to 2023; no refresh visible for 2026.

**Implications:** OTel overhead numbers should be considered configuration-dependent, not fixed. Sampling, cardinality reduction, and batching are the known mitigations. Teams must benchmark their specific workload.

---

### Finding: Local-dev OTel viewers are a solved, documented pattern via Docker Compose (Collector + Jaeger + Prometheus + Grafana); terminal alternatives (`otel-tui`, `otel-desktop-viewer`) are available

**Confidence:** CONFIRMED

**Evidence:**
- https://dev.to/ymtdzzz/otel-tui-a-tui-tool-for-viewing-opentelemetry-traces-2e7n — terminal-based.
- Grafana docs show `otelcol.receiver.jaeger` component for bridging existing Jaeger traces to Grafana Alloy.
- Docker Compose pattern: Collector (OTLP on 4317/4318) → Jaeger (UI at localhost:16686) → Prometheus + Grafana.

**Implications:** Local-dev observability is low-friction and deliverable as a repo-local `docker-compose.yml`. `otel-tui` is newer and may be easier than full Jaeger stack.

---

## Terminology (D10)

- **POTEL:** Sentry's "Performance Over OTel" — Sentry Node/Java SDKs using OTel under the hood.
- **DDOT:** Datadog Distribution of OTel — Datadog's OTel Collector fork with Datadog Agent integration.
- **OTLP:** OpenTelemetry Protocol — gRPC/HTTP wire format, ports 4317/4318.
- **Browser SIG:** OTel working group defining browser-specific semantics and the session model.

## Gaps / follow-ups

- OTel Browser Session Model: Martin Kuba's quote confirms sessions-across-page-loads is an unresolved spec gap. This blocks "browser RUM via OTel" convergence until 2026+ spec work lands.
- OTel Profiling for Node.js: Alpha supports eBPF + pprof receiver, but JS SDK integration is tracked as open work.
- Hocuspocus + OTel: No known adoption. Instrumentation point would be Hocuspocus extension hooks + `opentelemetry-instrumentation-ws` for socket-lifecycle.

## Sources (de-duped)

- https://opentelemetry.io/status/
- https://opentelemetry.io/docs/languages/js/
- https://opentelemetry.io/docs/languages/js/getting-started/browser/
- https://opentelemetry.io/blog/2026/profiles-alpha/
- https://www.polarsignals.com/blog/posts/2026/03/26/opentelemetry-profiling-goes-alpha
- https://github.com/open-telemetry/opentelemetry-js/issues/6500
- https://thenewstack.io/opentelemetry-experts-share-the-future-of-browser-support/
- https://opentelemetry.io/docs/concepts/context-propagation/
- https://opentelemetry.io/docs/concepts/signals/baggage/
- https://tracetest.io/blog/propagating-the-opentelemetry-context-from-the-browser-to-the-backend
- https://docs.sentry.io/concepts/otlp/
- https://develop.sentry.dev/sdk/telemetry/traces/opentelemetry/
- https://blog.sentry.io/send-your-existing-opentelemetry-traces/
- https://docs.datadoghq.com/opentelemetry/setup/otlp_ingest_in_the_agent/
- https://docs.datadoghq.com/opentelemetry/setup/otlp_ingest/
- https://www.datadoghq.com/blog/otlp-metrics-api/
- https://www.elastic.co/observability-labs/blog/web-frontend-instrumentation-with-opentelemetry
- https://www.npmjs.com/package/opentelemetry-instrumentation-ws
- https://dev.to/ymtdzzz/otel-tui-a-tui-tool-for-viewing-opentelemetry-traces-2e7n
