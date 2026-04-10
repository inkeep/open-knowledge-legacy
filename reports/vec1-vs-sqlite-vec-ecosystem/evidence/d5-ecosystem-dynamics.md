# Evidence: D5 — Ecosystem Dynamics

**Dimension:** Are Vec1 and sqlite-vec competing or complementary? Does Vec1 threaten sqlite-vec? Has Garcia commented on Vec1?
**Date:** 2026-04-05
**Sources:** SQLite Forum, GitHub issues, blog posts, Hacker News

---

## Key pages referenced

- https://github.com/asg017/sqlite-vec/issues/94 — "Comparison to other approaches" issue
- https://sqlite.org/forum/info/ceba048877c35c8e5a27e507d900a8f8727c4e546ad7f4eb74b52cea42a36db7 — Vec1 announcement
- https://sqlite.org/forum/info/fdfdecb5698acf2ccc8f8d2101323dc9d705f0d1b24510f42760e2e3961dc4e6 — Vec1 feedback thread
- https://news.ycombinator.com/item?id=41137658 — sqlite-vec HN discussion
- https://marcobambini.substack.com/p/the-state-of-vector-search-in-sqlite — State of vector search analysis

---

## Findings

### Finding: Alex Garcia has not publicly commented on Vec1
**Confidence:** CONFIRMED (negative search)
**Evidence:** Searched: Alex Garcia's blog (alexgarcia.xyz), GitHub issues/discussions on sqlite-vec, Hacker News, Twitter, SQLite Forum

No public statement from Alex Garcia about Vec1 was found across:
- alexgarcia.xyz blog posts
- sqlite-vec GitHub issues and discussions
- SQLite Forum threads about Vec1
- Hacker News discussions
- General web search for "Alex Garcia vec1"

**Implications:** The silence is notable. Garcia may be waiting for Vec1's first release before commenting, may be focused on his own DiskANN work (shipped March 31, 2026 — just 5 weeks after Vec1's announcement on Feb 26, 2026), or may prefer to let the work speak for itself.

---

### Finding: The two projects emerged from different motivations with different design philosophies
**Confidence:** CONFIRMED
**Evidence:** Multiple primary sources

**sqlite-vec (Garcia):**
- Motivated by sqlite-vss's failures (platform restrictions, memory issues, Faiss dependency)
- Philosophy: "vector search isn't too complicated" — run everywhere, no dependencies, "fast enough"
- Community-driven, MIT/Apache dual licensed, broad language bindings
- Initially skeptical that SQLite would add native vector support — Garcia wrote in issue #94: "I doubt they'll add custom column types" and noted SIMD was absent from SQLite's codebase

**Vec1 (Kennedy / SQLite team):**
- Motivated by demand for ANN at scale within SQLite's ecosystem
- Philosophy: Official extension following FTS3/FTS5 pattern — virtual table, training workflow
- SQLite project governance (does not accept patches — noted by community member ncruces)
- Public domain (SQLite license)

---

### Finding: Vec1 and sqlite-vec are architecturally complementary at different scale tiers
**Confidence:** INFERRED
**Evidence:** Feature comparison, performance data, design patterns

The two extensions naturally occupy different niches:

**sqlite-vec strengths (small-to-medium scale):**
- No training required — insert and query immediately
- Broad platform coverage (WASM, mobile, all desktop OS)
- Rich vector type support (float32, int8, bit)
- Binary quantization for space reduction
- Extensive ecosystem integrations (LangChain, Datasette, etc.)
- Perfect recall (brute-force)
- Practical for <250K vectors

**Vec1 strengths (medium-to-large scale):**
- ANN search via IVFADC scales to millions of vectors
- Product quantization for both compression and speed
- Multi-threaded training and search
- Streaming results
- Integrated metadata filtering during ANN search
- Official SQLite pedigree (long-term maintenance guaranteed)

**Overlap zone (250K-1M vectors):** Both extensions compete here. sqlite-vec's DiskANN alpha may eventually serve this range, while Vec1's NN mode could handle the lower end.

---

### Finding: sqlite-vec has significant ecosystem moat that Vec1 lacks
**Confidence:** CONFIRMED
**Evidence:** GitHub, PyPI, npm, LangChain docs, community discussions

sqlite-vec ecosystem advantages:
- **Language bindings:** Python, Node.js, Ruby, Rust, Go (CGO + WASM), C/C++
- **Framework integrations:** LangChain VectorStore, Datasette, sqlite-utils, txtai, rqlite
- **Distribution:** PyPI, npm, RubyGems, crates.io, WASM bundles
- **Community:** Active GitHub with issues, discussions, community fork (vlasky)
- **Mobile:** iOS and Android support

Vec1 ecosystem (current):
- **Distribution:** Source code only (single C file); precompiled via APSW PyPI (Python only, noted by Roger Binns)
- **Framework integrations:** None yet
- **Community:** SQLite Forum feedback only

This ecosystem gap is significant. Even if Vec1 technically outperforms sqlite-vec, adoption requires integration with the tools developers actually use.

---

### Finding: A third player (sqlite-vector by SQLite.ai / Marco Bambini) complicates the landscape
**Confidence:** CONFIRMED
**Evidence:** https://github.com/sqliteai/sqlite-vector, marcobambini.substack.com

sqlite-vector (different from sqlite-vec) was created by Marco Bambini / SQLite.ai:
- Uses ordinary tables (no virtual tables required)
- SIMD-optimized brute-force with quantization
- Supports float32, float16, bfloat16, int8, uint8, 1bit
- Distance metrics: L2, squared L2, L1 (Manhattan), cosine, dot product, Hamming
- Claims 17x faster than sqlite-vec with quantization + preloading
- **License: Elastic License 2.0** (restrictive — not freely usable in production/managed services without commercial license)

The restrictive license limits sqlite-vector's adoption compared to sqlite-vec (MIT/Apache) and Vec1 (public domain).

---

### Finding: Vec1's FTS parallel suggests it may eventually be bundled with SQLite
**Confidence:** INFERRED
**Evidence:** Dan Kennedy built FTS3/FTS5, Vec1 follows the same virtual table pattern, hosted at sqlite.org

FTS5 is now shipped as a standard compile-time option with SQLite. Vec1 follows the identical architectural pattern:
- Built by the same developer (Kennedy)
- Same virtual table interface
- Hosted on sqlite.org
- No external dependencies

If Vec1 follows the FTS trajectory, it could eventually become a compile-time option in SQLite itself. This would be transformative for the ecosystem — every SQLite deployment would have vector search built in.

**Caveat:** This is speculative. No public statement from the SQLite team about bundling Vec1 has been found.

---

### Finding: Community feedback on Vec1 is cautiously positive but highlights practical gaps
**Confidence:** CONFIRMED
**Evidence:** SQLite Forum threads

Positive:
- User "punkish" with 3.4M vectors (768-dim) actively wants native vector search in SQLite matching "FTS-like performance"
- Roger Binns (APSW maintainer) quickly provided precompiled binaries via PyPI
- Nuno Cruces offered WASM SIMD suggestions

Concerns:
- Compilation requirements (AVX2 flag) are a barrier for non-C developers
- WASM support not yet available
- "Testing is woefully inadequate" (Kennedy's own assessment)
- "Does not accept patches" policy limits community contribution

---

## Gaps / follow-ups

- No direct communication between Garcia and Kennedy/SQLite team found
- Whether Vec1 will be bundled with SQLite core is pure speculation
- sqlite-vec community response to Vec1 announcement not visible (no GitHub discussion found)
