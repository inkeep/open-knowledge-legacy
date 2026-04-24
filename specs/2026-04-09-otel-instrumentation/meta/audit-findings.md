# Audit Findings

**Artifact:** specs/2026-04-09-otel-instrumentation/SPEC.md
**Audit date:** 2026-04-09
**Total findings:** 7 (2 high, 3 medium, 2 low)

---

## High Severity

### [H1] Finding 1: Dependency versions are stale -- OTel JS SDK 2.x shipped with breaking API changes

**Category:** FACTUAL
**Source:** T3/T4 (3P dependency verification, web verification)
**Location:** Section 9 (Proposed solution -- Dependencies and telemetry.ts code sample), Section 12 (Assumptions)
**Issue:** The spec pins `^1.30.0` for `@opentelemetry/sdk-trace-base`, `@opentelemetry/sdk-metrics`, `@opentelemetry/resources`, `@opentelemetry/context-async-hooks`, and `@opentelemetry/semantic-conventions`. The OTel JS SDK 2.0 was released in late February 2025. Current stable versions are 2.x for these packages (e.g., `sdk-trace-base` is at 2.6.0). Pinning `^1.30.0` would install 1.x versions that are now behind the latest and will increasingly fall behind on fixes and features.

More critically, the **telemetry.ts code sample uses APIs that changed in 2.x**:

1. **`BasicTracerProvider.addSpanProcessor()`** -- removed in 2.0. Must use constructor `spanProcessors` option instead.
2. **`new Resource({ ... })`** -- constructor signature changed in 2.0. Should use `resourceFromAttributes()` from `@opentelemetry/resources`.
3. **`BasicTracerProvider({ resource })`** -- the `resource` option now uses the new Resource type.

Similarly, exporter packages (`@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/exporter-metrics-otlp-http`) are pinned at `^0.57.0` but the 2.x generation uses `>=0.200.0` for unstable packages.

**Current text:** `"@opentelemetry/sdk-trace-base": "^1.30.0"` and code showing `tracerProvider.addSpanProcessor(new BatchSpanProcessor(traceExporter))` and `const resource = new Resource({ [ATTR_SERVICE_NAME]: ... })`
**Evidence:** npm registry shows `@opentelemetry/sdk-trace-base` latest is 2.6.0 (published ~20 days ago). The [OTel JS SDK 2.0 announcement](https://opentelemetry.io/blog/2025/otel-js-sdk-2-0/) and [upgrade guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/upgrade-to-2.x.md) document the breaking changes to `addSpanProcessor`, `Resource` constructor, and version numbering.
**Status:** STALE
**Suggested resolution:** Update all dependency versions to the 2.x generation. Rewrite the `telemetry.ts` code sample to use the 2.x API:
- Replace `tracerProvider.addSpanProcessor(...)` with `new BasicTracerProvider({ ..., spanProcessors: [...] })`
- Replace `new Resource({...})` with `resourceFromAttributes({...})`
- Update exporter versions from `^0.57.0` to `^0.200.0` or later
- Update `@opentelemetry/api` from `^1.9.0` to current (API is stable, 1.9.0 minimum is correct as peer dep but latest is recommended)

---

### [H2] Finding 2: `@opentelemetry/context-async-hooks` AsyncHooksContextManager is deprecated and Bun has known AsyncLocalStorage performance concerns

**Category:** FACTUAL
**Source:** T3/T4 (3P dependency and web verification)
**Location:** Section 9 (telemetry.ts code sample), Section 12 (Assumptions A1, A2), Section 10 (Decision D7), Section 14 (Risks)
**Issue:** The spec imports `AsyncLocalStorageContextManager` from `@opentelemetry/context-async-hooks` and manually sets it as the global context manager. Two concerns:

1. **Deprecation:** The `AsyncHooksContextManager` in this package is deprecated and scheduled for removal in v3. The package itself is being restructured. While `AsyncLocalStorageContextManager` (which the spec uses) is the recommended alternative, the spec should acknowledge the package's transitional status and plan for when context management moves to a different package or becomes built-in to the SDK.

2. **Bun performance:** There have been reports of significant AsyncLocalStorage performance degradation in Bun (110k req/s dropping to 2k req/s with OTel context). While this was attributed to debug builds and reportedly does not affect release builds, the spec's risk table (Section 14) does not mention AsyncLocalStorage performance as a risk at all. Given that context propagation is on every instrumented code path, this deserves at least a risk entry.

**Current text:** `import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';` and Assumption A1: "`@opentelemetry/sdk-trace-node` works in Bun 1.3.11" (MEDIUM confidence)
**Evidence:** [npm page for @opentelemetry/context-async-hooks](https://www.npmjs.com/package/@opentelemetry/context-async-hooks) notes deprecation. [Bun issue #24324](https://github.com/oven-sh/bun/issues/24324) documents the AsyncLocalStorage performance concern (resolved for release builds but indicative of ongoing optimization work). The OTel SDK 2.x also changes how context managers are configured.
**Status:** STALE
**Suggested resolution:** (1) Add a note in the Dependencies section acknowledging the transitional status of `@opentelemetry/context-async-hooks` and that context management may be restructured in SDK 3.x. (2) Add a risk entry for AsyncLocalStorage performance on Bun: low likelihood (release builds are fine), medium impact, mitigation is benchmarking with OTel enabled vs disabled. (3) Update Assumption A1 text -- it references `sdk-trace-node` but the decision was to use `sdk-trace-base` (D7), making the assumption text internally inconsistent.

---

## Medium Severity

### [M1] Finding 3: Console call count is inconsistent across the spec and evidence

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L4 (evidence-synthesis fidelity)
**Location:** Section 1 (Problem statement), Section 6 (Requirements), Section 8 (Current state), evidence/server-architecture.md, evidence/console-log-inventory.md
**Issue:** The spec uses "~27" as the console call count in multiple places:
- Section 1: "~27 scattered `console.log` calls"
- Section 6 requirement row: "Existing ~27 console calls migrated"
- Section 8: "~27 console.log/error calls"
- evidence/server-architecture.md: "~27 console calls"

However, the evidence/console-log-inventory.md file lists individual calls and tallies "Total: ~25 console calls across 5 files." The actual codebase has exactly **25** console calls (persistence: 8, api-extension: 6, agent-sessions: 4, file-watcher: 4, standalone: 3).

Additionally, the evidence/console-log-inventory.md itself has an internal inconsistency: the header for persistence.ts says "(6 calls)" but then lists **8** individual items (numbered 1-8). The evidence/server-architecture.md says persistence has "6 calls" which also contradicts the actual 8.

**Current text:** "~27 scattered `console.log` calls" (SPEC.md) vs "Total: ~25 console calls across 5 files" (evidence) vs 25 actual
**Evidence:** `grep -c 'console\.\(log\|error\|warn\)' packages/server/src/*.ts` yields: persistence:8, api-extension:6, agent-sessions:4, file-watcher:4, standalone:3 = 25 total
**Status:** INCOHERENT
**Suggested resolution:** Standardize to "25" (the actual count) throughout SPEC.md and evidence files. Fix the persistence.ts section header in both evidence files from "(6 calls)" to "(8 calls)".

---

### [M2] Finding 4: Assumption A1 text contradicts Decision D7

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** Section 12 (Assumptions A1), Section 10 (Decision D7)
**Issue:** Assumption A1 states "`@opentelemetry/sdk-trace-node` works in Bun 1.3.11" with MEDIUM confidence. But Decision D7 explicitly chose `sdk-trace-base` over `sdk-trace-node`, and the spec's entire approach deliberately avoids `sdk-trace-node`. Assumption A1 should be about `sdk-trace-base` (which is what the implementation will actually use), not `sdk-trace-node` (which was rejected).

This is confusing for a reader: the assumption table says we're assuming sdk-trace-node works, while the decision log says we chose not to use it.

**Current text:** "A1: `@opentelemetry/sdk-trace-node` works in Bun 1.3.11" — MEDIUM confidence
**Evidence:** D7 rationale: "`sdk-trace-node` uses `AsyncHooksContextManager` which may not work in Bun; `sdk-trace-base` is runtime-agnostic"
**Status:** INCOHERENT
**Suggested resolution:** Rewrite A1 to: "`@opentelemetry/sdk-trace-base` + `@opentelemetry/context-async-hooks` (AsyncLocalStorageContextManager) works in Bun 1.3.11" -- HIGH confidence (based on evidence of Bun's AsyncLocalStorage support). Or remove A1 entirely since the verification plan is "before implementation" and the decision has already been made.

---

### [M3] Finding 5: Instrumentation code sample uses `context` and `trace` imports but `context` is not imported in the example

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity), reader pass
**Location:** Section 9 (Instrumentation pattern example: api-extension.ts)
**Issue:** The code sample for `api-extension.ts` instrumentation uses `context.with(trace.setSpan(context.active(), span), ...)` but the import statement only shows `import { SpanKind, SpanStatusCode } from '@opentelemetry/api'`. The `context` and `trace` objects are also needed from `@opentelemetry/api` but are not in the import.

Additionally, the `getTracer()` and `getMeter()` imports from `./telemetry.ts` are shown, but the code creates a histogram named `http.server.request.duration` with unit `ms` while `performance.now()` returns milliseconds -- this is correct but worth noting since OTel semantic conventions recommend seconds for `http.server.request.duration`. The metric name matches the OTel semantic convention name but the unit differs from the convention's expected `s` (seconds).

**Current text:** `import { SpanKind, SpanStatusCode } from '@opentelemetry/api';` followed by usage of `context` and `trace`
**Evidence:** The `context` and `trace` are top-level exports from `@opentelemetry/api` that must be imported to use `context.with()`, `context.active()`, and `trace.setSpan()`.
**Status:** INCOHERENT
**Suggested resolution:** Update the import to: `import { SpanKind, SpanStatusCode, context, trace } from '@opentelemetry/api';`. Consider whether `http.server.request.duration` should use seconds (per OTel semantic conventions) or milliseconds (as currently specified), and document the choice.

---

## Low Severity

### [L1] Finding 6: Evidence file line numbers are slightly off for two persistence.ts entries

**Category:** FACTUAL
**Source:** T1 (own codebase verification)
**Location:** evidence/console-log-inventory.md
**Issue:** Two line numbers in the persistence.ts section of the console-log-inventory are off by one:
- Listed as "L74" -- actual line is 73
- Listed as "L76" -- actual line is 75

All other line number references in the evidence file are accurate.

**Current text:** "1. L74: `console.log('[persistence] Empty repo...')`" and "2. L76: `console.error('[persistence] Failed to read HEAD tree...')`"
**Evidence:** `grep -n` on persistence.ts shows these calls at lines 73 and 75 respectively.
**Status:** CONTRADICTED
**Suggested resolution:** Update line numbers to L73 and L75.

---

### [L2] Finding 7: The spec's `onRequest` code sample differs from actual Hocuspocus handler signature

**Category:** COHERENCE
**Source:** T1 (own codebase), reader pass
**Location:** Section 9 (Instrumentation pattern example)
**Issue:** The spec's instrumentation code sample shows the `onRequest` handler with `async onRequest({ request, response })` and accesses `request.url?.split('?')[0]`. This matches the actual codebase pattern. However, the sample wraps route execution in `context.with(trace.setSpan(...))` which requires the route handler to be awaited inside the context scope. The actual code does `await handler(request, response)` without returning a value. The pattern shown would work but adds nesting depth. This is a minor style concern -- the implementation can decide the exact wrapping approach.

**Current text:** Code sample wrapping route handling in `context.with()`
**Evidence:** Actual `onRequest` handler at api-extension.ts:304-312
**Status:** INCOHERENT
**Suggested resolution:** No change required -- this is a code style preference. The implementation should ensure context propagation works with the existing handler dispatch pattern. Consider noting that the exact wrapping approach is an implementation detail (DELEGATED).

---

## Confirmed Claims (summary)

**T1 (Own codebase):**
- Server module map and architecture described in evidence/server-architecture.md accurately reflects the current codebase structure, function names, file locations, and module responsibilities.
- `createServer()` factory in standalone.ts returns `{ hocuspocus, sessionManager, destroy }` -- confirmed.
- `destroy()` at standalone.ts:109-117 handles watcher unsubscribe, session close, pending store flush -- confirmed.
- Debounce values (2000ms, 10000ms, 30000ms) match actual code in standalone.ts and persistence.ts -- confirmed.
- `syncTextToFragment()` at agent-sessions.ts:39-50 does a full re-parse (stripFrontmatter -> mdManager.parse -> schema.nodeFromJSON -> updateYFragment) -- confirmed.
- File watcher uses SHA-256 hash queue with 10s TTL for self-write detection -- confirmed.
- 6 API endpoints match the routes record in api-extension.ts -- confirmed.
- `PinoLogger` class exists with `getLogger()` convenience function but is not imported by any server source file (only tests and index re-export) -- confirmed.
- Agent writes use `dc.document.transact(fn, AGENT_WRITE_ORIGIN)` pattern -- confirmed at api-extension.ts:73-88.

**L (Coherence lenses):**
- L5 (summary coherence): Goals, requirements, proposed solution, and decision log are internally consistent in their overall narrative.
- L6 (stance consistency): The document maintains a prescriptive spec stance throughout -- consistent.
- L3 (conditionality): Bun version conditioning is properly stated (Bun 1.3.11).
- Context propagation analysis (evidence/context-propagation.md) correctly identifies three timing domains and the conclusion that debounced operations must be independent root spans is architecturally sound -- confirmed by code review of persistence.ts (setTimeout-based debounce at L116-133).

**T3/T4 (3P dependencies):**
- `ATTR_SERVICE_NAME` is a valid export from `@opentelemetry/semantic-conventions` -- confirmed.
- OTLP/HTTP exporters use fetch (Bun-compatible) -- confirmed.
- `@opentelemetry/api` provides no-op implementations when no SDK is registered -- confirmed per OTel API spec.
- `@opentelemetry/api` will not receive breaking changes (stable API guarantee) -- confirmed.

## Unverifiable Claims

- **A2: "BatchSpanProcessor works in Bun (uses setTimeout, not worker threads)"** -- Directionally plausible (BatchSpanProcessor does use timer-based batching), but the specific claim that it avoids worker threads entirely was not verified from source. The assumption is labeled HIGH confidence which seems appropriate but implementation testing is still needed.
- **Performance claim "<1ms per span when enabled"** -- This is a reasonable target based on general OTel benchmarks but has not been verified specifically for the Bun runtime. No contradicting evidence found.
- **Bun 1.3.11 specific compatibility** -- General Bun+OTel compatibility is well-documented, but the specific Bun version 1.3.11 was not individually verified. Given Bun's AsyncLocalStorage support timeline, this is likely fine but remains unverified at the exact version level.
