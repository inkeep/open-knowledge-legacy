# Evidence: JS/TS Full-Text Search Libraries Comparison

**Dimension:** D2 — FlexSearch, lunr.js, MiniSearch, Fuse.js, search-index
**Date:** 2026-04-03
**Sources:** GitHub repos, npm registry, blog posts, Hacker News discussions

---

## Key files / pages referenced

- [FlexSearch GitHub](https://github.com/nextapps-de/flexsearch) — source and benchmarks
- [MiniSearch GitHub](https://github.com/lucaong/minisearch) — source and design doc
- [MiniSearch BM25Params docs](https://lucaong.github.io/minisearch/types/MiniSearch.BM25Params.html)
- [lunr.js GitHub](https://github.com/olivernn/lunr.js/) — maintenance status
- [Fuse.js GitHub](https://github.com/krisk/Fuse) — fuzzy search
- [npm trends comparison](https://npmtrends.com/elasticlunr-vs-flexsearch-vs-fuse.js-vs-lunr-vs-minisearch-vs-search-index)
- [acreom blog](https://acreom.com/blog/the-quest-for-a-great-search) — MiniSearch evaluation

---

## Findings

### Finding: MiniSearch is the strongest BM25 engine among pure-JS alternatives
**Confidence:** CONFIRMED
**Evidence:** [MiniSearch docs](https://lucaong.github.io/minisearch/), [BM25Params](https://lucaong.github.io/minisearch/types/MiniSearch.BM25Params.html)

BM25+ scoring (improvement over standard BM25), written natively in TypeScript, ~913K weekly downloads, ~5,900 GitHub stars, actively maintained. ~7KB gzipped. JSON serialization via `JSON.stringify()`/`MiniSearch.loadJSON()`. Built-in fuzzy search and prefix search. Used by VitePress.

**Implications:** Best pure-JS BM25 engine for a TypeScript codebase. No vector search — would need pairing with a separate vector library for hybrid.

### Finding: FlexSearch uses proprietary "Contextual Search" scoring, NOT BM25
**Confidence:** CONFIRMED
**Evidence:** [FlexSearch README](https://github.com/nextapps-de/flexsearch), [npm v0.3.0 readme](https://www.npmjs.com/package/flexsearch/v/0.3.0)

Author explicitly rejects BM25/TF-IDF. Fastest raw throughput of all JS search engines. ~956K weekly downloads, ~13,650 stars. BUT: TypeScript type definitions have documented issues (Issues #342, #435, #438), ESM compatibility issues spawned community forks (flexsearch-es, flexsearch-ts).

**Implications:** Speed king but non-standard scoring model. Poor TypeScript DX makes it risky for a TS codebase.

### Finding: lunr.js is effectively unmaintained (last release ~2020)
**Confidence:** CONFIRMED
**Evidence:** [GitHub Issue #504](https://github.com/olivernn/lunr.js/issues/504), [Snyk](https://security.snyk.io/package/npm/lunr)

129 open issues. ~5.9M weekly downloads (legacy usage from static site generators). Uses BM25 + vector space model. No TypeScript built-in (community @types/lunr). Immutable index (cannot add docs after creation).

**Implications:** Not viable for new projects despite high download count.

### Finding: Fuse.js is fuzzy search only, not full-text search
**Confidence:** CONFIRMED
**Evidence:** [Fuse.js website](https://www.fusejs.io/)

Bitap algorithm (approximate string matching), not inverted index. ~8.8M downloads, ~20K stars. Suitable for autocomplete/dropdown filters. Not appropriate for document search. MiniSearch's built-in fuzzy search makes Fuse.js redundant in most stacks.

### Finding: search-index uses TF-IDF, not BM25; low adoption
**Confidence:** CONFIRMED
**Evidence:** [GitHub](https://github.com/fergiemcdowall/search-index)

~54K weekly downloads, ~1,400 stars. Built on fergies-inverted-index + LevelDB. Persistent indexing with faceted search. Overkill for 1K-doc in-memory use case.

---

## Comparative Summary

| Library | Downloads/wk | BM25 | TypeScript | Maintained | Vector |
|---------|-------------|------|------------|-----------|--------|
| MiniSearch | ~913K | BM25+ | Native TS | Yes | No |
| FlexSearch | ~956K | No (proprietary) | Poor types | Yes | No |
| lunr.js | ~5.9M | Yes | @types only | No (2020) | No |
| Fuse.js | ~8.8M | No (fuzzy) | Bundled .d.ts | Slow | No |
| search-index | ~54K | No (TF-IDF) | No | Low | No |

---

## Gaps / follow-ups

* No independent head-to-head benchmark at 1000-doc scale comparing these libraries
* FlexSearch v0.8 persistent index (SQLite/PostgreSQL) maturity unclear
