# Evidence: Medium Article Context (User-Provided Starting Point)

**Dimension:** Context — what the user found interesting
**Date:** 2026-04-09
**Sources:** https://medium.com/@molof.1337/how-i-deployed-beautiful-universal-logs-using-opentelemetry-and-docker-e82a8ac3570c

---

## Key points from the article

**Author's stack:**
- Logging library: Pino (NestJS microservice)
- Collector: OpenTelemetry Collector Contrib
- Visualization: Grafana otel-lgtm image
- Infrastructure: Docker Compose

**Architecture (3-tier pipeline):**
1. Application writes JSON logs to files (info.log, error.log)
2. OTel Collector uses filelog receiver to parse JSON logs, map severity, extract service names via regex
3. Exports to otel-lgtm for Grafana visualization on port 3000

**Docker Compose services:**
- Backend service (with mounted logs volume)
- Logrotate service (file rotation)
- otel-collector (Contrib image, health checks)
- otel-lgtm (Grafana on port 3000)

**Key insight:** The author used otel-lgtm as the all-in-one backend. Their approach added a separate OTel Collector to handle filelog-based ingestion (reading log files from disk). For a project using OTLP SDK exporters directly (like our Bun server), the separate collector is unnecessary — the SDK can export directly to otel-lgtm's built-in collector.

**Implications:** The article validates Grafana otel-lgtm as a practical choice. However, the article's architecture is more complex than needed for our use case because they collect file-based logs rather than using SDK-level OTLP export. Our setup would be simpler: SDK -> otel-lgtm directly (single container, no compose needed).

---

## Gaps / follow-ups

* Article focused on logs only — did not explore traces or metrics visualization in depth.
