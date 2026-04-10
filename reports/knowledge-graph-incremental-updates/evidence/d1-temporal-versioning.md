# Evidence: Temporal and Versioned Knowledge Graph Models

**Dimension:** D1 — Temporal/versioned KG models (bitemporal RDF, named graphs, Wikidata qualifiers, OSTRICH/ConVer-G)
**Date:** 2026-03-21
**Sources:** arxiv.org/abs/2409.04499, rdfostrich.github.io, wikidata.org, blog.metaphacts.com, arxiv.org/html/2403.04782v1

---

## Key files / pages referenced
- https://arxiv.org/html/2409.04499 — ConVer-G concurrent versioning
- https://rdfostrich.github.io/article-jws2018-ostrich/ — OSTRICH architecture
- https://rdfostrich.github.io/article-swj2020-cobra/ — COBRA bidirectional deltas
- https://arxiv.org/html/2403.04782v1 — TKG representation survey
- https://blog.metaphacts.com/citation-needed-provenance-with-rdf-star — RDF-star
- https://wikidata.org/wiki/Help:Ranking — Wikidata rank system

---

## Findings

### Finding: OSTRICH — hybrid IC/CB/TB architecture with snapshot + aggregated delta chain
**Confidence:** CONFIRMED
**Evidence:** https://rdfostrich.github.io/article-jws2018-ostrich/

```text
"an initial dataset snapshot stored in HDT followed by a delta chain" where "each delta is
independent of a preceding delta and relative to the closest preceding snapshot"
Six B+Tree indexes (SPO, POS, OSP × additions/deletions) enable triple pattern lookups.
Ingestion: ~125x slower than HDT (2256s on BEAR-A). VM queries ~2x faster than HDT-CB.
```

**Implications:** VM queries require at most one delta + one snapshot. Trade-off: optimize read-heavy versioned workloads at cost of write speed. Three query types: Version Materialization (VM), Delta Materialization (DM), Version Query (VQ).

---

### Finding: COBRA bidirectional delta chains — splits one long chain into two halves pointing at shared snapshot
**Confidence:** CONFIRMED
**Evidence:** https://rdfostrich.github.io/article-swj2020-cobra/

```text
"Two smaller delta chains, with respectively reverse and forward deltas, all pointing to
one common intermediary snapshot." "Ingestion time is significantly reduced."
```

**Implications:** Addresses OSTRICH's slow ingestion while maintaining query performance. Max traversal length = half the delta chain length.

---

### Finding: ConVer-G — bitstring condensed representation in PostgreSQL + modified Fuseki for concurrent version queries
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/html/2409.04499

```text
"For each new version, QuaDer adds a new bit to the bitstring representing quad presence."
Queries use "bitwise AND between bitstrings" to determine presence across versions.
Demonstrated with 1000 concurrent versions; tested at BDA 2024 for urban data.
```

**Implications:** Space-efficient for largely-stable graphs. Partial SPARQL support (SELECT, GRAPH, JOIN, GROUP BY). Scalability beyond 1000 versions untested. Each quad stored once with versioning metadata.

---

### Finding: Wikidata's temporal model — Preferred/Normal/Deprecated ranks + P580/P582 qualifiers
**Confidence:** CONFIRMED
**Evidence:** https://wikidata.org/wiki/Help:Ranking

```text
"Normal rank is default." "Current mayor would receive preferred rank." "Deprecated rank for
statements known to include errors or outdated knowledge." Queries default to Preferred > Normal.
```

**Implications:** Wikidata NEVER deletes superseded facts — downgrades to Deprecated. Old facts remain queryable. Start time (P580) / end time (P582) qualifiers add explicit valid-time. This is effectively a hybrid bitemporal model (rank = transaction-time approximation, qualifiers = valid-time).

---

### Finding: RDF-star embedded triple syntax for compact edge-level provenance annotation
**Confidence:** CONFIRMED
**Evidence:** https://blog.metaphacts.com/citation-needed-provenance-with-rdf-star

```text
"<< :COVID19 :has_effect :cytokine_release_syndrome >> :stated_in :effective_treatment_article ."
Annotation syntax: :COVID19 :has_effect :cytokine_release_syndrome {| :stated_in :article |} .
```

**Implications:** Eliminates named-graph workaround for single-triple provenance. Named graphs were designed for groups, not individual statements. RDF 1.2 (W3C WG active 2024) standardizing this. Key use cases: versioning, unconfirmed data, temporal annotation.

---

### Finding: Four temporal KG representation paradigms — snapshot, continuous-time, event-based, tensor decomposition
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/html/2403.04782v1

```text
"Snapshot-Based: Split TKG into sequence of KG per timestamp." (RE-GCN, TiRGN)
"Continuous-Time: TANGO uses Neural ODEs for continuous evolution."
"Event-Based: Temporal Point Process for irregular event intervals." (Know-Evolve)
```

**Implications:** For operational systems, snapshot-based is most pragmatic. Continuous-time models better for forecasting but hard to audit.

---

## Negative searches
- Searched: W3C RDF 1.2 final spec for temporal annotations → FOUND: WG active 2024, not finalized as of early 2026
- Searched: OSTRICH v2 successor → FOUND: COBRA (2022) is latest, no v2

---

## Gaps
- BiTRDF (MDPI 2025) detailed mechanics: source returned 403; inferred from search summaries only
- OSTRICH combining valid-time qualifiers with transaction-time versioning: not natively integrated
