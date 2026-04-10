# Evidence: Patterns and Convergences

**Dimension:** D4 — Patterns and Convergences
**Date:** 2026-04-03
**Sources:** Synthesized from D1, D2, D3, D5 evidence plus additional sources

---

## Key sources
- All evidence files in this report (D1-D3, D5)
- [sqlite.org](https://sqlite.org) — SQLite documentation
- [asg017/sqlite-vec](https://github.com/asg017/sqlite-vec) — sqlite-vec hybrid search examples
- [oramasearch/orama](https://github.com/oramasearch/orama) — Orama search engine
- [quickwit-oss/tantivy](https://github.com/quickwit-oss/tantivy) — Tantivy search engine

---

## Findings

### Finding: SQLite is the dominant local storage substrate — used by 6+ of 8 production apps studied
**Confidence:** CONFIRMED
**Evidence:** See D3 evidence file (production-local-first-apps.md)

Apps using SQLite: Logseq (FTS5 via WASM), AppFlowy (Diesel ORM + sqlite-vec), Inkdrop (PouchDB over SQLite + FTS5), Notion (WASM SQLite via OPFS), Bear (Core Data → SQLite), Docmost (PostgreSQL for server, but pattern applies). Apps not using SQLite: AnyType (BadgerDB + Tantivy), AFFiNE (PostgreSQL + Manticore).

**Implications:** SQLite is the common denominator for local-first apps. For a TypeScript app, better-sqlite3 or sql.js provides the foundation, with FTS5 and sqlite-vec as extensions.

### Finding: Tantivy is the dominant embedded search engine for compiled/native local-first apps
**Confidence:** CONFIRMED
**Evidence:** AnyType (tantivy-go), AppFlowy (tantivy 0.24.1), TursoDB (Tantivy in SQLite)

Three independent production codebases chose Tantivy. It is the Lucene equivalent for non-JVM stacks. BM25 scoring, segment-based architecture, cross-platform.

**Implications:** Tantivy is proven for local FTS. The question for a Node.js app is: can it be accessed via N-API bindings? `tantivy-node` exists but maturity is unclear.

### Finding: No production local-first app ships hybrid search (FTS + vector) as of early 2026
**Confidence:** CONFIRMED
**Evidence:** Survey of all 8 apps in D3 + 7 AI stacks in D1

AppFlowy has sqlite-vec as an emerging feature. AFFiNE has server-side semantic search. Logseq has opt-in WebGPU local model. None ship production hybrid search today.

**Implications:** Hybrid search in a local-first app is genuinely novel. The gap is real — there is underserved need.

### Finding: The JS/TS-native search landscape is thin — MiniSearch, Orama, FlexSearch, Lunr
**Confidence:** CONFIRMED
**Evidence:** Omnisearch (MiniSearch), Copilot (Orama), plus npm ecosystem

Pure JS search libraries: MiniSearch (BM25, in-memory), Orama (BM25 + vector, in-memory + disk), FlexSearch (custom scoring, in-memory), Lunr (TF-IDF, frozen index). Only Orama supports both BM25 and vector search. None match Tantivy/Lucene performance.

**Implications:** For JS/TS apps, Orama is the most feature-complete option for hybrid search. The alternative is native addons (better-sqlite3 + FTS5 + sqlite-vec).

### Finding: The Electron environment constrains search architecture choices significantly
**Confidence:** CONFIRMED
**Evidence:** See D2 (Obsidian plugins), D5 (architecture patterns)

Constraints: (1) WASM in Web Workers unreliable (ONNX Runtime breaks), (2) V8 Memory Cage breaks native addons wrapping external memory, (3) native modules need electron-rebuild per version, (4) codesigning required on macOS. These push toward pure-JS solutions or carefully managed native addons.

### Finding: Custom search implementations outnumber off-the-shelf library usage
**Confidence:** INFERRED
**Evidence:** AnyType (custom Tantivy integration), Logseq (custom FTS5 + Fuse.js combo), AFFiNE (custom Manticore integration), Obsidian (proprietary)

Most apps build custom search pipelines rather than using a single off-the-shelf solution. The typical pattern is: choose a search engine (Tantivy, SQLite FTS5, MiniSearch) and build custom integration, scoring, and result handling around it.

**Implications:** There is no "drop-in" solution. Any search stack will require meaningful integration work.

### Finding: Three architectural tiers emerge by app type
**Confidence:** INFERRED
**Evidence:** Synthesis across D1-D5

| Tier | Pattern | Examples |
|------|---------|----------|
| Server-first | PostgreSQL FTS / Elasticsearch / Manticore | Outline, Docmost, AFFiNE |
| Compiled-native | Tantivy in-process | AnyType, AppFlowy |
| JS/Electron | In-memory JS library or SQLite WASM | Logseq, Omnisearch, Copilot |

The Node.js/TypeScript app in question falls in tier 3, with the option of tier 2 via native addons.

### Finding: LanceDB's vectordb npm package is the only production-proven embedded vector store for Node.js
**Confidence:** CONFIRMED
**Evidence:** AnythingLLM source code, [docs.anythingllm.com](https://docs.anythingllm.com)

AnythingLLM runs LanceDB embedded in its Node.js process. File-based columnar storage. LanceDB itself supports BM25 + hybrid search, though AnythingLLM only uses vector similarity.

**Implications:** LanceDB via npm is a viable embedded vector store for Node.js, but it is vector-focused. For a hybrid BM25 + vector stack, it would need to be paired with a separate BM25 engine.

---

## The Gap Analysis

The underserved need is clear: **an embeddable, Node.js-native hybrid search engine that combines BM25 full-text search and vector similarity in a single library.**

Current options:
1. **Orama** — JS-native, has both BM25 and vector, but performance at scale is unproven
2. **SQLite FTS5 + sqlite-vec** — proven components, but requires native addon (better-sqlite3) and glue code for RRF
3. **Tantivy via N-API** — best performance, but Node.js bindings maturity is unclear
4. **LanceDB** — embedded in Node.js, has hybrid search, but primarily vector-focused

No single solution satisfies all requirements (embeddable, Node.js-native, hybrid, fast, low-memory) without compromise.

---

## Gaps / follow-ups
- Orama v3 performance benchmarks at 1000+ document scale
- tantivy-node npm package maturity and API surface
- LanceDB's BM25 capabilities specifically in the Node.js binding
