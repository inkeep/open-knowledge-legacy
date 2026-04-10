# Evidence: Single-Container Solutions

**Dimension:** Ease of setup — single docker run solutions
**Date:** 2026-04-09
**Sources:** GitHub repos, official docs, Docker Hub

---

## Key pages / repos referenced

- https://github.com/grafana/docker-otel-lgtm — Grafana LGTM all-in-one
- https://aspire.dev/dashboard/standalone/ — Aspire Dashboard standalone
- https://www.jaegertracing.io/docs/2.4/getting-started/ — Jaeger all-in-one
- https://github.com/openobserve/openobserve — OpenObserve single binary

---

## Findings

### Finding: Grafana otel-lgtm runs as a single container with all signals
**Confidence:** CONFIRMED
**Evidence:** https://github.com/grafana/docker-otel-lgtm

```bash
docker run -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm -ti grafana/otel-lgtm
```

Includes: OTel Collector, Prometheus, Loki, Tempo, Pyroscope, and Grafana.
Supports: traces, metrics, logs, and profiles.
Ports: 3000 (Grafana UI), 4317 (OTLP gRPC), 4318 (OTLP HTTP).
Startup: <5 seconds (improved from ~60s).
No configuration needed — works with OTel defaults.

**Implications:** Single command gets all signals working. No compose file needed. UI is full Grafana.

---

### Finding: Aspire Dashboard is a single container supporting all three signals
**Confidence:** CONFIRMED
**Evidence:** https://aspire.dev/dashboard/standalone/

```bash
docker run --rm -it -p 18888:18888 -p 4317:18889 -p 4318:18890 -d \
  --name aspire-dashboard \
  mcr.microsoft.com/dotnet/aspire-dashboard:latest
```

Supports: structured logs, traces, metrics.
Ports: 18888 (UI), 4317 mapped to 18889 (OTLP gRPC), 4318 mapped to 18890 (OTLP HTTP).
Works with any language sending OTLP — not .NET specific.
Auth: Token-based by default; disable with `DOTNET_DASHBOARD_UNSECURED_ALLOW_ANONYMOUS=true`.

**Implications:** Extremely lightweight. Purpose-built for local dev. No persistent storage (ephemeral). Language-agnostic despite .NET branding.

---

### Finding: Jaeger all-in-one is a single container, traces only
**Confidence:** CONFIRMED
**Evidence:** https://www.jaegertracing.io/docs/2.4/getting-started/

```bash
docker run --rm --name jaeger \
  -p 16686:16686 \
  -p 4317:4317 \
  -p 4318:4318 \
  jaegertracing/jaeger:2.4.0
```

Supports: traces only (with SPM derived metrics via SpanMetrics connector in v2).
Ports: 16686 (UI), 4317 (OTLP gRPC), 4318 (OTLP HTTP).
Storage: in-memory by default (transient).
Jaeger v2 built on OTel Collector core.

**Implications:** Best-in-class trace visualization but no native logs or metrics. SPM provides derived RED metrics from traces but not custom application metrics.

---

### Finding: OpenObserve runs as a single binary or single container with all signals
**Confidence:** CONFIRMED
**Evidence:** https://github.com/openobserve/openobserve

```bash
docker run -d --name openobserve \
  -v $PWD/data:/data \
  -p 5080:5080 \
  -e ZO_ROOT_USER_EMAIL="root@example.com" \
  -e ZO_ROOT_USER_PASSWORD="Complexpass#123" \
  public.ecr.aws/zinclabs/openobserve:latest
```

Supports: logs, metrics, traces, RUM.
Ports: 5080 (UI + API), 5081 (OTLP gRPC).
OTLP: HTTP and gRPC supported (HTTP since v0.6.4, gRPC since v0.7.4).
Built in Rust, single binary, 18.5k GitHub stars.
Also installable via brew or direct binary download.

**Implications:** Most feature-complete single-binary option. Written in Rust for low resource usage. Requires credential env vars. Persistent storage via local volume.

---

## Gaps / follow-ups

* Exact memory footprint comparison between these four tools under typical local dev load not available from docs — would require benchmarking.
