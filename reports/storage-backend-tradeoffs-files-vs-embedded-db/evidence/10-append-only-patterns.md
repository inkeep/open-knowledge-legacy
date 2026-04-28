---
title: "Append-only vs mutable storage patterns"
description: "JSONL design, time-series workloads, log compaction, cardinality bounds, hybrid event-sourcing, and when append-only outperforms mutable"
date: 2026-04-23
sources:
  - jsonlines.org (JSON Lines specification)
  - Confluent / Apache Kafka log compaction docs
  - Honeycomb engineering blog (event-based storage, Refinery sampler)
  - Datadog log management documentation
  - Microsoft Azure Architecture Center (Event Sourcing pattern)
  - microservices.io (Event Sourcing pattern)
  - Debezium engineering blog (Event Sourcing vs CDC)
  - PostgreSQL official documentation (LISTEN/NOTIFY, WAL, partitioning)
  - SQLite official documentation (WAL)
  - getpino.io / pino GitHub (NDJSON streaming)
  - OpenTelemetry specification (OTLP exporter)
  - Apache Pulsar / Kafka comparison material (StreamNative, Confluent)
  - lowdb GitHub
  - Linear sync engine reverse-engineering writeups (fujimon, marknotfound)
framing: 3P / external sources only
---

# Append-only vs mutable storage patterns

This evidence file surveys the external landscape of append-only and mutable storage approaches — the format conventions, the workloads each fits, the techniques (compaction, partitioning, snapshots) used to keep append-only logs operationally bounded, and the contested claims that surround event sourcing and CQRS. No recommendations; mappings only.

---

## 1. JSONL design — the canonical append-only on-disk format

**CONFIRMED.** JSON Lines (JSONL) is a newline-delimited text format where every line is an independently valid JSON value (typically an object), separated by `\n` (LF) or `\r\n` (CRLF), encoded as UTF-8 ([jsonlines.org](https://jsonlines.org/), [ndjson.com definition](https://ndjson.com/definition/)). The format is also called NDJSON (Newline-Delimited JSON) or LDJSON (Line-Delimited JSON); the three names refer to the same on-disk shape. Each individual line must comply with the JSON specification (RFC 7159) ([JSONL Tools spec guide](https://jsonltools.com/jsonl-format-specification)).

**CONFIRMED.** Key consequences of the line-record structure:

- New records are added by **appending bytes**, not by rewriting the whole file ([NDJSON FAQ](https://ndjson.com/faq/)).
- The file is **streamable**: a reader can produce one parsed record per line without holding the whole file in memory. Apache Spark and BigQuery both support JSONL as a load format for this reason ([jsonlines.org / on the web](https://jsonlines.org/on_the_web/)).
- Async-iteration libraries map the on-disk lines onto an `AsyncIterable<T>` directly — `iterable-ndjson` is one such adapter ([alanshaw/iterable-ndjson](https://github.com/alanshaw/iterable-ndjson)); `stream-json` ships a `jsonl/Parser` that emits `{key, value}` pairs ([stream-json on npm](https://www.npmjs.com/package/stream-json)). Node's built-in `readline` over `fs.createReadStream` is the no-dependency variant: `for await (const line of rl)` yields one record per iteration.

**INFERRED / partially CONFIRMED.** Concurrent-append semantics are the subtle part:

- POSIX does **not** specify atomicity for arbitrary concurrent `write()` calls; concurrent writes can interleave ([Jim Fisher — fwrites are not atomic](https://jameshfisher.com/2017/07/29/concurrent-fwrites/), [POSIX write commentary](https://utcc.utoronto.ca/~cks/space/blog/unix/WriteNotVeryAtomic)).
- Opening a file with `O_APPEND` and using a single `write()` syscall causes the kernel to atomically seek-to-end and write in one step on Linux. POSIX language ("the file offset shall be set to the end of the file prior to each write and no intervening file modification operation shall occur between changing the file offset and the write operation") supports this for sufficiently small writes ([nullprogram — Appending from multiple processes](https://nullprogram.com/blog/2016/08/03/), [linux-fsdevel discussion](https://linux-fsdevel.vger.kernel.narkive.com/RRQpP2Oj/question-are-concurrent-write-calls-with-o-append-on-local-files-atomic)). Many sources frame this as "works but isn't strictly required by POSIX" — UNCERTAIN at the spec layer, CONFIRMED in practice on mainstream Linux/macOS local filesystems for writes below a kernel-defined threshold (often `PIPE_BUF` for pipes; for regular files the practical bound is per-FS and not centrally documented).
- Node.js's `fs.appendFile` / write-stream-based appends are **not** automatically equivalent to a single-syscall `O_APPEND` write. There are documented corruption reports when multiple Node processes write to the same file without locking — including `claude.json` and JSONL session files in the Claude Code repo itself ([anthropics/claude-code#29051](https://github.com/anthropics/claude-code/issues/29051), [#20992](https://github.com/anthropics/claude-code/issues/20992)).
- The general design pattern when concurrent writers are expected: **records must be self-contained per line**, and writers must use either `O_APPEND` + single-syscall writes, file locking, or write-to-temp-then-rename ([nullprogram](https://nullprogram.com/blog/2016/08/03/)).

**CONFIRMED.** Standard tooling around JSONL:

- `jq` operates per-line via `--slurp`/no-slurp modes; works on shell pipelines naturally.
- Pino (Node logging library) emits NDJSON by default and is explicitly described as a "super fast, all natural JSON logger" that produces newline-delimited records ([getpino.io](https://getpino.io/), [pinojs/pino](https://github.com/pinojs/pino)).

---

## 2. Time-series / telemetry workloads

**CONFIRMED.** Append-only is the natural shape for telemetry (metrics, traces, logs, events) for three structural reasons documented across the time-series-database literature:

1. **Time-ordered writes dominate.** Telemetry is produced in approximate time order; queries are also overwhelmingly time-ranged ("last 5 minutes", "yesterday at 14:00"). Time-series databases optimize for this by partitioning on time ([Hello Interview — TSDBs deep dive](https://www.hellointerview.com/learn/system-design/deep-dives/time-series-databases), [Alibaba Cloud — TSDB analysis](https://www.alibabacloud.com/blog/a-comprehensive-analysis-of-open-source-time-series-databases-3_594732)).
2. **Records are rarely mutated after write.** "In most cases with timeseries databases, data quickly loses its value after insert. Insertions are usually very frequent... Every time a record is deleted or inserted any index needs to be rebuilt, and with a large enough table this can lead to abysmal performance" ([Sqlite3 Timeseries Partitioner overview](https://nuuskamummu.github.io/Sqlite3_partitioner/)).
3. **Aggregation, not point lookup, dominates queries.** Honeycomb's design philosophy is illustrative: "Instead of pre-aggregating before storage, you store each request as a complete structured document, every field intact, and run the aggregation at query time" ([Honeycomb — getting at the good stuff](https://www.honeycomb.io/blog/getting-at-the-good-stuff-how-to-sample-traces-in-honeycomb)).

**CONFIRMED.** Why append-only is **awkward** for relational state by contrast: relational state is defined by the *current* value of an entity (an order's status, a user's email). Append-only stores express that as "the latest event keyed to entity X", which means reading current state requires either a fold over the log or a separate materialized projection — both of which add latency or complexity that a mutable row in a relational table avoids ([microservices.io — event sourcing](https://microservices.io/patterns/data/event-sourcing.html)).

**CONFIRMED.** OpenTelemetry's OTLP protocol — the canonical telemetry-export wire format — is itself shaped around append-only delivery. OTLP wraps batches of spans/metrics/logs in `Export*ServiceRequest` protobuf messages and ships them over gRPC (preferred for streaming) or HTTP/Protobuf to an aggregator ([OpenTelemetry Protocol exporter spec](https://opentelemetry.io/docs/specs/otel/protocol/exporter/), [OTLP specification 1.10.0](https://opentelemetry.io/docs/specs/otlp/)). The default URL path `/v1/traces` carries a Protobuf-encoded `ExportTraceServiceRequest`; data is appended at the receiver, not mutated.

---

## 3. Log compaction — preventing unbounded growth

Several distinct techniques have emerged. They are **not interchangeable** — they have different semantics and target different workloads.

### 3.1 Kafka log compaction (key-based retention)

**CONFIRMED.** Kafka offers two retention policies: time/size-based deletion *or* **log compaction**. Log compaction "guarantees that the latest value for each message key is always retained within the log of data contained in that topic" ([Confluent — Kafka log compaction](https://docs.confluent.io/kafka/design/log_compaction.html)). It is "ideal for use cases such as restoring state after system failure or reloading caches after application restarts."

**CONFIRMED.** The deletion mechanism inside compaction is the **tombstone**: "A message with a key and a null payload (note that a string value of null is not sufficient) will be treated as a delete from the log... these null payload messages are also called tombstones" ([Spring Kafka — null payloads](https://docs.spring.io/spring-kafka/reference/kafka/tombstones.html), [KIP-87 tombstone flag](https://cwiki.apache.org/confluence/display/KAFKA/KIP-87+-+Add+Compaction+Tombstone+Flag)). Tombstones are themselves cleaned out after a configurable retention window (`delete.retention.ms`) so they do not accumulate indefinitely. Compaction "is done in the background by periodically recopying log segments... cleaning does not block reads" ([Confluent docs](https://docs.confluent.io/kafka/design/log_compaction.html)).

**INFERRED.** Compaction transforms an append-only log into something closer to a key-value store with an audit trail of recent values per key — useful for state-restore use cases but lossy with respect to historical events for already-superseded keys.

### 3.2 Time-windowed retention (the common case)

**CONFIRMED.** Most telemetry systems use time-based retention rather than key-based compaction:

- **Datadog** advertises a tiered model: hot storage 0–30 days for fast indexed search, "warm" storage 31–180 days, and "cold" storage 181+ days for archival. Indexed Logs are the hot tier; Flex Storage and the newer "Flex Frozen" tier are progressively cheaper, with Flex Frozen extending retention to 7+ years ([Datadog — log retention guide](https://www.nobs.tech/blog/datadog-log-retention), [Stocktitan — Datadog 7-year retention](https://www.stocktitan.net/news/DDOG/datadog-expands-log-management-offering-with-new-long-term-retention-gar9bpi1i16e.html), [Sumo Logic on Flex Logs](https://www.sumologic.com/blog/should-know-about-datadog-flex-logs)). The pricing differential is large: hot storage runs $1.06–$2.50 per GB depending on retention window; Flex is quoted at $0.05 per million events.
- **Datadog "Log Rehydration"** lets archived logs be re-indexed on demand for investigation without the ongoing cost of hot retention ([Datadog — log rehydration](https://www.datadoghq.com/blog/efficient-log-rehydration-with-datadog/)).

### 3.3 Sample-and-aggregate (Honeycomb's approach)

**CONFIRMED.** Honeycomb's Refinery is a **dynamic sampler** that "drops redundant data, keeping the most interesting stories (all errors and slow requests), plus a representative selection of successful request processing" ([Honeycomb — sampling traces](https://www.honeycomb.io/blog/getting-at-the-good-stuff-how-to-sample-traces-in-honeycomb)). Sampling is **deterministic on trace ID** so all spans of the same trace are sampled together: "Deterministic sampling works by taking a hash of the trace ID, and consistent sampling is ensured for all spans in the trace because the trace ID is propagated to all child spans."

**CONFIRMED.** Honeycomb separates the storage tier explicitly from the indexed tier: "with Honeycomb Telemetry Pipeline you can store full-fidelity telemetry in your S3 bucket and rehydrate any part of it back into Honeycomb for perusal and analysis" ([Honeycomb — telemetry pipeline](https://www.honeycomb.io/blog/introducing-powerful-honeycomb-telemetry-pipeline-features)).

### 3.4 Time-series LSM compaction

**CONFIRMED.** Time-series-aware LSM-tree databases use **time-tiered compaction**: "Time-Tiered Compaction prioritizes the compaction of newer data and employs an income optimization compaction approach... newer data is more frequently queried, making newly written SSTables should be merged after older SSTables" ([ScienceDirect — time-tired compaction](https://www.sciencedirect.com/science/article/abs/pii/S147403462300352X)). Some systems (e.g. tsink) implement an explicit hot → warm → cold lifecycle with object-store backing for warm/cold ([tsink GitHub](https://github.com/h2337/tsink)).

### 3.5 Daily/period rotation (log files)

**INFERRED / common-knowledge.** Traditional logfile rotation (logrotate, daily/hourly file boundaries, gzip-of-cold-tier) is the file-system analogue. Same idea: time partitions the data and old partitions can be deleted/archived as a unit.

---

## 4. Cardinality bound — when an append-only log becomes painful

**CONFIRMED.** The boundary is set by cardinality and growth rate, not by absolute size in isolation. Specific data points:

- **SQLite append-only INSERT**: a published benchmark inserted **one billion rows** of 32-bit-integer data in under one minute on a single machine, achieving roughly 635 million rows/minute on an unindexed table ([avi.im — fast SQLite inserts](https://avi.im/blag/2021/fast-sqlite-inserts/), [HN discussion](https://news.ycombinator.com/item?id=27872575)). Indexes change the picture sharply: **"For tables with secondary indexes, expect up to 5x reduction in insert performance"** ([voidstar.tech — SQLite insert speed](https://voidstar.tech/sqlite_insert_speed/)). With WAL mode and tuned synchronous settings, sustained ~250,000 inserts/sec on typical hardware ([avi.im](https://avi.im/blag/2021/fast-sqlite-inserts/)). Practical guidance includes batching inserts in single transactions and inserting in primary-key order for ~80% improvement.
- **Time-series cardinality wall**: "high-cardinality anti-patterns can create effectively unbounded series growth, which is a major challenge in time series databases. Cardinality directly impacts memory and index size" ([Medium — high-cardinality TSDB lessons](https://medium.com/@systemdesignwithsage/lessons-from-building-a-high-cardinality-time-series-database-8c3f9626ab68)). InfluxDB's own docs frame the index as the limiting factor for series count ([InfluxDB v1 — TSI overview](https://docs.influxdata.com/influxdb/v1/concepts/time-series-index/)).
- **Compaction storms** are a concrete failure mode: "A compaction storm can be triggered by overlapping shards when duplicate data blocks cover the same time ranges. Compaction storms can affect performance, and adaptive rate limiting rejects writes when compaction lag exceeds a safe threshold to prevent system death spirals" ([Medium — high-cardinality TSDB lessons](https://medium.com/@systemdesignwithsage/lessons-from-building-a-high-cardinality-time-series-database-8c3f9626ab68)).

**INFERRED.** Stated thresholds vary by source; no single "million rows = pain" or "billion rows = ceiling" number is universal. The practical bound depends on the index footprint, write rate, query patterns, and whether retention is enforced (without retention, *any* append-only log grows unboundedly).

---

## 5. When append-only outperforms mutable

**CONFIRMED** workload characteristics where the append-only shape is reported as advantaged in external sources:

- **Write-heavy with append-shaped writes** (logs, telemetry, audit, events). Sequential-append I/O is the cheapest pattern on rotational and SSD storage; B-tree updates with secondary indexes incur write amplification ([SQLite forum — billion rows discussion](https://sqlite.org/forum/info/b8770e83b1e011d4); time-series compaction literature passim).
- **Rarely-mutated values**. If "what happened at time T" is the recorded fact, no record ever needs updating. Time-series, audit logs, and event journals all fit.
- **Time-ordered queries dominate**. Range scans on a time-partitioned append-only log read a contiguous file region; range scans on a B-tree visit non-contiguous leaves.
- **Replicability is a requirement**. "Logs are the perfect tool for replication because they provide a linear, ordered history of changes. Replicas can replay the WAL to stay in sync with the primary system" ([architecture-weekly — WAL foundation](https://www.architecture-weekly.com/p/the-write-ahead-log-a-foundation), [PostgreSQL docs §28.3](https://www.postgresql.org/docs/current/wal-intro.html)).
- **Auditability is a requirement**. The Azure Architecture Center lists "complete audit trail" and "ability to reconstruct historical state" as the canonical event-sourcing benefits ([Azure — Event Sourcing](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)).

---

## 6. When append-only is wrong

**CONFIRMED** scenarios where external sources flag the append-only shape as a poor fit:

- **Frequently-mutated values (small entity, many updates).** Each update is a new event; reading current state requires folding the event stream. "While writing data seems straightforward, retrieving data is far more complex as the system must aggregate all relevant events up to a point in time, which can be slow and unpredictable" ([Medium — CQRS+ES tradeoffs](https://medium.com/@dorinbaba/cqrs-event-sourcing-sounds-cool-but-is-it-worth-it-e97bd5bfb7c1)).
- **Point lookups by entity key, not by time.** Without a separate projection or index, every read of "what is X right now?" is O(events for X). Snapshots and projections mitigate this — at the cost of reintroducing a mutable store.
- **Foreign-key invariants / cross-entity referential integrity.** Event-sourced systems are typically eventually consistent across aggregates; FK-style invariants enforced at write time are awkward. "Updates to the read data store might lag behind event generation because write and read data stores are separate, resulting in eventual consistency" ([Azure — CQRS pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs)).
- **Strong-consistency UX requirements**. Cited as a frequent pain: "Users don't understand eventual consistency and perceive it as bugs"; teams report "drowning in eventual consistency bugs, with orders getting processed twice and stale data appearing to users" ([Medium — Production was a nightmare](https://medium.com/lets-code-future/event-sourcing-looked-perfect-in-the-book-production-was-a-nightmare-04c15eb5cea8), [Medium — Perils of event-driven](https://medium.com/@hugo.oliveira.rocha/handling-eventual-consistency-11324324aec4)).
- **Schema evolution under business-rule churn.** "Events are immutable while business requirements aren't, creating tension that can be problematic" ([Medium — what they don't tell you](https://medium.com/@hugo.oliveira.rocha/what-they-dont-tell-you-about-event-sourcing-6afc23c69e9a)).

**Divergence to flag (not flatten).** Several sources push back: "event sourcing itself does not require eventual consistency, and you can build an event-sourced system that is fully consistent within its boundaries" ([axoniq — dispelling FUD](https://www.axoniq.io/blog/dispelling-the-eventual-consistency-fud-when-using-event-sourcing), [eventsourcingdb — consistency is a business decision](https://docs.eventsourcingdb.io/blog/2026/02/26/consistency-is-a-business-decision/)). The strong/eventual split is between the **write boundary** (which can be strongly consistent within an aggregate) and the **read projections** (which usually are not). Whether this counts as "good enough" is contested and depends on UX expectations.

---

## 7. Hybrid patterns

These are widely-used compositions that combine append-only logs with mutable derived state.

### 7.1 Event sourcing + materialized projection (read model)

**CONFIRMED.** The canonical CQRS pairing: events are appended to the source-of-truth log; one or more **projections** consume the log and write to mutable read-optimized stores (a relational table, a search index, a key-value cache). "Event handlers of the read model persist the changes described in the events into a persistent model (a materialized view) that is optimized for queries" ([Cloud With Chris — episode 19](https://www.cloudwithchris.com/episode/event-sourcing-and-materialized-view/), [Azure — Materialized View pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view)).

**CONFIRMED.** Projections are **rebuildable**: "If your product team asks for a new dashboard, you don't alter the write model. You build a new projection and replay the existing events through it. This is the core flexibility of event sourcing: one event stream, unlimited read models" ([dev.to — snapshot strategies](https://dev.to/alex_aslam/snapshot-strategies-optimizing-event-replays-36oo), [AWS Prescriptive Guidance — event sourcing](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/event-sourcing.html)).

**CONFIRMED.** Snapshot strategies bound replay cost: "If a stream has 10,000 events, replaying all of them on every request is expensive... If an Order has 1,000 events, replaying all of them every time you need the current state would be expensive. A snapshot taken at event 900 means you only need to replay the last 100 events" ([Kurrent — snapshots in event sourcing](https://www.kurrent.io/blog/snapshots-in-event-sourcing), [eventsourcing.dev — snapshots first principles](https://www.eventsourcing.dev/first-principles/snapshots)). Strategies include synchronous post-write, asynchronous post-return, and a separate "chaser" process.

### 7.2 CDC (Change Data Capture)

**CONFIRMED.** CDC inverts the relationship: the source-of-truth is a mutable database; the **transaction log** is exposed as an event stream to downstream consumers. "Change Data Capture (CDC) is a solution that captures change events from a database transaction log... and forwards those events to downstream consumers... essentially externalizing the transaction log of the database as a stream of events to interested consumers" ([Debezium blog — event sourcing vs CDC](https://debezium.io/blog/2020/02/10/event-sourcing-vs-cdc/)).

**CONFIRMED — distinction from event sourcing.** "The basic principle behind event sourcing is to ensure that every change in an application's state is captured in an event object, whereas CDC relies on the transaction log. A journal differentiates event sourcing from CDC and is considered the source of truth for applications and is replayable to rebuild the state of the application" ([Debezium blog](https://debezium.io/blog/2020/02/10/event-sourcing-vs-cdc/)). Events in event sourcing are *domain*-meaningful; CDC events are *row*-meaningful.

**Divergence.** Debezium's own blog argues "CDC and Outbox using Debezium is usually a better alternative to Event Sourcing" because it sidesteps dual-writes without imposing event-sourcing's full semantic burden. Microservices.io and Azure docs treat both as legitimate first-class patterns. The choice is contested.

### 7.3 WAL as append-only journal feeding mutable state

**CONFIRMED.** Both PostgreSQL and SQLite use a **write-ahead log** as the durability primitive that backs their otherwise-mutable B-tree data files:

- "Write-ahead logs store each state change as a command with a unique identifier within an append-only file. Each of the commands in this append-only file contains all the information needed to replicate the change" ([architecture-weekly — WAL](https://www.architecture-weekly.com/p/the-write-ahead-log-a-foundation)).
- PostgreSQL: "changes to data files must be written only after those changes have been logged, that is, after WAL records describing the changes have been flushed to permanent storage" ([PostgreSQL §28.3](https://www.postgresql.org/docs/current/wal-intro.html)).
- SQLite: "The original content is preserved in the database file and the changes are appended into a separate WAL file. Multiple transactions can be appended to the end of a single WAL file. WAL is significantly faster in most scenarios and provides more concurrency as readers do not block writers and a writer does not block readers" ([SQLite WAL docs](https://sqlite.org/wal.html)).

**INFERRED.** This is a hybrid pattern at the storage layer itself: append-only on the durability path; mutable on the query path. Neither database exposes the WAL as a user-level event source by default, but Postgres logical replication and tools like Debezium expose it externally.

---

## 8. Real-world adoption

| System / pattern | Storage shape | Notes |
|---|---|---|
| **Apache Kafka topics** | Append-only partitioned commit log; per-topic time-or-key retention | Single, append-only log file per partition, written sequentially ([Quix — Kafka vs Pulsar](https://quix.io/blog/kafka-vs-pulsar-comparison)) |
| **Apache Pulsar** | Append-only segments striped across BookKeeper bookies; tiered to S3 | Compute/storage separated, unlike Kafka's per-broker disks ([StreamNative — Pulsar architecture](https://streamnative.io/blog/guide-apache-pulsar-compare-features-architecture-to-apache-kafka)) |
| **EventStoreDB / Kurrent** | Purpose-built event log; built-in projections | "Operational database built from the ground up for Event Sourcing" ([Kurrent — guide to event stores](https://www.kurrent.io/guide-to-event-stores)) |
| **PostgreSQL as event store** | INSERT-only events table; "inline projections support where functions update read models in the same transaction as appending events, so either all was stored or nothing" ([Erik Shafer — EventStoreDB vs PostgreSQL](https://www.event-sourcing.dev/postgresql-vs-eventstoredb/)) | Reference implementation: [postgresql-event-sourcing](https://github.com/eugene-khyst/postgresql-event-sourcing) |
| **Honeycomb events** | Per-event structured documents in columnar storage; sampled via Refinery; archive to S3 | Event-based, not pre-aggregated; "every field intact, run aggregation at query time" ([Honeycomb — sampling](https://www.honeycomb.io/blog/getting-at-the-good-stuff-how-to-sample-traces-in-honeycomb)) |
| **Datadog APM/Logs** | Tiered: indexed hot / Flex / Flex Frozen; rehydrate-on-demand | Up to 7-year retention via Flex Frozen ([Stocktitan — DDOG](https://www.stocktitan.net/news/DDOG/datadog-expands-log-management-offering-with-new-long-term-retention-gar9bpi1i16e.html)) |
| **Pino logging** | Append NDJSON to a writable stream (file, socket); transports run on a worker thread | "All natural JSON logger"; default newline-delimited ([getpino.io](https://getpino.io/), [pinojs/pino](https://github.com/pinojs/pino)) |
| **OpenTelemetry / OTLP** | Append batches via gRPC unary or HTTP POST (`/v1/traces`, `/v1/logs`, `/v1/metrics`); protobuf-encoded | gRPC preferred for streaming throughput ([OTLP exporter spec](https://opentelemetry.io/docs/specs/otel/protocol/exporter/)) |
| **Linear sync engine** | Per-mutation `SyncAction` event objects; bootstrap replays them; clients store snapshots in IndexedDB | "Every change in Linear appears to result in a new SyncAction object with a unique ID, with the magic mostly being persisting model snapshots for each create, update, or delete action" ([fujimon — Linear sync engine](https://www.fujimon.com/blog/linear-sync-engine), [marknotfound — reverse engineering Linear](https://marknotfound.com/posts/reverse-engineering-linears-sync-magic/), [wzhudev/reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine) — endorsed by Linear's CTO) |
| **lowdb (push to root array)** | Mutates an in-memory JS object, then `JSON.stringify`s the **whole** db on every `write()` | Anti-pattern at scale: "If you have large JavaScript objects (~10-100MB), you may hit some performance issues because whenever you call db.write, the whole db.data is serialized" ([typicode/lowdb#484](https://github.com/typicode/lowdb/issues/484)) |

---

## 9. Tradeoffs vs SQL append-only-table

**INFERRED.** An INSERT-only SQL table (SQLite or Postgres, no UPDATE/DELETE) has the **same logical shape** as a JSONL log — a sequence of immutable records — but different ergonomics and storage cost.

**CONFIRMED (favoring SQL append-only):**

- **Indexes for free**. Time-range scans, key lookups, joins all work as in any SQL table.
- **Transactions**. Multi-record appends are atomic via a single transaction.
- **Standard query language**. No bespoke fold-and-aggregate code.
- **Partitioning and retention** are first-class in Postgres: range-partition by date, then "drop the partition that is no longer necessary, which can very quickly delete millions of records" ([PostgreSQL §5.12 partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html), [pg_partman docs](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL_Partitions.html)). pg_partman automates partition creation and old-partition drops.
- **Live consumers** via PostgreSQL `LISTEN` / `NOTIFY`: triggers on INSERT can `pg_notify('channel', row_to_json(NEW)::text)` to push new rows to subscribers without polling ([PostgreSQL — NOTIFY docs](https://www.postgresql.org/docs/current/sql-notify.html), [Neon — pub/sub guide](https://neon.com/guides/pub-sub-listen-notify)). Note constraints: payload limited to ~8000 chars; LISTEN/NOTIFY runs entirely in memory and does not persist; notifications fire only after transaction commit.

**CONFIRMED (cost vs JSONL):**

- **Storage overhead**: row headers, indexes, fillfactor padding all add bytes per record vs JSONL's "the bytes you wrote are the bytes on disk."
- **Operational footprint**: a Postgres or SQLite installation vs a single file.
- **Schema rigidity**: ALTER TABLE for new fields vs adding new keys to JSONL records freely.

**CONFIRMED (cost of JSONL vs SQL):**

- **No native indexes**. Every query is a full scan unless you build a sidecar.
- **No transactions** across multiple records; partial-write recovery is the writer's problem.
- **No native pub/sub** — file-watching or external streaming infra required.

---

## 10. Streaming consumption

How systems expose "new records" to live consumers.

### 10.1 JSONL via async iterator

**CONFIRMED.** Two idioms:

```js
// Native readline
const rl = readline.createInterface({ input: fs.createReadStream(path) });
for await (const line of rl) { handle(JSON.parse(line)); }

// iterable-ndjson library
import ndjson from 'iterable-ndjson';
for await (const obj of ndjson(stream)) { handle(obj); }
```

For *tailing* (reading new records as they are appended), there is no built-in equivalent of `tail -f` in Node's standard library; tailing libraries or polling-with-position are required. ([alanshaw/iterable-ndjson](https://github.com/alanshaw/iterable-ndjson), [stream-json](https://www.npmjs.com/package/stream-json)).

### 10.2 PostgreSQL LISTEN/NOTIFY

**CONFIRMED.** Trigger-on-INSERT + `pg_notify` gives push-based consumption of new rows. Real-world reports cite "1000+ concurrent connections with sub-50ms latency using just PostgreSQL and Server-Sent Events" ([Medium — Day 4 LISTEN/NOTIFY](https://medium.com/@nevilpatel05317/day-4-forget-polling-using-postgresql-listen-notify-for-instant-updates-991d96da72bc)).

**Caveats** (CONFIRMED):

- Payload size limited to ~8000 characters — for larger payloads, the convention is to send a row ID and let the consumer SELECT the row.
- Notifications are in-memory only; if no listener is connected, the notification is lost (no durability).
- Notifications fire only on transaction commit; not on rollback.
- No built-in backpressure or replay; this is fire-and-forget.

### 10.3 Kafka consumer groups

**CONFIRMED.** Kafka's consumption model is **pull-based** but supports persistent consumer offsets and consumer groups for parallel partition consumption ([Confluent docs](https://docs.confluent.io/kafka/design/log_compaction.html) and Kafka design docs passim). Replays are first-class: rewind the offset, re-read.

### 10.4 OTLP push

**CONFIRMED.** OTLP is **push from instrumented app → collector → backend**, not subscription. The collector's role is to fan out to multiple backends ([OTLP exporter spec](https://opentelemetry.io/docs/specs/otel/protocol/exporter/)). gRPC streaming is supported but the standard mode is unary `Export*ServiceRequest` calls.

---

## Workload fit matrix

The table below maps storage shape to workload class. "Fit" entries cite the dominant pattern in the surveyed sources; many real systems use mixed shapes.

| Workload | Append-only | Mutable | Hybrid (log + projection) |
|---|---|---|---|
| **Telemetry** (metrics, traces, logs) | **Strong fit** — time-ordered writes, time-ranged queries, rare mutation. JSONL/Pino, OTLP, Honeycomb, Datadog all use append-only + retention. | Poor fit — unnecessary index churn; current value rarely matters. | Used for derived dashboards (pre-aggregated rollups over the raw event log). |
| **Audit log** | **Strong fit** — by definition immutable; the log *is* the requirement. | Wrong shape — mutation defeats audit. | Common: append-only audit log + mutable index for search/reporting. |
| **Config** | Poor fit — config is small, mutated, point-read per key. | **Strong fit** — single source of truth, last write wins. | Overkill in most cases; sometimes used for "config history" UX (show prior values). |
| **Derived index** (search, denormalized cache) | Poor fit alone — derived state needs to be queryable by key, not by time. | **Strong fit** — the index *is* the mutable projection. | This **is** the projection side of a hybrid; the canonical CQRS read model. |
| **User content** (documents, posts) | Mixed — viable when "history of edits" is a feature (Linear's SyncActions, CRDT op-logs). Replaying every op to render is expensive without snapshots. | **Strong fit** when current state is the only thing the UI shows. | Common: durable op-log + materialized current-state document. CRDTs and Linear-style sync engines sit here. |

---

## Confidence summary

- **CONFIRMED** (multiple independent sources, official docs): JSONL spec; Kafka log compaction + tombstones; OTLP transport shape; SQLite/Postgres WAL; Datadog tier model; Honeycomb event-based + Refinery; Postgres LISTEN/NOTIFY mechanics; partitioning + retention via DROP/DETACH; canonical event-sourcing + CQRS pattern; snapshot strategies; SQLite billion-row insert benchmark; lowdb full-serialization-on-write behavior; Linear SyncAction model.
- **INFERRED** (consistent across sources but not centrally codified): "indexes dominate insert cost"; the JSONL appendable-bytes property; the hybrid shape of WAL-as-internal-log; absolute cardinality thresholds; tradeoffs framing in §9.
- **UNCERTAIN / contested**: POSIX atomicity guarantees for `O_APPEND` writes (works in practice on mainstream systems but spec language is weaker than commonly assumed); whether event sourcing's complexity is justified outside narrow business domains (Debezium blog, Hugo Rocha, "Production Was a Nightmare" all argue *less often than people think*; axoniq, kurrent, eventsourcingdb push back); whether eventual consistency is intrinsic to event sourcing (axoniq says no, the "drowning in bugs" reports say yes-in-practice).
