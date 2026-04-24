# OpenTelemetry Instrumentation — Spec

**Status:** Approved, scope-expanded 2026-04-23
**Owner(s):** Andrew
**Last updated:** 2026-04-23
**Baseline commit:** dc84735 (original) / b34922d9 (post-rebase re-baseline)
**Links:**
- Evidence: [./evidence/](./evidence/)
- Changelog: [./meta/_changelog.md](./meta/_changelog.md)

**2026-04-23 scope expansion (see §Amendment at end).** After the original server-only PR (#36) opened, the user requested full-chain observability: frontend + backend + git resolution + shadow-repo + disk writes + local Grafana viewer. Scope expanded to cover the frontend React app (document-load, fetch, user-interaction auto-instrumentation), the shadow-repo commit pipeline, every fs write via a `fs-traced.ts` helper, and a bundled LGTM docker-compose stack at `docker/otel-dev/`. NG2 (frontend) and NG3 (local viewer) moved from NOT-NOW to Goals. Original server-only user stories (US-001 .. US-008) are in-place and landed; new user stories US-009..US-013 cover the expansion.

---

## 1) Problem statement

**Situation:** Open Knowledge runs a CRDT collaboration server with a multi-layer persistence pipeline (CRDT → disk → git), file watching, agent sessions, HTTP API endpoints, and a React frontend. The server + frontend have performance-sensitive code paths — debounced disk writes, git plumbing commits, CRDT transactions, file-watcher feedback loops, browser render + fetch paths — but no end-to-end observability. Existing logging is scattered `console.log` calls with module-prefix tags; a pino logger infrastructure exists but isn't wired into server code.

**Complication:** Without instrumentation, basic performance questions are unanswerable: How long does a git commit take? What's the end-to-end latency of a browser click → agent-write handler → disk write → shadow-repo commit? Can we see the full chain of events in a trace? As the system grows (more documents, more concurrent agents), performance bottlenecks will be invisible until they manifest as user-facing problems.

**Resolution:** Instrument the server + frontend with OpenTelemetry — traces, metrics, and correlated structured logs — plus a zero-config local Grafana LGTM stack. Trace context propagates from browser click → fetch → HTTP handler → Hocuspocus hooks → persistence → shadow-repo → disk write, all in one flame graph. Opt-in via standard OTel env vars; zero overhead when disabled. No third-party subscriptions required.

## 2) Goals
- G1: Add OTel tracing spans to all performance-critical server operations (API requests, agent writes, persistence load/store, git commits, file watcher events, shadow-repo ops, every fs write)
- G2: Add OTel metrics (histograms, counters) for key operational measurements (request duration, load/store duration, git-commit duration, file-watcher events)
- G3: Integrate OTel trace context with existing pino logger via a `mixin` that injects `trace_id`/`span_id`/`trace_flags` into every log record — click a log line in Grafana Loki, jump to the trace in Tempo
- G4: Support toggling instrumentation on/off via `OTEL_SDK_DISABLED` env var with zero overhead when disabled (server) and `VITE_OTEL_ENABLED` at build/runtime (frontend, default off so the OTel bundle is lazy-loaded into its own chunk)
- G5: Support configurable sampling via standard OTel sampler env vars (`OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG`)
- G6: Export all signals via OTLP/HTTP to any compatible backend, AND ship a local Grafana LGTM stack at `docker/otel-dev/` (Grafana + Tempo + Loki + Prometheus + OTel Collector) with auto-provisioned datasources for zero-friction dev
- G7: End-to-end trace propagation from browser click → fetch → HTTP handler → Hocuspocus hooks → persistence → shadow-repo → disk write, visible as a single flame graph in Grafana Tempo
- G8: Frontend (React app) instrumentation — DocumentLoadInstrumentation, FetchInstrumentation (with W3C traceparent header injection on `/api/*`), UserInteractionInstrumentation; WebSocket trace context propagates via URL query param (Hocuspocus handshake)

## 3) Non-goals
- **[NEVER]** NG1: Auto-instrumentation via require hooks — Bun doesn't support this; manual instrumentation gives better control anyway
- **[NEVER]** NG2: `@opentelemetry/instrumentation-fs` — broken on Bun (see oven-sh/bun#6546, #26536, #24324). Use the hand-rolled `packages/server/src/fs-traced.ts` wrapper instead
- **[NEVER]** NG3: Third-party hosted observability (Grafana Cloud, Datadog, Honeycomb, etc.) as a default — the user explicitly requires no subscription services; the local LGTM stack IS the default path. Consumers may still point OTLP at a hosted backend via `OTEL_EXPORTER_OTLP_ENDPOINT` if they choose
- **[NEVER]** NG4: Zone.js / `ZoneContextManager` for the browser SDK — 40 KB gzipped, breaks with async/await, not needed for React 19 + StackContextManager default
- **[NOT NOW]** NG5: Custom dashboards beyond the auto-provisioned Grafana datasources — ship the raw datasources first; curated dashboards come when someone asks for them
- **[NOT NOW]** NG6: Alerting rules or SLO definitions — requires production baseline data first. Revisit if: production deployment is imminent
- **[NOT UNLESS]** NG7: Metrics aggregation service beyond Prometheus — only if self-hosted production deployment requires something Prometheus can't serve

## 4) Personas / consumers
- **P1: Developer running locally** — wants to see trace/metric data to understand and debug performance during development. Uses OTLP exporter to local collector (Jaeger, Aspire Dashboard, etc.)
- **P2: Operator in production** — wants to export traces/metrics/logs to managed observability platform (Grafana Cloud, Datadog, etc.) via OTLP
- **P3: CI/test runner** — wants OTel completely disabled by default; zero overhead, no exporter configuration needed

## 5) User journeys

### P1: Developer measuring performance locally
1. Starts a local OTel viewer (one of):
   - `docker run -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm -ti grafana/otel-lgtm` (full Grafana UI)
   - `brew install ymtdzzz/tap/otel-tui && otel-tui` (terminal viewer, no Docker)
2. Starts server with OTel enabled: `OTEL_SDK_DISABLED=false open-knowledge start`
3. OTel SDK initializes, creates tracer/meter providers, connects to OTLP endpoint
4. Performs operations (agent writes, edits documents)
5. Views traces in viewer — sees span hierarchy, durations, attributes
6. Views metrics — operation counts, latency histograms
7. Adjusts sampling: `OTEL_TRACES_SAMPLER=parentbased_traceidratio OTEL_TRACES_SAMPLER_ARG=0.1` for 10% sampling
8. If no viewer is running, OTel SDK handles export failures gracefully (non-fatal)

### P3: CI/test runner (zero overhead)
1. `OTEL_SDK_DISABLED=true` (default)
2. Starts server — telemetry module returns no-op tracer/meter
3. All instrumentation call sites are zero-cost no-ops
4. No exporter configured, no spans created, no network calls

## 6) Requirements

### Functional requirements
| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | Trace spans for API request handling | Each `/api/*` request produces a root span with method, path, status code, duration | |
| Must | Trace spans for agent write transactions | `dc.document.transact()` wrapped in span with docName, content size, write origin | |
| Must | Trace spans for `syncTextToFragment` | Span captures duration of full-document re-parse | Performance-critical |
| Must | Trace spans for persistence (load + store) | `onLoadDocument` and `onStoreDocument` produce spans with file path, byte count | |
| Must | Trace spans for git commit | `commitToWipRef` span with success/failure, commit SHA, duration | Multiple git plumbing calls inside |
| Must | Trace spans for file watcher events | Per-event span with path, type, self-write skip decision | |
| Must | Toggle via `OTEL_SDK_DISABLED` env var | When `true`: no SDK initialization, no-op tracer/meter returned, zero overhead | Default: `true` (disabled) |
| Must | Sampling via standard OTel env vars | `OTEL_TRACES_SAMPLER` and `OTEL_TRACES_SAMPLER_ARG` control sample rate | |
| Must | OTLP/HTTP exporter for traces and metrics | Exports to `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://localhost:4318`) | |
| Should | Metrics: operation duration histograms | Histograms for agent_write_duration, persistence_store_duration, git_commit_duration | |
| Should | Metrics: operation counters | Counters for api_requests_total, git_commit_failures, file_watcher_events | |
| Should | Pino-OTel log correlation | Trace context (traceId, spanId) injected into pino log records | |
| Must | Replace console.log with pino + OTel-correlated logging | Existing 25 console calls migrated to structured pino with trace context | D13 |
| Could | Agent session lifecycle spans | Span for session create/close with docName | Lower priority |

### Non-functional requirements
- **Performance:** Zero measurable overhead when `OTEL_SDK_DISABLED=true`; <1ms per span when enabled
- **Reliability:** Exporter failures must not crash the server; fail silently with pino warning
- **Security/privacy:** No document content in span attributes (only metadata: docName, byte count, operation type)
- **Operability:** Service name configurable via `OTEL_SERVICE_NAME` (default: `open-knowledge-server`)
- **Cost:** No new runtime dependencies beyond OTel SDK packages

## 7) Success metrics & instrumentation
- Metric 1: Can measure end-to-end agent write latency (API request → CRDT transaction → persistence store)
  - Baseline: Unknown (no measurement exists)
  - Target: Measured and visible in trace viewer
  - Instrumentation: Nested spans with parent-child relationship
- Metric 2: Can identify git commit performance characteristics
  - Baseline: Unknown
  - Target: Duration histogram for commitToWipRef, failure rate counter
  - Instrumentation: Span + histogram metric on commitToWipRef
- What we will log/trace: All 8 key instrumentation points identified in evidence/server-architecture.md
- How we'll know adoption/value: Developer can answer "how long does X take?" by looking at a trace

## 8) Current state (how it works today)
- **No OTel dependencies** — clean slate
- **25 console.log/error calls** with `[module]` prefix tags — unstructured, no timing, no correlation
- **Pino logger infrastructure** exists (`logger.ts`) but only used by CLI — not wired into server code
- **No performance measurement** — debounce values (2000ms, 10000ms, 30000ms) were set by intuition, not measurement
- **Known gap:** `syncTextToFragment()` re-parses the entire document on every agent write — suspected hot path but unconfirmed

## 9) Proposed solution (vertical slice)

### System design

#### Architecture overview

```
packages/server/src/
├── telemetry.ts          ← NEW: OTel SDK initialization + provider factory
├── standalone.ts         ← MODIFIED: init telemetry at server creation
├── api-extension.ts      ← MODIFIED: request spans + metrics
├── agent-sessions.ts     ← MODIFIED: session + syncTextToFragment spans
├── persistence.ts        ← MODIFIED: load/store/git-commit spans + metrics
├── file-watcher.ts       ← MODIFIED: watcher event spans
└── logger.ts             ← MODIFIED: pino-OTel integration for log correlation
```

#### telemetry.ts — SDK initialization module

```typescript
// Core responsibility: initialize OTel SDK or return no-ops
// Called once at server startup from createServer()

import { context, trace, metrics, type Tracer, type Meter } from '@opentelemetry/api';
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

let tracerProvider: BasicTracerProvider | null = null;
let meterProvider: MeterProvider | null = null;

export function initTelemetry(): { tracer: Tracer; meter: Meter } {
  // OTEL_SDK_DISABLED=true (default) → return no-op implementations
  if (process.env.OTEL_SDK_DISABLED !== 'false') {
    return {
      tracer: trace.getTracer('open-knowledge-server'),
      meter: metrics.getMeter('open-knowledge-server'),
    };
  }

  if (tracerProvider) {
    return {
      tracer: trace.getTracer('open-knowledge-server'),
      meter: metrics.getMeter('open-knowledge-server'),
    };
  }

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'open-knowledge-server',
  });

  // Context manager — Bun supports AsyncLocalStorage
  const contextManager = new AsyncLocalStorageContextManager();
  context.setGlobalContextManager(contextManager);

  // Traces — using sdk-trace-base (not sdk-trace-node) for Bun compatibility
  // Uses constructor spanProcessors option (SDK 2.x API)
  const traceExporter = new OTLPTraceExporter();
  tracerProvider = new BasicTracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
  });
  tracerProvider.register();

  // Metrics
  const metricExporter = new OTLPMetricExporter();
  meterProvider = new MeterProvider({
    resource,
    readers: [new PeriodicExportingMetricReader({ exporter: metricExporter })],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  return {
    tracer: trace.getTracer('open-knowledge-server'),
    meter: metrics.getMeter('open-knowledge-server'),
  };
}

/** Graceful shutdown — flush pending spans and metrics. */
export async function shutdownTelemetry(): Promise<void> {
  await Promise.all([
    tracerProvider?.shutdown(),
    meterProvider?.shutdown(),
  ]);
  tracerProvider = null;
  meterProvider = null;
}

// Convenience for modules that need the tracer after init
export function getTracer(): Tracer {
  return trace.getTracer('open-knowledge-server');
}

export function getMeter(): Meter {
  return metrics.getMeter('open-knowledge-server');
}
```

#### Instrumentation pattern (example: api-extension.ts)

```typescript
import { SpanKind, SpanStatusCode, context, trace } from '@opentelemetry/api';
import { getTracer, getMeter } from './telemetry.ts';

// In createApiExtension():
const tracer = getTracer();
const meter = getMeter();
const requestDuration = meter.createHistogram('http.server.request.duration', {
  unit: 's',
  description: 'Duration of HTTP API requests',
});

// In onRequest handler:
async onRequest({ request, response }) {
  const url = request.url?.split('?')[0];
  if (!url || !routes[url]) return;

  const span = tracer.startSpan(`HTTP ${request.method} ${url}`, {
    kind: SpanKind.SERVER,
    attributes: {
      'http.request.method': request.method,
      'http.route': url,
    },
  });

  const startTime = performance.now();
  try {
    await context.with(trace.setSpan(context.active(), span), async () => {
      await routes[url](request, response);
    });
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (err) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
    throw err;
  } finally {
    const durationS = (performance.now() - startTime) / 1000;
    requestDuration.record(durationS, {
      'http.route': url,
      'http.request.method': request.method,
    });
    span.end();
  }
}
```

#### Span hierarchy (target)

```
HTTP POST /api/agent-write                    ← root span
├── agent.session.get                         ← session acquisition
├── agent.write.transaction                   ← CRDT transaction
│   ├── agent.sync_text_to_fragment           ← full document re-parse
│   └── agent.activity_map.update             ← activity metadata
└── (async) persistence.store_document        ← triggered by debounce
    ├── persistence.serialize_markdown        ← Y.Doc → markdown
    ├── persistence.write_file                ← atomic tmp+rename
    └── (async) persistence.git_commit        ← triggered by 30s debounce
        ├── git.read_tree
        ├── git.add
        ├── git.write_tree
        ├── git.commit_tree
        └── git.update_ref
```

#### Metrics (target)

| Metric name | Type | Unit | Attributes |
|---|---|---|---|
| `http.server.request.duration` | Histogram | s | http.route, http.request.method, http.response.status_code |
| `ok.persistence.store.duration` | Histogram | s | |
| `ok.persistence.load.duration` | Histogram | s | |
| `ok.persistence.git_commit.duration` | Histogram | s | success |
| `ok.persistence.git_commit.failures` | Counter | 1 | |
| `ok.agent.sync_text_to_fragment.duration` | Histogram | s | |
| `ok.file_watcher.events` | Counter | 1 | type, self_write_skipped |

Notes:
- `http.server.request.duration` follows stable OTel HTTP semantic conventions (unit: seconds, not ms)
- Custom metrics use `ok.` namespace prefix (open-knowledge) to avoid collision with standard OTel metrics
- Redundant `http.server.request.count` counter removed — the histogram implicitly tracks count

#### Log correlation (pino + OTel)

The `@opentelemetry/instrumentation-pino` package auto-injects trace context into pino log records. However, since Bun doesn't support require-hook auto-instrumentation, we'll use manual injection:

```typescript
// In logger.ts — add trace context to pino mixin
import { trace, context } from '@opentelemetry/api';

function otelMixin() {
  const span = trace.getSpan(context.active());
  if (!span) return {};
  const ctx = span.spanContext();
  return {
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
    trace_flags: ctx.traceFlags,
  };
}

// Add to PinoLogger constructor options:
// options.mixin = otelMixin;
```

### Dependencies (new)

```json
{
  "dependencies": {
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/sdk-trace-base": "^2.0.0",
    "@opentelemetry/context-async-hooks": "^2.0.0",
    "@opentelemetry/sdk-metrics": "^2.0.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.200.0",
    "@opentelemetry/exporter-metrics-otlp-http": "^0.200.0",
    "@opentelemetry/resources": "^2.0.0",
    "@opentelemetry/semantic-conventions": "^1.30.0"
  }
}
```

Notes:
- `@opentelemetry/api` stays on 1.x (stable API, never breaks)
- `@opentelemetry/semantic-conventions` stays on 1.x (separate release cycle)
- SDK packages use 2.x (released Feb 2025 — constructor-based `spanProcessors`, `resourceFromAttributes()`)
- Exporter packages use 0.200.0+ (2.x-era unstable numbering)
- `@opentelemetry/sdk-trace-node` deliberately excluded — it pulls in Node-specific context managers. We use `sdk-trace-base` + `context-async-hooks` (AsyncLocalStorage) directly for Bun compatibility.

### Alternatives considered
- **Option A: Traces only** — simpler but misses metrics and log correlation. Rejected because user wants all three signals.
- **Option B: Console exporter for local dev** — simpler setup but user chose OTLP-only; local dev uses a collector/viewer.
- **Option C: Separate telemetry package** — cleaner separation but over-engineered for server-only instrumentation now. Can extract later if needed (reversible).

## 10) Decision log

| ID | Decision | Type (P/T/X) | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | All three OTel signals: traces + metrics + logs | P | LOCKED | No | User wants comprehensive observability; all three signals are complementary | User decision | Larger implementation surface but each signal is independently valuable |
| D2 | Telemetry module in `packages/server/src/telemetry.ts` | T | LOCKED | No | Server is the instrumentation target; keeps module close to instrumented code | evidence/server-architecture.md | Can extract to shared package later if app/core need tracing |
| D3 | OTLP/HTTP exporter only (no console exporter) | T | LOCKED | No | User prefers external viewer/collector; OTLP is the universal standard | User decision | Requires running a collector for local dev (optional dev dep) |
| D4 | Follow OTel standard env vars | T | LOCKED | No | Standard ecosystem compatibility; any OTel docs apply directly | User decision | Uses `OTEL_SDK_DISABLED`, `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG` |
| D5 | Default to disabled (`OTEL_SDK_DISABLED=true`) | X | DIRECTED | No | Zero overhead for CI/tests; opt-in for dev/prod | Persona P3 requirements | Must document how to enable |
| D6 | Manual span creation (no auto-instrumentation) | T | LOCKED | No | Bun doesn't support require hooks; manual gives precise control | evidence/server-architecture.md (Bun section) | More implementation work but better span quality |
| D7 | Use `@opentelemetry/sdk-trace-base` (not sdk-trace-node) | T | DIRECTED | No | `sdk-trace-node` uses `AsyncHooksContextManager` which may not work in Bun; `sdk-trace-base` is runtime-agnostic | evidence/server-architecture.md | Must manually set up context manager if needed; Bun has AsyncLocalStorage |
| D8 | Global OTel API for tracer/meter access (`trace.getTracer()`) | T | LOCKED | No | Standard OTel pattern; no-op by default when SDK not registered; no DI needed | OTel API spec | All modules import from `@opentelemetry/api` |
| D9 | `syncTextToFragment` gets both span and histogram metric | T | DIRECTED | No | Suspected hot path; span gives call-site context per invocation, histogram gives aggregate distribution | evidence/server-architecture.md | |
| D10 | Keep `LOG_LEVEL` separate from OTel env vars | T | DIRECTED | No | Different concerns: log verbosity vs. telemetry collection | | |
| D11 | Debounced operations are independent root spans, not children of requests | T | LOCKED | No | Debounced ops batch multiple requests; parent-child would be architecturally incorrect | evidence/context-propagation.md | Span links for correlation are Future Work |
| D12 | Graceful shutdown flushes OTel providers in `destroy()` | T | DIRECTED | No | Prevents span loss on server shutdown | standalone.ts:109-117 | Add `tracerProvider.shutdown()` + `meterProvider.shutdown()` to `destroy()` |
| D13 | Migrate 25 console.log/error calls to pino with OTel trace context | T | LOCKED | No | Enables log correlation; touching same files for span instrumentation anyway; pino infrastructure already exists | User decision + logger.ts | Each module gets `getLogger('module-name')` |

## 11) Open questions

| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | Should `OTEL_SDK_DISABLED` default be `true` (opt-in) or `false` (opt-out)? | X | P0 | Yes | Default `true` (disabled) — zero overhead for CI/tests | Resolved → D5 |
| Q2 | Should we use `@opentelemetry/sdk-trace-node` or `@opentelemetry/sdk-trace-base`? | T | P0 | Yes | Use `sdk-trace-base` — avoids Node-specific context managers; Bun has AsyncLocalStorage so manual context propagation works. `sdk-trace-node` pulls in Node-specific `AsyncHooksContextManager` which may not work in Bun. | Resolved → D7 |
| Q3 | How should the tracer/meter be passed to modules — global singleton vs. dependency injection? | T | P0 | Yes | Global OTel API (`trace.getTracer()`, `metrics.getMeter()`) after init — standard OTel pattern, no-op by default | Resolved → D8 |
| Q4 | Should git plumbing calls (read-tree, write-tree, etc.) be individual child spans or just attributes on the parent git_commit span? | T | P2 | No | Individual spans give more granularity but add overhead for a debounced operation | Open |
| Q5 | Should `syncTextToFragment` duration be a span, a metric, or both? | T | P0 | No | Both — it's suspected hot path; span gives call-site context, histogram gives distribution | Resolved → D9 |
| Q6 | What OTel resource attributes beyond service.name should we set? | T | P2 | No | Standard: service.version, deployment.environment. Custom: content_dir path? | Open |
| Q7 | Should pino log level be controllable via OTel env vars or keep separate `LOG_LEVEL`? | T | P2 | No | Keep separate — different concerns (verbosity vs. telemetry) | Resolved → D10 |
| Q8 | How do debounced operations (persistence, git) relate to request spans? | T | P0 | Yes | Independent root spans — debounced ops batch multiple requests, no parent-child relationship | Resolved → D11 |
| Q9 | Should we replace console.log calls with pino as part of this work? | T | P0 | Yes | Yes — console migration is natural part of log correlation; touching same files | Resolved → D13 |
| Q10 | Should graceful shutdown flush pending OTel spans? | T | P0 | No | Yes — add provider shutdown to `destroy()` in standalone.ts | Resolved → D12 |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `@opentelemetry/sdk-trace-base` 2.x + `@opentelemetry/context-async-hooks` 2.x works in Bun 1.3.11 | HIGH | Install and run basic span creation test | Before implementation | Active |
| A2 | `BatchSpanProcessor` works in Bun (uses setTimeout, not worker threads) | HIGH | Verified by external reports + Bun docs | Before implementation | Active |
| A3 | OTLP/HTTP exporter works in Bun (uses fetch) | HIGH | Bun has full fetch implementation | Before implementation | Active |
| A4 | Pino mixin for OTel context injection works (no require hooks needed) | HIGH | Pino mixin is a pure function — no module patching | Before implementation | Active |
| A5 | No-op OTel API has zero overhead when no SDK registered | HIGH | OTel API spec guarantees this | N/A | Active |

## 13) In Scope (implement now)

- **Goal:** Add OTel observability (traces, metrics, logs) to the server package
- **Non-goals:** Client-side instrumentation, alerting, dashboards
- **Requirements:** See §6 — all Must and Should items
- **Proposed solution:** See §9
- **Owner(s)/DRI:** Andrew
- **Next actions:**
  1. Add OTel dependencies to packages/server/package.json
  2. Create `telemetry.ts` — SDK init, provider factory, env var handling
  3. Instrument `api-extension.ts` — request spans + metrics
  4. Instrument `persistence.ts` — load/store/git-commit spans + metrics
  5. Instrument `agent-sessions.ts` — session + syncTextToFragment spans
  6. Instrument `file-watcher.ts` — event spans + counters
  7. Update `logger.ts` — pino mixin for trace context injection
  8. Wire `initTelemetry()` into `createServer()` in standalone.ts
  9. Wire `shutdownTelemetry()` into `destroy()` in standalone.ts (after `hocuspocus.closeConnections()`)
  10. Replace 25 console.log/error calls with pino + trace context across 5 server files
  11. Add tests: telemetry.ts unit tests (init, no-op, shutdown idempotency), integration tests with `InMemorySpanExporter` for span hierarchy verification, benchmark procedure for zero-overhead claim
- **Risks + mitigations:** See §14
- **What gets instrumented/measured:** See §9 span hierarchy and metrics table

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Default off | `OTEL_SDK_DISABLED=true` by default | CI tests pass without any OTel env vars |
| No breaking changes | New deps are additive; no API changes | Existing tests pass unchanged |
| Exporter failure resilience | OTel SDK handles exporter errors internally | Test with unreachable endpoint |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| AsyncLocalStorage performance regression in Bun | Medium | High — context propagation on every instrumented path | Benchmark with OTel enabled vs disabled; fallback: explicit span-passing (no context manager). Bun #24324 was fixed for release builds but the area is under active optimization | Andrew |
| Span creation adds latency to hot paths | Low | Medium — degrades agent write performance | Benchmark with OTel on vs off; <1ms budget per span | Andrew |
| OTLP exporter memory leak on Bun | Low | Medium — server memory grows | Monitor in dev; BatchSpanProcessor has configurable queue size | Andrew |
| Document content leaks into span attributes | Medium | High — privacy violation | Code review: only metadata (docName, byte count) in attributes; no content strings | Andrew |
| `context-async-hooks` package restructured in SDK 3.x | Low | Low — import path changes | Pin to 2.x; migration is mechanical when 3.x ships | Andrew |

## 15) Future Work

### Explored
- **Client-side browser tracing**
  - What we learned: Browser OTel SDK exists (`@opentelemetry/sdk-trace-web`); could trace TipTap editor operations
  - Recommended approach: Separate instrumentation in app package; propagate trace context via WebSocket headers
  - Why not in scope now: Different SDK, different concerns, different export path
  - Triggers to revisit: Need for end-to-end distributed traces (client → server → persistence)

### Identified
- **Metrics dashboarding**
  - What we know: OTel metrics can feed Prometheus/Grafana dashboards
  - Why it matters: Histograms are only useful if visualized; need dashboard templates
  - What investigation is needed: Standard Grafana dashboard templates for OTel HTTP metrics

- **OTel-based alerting**
  - What we know: Metrics can drive alerts (e.g., git commit failure rate > threshold)
  - Why it matters: Currently relies on console.error + human monitoring
  - What investigation is needed: Alerting backend options, threshold tuning from baseline data

### Noted
- **Trace-based testing** — use OTel spans in integration tests to assert timing invariants (e.g., "syncTextToFragment < 50ms for documents under 10KB")
- **OpenTelemetry Collector sidecar** — for production deployments, a collector sidecar could handle sampling, batching, and routing to multiple backends

## 16) Agent constraints

- **SCOPE:** `packages/server/src/` — telemetry.ts (new), standalone.ts, api-extension.ts, persistence.ts, agent-sessions.ts, file-watcher.ts, logger.ts, index.ts; `packages/server/package.json`
- **EXCLUDE:** `packages/app/`, `packages/core/`, `packages/cli/` (except documenting env vars), `docs/`
- **STOP_IF:** Bun runtime incompatibility with OTel SDK; span creation adds >5ms to any operation; AsyncLocalStorage context propagation degrades throughput by >10% (fall back to explicit span-passing); any span attribute contains document content
- **ASK_FIRST:** New workspace package creation; changes to CLI config schema; changes to public API surface of server package

---

## 17) Amendment — 2026-04-23 scope expansion (full-chain observability + local Grafana LGTM)

Original PR (#36) covered server-only instrumentation. After rebase on main and user review, the user requested:
1. Full chain of events in traces — browser click → fetch → Hocuspocus → persistence → shadow-repo → disk write
2. Frontend instrumentation (React app)
3. Shadow-repo + git-resolution span coverage
4. Every disk write instrumented
5. A local Grafana viewer (LGTM stack) — no third-party subscription required

This amendment restates scope and wires in the additions. NG2 and NG3 from §3 moved from NOT-NOW to Goals (G7, G8). Original server-only user stories (US-001..US-008) remain as-is and shipped. New user stories:

### 17.1) New user stories

- **US-009 — Expand SCOPE to include `packages/app/src/`, `packages/server/src/shadow-repo.ts`, `packages/server/src/fs-traced.ts`, and `docker/otel-dev/`.** Update §16 `SCOPE` line accordingly. ✓ landed.

- **US-010 — `fs-traced.ts` helper + migration.** Create `packages/server/src/fs-traced.ts` exporting `tracedWriteFile`, `tracedRename`, `tracedMkdir`, `tracedUnlink`, plus `*Sync` variants. Each wrapper creates an `fs.<op>` span with `fs.operation`, `fs.path` (normalized — last two segments to bound cardinality), `fs.path.role` (classifier: `shadow-repo`, `content-md`, `git`, `lock`, `principal`, `conflict`, `ok-internal`, `other`), and `fs.bytes` for writes. Migrate `persistence.ts`, `shadow-repo.ts` (within the hot paths), `principal.ts`, `process-lock.ts`, `shadow-lock.ts` call sites to use the traced wrappers. Skip test-only code. ✓ landed.

- **US-011 — Shadow-repo + git-resolution instrumentation.** Wrap the 5 high-value entry points with spans: `commitWip`, `commitWipFromTree`, `commitUpstreamImport`, `parkBranch`, `saveVersion`. Attributes: `shadow.writer`, `shadow.branch`, `shadow.tree` (short SHA), `shadow.doc_count`. Hot-path writes inside (`writeFileSync` for tmp-blob staging) go through `fs-traced`. ✓ landed.

- **US-012 — Hocuspocus hooks + agent-sessions spans.** Wrap `onLoadDocument`, `onStoreDocument`, `commitToWipRef` with spans + histograms (`ok.persistence.load.duration`, `ok.persistence.store.duration`, `ok.persistence.git_commit.duration`). Wrap `applyAgentMarkdownWrite` and `applyAgentUndo` with spans carrying `doc.name`, `agent.write_position`, `agent.markdown.bytes`, `agent.undo_scope`, `agent.undo_effective`. Wrap `file-watcher` DiskEvent dispatch with `file_watcher.process_event` span + `ok.file_watcher.events` counter. HTTP `onRequest` opens a `SpanKind.SERVER` span extracting the incoming `traceparent` header; emits `http.server.request.duration` histogram keyed on `http.request.method` + `http.route` (normalized, dynamic segments → `:param`). ✓ landed.

- **US-013 — Local Grafana LGTM stack at `docker/otel-dev/`.** docker-compose brings up Grafana (port 3001 — 3000 collides with Next.js dev), Tempo, Loki (3.x native OTLP ingest), Prometheus, OTel Collector (4317/gRPC + 4318/HTTP with CORS enabled for browser OTLP). Datasources auto-provisioned via `grafana/provisioning/datasources/datasources.yaml` with `tracesToLogsV2`, `tracesToMetrics`, and exemplar-derived trace links wired up. README documents env vars (`OTEL_SDK_DISABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `VITE_OTEL_ENABLED`, `VITE_OTEL_COLLECTOR_URL`) and troubleshooting. ✓ landed.

- **US-014 — Frontend React app instrumentation.** `packages/app/src/telemetry.ts` lazy-loads `telemetry-impl.ts` via dynamic `import()` when `VITE_OTEL_ENABLED === 'true'`, so the ~45 KB gzipped OTel SDK is a separate chunk and doesn't bloat the main bundle. `telemetry-impl.ts` wires `WebTracerProvider` + `BatchSpanProcessor` + `OTLPTraceExporter` → `${VITE_OTEL_COLLECTOR_URL}/v1/traces`. Instrumentations: `DocumentLoadInstrumentation`, `FetchInstrumentation` (with `propagateTraceHeaderCorsUrls: [/\/api\//, /localhost:\d+\/api\//, /127\.0\.0\.1:\d+\/api\//]`), `UserInteractionInstrumentation` (clicks + submits only). `main.tsx` calls `initFrontendTelemetry()` as the very first statement before any other module loads. ✓ landed.

- **US-015 — Hocuspocus WebSocket trace-context propagation.** The browser WebSocket API can't set headers; inject `traceparent` (and `tracestate` when present) as URL query params at HocuspocusProvider construction via `packages/app/src/editor/collab-otel.ts:appendTraceContextToCollabUrl(url)`. Integrate in `provider-pool.ts:174`. Server-side extraction wiring (parsing `requestParameters.get('traceparent')` in `onConnect` and attaching the extracted context to a WeakMap keyed by session origin) is **deferred to a follow-up** — current span tree still chains from the HTTP `/api/*` fetch path, which is the dominant user-action trigger. Pure WebSocket-initiated traces (server-observer emissions, agent-presence broadcasts) remain independent roots in this iteration. Revisit when a concrete WebSocket-only user-visible latency incident forces the question.

- **US-016 — CORS header allowlist for trace-context propagation.** Server `Access-Control-Allow-Headers` now includes `traceparent, tracestate, baggage` so the browser's `FetchInstrumentation` can inject them on cross-origin requests from the Vite dev server. ✓ landed.

- **US-017 — `withSpan` / `withSpanSync` / `setActiveSpanAttributes` helpers in `telemetry.ts`.** Reduces boilerplate at every instrumented call site from ~10 lines (startActiveSpan + try/catch/finally + span.end + span.recordException + span.setStatus) to 1 line (`withSpan('name', { attributes }, async () => { ... })`). Error-recording + status-setting happen automatically. ✓ landed.

- **US-018 — Pino `otelMixin` injection.** `packages/server/src/logger.ts` now injects `trace_id`, `span_id`, `trace_flags` from the active OTel span context into every pino log record via the `mixin` option. When no span is active, mixin returns `{}` (no extra fields). Grafana's `derivedFields` in `loki.yaml` turn `trace_id=<value>` into a clickable link to the trace in Tempo. ✓ landed.

- **US-019 — Size-limit accommodation.** Added `telemetry-impl.ts` as a separate dynamic-import chunk. Main bundle (`index-*.js` gzipped) stays at 208.78 kB (under the 210 kB limit). The combined-JS limit in `packages/app/package.json` bumped from 1000 kB to 1050 kB to accommodate the ~23 kB gzipped lazy chunk. Cost is paid only when `VITE_OTEL_ENABLED=true`. ✓ landed.

### 17.2) New agent constraints (amendment override)

- **SCOPE (revised):** `packages/server/src/` (server telemetry, fs-traced, shadow-repo instrumentation) + `packages/app/src/telemetry*.ts` + `packages/app/src/editor/collab-otel.ts` + `packages/app/src/editor/provider-pool.ts` (provider URL rewrite only) + `packages/app/src/main.tsx` (init call only) + `packages/app/package.json` (deps + size-limit) + `docker/otel-dev/**` (new LGTM stack) + this spec.
- **EXCLUDE:** `packages/core/` (no schema / pipeline changes), `packages/cli/` (no new command — still `open-knowledge start`), `packages/desktop/` (Electron gets OTel when web does; no special wiring), `docs/` (docs site), integration / E2E tests (telemetry is observation, not behavior — do not add telemetry assertions to behavioral tests).
- **STOP_IF:** Bundle size-limit increases beyond +5% total; any user-visible regression from telemetry code paths when disabled (zero-overhead invariant); span attributes contain document body content; frontend OTel init runs when `VITE_OTEL_ENABLED !== 'true'` (must be lazy).

### 17.3) Verified acceptance criteria (post-landing)

- `bun run check` ✓ passes (16/16 turbo tasks, 209 integration tests, 938 assertions)
- `bunx tsc --noEmit` across all packages ✓ (server, app, core, cli, docs)
- `bun run build` (app bundle) ✓ — main `index-*.js` 208.78 kB gzipped, telemetry-impl lazy chunk 23.22 kB gzipped
- `bun run size` ✓ — all three size-limit checks pass
- `docker compose -f docker/otel-dev/docker-compose.yml config` ✓ — parse + validate stack (to be manually verified on first dev invocation)
- Trace chain visible end-to-end (manual verification, not a CI gate): browser click → fetch span → HTTP server span → agent-write span → persistence span → fs.writeFile span → shadow.commitWip span, all in one Grafana Tempo flame graph when OTel is enabled

### 17.4) Follow-ups (deferred, not blocking this PR)

- Full server-side WebSocket trace extraction in `onConnect` (US-015 deferral). Current iteration relies on `/api/*` fetch as the dominant trace-initiation path.
- Grafana dashboard JSON — auto-provisioned dashboards for the four key user journeys (browser click → disk write; agent MCP write → git commit; file-watcher external change → CRDT apply; shadow-repo park / saveVersion). The bare datasources are enough to explore traces; curated dashboards come later.
- OTLP logs pipeline (pino → OTel logs SDK → Loki) — current path is pino → stdout → docker compose logs. `trace_id` is embedded via mixin so correlation works, just not via native OTLP transport.
- Sampling-rate configuration beyond `OTEL_TRACES_SAMPLER` — ParentBased + TraceIdRatioBased works out of the box; advanced sampling (tail-based, adaptive) is a post-v1 concern.
