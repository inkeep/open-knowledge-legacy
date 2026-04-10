# Run: 2026-04-02-initial

**Status:** Closed
**Intent:** Fanout (Step 3 — initial research pass)
**Created:** 2026-04-02

## Parent Context
**Purpose:** Identify the best self-hostable, local-first search and retrieval stack for a developer-facing knowledge platform. The product is a Node.js/TypeScript application running on a user's laptop (MacBook Air). The search must be hybrid (BM25 + vector/semantic), CPU-only, embeddable, fast (<100ms for ~1000 articles), and low-memory (<2GB). No cloud services, no GPUs, no Docker required.
**Primary question:** What is the optimal local-first hybrid search stack for a TypeScript knowledge platform targeting ~1000 markdown articles on developer laptops?
**Non-goals:** Cloud-hosted search services; GPU-required solutions; enterprise-scale systems; pricing/licensing comparisons; 1P codebase analysis.

## Selected Fanout Directions

| # | Direction | Dimensions | Facet Count | Source Diversity | Assessment |
|---|---|---|---|---|---|
| 1 | Embeddable search engines for hybrid search | D1 | 9 engines, 4+ facets each | Multi (Rust, C++, JS, Python ecosystems) | Heavy |
| 2 | Local embedding models + pipeline | D2 + D6 | 6 models + 4 runtimes + pipeline design | Multi (ML ecosystem, ONNX, Rust, JS) | Heavy |
| 3 | JS/TS-native search path + benchmarks | D4 + D5 | 8 libraries + perf benchmarks | Multi (npm ecosystem, benchmarks) | Heavy |
| 4 | All-in-one stacks + production apps | D3 + D7 | 7 stacks + 6 apps | Multi (OSS apps, different ecosystems) | Heavy |

## Sub-instance Tracking

| Direction | Status | Report Path | Notes |
|---|---|---|---|
| Embeddable search engines | completed | fanout/2026-04-02-initial/embeddable-search-engines/ | 364 lines, 7 evidence files |
| Local embedding models + pipeline | completed | fanout/2026-04-02-initial/local-embedding-models-pipeline/ | 380 lines, 4 evidence files |
| JS/TS-native search path + benchmarks | completed | fanout/2026-04-02-initial/js-ts-native-search-path/ | 434 lines, 6 evidence files |
| All-in-one stacks + production apps | completed | fanout/2026-04-02-initial/local-stacks-production-apps/ | 330 lines, 5 evidence files |

## Fanout Directory
`/Users/edwingomezcuellar/reports/local-search-retrieval-stacks-2025-2026/fanout/2026-04-02-initial/`
