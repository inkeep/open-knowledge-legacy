# Evidence: Tantivy

**Dimension:** D4 — Tantivy
**Date:** 2026-04-03
**Sources:** GitHub quickwit-oss/tantivy, npm packages, crates.io, PyPI

---

## Key files / pages referenced

- [GitHub: quickwit-oss/tantivy](https://github.com/quickwit-oss/tantivy) — 14.8K stars, MIT license
- [ARCHITECTURE.md](https://github.com/quickwit-oss/tantivy/blob/main/ARCHITECTURE.md) — Lucene-inspired design
- [Issue #815: ANN/Vector Search](https://github.com/quickwit-oss/tantivy/issues/815) — open since Apr 2020
- [tantivy-py on PyPI](https://pypi.org/project/tantivy/) — v0.25.1, actively maintained
- [phiresky/tantivy-wasm](https://github.com/phiresky/tantivy-wasm) — proof-of-concept, unmaintained
- [strangerlabs/tantivy](https://github.com/strangerlabs/tantivy) — napi-rs bindings, abandoned (last release 2019)
- [Frando/tantivy-node](https://github.com/Frando/tantivy-node) — WIP, 5 commits, no npm release

---

## Findings

### Finding: Tantivy is a Rust FTS library with excellent BM25, used by Quickwit, ParadeDB, Milvus
**Confidence:** CONFIRMED
**Evidence:** [GitHub repo](https://github.com/quickwit-oss/tantivy), [Quickwit](https://quickwit.io/)

Lucene-inspired architecture: segment-based, FST term dictionaries, SIMD-accelerated posting lists. Maintained by quickwit-oss (Quickwit acquired by Datadog 2024). v0.25.0 current. Full Okapi BM25 with 17-language stemming support.

**Implications:** Gold-standard Rust FTS implementation. If accessible from Node.js, it would be the best BM25 engine in this comparison.

### Finding: No maintained, production-ready Node.js bindings exist
**Confidence:** CONFIRMED
**Evidence:** Survey of all known binding projects:
- `phiresky/tantivy-wasm`: 51 stars, 15 commits, zero releases, browser demo only
- `strangerlabs/tantivy`: Last release v0.1.1 (April 2019), abandoned
- `Frando/tantivy-node`: 5 commits, zero releases, Neon-based WIP
- `sonar-tantivy`: subprocess architecture, not in-process

No npm package provides in-process Tantivy access for Node.js.

**Implications:** Tantivy cannot be used from Node.js without either (a) writing custom napi-rs bindings, (b) a subprocess/sidecar architecture, or (c) using it indirectly through LanceDB (which uses Tantivy for FTS internally).

### Finding: No native vector search in Tantivy core
**Confidence:** CONFIRMED
**Evidence:** [Issue #815](https://github.com/quickwit-oss/tantivy/issues/815) — open since April 19, 2020

No dense vector field type has been merged. Community has external implementations (NucliaDB HNSW, tANNtivy fork) but none in core. Maintainers require feature flag, thorough testing, production users before merging.

**Implications:** Tantivy alone cannot do hybrid search. Would need a separate vector library + application-layer fusion. Combined with no Node.js bindings, this makes Tantivy impractical for the target use case.

### Finding: MeiliSearch does NOT use Tantivy internally (common misconception)
**Confidence:** CONFIRMED
**Evidence:** [MeiliSearch comparison docs](https://www.meilisearch.com/docs/learn/resources/comparison_to_alternatives), source repo inspection

MeiliSearch is an independent Rust implementation. No `tantivy` dependency in Cargo.toml.

**Implications:** Corrects a frequently cited misconception. MeiliSearch and Tantivy are unrelated codebases.

### Finding: tantivy-py is actively maintained and tracking releases
**Confidence:** CONFIRMED
**Evidence:** [PyPI tantivy v0.25.1](https://pypi.org/project/tantivy/) — Dec 2, 2025

Maintained by quickwit-oss. Exposes schema definition, index creation, BM25 queries, snippet extraction. Does not expose vector search (none in core).

**Implications:** Python users have a solid Tantivy path. Node.js users do not.

---

## Negative searches

- Searched for `tantivy` on npm → Found abandoned `strangerlabs/tantivy` (v0.1.1, 2019)
- Searched for `tantivy-wasm` npm package → NOT FOUND as installable npm package
- Searched for Tantivy vector search PR → No merged PR as of April 2026
- Searched for `@aspect-build/aspect-tantivy` → NOT FOUND

---

## Gaps / follow-ups

- Tantivy's indirect availability through LanceDB's TypeScript SDK is the most viable Node.js path, but LanceDB is moving away from Tantivy FTS
