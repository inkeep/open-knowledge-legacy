# Local OpenTelemetry stack (Grafana LGTM)

Opt-in local observability for Open Knowledge. Run it when you want to look at traces / logs / metrics; leave it off the rest of the time. **Nothing in this stack runs, or affects the app, unless you explicitly bring it up.** Default dev build has the OTel SDK disabled on the server (no exporter calls) AND bundle-eliminated on the frontend (~0 KB of OTel code ships when the flag is off).

Contents: Grafana + Tempo + Loki + Prometheus + OTel Collector, all local, zero subscription, no data leaves your machine.

---

## Prerequisites

1. **Docker Desktop** (or any Docker + Docker Compose). Run `docker info` to confirm. Apple Silicon + Intel Mac + Linux all tested.
2. **Ports free on your host:** `3001` (Grafana), `3100` (Loki), `3200` (Tempo), `9090` (Prometheus), `14317` / `14318` (OTLP collector), `18889` (collector metrics).
   - We use `14317 / 14318` instead of the OTel-default `4317 / 4318` so this stack doesn't collide with any other local OTel collector you might run (SignOz, Jaeger, another project). If you want defaults, edit `docker-compose.yml`.

If any of those ports are taken: `lsof -i :3001 -P -n` will show the culprit. Either stop it, or remap in `docker/otel-dev/docker-compose.yml`.

---

## Quick start (3 commands)

From the repo root:

```bash
# 1. Start the stack (runs in background)
docker compose -f docker/otel-dev/docker-compose.yml up -d

# 2. Run the dev server with OTel on
OTEL_SDK_DISABLED=false \
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:14318 \
VITE_OTEL_ENABLED=true \
VITE_OTEL_COLLECTOR_URL=http://localhost:14318 \
bun run dev --filter=@inkeep/open-knowledge-app

# 3. Open Grafana
open http://localhost:3001
```

Grafana is pre-configured with anonymous admin access (no login screen). Datasources (Tempo / Loki / Prometheus) are auto-provisioned — they appear the moment Grafana boots.

---

## Seeing your first trace

1. Open the app at **http://localhost:5173** in a browser (started by `bun run dev`).
2. Click or type something in the editor — a document save, a file-tree interaction, anything that hits `/api/*`.
3. Open **http://localhost:3001** → left sidebar → **Explore** (compass icon).
4. Top-left **datasource dropdown** → choose **Tempo**.
5. **Search** tab → **Service Name** → `open-knowledge-server` → click **Run query**.
6. A list of traces appears. Click any row → the span flame graph loads on the right.

You'll see spans like `HTTP POST /api/agent-write-md`, `persistence.onStoreDocument`, `fs.writeFile`, `shadow.commitWip`. See [what's instrumented](#whats-instrumented) below for the full chain.

### Seeing a specific trace by ID

The dev server logs the `trace_id` on every pino log line when OTel is enabled. Copy one from the terminal and:

1. Grafana → Explore → Tempo → **Search** tab
2. **Trace ID** field → paste the ID
3. Run query

---

## Turning it off

### Temporarily (keep stack running, run app without OTel)

Just drop the env vars on the next `bun run dev` invocation. The app reverts to its normal no-OTel path:

```bash
bun run dev --filter=@inkeep/open-knowledge-app
```

The Docker stack keeps running in the background. No cost if nothing is exporting to it. Teardown when you're done with it.

### Completely (stop the stack)

```bash
# Stop containers, keep volumes (restart is fast)
docker compose -f docker/otel-dev/docker-compose.yml down

# Stop containers AND delete persisted traces / logs / metrics
docker compose -f docker/otel-dev/docker-compose.yml down -v
```

---

## Is it actually off by default?

Yes. Two independent gates:

| Gate | Default | What it does when off |
|---|---|---|
| `OTEL_SDK_DISABLED` (server) | unset/truthy → **disabled** | Server's `initTelemetry()` returns a no-op tracer. Every `withSpan(...)` call becomes a 2-instruction function call (no allocations, no network). Pino log records do NOT carry `trace_id` / `span_id`. |
| `VITE_OTEL_ENABLED` (frontend) | unset → **disabled** | The OTel SDK never loads — literally `import('./telemetry-impl')` is never called, so the ~23 KB gzipped chunk stays on disk. No network calls, no preflight CORS, no user-interaction spans. |

You have to set `OTEL_SDK_DISABLED=false` (note: `=false` means **enable** — this follows the OTel spec convention) to turn the server on, AND `VITE_OTEL_ENABLED=true` for the frontend. Independently toggleable.

---

## Env vars (full reference)

### Server

| Variable | Default | Effect |
|---|---|---|
| `OTEL_SDK_DISABLED` | `true` (anything except `"false"`) | **Master switch.** Must be exactly `"false"` to enable the SDK. Any other value → no-op tracer + no-op meter, zero overhead. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | Base OTLP/HTTP endpoint. This stack uses `http://localhost:14318`. If you're using the LGTM stack's defaults, override this. |
| `OTEL_SERVICE_NAME` | `open-knowledge-server` | `service.name` resource attribute. Change if you run multiple instances against the same collector. |
| `OTEL_SERVICE_VERSION` | `0.2.0` | `service.version` resource attribute. |
| `OTEL_TRACES_SAMPLER` | `parentbased_always_on` | Standard OTel sampler. `parentbased_traceidratio` + `OTEL_TRACES_SAMPLER_ARG=0.1` gives 10% sampling. |
| `OTEL_RESOURCE_ATTRIBUTES` | (none) | Comma-separated `k=v` pairs folded into the resource. Example: `deployment.environment=local,team=backend`. |

### Frontend (Vite)

| Variable | Default | Effect |
|---|---|---|
| `VITE_OTEL_ENABLED` | (unset) | **Must be exactly `"true"`** to load the browser SDK. Any other value → dynamic import never fires, OTel code never ships in the browser. |
| `VITE_OTEL_COLLECTOR_URL` | `http://localhost:4318` | Base OTLP/HTTP endpoint for the browser exporter. This stack uses `http://localhost:14318`. |
| `VITE_APP_VERSION` | `dev` | `service.version` for browser spans. |

Vite env vars must be prefixed `VITE_` — they're read at build time and inlined into the bundle.

### Collector (docker-compose)

Edit `docker/otel-dev/docker-compose.yml` to remap host ports. The collector's internal container port is always `4317 / 4318` — only the host-side exposure (`14317:4317`, `14318:4318`) is configurable.

---

## What's instrumented

Full chain, browser → disk, in a single Grafana Tempo flame graph when both gates are on:

```
[browser]  UserInteractionInstrumentation (click / submit)
   │
   └─► FetchInstrumentation (/api/*, auto-injects W3C traceparent)
          │
          └─► [server]  HTTP <method> <route>  (SpanKind.SERVER, extracts traceparent)
                 ├─► agent.applyAgentMarkdownWrite   (doc.name, markdown.bytes)
                 ├─► persistence.onLoadDocument       (doc.name)
                 ├─► persistence.onStoreDocument       (doc.name, persistence.bytes)
                 │      ├─► fs.mkdir / fs.writeFile / fs.rename   (fs.bytes, fs.path.role)
                 │      └─► persistence.commitToWipRef
                 │            └─► shadow.commitWip / shadow.commitWipFromTree   (shadow.writer, shadow.branch)
                 │                  └─► fs.writeFileSync   (tmp-blob staging)
                 └─► file_watcher.process_event   (external disk changes)
```

Attributes on every span are bounded-cardinality — paths are normalized to last-two-segments, writer/branch names are identifiers (not content). Safe for dashboards.

Metrics emitted (Prometheus):
- `http.server.request.duration` (histogram, seconds) — labels: `http.request.method`, `http.route`, `http.response.status_code`
- `ok.persistence.load.duration` / `ok.persistence.store.duration` / `ok.persistence.git_commit.duration` (histograms, seconds) — **no per-doc label** (bounded cardinality for Prometheus; spans still carry `doc.name` for filtering in Tempo)
- `ok.file_watcher.events` (counter) — labels: `disk.kind`, `self` (true/false)

Pino log records include `trace_id` / `span_id` / `trace_flags` (via `otelMixin` in `packages/server/src/logger.ts`). Click `trace_id=<hex>` in any log line in Loki → jump to the trace in Tempo (derived-fields rule in `grafana/provisioning/datasources/datasources.yaml`).

---

## Troubleshooting

**"I enabled OTel but no traces appear in Grafana"**
1. Confirm the env vars are actually set in the shell that launched `bun run dev`: `echo $OTEL_SDK_DISABLED` (must print `false`, not `true`).
2. Confirm the dev server printed the OTel init log: `[telemetry] OpenTelemetry initialized — traces + metrics exporting via OTLP/HTTP`. No log → the SDK never initialized, check env var propagation.
3. Confirm the collector received data: `docker logs ok-otel-collector | grep Traces`. If empty, the SDK can't reach the collector — check the `OTEL_EXPORTER_OTLP_ENDPOINT` value matches the stack's `14318`.
4. Grafana's time picker defaults to last hour. If your test traffic is older, widen the range (top-right).

**Port already in use on startup**
- `docker compose up` fails with `Bind for 0.0.0.0:3001 failed: port is already allocated`: edit `docker-compose.yml`, change the host side of the `ports:` entry (e.g. `"3002:3000"`), rerun.

**Frontend OTel never loads**
- Check the browser console for `[otel] frontend telemetry initialized`. If absent, `VITE_OTEL_ENABLED` wasn't set at Vite's startup (it's a build-time env, set it BEFORE `bun run dev`).

**Collector crashloops**
- `docker logs ok-otel-collector` usually names the problem. Common cause: Loki's `allow_structured_metadata: true` requires Loki 3.x — if you pinned an older image, the OTLP logs pipeline will fail.

**Tempo returns "Ingester not ready"**
- Tempo has a ~15 s readiness delay on cold start. Wait, then retry.

**I want to see the data being exported, not just the graphs**
- `debug` exporter is enabled at `verbosity: basic` in `otel-collector-config.yaml`. `docker logs -f ok-otel-collector` shows span/log/metric batch counts as they land.

---

## Optional: single-image alternative

If you'd rather run one container than five, swap the compose file for the bundled `grafana/otel-lgtm` image. Everything lives in one image with datasources pre-wired; less flexible, easier for quick demos.

```yaml
# docker-compose.yml — single-image variant
services:
  otel-lgtm:
    image: grafana/otel-lgtm:0.11.9
    ports:
      - "3001:3000"    # Grafana
      - "4317:4317"    # OTLP/gRPC
      - "4318:4318"    # OTLP/HTTP
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
    volumes:
      - otel-lgtm-data:/data
volumes:
  otel-lgtm-data:
```

Ports revert to OTel defaults (4317/4318). Remap if you already have another collector.

---

## File layout

```
docker/otel-dev/
├── README.md                       — this file
├── docker-compose.yml              — service definitions (5 containers + 4 volumes)
├── otel-collector-config.yaml      — OTLP receiver + Tempo/Loki/Prometheus exporters
├── tempo.yaml                      — trace storage, 48h retention, local backend
├── loki-config.yaml                — log storage, OTLP ingestion enabled
├── prometheus.yml                  — scrape config (pulls collector metrics)
└── grafana/
    └── provisioning/
        └── datasources/
            └── datasources.yaml    — Tempo + Loki + Prometheus wiring with trace↔log↔metric links
```

All configs are vendored in the repo — you can modify any of them without rebuilding images. Changes apply on `docker compose restart <service>`.
