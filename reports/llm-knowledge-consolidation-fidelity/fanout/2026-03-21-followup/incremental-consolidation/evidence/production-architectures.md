---
title: "Production Architectures for Incremental Knowledge Ingestion"
source_type: mixed_sources
url: https://www.notion.com/blog/building-and-scaling-notions-data-lake
accessed: 2026-03-21
relevance: Concrete production patterns from Glean, Notion, AWS Bedrock, and RAG systems for incremental document processing
---

# Production Incremental Ingestion Architectures

## Glean: Triple-Layer Hybrid (Full Crawl → Webhooks → Scheduled Sync)

Glean's documented architecture layers three modes:
1. **Full crawl** on initial connection (100+ connectors)
2. **Real-time webhooks** for instant updates (within minutes)
3. **Scheduled incremental sync** as safety net for missed events

The scheduled job guarantees correctness; webhooks provide freshness. This is the dominant production pattern.

Source: [Glean Connector Framework](https://www.glean.com/resources/product-videos/working-ai-glean-connector-framework-for-enterprise-search)

## Notion AI: Debezium CDC → Kafka → Hudi Pipeline

1. Postgres → Kafka via Debezium CDC — every block-level change is a Kafka event
2. Apache Hudi writes Kafka events to S3 supporting both batch and incremental reads
3. AI connectors index new data every 30 minutes on incremental schedule
4. Full snapshot abandoned: 10+ hours, 2x cost vs incremental (minutes, half cost)

Source: [How Notion Builds Their Data Lake](https://www.notion.com/blog/building-and-scaling-notions-data-lake)

## Content Hash Gating (LangChain SQLRecordManager)

SQLite ledger: file_path → content_hash → timestamp → status

- New document: embed + upsert; record in ledger
- Modified: delete old chunks by document_id, embed + upsert new
- Unchanged: skip entirely
- Deleted: purge via cleanup pass

In corpus where 95% documents stable → 95% compute eliminated. From 45-minute full reprocessing to 2-3 second overhead.

Source: [Update RAG Knowledge Without Rebuilding](https://particula.tech/blog/update-rag-knowledge-without-rebuilding)

## IncRML: Formalized Minimum Reprocessing for KGs

Incremental Knowledge Graph Construction from Heterogeneous Data Sources. Materializes complete initial KG, then only processes changed members.

Performance vs full reprocessing: **315x less storage, 4.59x less CPU, 1.51x less memory.**

Changes published as Linked Data Event Streams using W3C Activity Streams 2.0 vocabulary.

Source: [IncRML — Semantic Web Journal](https://www.semantic-web-journal.net/content/incrml-incremental-knowledge-graph-construction-heterogeneous-data-sources)

## Kappa Architecture for Knowledge Bases

Eliminates batch layer. Single processing path (the stream). Historical reprocessing = replaying stream from offset 0.

Biggest dividend: embedding model upgrade. Replay event log through new pipeline into new namespace, validate, atomic swap. No in-place migration risk.

Source: [Kappa Architecture](https://milinda.pathirage.org/kappa-architecture.com/)

## Quality Monitoring Thresholds (Production RAG)

**Embedding drift**: Weekly cosine distance comparison. Stable: 0.0001–0.005. Drifting: 0.05+.

**Nearest-neighbor stability**: Stable systems retain 85-95% of top-K neighbors. Drifting: 25-40% neighbor dropout.

**Production trigger thresholds**:
- cosine_similarity(current, stored) < 0.95 → flag drift
- nearest_neighbor_retention_rate < 85% → trigger reindex review
- index_recall < (baseline - 0.03) → alert + human review

Source: [Embedding Drift: The Quiet Killer of RAG Quality](https://dev.to/dowhatmatters/embedding-drift-the-quiet-killer-of-retrieval-quality-in-rag-systems-4l5m)
