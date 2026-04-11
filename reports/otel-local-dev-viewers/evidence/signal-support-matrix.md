# Evidence: Signal Support and OTLP Compatibility Matrix

**Dimension:** Signal coverage and protocol compatibility
**Date:** 2026-04-09
**Sources:** Official docs, GitHub repos, Docker Hub

---

## Key sources referenced

- Each tool's official documentation and GitHub README
- OpenTelemetry OTLP specification: https://opentelemetry.io/docs/specs/otlp/

---

## Findings

### Finding: Comprehensive signal and protocol support matrix across all tools
**Confidence:** CONFIRMED
**Evidence:** Aggregated from individual tool documentation (see per-tool evidence files)

| Tool | Traces | Metrics | Logs | Profiles | OTLP gRPC (4317) | OTLP HTTP (4318) |
|------|--------|---------|------|----------|-------------------|-------------------|
| Grafana otel-lgtm | Yes | Yes | Yes | Yes (Pyroscope) | Yes | Yes |
| Aspire Dashboard | Yes | Yes | Yes (structured) | No | Yes | Yes |
| Jaeger all-in-one | Yes | SPM only* | No | No | Yes | Yes |
| OpenObserve | Yes | Yes | Yes | No | Yes | Yes |
| SigNoz | Yes | Yes | Yes | No | Yes | Yes |
| Uptrace | Yes | Yes | Yes | No | Yes | Yes |
| otel-tui | Yes | Yes | Yes | No | Yes | Yes |
| otel-desktop-viewer | Yes | No | No | No | Yes | Yes |

*Jaeger SPM: Service Performance Monitoring derives RED metrics (Request rate, Error rate, Duration) from trace spans via SpanMetrics connector. Not the same as receiving arbitrary application metrics.

### Finding: All tools accept standard OTLP on default ports
**Confidence:** CONFIRMED

Every tool evaluated accepts OTLP on the standard ports (4317 for gRPC, 4318 for HTTP). The Aspire Dashboard internally maps to different ports (18889/18890) but the docker run command maps them to 4317/4318 externally. This means the application's OTel SDK configuration (`OTEL_EXPORTER_OTLP_ENDPOINT`) does not need to change when switching between viewers.

**Implications:** All tools are drop-in compatible with the standard OTel SDK environment variable configuration. Switching between viewers requires only stopping one container and starting another — no application code changes.

---

## Gaps / follow-ups

* OTLP/JSON (as opposed to OTLP/protobuf over HTTP) support varies — Aspire Dashboard confirmed to support it, others may only support protobuf.
