# Evidence: Qdrant & ChromaDB

**Dimension:** D8 — Qdrant and ChromaDB
**Date:** 2026-04-03
**Sources:** GitHub repos, official docs, npm packages, blog posts

---

## Key files / pages referenced

- [Qdrant Edge announcement](https://www.businesswire.com/news/home/20250729908555/en/Qdrant-Announces-Qdrant-Edge-First-Vector-Search-Engine-for-Embedded-AI) — July 2025
- [Qdrant hybrid search article](https://qdrant.tech/articles/hybrid-search/)
- [Qdrant BM42 article](https://qdrant.tech/articles/bm42/) — hybrid BM25+attention
- [@qdrant/qdrant-js npm](https://www.npmjs.com/package/@qdrant/qdrant-js) — REST/gRPC client only
- [Qdrant benchmarks 2024](https://qdrant.tech/blog/qdrant-benchmarks-2024/)
- [Chroma clients cookbook](https://cookbook.chromadb.dev/core/clients/)
- [Chroma BM25 docs](https://docs.trychroma.com/integrations/embedding-models/chroma-bm25)
- [chromadb npm](https://www.npmjs.com/package/chromadb) — v3.4.0, HTTP client only

---

## Findings

### Finding: Qdrant has NO embedded mode for Node.js — server process required
**Confidence:** CONFIRMED
**Evidence:** [@qdrant/qdrant-js npm](https://www.npmjs.com/package/@qdrant/qdrant-js) — REST/gRPC client, all examples show `new QdrantClient({ host: "localhost", port: 6333 })`

Python has embedded mode (`QdrantClient(":memory:")`). Node.js does not. Qdrant Edge (in-process for embedded devices) announced July 2025 but in private beta — not generally available, no Node.js bindings documented.

**Implications:** Requires running Qdrant as a server process (Docker or native binary) for Node.js. Violates "no Docker" and "in-process" requirements.

### Finding: Qdrant has native BM25 and hybrid search via sparse vectors + RRF
**Confidence:** CONFIRMED
**Evidence:** [Qdrant hybrid search](https://qdrant.tech/articles/hybrid-search/), [sparse vectors](https://qdrant.tech/articles/sparse-vectors/)

Since v1.15.2: native BM25 sparse vector conversion server-side. Also developed BM42 (BM25 IDF + neural attention). Hybrid search via Query API (v1.10+) combining dense + sparse with RRF fusion. Sophisticated implementation.

**Implications:** If it were embeddable in Node.js, Qdrant would be a strong hybrid search engine. But the server requirement disqualifies it for the target use case.

### Finding: ChromaDB has NO embedded mode for Node.js — server required
**Confidence:** CONFIRMED
**Evidence:** [Chroma clients cookbook](https://cookbook.chromadb.dev/core/clients/), [chromadb npm](https://www.npmjs.com/package/chromadb)

Python has `PersistentClient(path="./chroma_db")` for embedded mode. Node.js has only `ChromaClient` (HTTP client to `http://localhost:8000`) and `CloudClient`. No `PersistentClient` equivalent in TypeScript.

Running Chroma for Node.js requires: `chroma run --path ./chroma_db` (Python CLI) or Docker.

**Implications:** Same architectural limitation as Qdrant for Node.js. Cannot run in-process.

### Finding: ChromaDB recently added BM25 sparse vector support for hybrid search
**Confidence:** CONFIRMED
**Evidence:** [Chroma BM25 docs](https://docs.trychroma.com/integrations/embedding-models/chroma-bm25), [sparse vector announcement](https://www.trychroma.com/project/sparse-vector-search)

Built-in `BM25EmbeddingFunction` with configurable k, b, and average_document_length. Enables hybrid search by combining dense embeddings with BM25 sparse vectors. Relatively recent addition (2024-2025).

**Implications:** ChromaDB's hybrid search has matured. But the Node.js embedded mode limitation remains the blocker.

### Finding: Both Qdrant and ChromaDB have strong CPU performance at 1K docs
**Confidence:** CONFIRMED
**Evidence:** [Qdrant benchmarks](https://qdrant.tech/blog/qdrant-benchmarks-2024/) — memory formula: num_vectors * dimension * 4 * 1.5

At 1,000 vectors of 1,536 dims: ~9MB for Qdrant. Both would be trivially fast at this scale. But performance is not the constraint — embeddability is.

---

## Negative searches

- Searched for Qdrant Node.js embedded mode → NOT FOUND (Python-only)
- Searched for ChromaDB Node.js PersistentClient → NOT FOUND (Python-only)
- Searched for Qdrant Edge Node.js bindings → NOT FOUND (private beta, no public bindings)

---

## Gaps / follow-ups

- Qdrant Edge may eventually provide Node.js embedded mode — worth monitoring
- ChromaDB's TypeScript client may eventually support embedded mode — no timeline found
