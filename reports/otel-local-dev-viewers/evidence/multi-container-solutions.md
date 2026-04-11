# Evidence: Multi-Container Solutions

**Dimension:** Complex setup options — Docker Compose-based solutions
**Date:** 2026-04-09
**Sources:** GitHub repos, official docs

---

## Key pages / repos referenced

- https://github.com/SigNoz/signoz — SigNoz OSS
- https://signoz.io/docs/install/docker/ — SigNoz Docker installation
- https://github.com/uptrace/uptrace — Uptrace OSS
- https://uptrace.dev/get/hosted/docker — Uptrace Docker deployment

---

## Findings

### Finding: SigNoz requires 4-6 containers via Docker Compose
**Confidence:** CONFIRMED
**Evidence:** https://signoz.io/docs/install/docker/ and https://github.com/SigNoz/signoz/tree/main/deploy/docker

Core services in Docker Compose:
1. clickhouse (data storage)
2. zookeeper-1 (ClickHouse coordination)
3. signoz (query-service / UI)
4. otel-collector
5. schema-migrator-sync (init container, exits after run)
6. schema-migrator-async (init container, exits after run)
7. init-clickhouse (init container, exits after run)

Steady-state: ~4 running containers (clickhouse, zookeeper, signoz, otel-collector).
Minimum requirements: 4GB Docker memory, ports 8080, 4317, 4318.
Signals: traces, metrics, logs.
Database: ClickHouse (columnar, 50% lower resource than Elastic per SigNoz claims — vendor data, product incentive bias possible).

**Implications:** Full-featured APM but heavy for local dev. Multiple persistent services. Not a "quick spin up" option.

---

### Finding: Uptrace requires 5-6 containers via Docker Compose
**Confidence:** CONFIRMED
**Evidence:** https://uptrace.dev/get/hosted/docker

Services required:
1. Uptrace application (port 14318)
2. ClickHouse (ports 9000, 8123)
3. PostgreSQL (port 5432)
4. Redis (port 6379)
5. OpenTelemetry Collector (ports 4317, 4318)
6. MailHog (optional, ports 1025, 8025)

Minimum requirements: 2+ CPU cores, 4GB+ RAM, 10GB+ disk.
Signals: traces, metrics, logs.
Databases: ClickHouse (telemetry data) + PostgreSQL (metadata).
No single-container option available.

**Implications:** Heaviest setup of all options evaluated. Two separate databases required. Designed more for small production than local dev convenience.

---

## Gaps / follow-ups

* SigNoz has a cloud offering that would be zero-setup, but that shifts from local dev to SaaS.
* Neither provides a single-container or single-binary alternative.
