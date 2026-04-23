# Local OpenTelemetry stack (LGTM)

Grafana + Tempo + Loki + Prometheus + OTel Collector, wired for Open Knowledge
dev. Opt-in — nothing runs unless you bring the stack up.

## Quick start

```bash
# 1. Bring up the stack
docker compose -f docker/otel-dev/docker-compose.yml up -d

# 2. Point the app at the collector (traces + metrics + logs over OTLP)
export OTEL_SDK_DISABLED=false
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# 3. Run the dev server (server + vite + hocuspocus)
bun run dev
```

Open Grafana at **http://localhost:3001**. Datasources (Tempo, Loki,
Prometheus) are auto-provisioned — anonymous admin access is enabled for
zero-friction local dev.

### Tear down

```bash
docker compose -f docker/otel-dev/docker-compose.yml down
# Optional: wipe persisted data too
docker compose -f docker/otel-dev/docker-compose.yml down -v
```

## What's instrumented

End-to-end trace chain, browser → disk:

```
user click (browser) → UserInteractionInstrumentation span
  → fetch('/api/agent-write-md')  → FetchInstrumentation span (injects traceparent header)
      → HTTP <method> <route>     → server onRequest span (extracts traceparent, kind=SERVER)
          → agent.applyAgentMarkdownWrite → updateYFragment / applyFastDiff
            → Hocuspocus observers settle (Observer A/B)
              → persistence.onStoreDocument (debounced) → fs.writeFile → fs.rename
                → persistence.commitToWipRef (debounced L2)
                  → shadow.commitWip → shadow.commitWipFromTree
```

Every fs-write goes through `fs-traced.ts` wrappers which emit `fs.writeFile`,
`fs.rename`, `fs.mkdir`, `fs.unlink` spans with a normalized path (last two
segments) and byte-size attribute.

## Env var reference

| Variable | Default | Effect |
|---|---|---|
| `OTEL_SDK_DISABLED` | `true` | Set to `"false"` to enable the SDK. Anything else is no-op — **zero overhead when disabled**. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP/HTTP endpoint. The compose stack listens on both 4317 (gRPC) and 4318 (HTTP). |
| `OTEL_SERVICE_NAME` | `open-knowledge-server` | `service.name` attribute. Change if running multiple instances against one collector. |
| `OTEL_SERVICE_VERSION` | `0.2.0` | `service.version` attribute. |
| `OTEL_RESOURCE_ATTRIBUTES` | (none) | Comma-separated `k=v` pairs folded into the resource (`OTEL_RESOURCE_ATTRIBUTES=deployment.environment=local`). |

## Ports (why 3001 for Grafana)

Open Knowledge's React dev server runs on **3000**. To keep Grafana reachable
without port-clashing, the compose file maps Grafana to **3001**. All other
ports (4317, 4318, 3100, 3200, 9090, 8889) match their defaults — override in
the compose file if you have another collector running.

## Troubleshooting

**No traces appearing in Grafana → Explore → Tempo**
- Verify `OTEL_SDK_DISABLED=false` is exported in the shell that runs
  `bun run dev`.
- Check `docker compose logs otel-collector` for preflight/CORS errors from
  the browser SDK.
- Hit `http://localhost:3200/ready` — Tempo responds `ready` when it can
  accept writes.

**`limits: structured_metadata` errors in Loki**
- The `limits_config.allow_structured_metadata: true` setting in
  `loki-config.yaml` is required for OTLP log ingestion. Don't remove it.

**Collector crash-looping**
- The config references `otel/opentelemetry-collector-contrib:0.116.1` — the
  contrib image includes the Loki/Prometheus/OTLP components. If you pin a
  different version, confirm the components still ship.

**Browser OTLP POST to `/v1/traces` is 404**
- Browser uses `OTEL_EXPORTER_OTLP_ENDPOINT` + `/v1/traces`. Verify the app
  was built with `VITE_OTEL_COLLECTOR_URL=http://localhost:4318` (see the
  frontend OTel init — `packages/app/src/otel/init.ts`).

## Optional: single-image alternative

If you prefer zero-config over per-file control, the `grafana/otel-lgtm` image
bundles all four components with datasources pre-wired. Swap in this service
instead:

```yaml
otel-lgtm:
  image: grafana/otel-lgtm:0.11.9
  ports:
    - "3001:3000"
    - "4317:4317"
    - "4318:4318"
  environment:
    - GF_AUTH_ANONYMOUS_ENABLED=true
    - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
```

The split stack above is preferred because it's easier to pin versions and
persist data across restarts via named volumes.
