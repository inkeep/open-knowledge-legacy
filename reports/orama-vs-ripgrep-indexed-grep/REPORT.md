---
title: "Orama vs ripgrep and the Indexed Grep Architecture: Can BM25 Search Replace Linear File Scanning?"
description: "Investigation of whether Orama's BM25 search can serve as a coarse filter for ripgrep-compatible regex matching, how the two-stage indexed grep pattern works across production systems (Zoekt, Blackbird, livegrep, Cursor Instant Grep), what performance crossover points exist, and whether an enriched_grep tool is architecturally viable."
createdAt: 2026-04-02
updatedAt: 2026-04-05
subjects:
  - ripgrep
  - Orama
  - Zoekt
  - Sourcegraph
  - GitHub Blackbird
  - livegrep
  - Cursor Instant Grep
  - trigrep
  - Mintlify ChromaFs
  - Google Code Search
topics:
  - indexed grep architecture
  - code search engines
  - trigram indexes
  - two-stage search pattern
  - regex matching optimization
  - search performance benchmarks
---

# Orama vs ripgrep and the Indexed Grep Architecture

**Purpose:** Determine (1) whether Orama's BM25 search can compete with or augment ripgrep for regex matching, and (2) whether a ripgrep-compatible tool backed by an indexed search (using Orama or similar) is architecturally viable, performant, and worth building.

---

## Executive Summary

ripgrep and Orama solve fundamentally different search problems, and comparing them directly is like comparing a chainsaw to a scalpel. ripgrep is a linear file scanner optimized for exact regex pattern matching at the line level, returning unranked results in `filename:line:content` format. Orama is a BM25 full-text search engine that returns ranked documents by term relevance. They operate at different granularities (line vs document), different matching semantics (regex vs tokenized terms), and different output models (exhaustive vs ranked).

The short answer to "has anyone compared Orama to ripgrep?" is **no, because they are not comparable tools.** No benchmark exists and none would be meaningful, because they answer different questions. ripgrep answers "which lines match this pattern?" while Orama answers "which documents are most relevant to these search terms?"

The longer answer to "can we build an indexed grep?" is **yes, it has been done many times, but the correct index structure is a trigram inverted index, not BM25.** Every production code search system — Google Code Search, Sourcegraph Zoekt, GitHub Blackbird, livegrep, Cursor Instant Grep — uses the same two-stage architecture: (1) query an n-gram index to find candidate files, (2) run actual regex on candidates only. This pattern achieves 10-1,300x speedups over ripgrep at large scale. At least 10 open-source implementations exist. None use BM25 as the index layer, because BM25 indexes words (tokens), not character-level substrings — and regex matching requires character-level precision.

Orama could play a supporting role in an enriched grep, but as a document-level relevance ranker, not as a regex filter. The practical architecture is: run ripgrep for exact matching (it is already fast enough at 1,000 files), then enrich results with Orama-sourced metadata (document title, section heading, relevance score, related documents). The enrichment layer — not the index — is the actual value add over bare ripgrep.

**Key Findings:**

- **ripgrep at 1K markdown files takes ~15-50ms (warm cache).** This is already fast enough that an index provides negligible speedup at this scale. The crossover where indexed search consistently beats ripgrep is ~5,000-10,000 files.
- **Orama BM25 search at 1K docs takes ~0.02ms** — 500-2,500x faster than ripgrep in raw lookup. But it returns document-level term matches, not line-level regex matches. It cannot answer "which lines match `function\s+\w+`?"
- **The two-stage indexed grep pattern is proven at planet scale.** GitHub Blackbird searches 115 TB across 45M repos at 640 queries/sec with p99 latency ~100ms per shard. Zoekt handles Sourcegraph's entire code corpus. The architecture works.
- **Trigram inverted indexes, not BM25, are the correct index for grep.** All 10+ existing indexed grep systems use trigrams (or variants like sparse n-grams). BM25 tokenizes on word boundaries and applies stemming — it cannot match arbitrary substrings like `func`, regex patterns like `\d{3}-\d{4}`, or structural patterns like `import.*from`.
- **An enriched grep wrapping ripgrep is more practical than replacing it.** At our scale, the architecture should be: ripgrep for search, Orama for enrichment (frontmatter, section headings, relevance). Replacing ripgrep's regex engine adds complexity with no performance benefit below 5K files.
- **If we ever need indexed grep at scale, trigrep exists.** A Rust implementation with trigram indexing that benchmarks 1.58x faster than ripgrep on ~4K files (git.git). But no TypeScript implementation exists.
- **For agentic consumers, search engines and grep serve different pipeline layers.** Agents use search for orientation/discovery ("what do we know about X?") and grep for targeted extraction ("find lines matching Y"). Industry has converged on a 3-layer progressive disclosure pattern (index → search → read/grep). Search engines reduce agent token consumption by 2-10x vs grep-only retrieval. Both tools are needed — they're complementary at different stages of the agent retrieval pipeline.

---

## Research Rubric

**Report Type:** Comparative Analysis / Architecture Assessment
**Primary Question:** Can Orama serve as an index layer for ripgrep-compatible regex matching? What does the indexed grep architecture look like?
**Audience:** Engineering team evaluating search architecture for an agent-native knowledge platform
**Stance:** Factual — presenting the technical landscape with architectural implications

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | ripgrep performance characteristics | Deep | P0 |
| D2 | Orama search performance vs ripgrep | Deep | P0 |
| D3 | Two-stage indexed grep pattern | Deep | P0 |
| D4 | Reproducing ripgrep's output format | Deep | P0 |
| D5 | Practical implementation architecture | Deep | P0 |
| D6 | Existing "indexed grep" systems | Deep | P0 |
| D7 | Agentic search patterns — how agents use search vs grep | Deep | P0 |

**Non-goals:** Cloud search services; GPU-based approaches; Orama Cloud evaluation; building a production indexed grep (this is assessment, not implementation).

---

## Detailed Findings

### D1: ripgrep Performance Characteristics

**Finding:** ripgrep achieves its speed through five architectural optimizations — SIMD literal matching (Teddy algorithm), smart byte frequency selection, conditional memory mapping, lock-free parallel file scanning, and .gitignore-aware directory traversal. At 1,000 markdown files, it completes a typical search in 15-50ms (warm cache). Its fundamental limitation is that it must scan all files linearly, which matters at 10K+ file scale but not at 1K.

**Evidence:** [evidence/ripgrep-performance-characteristics.md](evidence/ripgrep-performance-characteristics.md)

#### Benchmark data

Published benchmarks on M2 MacBook Pro (ripgrep 14.1.1, hyperfine, 3 warmup runs):

| Benchmark | ripgrep | GNU grep | Speedup |
|-----------|---------|----------|---------|
| Linux kernel tree (identifier) | 0.334s | ~3.1s | 9.2x |
| Linux kernel tree (regex) | — | — | 11.8x |
| Node.js project (default) | — | — | 302x |
| Single 1 GB file (literal) | 0.268s | 0.516s | 1.9x |
| Single 1 GB file (case-insensitive) | 0.366s | 4.084s | 11.2x |
| 240 log files | 0.018s | 4.2s | 233x |

Estimated performance at our target scale (warm cache, simple pattern):

| File count | Estimated ripgrep latency |
|------------|--------------------------|
| 100 files | 5-15ms |
| 1,000 files | 15-50ms |
| 10,000 files | 100-334ms |
| 62,000 files (kernel) | ~334ms |

#### Why ripgrep is fast

1. **Teddy SIMD algorithm:** Examines 16 bytes per iteration using AVX2/SSE2/NEON packed comparisons. Finds literal candidate positions before invoking the full regex engine.
2. **Rare byte selection:** Instead of Boyer-Moore's last-byte, selects the statistically rarest byte from a frequency table. Reduces false candidate positions.
3. **Conditional I/O strategy:** Memory-maps single large files; uses buffered incremental reads for many small files (avoids per-file kernel mmap overhead).
4. **Lock-free parallelism:** Work-stealing queues across CPU cores for file scanning. Output serialized only at print stage.
5. **Smart directory traversal:** Compiles .gitignore globs to regex, skips entire ignored subtrees.

#### The fundamental limitation

As [Cursor's engineering blog](https://cursor.com/blog/fast-regex-search) states: "No matter how fast ripgrep can match on the contents of a file, it has one serious limitation: it needs to match on the contents of all files." This limitation is irrelevant at 1K files (scanning all takes <50ms) but becomes the bottleneck at 10K+ files.

Andrew Gallant (ripgrep's author) acknowledged this in a [2020 RFC proposing ngram indexing](https://github.com/BurntSushi/ripgrep/issues/1497) for ripgrep. He noted that ripgrep is "probably fast enough" for smaller datasets but designed the RFC for corpora that "do not fit into memory." The RFC was never implemented.

**Remaining uncertainty:** Cold cache performance on 1K markdown files could be significantly slower (100-500ms) on spinning disks, but SSDs largely eliminate this concern for modern development machines.

---

### D2: Orama Search Performance vs ripgrep

**Finding:** Orama's BM25 full-text search at 1,000 documents completes in ~0.02ms (20 microseconds) — approximately 1,000x faster than ripgrep scanning the same files. However, the two tools solve fundamentally different problems: Orama returns ranked documents by term relevance; ripgrep returns exact regex matches at line granularity. Orama cannot perform regex matching, substring matching, or line-level result extraction. A direct performance comparison is misleading because they answer different questions.

**Evidence:** [evidence/orama-search-performance.md](evidence/orama-search-performance.md)

#### Performance comparison (1,000 documents)

| Metric | Orama BM25 | ripgrep |
|--------|-----------|---------|
| Search latency | ~0.02ms | ~15-50ms |
| Result type | Ranked documents | Unranked line matches |
| Matching | Tokenized terms | Exact regex |
| Granularity | Document | Line |
| Regex support | None | Full (PCRE-like) |
| Substring matching | No (whole tokens) | Yes |
| Context lines | No | Yes (-A/-B/-C) |

#### Why the comparison is misleading

Orama's BM25 index tokenizes text into words at index time, applies stemming, and optionally removes stop words. This makes it excellent for "find documents about database migrations" but useless for "find lines matching `function\s+\w+`."

Specific patterns where Orama fails as a grep replacement:

| Pattern | ripgrep can match | Orama can match |
|---------|------------------|-----------------|
| `function\s+\w+` | Yes | No (no regex) |
| `func` (substring) | Yes | No (not a full token) |
| `if` (keyword) | Yes | Maybe not (stop word) |
| `\d{3}-\d{4}` | Yes | No (no character patterns) |
| `TODO\|FIXME` | Yes | Partial (can find docs with either term) |
| `import.*from` | Yes | No (can't enforce ordering) |
| `"config"` (exact word) | Yes | Yes (this is what BM25 is for) |

#### Where Orama adds value beyond grep

Orama provides capabilities ripgrep does not:
- **Relevance ranking:** BM25 scores tell you which documents are most relevant, not just which match
- **Fuzzy matching:** Handles typos and near-matches
- **Field boosting:** Title matches can score higher than body matches
- **Semantic search (with vectors):** Find conceptually related content
- **Faceted filtering:** Filter by metadata fields (tags, categories, dates)

These are complementary to grep, not competitive with it.

**Decision triggers:**
- If the use case is "find exact pattern matches" → ripgrep wins, Orama cannot help
- If the use case is "find relevant documents about a topic" → Orama wins, ripgrep is wrong tool
- If the use case is "find exact matches but also know the relevance context" → use both (ripgrep for matches, Orama for enrichment)

---

### D3: The Two-Stage Indexed Grep Pattern

**Finding:** Every production code search system uses the same two-stage architecture: (1) query an index to find candidate files that might match, (2) run actual regex only on those candidates. This pattern achieves 10-1,300x speedup over linear scanning at large scale. The index structure that works for this is a trigram (or n-gram) inverted index, NOT BM25. The crossover point where indexed search consistently beats ripgrep is approximately 5,000-10,000 files.

**Evidence:** [evidence/two-stage-indexed-grep-pattern.md](evidence/two-stage-indexed-grep-pattern.md)

#### The universal architecture

```
            Stage 1: Index Filter              Stage 2: Regex Verify
            (coarse, fast, may                 (exact, slower, no
             have false positives)              false positives)

Pattern ──> Extract literal       ──> Query    ──> For each candidate:
            fragments from regex      index         load content,
            (e.g., "func", "main")    for            run actual regex,
                                      candidate      extract matching
                                      files          lines + context
                                          │
                                          ▼
                                      Skip 80-99%
                                      of files
```

#### Production implementations

| System | Scale | Index | Stage 1 Latency | Speedup vs linear |
|--------|-------|-------|-----------------|-------------------|
| [GitHub Blackbird](https://github.blog/engineering/architecture-optimization/the-technology-behind-githubs-new-code-search/) | 115 TB, 45M repos | Dynamic n-gram | p99 ~100ms/shard | ~100,000x vs ripgrep |
| [Sourcegraph Zoekt](https://github.com/sourcegraph/zoekt) | Millions of files | Trigram + ctags | ~50ms median | 1000x+ |
| [Cursor Instant Grep](https://cursor.com/blog/fast-regex-search) | Large monorepos | Sparse n-gram + bloom | ~13ms local | 1,300x vs ripgrep |
| [Livegrep](https://github.com/livegrep/livegrep) | ~1 GB repos | Suffix array | Interactive | 10-100x |
| [ChromaFs](https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant) (Mintlify) | Docs corpus | Chroma vector DB | Subsecond | ~460x (session time) |

#### The regex-to-trigram conversion (Russ Cox, 2012)

The foundational algorithm, published by [Russ Cox](https://swtch.com/~rsc/regexp/regexp4.html) (who also built Google Code Search and RE2):

- Concatenation `e1e2`: `trigrams(e1) AND trigrams(e2)`
- Alternation `e1|e2`: `trigrams(e1) OR trigrams(e2)`
- Example: `/Google.*Search/` becomes `Goo AND oog AND ogl AND gle AND Sea AND ear AND arc AND rch`

Real-world selectivity:
- DATAKIT search: 2,739 candidate files reduced to 3 (99.9% elimination)
- "hello world": 36,972 files to 25 candidates (0.07% survival, 100x speedup)
- Case-insensitive: 10-20x improvement (less precise but still significant)

Patterns where trigram indexing struggles:
- Patterns shorter than 3 characters (return ALL documents)
- Heavy wildcards (`.*` everywhere) — generates trivial trigram queries
- Broad character classes (`[a-z]+`) — too many trigram variants
- Case-insensitive on short patterns — exponential trigram expansion

#### The crossover point

| Scale | ripgrep | Indexed grep | Winner |
|-------|---------|-------------|--------|
| 100 files | 5-15ms | 5-20ms (index overhead) | ripgrep (no benefit) |
| 1,000 files | 15-50ms | 5-15ms | Marginal (indexed slightly faster) |
| 5,000 files | 75-200ms | 10-20ms | Indexed (3-10x faster) |
| 10,000 files | 100-334ms | 10-30ms | Indexed (5-15x faster) |
| 100,000 files | 1-3s | 15-50ms | Indexed (30-100x faster) |

The crossover is at approximately 5,000 files for literal patterns and approximately 10,000 files for complex regex patterns (where trigram selectivity is lower).

**Decision triggers:**
- Below 5,000 files: ripgrep is fast enough; indexing adds complexity without meaningful speedup
- 5,000-50,000 files: indexed grep provides measurable benefit (5-30x)
- Above 50,000 files: indexed grep is essential (ripgrep becomes noticeably slow)

---

### D4: Reproducing ripgrep's Output Format

**Finding:** ripgrep's pipe-mode output format is simple, deterministic, and straightforward to reproduce. Three output modes matter for Claude Code: content (`filename:line:content`), files_with_matches (`filename`), and count (`filename:count`). Context lines use `-` separator instead of `:`, and non-adjacent groups are separated by `--`. Producing byte-identical output to ripgrep in pipe mode is achievable.

**Evidence:** [evidence/ripgrep-output-format.md](evidence/ripgrep-output-format.md)

#### Output format specification

**Content mode (default):**
```
path/to/file.md:42:This line matches the pattern
path/to/file.md:87:Another matching line here
```

With line numbers (`-n`) and context (`-C 1`):
```
path/to/file.md-41-Line before the match
path/to/file.md:42:This line matches the pattern
path/to/file.md-43-Line after the match
--
path/to/file.md-86-Context line before
path/to/file.md:87:Another matching line here
path/to/file.md-88-Context line after
```

Key format rules:
- Match lines: `{path}:{linenum}:{content}`
- Context lines: `{path}-{linenum}-{content}`
- Group separator: `--` on its own line (between non-adjacent matches)
- Line numbers are 1-indexed

**Files with matches mode (`-l`):**
```
path/to/file1.md
path/to/file2.md
```

**Count mode (`-c`):**
```
path/to/file1.md:3
path/to/file2.md:7
```

#### Claude Code's Grep tool parameter mapping

| Grep tool parameter | ripgrep equivalent |
|--------------------|-------------------|
| `pattern` | First positional arg |
| `path` | Second positional arg |
| `output_mode: "content"` | Default behavior |
| `output_mode: "files_with_matches"` | `-l` |
| `output_mode: "count"` | `-c` |
| `-A` (after context) | `-A N` |
| `-B` (before context) | `-B N` |
| `-C` (context both) | `-C N` |
| `-i` (case insensitive) | `-i` |
| `-n` (line numbers) | `-n` |
| `multiline` | `-U --multiline-dotall` |
| `glob` | `--glob PATTERN` |
| `type` | `--type TYPE` |
| `head_limit` | Post-processing (pipe to `head`) |
| `offset` | Post-processing (pipe to `tail +N | head`) |

#### Implementation complexity assessment

Reproducing this output is straightforward (~50-100 lines of code for the formatter). The complexity lies not in formatting but in:

1. **Correct line numbering** — must track line numbers accurately during scanning
2. **Context line deduplication** — overlapping context windows from adjacent matches must merge
3. **Group separator placement** — `--` only between non-adjacent groups, not before first or after last
4. **Encoding handling** — ripgrep gracefully handles non-UTF-8; a pure JS implementation would need to handle this too

**Decision triggers:**
- If the goal is to produce output that existing ripgrep parsers can consume: achievable, ~100 lines
- If the goal is to produce ENRICHED output beyond ripgrep's format: use `--json`-style structured output instead (JSON Lines with extra fields)

---

### D5: Practical Implementation Architecture

**Finding:** An Orama-backed enriched_grep is architecturally viable but the design should be "enriched ripgrep" rather than "ripgrep replacement." At 1,000 files, Orama adds negligible search speed improvement over ripgrep. The value of integrating Orama is enrichment (frontmatter, section headings, relevance scores, related documents) — not faster regex matching. The implementation should wrap ripgrep for search and use Orama for context enrichment.

**Evidence:** [evidence/practical-implementation-architecture.md](evidence/practical-implementation-architecture.md)

#### Why "replace ripgrep" is the wrong framing

At 1,000 markdown files:
- ripgrep search: ~15-50ms (fast enough)
- Orama BM25 filter + regex verify: ~5ms (Orama) + ~2-10ms (regex on candidates) = ~7-15ms
- Net savings: 5-35ms — not perceptible to the user

The overhead of maintaining an Orama index, extracting literals from regex patterns, handling fallback cases, and managing edge cases far exceeds the 5-35ms saved.

At 10,000+ files, the calculus changes — but the correct index at that scale is a trigram index, not BM25.

#### The recommended architecture: enriched ripgrep

```
enriched_grep(pattern, path, options):

  ┌─────────────────────────────────────────────────┐
  │  Layer 1: Search (ripgrep)                       │
  │                                                   │
  │  Spawn `rg` with the user's pattern and options  │
  │  Parse output into structured results            │
  │  Returns: [{file, line, content, context}, ...]  │
  └────────────────────┬──────────────────────────────┘
                       │
                       ▼
  ┌─────────────────────────────────────────────────┐
  │  Layer 2: Enrichment (Orama + file metadata)     │
  │                                                   │
  │  For each matched file:                           │
  │    - Look up document in Orama index             │
  │    - Extract: title (frontmatter), section        │
  │      heading, BM25 relevance score                │
  │    - Optionally: find related documents           │
  │  Attach enrichment to each result                │
  └────────────────────┬──────────────────────────────┘
                       │
                       ▼
  ┌─────────────────────────────────────────────────┐
  │  Layer 3: Output formatting                       │
  │                                                   │
  │  Mode A: ripgrep-compatible (pipe format)        │
  │    filename:line:content  (standard grep output)  │
  │                                                   │
  │  Mode B: enriched (JSON Lines)                   │
  │    {file, line, content, title, section,          │
  │     relevance, related}                           │
  └───────────────────────────────────────────────────┘
```

#### Why this architecture works

1. **No regression:** ripgrep handles all regex patterns, edge cases, binary files, encoding, symlinks. Zero correctness risk.
2. **Enrichment is additive:** frontmatter, section headings, and relevance scores are new capabilities ripgrep doesn't provide.
3. **Orama is already present:** If the knowledge platform already uses Orama for search, the index exists. No extra index to build.
4. **Graceful degradation:** If Orama index is stale or unavailable, results degrade to plain ripgrep output.
5. **Scale-ready:** If files grow to 10K+, the architecture can be extended to add an Orama-based pre-filter (query Orama first, pass candidate paths to ripgrep via `--glob` or file list).

#### The enrichment value proposition

| Enrichment field | Source | Value for agents |
|-----------------|--------|-----------------|
| Document title | Frontmatter `title:` field | Agent knows what document a match is in |
| Section heading | Nearest `## ` heading above match | Agent knows which section of the document |
| BM25 relevance | Orama search score | Agent can prioritize high-relevance matches |
| Document description | Frontmatter `description:` field | Agent gets document context without reading it |
| Related documents | Orama vector similarity | Agent discovers related content |
| Tags/topics | Frontmatter metadata | Agent can filter by topic |

This enrichment transforms grep from "here are matching lines" to "here are matching lines with full context about what they're in and why they matter."

#### Edge cases and fallback behavior

| Edge case | Behavior |
|-----------|----------|
| Complex regex Orama can't filter | Skip Orama, use ripgrep directly |
| Binary files | ripgrep handles detection and skipping |
| Non-UTF-8 content | ripgrep handles gracefully |
| Orama index stale | Fall back to plain ripgrep; enrich with file-level metadata from frontmatter parsing |
| Very large result sets | Apply head_limit before enrichment (don't enrich results that will be truncated) |
| No Orama index available | Pure ripgrep mode (enriched_grep degrades to ripgrep) |

**Decision triggers:**
- If the goal is faster grep: not worth building at 1K files. ripgrep is fast enough.
- If the goal is smarter grep (context-aware results): the enrichment layer is valuable and practical.
- If the file count grows past 5K: add a pre-filter stage (Orama narrows candidate files before ripgrep runs).

---

### D6: Existing "Indexed Grep" Systems

**Finding:** At least 10 open-source indexed grep systems exist, spanning three architectural categories: trigram inverted indexes (dominant), suffix arrays, and full-text search as a coarse filter. All production systems at scale use trigram indexes or variants. No system uses BM25 as the primary grep index. The newest implementations (trigrep, instantgrep) were directly inspired by Cursor's 2025 blog post on fast regex search.

**Evidence:** [evidence/existing-indexed-grep-systems.md](evidence/existing-indexed-grep-systems.md)

#### The landscape

**Category 1: Trigram/n-gram inverted index** (7 systems, dominant approach)

| System | Language | Scale | Status |
|--------|----------|-------|--------|
| [Zoekt](https://github.com/sourcegraph/zoekt) (Sourcegraph) | Go | Millions of files | Production |
| [Blackbird](https://github.blog/engineering/architecture-optimization/the-technology-behind-githubs-new-code-search/) (GitHub) | Rust | 115 TB / 45M repos | Production |
| [csearch](https://github.com/google/codesearch) (Google) | Go | ~GB repos | Maintained |
| [grip](https://github.com/sc0ty/grip) | C++ | Large codebases | Maintained |
| [trigrep](https://github.com/PythonicNinja/trigrep) | Rust | Large codebases | New (2025-2026) |
| [instantgrep](https://github.com/GrowlyX/instantgrep) | Elixir/C | Monorepos | New (2025-2026) |
| [qgrep](https://github.com/zeux/qgrep) | C++ | Large codebases | Maintained |

**Category 2: Suffix array** (1 system)

| System | Language | Scale | Status |
|--------|----------|-------|--------|
| [Livegrep](https://github.com/livegrep/livegrep) | Go/C++ | ~1 GB repos | Production (Stripe) |

**Category 3: Full-text/vector as coarse filter** (3 systems)

| System | Language | Index | Status |
|--------|----------|-------|--------|
| [ChromaFs](https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant) (Mintlify) | TypeScript | Chroma vector DB | Production |
| [AI-grep](https://github.com/seqis/AI-grep) | Python/Shell | SQLite FTS5 | New (2025-2026) |
| [idxgrep](https://github.com/dominikh/idxgrep) | Go | Elasticsearch | Older |

#### Why trigram is the right index for grep

Trigram indexes capture all overlapping 3-character sequences: `"hello"` produces `hel`, `ell`, `llo`. This means:

1. **Any substring of 3+ characters can be looked up** — unlike BM25 which only knows whole tokens
2. **Regex patterns decompose naturally into trigram queries** — Russ Cox's algorithm handles this
3. **False positives are guaranteed to be caught** by the Stage 2 regex verification
4. **Index size is predictable** — approximately 10-20% of source data

BM25 indexes fail here because they tokenize on word boundaries. The query `func` (substring of "function") has no representation in a BM25 index. The query `\d{3}-\d{4}` (phone number pattern) has no token equivalent. BM25 is the wrong data structure for this problem.

#### Key benchmark: trigrep vs ripgrep

On git.git (~4,000 files), [trigrep](https://github.com/PythonicNinja/trigrep) benchmarked:

| Tool | Mean | Median |
|------|------|--------|
| grep | 0.5990s | 0.5550s |
| ripgrep | 0.0640s | 0.0500s |
| trigrep | 0.0405s | 0.0500s |

trigrep is 1.58x faster than ripgrep at this scale. The benefit grows with file count.

#### Gap: No TypeScript/JavaScript trigram grep exists

All indexed grep implementations are in Go, Rust, C++, or Elixir. No TypeScript/JavaScript implementation exists. Building one would be a significant effort (the trigram index data structure, regex-to-trigram converter, posting list intersection, and memory-mapped file access).

**Decision triggers:**
- If you need indexed grep in TypeScript: you would need to build it or use FFI to a Rust/Go implementation
- If you can use a subprocess: trigrep or csearch can be spawned like ripgrep is today
- If you are at <5K files: the indexed grep ecosystem is interesting but not necessary

---

### D7: Agentic Search Patterns — How Agents Use Search vs Grep

**Finding:** AI agents use search engines and grep for fundamentally different purposes in a well-documented pipeline. Search engines serve orientation and discovery (Layers 1-2 of progressive disclosure). Grep serves targeted content extraction (Layer 3). Agents can work with grep-only but consume 10-50x more tokens doing so. Three independent research reports converge on this finding.

**Evidence:** [evidence/d7-agentic-search-patterns.md](evidence/d7-agentic-search-patterns.md)

#### The progressive disclosure pipeline (industry-converged)

Eight independent implementations — Anthropic Agent Skills, OpenAI Codex AGENTS.md, Context7 MCP, Aider repo-map, CLAUDE.md, llms.txt, Mintlify, Fumadocs — converge on the same 3-layer architecture:

| Layer | Purpose | Tool | What it answers |
|-------|---------|------|----------------|
| **1. Orientation** | "What exists here?" | Index file / `get_overview` | Catalog of articles, topics, structure |
| **2. Discovery** | "What's relevant to my task?" | `search` (BM25 + vector) | Ranked documents by relevance |
| **3. Content** | "What exactly does it say?" | `read` + `grep` | Full article text, specific line matches |

Anthropic adopted progressive disclosure as the "core design principle" for Agent Skills (December 2025). The pattern reduces context overhead by 80-98% compared to grep-everything approaches.

#### Why agents need ranked search (not just grep)

**Token efficiency:** At 500 articles, grep-only retrieval consumes ~20K-100K tokens. Catalog + keyword search consumes ~8K-12K tokens — a 2-10x reduction. At $3-15/MTok for frontier models, this is both a quality and cost constraint.

**Orientation:** Agents don't start with "find lines matching `auth`." They start with "what do we know about authentication?" — a conceptual question grep cannot answer. grep returns every line containing `auth` equally (including `author`, `authorize`, `authentication_token`). A search engine returns the 5 most relevant articles about authentication, ranked by BM25 score.

**Context window budgets:** Microsoft Research found agent performance degrades "up to 85% for some models" as information overload increases. grep's exhaustive output (every match, every file) works against agents' need for focused, relevant results.

#### The nuance: agents adapt to available tools

The claim "agents search by concept, not pattern" is too strong. Evidence shows agents CAN work grep-only — Claude Code uses Glob → Grep → Read with parallel keyword triangulation and achieves effective results. Amazon Science (Dec 2025) found keyword search achieves 94.5% of RAG-level performance.

The search engine doesn't unlock a capability agents lack. It makes an existing capability **cheaper and more reliable**:
- Fewer iterations (ranked results vs iterating through grep matches)
- Less token waste (top-5 relevant docs vs scanning all matches)
- Semantic coverage (finds "rate limiting" article when agent searches "API throttling")

Cursor's A/B test showed +12.5% accuracy improvement with semantic search vs keyword-only — meaningful but not transformative.

#### The practical split for agent-native knowledge platforms

| Agent intent | Optimal tool | Why |
|---|---|---|
| "What do we know about X?" | `search` (BM25/vector) | Conceptual, ranked, discovers unknown-unknowns |
| "Find all references to Y" | `grep` (regex) | Exact, exhaustive, line-level |
| "What's related to this article?" | `search` (vector similarity) | Embedding distance, no keyword required |
| "Does any article mention Z?" | `grep` (literal match) | Boolean existence check, fast |
| "Show me the deployment checklist" | `search` → `read` | Ranked discovery → targeted retrieval |
| "Find all TODO markers" | `grep` (pattern `TODO:`) | Structural pattern, not conceptual |

**Decision triggers:**
- If building an agent-facing knowledge platform: both search AND grep are needed — they serve different layers of the retrieval pipeline
- If forced to choose one for P0: search engine (BM25) delivers more value per token for agent consumers than grep alone
- If optimizing token costs: the search engine's ranked results are the primary lever (2-10x token reduction vs grep-only)

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Exact benchmarks at 100/1000/10000 files:** No published benchmark exists for ripgrep on exactly these file counts with markdown content. Estimates are extrapolated from Linux kernel benchmarks and scaled by file count.
- **Cold cache vs warm cache:** The impact of filesystem cache state on the crossover point is significant but not well-documented. On SSDs with warm caches, ripgrep benefits more than indexed search (which reads a smaller index file either way).
- **Orama as pre-filter false positive rate:** No benchmark exists showing how many extra candidate files Orama BM25 would return compared to a trigram index for typical grep patterns. This would determine whether Orama as a coarse filter is viable even in principle.

### Out of Scope (per Rubric)

- Cloud search services (Algolia, Elastic Cloud, etc.)
- GPU-accelerated search
- Orama Cloud evaluation
- Building a production implementation (this report assesses feasibility, not implementation)
- 1P codebase analysis

---

## References

### Evidence Files
- [evidence/ripgrep-performance-characteristics.md](evidence/ripgrep-performance-characteristics.md) — ripgrep benchmarks, architecture, and scaling characteristics
- [evidence/orama-search-performance.md](evidence/orama-search-performance.md) — Orama BM25 vs ripgrep comparison and capability analysis
- [evidence/two-stage-indexed-grep-pattern.md](evidence/two-stage-indexed-grep-pattern.md) — Two-stage architecture across production systems
- [evidence/ripgrep-output-format.md](evidence/ripgrep-output-format.md) — ripgrep output format specification for all modes
- [evidence/practical-implementation-architecture.md](evidence/practical-implementation-architecture.md) — enriched_grep architecture and edge cases
- [evidence/existing-indexed-grep-systems.md](evidence/existing-indexed-grep-systems.md) — Survey of 10+ indexed grep implementations
- [evidence/d7-agentic-search-patterns.md](evidence/d7-agentic-search-patterns.md) — How agents use search vs grep in the progressive disclosure pipeline

### External Sources
- [ripgrep is faster than {grep, ag, git grep, ucg, pt, sift}](https://burntsushi.net/ripgrep/) — Andrew Gallant's original benchmark analysis
- [Fast regex search: indexing text for agent tools](https://cursor.com/blog/fast-regex-search) — Cursor's sparse n-gram implementation and ripgrep comparison
- [Regular Expression Matching with a Trigram Index](https://swtch.com/~rsc/regexp/regexp4.html) — Russ Cox's foundational paper on trigram-indexed regex
- [The technology behind GitHub's new code search](https://github.blog/engineering/architecture-optimization/the-technology-behind-githubs-new-code-search/) — Blackbird architecture
- [How we built a virtual filesystem for our Assistant](https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant) — Mintlify ChromaFs two-stage grep
- [RFC: add ngram indexing support to ripgrep](https://github.com/BurntSushi/ripgrep/issues/1497) — Andrew Gallant's unimplemented proposal

### Related Research
- [/Users/edwingomezcuellar/reports/orama-deep-dive/](orama-deep-dive/) — Source-code-level assessment of Orama v3 internals, performance at scale, and gap analysis
- [/Users/edwingomezcuellar/reports/local-search-retrieval-stacks-2025-2026/](local-search-retrieval-stacks-2025-2026/) — Comparative evaluation of search stacks including Orama vs SQLite FTS5
