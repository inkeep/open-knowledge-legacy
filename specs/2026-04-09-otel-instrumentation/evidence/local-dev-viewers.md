---
title: OTel Local Dev Viewer Options
type: research
sources:
  - https://medium.com/@molof.1337/how-i-deployed-beautiful-universal-logs-using-opentelemetry-and-docker-e82a8ac3570c
  - https://grafana.com/blog/observability-in-under-5-seconds-reflecting-on-a-year-of-grafana-otel-lgtm/
---

## Recommendation: Two-tier local dev viewer strategy

Both listen on standard OTLP ports (4317/4318) — zero app-side config changes between them.

### Tier 1: Grafana otel-lgtm (deep analysis)

Single `docker run`, <5s startup, full Grafana UI with PromQL/LogQL/TraceQL.

```bash
docker run -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm -ti grafana/otel-lgtm
# UI: http://localhost:3000 (admin/admin)
```

Supports: traces + metrics + logs + profiles. Production-grade tooling learned during dev.

### Tier 2: otel-tui (quick checks, no Docker)

Terminal-based viewer, all three signals, `brew install`.

```bash
brew install ymtdzzz/tap/otel-tui
otel-tui  # listens on :4317 (gRPC) and :4318 (HTTP)
```

Ideal for "is my span showing up?" verification without Docker overhead.

### Also considered

| Tool | Verdict | Why |
|---|---|---|
| Aspire Dashboard | Good alternative | Lightest container, clean UI, but less query power than Grafana |
| Jaeger | Traces only | No metrics or logs — insufficient for all-three-signals setup |
| SigNoz / Uptrace | Too heavy | 4-6 containers, ClickHouse, 4GB+ RAM — overkill for local dev |
| OpenObserve | Non-standard | Needs custom port config (5080/5081), credential env vars |
| otel-desktop-viewer | Superseded | Traces only; otel-tui strictly superior |

### Key insight

Both viewers are **optional dev dependencies** — not required to run the application. OTel SDK handles "no collector running" gracefully (OTLP export failures are non-fatal by default).
