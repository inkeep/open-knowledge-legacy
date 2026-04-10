# Evidence: ripgrep Performance Characteristics

**Dimension:** D1 — ripgrep performance characteristics
**Date:** 2026-04-02
**Sources:** burntsushi.net/ripgrep/, Cursor blog, GitHub discussions, CodeAnt benchmarks, ripgrep GitHub repo

---

## Key files / pages referenced

- https://burntsushi.net/ripgrep/ — Andrew Gallant's original benchmark blog post
- https://www.codeant.ai/blogs/ripgrep-vs-grep-performance — M2 MacBook Pro benchmarks (2024-2025)
- https://cursor.com/blog/fast-regex-search — Cursor's comparison showing ripgrep limitations at scale
- https://github.com/BurntSushi/ripgrep/issues/1497 — RFC for ngram indexing in ripgrep (Gallant, 2020)
- https://deepwiki.com/BurntSushi/ripgrep — Architecture overview

---

## Findings

### Finding: ripgrep achieves 5-12x faster than GNU grep on multi-file searches, with specific optimizations
**Confidence:** CONFIRMED
**Evidence:** CodeAnt benchmarks on M2 MacBook Pro, ripgrep 14.1.1

Benchmark results (M2 MacBook Pro, 16 GB RAM, hyperfine, 3 warmup runs):
- Linux kernel tree, common identifier: ripgrep 9.2x faster than grep
- Regex patterns across kernel tree: ripgrep 11.8x faster
- Node.js projects (with node_modules): ripgrep 302x faster (default settings)
- Node.js projects (grep manually excludes node_modules): ripgrep still 21x faster
- Single massive file: ripgrep 1.6x faster (gap narrows for single files)
- 240 log files benchmark: grep 4.2s vs rg 0.018s (233x speedup)

**Implications:** The speedup is most dramatic for multi-file directory searches, less so for single-file scans.

### Finding: ripgrep's speed comes from 5 architectural optimizations
**Confidence:** CONFIRMED
**Evidence:** burntsushi.net/ripgrep/, DeepWiki architecture docs

1. **SIMD (Teddy algorithm):** Uses AVX2/SSE2/ARM NEON to compare multiple characters simultaneously. The Teddy algorithm (from Intel's Hyperscan) finds literal candidates using 16-byte packed comparisons before invoking the regex engine.

2. **Smart literal extraction:** Rather than Boyer-Moore's last-byte, ripgrep selects the "rarest" byte from a frequency table, reducing false positive candidates. For patterns like `foo|bar|baz`, it uses Aho-Corasick multi-pattern matching.

3. **Memory-mapped I/O (conditional):** For single large files, mmap is efficient. For thousands of small files, intermediate buffer with incremental reading outperforms mmap (avoids kernel bookkeeping overhead per file).

4. **Parallelization:** Lock-free work-stealing queues distribute file searches across CPU cores. Directory traversal runs in a separate thread. Output serialization happens only at the final printing stage.

5. **Smart filtering (.gitignore):** Skips ignored directories entirely, compiles globs to regex efficiently.

**Implications:** These optimizations make ripgrep extremely fast for linear scanning. Any indexed approach must beat this baseline.

### Finding: At small scale (100-1000 markdown files), ripgrep completes in 10-50ms
**Confidence:** INFERRED
**Evidence:** Multiple sources, extrapolation from benchmarks

- Cursor blog: "We routinely see rg invocations that take more than 15 seconds" — but this is on large monorepos, not small file sets
- Claude Code context: "10-30 ripgrep searches in a single task" at ~30ms each
- Linux kernel (62,000+ files): ~334ms per search
- Extrapolating: 100 files ≈ 5-15ms, 1000 files ≈ 15-50ms (warm cache, simple pattern)

**Implications:** At 100-1000 files, ripgrep is already sub-50ms. An indexed approach would need to beat this to be worthwhile.

### Finding: ripgrep's fundamental limitation is linear scanning of all files
**Confidence:** CONFIRMED
**Evidence:** Cursor blog, GitHub Blackbird blog

Cursor: "No matter how fast ripgrep can match on the contents of a file, it has one serious limitation: it needs to match on the contents of all files."

GitHub Blackbird: On 115 TB of code, ripgrep at 0.6 GB/sec per core would yield only 0.01 queries/sec across 2,048 CPU cores. "There's just no cost-effective way to scale" linear scanning.

At small scale (1K files), this is not a limitation. At 10K+ files or when content exceeds cache, it becomes significant.

### Finding: Andrew Gallant proposed but never shipped ngram indexing for ripgrep
**Confidence:** CONFIRMED
**Evidence:** https://github.com/BurntSushi/ripgrep/issues/1497 (Feb 2020)

The RFC proposed:
- Inverted index of ngrams mapping to file posting lists
- Indexes contain file paths + metadata + ngram postings, NOT file contents
- Searches still require reading candidate files to confirm matches
- Segment indexing strategy (write-once, merge over time)
- No relevance ranking ("search is exhaustive with no ranking")
- No automatic index sync (manual refresh)

Status: RFC only, never implemented. Gallant noted ripgrep is "probably fast enough" for smaller datasets.

---

## Gaps / follow-ups

* No direct benchmarks exist for ripgrep on exactly 100/1000/10000 markdown files — estimates are extrapolated
* Cold cache vs warm cache performance difference is significant but not well-documented for small file counts
