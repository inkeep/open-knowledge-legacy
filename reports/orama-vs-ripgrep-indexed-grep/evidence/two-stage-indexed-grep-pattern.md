# Evidence: The Two-Stage Indexed Grep Pattern

**Dimension:** D3 — Two-stage indexed grep pattern
**Date:** 2026-04-02
**Sources:** Russ Cox (Google Code Search), Cursor blog, Mintlify ChromaFs, academic literature

---

## Key files / pages referenced

- https://swtch.com/~rsc/regexp/regexp4.html — Russ Cox, "Regular Expression Matching with a Trigram Index"
- https://cursor.com/blog/fast-regex-search — Cursor's sparse n-gram implementation
- https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant — ChromaFs architecture
- https://github.blog/engineering/architecture-optimization/the-technology-behind-githubs-new-code-search/ — GitHub Blackbird

---

## Findings

### Finding: The two-stage pattern (index filter → regex verify) is the dominant architecture for all code search systems
**Confidence:** CONFIRMED
**Evidence:** Every major code search system uses this pattern

The universal pattern:
1. **Stage 1 (Coarse filter):** Query an index to find candidate files/positions that MIGHT match
2. **Stage 2 (Fine verify):** Run actual regex on candidates to confirm true matches

Implementations:

| System | Stage 1 (Index) | Stage 2 (Verify) | Scale |
|--------|----------------|-------------------|-------|
| Google Code Search | Trigram inverted index | RE2 regex | Billions of files |
| Sourcegraph/Zoekt | Trigram + ctags | Go regex | Millions of files |
| GitHub Blackbird | Dynamic-gram inverted index | Rust regex | 115 TB (45M repos) |
| Livegrep | Suffix array | RE2 regex | ~1 GB repos |
| Cursor Instant Grep | Sparse n-gram + bloom | Regex | Large monorepos |
| Mintlify ChromaFs | Chroma vector DB | just-bash grep | Docs corpus |

### Finding: The trigram-to-regex conversion is well-established (Russ Cox, 2012)
**Confidence:** CONFIRMED
**Evidence:** https://swtch.com/~rsc/regexp/regexp4.html

The algorithm converts a regex into a boolean query over trigrams:
- Concatenation `e1e2`: match(e1) AND match(e2)
- Alternation `e1|e2`: match(e1) OR match(e2)
- `/Google.*Search/` → `Goo AND oog AND ogl AND gle AND Sea AND ear AND arc AND rch`

Performance on real corpus:
- DATAKIT search: 2,739 candidates → 3 actual matches (index eliminated 99.9% of files)
- "hello world": 36,972 files → 25 candidates (~100x speedup, 1.96s brute → 0.01s indexed)
- Case-insensitive: still 10-20x improvement despite less precise queries

Weak patterns (where trigram index doesn't help much):
- Patterns < 3 chars (returns ALL documents)
- Heavy wildcards (`.*` everywhere)
- Broad character classes (`[a-z]+`)
- Case-insensitive on short patterns (too many trigram variants)

### Finding: Cursor's Instant Grep achieves 1,300x speedup over ripgrep on large repos
**Confidence:** CONFIRMED (on large repos), UNCERTAIN (on small repos)
**Evidence:** https://cursor.com/blog/fast-regex-search

Cursor's numbers: 16.8 seconds with ripgrep vs 13ms with Instant Grep (local search) = 1,300x speedup.

But this is on LARGE monorepos. On small repos (100-1000 files), the overhead of building and maintaining an index may not be worth it.

Architecture: Sparse n-grams (variable-length, not just trigrams) + bloom filter masks for adjacency verification. Syncs via git commit state.

### Finding: ChromaFs uses vector DB as coarse filter + grep as fine filter
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant

ChromaFs pattern:
1. Intercept grep command, parse flags with yargs-parser
2. Translate to Chroma query: fixed strings → `$contains`, patterns → `$regex`
3. Matching chunks prefetched into Redis cache
4. Rewrite grep to target only matched files
5. just-bash executes fine-filter regex in-memory

Performance: Session creation dropped from ~46s to ~100ms (but this includes broader vfs benefits, not just grep).

Key insight: ChromaFs is for AGENT tools searching docs, not for developer grep. The vector DB is already there for RAG; reusing it for grep is a bonus, not the primary purpose.

### Finding: The crossover point where indexed search beats ripgrep is ~5,000-10,000 files
**Confidence:** INFERRED
**Evidence:** Extrapolation from benchmarks + index overhead analysis

- At 100 files: ripgrep ~5-15ms, index lookup + verify might take 5-20ms (overhead of index read dominates) → no benefit
- At 1,000 files: ripgrep ~15-50ms, indexed ~5-15ms → marginal benefit
- At 10,000 files: ripgrep ~100-334ms, indexed ~10-30ms → clear benefit (3-10x)
- At 100,000+ files: ripgrep >1s, indexed still ~20-50ms → massive benefit

The crossover depends on:
- Index format and access pattern (mmap vs load)
- Number of candidate files returned by index (selectivity)
- Pattern complexity (simple literals benefit more from index)
- Cache state (warm cache helps ripgrep more)

trigrep benchmark (git.git, ~4000 files): trigrep 0.0405s vs ripgrep 0.0640s = 1.58x faster. Modest benefit at this scale.

---

## Gaps / follow-ups

* No direct benchmark of Orama-as-coarse-filter + regex-verify exists
* The BM25 coarse filter is a different animal from trigram index — BM25 finds documents by term relevance, trigram finds by substring presence
* Need to estimate false positive rate of Orama BM25 as a grep filter (how many extra files would Orama return that don't actually match the regex?)
