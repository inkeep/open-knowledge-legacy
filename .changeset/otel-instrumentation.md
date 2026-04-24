---
"@inkeep/open-knowledge-server": minor
"@inkeep/open-knowledge-app": minor
---

feat: OpenTelemetry instrumentation — opt-in end-to-end traces + metrics + log correlation across the browser → HTTP → Hocuspocus → persistence → shadow-repo → disk chain. Zero overhead when disabled (server default: `OTEL_SDK_DISABLED=true`; frontend default: `VITE_OTEL_ENABLED` unset, SDK dynamic-import-gated out of main bundle). Ships a local Grafana LGTM docker-compose stack at `docker/otel-dev/` (Grafana + Tempo + Loki + Prometheus + OTel Collector) with auto-provisioned datasources — no third-party subscriptions required. Adds `packages/server/src/fs-traced.ts` as the sanctioned path for instrumented disk writes (hand-rolled because `@opentelemetry/instrumentation-fs` is broken under Bun). Pino log records now carry `trace_id` / `span_id` / `trace_flags` via `otelMixin` for trace↔log correlation in Grafana.
