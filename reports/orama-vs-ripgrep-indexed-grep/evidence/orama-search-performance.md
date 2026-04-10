# Evidence: Orama Search Performance vs ripgrep

**Dimension:** D2 — Orama search performance compared to ripgrep
**Date:** 2026-04-02
**Sources:** Orama deep-dive report (source-code-level), local-search-retrieval-stacks-2025-2026 report, Orama docs

---

## Key files / pages referenced

- /Users/edwingomezcuellar/reports/orama-deep-dive/REPORT.md — Source-code-level Orama v3 assessment
- /Users/edwingomezcuellar/reports/local-search-retrieval-stacks-2025-2026/REPORT.md — Comparative search stack analysis
- https://docs.orama.com/open-source/usage/search/bm25-algorithm — BM25 implementation docs

---

## Findings

### Finding: Orama full-text search at 1K docs runs in ~0.02ms (microseconds); ripgrep on the same files runs in ~15-50ms
**Confidence:** CONFIRMED (Orama numbers from source code analysis), INFERRED (ripgrep extrapolated)
**Evidence:** Orama deep-dive report evidence/performance-at-scale.md

Orama performance at different scales:

| Operation | 100 docs | 1,000 docs | 10,000 docs |
|-----------|----------|------------|-------------|
| Full-text search | <0.1ms | ~0.02ms | ~0.2ms |
| Vector search (384-dim) | <0.1ms | <1ms | <5ms |
| Hybrid search | <1ms | 5-15ms | 10-30ms |
| Insert (single doc) | <0.1ms | <0.1ms | <0.1ms |

ripgrep estimated performance (warm cache):
- 100 files: ~5-15ms
- 1,000 files: ~15-50ms  
- 10,000 files: ~100-334ms

**Implications:** Orama's BM25 search is 500-2500x faster than ripgrep at 1K docs. BUT they search differently — Orama returns BM25-ranked documents by term matching, ripgrep returns exact regex pattern matches with line-level precision.

### Finding: Orama and ripgrep solve fundamentally different search problems
**Confidence:** CONFIRMED
**Evidence:** Analysis of both tools' architecture

| Dimension | Orama BM25 | ripgrep |
|-----------|-----------|---------|
| Search type | Term-based with BM25 scoring | Exact regex pattern matching |
| Granularity | Document-level | Line-level |
| Ranking | Yes (BM25 relevance scores) | No (exhaustive, unranked) |
| Regex support | No (tokenized terms only) | Full regex (PCRE-like) |
| Substring matching | No (whole-token matching) | Yes (arbitrary substrings) |
| Context lines | No | Yes (-A/-B/-C) |
| Case sensitivity | Configurable at index time | Configurable per query |
| Output | Documents with scores | filename:line:content |

Orama cannot do regex matching. It tokenizes text into words and matches against those tokens using BM25 scoring. A pattern like `function\s+\w+` has no equivalent in Orama's search model.

### Finding: Orama could serve as a file-level candidate filter (coarse pass) but cannot replace regex matching
**Confidence:** CONFIRMED
**Evidence:** Source code analysis of Orama's search internals

Orama's search pipeline:
1. Tokenize query into terms
2. Look up each term in the Radix tree (inverted index)
3. Score matching documents using BM25
4. Return ranked document list

This means Orama can answer "which documents contain the word 'function'?" but NOT "which documents contain 'function\s+\w+'?" or "which lines match 'TODO.*fix'?".

For the two-stage pattern, Orama's role would be: given search terms extracted from a regex, identify which documents are likely candidates. Then run actual regex on those documents only.

### Finding: The search types where Orama overlaps with ripgrep use cases are narrow
**Confidence:** CONFIRMED
**Evidence:** Analysis of common grep patterns

Overlap (Orama can help): 
- Simple word searches: `rg "config"` → Orama can find docs containing "config"
- Multi-word AND searches: `rg "database.*migration"` → Orama can find docs containing both "database" AND "migration"

No overlap (Orama cannot help):
- Regex patterns: `rg "function\s+\w+"` → Orama has no regex support
- Character-level patterns: `rg "\bfoo_\w+"` → Orama tokenizes differently
- Short patterns: `rg "if"` → Orama's stop-word filtering may exclude common words
- Structural patterns: `rg "import.*from"` → Orama can't match ordering/proximity

---

## Gaps / follow-ups

* Orama does have a `threshold` parameter that controls AND/OR behavior — this could be tuned for candidate filtering
* No benchmark exists directly comparing Orama candidate filtering + regex vs pure ripgrep
* Orama's fuzzy matching and stemming may actually be counterproductive for grep-like exact matching
