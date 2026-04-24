# Changelog

## 2026-04-09 — Session 1

- **Intake complete:** Problem framed (SCR), stress-tested, personas identified
- **Decisions confirmed:**
  - D1: All three OTel signals (traces + metrics + logs) — LOCKED
  - D2: Telemetry module in `packages/server/src/telemetry.ts` — LOCKED
  - D3: OTLP/HTTP exporter only (no console exporter) — LOCKED
  - D4: Follow OTel standard env vars — LOCKED
- **Scaffold:** SPEC.md created, evidence/ and meta/ directories initialized
- **Investigation:** Full codebase exploration of server package, Bun+OTel compatibility confirmed
- **Key finding:** Debounced operations (persistence, git) must be independent root spans — they aggregate multiple requests (evidence/context-propagation.md)
- **SDK choice resolved:** `sdk-trace-base` + `context-async-hooks` (not `sdk-trace-node`) for Bun compatibility → D7
- **Decisions D7-D12 added:** sdk-trace-base, global API, syncTextToFragment both span+metric, separate LOG_LEVEL, independent root spans for debounced ops, graceful shutdown
- **Local dev viewer research:** Recommended Grafana otel-lgtm (Docker) or otel-tui (brew) — evidence/local-dev-viewers.md
- **Backlog extracted:** 10 questions, 8 resolved; Q9 (console→pino migration) needs user input
- **D13 confirmed:** console.log → pino migration included in scope (user decision)
- **Audit + Challenger completed** (14 findings total: 5 high, 6 medium, 3 low)
- **Corrections applied:**
  - Updated all OTel deps from 1.x to 2.x; rewrote telemetry.ts to use SDK 2.x APIs (`spanProcessors` constructor, `resourceFromAttributes()`)
  - Fixed metric unit to seconds (OTel semantic conventions), attribute to `http.request.method`, dropped redundant counter
  - Fixed console call count from "~27" to 25 throughout; fixed persistence.ts header from "(6 calls)" to "(8 calls)"
  - Fixed Assumption A1 to reference `sdk-trace-base` (not `sdk-trace-node`)
  - Fixed missing `context`/`trace` imports in code sample
  - Fixed line numbers L74→L73, L76→L75 in evidence
  - Added AsyncLocalStorage performance regression to risk table (Medium/High)
  - Added `shutdownTelemetry()` wiring as explicit implementation step
  - Added STOP_IF for AsyncLocalStorage throughput degradation >10%
  - Expanded testing plan: InMemorySpanExporter integration tests + benchmark procedure
- **Design challenges resolved:** user confirmed ship-all-together (no phasing) and bundled console→pino migration
- **Verification complete:** Resolution completeness gate passed, 1-way doors verified (metric naming aligned with OTel semconv), Future Work classified
- **Status:** Draft → Approved

## 2026-04-23 — Session 2 (scope expansion + rebase on main)

Context: PR #36 was opened 2026-04-10 with server-only scope. Branch sat 13 days; `main` advanced 342 commits. User requested full-chain observability, local Grafana viewer, and rebase-on-main in one pass. Scope expanded, rebase completed via reset-and-reapply (raw 342-commit rebase had cascading conflicts on heavily-refactored files; preserving spec + re-instrumenting current code was lower risk than per-commit merge resolution).

- **Rebase strategy:** reset branch to `origin/main` (b34922d9), preserved spec directory via `git archive`, preserved `telemetry.ts`/`telemetry.test.ts`/`logger.ts` patch via file copy to `/tmp`. Added OTel deps to current `packages/server/package.json`, re-instrumented the current versions of `persistence.ts` / `api-extension.ts` / `agent-sessions.ts` / `file-watcher.ts` / `shadow-repo.ts` / `boot.ts` / `standalone.ts` — these had all been substantially refactored during the 342-commit window.
- **Goals added:** G7 (end-to-end trace propagation), G8 (frontend instrumentation)
- **Non-goals flipped:** NG2 (frontend) → G8; NG3 (local viewer) → G6 + `docker/otel-dev/` stack
- **New non-goals:** NG2 (`instrumentation-fs` broken on Bun — hand-rolled `fs-traced.ts` is the sanctioned path); NG3 (no hosted-observability default — local LGTM is the default, OTLP endpoint is overridable); NG4 (no `ZoneContextManager` — default `StackContextManager` is sufficient for React 19)
- **User stories added:** US-009..US-019 (see SPEC §17)
- **New files:**
  - `packages/server/src/fs-traced.ts` — every `writeFile/rename/mkdir/unlink` wrapped with a span
  - `packages/app/src/telemetry.ts` + `telemetry-impl.ts` — dynamic-import lazy loader keeps the ~45 KB OTel SDK out of the main bundle
  - `packages/app/src/editor/collab-otel.ts` — Hocuspocus WebSocket traceparent query-param injection
  - `docker/otel-dev/` — full LGTM docker-compose stack + Grafana datasource provisioning + Tempo/Loki/Prometheus configs + README
- **Instrumentation added:**
  - Server HTTP `onRequest` wrapped with `SpanKind.SERVER` span + W3C traceparent extraction + `http.server.request.duration` histogram
  - `persistence.onLoadDocument` + `onStoreDocument` + `commitToWipRef` wrapped with spans + histograms
  - `applyAgentMarkdownWrite` + `applyAgentUndo` wrapped with spans
  - `commitWip` + `commitWipFromTree` + `commitUpstreamImport` + `parkBranch` + `saveVersion` wrapped
  - `file_watcher.process_event` span + `ok.file_watcher.events` counter
  - `fs.writeFile` / `fs.rename` / `fs.mkdir` / `fs.writeFileSync` / `fs.mkdirSync` / `fs.renameSync` / `fs.unlinkSync` spans at every migrated call site
  - Pino `otelMixin` injects `trace_id` / `span_id` / `trace_flags` into every log record
  - Frontend: `DocumentLoadInstrumentation` + `FetchInstrumentation` (with `/api/*` traceparent injection) + `UserInteractionInstrumentation`
- **CORS:** server now sends `Access-Control-Allow-Headers: ..., traceparent, tracestate, baggage` so browser OTel can inject headers on cross-origin fetch
- **Gate results:** `bun run check` ✓ (16/16 turbo tasks, 209 tests). `bun run size` ✓ (208.78 kB gzipped main, within 210 kB limit; 1050 kB combined limit accommodates lazy telemetry-impl chunk).
- **Deferred:** server-side `traceparent` extraction in Hocuspocus `onConnect` (US-015 — parked; fetch path already provides the dominant trace-initiation chain). Native OTLP logs pipeline (pino → Loki via OTel logs SDK — pino stdout still works with trace_id in records via `otelMixin`). Curated Grafana dashboards (bare datasources ship; dashboards come when asked).
