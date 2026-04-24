# Design Challenge Findings

**Artifact:** specs/2026-04-09-otel-instrumentation/SPEC.md
**Challenge date:** 2026-04-09
**Total findings:** 7 (3 high, 3 medium, 1 low)

---

## High Severity

### [H] Finding 1: Bun AsyncLocalStorage performance regression makes context propagation a material risk, not a low-likelihood assumption

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** SPEC.md Section 9 (telemetry.ts code), Section 14 (Risks), Assumption A2, Decision D7
**Issue:** The spec proposes using `@opentelemetry/context-async-hooks` with `AsyncLocalStorageContextManager` for context propagation in Bun, treating Bun compatibility as a low-risk, high-confidence assumption (A2: HIGH confidence). However, there is a documented severe performance regression in Bun's AsyncLocalStorage implementation: HTTP throughput drops from ~110k req/s to ~2k req/s (a 55x slowdown) due to Bun's flat-array cloning approach (O(n^2) with nested contexts). This is tracked in [oven-sh/bun#24324](https://github.com/oven-sh/bun/issues/24324). The spec's Risk table lists "Span creation adds latency to hot paths" as Low likelihood / Medium impact, but the actual risk vector is not span creation overhead -- it is the context propagation mechanism itself.

**Current design:** "Context manager -- Bun supports AsyncLocalStorage" (SPEC.md line 166); Assumption A2: "BatchSpanProcessor works in Bun (uses setTimeout, not worker threads)" rated HIGH confidence; Risk table entry for span latency cites "<1ms budget per span" mitigation.

**Alternative:** Two options to address this:
1. **No context propagation (simpler):** Skip `AsyncLocalStorageContextManager` entirely. Use explicit span-passing instead of relying on `context.active()`. Each instrumented function receives its parent span as a parameter and creates child spans explicitly. This eliminates the AsyncLocalStorage overhead entirely while still producing correct span hierarchies. The spec already establishes that debounced operations are independent root spans (D11), which means the main span hierarchy is shallow (HTTP request -> transaction -> syncTextToFragment) and explicit passing is tractable.
2. **Context propagation with performance gate:** Keep the current design but add an explicit STOP_IF condition: "If enabling context propagation degrades request throughput by more than 10% in benchmarks, fall back to explicit span-passing." This makes the risk mitigation concrete rather than aspirational.

**Trade-off:** Option 1 sacrifices automatic parent-child span nesting (callers must pass spans) but eliminates a known Bun performance footgun. Option 2 preserves the aspirational design but requires benchmark validation before shipping. The spec currently has neither -- it assumes AsyncLocalStorage works with no performance gate.

**Status:** CHALLENGED
**Suggested resolution:** Add the Bun AsyncLocalStorage performance regression as a HIGH likelihood / HIGH impact risk (not Low/Medium). Either adopt explicit span-passing as the primary design or add a concrete performance validation gate with fallback. The spec's STOP_IF in Agent Constraints (Section 16) should include "AsyncLocalStorage context propagation degrades throughput by >10%."

---

### [H] Finding 2: Spec code uses deprecated OTel APIs (`addSpanProcessor`) that will be removed in SDK 2.0

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** SPEC.md Section 9 (telemetry.ts code, lines 172-173)
**Issue:** The spec's telemetry.ts code sample uses `tracerProvider.addSpanProcessor(new BatchSpanProcessor(traceExporter))`, which is deprecated in the current OTel JS SDK and will be removed in SDK 2.0 (see [opentelemetry-js#5299](https://github.com/open-telemetry/opentelemetry-js/issues/5299)). The recommended migration is to pass `spanProcessors` as a constructor option to `BasicTracerProvider`. Since this spec is being written for a greenfield instrumentation effort, it should use the current recommended API from the start rather than adopting an API path that requires immediate migration.

**Current design:**
```typescript
tracerProvider = new BasicTracerProvider({ resource });
tracerProvider.addSpanProcessor(new BatchSpanProcessor(traceExporter));
```

**Alternative:** Use the constructor-based API:
```typescript
tracerProvider = new BasicTracerProvider({
  resource,
  spanProcessors: [new BatchSpanProcessor(traceExporter)],
});
```

**Trade-off:** No capability loss -- this is strictly a migration to the recommended API. The constructor-based approach is also slightly cleaner (immutable configuration).

**Status:** CHALLENGED
**Suggested resolution:** Update the telemetry.ts code to use the `spanProcessors` constructor option. This is a straightforward fix with no design trade-offs.

---

### [H] Finding 3: Metric naming and attribute conventions deviate from stable OTel semantic conventions

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** SPEC.md Section 9 (instrumentation pattern code, metrics table)
**Issue:** The spec's metric and attribute naming deviates from the stable OTel semantic conventions in three ways:

1. **Unit mismatch:** The spec defines `http.server.request.duration` with unit `ms` (milliseconds). The stable OTel HTTP semantic conventions ([v1.23.1+](https://opentelemetry.io/docs/specs/semconv/http/http-metrics/)) specify this metric in seconds (`s`), not milliseconds. The spec records `performance.now()` differences (which are in ms) and passes them directly as histogram values.

2. **Deprecated attribute name:** The spec uses `http.method` as a span/metric attribute (line 233, 238, 248). The stable HTTP semantic conventions renamed this to `http.request.method`. The old `http.method` is the pre-stability name.

3. **Non-standard metric name:** The spec defines `http.server.request.count` as a counter. This is not a standard OTel HTTP semantic convention metric. The stable spec defines `http.server.request.duration` (required histogram) and `http.server.active_requests` (required UpDownCounter). A standalone request counter is redundant with the histogram's count (every histogram implicitly tracks count). Custom metric names should use a namespace prefix to avoid collision with future standard metrics.

**Current design:** `http.server.request.duration` in ms; `http.method` attribute; `http.server.request.count` counter.

**Alternative:**
1. Record duration in seconds: `requestDuration.record(duration / 1000, ...)`.
2. Use `http.request.method` as the attribute name.
3. Either drop the explicit count metric (the histogram already provides count) or namespace it as `open_knowledge.http.request.count`.

**Trade-off:** Following stable conventions means the metrics integrate correctly with standard OTel dashboards, Grafana templates, and backend auto-detection. Deviating creates a split-world where standard tooling shows wrong values (durations 1000x too large) or missing data.

**Status:** CHALLENGED
**Suggested resolution:** Align all metric names, units, and attributes with the stable OTel semantic conventions. This is a 1-way door concern: once metric names ship and users build dashboards on them, changing names is a breaking change for operators.

---

## Medium Severity

### [M] Finding 4: The `destroy()` function does not call OTel shutdown, contradicting Decision D12

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** SPEC.md Section 10 (D12), Section 9 (telemetry.ts code), standalone.ts (lines 109-117)
**Issue:** Decision D12 states "Graceful shutdown flushes OTel providers in `destroy()`" with rationale "Prevents span loss on server shutdown." The telemetry.ts code in Section 9 defines a standalone `shutdownTelemetry()` function but the spec never shows how it integrates with the existing `destroy()` function in standalone.ts. The spec's "In Scope" next actions (Section 13, step 8) say "Wire `initTelemetry()` into `createServer()`" but there is no corresponding step for wiring `shutdownTelemetry()` into `destroy()`. The current `destroy()` function (standalone.ts:109-117) calls `watcher.unsubscribe()`, `sessionManager.closeAll()`, `hocuspocus.flushPendingStores()`, and `hocuspocus.closeConnections()` -- but has no telemetry shutdown call.

The gap is that `shutdownTelemetry()` is defined but its integration point is never specified. An implementer could miss this entirely.

**Current design:** `shutdownTelemetry()` exists as a standalone export; D12 says it goes in `destroy()`; no explicit wiring step in the implementation plan.

**Alternative:** Add an explicit step in Section 13 next actions: "Wire `shutdownTelemetry()` into `destroy()` in standalone.ts, after `hocuspocus.closeConnections()`." Or better: have `initTelemetry()` return a shutdown handle that `createServer()` captures and calls in `destroy()`.

**Trade-off:** None -- this is a documentation/completeness gap, not a design trade-off.

**Status:** CHALLENGED
**Suggested resolution:** Add explicit integration step to the implementation plan and show the `destroy()` modification in the code sample.

---

### [M] Finding 5: The spec scopes 8 new OTel dependencies but does not evaluate the dependency weight or Bun install compatibility

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** SPEC.md Section 9 (Dependencies), Non-functional requirements ("Cost: No new runtime dependencies beyond OTel SDK packages")
**Issue:** The spec adds 8 new npm packages to `packages/server/package.json`. The non-functional requirement states "No new runtime dependencies beyond OTel SDK packages" -- but this is circular (OTel SDK packages ARE the new dependencies). The spec does not evaluate:

1. **Transitive dependency count:** OTel packages pull in a significant transitive tree (`@opentelemetry/core`, `@opentelemetry/sdk-trace-base` depends on `@opentelemetry/core`, `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`, etc.). The current server package has 11 direct dependencies. Adding 8 more nearly doubles it.

2. **Bundle/install size impact:** For a CLI tool distributed via npm (`@inkeep/open-knowledge`), dependency weight affects install time and disk usage. The OTel SDK packages are not trivially small.

3. **Bun resolution compatibility:** The spec notes Bun-specific concerns for `sdk-trace-node` but doesn't verify that all 8 packages resolve and install cleanly under `bun install`. Assumption A1 covers `sdk-trace-node` (which isn't even used), but there's no equivalent assumption for the 8 packages that ARE used.

A simpler alternative worth evaluating: **start with traces only** (3-4 packages: `api`, `sdk-trace-base`, `context-async-hooks`, `exporter-trace-otlp-http`) and add metrics packages in a second pass. This was considered as Option A in "Alternatives considered" and rejected because "user wants all three signals." However, the rejection conflates "eventually wants" with "must ship simultaneously." Phasing reduces risk: traces are the highest-value signal for the stated problem (answering "how long does X take?"), and metrics can be added incrementally without rework.

**Current design:** All 8 packages added simultaneously.

**Alternative:** Phase 1: traces only (4 packages). Phase 2: metrics (2 more packages). Phase 3: log correlation (pino mixin, no additional packages). This reduces initial blast radius and validates Bun compatibility with a smaller surface.

**Trade-off:** Phased approach delays metrics availability but de-risks the integration. All three signals remain the goal; only the delivery sequence changes.

**Status:** CHALLENGED
**Suggested resolution:** Re-evaluate whether simultaneous delivery of all 8 dependencies is necessary given the Bun compatibility uncertainties, or whether phased delivery (traces first) is a lower-risk path to the same outcome. The Decision Log rejection of Option A should address phasing specifically, not just eventual scope.

---

### [M] Finding 6: The console.log migration (D13) significantly expands scope and couples two independent concerns

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** SPEC.md Section 10 (D13), Section 6 (Requirements -- "Must: Replace console.log with pino"), evidence/console-log-inventory.md
**Issue:** Decision D13 bundles the migration of ~25 console.log/error calls to pino into the OTel instrumentation work, arguing "touching same files for span instrumentation anyway; pino infrastructure already exists." This framing conflates two independent concerns:

1. **OTel instrumentation** -- adding traces and metrics to measure performance (the spec's stated problem).
2. **Logging migration** -- replacing console.log with structured pino logging (a code quality improvement).

The Problem Statement's Complication is about unanswerable performance questions. Structured logging does not answer those questions -- traces and metrics do. Log correlation (injecting traceId/spanId into logs) is complementary but only valuable AFTER traces exist. The console-to-pino migration is valuable on its own merits but is not required for the spec's Resolution.

By including the migration as a "Must" requirement, the spec increases the implementation surface by ~25 file edits across 5 modules, each requiring careful log level selection, structured argument formatting, and error serialization. The evidence/console-log-inventory.md shows this is detailed, per-call work -- not a mechanical find-and-replace.

The "touching same files anyway" argument is weak: adding a span to `persistence.ts` (wrapping `commitToWipRef` in a span) is architecturally different from converting `console.log('[persistence] Git commit: ...')` to `log.info({ commitSha, wipRef }, 'git commit')`. They happen to be in the same file but are independent changes with independent review concerns.

**Current design:** Console migration is a "Must" requirement bundled with OTel instrumentation.

**Alternative:** Decouple the two concerns:
- Phase 1 (this spec): OTel traces + metrics + pino mixin for log correlation. Console.log calls remain as-is.
- Phase 2 (follow-up): Console-to-pino migration as a separate, focused task. Log correlation via the mixin automatically applies once pino is in use.

**Trade-off:** Decoupling means a brief period where OTel traces exist but logs aren't structured. However, the spec's stated problem is about performance measurement, not log quality. The migration can follow within days without blocking the core value.

**Status:** CHALLENGED
**Suggested resolution:** Consider demoting D13 from "Must" to "Should" or moving it to a separate task. If it stays in scope, explicitly acknowledge it as scope expansion beyond the core OTel instrumentation problem and ensure acceptance criteria are defined for the migration quality (log levels, error serialization patterns, etc.).

---

## Low Severity

### [L] Finding 7: No testing strategy for OTel integration beyond "Add tests for telemetry module"

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** SPEC.md Section 13 (Next actions, step 10)
**Issue:** The implementation plan's final step is "Add tests for telemetry module (init, no-op, span creation)." This covers the telemetry.ts module in isolation but does not address:

- How to verify span hierarchies are correct (parent-child relationships in the API handler flow).
- How to verify that disabling OTel truly produces zero overhead (not just "no spans" but no measurable performance impact).
- How to test log correlation (traceId appears in pino output when within a span).
- Whether an in-memory exporter should be used for integration tests (OTel provides `InMemorySpanExporter` for this purpose).

For a "Must" requirement like "Zero measurable overhead when OTEL_SDK_DISABLED=true," there should be a concrete testing approach.

**Current design:** "Add tests for telemetry module (init, no-op, span creation)" as a single implementation step.

**Alternative:** Expand the testing plan:
1. Unit tests for `telemetry.ts` (init, no-op, shutdown idempotency).
2. Integration tests using `InMemorySpanExporter` to verify span attributes, hierarchy, and metric values for at least the API request flow.
3. A benchmark test (can be manual/documented) comparing request throughput with OTEL_SDK_DISABLED=true vs false.

**Trade-off:** More testing work upfront, but validates the non-functional requirements that the spec explicitly commits to.

**Status:** CHALLENGED
**Suggested resolution:** Expand step 10 to cover at least in-memory exporter integration tests and a documented benchmark procedure for the zero-overhead claim.

---

## Confirmed Design Choices (summary)

**DC1 (Simpler alternative):**
- The choice of `sdk-trace-base` over `sdk-trace-node` for Bun compatibility is well-reasoned and supported by evidence.
- Manual instrumentation (D6) is correctly motivated by Bun's lack of require-hook support.
- The global OTel API pattern (D8) is the standard approach and avoids unnecessary DI complexity.

**DC2 (Stakeholder gap):**
- The decision to make debounced operations independent root spans (D11) is architecturally sound and well-documented in evidence/context-propagation.md.
- Default-to-disabled (D5) correctly serves the CI/test persona.
- The security constraint (no document content in span attributes) is explicitly called out -- good.

**DC3 (Framing validity):**
- The core Problem Statement holds: performance questions are genuinely unanswerable today, and OTel is the appropriate resolution.
- The three dimensions (no measurement, growing system, invisible bottlenecks) are genuinely interconnected, not just co-occurring.
- The urgency is real: `syncTextToFragment` is a suspected hot path with no way to confirm or refute without instrumentation.
