# Evidence: Existing "Indexed Grep" Systems

**Dimension:** D6 — Does anyone do "indexed grep" already?
**Date:** 2026-04-02
**Sources:** GitHub repos, Russ Cox blog, Sourcegraph docs, Cursor blog, academic papers

---

## Key files / pages referenced

- https://github.com/sourcegraph/zoekt — Zoekt (Sourcegraph's trigram-based code search)
- https://github.com/livegrep/livegrep — Livegrep (suffix array-based code search)
- https://github.com/PythonicNinja/trigrep — Trigrep (Rust, trigram index, grep-like CLI)
- https://github.com/sc0ty/grip — Grip (C++, trigram-based indexed grep)
- https://github.com/GrowlyX/instantgrep — InstantGrep (Elixir, Cursor's approach)
- https://github.com/seqis/AI-grep — AI-grep (SQLite FTS5, AI-workflow optimized)
- https://github.com/zeux/qgrep — qgrep (C++, indexed regex grep)
- https://github.com/dominikh/idxgrep — idxgrep (Elasticsearch-backed grep)
- https://github.com/google/codesearch — Google's csearch (original trigram search)
- https://github.blog/engineering/architecture-optimization/the-technology-behind-githubs-new-code-search/ — Blackbird

---

## Findings

### Finding: At least 10 indexed grep systems exist, spanning 3 architectural categories
**Confidence:** CONFIRMED
**Evidence:** Direct examination of repositories

**Category 1: Trigram inverted index (most common)**

| Tool | Language | Index Type | Scale | Active |
|------|----------|-----------|-------|--------|
| Zoekt (Sourcegraph) | Go | Trigram + ctags | Millions of files | Yes (production) |
| Blackbird (GitHub) | Rust | Dynamic n-gram | 115 TB / 45M repos | Yes (production) |
| csearch (Google) | Go | Trigram | ~GB scale | Maintained |
| grip | C++ | Trigram | Large codebases | Maintained |
| trigrep | Rust | Trigram/sparse n-gram | Large codebases | New (2025-2026) |
| instantgrep | Elixir/C | Trigram + bloom | Monorepos | New (2025-2026) |
| qgrep | C++ | Compressed trigram | Large codebases | Maintained |

**Category 2: Suffix array**

| Tool | Language | Index Type | Scale | Active |
|------|----------|-----------|-------|--------|
| Livegrep | Go/C++ | Suffix array | ~1 GB repos | Maintained |

**Category 3: Full-text search (BM25/FTS) as coarse filter**

| Tool | Language | Index Type | Scale | Active |
|------|----------|-----------|-------|--------|
| ChromaFs (Mintlify) | TypeScript | Chroma vector DB | Docs corpus | Yes (production) |
| AI-grep | Python/Shell | SQLite FTS5 | Medium codebases | New (2025-2026) |
| idxgrep | Go | Elasticsearch | System-wide | Older |

### Finding: Trigram index is the established winner for regex-compatible indexed grep
**Confidence:** CONFIRMED
**Evidence:** All production-scale systems use trigrams (or variants)

The trigram approach dominates because:
1. **Any regex can be decomposed into trigram queries** (Russ Cox, 2006/2012)
2. **Trigrams balance selectivity vs index size** (bigrams too broad, quadgrams too large)
3. **False positives are always acceptable** because Stage 2 verifies with actual regex
4. **Index size is ~10-20% of source data** (manageable)
5. **Incremental updates are possible** (add/remove files without full rebuild)

GitHub's innovation: dynamic n-grams instead of fixed trigrams, to handle high-frequency trigrams (e.g., "for", "the") that would saturate a standard trigram index.

Cursor's innovation: sparse n-grams with bloom filter masks for adjacency verification, achieving even better selectivity.

### Finding: trigrep provides direct benchmarks showing indexed grep beating ripgrep
**Confidence:** CONFIRMED
**Evidence:** https://github.com/PythonicNinja/trigrep benchmarks

On git.git (~4000 files):

| Tool | Mean (s) | Median (s) |
|------|----------|-----------|
| grep | 0.5990 | 0.5550 |
| ripgrep | 0.0640 | 0.0500 |
| trigrep | 0.0405 | 0.0500 |

trigrep is 1.58x faster than ripgrep at this scale. Modest but measurable.

### Finding: No existing system uses BM25/Orama as the index layer for grep
**Confidence:** CONFIRMED (NOT FOUND)
**Evidence:** Exhaustive search of indexed grep tools

Every indexed grep system uses one of:
- Trigram inverted index
- Suffix array
- N-gram inverted index (variant of trigram)

No system uses BM25 full-text search (Orama, Elasticsearch BM25, SQLite FTS5 BM25) as the primary index for regex matching. This is because BM25 indexes tokens (words), not character-level substrings. Trigram indexes capture arbitrary 3-character sequences including punctuation, whitespace, and word fragments — which is exactly what regex matching needs.

The one exception is AI-grep, which uses SQLite FTS5 — but it's optimized for AI/LLM token efficiency, not for regex matching fidelity. It supplements FTS5 with ripgrep for actual pattern matching.

ChromaFs uses Chroma's vector DB, but for file identification (which docs might match), not for regex pattern matching.

### Finding: The maturity spectrum ranges from academic prototype to production at planet scale
**Confidence:** CONFIRMED
**Evidence:** Direct analysis

- **Planet scale (production):** GitHub Blackbird (115 TB, 45M repos), Sourcegraph Zoekt
- **Company scale (production):** Livegrep (used at Stripe, etc.), ChromaFs (Mintlify)
- **Developer tool:** csearch, grip, qgrep (stable, used by individuals)
- **Recent implementations:** trigrep, instantgrep, AI-grep (2025-2026, inspired by Cursor blog)
- **Prototype/RFC:** ripgrep ngram RFC (proposed 2020, never built)

### Finding: Zoekt performance at Google/Sourcegraph scale
**Confidence:** CONFIRMED
**Evidence:** Sourcegraph docs, Google papers

- Google Code Search (2018): ~1.5 TB indexed, ~200 queries/sec, median ~50ms latency
- Zoekt: memory-maps .zoekt shard files, zero-downtime updates, integrates ctags for symbol ranking
- GitHub Blackbird: individual shard p99 ~100ms, ~640 queries/sec per 64-core host
- Index size: ~20-25% of original content (Zoekt: ~20%, Blackbird: ~22%)

---

## Gaps / follow-ups

* No TypeScript/JavaScript implementation of a trigram-indexed grep exists (all are Go, Rust, C++, Elixir)
* Building a trigram index in TypeScript would be a significant engineering effort
* The Cursor blog approach (sparse n-grams) is more sophisticated than basic trigrams but no OSS TypeScript implementation exists
