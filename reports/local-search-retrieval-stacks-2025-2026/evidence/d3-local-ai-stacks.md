# Evidence: Common Local AI Stacks

**Dimension:** D1 — Common Local AI Stacks
**Date:** 2026-04-03
**Sources:** GitHub repos, official docs, npm packages, developer cookbooks

---

## Key repos/pages referenced
- [chroma-core/chroma](https://github.com/chroma-core/chroma) — ChromaDB core
- [chromadb npm](https://www.npmjs.com/package/chromadb) — JS client (network-only)
- [cookbook.chromadb.dev/core/resources](https://cookbook.chromadb.dev/core/resources/) — resource requirements
- [cookbook.chromadb.dev/core/clients](https://cookbook.chromadb.dev/core/clients/) — client documentation
- [neuml/txtai](https://github.com/neuml/txtai) — all-in-one embeddings database
- [run-llama/llama_index](https://github.com/run-llama/llama_index) — LlamaIndex framework
- [deepset-ai/haystack](https://github.com/deepset-ai/haystack) — Haystack framework
- [zylon-ai/private-gpt](https://github.com/zylon-ai/private-gpt) — PrivateGPT
- [PromtEngineer/localGPT](https://github.com/PromtEngineer/localGPT) — LocalGPT
- [Mintplex-Labs/anything-llm](https://github.com/Mintplex-Labs/anything-llm) — AnythingLLM

---

## Findings

### Finding: ChromaDB JS client is network-only — cannot embed in Node.js
**Confidence:** CONFIRMED
**Evidence:** [cookbook.chromadb.dev/core/clients](https://cookbook.chromadb.dev/core/clients/)

The `chromadb` npm package is a thin HTTP client. There is no equivalent to Python's `PersistentClient` for Node.js. Using ChromaDB from JS always requires a running Chroma server (Python process or container).

**Implications:** ChromaDB is not viable as an embeddable search engine for a Node.js/TypeScript app without a sidecar Python process.

### Finding: ChromaDB now supports hybrid search via sparse vectors + RRF
**Confidence:** CONFIRMED
**Evidence:** [trychroma.com/project/sparse-vector-search](https://www.trychroma.com/project/sparse-vector-search)

Post-0.5, ChromaDB added `Bm25EmbeddingFunction` (local bag-of-words via murmur3 hashing) and a `Search()` API that combines dense + sparse via Reciprocal Rank Fusion. No external API required for BM25.

**Implications:** ChromaDB has hybrid search capability, but only usable from Python in-process.

### Finding: ChromaDB resource footprint — ~104MB baseline, ~1.4GiB for 1M vectors at 384 dims
**Confidence:** CONFIRMED
**Evidence:** [cookbook.chromadb.dev/core/resources](https://cookbook.chromadb.dev/core/resources/)

RAM formula: `(vectors x dimensions x 4 bytes) / 1024^3` GiB for vector payload, plus HNSW graph overhead. Baseline process is ~104MB before data.

### Finding: txtai is Python-only with hybrid search (Faiss + custom BM25)
**Confidence:** CONFIRMED
**Evidence:** [github.com/neuml/txtai](https://github.com/neuml/txtai), [neuml.github.io/txtai](https://neuml.github.io/txtai)

txtai unifies dense ANN (Faiss default), sparse BM25 (custom implementation, 6x better memory than reference), content store (SQLite default), and graph layer (NetworkX). JS/Go/Rust/Java bindings are HTTP clients only — cannot embed the core.

**Implications:** Strong hybrid search, but Python-only. Would require a sidecar process for Node.js integration.

### Finding: LlamaIndex.TS provides partial in-process Node.js support
**Confidence:** CONFIRMED
**Evidence:** [llamaindex npm](https://www.npmjs.com/package/llamaindex), [docs.llamaindex.ai](https://docs.llamaindex.ai)

LlamaIndex.TS (`npm install llamaindex`) runs `SimpleVectorStore` in-process in Node.js. BM25 support is less mature than Python. Hybrid via `QueryFusionRetriever` exists in Python but is limited in TS. Ollama required as sidecar for local embeddings.

### Finding: Haystack has first-class BM25 in InMemoryDocumentStore
**Confidence:** CONFIRMED
**Evidence:** [docs.haystack.deepset.ai/docs/inmemorybm25retriever](https://docs.haystack.deepset.ai/docs/inmemorybm25retriever)

`InMemoryBM25Retriever` supports BM25Okapi, BM25L, BM25Plus with tunable parameters. Hybrid pipeline: BM25 + embedding retriever → DocumentJoiner → cross-encoder reranker. Python-only.

### Finding: PrivateGPT is vector-only, built on LlamaIndex, using Qdrant as default store
**Confidence:** CONFIRMED
**Evidence:** [docs.privategpt.dev/manual/storage/vector-stores](https://docs.privategpt.dev/manual/storage/vector-stores)

No native BM25/hybrid. Retrieval uses LlamaIndex's VectorStoreIndex with cosine similarity. Supports Qdrant (default), Milvus, Chroma, PGVector, ClickHouse. Python service only.

### Finding: AnythingLLM is the only major local AI app with native Node.js search
**Confidence:** CONFIRMED
**Evidence:** [github.com/Mintplex-Labs/anything-llm](https://github.com/Mintplex-Labs/anything-llm), [docs.anythingllm.com](https://docs.anythingllm.com)

Full-stack Node.js/JavaScript (Express + React). Default vector store is LanceDB, running embedded in-process via the `vectordb` npm package. Provider pattern supports 8+ vector stores. LanceDB itself supports BM25 + hybrid, but AnythingLLM currently exposes only vector similarity through its unified interface.

**Implications:** LanceDB's npm package (`vectordb`) is the most notable finding — it's a production-proven embedded vector store for Node.js, used by a real application.

### Finding: LocalGPT updated version uses LanceDB with hybrid search
**Confidence:** CONFIRMED
**Evidence:** [github.com/PromtEngineer/localGPT](https://github.com/PromtEngineer/localGPT)

The 2024+ version moved from ChromaDB to LanceDB (file-based, no server) and added semantic + BM25 + Late Chunking hybrid search. Python backend; JS is UI only.

---

## Gaps / follow-ups
- LanceDB's hybrid search capabilities in the Node.js `vectordb` package specifically (vs Python LanceDB) need verification
- Exact memory footprint of LanceDB in AnythingLLM under typical usage
